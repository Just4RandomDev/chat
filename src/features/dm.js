// DIRECT MESSAGES

import { ref, push, query, limitToLast, onValue, serverTimestamp } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import { $, on } from "../core/dom.js";
import { encryptText, decryptText, dmPath, dmKeyForCrypto } from "../core/crypto.js";
import { state } from "../core/state.js";
import { fetchUser } from "../services/user-cache.js";
import { spamCheck as spamCheckService } from "../services/spam.js";
import { isBlocked } from "./users.js";
import { pushNotification } from "./notifications.js";
import { handleFileObject, renderMessage } from "./chat.js";

let unsub = null;
let renderedIds = new Set();
let lastGroupEl = null, lastGroupUid = null, lastGroupTime = 0;

export function getDmState() {
  return {
    lastGroupEl,
    lastGroupUid,
    lastGroupTime
  };
}

export function getActiveDmUid() {
  return state.activeDmUid;
}

export function setDmLastGroup(el, uid, t) {
  lastGroupEl = el;
  lastGroupUid = uid;
  lastGroupTime = t;
}

export function setDmReply(target) {
  state.dmReply = target;
  const bar = $("dmReplyBar");
  if (!bar) return;
  if (target) {
    $("dmReplyBarName").textContent = target.username;
    $("dmReplyBarPreview").textContent = target.previewText || "";
    bar.classList.remove("hidden");
  } else {
    bar.classList.add("hidden");
  }
}

export function resetDmLocalState() {
  renderedIds = new Set();
  lastGroupEl = lastGroupUid = null;
  lastGroupTime = 0;
  state.dmReply = null;
  state.dmPendingFile = null;
}

export function resetDmUI() {
  const msgs = $("dmMessages");
  const empty = $("dmEmptyState");
  if (!msgs || !empty) return;
  msgs.innerHTML = "";
  msgs.appendChild(empty);
  empty.style.display = "flex";
  setDmReply(null);
}

export function initDm() {
  on($("dmSendBtn"), "click", handleSendDm);
  on($("dmInput"), "keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendDm();
    }
  });
  on($("dmReplyBarCancel"), "click", () => setDmReply(null));
  on($("dmCloseBtn"), "click", closeDmPanel);
  on($("dmFileInput"), "change", (e) => {
    const f = e.target.files[0];
    if (f) handleFileObject(f, true);
    e.target.value = "";
  });
  on($("dmFilePreviewRemove"), "click", clearDmPendingFile);
  on($("dmInput"), "paste", (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleFileObject(file, true);
          return;
        }
      }
    }
  });

  // The DM emoji button (#dmEmojiBtn) is wired by chat.js
  // via wireMessageEmojiPopover(). Do not attach a listener here.
}

export async function openDmPanel(otherUid) {
  if (!state.roomCode) {
    await window.__illoRequestJoinRoom?.("public");
  }

  const other = await fetchUser(otherUid);
  $("dmPanel").classList.remove("hidden");
  $("dmInput").disabled = false;
  $("dmFileInput").disabled = false;
  $("dmSendBtn").disabled = false;
  $("dmEmojiBtn") && ($("dmEmojiBtn").disabled = false);
  $("dmHeadTitle").textContent = "DM with " + other.username;
  $("dmHeadTitle").style.color = other.nameColor || "";

  await openDm(otherUid);
  $("dmInput").focus();
}

