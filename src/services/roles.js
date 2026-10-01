// ROLES SERVICE
// Role CRUD, permission resolution, caching.
// Two scopes: global (admins.json) + per-room (room owner).

import { ref, get, set, update, remove, onValue } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import { state } from "../core/state.js";

export const DEFAULT_ROLES = [
  {
    id: "owner",
    name: "Owner",
    color: "#d94a4a",
    order: 0,
    isDefault: true,
    permissions: { kick: true, wipe: true, editRoom: true, deleteRoom: true, manageRoles: true }
  },
  {
    id: "admin",
    name: "Admin",
    color: "#ff5a5a",
    order: 1,
    isDefault: true,
    permissions: { kick: true, wipe: true, editRoom: true, deleteRoom: false, manageRoles: false }
  },
  {
    id: "moderator",
    name: "Moderator",
    color: "#6fa8ff",
    order: 2,
    isDefault: true,
    permissions: { kick: true, wipe: false, editRoom: false, deleteRoom: false, manageRoles: false }
  },
  {
    id: "member",
    name: "Member",
    color: "#6fc77f",
    order: 3,
    isDefault: true,
    permissions: { kick: false, wipe: false, editRoom: false, deleteRoom: false, manageRoles: false }
  }
];

export const EMPTY_PERMISSIONS = {
  kick: false,
  wipe: false,
  editRoom: false,
  deleteRoom: false,
  manageRoles: false
};

let globalRoles = [];
let globalAssignments = {};
let roomRoles = [];
let roomAssignments = {};
let currentRoomCode = null;

let unsubGlobalRoles = null;
let unsubGlobalAssignments = null;
let unsubRoomRoles = null;
let unsubRoomAssignments = null;

let listeners = new Set();

// INIT

export async function initRoles(me) {
  if (!me) return;
  await seedGlobalRolesIfEmpty();
  startGlobalListeners();
}

async function seedGlobalRolesIfEmpty() {
  try {
    const snap = await get(ref(db, "globalRoles"));
    if (!snap.exists()) {
      const payload = {};
      for (const r of DEFAULT_ROLES) payload[r.id] = r;
      await set(ref(db, "globalRoles"), payload);
    }
  } catch (e) {
    console.warn("[roles] seed global failed", e);
  }
}

export async function seedRoomRolesIfEmpty(roomCode) {
  if (!roomCode) return;
  try {
    const snap = await get(ref(db, `rooms/${roomCode}/roles`));
    if (!snap.exists()) {
      const payload = {};
      for (const r of DEFAULT_ROLES) payload[r.id] = r;
      await set(ref(db, `rooms/${roomCode}/roles`), payload);
    }
  } catch (e) {
    console.warn("[roles] seed room failed", e);
  }
}

// LISTENERS

function startGlobalListeners() {
  stopGlobalListeners();

  unsubGlobalRoles = onValue(ref(db, "globalRoles"), (snap) => {
    const data = snap.val() || {};
    globalRoles = Object.entries(data)
      .map(([id, r]) => ({ id, ...r }))
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    notify();
  });

  unsubGlobalAssignments = onValue(ref(db, "userRoles"), (snap) => {
    globalAssignments = snap.val() || {};
    notify();
  });
}

export function stopGlobalListeners() {
  if (unsubGlobalRoles) { try { unsubGlobalRoles(); } catch {} unsubGlobalRoles = null; }
  if (unsubGlobalAssignments) { try { unsubGlobalAssignments(); } catch {} unsubGlobalAssignments = null; }
}

export function startRoomListeners(roomCode) {
  stopRoomListeners();
  currentRoomCode = roomCode;
  if (!roomCode) return;

  seedRoomRolesIfEmpty(roomCode);

  unsubRoomRoles = onValue(ref(db, `rooms/${roomCode}/roles`), (snap) => {
    const data = snap.val() || {};
    roomRoles = Object.entries(data)
      .map(([id, r]) => ({ id, ...r }))
      .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    notify();
  });

  unsubRoomAssignments = onValue(ref(db, `rooms/${roomCode}/userRoles`), (snap) => {
    roomAssignments = snap.val() || {};
    notify();
  });
}

