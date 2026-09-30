// ADMIN PANEL UI

import { ref, get, query, limitToLast } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import { $, on, esc } from "../core/dom.js";
import { debounce, fmtTime } from "../core/helpers.js";
import { hashPassword } from "../core/crypto.js";
import { state, resetRoomState } from "../core/state.js";
import { fetchUser, defaultPfp } from "../services/user-cache.js";
import {
  canModerate, canKick, canEditRoom, isRoomOwner,
  adminKick, adminUnkick, adminWipeMessages,
  adminUpdateRoom, adminDeleteRoom, listKicked, listMembers
} from "./moderation.js";

let onLeaveRoom = null;
let resetChatUI = null;
let onRoomDeleted = null;

export function initAdminUI(hooks) {
  onLeaveRoom = hooks?.onLeaveRoom || null;
  resetChatUI = hooks?.resetChatUI || null;
  onRoomDeleted = hooks?.onRoomDeleted || null;

  on($("adminFab"), "click", openDrawer);
  on($("adminDrawerClose"), "click", closeDrawer);
  on($("adminBackdrop"), "click", closeDrawer);

  document.querySelectorAll("[data-admin-tab]").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("[data-admin-tab]").forEach(x => x.classList.remove("active"));
      tab.classList.add("active");

      const map = {
        overview: "adminPaneOverview",
        members: "adminPaneMembers",
        mod: "adminPaneMod",
        room: "adminPaneRoom",
        danger: "adminPaneDanger"
      };

      for (const [k, id] of Object.entries(map)) {
        $(id)?.classList.toggle("hidden", k !== tab.dataset.adminTab);
      }

      if (tab.dataset.adminTab === "members") refreshMembers();
      if (tab.dataset.adminTab === "mod") refreshKicked();
      if (tab.dataset.adminTab === "room") populateRoomFields();
    });
  });

  on($("adminMemberSearch"), "input", debounce(refreshMembers, 150));
  on($("adminRoomSave"), "click", handleSaveRoom);
  on($("adminRoomReset"), "click", () => { populateRoomFields(); adminToast("Fields reset"); });
  on($("adminWipeMessages"), "click", handleWipeMessages);
  on($("adminDeleteRoom"), "click", handleDeleteRoom);
}

export function updateAdminUI() {
  const a = canModerate();
  $("adminBadge")?.classList.toggle("hidden", !a);
  $("adminFab")?.classList.toggle("hidden", !a);
}

function openDrawer() {
  if (!canModerate()) return;
  const drawer = $("adminDrawer");
  const backdrop = $("adminBackdrop");
  drawer.classList.remove("hidden");
  backdrop.classList.remove("hidden");
  requestAnimationFrame(() => {
    drawer.classList.add("open");
    backdrop.classList.add("show");
  });

  const roleBadge = $("adminRoleBadge");
  if (roleBadge) {
    roleBadge.textContent = isRoomOwner() ? "OWNER" : "GLOBAL";
    roleBadge.classList.toggle("global", !isRoomOwner());
  }

  refreshOverview();
  refreshMembers();
  refreshKicked();
  populateRoomFields();
}

function closeDrawer() {
  const drawer = $("adminDrawer");
  const backdrop = $("adminBackdrop");
  drawer.classList.remove("open");
  backdrop.classList.remove("show");
  setTimeout(() => {
    drawer.classList.add("hidden");
    backdrop.classList.add("hidden");
  }, 220);
}

function adminToast(msg, isError) {
  const el = $("adminToast");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "var(--danger)" : "var(--accent)";
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 2000);
}

