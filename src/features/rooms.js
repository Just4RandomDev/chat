// ROOMS
// Join, create, and leave rooms.

import { ref, get, set, update, remove, onValue, onDisconnect, serverTimestamp, query, limitToLast } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import { $, on } from "../core/dom.js";
import { hashPassword } from "../core/crypto.js";
import { PUBLIC_ROOM } from "../core/constants.js";
import { t } from "../core/i18n.js";
import { state, resetRoomState } from "../core/state.js";
import { getPresenceCount } from "../services/presence.js";
import { sendBotMessage } from "../services/bot.js";
import { startRoomCleaner, stopRoomCleaner } from "../services/sweeper.js";

let renderMessage = null;
let hideEmpty = null;
let resetChatUI = null;
let resetDmUI = null;
let onRoomJoined = null;
let onRoomLeft = null;
let canModerate = null;
let isGlobalAdmin = null;

export function initRooms(hooks) {
  renderMessage = hooks.renderMessage;
  hideEmpty = hooks.hideEmpty;
  resetChatUI = hooks.resetChatUI;
  resetDmUI = hooks.resetDmUI;
  onRoomJoined = hooks.onRoomJoined;
  onRoomLeft = hooks.onRoomLeft;
  canModerate = hooks.canModerate;
  isGlobalAdmin = hooks.isGlobalAdmin;

  on($("openCreateRoomBtn"), "click", openCreateRoomModal);
  on($("createRoomBtn"), "click", handleCreateRoom);
  on($("cancelCreateRoomBtn"), "click", () => $("createRoomModal").classList.add("hidden"));
  on($("submitPasswordBtn"), "click", handlePasswordSubmit);
  on($("cancelPasswordBtn"), "click", () => $("passwordModal").classList.add("hidden"));
  on($("backToLobbyBtn"), "click", handleBackToLobby);
}

function openCreateRoomModal() {
  $("createRoomCodeInput").value = "";
  $("createRoomName").value = "";
  $("createRoomMax").value = "20";
  $("createRoomPassword").value = "";
  $("createRoomPinned").checked = false;
  $("createRoomForever").checked = false;
  $("createRoomPinned").parentElement.style.display = canModerate?.() ? "flex" : "none";
  $("createRoomForever").parentElement.style.display = canModerate?.() ? "flex" : "none";
  $("createRoomError").textContent = "";
  $("createRoomModal").classList.remove("hidden");
}

async function handleCreateRoom() {
  const code = $("createRoomCodeInput").value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const name = $("createRoomName").value.trim() || code;
  const max = parseInt($("createRoomMax").value, 10) || 20;
  const pw = $("createRoomPassword").value;
  const pinned = canModerate?.() && $("createRoomPinned").checked;
  const forever = canModerate?.() && $("createRoomForever").checked;

  $("createRoomError").textContent = "";
  if (code.length < 2) return $("createRoomError").textContent = "Code must be 2+ chars (a-z, 0-9, -, _)";
  if (code === PUBLIC_ROOM) return $("createRoomError").textContent = "That code is reserved";
  if (name.length > 40) return $("createRoomError").textContent = "Name too long";
  if (max < 2 || max > 500) return $("createRoomError").textContent = "Max users must be 2-500";

  const ex = await get(ref(db, `rooms/${code}`));
  if (ex.exists()) return $("createRoomError").textContent = "That code is taken";

  const meta = {
    name,
    adminUid: state.me.uid,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    hasPassword: !!pw,
    passwordHash: pw ? hashPassword(pw) : "",
    maxUsers: max,
    kicked: {},
    pinned: !!pinned,
    forever: !!forever
  };

  try {
    await set(ref(db, `rooms/${code}`), meta);
    $("createRoomModal").classList.add("hidden");
    window.__illoToast?.("Room created");
    await enterRoom(code, { ...meta, hasPassword: !!pw });
  } catch (e) {
    $("createRoomError").textContent = e.message;
  }
}

export async function requestJoinRoom(code) {
  if (!state.me) return;

  const rs = await get(ref(db, `rooms/${code}`));
  if (!rs.exists()) return window.__illoToast?.("That room no longer exists");

  const room = rs.val();
  if (room.kicked?.[state.me.uid] && !isGlobalAdmin?.()) {
    return window.__illoToast?.(t("kickedToast"));
  }

  const max = room.maxUsers || 50;
  const pSnap = await get(ref(db, `chats/${code}/presence`));
  const pData = pSnap.val() || {};
  const inRoom = !!pData[state.me.uid];
  const count = Object.keys(pData).length;

  if (!inRoom && count >= max) return window.__illoToast?.(`Room is full (${count}/${max})`);

  if (room.hasPassword && !isGlobalAdmin?.()) {
    $("passwordRoomCode").textContent = code;
    $("joinRoomPassword").value = "";
    $("passwordError").textContent = "";
    $("passwordModal").classList.remove("hidden");
    return;
  }

  await enterRoom(code, room);
}

async function handlePasswordSubmit() {
  const code = $("passwordRoomCode").textContent;
  const pw = $("joinRoomPassword").value;
  $("passwordError").textContent = "";

  const rs = await get(ref(db, `rooms/${code}`));
  const room = rs.val();
  if (!room) return $("passwordError").textContent = "Room disappeared";
  if (room.passwordHash !== hashPassword(pw)) return $("passwordError").textContent = "Wrong password";
  if (room.kicked?.[state.me.uid] && !isGlobalAdmin?.()) {
    return $("passwordError").textContent = t("kickedToast");
  }

  const max = room.maxUsers || 50;
  const c = await getPresenceCount(code);
  if (c >= max) return $("passwordError").textContent = `Room is full (${c}/${max})`;

  $("passwordModal").classList.add("hidden");
  await enterRoom(code, room);
}

