// EMOJI SERVICE
// All emoji logic: keywords, recents, favorites, skin tones, custom emojis.

import { ref, get, push, set, remove, onValue } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import { state } from "../core/state.js";
import { loadJson } from "../core/helpers.js";


// DATA


// Unicode emoji categories (from data/emojis.json)
let categories = [];

// keyword -> emoji string (from data/emoji-keywords.json)
let keywordMap = {};

// Skin tone variants.
// Index 0 = default (no modifier), 1..5 = the five Fitzpatrick modifiers.
// We map a base emoji to a function that produces the toned version.
const SKIN_TONES = ["", "\u{1F3FB}", "\u{1F3FC}", "\u{1F3FD}", "\u{1F3FE}", "\u{1F3FF}"];
const SKIN_TONE_LABELS = ["Default", "Light", "Medium-Light", "Medium", "Medium-Dark", "Dark"];

// Base emojis that support skin tones. Only the ones most people use.
// Mapping: base emoji -> the modifier gets appended right after it.
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

// Custom emojis (loaded per-context)
let globalCustom = [];        // [{ id, name, dataUrl, ... }]
let roomCustom = [];          // [{ id, name, dataUrl, ... }]
let customUnsubGlobal = null;
let customUnsubRoom = null;


// INIT


export async function initEmoji() {
  // Categories
  try {
    const data = await loadJson("data/emojis.json");
    categories = Array.isArray(data.categories) ? data.categories : [];
  } catch {
    categories = [];
  }

  // Keyword map
  try {
    keywordMap = await loadJson("data/emoji-keywords.json");
    if (!keywordMap || typeof keywordMap !== "object") keywordMap = {};
  } catch {
    keywordMap = {};
  }
}

export function getCategories() {
  return categories;
}


// RECENTS & FAVORITES (localStorage, per-browser)


const RECENTS_KEY = "emoji.recents";
const FAVORITES_KEY = "emoji.favorites";
const RECENTS_MAX = 24;

function readList(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(0, 200))); } catch {}
}

export function getRecents() {
  return readList(RECENTS_KEY);
}

export function pushRecent(emoji) {
  if (!emoji) return;
  const list = readList(RECENTS_KEY).filter(e => e !== emoji);
  list.unshift(emoji);
  writeList(RECENTS_KEY, list.slice(0, RECENTS_MAX));
}

export function getFavorites() {
  return readList(FAVORITES_KEY);
}

export function isFavorite(emoji) {
  return readList(FAVORITES_KEY).includes(emoji);
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


// SEARCH


const MAX_RESULTS = 60;

// Split a string of emojis into an array. Handles ZWJ sequences and
// variation selectors so we don't slice through the middle of a family.
export function splitEmojiString(s) {
  if (!s) return [];
  const result = [];
  const segmenter = ("Segmenter" in Intl)
    ? new Intl.Segmenter("en", { granularity: "grapheme" })
    : null;

  if (segmenter) {
    for (const { segment } of segmenter.segment(s)) {
      if (segment && segment.trim()) result.push(segment);
    }
  } else {
    // Fallback: naive split (works for the vast majority).
    for (const ch of Array.from(s)) {
      if (ch && ch.trim()) result.push(ch);
    }
  }
  return result;
}

// Search by keyword. Returns a deduped, ordered array of emoji strings.
export function searchEmoji(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];

  // Normalize: strip spaces so "ice cream" becomes "icecream".
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

  // 1. Exact key match first.
  if (keywordMap[normalized]) {
    if (addAll(keywordMap[normalized])) return out;
  }

  // 2. Prefix matches on keys.
  const prefixKeys = Object.keys(keywordMap)
    .filter(k => k !== normalized && k.startsWith(normalized))
    .sort((a, b) => a.length - b.length);

  for (const k of prefixKeys) {
    if (addAll(keywordMap[k])) return out;
  }

  // 3. Substring matches on keys (weaker signal, added last).
  const substringKeys = Object.keys(keywordMap)
    .filter(k => k !== normalized && !k.startsWith(normalized) && k.includes(normalized))
    .sort((a, b) => a.length - b.length);

  for (const k of substringKeys) {
    if (addAll(keywordMap[k])) return out;
  }

  // 4. Custom emojis whose name matches.
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


export function supportsSkinTone(emoji) {
  return TONE_CAPABLE.has(emoji);
}

export function applySkinTone(emoji, toneIndex) {
  if (toneIndex <= 0) return emoji;
  const modifier = SKIN_TONES[toneIndex];
  if (!modifier) return emoji;

  // If emoji already has a tone applied, strip it first.
  let base = emoji;
  for (const t of SKIN_TONES.slice(1)) {
    base = base.split(t).join("");
  }

  // Insert modifier right after the base (before any ZWJ/variation selector).
  return base + modifier;
}

export function getSkinToneLabels() {
  return SKIN_TONE_LABELS;
}

export function getSkinToneCount() {
  return SKIN_TONES.length;
}


// CUSTOM EMOJIS (global + per-room)


export function startCustomEmojiListeners(roomCode) {
  stopCustomEmojiListeners();

  // Global
  const globalRef = ref(db, "customEmojis");
  customUnsubGlobal = onValue(globalRef, (snap) => {
    const data = snap.val() || {};
    globalCustom = Object.entries(data).map(([id, v]) => ({ id, ...v }));
  });

  // Per-room (if any)
  if (roomCode) {
    const roomRef = ref(db, `rooms/${roomCode}/customEmojis`);
    customUnsubRoom = onValue(roomRef, (snap) => {
      const data = snap.val() || {};
      roomCustom = Object.entries(data).map(([id, v]) => ({ id, ...v }));
    });
  }
}

export function stopCustomEmojiListeners() {
  if (customUnsubGlobal) { try { customUnsubGlobal(); } catch {} customUnsubGlobal = null; }
  if (customUnsubRoom) { try { customUnsubRoom(); } catch {} customUnsubRoom = null; }
  globalCustom = [];
  roomCustom = [];
}

export function getGlobalCustom() { return globalCustom.slice(); }
export function getRoomCustom() { return roomCustom.slice(); }
export function getAllCustom() { return [...globalCustom, ...roomCustom]; }

// scope: "global" | "room"
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

// Replace :name: tokens in a plaintext message with placeholder markers.
// Returns { text, customImages } where customImages maps name -> dataUrl.
export function extractCustomEmojiTokens(plainText) {
  const map = new Map();
  const all = getAllCustom();

  const replaced = plainText.replace(/:([a-z0-9_]{2,24}):/gi, (match, name) => {
    const lower = name.toLowerCase();
    const found = all.find(c => c.name === lower);
    if (!found) return match;
    map.set(lower, found.dataUrl);
    return `\u0000CUSTOM:${lower}\u0000`;
  });

  return { text: replaced, customImages: map };
}

// Given a text with \u0000CUSTOM:name\u0000 markers and a map of name->dataUrl,
// return an array of nodes/text tokens ready to append to the DOM.
export function renderCustomEmojiTokens(text, customImages) {
  const parts = [];
  const re = /\u0000CUSTOM:([a-z0-9_]{2,24})\u0000/gi;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    const name = m[1].toLowerCase();
    const url = customImages.get(name);
    if (url) parts.push({ type: "custom", name, url });
    else parts.push({ type: "text", value: m[0] });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}


// FALLBACK — name search across categories


// If the keyword map fails to load, we fall back to matching the
// query against... nothing useful (categories have no names per-emoji).
// But at least we return an empty array cleanly.
export function hasKeywordMap() {
  return Object.keys(keywordMap).length > 0;
}