async function openDm(otherUid) {
  if (!state.me) return;
  if (state.activeDmUid === otherUid && unsub) return;

  closeDm();

  state.activeDmUid = otherUid;
  const activeRef = query(ref(db, dmPath(state.me.uid, otherUid)), limitToLast(200));
  renderedIds = new Set();
  lastGroupEl = lastGroupUid = null;
  lastGroupTime = 0;

  const container = $("dmMessages");
  const empty = $("dmEmptyState");
  container.innerHTML = "";
  container.appendChild(empty);
  empty.style.display = "flex";

  unsub = onValue(activeRef, async (snap) => {
    const data = snap.val() || {};
    const entries = Object.entries(data)
      .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));

    const wasAtBottom = shouldStickToBottomSafe(container);
    const newEntries = [];

    for (const [id, msg] of entries) {
      if (renderedIds.has(id)) continue;
      if (!msg) continue;
      if (!msg.dmKey) continue;
      renderedIds.add(id);
      if (isBlocked(msg.uid)) continue;
      newEntries.push([id, msg]);
    }

    if (!newEntries.length) {
      if (entries.length) empty.style.display = "none";
      return;
    }

    const uids = [...new Set(newEntries.map(([, m]) => m.uid))];
    await Promise.all(uids.map(u => fetchUser(u)));

    for (const [id, msg] of newEntries) {
      renderMessage(container, id, msg, msg.uid === state.me.uid, true);
    }

    empty.style.display = "none";
    if (wasAtBottom) container.scrollTop = container.scrollHeight;
  });
}

export function closeDm() {
  if (unsub) { try { unsub(); } catch {} unsub = null; }
  state.activeDmUid = null;
  renderedIds = new Set();
  lastGroupEl = lastGroupUid = null;
  lastGroupTime = 0;
  state.dmReply = null;
}

function closeDmPanel() {
  closeDm();
  resetDmLocalState();
  $("dmPanel").classList.add("hidden");
  $("dmInput").disabled = true;
  $("dmFileInput").disabled = true;
  $("dmSendBtn").disabled = true;
  $("dmEmojiBtn") && ($("dmEmojiBtn").disabled = true);
  $("dmHeadTitle").style.color = "";
  resetDmUI();
}

async function handleSendDm() {
  if (!state.me || !state.activeDmUid) return;

  const rawText = $("dmInput").value.trim();
  const hasMedia = !!state.dmPendingFile;
  if (!rawText && !hasMedia) return window.__illoToast?.("Nothing to send");

  const spam = spamCheckService();
  if (!spam.ok) {
    if (spam.message) window.__illoToast?.(spam.message);
    return;
  }

  const encKey = dmKeyForCrypto(state.me.uid, state.activeDmUid);
  const replyPayload = state.dmReply ? {
    uid: state.dmReply.uid,
    username: state.dmReply.username,
    previewText: state.dmReply.previewText,
    msgId: state.dmReply.msgId
  } : null;

  await push(ref(db, dmPath(state.me.uid, state.activeDmUid)), {
    uid: state.me.uid,
    text: rawText ? encryptText(rawText, encKey) : "",
    mediaType: hasMedia ? state.dmPendingFile.type : null,
    mediaData: hasMedia ? encryptText(state.dmPendingFile.dataUrl, encKey) : null,
    dmKey: encKey,
    replyTo: replyPayload,
    timestamp: Date.now()
  });

  pushNotification(state.activeDmUid, {
    type: "dm",
    title: "New DM from " + state.me.username,
    body: rawText ? rawText.slice(0, 80) : "[media]",
    fromUid: state.me.uid
  });

  $("dmInput").value = "";
  clearDmPendingFile();
  setDmReply(null);
  $("dmInput").focus();
}

function clearDmPendingFile() {
  if (state.dmPendingFile?.objectUrl) URL.revokeObjectURL(state.dmPendingFile.objectUrl);
  state.dmPendingFile = null;
  if ($("dmFileInput")) $("dmFileInput").value = "";
  $("dmFilePreview")?.classList.add("hidden");
  if ($("dmFilePreviewImg")) $("dmFilePreviewImg").src = "";
  if ($("dmFilePreviewVideo")) $("dmFilePreviewVideo").src = "";
}

function shouldStickToBottomSafe(container) {
  if (!container) return true;
  const viewportBottom = container.scrollTop + container.clientHeight;
  const lines = container.querySelectorAll(".msg-line");
  if (!lines.length) return true;
  let below = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const node = lines[i];
    if (node.offsetTop + node.offsetHeight <= viewportBottom + 4) break;
    below++;
    if (below > 10) return false;
  }
  return below <= 10;
}
