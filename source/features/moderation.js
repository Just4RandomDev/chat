// MODERATION
// Permission checks and admin actions on rooms.

import { ref, get, set, update, remove } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import { PUBLIC_ROOM } from "../core/constants.js";
import { state } from "../core/state.js";
import { fetchUser } from "../services/user-cache.js";
import { sendBotMessage } from "../services/bot.js";
import { hashPassword } from "../core/crypto.js";

export function isRoomOwner() {
  return !!(state.me && state.roomMeta && state.roomMeta.adminUid === state.me.uid);
}

export function isGlobalAdmin() {
  return !!(state.me && state.admins.includes(state.me.uid));
}

export function canModerate() {
  return isRoomOwner() || isGlobalAdmin();
}

export function isPublicRoom() {
  return !!(state.roomMeta && (state.roomMeta.isPublic || state.roomCode === PUBLIC_ROOM));
}

export function canKick() {
  return canModerate() && !isPublicRoom();
}

export function canEditRoom() {
  return canModerate() && !isPublicRoom();
}

export async function adminKick(uid) {
  if (!canKick()) throw new Error("No permission to kick in this room");
  if (!uid || uid === state.me.uid) throw new Error("Cannot kick yourself");

  const target = await fetchUser(uid);

  await set(ref(db, `rooms/${state.roomCode}/kicked/${uid}`), true);
  try { await remove(ref(db, `chats/${state.roomCode}/presence/${uid}`)); } catch {}

  await sendBotMessage(state.roomCode, "🚪 " + target.username + " was kicked by " + state.me.username);

  return target.username;
}

export async function adminUnkick(uid) {
  if (!canModerate()) throw new Error("No permission");
  await remove(ref(db, `rooms/${state.roomCode}/kicked/${uid}`));
}

export async function adminWipeMessages() {
  if (!canEditRoom()) throw new Error("No permission to wipe in this room");
  await remove(ref(db, `chats/${state.roomCode}/messages`));
}

export async function adminUpdateRoom(patch) {
  if (!canEditRoom()) throw new Error("No permission to edit this room");

  const safe = {};
  if (typeof patch.name === "string" && patch.name.trim()) safe.name = patch.name.trim().slice(0, 40);
  if (typeof patch.maxUsers === "number" && patch.maxUsers >= 2 && patch.maxUsers <= 500) safe.maxUsers = patch.maxUsers;
  if (typeof patch.pinned === "boolean") safe.pinned = patch.pinned;
  if (typeof patch.forever === "boolean") safe.forever = patch.forever;

  if (typeof patch.passwordHash === "string") {
    safe.hasPassword = true;
    safe.passwordHash = patch.passwordHash;
  }
  if (patch.removePassword === true) {
    safe.hasPassword = false;
    safe.passwordHash = "";
  }
  safe.lastActivity = Date.now();

  await update(ref(db, `rooms/${state.roomCode}`), safe);
  state.roomMeta = { ...state.roomMeta, ...safe };
  return safe;
}

export async function adminDeleteRoom() {
  if (!canEditRoom()) throw new Error("No permission to delete this room");
  const code = state.roomCode;
  await remove(ref(db, `chats/${code}`));
  await remove(ref(db, `rooms/${code}`));
  return code;
}

export async function listKicked() {
  if (!canModerate()) throw new Error("No permission");
  const snap = await get(ref(db, `rooms/${state.roomCode}/kicked`));
  const uids = Object.keys(snap.val() || {});
  const out = [];
  for (const uid of uids) {
    const p = await fetchUser(uid);
    out.push({ uid, profile: p });
  }
  return out;
}

export async function listMembers() {
  if (!canModerate()) throw new Error("No permission");

  const [pSnap, sSnap] = await Promise.all([
    get(ref(db, `chats/${state.roomCode}/presence`)),
    get(ref(db, `chats/${state.roomCode}/seen`))
  ]);

  const presence = pSnap.val() || {};
  const seen = sSnap.val() || {};
  const now = Date.now();
  const out = [];
  const seenUids = new Set();

  for (const [uid, p] of Object.entries(presence)) {
    if (!p?.joinedAt) continue;
    if (now - p.joinedAt > 120000) continue;
    const prof = await fetchUser(uid);
    out.push({ uid, profile: prof, online: true, lastSeen: p.joinedAt });
    seenUids.add(uid);
  }

  for (const [uid, s] of Object.entries(seen)) {
    if (seenUids.has(uid)) continue;
    if (!s?.lastSeen) continue;
    const prof = await fetchUser(uid);
    out.push({ uid, profile: prof, online: false, lastSeen: s.lastSeen });
  }

  out.sort((a, b) => {
    if (a.online && !b.online) return -1;
    if (!a.online && b.online) return 1;
    return (a.profile.username || "").localeCompare(b.profile.username || "");
  });

  return out;
}