// ADMIN PANEL UI

import { ref, get, query, limitToLast } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import { $, on, esc } from "../core/dom.js";
import { debounce, fmtTime } from "../core/helpers.js";
import { hashPassword } from "../core/crypto.js";
import { state } from "../core/state.js";
import { fetchUser, defaultPfp } from "../services/user-cache.js";
import {
  canModerate, canKick, isRoomOwner,
  adminKick, adminUnkick, adminWipeMessages,
  adminUpdateRoom, adminDeleteRoom, listKicked, listMembers
} from "./moderation.js";
import * as RolesService from "../services/roles.js";

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
        roles: "adminPaneRoles",
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
      if (tab.dataset.adminTab === "roles") refreshRoles();
    });
  });

  on($("adminMemberSearch"), "input", debounce(refreshMembers, 150));
  on($("adminRoomSave"), "click", handleSaveRoom);
  on($("adminRoomReset"), "click", () => { populateRoomFields(); adminToast("Fields reset"); });
  on($("adminWipeMessages"), "click", handleWipeMessages);
  on($("adminDeleteRoom"), "click", handleDeleteRoom);

  on($("roleEditorSaveBtn"), "click", handleSaveRole);
  on($("roleEditorCancelBtn"), "click", () => $("roleEditorModal").classList.add("hidden"));
  on($("roleEditorDeleteBtn"), "click", handleDeleteRole);
  on($("roleColorInput"), "input", () => {
    $("roleColorHex").value = $("roleColorInput").value;
  });
  on($("roleColorHex"), "change", () => {
    let v = ($("roleColorHex").value || "").trim();
    if (!v.startsWith("#")) v = "#" + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      $("roleColorInput").value = v.toLowerCase();
      $("roleColorHex").value = v.toLowerCase();
    } else {
      $("roleColorHex").value = $("roleColorInput").value;
    }
  });

  on($("adminCreateRoomRoleBtn"), "click", () => openRoleEditor("room", null));
  on($("adminCreateGlobalRoleBtn"), "click", () => openRoleEditor("global", null));

  window.__illoRefreshRoles = refreshRoles;
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
  refreshRoles();
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

let editingRole = null;

function refreshRoles() {
  renderRoleList("adminRoomRoleList", RolesService.getRoomRoles(), "room");
  renderRoleList("adminGlobalRoleList", RolesService.getGlobalRoles(), "global");

  const canGlobal = RolesService.canManageRoles("global");
  const canRoom = RolesService.canManageRoles("room");

  $("adminGlobalRolesActions")?.classList.toggle("hidden", !canGlobal);
  $("adminCreateRoomRoleBtn")?.classList.toggle("hidden", !canRoom);
  $("adminRoomRolesHint").textContent = canRoom
    ? "Manage roles for this room."
    : "Only the room owner or a global admin can manage room roles.";
}

function renderRoleList(containerId, roles, scope) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = "";

  if (!roles.length) {
    const p = document.createElement("div");
    p.className = "admin-role-empty";
    p.textContent = scope === "global"
      ? "No global roles yet. Create one to assign site-wide."
      : "No roles yet.";
    container.appendChild(p);
    return;
  }

  const canManage = RolesService.canManageRoles(scope);

  for (const role of roles) {
    const card = document.createElement("div");
    card.className = "admin-role-card";

    const swatch = document.createElement("div");
    swatch.className = "admin-role-swatch";
    swatch.style.background = role.color || "#6fc77f";
    card.appendChild(swatch);

    const meta = document.createElement("div");
    meta.className = "admin-role-meta";

    const name = document.createElement("div");
    name.className = "admin-role-name";
    name.textContent = role.name || role.id;
    if (role.isDefault) {
      const tag = document.createElement("span");
      tag.className = "admin-role-default-tag";
      tag.textContent = "default";
      name.appendChild(tag);
    }
    meta.appendChild(name);

    const permsRow = document.createElement("div");
    permsRow.className = "admin-role-perms";
    const permLabels = {
      kick: "kick",
      wipe: "wipe",
      editRoom: "edit",
      deleteRoom: "delete",
      manageRoles: "roles"
    };
    for (const [k, label] of Object.entries(permLabels)) {
      const pill = document.createElement("span");
      pill.className = "admin-role-perm-pill" + (role.permissions?.[k] ? " on" : "");
      pill.textContent = label;
      permsRow.appendChild(pill);
    }
    meta.appendChild(permsRow);
    card.appendChild(meta);

    const orderTag = document.createElement("div");
    orderTag.className = "admin-role-order-tag";
    orderTag.textContent = "#" + (role.order ?? 0);
    card.appendChild(orderTag);

    const actions = document.createElement("div");
    actions.className = "admin-role-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "admin-btn";
    editBtn.textContent = "Edit";
    if (!canManage) {
      editBtn.disabled = true;
    } else {
      editBtn.addEventListener("click", () => openRoleEditor(scope, role.id));
    }
    actions.appendChild(editBtn);
    card.appendChild(actions);

    container.appendChild(card);
  }
}