export function stopRoomListeners() {
  if (unsubRoomRoles) { try { unsubRoomRoles(); } catch {} unsubRoomRoles = null; }
  if (unsubRoomAssignments) { try { unsubRoomAssignments(); } catch {} unsubRoomAssignments = null; }
  roomRoles = [];
  roomAssignments = {};
  currentRoomCode = null;
}

export function onRolesChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) {
    try { fn(); } catch (e) { console.warn(e); }
  }
}

// ACCESSORS

export function getGlobalRoles() { return globalRoles.slice(); }
export function getRoomRoles() { return roomRoles.slice(); }
export function getGlobalAssignment(uid) { return globalAssignments[uid] || null; }
export function getRoomAssignment(uid) { return roomAssignments[uid] || null; }

export function getGlobalRole(roleId) {
  return globalRoles.find(r => r.id === roleId) || null;
}

export function getRoomRole(roleId) {
  return roomRoles.find(r => r.id === roleId) || null;
}

// PERMISSION RESOLUTION

export function resolvePermissions(uid, roomCode, roomMeta) {
  if (!uid) return { ...EMPTY_PERMISSIONS };

  // 0. Global admin (admins.json)
  if (state.admins.includes(uid)) {
    const ownerRole = globalRoles.find(r => r.id === "owner") ||
                       roomRoles.find(r => r.id === "owner") ||
                       DEFAULT_ROLES[0];
    return { ...ownerRole.permissions };
  }

  // 1. Room owner
  if (roomMeta && roomMeta.adminUid === uid) {
    const ownerRole = roomRoles.find(r => r.id === "owner") ||
                       globalRoles.find(r => r.id === "owner") ||
                       DEFAULT_ROLES[0];
    return { ...ownerRole.permissions };
  }

  // 2. Global owner assignment
  const globalRoleId = globalAssignments[uid];
  if (globalRoleId === "owner") {
    const role = globalRoles.find(r => r.id === "owner") || DEFAULT_ROLES[0];
    return { ...role.permissions };
  }

  // 3. Room assignment
  const roomRoleId = roomAssignments[uid];
  if (roomRoleId) {
    const role = roomRoles.find(r => r.id === roomRoleId);
    if (role) return { ...role.permissions };
  }

  // 4. Global assignment
  if (globalRoleId) {
    const role = globalRoles.find(r => r.id === globalRoleId);
    if (role) return { ...role.permissions };
  }

  // 5. Fallback
  return { ...EMPTY_PERMISSIONS };
}

export function getMyPermissions() {
  if (!state.me) return { ...EMPTY_PERMISSIONS };
  return resolvePermissions(state.me.uid, state.roomCode, state.roomMeta);
}

export function hasPermission(perm) {
  const p = getMyPermissions();
  return !!p[perm];
}

// ROLE CRUD

export async function createRole(scope, { name, color, permissions }) {
  if (!state.me) throw new Error("Not logged in");
  if (!canManageRoles(scope)) throw new Error("No permission to manage roles");

  const trimmed = (name || "").trim().slice(0, 24);
  if (trimmed.length < 2) throw new Error("Name must be at least 2 chars");

  const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : "#6fc77f";
  const safePerms = {
    kick: !!permissions?.kick,
    wipe: !!permissions?.wipe,
    editRoom: !!permissions?.editRoom,
    deleteRoom: !!permissions?.deleteRoom,
    manageRoles: !!permissions?.manageRoles
  };

  const list = scope === "global" ? globalRoles : roomRoles;
  const nextOrder = list.length ? Math.max(...list.map(r => r.order ?? 0)) + 1 : 0;
  const id = "custom_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const role = {
    name: trimmed,
    color: safeColor,
    permissions: safePerms,
    order: nextOrder,
    isDefault: false,
    createdAt: Date.now(),
    createdBy: state.me.uid
  };

  const path = scope === "global"
    ? `globalRoles/${id}`
    : `rooms/${state.roomCode}/roles/${id}`;

  await set(ref(db, path), role);
  return id;
}

