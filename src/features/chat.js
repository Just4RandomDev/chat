// CHAT
// Message rendering, sending, replies, reactions, emoji pickers.

import { ref, onValue, off, push, get, remove, update } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import { $, on, esc, applyIconMask } from "../core/dom.js";
import { BOT_UID, GROUP_MS, FILE_MAX_BYTES, URL_RE } from "../core/constants.js";
import { fmtTime, classifyUrl, extractMentions, hasEveryone } from "../core/helpers.js";
import { encryptText, decryptText } from "../core/crypto.js";
import { t } from "../core/i18n.js";
import { state } from "../core/state.js";
import { fetchUser, defaultPfp } from "../services/user-cache.js";
import { sendBotMessage } from "../services/bot.js";
import { spamCheck as spamCheckService } from "../services/spam.js";
import {
  getCategories,
  getRecents, pushRecent,
  getFavorites, isFavorite, toggleFavorite,
  searchEmoji,
  supportsSkinTone, applySkinTone, getSkinToneLabels,
  getGlobalCustom, getRoomCustom,
  addCustomEmoji, deleteCustomEmoji,
  onCustomEmojisChanged,
  tokenizeCustomEmojis, hasCustomEmojiTokens
} from "../services/emoji.js";
import { isBlocked } from "./users.js";
import { pushNotification } from "./notifications.js";
import { hideAutocomplete } from "./mentions.js";

let onOpenUserProfile = null;

// Track which picker is currently open, and its target
let activePickerMode = null;      // "reaction" | "message" | null
let activeReactionTarget = null;  // { msgId, isDm } when mode === "reaction"
let activeMessageTargetInput = null; // input element when mode === "message"
let activeTab = "emoji";          // current tab per picker

// Skin menu cleanup
let skinMenuEl = null;
let skinMenuTimeout = null;

export function initChat(categories, hooks) {
  onOpenUserProfile = hooks?.onOpenUserProfile || null;

  on($("sendBtn"), "click", sendMessage);
  on($("messageInput"), "keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  on($("replyBarCancel"), "click", () => setReply(null));
  on($("fileInput"), "change", (e) => {
    const f = e.target.files[0];
    if (f) handleFileObject(f, false);
    e.target.value = "";
  });
  on($("filePreviewRemove"), "click", () => clearPendingFile());
  on($("messageInput"), "paste", (e) => pasteHandler(e, false));

  on($("moreMenuModal"), "click", (e) => {
    if (e.target === $("moreMenuModal")) $("moreMenuModal").classList.add("hidden");
  });

  wireReactionPicker();
  wireMessageEmojiPopover();

  // Keep custom emoji grids fresh when Firebase pushes new entries.
  onCustomEmojisChanged(() => {
    refreshCustomGrids();
  });
}


// REPLY / FILE HELPERS


export function setReply(target) {
  state.reply = target;
  const bar = $("replyBar");
  if (!bar) return;
  if (target) {
    $("replyBarName").textContent = target.username;
    $("replyBarPreview").textContent = target.previewText || "";
    bar.classList.remove("hidden");
  } else {
    bar.classList.add("hidden");
  }
}

export function clearPendingFile() {
  if (state.pendingFile?.objectUrl) URL.revokeObjectURL(state.pendingFile.objectUrl);
  state.pendingFile = null;
  if ($("fileInput")) $("fileInput").value = "";
  $("filePreview")?.classList.add("hidden");
  if ($("filePreviewImg")) $("filePreviewImg").src = "";
  if ($("filePreviewVideo")) $("filePreviewVideo").src = "";
}

function pasteHandler(e, isDm) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      handleFileObject(file, isDm);
      return;
    }
  }
}

