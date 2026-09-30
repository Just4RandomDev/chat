// CHAT
// Message rendering, sending, replies, reactions.

import { ref, onValue, off, push, get, remove, update, serverTimestamp } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import { $, on, esc, applyIconMask } from "../core/dom.js";
import {
  BOT_UID,
  GROUP_MS,
  FILE_MAX_BYTES,
  URL_RE
} from "../core/constants.js";
import { fmtTime, classifyUrl, extractMentions, hasEveryone } from "../core/helpers.js";
import { encryptText, decryptText } from "../core/crypto.js";
import { t } from "../core/i18n.js";
import { state } from "../core/state.js";
import { fetchUser, defaultPfp } from "../services/user-cache.js";
import { sendBotMessage } from "../services/bot.js";
import { spamCheck as spamCheckService } from "../services/spam.js";
import { isBlocked } from "./users.js";
import { pushNotification } from "./notifications.js";
import { hideAutocomplete } from "./mentions.js";

let emojiCategories = [];
let onOpenUserProfile = null;

export function initChat(categories, hooks) {
  emojiCategories = categories || [];
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

  on($("reactionSearch"), "input", () => renderReactionPicker($("reactionSearch").value));
  on($("cancelReactionPicker"), "click", () => {
    $("reactionPickerModal").classList.add("hidden");
    state.reactionTarget = null;
  });

  on($("moreMenuModal"), "click", (e) => {
    if (e.target === $("moreMenuModal")) $("moreMenuModal").classList.add("hidden");
  });
}

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
    if (isDm) {
      state.dmPendingFile = payload;
    } else {
      state.pendingFile = payload;
    }
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
  if (plainText) buildLineContent(contentWrap, plainText);
  line.appendChild(contentWrap);

  if (msg.mediaType && msg.mediaData) {
    const src = decryptText(msg.mediaData, msg.dmKey || state.roomCode);
    if (src?.startsWith("data:")) {
      if (msg.mediaType === "image" || msg.mediaType === "gif") {
        const img = document.createElement("img");
        img.src = src;
        img.loading = "lazy";
        line.appendChild(img);
        if (msg.mediaType === "gif") {
          const tag = document.createElement("span");
          tag.className = "gif-tag";
          tag.textContent = "GIF";
          line.appendChild(tag);
        }
      } else if (msg.mediaType === "video") {
        const v = document.createElement("video");
        v.src = src;
        v.controls = true;
        v.preload = "metadata";
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

function renderPills(container, data, msgId, isDm) {
  container.innerHTML = "";
  if (!data) return;
  for (const [emoji, users] of Object.entries(data)) {
    if (!users) continue;
    const uids = Object.keys(users).filter(u => users[u] === true);
    if (!uids.length) continue;

    const pill = document.createElement("button");
    pill.className = "reaction-pill" + (state.me && users[state.me.uid] ? " mine" : "");
    pill.innerHTML = `<span>${emoji}</span><span class="count">${uids.length}</span>`;
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

function openReactionPicker(msgId, isDm) {
  state.reactionTarget = { msgId, isDm };
  $("reactionPicker").innerHTML = "";
  if ($("reactionSearch")) $("reactionSearch").value = "";
  renderReactionPicker("");
  $("reactionPickerModal").classList.remove("hidden");
  setTimeout(() => $("reactionSearch")?.focus(), 50);
}

function renderReactionPicker(query) {
  const picker = $("reactionPicker");
  picker.innerHTML = "";
  const q = (query || "").trim().toLowerCase();

  if (q) {
    const all = emojiCategories.flatMap(c => c.emojis);
    const unique = [...new Set(all)];
    if (!unique.length) {
      picker.innerHTML = '<div class="rp-cat">No matches</div>';
      return;
    }
    for (const e of unique) {
      const btn = document.createElement("button");
      btn.textContent = e;
      btn.addEventListener("click", () => selectReaction(e));
      picker.appendChild(btn);
    }
    return;
  }

  for (const cat of emojiCategories) {
    const header = document.createElement("div");
    header.className = "rp-cat";
    header.textContent = cat.name;
    picker.appendChild(header);
    for (const e of cat.emojis) {
      const btn = document.createElement("button");
      btn.textContent = e;
      btn.addEventListener("click", () => selectReaction(e));
      picker.appendChild(btn);
    }
  }
}

function selectReaction(emoji) {
  if (!state.reactionTarget) return;
  const { msgId, isDm } = state.reactionTarget;
  $("reactionPickerModal").classList.add("hidden");
  toggleReaction(msgId, emoji, isDm);
  state.reactionTarget = null;
}

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
}
