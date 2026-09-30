// USERS
// User list, user profiles, own profile, blocks.

import { ref, get, update, remove, set } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import { $, on } from "../core/dom.js";
import { STATUS_MAX, BANNER_MAX_BYTES, PFP_MAX_BYTES, PRESENCE_STALE_MS } from "../core/constants.js";
import { t } from "../core/i18n.js";
import { state } from "../core/state.js";
import { fetchUser, defaultPfp, updateCached } from "../services/user-cache.js";

const blocked = new Set();
let me = null;

export function initUsers(meUser) {
  me = meUser;
  blocked.clear();
  if (me) loadBlocked();
}

async function loadBlocked() {
  if (!me) return;
  try {
    const s = await get(ref(db, `blocks/${me.uid}`));
    Object.keys(s.val() || {}).forEach(u => blocked.add(u));
  } catch {}
}

export function isBlocked(uid) {
  return blocked.has(uid);
}

export async function toggleBlock(targetUid) {
  if (!me) return false;
  if (blocked.has(targetUid)) {
    blocked.delete(targetUid);
    try { await remove(ref(db, `blocks/${me.uid}/${targetUid}`)); } catch {}
    return false;
  }
  blocked.add(targetUid);
  try { await set(ref(db, `blocks/${me.uid}/${targetUid}`), true); } catch {}
  return true;
}

export function bannerStyle(accent, bannerImage) {
  if (bannerImage) {
    return `background-image: url('${bannerImage}'); background-size: cover; background-position: center;`;
  }
  const a = accent || "#8c5aff";
  return `background: linear-gradient(135deg, ${a}, ${a}88);`;
}

export function memberSince(createdAt) {
  if (!createdAt) return "Unknown";
  const d = new Date(typeof createdAt === "number" ? createdAt : Number(createdAt));
  if (isNaN(d.getTime())) return "Unknown";
  try {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return d.toDateString();
  }
}

export function applyNameColor(span, profile) {
  if (profile && profile.nameColor) span.style.color = profile.nameColor;
}

// USER LIST

export async function renderUserList() {
  const userList = $("userList");
  const offlineList = $("offlineList");
  if (!userList || !offlineList) return;

  const presenceMap = new Map();
  for (const [uid, p] of Object.entries(state.presenceData || {})) {
    if (!uid || uid === "undefined" || uid === "null") continue;
    if (!p || typeof p !== "object") continue;
    if (p.joinedAt && Date.now() - p.joinedAt > PRESENCE_STALE_MS) continue;
    presenceMap.set(uid, { uid, online: true, lastSeen: p.joinedAt || 0 });
  }

  const seenMap = new Map();
  for (const [uid, s] of Object.entries(state.seenData || {})) {
    if (!uid || uid === "undefined" || uid === "null") continue;
    if (!s || typeof s !== "object") continue;
    if (presenceMap.has(uid)) continue;
    seenMap.set(uid, { uid, online: false, lastSeen: s.lastSeen || 0 });
  }

  const profiles = new Map();
  const allUids = [...presenceMap.keys(), ...seenMap.keys()];
  await Promise.all(allUids.map(async (uid) => {
    if (uid === state.me?.uid) return;
    const p = await fetchUser(uid);
    profiles.set(uid, p);
  }));

  // Deduplicate by username
  const byName = new Map();
  for (const uid of allUids) {
    if (uid === state.me?.uid) continue;
    const p = profiles.get(uid);
    if (!p) continue;
    const key = (p.username || "").toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, uid);
    } else {
      const existingIsOnline = presenceMap.has(existing);
      const thisIsOnline = presenceMap.has(uid);
      if (thisIsOnline && !existingIsOnline) byName.set(key, uid);
    }
  }

  const onlineList = [];
  const offlineListItems = [];

  // BOT — always shown as online, at the top of the list (above self).
  const bot = await fetchUser("system");
  onlineList.push({
    uid: "system",
    profile: bot,
    isSelf: false,
    isBot: true
  });

  if (state.me) {
    onlineList.push({
      uid: state.me.uid,
      profile: {
        uid: state.me.uid,
        username: state.me.username,
        pfp: state.me.pfp,
        nameColor: state.me.nameColor,
        bio: state.me.bio,
        status: state.me.status
      },
      isSelf: true
    });
  }

  for (const uid of byName.values()) {
    const profile = profiles.get(uid);
    if (!profile) continue;
    const entry = { uid, profile, isSelf: false };
    if (presenceMap.has(uid)) onlineList.push(entry);
    else offlineListItems.push(entry);
  }

  const sortFn = (a, b) => {
    if (a.isSelf) return -1;
    if (b.isSelf) return 1;
    const aAdmin = state.admins.includes(a.uid);
    const bAdmin = state.admins.includes(b.uid);
    if (aAdmin && !bAdmin) return -1;
    if (!aAdmin && bAdmin) return 1;
    return (a.profile.username || "").toLowerCase()
      .localeCompare((b.profile.username || "").toLowerCase());
  };

  onlineList.sort(sortFn);
  offlineListItems.sort(sortFn);

  $("onlineCount").textContent = onlineList.length;
  $("offlineCount").textContent = offlineListItems.length;

  userList.innerHTML = "";
  const onlineFrag = document.createDocumentFragment();
  for (const u of onlineList) onlineFrag.appendChild(buildUserRow(u, true));
  userList.appendChild(onlineFrag);

  offlineList.innerHTML = "";
  const offlineFrag = document.createDocumentFragment();
  for (const u of offlineListItems) offlineFrag.appendChild(buildUserRow(u, false));
  offlineList.appendChild(offlineFrag);
}