export function handleFileObject(file, isDm) {
  if (file.size > FILE_MAX_BYTES) {
    window.__illoToast?.("File too big (1.5MB max)");
    return;
  }

  let type = null;
  if (file.type === "image/gif") type = "gif";
  else if (file.type.startsWith("image/")) type = "image";
  else if (file.type.startsWith("video/")) type = "video";
  else {
    window.__illoToast?.("Images, GIFs, videos only");
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const r = new FileReader();

  r.onload = (ev) => {
    const payload = { type, dataUrl: ev.target.result, objectUrl, name: file.name };
    if (isDm) state.dmPendingFile = payload;
    else state.pendingFile = payload;
    renderFilePreview(payload, isDm);
  };

  r.readAsDataURL(file);
}

function renderFilePreview(payload, isDm) {
  const container = isDm ? {
    preview: $("dmFilePreview"), img: $("dmFilePreviewImg"),
    video: $("dmFilePreviewVideo"), name: $("dmFilePreviewName")
  } : {
    preview: $("filePreview"), img: $("filePreviewImg"),
    video: $("filePreviewVideo"), name: $("filePreviewName")
  };

  container.name.textContent = `${payload.type.toUpperCase()} · ${payload.name}`;

  if (payload.type === "video") {
    container.img.classList.add("hidden");
    container.video.classList.remove("hidden");
    container.video.src = payload.objectUrl;
  } else {
    container.video.classList.add("hidden");
    container.img.classList.remove("hidden");
    container.img.src = payload.objectUrl;
  }

  container.preview.classList.remove("hidden");
  (isDm ? $("dmInput") : $("messageInput")).focus();
}


// SEND


export async function sendMessage() {
  if (!state.roomCode || !state.roomRef) {
    return window.__illoToast?.("Join a room first");
  }

  const rawText = $("messageInput").value.trim();
  const hasMedia = !!state.pendingFile;
  if (!rawText && !hasMedia) return window.__illoToast?.("Nothing to send");

  const spam = spamCheckService();
  if (!spam.ok) {
    if (spam.message) window.__illoToast?.(spam.message);
    return;
  }

  const replyPayload = state.reply ? {
    uid: state.reply.uid,
    username: state.reply.username,
    previewText: state.reply.previewText,
    msgId: state.reply.msgId
  } : null;

  const pushed = await push(state.roomRef, {
    uid: state.me.uid,
    text: rawText ? encryptText(rawText, state.roomCode) : "",
    mediaType: hasMedia ? state.pendingFile.type : null,
    mediaData: hasMedia ? encryptText(state.pendingFile.dataUrl, state.roomCode) : null,
    replyTo: replyPayload,
    timestamp: Date.now()
  });

  try { update(ref(db, `rooms/${state.roomCode}`), { lastActivity: Date.now() }); } catch {}

  if (rawText) {
    const msgId = pushed.key;
    handleMentionsAndReplies(rawText, msgId, replyPayload);
    handleBotCommands(rawText);
  }

  $("messageInput").value = "";
  clearPendingFile();
  setReply(null);
  hideAutocomplete();
  closeEmojiPopover();
  $("messageInput").focus();
  window.__illoUpdateScrollButtons?.();
}

async function handleMentionsAndReplies(rawText, msgId, replyPayload) {
  if (hasEveryone(rawText)) {
    const presSnap = await get(ref(db, `chats/${state.roomCode}/presence`));
    const pData = presSnap.val() || {};
    for (const uid of Object.keys(pData)) {
      if (uid === state.me.uid) continue;
      pushNotification(uid, {
        type: "everyone",
        title: `@everyone in #${state.roomMeta?.name || state.roomCode}`,
        body: `${state.me.username}: ${rawText.slice(0, 80)}`,
        roomCode: state.roomCode,
        fromUid: state.me.uid,
        msgId
      });
    }
  } else {
    const mentions = extractMentions(rawText);
    if (mentions.length) {
      if (!state.usernameIndex) {
        const us = await get(ref(db, "users"));
        const byName = {};
        for (const [uid, u] of Object.entries(us.val() || {})) {
          if (u.username) byName[u.username.toLowerCase()] = uid;
        }
        state.usernameIndex = byName;
      }
      for (const mention of mentions) {
        const uid = state.usernameIndex[mention];
        if (uid && uid !== state.me.uid) {
          pushNotification(uid, {
            type: "mention",
            title: `${t("notifMention")} #${state.roomMeta?.name || state.roomCode}`,
            body: `${state.me.username}: ${rawText.slice(0, 80)}`,
            roomCode: state.roomCode,
            fromUid: state.me.uid,
            msgId
          });
        }
      }
    }
  }

  if (replyPayload && replyPayload.uid !== state.me.uid) {
    pushNotification(replyPayload.uid, {
      type: "reply",
      title: `${state.me.username} ${t("notifReply")} #${state.roomMeta?.name || state.roomCode}`,
      body: rawText.slice(0, 80),
      roomCode: state.roomCode,
      fromUid: state.me.uid,
      msgId
    });
  }
}

function handleBotCommands(rawText) {
  if (/^!help\b/i.test(rawText)) {
    sendBotMessage(state.roomCode, "📋 Commands: !help, !roll (1-6), !8ball <question>, !me <action>");
  } else if (/^!roll\b/i.test(rawText)) {
    const n = Math.floor(Math.random() * 6) + 1;
    sendBotMessage(state.roomCode, "🎲 " + state.me.username + " rolled a " + n);
  } else if (/^!8ball\b/i.test(rawText)) {
    const answers = ["Yes", "No", "Maybe", "Ask again later", "Definitely", "Absolutely not", "Probably", "Unlikely"];
    sendBotMessage(state.roomCode, "🎱 " + answers[Math.floor(Math.random() * answers.length)]);
  } else if (/^!me\b/i.test(rawText)) {
    const action = rawText.replace(/^!me\s*/i, "");
    if (action) sendBotMessage(state.roomCode, "* " + state.me.username + " " + action);
  }
}


// RENDER MESSAGE


export async function renderMessage(container, msgId, msg, isOwn, isDm) {
  if (!isDm && msg.dmKey) return;
  if (isDm && !msg.dmKey) return;

  const isBot = msg.uid === BOT_UID || msg.bot === true;
  const sender = await fetchUser(msg.uid);
  const now = msg.timestamp || Date.now();

  const dmState = window.__illoGetDmState?.();
  const groupEl = isDm ? (dmState?.lastGroupEl ?? null) : state.lastGroupEl;
  const groupUid = isDm ? (dmState?.lastGroupUid ?? null) : state.lastGroupUid;
  const groupTime = isDm ? (dmState?.lastGroupTime ?? 0) : state.lastGroupTime;

  const sameUser = groupUid === msg.uid;
  const withinWindow = (now - groupTime) < GROUP_MS;

  let plainText = "";
  if (msg.text) {
    const key = msg.dmKey || state.roomCode;
    plainText = decryptText(msg.text, key);
    if (plainText === null) plainText = "[could not decrypt]";
  }

  const mentionsEveryone = hasEveryone(plainText);
  const mentionedMe = !isDm && !isBot && plainText && state.me &&
    extractMentions(plainText).includes(state.me.username.toLowerCase());

  if (!groupEl || !sameUser || !withinWindow) {
    const group = document.createElement("div");
    group.className = "msg-group" + (isOwn ? " own" : "") + (isBot ? " bot" : "");

    const head = document.createElement("div");
    head.className = "group-head";

    const pfp = document.createElement("img");
    pfp.className = "mini-pfp";
    pfp.src = sender.pfp || defaultPfp(sender.username);
    pfp.alt = "";
    pfp.style.cursor = "pointer";
    pfp.addEventListener("click", () => { if (!isBot) onOpenUserProfile?.(msg.uid); });
    head.appendChild(pfp);

    const nameSpan = document.createElement("span");
    nameSpan.textContent = sender.username;
    if (sender.nameColor) nameSpan.style.color = sender.nameColor;
    nameSpan.style.cursor = "pointer";
    nameSpan.addEventListener("click", () => { if (!isBot) onOpenUserProfile?.(msg.uid); });
    head.appendChild(nameSpan);

    if (isBot) {
      const botTag = document.createElement("span");
      botTag.className = "bot-tag";
      botTag.textContent = "BOT";
      head.appendChild(botTag);
    }

    const timeSpan = document.createElement("span");
    timeSpan.className = "group-time";
    timeSpan.textContent = fmtTime(msg.timestamp);
    head.appendChild(timeSpan);

    const body = document.createElement("div");
    body.className = "group-body";
    group.appendChild(head);
    group.appendChild(body);
    container.appendChild(group);

    if (isDm) {
      window.__illoSetDmLastGroup?.(group, msg.uid, now);
    } else {
      state.lastGroupEl = group;
      state.lastGroupUid = msg.uid;
      state.lastGroupTime = now;
    }
  } else {
    if (isDm) {
      window.__illoSetDmLastGroup?.(groupEl, msg.uid, now);
    } else {
      state.lastGroupTime = now;
    }
  }

  const curGroup = isDm ? (window.__illoGetDmState?.().lastGroupEl ?? null) : state.lastGroupEl;
  if (!curGroup) return;
  const body = curGroup.querySelector(".group-body");
  if (!body) return;

  const line = document.createElement("div");
  line.className = "msg-line"
    + (mentionedMe || mentionsEveryone ? " mention" : "")
    + (isBot ? " advisory-line" : "");
  line.dataset.msgId = msgId;

  if (msg.replyTo?.uid) {
    const reply = document.createElement("div");
    reply.className = "reply-preview";
    reply.innerHTML = `<div class="rp-name">${esc(msg.replyTo.username || "user")}</div>
      <div class="rp-text">${esc(msg.replyTo.previewText || "[message]")}</div>`;
    line.appendChild(reply);
  }

  const contentWrap = document.createElement("div");
  contentWrap.style.display = "inline";
  if (plainText) {
    if (hasCustomEmojiTokens(plainText)) {
      renderTokenizedText(contentWrap, plainText);
    } else {
      buildLineContent(contentWrap, plainText);
    }
  }
  line.appendChild(contentWrap);

  if (msg.mediaType && msg.mediaData) {
    const src = decryptText(msg.mediaData, msg.dmKey || state.roomCode);
    if (src?.startsWith("data:")) {
      if (msg.mediaType === "image" || msg.mediaType === "gif") {
        const img = document.createElement("img");
        img.src = src; img.loading = "lazy";
        line.appendChild(img);
        if (msg.mediaType === "gif") {
          const tag = document.createElement("span");
          tag.className = "gif-tag";
          tag.textContent = "GIF";
          line.appendChild(tag);
        }
      } else if (msg.mediaType === "video") {
        const v = document.createElement("video");
        v.src = src; v.controls = true; v.preload = "metadata";
        line.appendChild(v);
      }
    }
  }

  const reactionsEl = document.createElement("div");
  reactionsEl.className = "reactions";
  line.appendChild(reactionsEl);

  const reactionsPath = isDm
    ? `dms/${dmPairKeySafe(state.me.uid, window.__illoGetActiveDmUid?.())}/${msgId}/reactions`
    : `chats/${state.roomCode}/messages/${msgId}/reactions`;

  const reactionsRef = ref(db, reactionsPath);
  const reactionsHandler = onValue(reactionsRef, (snap) => {
    renderPills(reactionsEl, snap.val(), msgId, isDm);
  });

  if (!state.reactionListeners) state.reactionListeners = [];
  state.reactionListeners.push(() => {
    try { off(reactionsRef, "value", reactionsHandler); } catch {}
  });

  if (!isBot) {
    const actions = document.createElement("div");
    actions.className = "msg-actions";

    const reactBtn = document.createElement("button");
    reactBtn.title = "React";
    const reactIcon = document.createElement("span");
    reactIcon.className = "icon-img";
    applyIconMask(reactIcon, "react");
    reactBtn.appendChild(reactIcon);
    reactBtn.addEventListener("click", () => openReactionPicker(msgId, isDm));
    actions.appendChild(reactBtn);

    const replyBtn = document.createElement("button");
    replyBtn.title = "Reply";
    const replyIcon = document.createElement("span");
    replyIcon.className = "icon-img";
    applyIconMask(replyIcon, "reply");
    replyBtn.appendChild(replyIcon);
    replyBtn.addEventListener("click", () => {
      const target = {
        uid: msg.uid,
        username: sender.username,
        previewText: plainText ? plainText.slice(0, 80) : "[media]",
        msgId
      };
      if (isDm) window.__illoSetDmReply?.(target);
      else setReply(target);
      (isDm ? $("dmInput") : $("messageInput")).focus();
    });
    actions.appendChild(replyBtn);

    const moreBtn = document.createElement("button");
    moreBtn.title = "More";
    const moreIcon = document.createElement("span");
    moreIcon.className = "icon-img";
    applyIconMask(moreIcon, "more");
    moreBtn.appendChild(moreIcon);
    moreBtn.addEventListener("click", () => openMoreMenu(msgId, msg, isOwn, isDm, sender, plainText));
    actions.appendChild(moreBtn);

    line.appendChild(actions);
  }

  body.appendChild(line);
}

function dmPairKeySafe(a, b) {
  if (!a || !b) return "";
  const [x, y] = [a, b].sort();
  return `${x}__${y}`;
}

function renderTokenizedText(parent, plainText) {
  const parts = tokenizeCustomEmojis(plainText);
  for (const part of parts) {
    if (part.type === "text") {
      if (part.value) buildLineContent(parent, part.value);
    } else if (part.type === "custom") {
      const img = document.createElement("img");
      img.className = "custom-emoji-inline";
      img.src = part.dataUrl;
      img.alt = ":" + part.name + ":";
      img.title = ":" + part.name + ":";
      parent.appendChild(img);
    }
  }
}

function renderPills(container, data, msgId, isDm) {
  container.innerHTML = "";
  if (!data) return;

  for (const [emoji, users] of Object.entries(data)) {
    if (!users) continue;
    const uids = Object.keys(users).filter(u => users[u] === true);
    if (!uids.length) continue;

    const pill = document.createElement("button");
    pill.className = "reaction-pill" + (state.me && users[state.me.uid] ? " mine" : "");

    const customMatch = /^:([a-z0-9_]{2,24}):$/i.exec(emoji);
    if (customMatch) {
      const all = [...getGlobalCustom(), ...getRoomCustom()];
      const found = all.find(c => c.name === customMatch[1].toLowerCase());
      if (found) {
        const img = document.createElement("img");
        img.src = found.dataUrl;
        img.alt = emoji;
        img.style.width = "18px";
        img.style.height = "18px";
        img.style.objectFit = "contain";
        pill.appendChild(img);
      } else {
        const span = document.createElement("span");
        span.textContent = emoji;
        pill.appendChild(span);
      }
    } else {
      const span = document.createElement("span");
      span.textContent = emoji;
      pill.appendChild(span);
    }

    const countSpan = document.createElement("span");
    countSpan.className = "count";
    countSpan.textContent = uids.length;
    pill.appendChild(countSpan);

    pill.title = uids.map(u => u.slice(0, 6)).join(", ");
    pill.addEventListener("click", () => toggleReaction(msgId, emoji, isDm));
    container.appendChild(pill);
  }
}

function buildLineContent(lineEl, plainText) {
  const urls = [...plainText.matchAll(URL_RE)].map(m => m[0]);
  const mediaUrls = urls.filter(u => ["image", "video"].includes(classifyUrl(u)));
  const nonMediaUrls = urls.filter(u => classifyUrl(u) === "link");
  const rest = plainText.replace(URL_RE, "").trim();

  if (mediaUrls.length) {
    if (rest) renderTextWithMentions(lineEl, rest + " ");
    for (const u of nonMediaUrls) {
      const a = document.createElement("a");
      a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = u;
      lineEl.appendChild(a);
      lineEl.appendChild(document.createTextNode(" "));
    }
    for (const u of mediaUrls) {
      const kind = classifyUrl(u);
      if (kind === "image") {
        const img = document.createElement("img");
        img.src = u; img.loading = "lazy"; img.alt = "";
        img.onerror = () => img.remove();
        lineEl.appendChild(img);
      } else {
        const v = document.createElement("video");
        v.src = u; v.controls = true; v.preload = "metadata";
        lineEl.appendChild(v);
      }
    }
    return;
  }

  let lastIndex = 0, m;
  const re = new RegExp(URL_RE.source, "gi");
  while ((m = re.exec(plainText)) !== null) {
    if (m.index > lastIndex) renderTextWithMentions(lineEl, plainText.slice(lastIndex, m.index));
    const a = document.createElement("a");
    a.href = m[0]; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.textContent = m[0];
    lineEl.appendChild(a);
    lastIndex = re.lastIndex;
  }
  if (lastIndex < plainText.length) renderTextWithMentions(lineEl, plainText.slice(lastIndex));
}

function renderTextWithMentions(parent, text) {
  const parts = text.split(/(@everyone\b|@[A-Za-z0-9_]+)/gi);
  for (const part of parts) {
    if (!part) continue;
    if (/^@everyone$/i.test(part)) {
      const span = document.createElement("span");
      span.className = "mention-everyone";
      span.textContent = part;
      parent.appendChild(span);
    } else if (/^@[A-Za-z0-9_]+$/.test(part)) {
      const span = document.createElement("span");
      span.style.color = "#ffb347";
      span.style.fontWeight = "700";
      span.textContent = part;
      parent.appendChild(span);
    } else {
      parent.appendChild(document.createTextNode(part));
    }
  }
}


// REACTIONS


export async function toggleReaction(msgId, emoji, isDm) {
  if (!state.me) return;
  const path = isDm
    ? `dms/${dmPairKeySafe(state.me.uid, window.__illoGetActiveDmUid?.())}/${msgId}/reactions/${emoji}/${state.me.uid}`
    : `chats/${state.roomCode}/messages/${msgId}/reactions/${emoji}/${state.me.uid}`;

  const r = ref(db, path);
  const snap = await get(r);
  if (snap.exists() && snap.val() === true) {
    try { await remove(r); } catch {}
  } else {
    try { await set(r, true); } catch {}
  }
}


// REACTION PICKER MODAL


function wireReactionPicker() {
  document.querySelectorAll("[data-reaction-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-reaction-tab]").forEach(x => x.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.reactionTab;
      $("reactionPaneEmoji")?.classList.toggle("hidden", target !== "emoji");
      $("reactionPaneCustom")?.classList.toggle("hidden", target !== "custom");
      $("reactionPaneSearch")?.classList.toggle("hidden", target !== "search");
      if (target === "custom") renderCustomGrid("reactionCustomGlobal", getGlobalCustom(), "global", "reactionCustomRoom", getRoomCustom(), "room");
      if (target === "search") setTimeout(() => $("reactionSearch")?.focus(), 40);
    });
  });

  on($("reactionSearch"), "input", () => renderSearchResults($("reactionSearch").value, "reactionSearchResults"));
  on($("cancelReactionPicker"), "click", closeReactionPicker);
  on($("addCustomEmojiBtn"), "click", openAddEmojiModal);
  on($("cancelAddEmojiBtn"), "click", () => $("addEmojiModal").classList.add("hidden"));
  on($("newEmojiFile"), "change", previewNewEmoji);
  on($("saveCustomEmojiBtn"), "click", handleSaveCustomEmoji);
}