async function handleBackToLobby() {
  await leaveRoom();
  resetChatUI?.();
  resetDmUI?.();
  onRoomLeft?.();
}

export async function enterRoom(code, roomMeta) {
  if (state.enteringRoom) return;
  if (state.roomCode === code) return;

  state.enteringRoom = true;
  try {
    await leaveRoom({ silent: true });

    state.roomCode = code;
    state.roomMeta = roomMeta;
    state.roomRef = ref(db, `chats/${code}/messages`);
    state.queryRef = query(state.roomRef, limitToLast(150));

    resetChatUI?.();
    onRoomJoined?.(code, roomMeta);

    // Custom emojis: restart listeners with the room code so per-room
    // emojis are picked up. Global ones are always loaded.
    window.__illoStartCustomEmojiListeners?.(code);
    window.__illoStartRoomRoleListeners?.(code);

    $("chatHeadTitle").textContent = "# " + (roomMeta.name || code);
    $("chatHeadLock").classList.toggle("hidden", !roomMeta.hasPassword);
    $("chatHeadPublic").classList.toggle("hidden", !(roomMeta.isPublic || code === PUBLIC_ROOM));
    $("chatHeadForever").classList.toggle("hidden", !roomMeta.forever);
    $("capacityLabel").textContent = "/ " + (roomMeta.maxUsers || 50);

    try { update(ref(db, `rooms/${code}`), { lastActivity: Date.now() }); } catch {}

    const renderedIds = new Set();

    const chatUnsub = onValue(state.queryRef, async (snap) => {
      const data = snap.val() || {};
      const entries = Object.entries(data)
        .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));

      const wasAtBottom = shouldStickToBottomSafe($("chatContainer"));
      const newEntries = [];

      for (const [id, msg] of entries) {
        if (renderedIds.has(id)) continue;
        if (!msg) continue;
        if (msg.dmKey) continue;
        renderedIds.add(id);
        if (window.__illoIsBlocked?.(msg.uid)) continue;
        newEntries.push([id, msg]);
      }

      if (!newEntries.length) {
        if (entries.length) hideEmpty?.();
        return;
      }

      const uids = [...new Set(newEntries.map(([, m]) => m.uid))];
      await Promise.all(uids.map(u => window.__illoFetchUser?.(u)));

      for (const [id, msg] of newEntries) {
        renderMessage($("chatContainer"), id, msg, msg.uid === state.me.uid, false);
      }

      hideEmpty?.();
      if (wasAtBottom) $("chatContainer").scrollTop = $("chatContainer").scrollHeight;
      window.__illoUpdateScrollButtons?.();
    });

    state.groupOff = () => {
      try { chatUnsub(); } catch {}
    };

    state.presenceRef = ref(db, `chats/${code}/presence/${state.me.uid}`);
    await set(state.presenceRef, {
      username: state.me.username,
      joinedAt: Date.now()
    });
    await set(ref(db, `chats/${code}/seen/${state.me.uid}`), {
      username: state.me.username,
      lastSeen: Date.now()
    });
    onDisconnect(state.presenceRef).remove();

    if (state.heartbeatId) clearInterval(state.heartbeatId);
    state.heartbeatId = setInterval(() => {
      if (state.roomCode !== code || !state.presenceRef) return;
      update(state.presenceRef, { joinedAt: Date.now() }).catch(() => {});
    }, 30 * 1000);

    state.presenceOff = onValue(ref(db, `chats/${code}/presence`), (snap) => {
      state.presenceData = snap.val() || {};
      window.__illoRenderUserList?.();
    });

    state.seenOff = onValue(ref(db, `chats/${code}/seen`), (snap) => {
      state.seenData = snap.val() || {};
      window.__illoRenderUserList?.();
    });

    state.kickedOff = onValue(ref(db, `rooms/${code}/kicked/${state.me.uid}`), async (snap) => {
      if (snap.val() === true && state.roomCode === code && !isGlobalAdmin?.()) {
        window.__illoToast?.(t("kickedToast"));
        await leaveRoom();
        resetChatUI?.();
        onRoomLeft?.();
      }
    });

    pushAdvisory(code);
    startRoomCleaner(state.me);
    window.__illoUpdateScrollButtons?.();
  } finally {
    state.enteringRoom = false;
  }
}

export async function leaveRoom(opts = {}) {
  if (state.groupOff) { state.groupOff(); state.groupOff = null; }
  if (state.presenceOff) { state.presenceOff(); state.presenceOff = null; }
  if (state.seenOff) { state.seenOff(); state.seenOff = null; }
  if (state.kickedOff) { state.kickedOff(); state.kickedOff = null; }
  if (state.heartbeatId) { clearInterval(state.heartbeatId); state.heartbeatId = null; }
  if (state.reactionListeners) {
    state.reactionListeners.forEach(fn => { try { fn(); } catch {} });
    state.reactionListeners = [];
  }

  stopRoomCleaner();

  if (state.presenceRef) {
    try { await remove(state.presenceRef); } catch {}
    state.presenceRef = null;
  }

  // Reset custom emoji listeners to global-only
  window.__illoStartCustomEmojiListeners?.(null);
  window.__illoStartRoomRoleListeners?.(null);

  resetRoomState();
}

async function pushAdvisory(code) {
  try {
    const existing = await get(ref(db, `chats/${code}/advisoryShown`));
    if (existing.exists()) return;
    await set(ref(db, `chats/${code}/advisoryShown`), true);
    await sendBotMessage(code, "Hi! I'm the room bot. Type !help to see commands. Messages auto-delete after 15 minutes.");
  } catch {}
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
