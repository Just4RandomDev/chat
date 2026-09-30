// SWEEPER
// Periodically removes empty rooms and TTL-expired messages.

import { ref, get, query, limitToLast, remove } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import {
  PUBLIC_ROOM,
  EMPTY_TTL,
  SWEEP_MS,
  MSG_TTL_MS,
  MSG_MAX,
  AUTO_CLEAN_MS,
  PRESENCE_STALE_MS
} from "../core/constants.js";
import { state } from "../core/state.js";
import { getPresenceCount, invalidatePresenceCount } from "./presence.js";

let sweepId = null;
let cleanId = null;
let meRef = null;

export function startSweeper(me) {
  meRef = me;
  stopSweeper();
  sweepId = setInterval(sweepRooms, SWEEP_MS);
  setTimeout(sweepRooms, 5000);
}

export function stopSweeper() {
  if (sweepId) { clearInterval(sweepId); sweepId = null; }
}

export function startRoomCleaner(me) {
  meRef = me;
  stopRoomCleaner();
  cleanId = setInterval(cleanRoomMessages, AUTO_CLEAN_MS);
  setTimeout(cleanRoomMessages, 5000);
}

export function stopRoomCleaner() {
  if (cleanId) { clearInterval(cleanId); cleanId = null; }
}

async function sweepRooms() {
  if (!meRef) return;

  try {
    const rs = await get(ref(db, "rooms"));
    const rooms = rs.val() || {};
    const now = Date.now();

    for (const [code, room] of Object.entries(rooms)) {
      if (code === PUBLIC_ROOM || room.isPublic) continue;
      if (room.pinned || room.forever) continue;
      if (!room.adminUid || room.adminUid === "system") continue;

      const p = await getPresenceCount(code);
      if (p > 0) continue;

      let last = room.createdAt || 0;

      try {
        const lm = await get(query(ref(db, `chats/${code}/messages`), limitToLast(1)));
        const arr = lm.val();
        if (arr) {
          const msg = Object.values(arr)[0];
          if (msg?.timestamp > last) last = msg.timestamp;
        }
      } catch {}

      if (room.lastActivity > last) last = room.lastActivity;

      if (now - last > EMPTY_TTL) {
        try {
          await remove(ref(db, `rooms/${code}`));
          await remove(ref(db, `chats/${code}`));
          invalidatePresenceCount(code);
        } catch {}
      }
    }
  } catch {}
}

async function cleanRoomMessages() {
  if (!meRef || !state.roomCode) return;
  const roomCode = state.roomCode;

  try {
    const snap = await get(query(ref(db, `chats/${roomCode}/messages`), limitToLast(200)));
    const data = snap.val() || {};
    const now = Date.now();
    const entries = Object.entries(data);
    const toDelete = [];

    for (const [id, msg] of entries) {
      if (msg.timestamp && now - msg.timestamp > MSG_TTL_MS) toDelete.push(id);
    }

    const remaining = entries.length - toDelete.length;

    if (remaining > MSG_MAX) {
      const sorted = entries
        .filter(([id]) => !toDelete.includes(id))
        .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
      const extra = remaining - MSG_MAX;
      for (let i = 0; i < extra; i++) toDelete.push(sorted[i][0]);
    }

    for (const id of toDelete) {
      try { await remove(ref(db, `chats/${roomCode}/messages/${id}`)); } catch {}
    }
  } catch {}

  await cleanStalePresence(roomCode);
}

async function cleanStalePresence(roomCode) {
  try {
    const snap = await get(ref(db, `chats/${roomCode}/presence`));
    const data = snap.val() || {};
    const now = Date.now();

    for (const [uid, entry] of Object.entries(data)) {
      if (!entry?.joinedAt) continue;
      if (uid === meRef.uid) continue;
      if (now - entry.joinedAt > PRESENCE_STALE_MS) {
        try { await remove(ref(db, `chats/${roomCode}/presence/${uid}`)); } catch {}
      }
    }
  } catch {}
}