export function openReactionPicker(msgId, isDm) {
  activePickerMode = "reaction";
  activeReactionTarget = { msgId, isDm };
  activeTab = "emoji";

  document.querySelectorAll("[data-reaction-tab]").forEach(x => {
    x.classList.toggle("active", x.dataset.reactionTab === "emoji");
  });
  $("reactionPaneEmoji")?.classList.remove("hidden");
  $("reactionPaneCustom")?.classList.add("hidden");
  $("reactionPaneSearch")?.classList.add("hidden");
  if ($("reactionSearch")) $("reactionSearch").value = "";

  refreshReactionPickerContent();
  $("reactionPickerModal").classList.remove("hidden");
}

function closeReactionPicker() {
  $("reactionPickerModal").classList.add("hidden");
  activePickerMode = null;
  activeReactionTarget = null;
  hideSkinMenu();
}

function refreshReactionPickerContent() {
  renderRecentsRow("reactionRecents", "reactionRecentsTitle", "reaction");
  renderFavoritesRow("reactionFavs", "reactionFavsTitle", "reaction");
  renderCategoryTiles("reactionCategories", "reaction");
}


// MESSAGE EMOJI POPOVER (input button)


function wireMessageEmojiPopover() {
  on($("messageEmojiBtn"), "click", (e) => {
    e.stopPropagation();
    toggleEmojiPopover($("messageInput"), "emoji");
  });

  on($("dmEmojiBtn"), "click", (e) => {
    e.stopPropagation();
    toggleEmojiPopover($("dmInput"), "dm");
  });

  document.querySelectorAll("[data-popover-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-popover-tab]").forEach(x => x.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.popoverTab;
      $("popoverPaneEmoji")?.classList.toggle("hidden", target !== "emoji");
      $("popoverPaneCustom")?.classList.toggle("hidden", target !== "custom");
      $("popoverPaneSearch")?.classList.toggle("hidden", target !== "search");
      if (target === "custom") {
        renderCustomGrid("popoverCustomGlobal", getGlobalCustom(), "global", "popoverCustomRoom", getRoomCustom(), "room");
      }
      if (target === "search") setTimeout(() => $("popoverSearch")?.focus(), 40);
    });
  });

  on($("popoverSearch"), "input", () => renderSearchResults($("popoverSearch").value, "popoverSearchResults"));

  // Click outside closes the popover
  on(document, "click", (e) => {
    const pop = $("emojiPopover");
    if (!pop || pop.classList.contains("hidden")) return;
    if (pop.contains(e.target)) return;
    if (e.target.closest("#messageEmojiBtn")) return;
    if (e.target.closest("#dmEmojiBtn")) return;
    closeEmojiPopover();
  });

  // Close on Escape
  on(document, "keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("emojiPopover")?.classList.contains("hidden")) closeEmojiPopover();
    if (!$("reactionPickerModal")?.classList.contains("hidden")) closeReactionPicker();
    hideSkinMenu();
  });
}

