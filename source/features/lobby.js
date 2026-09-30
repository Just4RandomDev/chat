// LOBBY
// Renders the room grid from the `rooms` node.

import { ref, onValue } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import { $, esc } from "../core/dom.js";
import { applyIconMask } from "../core/dom.js";
import { debounce } from "../core/helpers.js";
import { PUBLIC_ROOM } from "../core/constants.js";
import { state } from "../core/state.js";
import { getPresenceCount } from "../services/presence.js";

let onJoin = null;

export function initLobby(hooks) {
  onJoin = hooks?.onJoin || null;

  $("roomGrid")?.addEventListener("click", (e) => {
    const card = e.target.closest(".room-card");
    if (card?.dataset.code) onJoin?.(card.dataset.code);
  });
}

export function startLobbyListener() {
  if (state.lobbyOff) state.lobbyOff();
  state.lobbyOff = onValue(
    ref(db, "rooms"),
    (snap) => scheduleRender(snap.val() || {}),
    () => {
      const grid = $("roomGrid");
      if (grid) grid.innerHTML = '<p class="lobby-empty">Could not load rooms.</p>';
    }
  );
}

export function stopLobbyListener() {
  if (state.lobbyOff) { state.lobbyOff(); state.lobbyOff = null; }
}

const scheduleRender = debounce(async (rooms) => {
  const token = ++state.lobbyToken;
  const codes = Object.keys(rooms);
  const grid = $("roomGrid");
  if (!grid) return;

  if (!codes.length) {
    grid.innerHTML = '<p class="lobby-empty">No rooms yet. Create one.</p>';
    state.roomCards.clear();
    return;
  }

  grid.querySelector(".lobby-empty")?.remove();

  const counts = {};
  await Promise.all(codes.map(async (c) => { counts[c] = await getPresenceCount(c); }));
  if (token !== state.lobbyToken) return;

  codes.sort((a, b) => {
    const aPinned = a === PUBLIC_ROOM || rooms[a].pinned;
    const bPinned = b === PUBLIC_ROOM || rooms[b].pinned;
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return (rooms[a].name || a).toLowerCase().localeCompare((rooms[b].name || b).toLowerCase());
  });

  const present = new Set(codes);

  for (const code of codes) {
    const r = rooms[code] || {};
    let card = state.roomCards.get(code);
    if (!card) {
      card = document.createElement("div");
      card.className = "room-card";
      card.dataset.code = code;
      state.roomCards.set(code, card);
      grid.appendChild(card);
    }

    const max = r.maxUsers || 50;
    const iconParts = [];
    if (r.hasPassword) iconParts.push(`<span class="icon-img" data-icon="lock"></span>`);
    if (r.isPublic || code === PUBLIC_ROOM) iconParts.push(`<span class="icon-img" data-icon="globe"></span>`);
    if (r.forever) iconParts.push(`<span class="icon-img" data-icon="crown"></span>`);

    card.classList.toggle("pinned", code === PUBLIC_ROOM || !!r.pinned);
    card.innerHTML = `
      <div class="rc-name">${esc(r.name || code)}</div>
      <div class="rc-code">${esc(code)}</div>
      <div class="rc-meta">
        <span>${counts[code]} / ${max}</span>
        <div class="rc-icons">${iconParts.join("")}</div>
      </div>`;

    card.querySelectorAll("[data-icon]").forEach(x => applyIconMask(x, x.dataset.icon));
  }

  for (const [code, node] of state.roomCards) {
    if (!present.has(code)) {
      node.remove();
      state.roomCards.delete(code);
    }
  }
  for (const code of codes) {
    const card = state.roomCards.get(code);
    if (card) grid.appendChild(card);
  }
}, 60);