async function refreshOverview() {
  if (!state.roomCode) return;

  try {
    const online = Object.keys(state.presenceData || {}).length;
    const kickedSnap = await get(ref(db, `rooms/${state.roomCode}/kicked`));
    const kickedCount = Object.keys(kickedSnap.val() || {}).length;

    let msgCount = 0;
    try {
      const m = await get(query(ref(db, `chats/${state.roomCode}/messages`), limitToLast(200)));
      msgCount = Object.keys(m.val() || {}).length;
    } catch {}

    $("adminStatOnline").textContent = online;
    $("adminStatKicked").textContent = kickedCount;
    $("adminStatCapacity").textContent = `${online}/${state.roomMeta?.maxUsers || 50}`;
    $("adminStatMessages").textContent = msgCount;
    $("adminInfoCode").textContent = state.roomCode;
    $("adminInfoOwner").textContent = (state.roomMeta?.adminUid || "—").slice(0, 12);
    $("adminInfoType").textContent = state.roomMeta?.isPublic ? "Public" : "Private";

    const flags = [];
    if (state.roomMeta?.pinned) flags.push("PINNED");
    if (state.roomMeta?.forever) flags.push("FOREVER");
    if (state.roomMeta?.hasPassword) flags.push("LOCKED");
    $("adminInfoFlags").textContent = flags.length ? flags.join(" · ") : "—";
  } catch (e) {
    console.warn(e);
  }
}

async function refreshMembers() {
  const list = $("adminMemberList");
  if (!list) return;
  list.innerHTML = '<div class="admin-row"><span class="admin-row-sub">Loading…</span></div>';

  try {
    const members = await listMembers();
    const q = ($("adminMemberSearch")?.value || "").toLowerCase();
    const filtered = q
      ? members.filter(m => (m.profile.username || "").toLowerCase().includes(q))
      : members;

    if (!filtered.length) {
      list.innerHTML = '<div class="admin-row"><span class="admin-row-sub">No members found.</span></div>';
      return;
    }

    list.innerHTML = "";
    for (const m of filtered) {
      const row = document.createElement("div");
      row.className = "admin-row";

      const img = document.createElement("img");
      img.src = m.profile.pfp || defaultPfp(m.profile.username);
      img.alt = "";
      row.appendChild(img);

      const meta = document.createElement("div");
      meta.className = "admin-row-meta";

      const name = document.createElement("div");
      name.className = "admin-row-name";
      name.textContent = m.profile.username || "user";
      if (m.profile.nameColor) name.style.color = m.profile.nameColor;
      meta.appendChild(name);

      const sub = document.createElement("div");
      sub.className = "admin-row-sub";
      sub.textContent = m.online ? "online" : "last seen " + fmtTime(m.lastSeen);
      meta.appendChild(sub);

      row.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "admin-row-actions";

      const kickBtn = document.createElement("button");
      kickBtn.className = "admin-btn danger";
      kickBtn.textContent = "Kick";
      if (m.uid === state.me.uid || !canKick()) {
        kickBtn.disabled = true;
      } else {
        kickBtn.addEventListener("click", async () => {
          if (!confirm("Kick " + m.profile.username + "?")) return;
          try {
            await adminKick(m.uid);
            adminToast("Kicked " + m.profile.username);
            refreshMembers();
            refreshKicked();
          } catch (e) {
            adminToast(e.message || "Kick failed", true);
          }
        });
      }
      actions.appendChild(kickBtn);
      row.appendChild(actions);
      list.appendChild(row);
    }
  } catch (e) {
    list.innerHTML = '<div class="admin-row"><span class="admin-row-sub">' + esc(e.message) + '</span></div>';
  }
}