function toggleEmojiPopover(inputEl, inputKey) {
  if (!$("emojiPopover").classList.contains("hidden") && activeMessageTargetInput === inputEl) {
    closeEmojiPopover();
    return;
  }

  activePickerMode = "message";
  activeMessageTargetInput = inputEl;
  activeTab = "emoji";

  // Reset tabs
  document.querySelectorAll("[data-popover-tab]").forEach(x => {
    x.classList.toggle("active", x.dataset.popoverTab === "emoji");
  });
  $("popoverPaneEmoji")?.classList.remove("hidden");
  $("popoverPaneCustom")?.classList.add("hidden");
  $("popoverPaneSearch")?.classList.add("hidden");
  if ($("popoverSearch")) $("popoverSearch").value = "";

  // Render content
  renderRecentsRow("popoverRecents", "popoverRecentsTitle", "message");
  renderFavoritesRow("popoverFavs", "popoverFavsTitle", "message");
  renderCategoryTiles("popoverCategories", "message");

  // Position above the button
  const btn = inputKey === "dm" ? $("dmEmojiBtn") : $("messageEmojiBtn");
  const pop = $("emojiPopover");
  pop.classList.remove("hidden");

  requestAnimationFrame(() => {
    const rect = btn.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = rect.left;
    let top = rect.top - popRect.height - 8;

    if (left + popRect.width > vw - 10) left = vw - popRect.width - 10;
    if (left < 10) left = 10;

    if (top < 10) top = rect.bottom + 8;

    pop.style.left = left + "px";
    pop.style.top = top + "px";

    // Mark the active button
    $("messageEmojiBtn")?.classList.toggle("active", inputKey !== "dm");
    $("dmEmojiBtn")?.classList.toggle("active", inputKey === "dm");
  });
}

