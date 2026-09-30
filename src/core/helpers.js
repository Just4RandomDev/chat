// HELPERS

import { URL_RE, IMG_EXT, VID_EXT, MEDIA_HOSTS, COLOR_VARS } from "./constants.js";

export const debounce = (fn, ms) => {
  let to;
  return (...a) => {
    clearTimeout(to);
    to = setTimeout(() => fn(...a), ms);
  };
};

export const fmtTime = ts => ts
  ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  : "";

export const classifyUrl = url => {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname;
    if (IMG_EXT.test(path)) return "image";
    if (VID_EXT.test(path)) return "video";
    if (MEDIA_HOSTS.has(host)) return VID_EXT.test(path) ? "video" : "image";
    return "link";
  } catch {
    return "link";
  }
};

export async function loadJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

export function generateVarsTemplate(appearance, getComputed) {
  const lines = [":root {"];
  for (const { key, label } of COLOR_VARS) {
    const v = appearance[key] || getComputed(`--${key}`).trim() || "#000000";
    lines.push(`  --${key}: ${v}; /* ${label} */`);
  }
  lines.push("}");
  return lines.join("\n");
}

export const extractMentions = text =>
  [...new Set([...text.matchAll(/@([A-Za-z0-9_]+)/g)].map(m => m[1].toLowerCase()))];

export const hasEveryone = text => /@everyone\b/i.test(text);