async function refreshKicked() {
  const list = $("adminKickedList");
  if (!list) return;
  list.innerHTML = '<div class="admin-row"><span class="admin-row-sub">Loading…</span></div>';

  try {
    const kicked = await listKicked();
    if (!kicked.length) {
      list.innerHTML = '<div class="admin-row"><span class="admin-row-sub">Nobody is kicked.</span></div>';
      return;
    }

    list.innerHTML = "";
    for (const k of kicked) {
      const row = document.createElement("div");
      row.className = "admin-row";

      const img = document.createElement("img");
      img.src = k.profile.pfp || defaultPfp(k.profile.username);
      img.alt = "";
      row.appendChild(img);

      const meta = document.createElement("div");
      meta.className = "admin-row-meta";
      const name = document.createElement("div");
      name.className = "admin-row-name";
      name.textContent = k.profile.username || "user";
      meta.appendChild(name);

      const sub = document.createElement("div");
      sub.className = "admin-row-sub";
      sub.textContent = k.uid.slice(0, 12);
      meta.appendChild(sub);
      row.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "admin-row-actions";

      const unkick = document.createElement("button");
      unkick.className = "admin-btn";
      unkick.textContent = "Un-kick";
      unkick.addEventListener("click", async () => {
        try {
          await adminUnkick(k.uid);
          adminToast("Un-kicked " + k.profile.username);
          refreshKicked();
          refreshMembers();
        } catch (e) {
          adminToast(e.message || "Un-kick failed", true);
        }
      });
      actions.appendChild(unkick);
      row.appendChild(actions);
      list.appendChild(row);
    }
  } catch (e) {
    list.innerHTML = '<div class="admin-row"><span class="admin-row-sub">' + esc(e.message) + '</span></div>';
  }
}

function populateRoomFields() {
  const meta = state.roomMeta;
  if (!meta) return;

  if ($("adminRoomName")) $("adminRoomName").value = meta.name || "";
  if ($("adminRoomMax")) $("adminRoomMax").value = meta.maxUsers || 50;
  if ($("adminRoomPassword")) $("adminRoomPassword").value = "";
  if ($("adminRoomRemovePass")) $("adminRoomRemovePass").checked = false;
  if ($("adminRoomPinned")) $("adminRoomPinned").checked = !!meta.pinned;
  if ($("adminRoomForever")) $("adminRoomForever").checked = !!meta.forever;
}

async function handleSaveRoom() {
  try {
    const patch = {
      name: $("adminRoomName")?.value || "",
      maxUsers: parseInt($("adminRoomMax")?.value, 10) || 50,
      pinned: $("adminRoomPinned")?.checked || false,
      forever: $("adminRoomForever")?.checked || false
    };

    const newPw = $("adminRoomPassword")?.value;
    const removePw = $("adminRoomRemovePass")?.checked;

    if (removePw) patch.removePassword = true;
    else if (newPw) patch.passwordHash = hashPassword(newPw);

    await adminUpdateRoom(patch);

    const fresh = await get(ref(db, `rooms/${state.roomCode}`));
    state.roomMeta = fresh.val();

    $("chatHeadTitle").textContent = "# " + (state.roomMeta.name || state.roomCode);
    $("chatHeadLock").classList.toggle("hidden", !state.roomMeta.hasPassword);
    $("chatHeadForever").classList.toggle("hidden", !state.roomMeta.forever);
    $("capacityLabel").textContent = "/ " + (state.roomMeta.maxUsers || 50);

    adminToast("Room saved");
    refreshOverview();
    populateRoomFields();
  } catch (e) {
    adminToast(e.message || "Save failed", true);
  }
}

async function handleWipeMessages() {
  if (!confirm("Wipe all messages in this room? This cannot be undone.")) return;
  try {
    await adminWipeMessages();
    resetChatUI?.();
    adminToast("Messages wiped");
    refreshOverview();
  } catch (e) {
    adminToast(e.message || "Wipe failed", true);
  }
}

async function handleDeleteRoom() {
  if (!confirm("Delete this room permanently? This cannot be undone.")) return;
  try {
    const code = state.roomCode;
    await onLeaveRoom?.();
    resetChatUI?.();
    await adminDeleteRoom();
    onRoomDeleted?.(code);
    adminToast("Room deleted");
    closeDrawer();
  } catch (e) {
    adminToast(e.message || "Delete failed", true);
  }
}