export function closeEmojiPopover() {
  $("emojiPopover")?.classList.add("hidden");
  $("messageEmojiBtn")?.classList.remove("active");
  $("dmEmojiBtn")?.classList.remove("active");
  if (activePickerMode === "message") {
    activePickerMode = null;
    activeMessageTargetInput = null;
  }
  hideSkinMenu();
}

function refreshCustomGrids() {
  // Update both pickers if their Custom tab is currently visible
  if (!$("reactionPickerModal")?.classList.contains("hidden") && !$("reactionPaneCustom")?.classList.contains("hidden")) {
    renderCustomGrid("reactionCustomGlobal", getGlobalCustom(), "global", "reactionCustomRoom", getRoomCustom(), "room");
  }
  if (!$("emojiPopover")?.classList.contains("hidden") && !$("popoverPaneCustom")?.classList.contains("hidden")) {
    renderCustomGrid("popoverCustomGlobal", getGlobalCustom(), "global", "popoverCustomRoom", getRoomCustom(), "room");
  }
}


// SHARED RENDERERS


function renderRecentsRow(rowId, titleId, mode) {
  const row = $(rowId);
  const title = $(titleId);
  if (!row || !title) return;

  const recents = getRecents();
  row.innerHTML = "";

  if (!recents.length) {
    title.classList.add("hidden");
    row.classList.add("hidden");
    return;
  }
  title.classList.remove("hidden");
  row.classList.remove("hidden");

  for (const emoji of recents) {
    row.appendChild(makeEmojiButton(emoji, mode));
  }
}

