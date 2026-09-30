// EMOJI SERVICE
// Keywords, recents, favorites, skin tones, custom emojis.

import { ref, get, push, set, remove, onValue } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import { state } from "../core/state.js";
import { loadJson } from "../core/helpers.js";


// DATA


let categories = [];
let keywordMap = {};

const SKIN_TONES = ["", "\u{1F3FB}", "\u{1F3FC}", "\u{1F3FD}", "\u{1F3FE}", "\u{1F3FF}"];
const SKIN_TONE_LABELS = ["Default", "Light", "Medium-Light", "Medium", "Medium-Dark", "Dark"];

const TONE_CAPABLE = new Set([
  "👋","🤚","🖐️","✋","🖖",
  "👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙",
  "👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜",
  "👏","🙌","👐","🤲","🤝","🙏",
  "💪","🦵","🦶",
  "👶","🧒","👦","👧","🧑","👱","👨","🧔","👩","🧓","👴","👵",
  "🙍","🙎","🙅","🙆","💁","🙋","🧏","🙇","🤦","🤷",
  "👮","🕵️","💂","👷","🤴","👸","👳","👲","🧕","🤵","👰","🤰","🤱",
  "👼","🎅","🤶","🦸","🦹","🧙","🧚","🧛","🧜","🧝","💆","💇",
  "🚶","🧍","🧎","🏃","💃","🕺","🕴️","👯","🧖","🧗",
  "⛹️","🏋️","🚴","🚵","🤸","🤼","🤽","🤾","🤹","🧘","🛀","🛌"
]);

let globalCustom = [];
let roomCustom = [];
let customUnsubGlobal = null;
let customUnsubRoom = null;
let customListeners = new Set();


// INIT


export async function initEmoji() {
  try {
    const data = await loadJson("data/emojis.json");
    categories = Array.isArray(data.categories) ? data.categories : [];
  } catch {
    categories = [];
  }

  try {
    keywordMap = await loadJson("data/emoji-keywords.json");
    if (!keywordMap || typeof keywordMap !== "object") keywordMap = {};
  } catch {
    keywordMap = {};
  }
}

export function getCategories() { return categories; }


// RECENTS & FAVORITES


const RECENTS_KEY = "emoji.recents";
const FAVORITES_KEY = "emoji.favorites";
const RECENTS_MAX = 24;

function readList(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function writeList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(0, 200))); } catch {}
}

export function getRecents() { return readList(RECENTS_KEY); }
export function getFavorites() { return readList(FAVORITES_KEY); }
export function isFavorite(e) { return readList(FAVORITES_KEY).includes(e); }

export function pushRecent(emoji) {
  if (!emoji) return;
  const list = readList(RECENTS_KEY).filter(e => e !== emoji);
  list.unshift(emoji);
  writeList(RECENTS_KEY, list.slice(0, RECENTS_MAX));
}

export function toggleFavorite(emoji) {
  if (!emoji) return false;
  const list = readList(FAVORITES_KEY);
  const idx = list.indexOf(emoji);
  if (idx >= 0) {
    list.splice(idx, 1);
    writeList(FAVORITES_KEY, list);
    return false;
  }
  list.unshift(emoji);
  writeList(FAVORITES_KEY, list);
  return true;
}


// SEGMENTATION


export function splitEmojiString(s) {
  if (!s) return [];
  const result = [];
  if ("Segmenter" in Intl) {
    const seg = new Intl.Segmenter("en", { granularity: "grapheme" });
    for (const { segment } of seg.segment(s)) {
      if (segment && segment.trim()) result.push(segment);
    }
  } else {
    for (const ch of Array.from(s)) {
      if (ch && ch.trim()) result.push(ch);
    }
  }
  return result;
}


// SEARCH


const MAX_RESULTS = 60;

export function searchEmoji(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];

  const normalized = q.replace(/\s+/g, "");
  const seen = new Set();
  const out = [];

  const addAll = (str) => {
    for (const e of splitEmojiString(str)) {
      if (seen.has(e)) continue;
      seen.add(e);
      out.push(e);
      if (out.length >= MAX_RESULTS) return true;
    }
    return false;
  };

  if (keywordMap[normalized] && addAll(keywordMap[normalized])) return out;

  const prefixKeys = Object.keys(keywordMap)
    .filter(k => k !== normalized && k.startsWith(normalized))
    .sort((a, b) => a.length - b.length);
  for (const k of prefixKeys) if (addAll(keywordMap[k])) return out;

  const substringKeys = Object.keys(keywordMap)
    .filter(k => k !== normalized && !k.startsWith(normalized) && k.includes(normalized))
    .sort((a, b) => a.length - b.length);
  for (const k of substringKeys) if (addAll(keywordMap[k])) return out;

  const customMatches = [
    ...globalCustom.filter(c => c.name.toLowerCase().includes(normalized)),
    ...roomCustom.filter(c => c.name.toLowerCase().includes(normalized))
  ];
  for (const c of customMatches) {
    if (out.length >= MAX_RESULTS) break;
    out.push({ custom: true, id: c.id, name: c.name, dataUrl: c.dataUrl });
  }

  return out;
}


