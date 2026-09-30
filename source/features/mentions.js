// MENTIONS
// @ autocomplete for the room chat input.

import { $, on } from "../core/dom.js";
import { defaultPfp, fetchUser } from "../services/user-cache.js";
import { state } from "../core/state.js";

let inputEl = null;

export function initMentions(input) {
  inputEl = input;

  on(inputEl, "input", () => {
    const val = inputEl.value;
    const cursor = inputEl.selectionStart;
    const before = val.slice(0, cursor);
    const atIdx = before.lastIndexOf("@");

    if (atIdx >= 0 && (atIdx === 0 || /\s/.test(before[atIdx - 1]))) {
      const query = before.slice(atIdx + 1);
      if (/^[A-Za-z0-9_]*$/.test(query)) {
        showAutocomplete(query, atIdx + 1);
        return;
      }
    }
    hideAutocomplete();
  });

  on(inputEl, "keydown", handleKeys);
}

function isOpen() {
  return $("mentionAutocomplete") &&
    !$("mentionAutocomplete").classList.contains("hidden");
}

function handleKeys(e) {
  if (!isOpen()) {
    if (e.key === "@") {
      const cursor = inputEl.selectionStart;
      const before = inputEl.value.slice(0, cursor);
      const atIdx = before.lastIndexOf("@");
      if (atIdx >= 0 && (atIdx === 0 || /\s/.test(before[atIdx - 1]))) {
        setTimeout(() => showAutocomplete("", atIdx + 1), 0);
      }
    }
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    state.mentionIndex = Math.min(state.mentionIndex + 1, state.mentionList.length - 1);
    renderList();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    state.mentionIndex = Math.max(state.mentionIndex - 1, 0);
    renderList();
  } else if (e.key === "Enter" || e.key === "Tab") {
    // Enter/Tab while the popup is open inserts the mention, does NOT send.
    if (state.mentionIndex >= 0 && state.mentionList[state.mentionIndex]) {
      e.preventDefault();
      e.stopImmediatePropagation();
      insert(state.mentionList[state.mentionIndex]);
    }
  } else if (e.key === "Escape") {
    hideAutocomplete();
  }
}

async function showAutocomplete(query, startIdx) {
  const el = $("mentionAutocomplete");
  if (!el) return;

  const presentUids = [
    ...Object.keys(state.presenceData || {}),
    ...Object.keys(state.seenData || {})
  ];
  const uniqueUids = [...new Set(presentUids)].filter(u => u !== state.me.uid);

  const users = [];
  for (const uid of uniqueUids) {
    const p = await fetchUser(uid);
    if (!p) continue;
    if (query && !p.username.toLowerCase().startsWith(query.toLowerCase())) continue;
    users.push(p);
  }
  users.sort((a, b) => a.username.localeCompare(b.username));

  if (!users.length && query) {
    el.innerHTML = `<div class="ma-item" style="cursor:default;color:var(--text-dim);">no match</div>`;
    el.classList.remove("hidden");
    state.mentionList = [];
    state.mentionIndex = -1;
    return;
  }

  const everyoneEntry = { uid: "everyone", username: "everyone", pfp: null, isEveryone: true };
  state.mentionList = [everyoneEntry, ...users];
  state.mentionIndex = 0;
  state.mentionStart = startIdx;
  renderList();
  el.classList.remove("hidden");
}

function renderList() {
  const el = $("mentionAutocomplete");
  if (!el) return;
  el.innerHTML = "";

  state.mentionList.forEach((u, i) => {
    const item = document.createElement("div");
    item.className = "ma-item" + (i === state.mentionIndex ? " active" : "");

    if (u.isEveryone) {
      item.innerHTML = `<span style="font-weight:700;color:#ffb347;">@everyone</span><span class="ma-you">mention all</span>`;
    } else {
      const img = document.createElement("img");
      img.src = u.pfp || defaultPfp(u.username);
      item.appendChild(img);

      const nameSpan = document.createElement("span");
      nameSpan.textContent = "@" + u.username;
      if (u.nameColor) nameSpan.style.color = u.nameColor;
      item.appendChild(nameSpan);
    }

    item.addEventListener("click", () => insert(u));
    el.appendChild(item);
  });
}

function insert(user) {
  const val = inputEl.value;
  const cursor = inputEl.selectionStart;
  const before = val.slice(0, state.mentionStart);
  const after = val.slice(cursor);
  const insertText = "@" + user.username + " ";

  inputEl.value = before + insertText + after;
  const newCursor = before.length + insertText.length;
  inputEl.setSelectionRange(newCursor, newCursor);
  inputEl.focus();
  hideAutocomplete();
}

export function hideAutocomplete() {
  const el = $("mentionAutocomplete");
  if (!el) return;
  el.classList.add("hidden");
  el.innerHTML = "";
  state.mentionList = [];
  state.mentionIndex = -1;
  state.mentionStart = -1;
}

export function isMentionOpen() {
  return isOpen();
}