function renderFavoritesRow(rowId, titleId, mode) {
  const row = $(rowId);
  const title = $(titleId);
  if (!row || !title) return;

  const favs = getFavorites();
  row.innerHTML = "";

  if (!favs.length) {
    title.classList.add("hidden");
    row.classList.add("hidden");
    return;
  }
  title.classList.remove("hidden");
  row.classList.remove("hidden");

  for (const emoji of favs) {
    const btn = makeEmojiButton(emoji, mode);
    btn.classList.add("is-fav");
    row.appendChild(btn);
  }
}

function renderCategoryTiles(containerId, mode) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = "";

  const cats = getCategories();
  if (!cats.length) {
    container.innerHTML = '<p class="emoji-empty">No emojis loaded.</p>';
    return;
  }

  for (const cat of cats) {
    const header = document.createElement("div");
    header.className = "emoji-cat-header";
    header.textContent = cat.name;
    container.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "emoji-grid";

    for (const emoji of cat.emojis) {
      grid.appendChild(makeEmojiButton(emoji, mode));
    }
    container.appendChild(grid);
  }
}

function makeEmojiButton(emoji, mode) {
  const btn = document.createElement("button");
  btn.className = "emoji-btn";
  btn.type = "button";
  btn.dataset.emoji = emoji;
  btn.textContent = emoji;

  if (isFavorite(emoji)) btn.classList.add("is-fav");

  const star = document.createElement("span");
  star.className = "emoji-fav-star";
  star.textContent = "★";
  btn.appendChild(star);

  // Click → insert/reaction
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    pickEmoji(emoji, mode);
  });

  // Right click → toggle favorite
  btn.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nowFav = toggleFavorite(emoji);
    btn.classList.toggle("is-fav", nowFav);
    if (mode === "reaction") renderFavoritesRow("reactionFavs", "reactionFavsTitle", "reaction");
    else renderFavoritesRow("popoverFavs", "popoverFavsTitle", "message");
  });

  // Hover → skin menu for tone-capable emojis
  if (supportsSkinTone(emoji)) {
    btn.addEventListener("mouseenter", () => {
      clearTimeout(skinMenuTimeout);
      showSkinMenu(btn, emoji, mode);
    });
    btn.addEventListener("mouseleave", () => {
      skinMenuTimeout = setTimeout(() => {
        if (skinMenuEl && skinMenuEl.matches(":hover")) return;
        hideSkinMenu();
      }, 250);
    });
  } else {
    btn.addEventListener("mouseenter", () => {
      clearTimeout(skinMenuTimeout);
      hideSkinMenu();
    });
  }

  return btn;
}


