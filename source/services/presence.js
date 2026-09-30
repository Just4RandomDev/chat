// PRESENCE

import { ref, get } from "../firebase/database.js";
import { db } from "../firebase/config.js";

const countCache = new Map();
const CACHE_MS = 3000;
const CACHE_MAX = 200;

export async function getPresenceCount(code) {
  const cached = countCache.get(code);
  if (cached && Date.now() - cached.ts < CACHE_MS) return cached.n;

  try {
    const snap = await get(ref(db, `chats/${code}/presence`));
    const n = Object.keys(snap.val() || {}).length;

    // LRU-ish trim
    if (countCache.size >= CACHE_MAX) {
      const firstKey = countCache.keys().next().value;
      countCache.delete(firstKey);
    }

    countCache.set(code, { n, ts: Date.now() });
    return n;
  } catch {
    return 0;
  }
}

export function invalidatePresenceCount(code) {
  countCache.delete(code);
}

export function clearPresenceCache() {
  countCache.clear();
}