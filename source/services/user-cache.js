// USER CACHE

import { ref, get } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import { BOT_UID } from "../core/constants.js";

const cache = new Map();

export function defaultPfp(name) {
  const letter = (name || "?").trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='#241a1a'/><text x='16' y='22' font-family='Tahoma' font-size='18' text-anchor='middle' fill='#d94a4a'>${letter}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

export function botPfp() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='#5865f2'/><circle cx='11' cy='14' r='2.4' fill='#fff'/><circle cx='21' cy='14' r='2.4' fill='#fff'/><rect x='10' y='20' width='12' height='2.5' rx='1' fill='#fff'/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

export function getCached(uid) {
  return cache.get(uid) || null;
}

export function setCached(uid, data) {
  cache.set(uid, data);
  return data;
}

export function updateCached(uid, patch) {
  const cur = cache.get(uid) || { uid };
  const next = { ...cur, ...patch };
  cache.set(uid, next);
  return next;
}

export function clearCache() {
  cache.clear();
}

export function primeCache(me) {
  if (!me) return;
  cache.set(me.uid, { ...me });
}

export async function fetchUser(uid) {
  if (uid === BOT_UID) {
    return {
      uid: BOT_UID,
      username: "IlloComoVamos",
      pfp: botPfp(),
      bio: "System bot",
      nameColor: "",
      accentColor: "",
      status: "",
      bannerImage: "",
      createdAt: null
    };
  }

  if (cache.has(uid)) return cache.get(uid);

  try {
    const snap = await get(ref(db, `users/${uid}`));
    const d = snap.val() || {};
    const p = {
      uid,
      username: d.username || "user",
      pfp: d.pfp || defaultPfp(d.username),
      bio: d.bio || "",
      createdAt: d.createdAt || null,
      nameColor: d.nameColor || "",
      accentColor: d.accentColor || "",
      status: d.status || "",
      bannerImage: d.bannerImage || ""
    };
    cache.set(uid, p);
    return p;
  } catch {
    const f = {
      uid,
      username: "user",
      pfp: defaultPfp("?"),
      bio: "",
      nameColor: "",
      accentColor: "",
      status: "",
      bannerImage: "",
      createdAt: null
    };
    cache.set(uid, f);
    return f;
  }
}

// Sanity check: reject lastSeen timestamps more than 1 year in the future.
export function isValidTimestamp(ts) {
  if (!ts || typeof ts !== "number") return false;
  const ONE_YEAR = 365 * 24 * 60 * 60 * 1000;
  return ts <= Date.now() + ONE_YEAR;
}