function buildUserRow(entry, isOnline) {
  const { uid, profile, isSelf } = entry;

  const row = document.createElement("div");
  row.className = "user-item";
  if (!isOnline) row.classList.add("offline");
  if (isBlocked(uid)) row.classList.add("blocked");
  if (isSelf) row.dataset.self = "true";
  row.dataset.uid = uid;

  const img = document.createElement("img");
  img.src = profile.pfp || defaultPfp(profile.username);
  img.alt = "";
  img.loading = "lazy";
  img.onerror = () => { img.src = defaultPfp(profile.username); };
  row.appendChild(img);

  const meta = document.createElement("div");
  meta.className = "u-meta";

  const nameLine = document.createElement("div");
  nameLine.className = "u-name";

  const dot = document.createElement("span");
  dot.className = "u-dot";
  nameLine.appendChild(dot);

  const nameSpan = document.createElement("span");
  nameSpan.textContent = profile.username || "user";
  if (profile.nameColor) nameSpan.style.color = profile.nameColor;
  nameLine.appendChild(nameSpan);

  if (state.admins.includes(uid)) {
    const b = document.createElement("span");
    b.className = "u-badge";
    b.textContent = "ADMIN";
    nameLine.appendChild(b);
  }

  meta.appendChild(nameLine);

  const subLine = document.createElement("div");
  subLine.className = "u-sub";

  if (profile.status) {
    subLine.textContent = profile.status;
  } else if (isSelf) {
    subLine.textContent = "you";
  } else if (isOnline) {
    subLine.textContent = "online";
  } else {
    const lastSeen = state.seenData[uid]?.lastSeen;
    if (lastSeen) {
      const diff = Date.now() - lastSeen;
      const min = Math.floor(diff / 60000);
      const hr = Math.floor(min / 60);
      const day = Math.floor(hr / 24);
      if (min < 1) subLine.textContent = "last seen just now";
      else if (min < 60) subLine.textContent = `last seen ${min}m ago`;
      else if (hr < 24) subLine.textContent = `last seen ${hr}h ago`;
      else subLine.textContent = `last seen ${day}d ago`;
    } else {
      subLine.textContent = "offline";
    }
  }
  meta.appendChild(subLine);

  row.appendChild(meta);
  return row;
}

export function wireUserListEvents(onUserClick) {
  on($("userList"), "click", (e) => {
    const row = e.target.closest(".user-item");
    if (!row || row.dataset.self === "true") return;
    const uid = row.dataset.uid;
    if (uid) onUserClick(uid);
  });

  on($("offlineList"), "click", (e) => {
    const row = e.target.closest(".user-item");
    if (!row) return;
    const uid = row.dataset.uid;
    if (uid) onUserClick(uid);
  });
}

// USER PROFILE MODAL

