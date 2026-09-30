// DOM HELPERS

import { ICON_PATHS } from "./constants.js";

export const $ = id => document.getElementById(id);

export const on = (element, event, handler) => {
  if (element && typeof element.addEventListener === "function") {
    element.addEventListener(event, handler);
  }
};

export const esc = s => String(s).replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

export function applyIconMask(element, key) {
  if (!element || !ICON_PATHS[key]) return;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='black' d='${ICON_PATHS[key]}'/></svg>`;
  const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  element.style.webkitMaskImage = url;
  element.style.maskImage = url;
}