export async function updateRole(scope, roleId, patch) {
  if (!state.me) throw new Error("Not logged in");
  if (!canManageRoles(scope)) throw new Error("No permission to manage roles");

  const safe = {};
  if (typeof patch.name === "string") {
    const trimmed = patch.name.trim().slice(0, 24);
    if (trimmed.length < 2) throw new Error("Name must be at least 2 chars");
    safe.name = trimmed;
  }
  if (typeof patch.color === "string" && /^#[0-9a-fA-F]{6}$/.test(patch.color)) {
    safe.color = patch.color.toLowerCase();
  }
  if (patch.permissions && typeof patch.permissions === "object") {
    safe.permissions = {
      kick: !!patch.permissions.kick,
      wipe: !!patch.permissions.wipe,
      editRoom: !!patch.permissions.editRoom,
      deleteRoom: !!patch.permissions.deleteRoom,
      manageRoles: !!patch.permissions.manageRoles
    };
  }

  const path = scope === "global"
    ? `globalRoles/${roleId}`
    : `rooms/${state.roomCode}/roles/${roleId}`;

  await update(ref(db, path), safe);
}

export async function deleteRole(scope, roleId) {
  if (!state.me) throw new Error("Not logged in");
  if (!canManageRoles(scope)) throw new Error("No permission to manage roles");

  const list = scope === "global" ? globalRoles : roomRoles;
  const role = list.find(r => r.id === roleId);
  if (!role) throw new Error("Role not found");
  if (role.isDefault) throw new Error("Cannot delete a default role");

  const path = scope === "global"
    ? `globalRoles/${roleId}`
    : `rooms/${state.roomCode}/roles/${roleId}`;

  await remove(ref(db, path));
}

export function canManageRoles(scope) {
  if (!state.me) return false;

  if (scope === "global") {
    return state.admins.includes(state.me.uid);
  }

  if (scope === "room") {
    if (state.admins.includes(state.me.uid)) return true;
    if (state.roomMeta && state.roomMeta.adminUid === state.me.uid) return true;
  }

  return false;
}

// ASSIGNMENT

export async function assignRole(scope, uid, roleId) {
  if (!state.me) throw new Error("Not logged in");
  if (!canManageRoles(scope)) throw new Error("No permission to assign roles");
  if (!uid) throw new Error("Missing user");
  if (uid === state.me.uid && scope === "global" && roleId === "owner") {
    throw new Error("Cannot change your own owner role");
  }

  const list = scope === "global" ? globalRoles : roomRoles;
  const role = list.find(r => r.id === roleId);
  if (!role) throw new Error("Role not found");

  const path = scope === "global"
    ? `userRoles/${uid}`
    : `rooms/${state.roomCode}/userRoles/${uid}`;

  await set(ref(db, path), roleId);
}

export async function unassignRole(scope, uid) {
  if (!state.me) throw new Error("Not logged in");
  if (!canManageRoles(scope)) throw new Error("No permission");

  const path = scope === "global"
    ? `userRoles/${uid}`
    : `rooms/${state.roomCode}/userRoles/${uid}`;

  await remove(ref(db, path));
}

export function getRoleName(scope, roleId) {
  const list = scope === "global" ? globalRoles : roomRoles;
  const r = list.find(x => x.id === roleId);
  return r ? r.name : "Member";
}

export function getRoleColor(scope, roleId) {
  const list = scope === "global" ? globalRoles : roomRoles;
  const r = list.find(x => x.id === roleId);
  return r ? r.color : "#6fc77f";
}