export async function openUserProfile(uid, opts = {}) {
  if (!uid) return;
  state.viewedUid = uid;

  const p = await fetchUser(uid);
  const isSelf = uid === state.me.uid;
  const isAdminUser = state.admins.includes(uid);
  const isOnline = !!(state.presenceData && state.presenceData[uid]);
  const isBlockedUser = isBlocked(uid);

  $("userProfileAvatar").src = p.pfp || defaultPfp(p.username);
  $("userProfileName").textContent = p.username || "user";
  $("userProfileName").style.color = p.nameColor || "";

  $("userProfileHandle").textContent = "@" + (p.username || "user").toLowerCase();

  const cs = $("userProfileCustomStatus");
  cs.textContent = p.status || "";
  cs.style.display = p.status ? "" : "none";

  $("userProfileBio").textContent = p.bio || "No bio yet.";
  $("userProfileBanner").style.cssText = bannerStyle(p.accentColor, p.bannerImage);
  $("userProfileMeta").textContent = memberSince(p.createdAt);

  const sd = $("userProfileStatusDot");
  sd.classList.toggle("offline", !isOnline);
  sd.style.display = isBlockedUser ? "none" : "block";

  $("userProfileBlockBadge").classList.toggle("hidden", !isBlockedUser);

  const badges = $("userProfileBadges");
  badges.innerHTML = "";
  if (isAdminUser) {
    const b = document.createElement("span");
    b.className = "dc-badge admin";
    b.textContent = "ADMIN";
    badges.appendChild(b);
  }
  if (isOnline) {
    const b = document.createElement("span");
    b.className = "dc-badge online";
    b.textContent = "ONLINE";
    badges.appendChild(b);
  }

  $("userProfileDmBtn").style.display = isSelf ? "none" : "";
  $("userProfileBlockBtn").style.display = isSelf ? "none" : "";
  $("userProfileBlockBtn").textContent = isBlockedUser ? "Unblock" : t("block");

  const kickBtn = $("userProfileKickBtn");
  const canKickHere = !isSelf && opts.canKick?.();
  kickBtn.classList.toggle("hidden", !canKickHere);

  $("userProfileModal").classList.remove("hidden");
}

// OWN PROFILE

export function openMyProfile(opts = {}) {
  const m = state.me;
  if (!m) return;

  $("myProfileAvatar").src = m.pfp || defaultPfp(m.username);
  $("profileHeroName").textContent = m.username;
  $("profileHeroName").style.color = m.nameColor || "";
  $("profileHandle").textContent = "@" + (m.username || "user").toLowerCase();

  const cs = $("profileCustomStatus");
  cs.textContent = m.status || "";
  cs.style.display = m.status ? "" : "none";

  $("myProfileBio").textContent = m.bio || "No bio yet.";
  $("profileBanner").style.cssText = bannerStyle(m.accentColor, m.bannerImage);
  $("profileHeroMeta").textContent = memberSince(m.createdAt);

  const badges = $("profileBadges");
  badges.innerHTML = "";
  if (opts.isGlobalAdmin?.()) {
    const adm = document.createElement("span");
    adm.className = "dc-badge admin";
    adm.textContent = "ADMIN";
    badges.appendChild(adm);
  }

  $("profileModal").classList.remove("hidden");
}

export async function saveProfileChanges(pfpFile, bannerFile) {
  const m = state.me;
  if (!m) return;

  const newName = $("editUsername").value.trim();
  if (newName.length < 2 || newName.length > 24) throw new Error("Username must be 2-24 chars");
  if (newName.toLowerCase() === "everyone") throw new Error("That username is reserved");

  const newBio = $("editBio").value.trim();
  if (newBio.length > 200) throw new Error("Bio too long (200 max)");

  let newPfp = m.pfp;
  if (pfpFile) {
    if (pfpFile.size > PFP_MAX_BYTES) throw new Error("PFP too big (400KB max)");
    newPfp = await readAsDataURL(pfpFile);
  }

  let newBanner = m.bannerImage;
  if (bannerFile) {
    if (bannerFile.size > BANNER_MAX_BYTES) throw new Error("Banner too big (400KB max)");
    newBanner = await readAsDataURL(bannerFile);
  }

  await update(ref(db, `users/${m.uid}`), {
    username: newName,
    bio: newBio,
    pfp: newPfp,
    bannerImage: newBanner
  });

  m.username = newName;
  m.bio = newBio;
  m.pfp = newPfp;
  m.bannerImage = newBanner;

  updateCached(m.uid, {
    username: newName, pfp: newPfp, bio: newBio,
    nameColor: m.nameColor, accentColor: m.accentColor,
    status: m.status, bannerImage: newBanner,
    createdAt: m.createdAt
  });

  state.usernameIndex = null;
}

export async function saveUserStatus(status) {
  const m = state.me;
  if (!m) return;
  const trimmed = (status || "").slice(0, STATUS_MAX);
  await update(ref(db, `users/${m.uid}`), { status: trimmed });
  m.status = trimmed;
  updateCached(m.uid, { status: trimmed });
}

export async function saveProfileColors(nameColor, accentColor) {
  const m = state.me;
  if (!m) return;
  await update(ref(db, `users/${m.uid}`), { nameColor, accentColor });
  m.nameColor = nameColor;
  m.accentColor = accentColor;
  updateCached(m.uid, { nameColor, accentColor });
}

function readAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