// SKIN TONES


export function supportsSkinTone(emoji) { return TONE_CAPABLE.has(emoji); }
export function getSkinToneLabels() { return SKIN_TONE_LABELS; }
export function getSkinToneCount() { return SKIN_TONES.length; }

export function applySkinTone(emoji, toneIndex) {
  if (toneIndex <= 0) return emoji;
  const modifier = SKIN_TONES[toneIndex];
  if (!modifier) return emoji;

  let base = emoji;
  for (const t of SKIN_TONES.slice(1)) {
    base = base.split(t).join("");
  }
  return base + modifier;
}


// CUSTOM EMOJIS


export function startCustomEmojiListeners(roomCode) {
  stopCustomEmojiListeners();

  const gRef = ref(db, "customEmojis");
  customUnsubGlobal = onValue(gRef, (snap) => {
    const data = snap.val() || {};
    globalCustom = Object.entries(data).map(([id, v]) => ({ id, ...v }));
    notifyCustomListeners();
  });

  if (roomCode) {
    const rRef = ref(db, `rooms/${roomCode}/customEmojis`);
    customUnsubRoom = onValue(rRef, (snap) => {
      const data = snap.val() || {};
      roomCustom = Object.entries(data).map(([id, v]) => ({ id, ...v }));
      notifyCustomListeners();
    });
  }
}

export function stopCustomEmojiListeners() {
  if (customUnsubGlobal) { try { customUnsubGlobal(); } catch {} customUnsubGlobal = null; }
  if (customUnsubRoom) { try { customUnsubRoom(); } catch {} customUnsubRoom = null; }
  globalCustom = [];
  roomCustom = [];
}

export function onCustomEmojisChanged(fn) {
  customListeners.add(fn);
  return () => customListeners.delete(fn);
}

function notifyCustomListeners() {
  for (const fn of customListeners) {
    try { fn(); } catch (e) { console.warn(e); }
  }
}

export function getGlobalCustom() { return globalCustom.slice(); }
export function getRoomCustom() { return roomCustom.slice(); }
export function getAllCustom() { return [...globalCustom, ...roomCustom]; }

export async function addCustomEmoji({ name, dataUrl, scope }) {
  if (!state.me) throw new Error("Not logged in");
  if (!name || !dataUrl) throw new Error("Missing name or image");
  if (dataUrl.length > 90 * 1024) throw new Error("Emoji too big (64 KB max)");

  const cleanName = name.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
  if (cleanName.length < 2) throw new Error("Name must be at least 2 chars (a-z, 0-9, _)");

  const path = scope === "global"
    ? "customEmojis"
    : `rooms/${state.roomCode}/customEmojis`;

  const newRef = push(ref(db, path));
  await set(newRef, {
    name: cleanName,
    dataUrl,
    uploadedBy: state.me.uid,
    scope,
    createdAt: Date.now()
  });
  return newRef.key;
}

export async function deleteCustomEmoji(id, scope) {
  if (!state.me) throw new Error("Not logged in");
  const path = scope === "global"
    ? `customEmojis/${id}`
    : `rooms/${state.roomCode}/customEmojis/${id}`;
  await remove(ref(db, path));
}


// :name: REPLACEMENT


// Replace :name: tokens with a marker that renderCustomAndText can consume.
// Returns { parts } where each part is either {type:"text", value} or
// {type:"custom", name, dataUrl}.
export function tokenizeCustomEmojis(plainText) {
  if (!plainText) return [{ type: "text", value: "" }];

  const all = getAllCustom();
  const byName = new Map(all.map(c => [c.name, c]));
  const parts = [];
  const re = /:([a-z0-9_]{2,24}):/gi;
  let last = 0, m;

  while ((m = re.exec(plainText)) !== null) {
    const name = m[1].toLowerCase();
    const found = byName.get(name);
    if (!found) continue; // leave literal :name: in place

    if (m.index > last) {
      parts.push({ type: "text", value: plainText.slice(last, m.index) });
    }
    parts.push({ type: "custom", name, dataUrl: found.dataUrl });
    last = re.lastIndex;
  }

  if (last < plainText.length) {
    parts.push({ type: "text", value: plainText.slice(last) });
  }

  return parts;
}

export function hasCustomEmojiTokens(plainText) {
  if (!plainText) return false;
  const all = getAllCustom();
  if (!all.length) return false;
  const names = new Set(all.map(c => c.name));
  const re = /:([a-z0-9_]{2,24}):/gi;
  let m;
  while ((m = re.exec(plainText)) !== null) {
    if (names.has(m[1].toLowerCase())) return true;
  }
  return false;
}