// SKIN TONE MENU


function showSkinMenu(anchorEl, baseEmoji, mode) {
  hideSkinMenu();

  const menu = document.createElement("div");
  menu.className = "emoji-skin-menu";

  const labels = getSkinToneLabels();
  for (let i = 0; i < labels.length; i++) {
    const toned = applySkinTone(baseEmoji, i);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = toned;
    btn.title = labels[i];
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      pickEmoji(toned, mode);
      hideSkinMenu();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  skinMenuEl = menu;

  menu.addEventListener("mouseenter", () => clearTimeout(skinMenuTimeout));
  menu.addEventListener("mouseleave", () => {
    skinMenuTimeout = setTimeout(() => hideSkinMenu(), 150);
  });

  const rect = anchorEl.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();

  let left = rect.left + rect.width / 2 - menuRect.width / 2;
  let top = rect.top - menuRect.height - 6;

  if (top < 4) top = rect.bottom + 6;
  if (left < 4) left = 4;
  if (left + menuRect.width > window.innerWidth - 4) {
    left = window.innerWidth - menuRect.width - 4;
  }

  menu.style.left = left + "px";
  menu.style.top = top + "px";
}

function hideSkinMenu() {
  if (skinMenuEl && skinMenuEl.parentNode) skinMenuEl.parentNode.removeChild(skinMenuEl);
  skinMenuEl = null;
}


// PICKING AN EMOJI


function pickEmoji(emoji, mode) {
  if (mode === "reaction") {
    if (!activeReactionTarget) return;
    const { msgId, isDm } = activeReactionTarget;
    pushRecent(emoji);
    toggleReaction(msgId, emoji, isDm);
    closeReactionPicker();
  } else if (mode === "message") {
    insertEmojiIntoInput(emoji);
  }
}

function pickCustomEmoji(item, mode) {
  if (mode === "reaction") {
    if (!activeReactionTarget) return;
    const { msgId, isDm } = activeReactionTarget;
    const marker = ":" + item.name + ":";
    toggleReaction(msgId, marker, isDm);
    closeReactionPicker();
  } else if (mode === "message") {
    insertEmojiIntoInput(":" + item.name + ":");
  }
}

function insertEmojiIntoInput(text) {
  const input = activeMessageTargetInput;
  if (!input) return;

  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const before = input.value.slice(0, start);
  const after = input.value.slice(end);

  input.value = before + text + after;
  const newPos = before.length + text.length;
  input.setSelectionRange(newPos, newPos);
  input.focus();
}


// SEARCH RESULTS


function renderSearchResults(query, containerId) {
  const container = $(containerId);
  if (!container) return;

  const q = (query || "").trim();
  container.innerHTML = "";

  if (!q) {
    container.innerHTML = '<p class="emoji-empty">Type to search…</p>';
    return;
  }

  const results = searchEmoji(q);
  if (!results.length) {
    container.innerHTML = '<p class="emoji-empty">No matches.</p>';
    return;
  }

  const mode = activePickerMode === "message" ? "message" : "reaction";

  for (const item of results) {
    if (typeof item === "string") {
      container.appendChild(makeEmojiButton(item, mode));
    } else if (item && item.custom) {
      const btn = document.createElement("button");
      btn.className = "emoji-btn";
      btn.type = "button";
      btn.title = ":" + item.name + ":";
      const img = document.createElement("img");
      img.src = item.dataUrl;
      img.alt = ":" + item.name + ":";
      btn.appendChild(img);
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        pickCustomEmoji(item, mode);
      });
      container.appendChild(btn);
    }
  }
}


// CUSTOM EMOJI GRID


function renderCustomGrid(globalId, globalList, globalScope, roomId, roomList, roomScope) {
  renderCustomGridOne($(globalId), globalList, globalScope);
  renderCustomGridOne($(roomId), roomList, roomScope);
}

function renderCustomGridOne(container, list, scope) {
  if (!container) return;
  container.innerHTML = "";

  if (!list.length) {
    const p = document.createElement("p");
    p.className = "emoji-empty";
    p.textContent = "No custom emojis yet.";
    container.appendChild(p);
    return;
  }

  const mode = activePickerMode === "message" ? "message" : "reaction";

  for (const item of list) {
    const tile = document.createElement("div");
    tile.className = "custom-tile";
    tile.title = ":" + item.name + ":";

    const img = document.createElement("img");
    img.src = item.dataUrl;
    img.alt = ":" + item.name + ":";
    tile.appendChild(img);

    if (canDeleteCustomEmoji(scope, item)) {
      const del = document.createElement("button");
      del.className = "custom-tile-del";
      del.textContent = "✕";
      del.title = "Delete";
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!confirm("Delete :" + item.name + ":?")) return;
        try {
          await deleteCustomEmoji(item.id, scope);
          window.__illoToast?.("Deleted");
        } catch (err) {
          window.__illoToast?.(err.message || "Could not delete");
        }
      });
      tile.appendChild(del);
    }

    tile.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      pickCustomEmoji(item, mode);
    });

    container.appendChild(tile);
  }
}

