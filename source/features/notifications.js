// NOTIFICATIONS

import { ref, update, onValue, push } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import { $, on, esc } from "../core/dom.js";
import { fmtTime } from "../core/helpers.js";
import { t } from "../core/i18n.js";
import { state } from "../core/state.js";

let handlers = {
  onOpenDm: null,
  onJoinRoom: null,
  onJumpToMessage: null
};

export function initNotifications(hooks) {
  handlers = { ...handlers, ...hooks };

  on($("notifBtn"), "click", (e) => {
    e.stopPropagation();
    $("notifDropdown").classList.toggle("hidden");
  });

  on(document, "click", (e) => {
    const dd = $("notifDropdown");
    if (!dd) return;
    if (!dd.classList.contains("hidden") &&
        !dd.contains(e.target) &&
        !$("notifBtn").contains(e.target)) {
      dd.classList.add("hidden");
    }
  });

  on($("notifList"), "click", handleNotifClick);

  on($("markAllReadBtn"), "click", async () => {
    if (!state.me) return;
    const updates = {};
    for (const n of state.notifications) {
      if (!n.read) updates[`${n.id}/read`] = true;
    }
    if (Object.keys(updates).length) {
      try {
        await update(ref(db, `notifications/${state.me.uid}`), updates);
        window.__illoToast?.(`Marked ${Object.keys(updates).length} as read`);
      } catch {
        window.__illoToast?.("Could not mark read");
      }
    }
  });
}

export function startNotificationListener() {
  if (state.notifOff) state.notifOff();
  if (!state.me) return;

  state.notifOff = onValue(
    ref(db, `notifications/${state.me.uid}`),
    (snap) => {
      const data = snap.val() || {};
      state.notifications = Object.entries(data)
        .map(([id, n]) => ({ id, ...n }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      state.unread = state.notifications.filter(n => !n.read).length;
      renderNotifications();
    }
  );
}

export function stopNotificationListener() {
  if (state.notifOff) { state.notifOff(); state.notifOff = null; }
}

function renderNotifications() {
  const badge = $("notifBadge");
  const list = $("notifList");
  if (!badge || !list) return;

  if (state.unread > 0) {
    badge.textContent = state.unread > 99 ? "99+" : String(state.unread);
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }

  list.innerHTML = "";
  if (!state.notifications.length) {
    list.innerHTML = `<p class="notif-empty">${t("noNotifications")}</p>`;
    return;
  }

  const frag = document.createDocumentFragment();
  for (const n of state.notifications) {
    const item = document.createElement("div");
    item.className = "notif-item" + (n.read ? "" : " unread");
    item.dataset.notifId = n.id;
    item.innerHTML = `<div class="n-title">${esc(n.title || "")}</div>
      <div class="n-body">${esc(n.body || "")}</div>
      <div class="n-from">${fmtTime(n.timestamp)}</div>`;
    frag.appendChild(item);
  }
  list.appendChild(frag);
}

async function handleNotifClick(e) {
  const item = e.target.closest(".notif-item");
  if (!item || !state.me) return;

  const id = item.dataset.notifId;
  const n = state.notifications.find(x => x.id === id);
  if (!n) return;

  if (!n.read) {
    try { update(ref(db, `notifications/${state.me.uid}/${n.id}`), { read: true }); } catch {}
  }
  $("notifDropdown").classList.add("hidden");

  if (n.type === "dm" && n.fromUid && n.fromUid !== state.me.uid) {
    handlers.onOpenDm?.(n.fromUid);
    return;
  }

  if ((n.type === "mention" || n.type === "reply" || n.type === "everyone") && n.roomCode) {
    if (state.roomCode !== n.roomCode) {
      await handlers.onJoinRoom?.(n.roomCode);
    }
    if (n.msgId) {
      setTimeout(() => handlers.onJumpToMessage?.(n.msgId), 400);
    }
  }
}

export async function pushNotification(targetUid, payload) {
  if (!state.me || !targetUid || targetUid === state.me.uid || targetUid === "system") return;
  try {
    await push(ref(db, `notifications/${targetUid}`), {
      ...payload,
      read: false,
      timestamp: Date.now()
    });
  } catch {}
}