function openRoleEditor(scope, roleId) {
  editingRole = { scope, roleId, isNew: !roleId };

  const isNew = !roleId;
  const role = isNew ? null : (scope === "global"
    ? RolesService.getGlobalRole(roleId)
    : RolesService.getRoomRole(roleId));

  if (!isNew && !role) {
    adminToast("Role not found", true);
    return;
  }

  const title = $("roleEditorTitle");
  const sub = $("roleEditorSubtitle");
  const nameInput = $("roleNameInput");
  const colorInput = $("roleColorInput");
  const colorHex = $("roleColorHex");
  const orderInput = $("roleOrderInput");
  const deleteBtn = $("roleEditorDeleteBtn");
  const errorEl = $("roleEditorError");

  errorEl.textContent = "";

  if (isNew) {
    title.textContent = scope === "global" ? "New Global Role" : "New Room Role";
    sub.textContent = "Give it a name, a color, and pick its permissions.";
    nameInput.value = "";
    colorInput.value = "#6fc77f";
    colorHex.value = "#6fc77f";
    orderInput.value = "10";
    $("rolePermKick").checked = false;
    $("rolePermWipe").checked = false;
    $("rolePermEditRoom").checked = false;
    $("rolePermDeleteRoom").checked = false;
    $("rolePermManageRoles").checked = false;
    deleteBtn.classList.add("hidden");
  } else {
    title.textContent = "Edit Role";
    sub.textContent = "Changes apply immediately.";
    nameInput.value = role.name || "";
    const c = role.color || "#6fc77f";
    colorInput.value = c;
    colorHex.value = c;
    orderInput.value = String(role.order ?? 0);
    $("rolePermKick").checked = !!role.permissions?.kick;
    $("rolePermWipe").checked = !!role.permissions?.wipe;
    $("rolePermEditRoom").checked = !!role.permissions?.editRoom;
    $("rolePermDeleteRoom").checked = !!role.permissions?.deleteRoom;
    $("rolePermManageRoles").checked = !!role.permissions?.manageRoles;
    deleteBtn.classList.toggle("hidden", !!role.isDefault);
  }

  $("roleEditorModal").classList.remove("hidden");
}

async function handleSaveRole() {
  if (!editingRole) return;
  $("roleEditorError").textContent = "";

  const payload = {
    name: $("roleNameInput").value.trim(),
    color: $("roleColorInput").value,
    permissions: {
      kick: $("rolePermKick").checked,
      wipe: $("rolePermWipe").checked,
      editRoom: $("rolePermEditRoom").checked,
      deleteRoom: $("rolePermDeleteRoom").checked,
      manageRoles: $("rolePermManageRoles").checked
    }
  };

  if (!payload.name || payload.name.length < 2) {
    $("roleEditorError").textContent = "Name must be at least 2 chars";
    return;
  }

  try {
    if (editingRole.isNew) {
      await RolesService.createRole(editingRole.scope, payload);
      adminToast("Role created");
    } else {
      await RolesService.updateRole(editingRole.scope, editingRole.roleId, payload);
      adminToast("Role saved");
    }
    $("roleEditorModal").classList.add("hidden");
    refreshRoles();
  } catch (e) {
    $("roleEditorError").textContent = e.message || "Could not save role";
  }
}

async function handleDeleteRole() {
  if (!editingRole || editingRole.isNew) return;
  if (!confirm("Delete this role? Users with it will lose it.")) return;

  try {
    await RolesService.deleteRole(editingRole.scope, editingRole.roleId);
    adminToast("Role deleted");
    $("roleEditorModal").classList.add("hidden");
    refreshRoles();
  } catch (e) {
    $("roleEditorError").textContent = e.message || "Could not delete role";
  }
}