function canDeleteCustomEmoji(scope, item) {
  if (!state.me) return false;
  if (item.uploadedBy === state.me.uid) return true;
  if (scope === "global") return state.admins.includes(state.me.uid);
  if (scope === "room") return state.roomMeta && state.roomMeta.adminUid === state.me.uid;
  return false;
}


// ADD CUSTOM EMOJI MODAL


let pendingNewEmojiDataUrl = null;

function openAddEmojiModal() {
  pendingNewEmojiDataUrl = null;
  $("newEmojiName").value = "";
  $("newEmojiFile").value = "";
  $("newEmojiGlobal").checked = false;
  $("addEmojiError").textContent = "";
  const preview = $("newEmojiPreview");
  if (preview) { preview.src = ""; preview.style.display = "none"; }

  const canGlobal = state.me && state.admins.includes(state.me.uid);
  const globalCheck = $("newEmojiGlobal");
  if (globalCheck) {
    globalCheck.disabled = !canGlobal;
    globalCheck.parentElement.style.opacity = canGlobal ? "1" : "0.5";
  }

  $("addEmojiModal").classList.remove("hidden");
}

function previewNewEmoji() {
  const file = $("newEmojiFile").files[0];
  if (!file) return;
  if (file.size > 90 * 1024) {
    $("addEmojiError").textContent = "Image too big (64 KB max)";
    $("newEmojiFile").value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingNewEmojiDataUrl = ev.target.result;
    const p = $("newEmojiPreview");
    if (p) { p.src = ev.target.result; p.style.display = "block"; }
    $("addEmojiError").textContent = "";
  };
  reader.readAsDataURL(file);
}

async function handleSaveCustomEmoji() {
  $("addEmojiError").textContent = "";
  const name = ($("newEmojiName").value || "").trim().toLowerCase();
  const isGlobal = $("newEmojiGlobal").checked;

  if (!name || !/^[a-z0-9_]{2,24}$/.test(name)) {
    return $("addEmojiError").textContent = "Name must be 2-24 chars (a-z, 0-9, _)";
  }
  if (!pendingNewEmojiDataUrl) {
    return $("addEmojiError").textContent = "Pick an image";
  }
  if (isGlobal && !(state.me && state.admins.includes(state.me.uid))) {
    return $("addEmojiError").textContent = "Only admins can create global emojis";
  }
  if (!isGlobal && !state.roomCode) {
    return $("addEmojiError").textContent = "Join a room to add room emojis";
  }

  try {
    await addCustomEmoji({
      name,
      dataUrl: pendingNewEmojiDataUrl,
      scope: isGlobal ? "global" : "room"
    });
    $("addEmojiModal").classList.add("hidden");
    window.__illoToast?.("Emoji added");
  } catch (e) {
    $("addEmojiError").textContent = e.message;
  }
}


// MORE MENU


function openMoreMenu(msgId, msg, isOwn, isDm, sender, plainText) {
  const menu = $("moreMenu");
  menu.innerHTML = "";

  const canDelete = isOwn || (window.__illoCanModerate?.() && !isDm);
  if (canDelete) {
    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "Delete Message";
    del.addEventListener("click", async () => {
      $("moreMenuModal").classList.add("hidden");
      if (!confirm("Delete this message?")) return;
      try {
        if (isDm) {
          await remove(ref(db, `dms/${dmPairKeySafe(state.me.uid, window.__illoGetActiveDmUid?.())}/${msgId}`));
        } else {
          await remove(ref(db, `chats/${state.roomCode}/messages/${msgId}`));
        }
        const line = document.querySelector(`.msg-line[data-msg-id="${msgId}"]`);
        if (line) line.remove();
      } catch {
        window.__illoToast?.("Could not delete");
      }
    });
    menu.appendChild(del);
  }

  const copyText = document.createElement("button");
  copyText.textContent = "Copy Text";
  copyText.addEventListener("click", () => {
    $("moreMenuModal").classList.add("hidden");
    navigator.clipboard.writeText(plainText || "").then(() => window.__illoToast?.("Copied"));
  });
  menu.appendChild(copyText);

  const copyId = document.createElement("button");
  copyId.textContent = "Copy Message ID";
  copyId.addEventListener("click", () => {
    $("moreMenuModal").classList.add("hidden");
    navigator.clipboard.writeText(msgId).then(() => window.__illoToast?.("Copied ID"));
  });
  menu.appendChild(copyId);

  if (!isDm && window.__illoCanKick?.()) {
    const kickUser = document.createElement("button");
    kickUser.className = "danger";
    kickUser.textContent = "Kick " + sender.username;
    kickUser.addEventListener("click", async () => {
      $("moreMenuModal").classList.add("hidden");
      if (!confirm("Kick " + sender.username + "?")) return;
      try {
        await window.__illoAdminKick?.(msg.uid);
        window.__illoToast?.("Kicked");
      } catch (e) {
        window.__illoToast?.(e.message || "Could not kick");
      }
    });
    menu.appendChild(kickUser);
  }

  $("moreMenuModal").classList.remove("hidden");
}

export function resetChatUI() {
  const container = $("chatContainer");
  const empty = $("emptyState");
  if (!container || !empty) return;
  container.innerHTML = "";
  container.appendChild(empty);
  empty.style.display = "flex";
  state.lastGroupEl = null;
  state.lastGroupUid = null;
  state.lastGroupTime = 0;
  setReply(null);
  closeEmojiPopover();
}
