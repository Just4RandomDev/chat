// MAIN
// Bootstraps the app, wires all features, and owns global event routing.

import { ref, get, set, update, onValue, serverTimestamp } from "./firebase/database.js";
import { db } from "./firebase/config.js";
import { initAuth, login, signup, logout, changePassword } from "./firebase/auth.js";
import { $, on, applyIconMask } from "./core/dom.js";
import { loadJson } from "./core/helpers.js";
import { encryptText } from "./core/crypto.js";
import { PUBLIC_ROOM } from "./core/constants.js";
import { loadLanguages, applyTranslations, getLang, setLang, t } from "./core/i18n.js";
import { applyTheme, getTheme, setTheme } from "./core/theme.js";
import { state, resetRoomState } from "./core/state.js";

import { fetchUser, primeCache, updateCached, loadBotProfile } from "./services/user-cache.js";
import { startSweeper, stopSweeper } from "./services/sweeper.js";
import { sendBotMessage } from "./services/bot.js";
import { resetSpamState } from "./services/spam.js";
import * as EmojiService from "./services/emoji.js";
import * as RolesService from "./services/roles.js";

import { initAppearance, applyAppearance, buildPresetGrid, buildColorGrid } from "./features/appearance.js";
import { initNotifications, startNotificationListener, stopNotificationListener, pushNotification } from "./features/notifications.js";
import {
  initUsers, renderUserList, wireUserListEvents, openUserProfile, openMyProfile,
  saveProfileChanges, saveUserStatus, saveProfileColors,
  isBlocked, toggleBlock, bannerStyle, memberSince
} from "./features/users.js";
import { initLobby, startLobbyListener, stopLobbyListener } from "./features/lobby.js";
import { initRooms, requestJoinRoom, enterRoom, leaveRoom } from "./features/rooms.js";
import { initMentions, hideAutocomplete } from "./features/mentions.js";
import {
  initChat, renderMessage, sendMessage, resetChatUI,
  handleFileObject, setReply, closeEmojiPopover
} from "./features/chat.js";
import {
  initDm, openDmPanel, closeDm, resetDmUI, resetDmLocalState,
  getDmState, getActiveDmUid, setDmLastGroup, setDmReply
} from "./features/dm.js";
import {
  canModerate, canKick, canEditRoom, isGlobalAdmin, isRoomOwner,
  adminKick, adminUnkick, adminWipeMessages, adminUpdateRoom, adminDeleteRoom,
  listKicked, listMembers
} from "./features/moderation.js";
import { initAdminUI, updateAdminUI } from "./features/admin.js";

window.__illoToast = showToast;
window.__illoFetchUser = fetchUser;
window.__illoIsBlocked = isBlocked;
window.__illoRenderUserList = renderUserList;
window.__illoUpdateScrollButtons = updateScrollButtons;
window.__illoGetDmState = getDmState;
window.__illoGetActiveDmUid = getActiveDmUid;
window.__illoSetDmLastGroup = setDmLastGroup;
window.__illoSetDmReply = setDmReply;
window.__illoCanModerate = canModerate;
window.__illoCanKick = canKick;
window.__illoAdminKick = adminKick;
window.__illoRequestJoinRoom = requestJoinRoom;
window.__illoState = state;
window.__illoEmojiService = EmojiService;
window.__illoStartCustomEmojiListeners = EmojiService.startCustomEmojiListeners;
window.__illoStartRoomRoleListeners = RolesService.startRoomListeners;
window.__illoRolesService = RolesService;

let emojiCategories = [];

async function loadAdmins() {
  try {
    const data = await loadJson("data/admins.json");
    state.admins = Array.isArray(data.admins) ? data.admins : [];
  } catch { state.admins = []; }
}

async function loadEmojis() {
  try {
    const data = await loadJson("data/emojis.json");
    emojiCategories = Array.isArray(data.categories) ? data.categories : [];
  } catch { emojiCategories = []; }
}

function showToast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function setStatus(connected) {
  $("statusDot")?.classList.toggle("online", connected);
  if ($("statusText")) $("statusText").textContent = connected ? "connected" : "disconnected";

  ["messageInput", "fileInput", "sendBtn", "messageEmojiBtn", "dmEmojiBtn"].forEach(id => {
    const el = $(id);
    if (el) el.disabled = !connected;
  });

  if ($("fileLabel")) {
    $("fileLabel").style.opacity = connected ? "1" : "0.5";
    $("fileLabel").style.pointerEvents = connected ? "auto" : "none";
  }
}

function updateScrollButtons() {
  const chat = $("chatContainer");
  const chatBtn = $("scrollBottomChat");
  if (chat && chatBtn) {
    const show = !isAtBottom(chat) && chat.scrollHeight > chat.clientHeight + 20;
    chatBtn.classList.toggle("hidden", !show);
  }
  const dm = $("dmMessages");
  const dmBtn = $("scrollBottomDm");
  if (dm && dmBtn) {
    const show = !isAtBottom(dm) && dm.scrollHeight > dm.clientHeight + 20;
    dmBtn.classList.toggle("hidden", !show);
  }
}

function isAtBottom(container) {
  if (!container) return true;
  return container.scrollTop + container.clientHeight >= container.scrollHeight - 80;
}

function showLobbyView() {
  try { closeDm(); } catch {}
  try { closeEmojiPopover(); } catch {}
  $("lobbyView")?.classList.remove("hidden");
  $("roomView")?.classList.add("hidden");
  $("backToLobbyBtn")?.classList.add("hidden");
  updateAdminUI();
  setStatus(false);
}

function showRoomView() {
  $("lobbyView")?.classList.add("hidden");
  $("roomView")?.classList.remove("hidden");
  $("backToLobbyBtn")?.classList.remove("hidden");
  updateAdminUI();
  setStatus(true);
}

function updateMyPfp() {
  if ($("myPfpBtn") && state.me) $("myPfpBtn").src = state.me.pfp || "";
}

function onRoomJoined() { showRoomView(); updateAdminUI(); }
function onRoomLeft() { showLobbyView(); }

function initAuthUI() {
  on($("tabLogin"), "click", () => {
    $("tabLogin").classList.add("active"); $("tabSignup").classList.remove("active");
    $("loginForm").classList.remove("hidden"); $("signupForm").classList.add("hidden");
    $("authError").textContent = "";
  });
  on($("tabSignup"), "click", () => {
    $("tabSignup").classList.add("active"); $("tabLogin").classList.remove("active");
    $("signupForm").classList.remove("hidden"); $("loginForm").classList.add("hidden");
    $("authError").textContent = "";
  });
  on($("loginBtn"), "click", async () => {
    $("authError").textContent = "";
    try { await login($("loginEmail").value.trim(), $("loginPassword").value); }
    catch (e) { $("authError").textContent = e.message.replace("Firebase: ", ""); }
  });
  on($("signupBtn"), "click", async () => {
    $("authError").textContent = "";
    try {
      await signup($("signupUsername").value.trim(), $("signupEmail").value.trim(), $("signupPassword").value);
    } catch (e) { $("authError").textContent = e.message.replace("Firebase: ", ""); }
  });
  on($("logoutBtn2"), "click", async () => { await leaveRoom(); await logout(); });
}

function initProfileUI() {
  on($("profileBtn"), "click", () => openMyProfile({ isGlobalAdmin }));
  on($("cancelProfileBtn"), "click", () => $("profileModal").classList.add("hidden"));
  on($("userProfileCloseBtn"), "click", () => {
    $("userProfileModal").classList.add("hidden"); state.viewedUid = null;
  });
  on($("userProfileDmBtn"), "click", async () => {
    const uid = state.viewedUid; if (!uid) return;
    $("userProfileModal").classList.add("hidden");
    await openDmPanel(uid);
    state.viewedUid = null;
  });
  on($("userProfileBlockBtn"), "click", async () => {
    const uid = state.viewedUid; if (!uid) return;
    const nowBlocked = await toggleBlock(uid);
    showToast(nowBlocked ? "Blocked (client-side only)" : "Unblocked");
    $("userProfileBlockBtn").textContent = nowBlocked ? "Unblock" : t("block");
    $("userProfileBlockBadge").classList.toggle("hidden", !nowBlocked);
    $("userProfileStatusDot").style.display = nowBlocked ? "none" : "block";
    renderUserList();
  });
  on($("userProfileKickBtn"), "click", async () => {
    const uid = state.viewedUid; if (!uid) return;
    try { showToast("Kicked " + (await adminKick(uid))); }
    catch (e) { showToast(e.message || "Could not kick"); }
    $("userProfileModal").classList.add("hidden");
    state.viewedUid = null;
  });
  on($("profileMoreBtn"), "click", () => {
    const menu = $("profileMoreMenu"); menu.innerHTML = "";
    const edit = document.createElement("button");
    edit.textContent = t("editProfile");
    edit.addEventListener("click", () => {
      $("profileMoreMenuModal").classList.add("hidden");
      $("profileModal").classList.add("hidden");
      openEditProfile();
    });
    menu.appendChild(edit);
    const status = document.createElement("button");
    status.textContent = t("status");
    status.addEventListener("click", () => {
      $("profileMoreMenuModal").classList.add("hidden");
      $("statusInput").value = state.me.status || "";
      $("statusModal").classList.remove("hidden");
      setTimeout(() => $("statusInput").focus(), 50);
    });
    menu.appendChild(status);
    const block = document.createElement("button");
    block.className = "danger";
    block.textContent = t("block");
    block.addEventListener("click", () => {
      $("profileMoreMenuModal").classList.add("hidden");
      openBlockUserModal();
    });
    menu.appendChild(block);
    $("profileMoreMenuModal").classList.remove("hidden");
  });
  on($("profileMoreMenuModal"), "click", (e) => {
    if (e.target === $("profileMoreMenuModal")) $("profileMoreMenuModal").classList.add("hidden");
  });
  on($("cancelEditProfileBtn"), "click", () => $("editProfileModal").classList.add("hidden"));
  on($("editPfp"), "change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => { $("editProfileAvatar").src = ev.target.result; };
    r.readAsDataURL(f);
  });
  on($("editBanner"), "change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 400 * 1024) { showToast("Banner too big (400KB max)"); e.target.value = ""; return; }
    const r = new FileReader();
    r.onload = (ev) => {
      $("editProfileBanner").style.backgroundImage = `url('${ev.target.result}')`;
      $("editProfileBanner").style.backgroundSize = "cover";
      $("editProfileBanner").style.backgroundPosition = "center";
    };
    r.readAsDataURL(f);
  });
  on($("saveProfileBtn"), "click", async () => {
    $("profileError").textContent = "";
    try {
      await saveProfileChanges($("editPfp").files[0], $("editBanner").files[0]);
      $("myUsernameLabel").textContent = state.me.username;
      updateMyPfp();
      $("editProfileModal").classList.add("hidden");
      showToast("Profile saved");
      if (state.roomCode) renderUserList();
    } catch (e) { $("profileError").textContent = e.message; }
  });
  on($("saveStatusBtn"), "click", async () => {
    try {
      await saveUserStatus($("statusInput").value);
      $("statusModal").classList.add("hidden");
      showToast("Status updated");
      if (state.roomCode) renderUserList();
    } catch { showToast("Could not update status"); }
  });
  on($("cancelStatusBtn"), "click", () => $("statusModal").classList.add("hidden"));
  on($("saveProfileColorsBtn"), "click", async () => {
    try {
      await saveProfileColors($("editNameColor").value, $("editAccentColor").value);
      showToast("Colors saved");
      if (state.roomCode) renderUserList();
    } catch { showToast("Could not save colors"); }
  });
  on($("cancelBlockBtn"), "click", () => $("blockUserModal").classList.add("hidden"));
  on($("confirmBlockBtn"), "click", async () => {
    const uid = $("blockUserSelect").value;
    if (!uid) return showToast("Pick a user");
    const nowBlocked = await toggleBlock(uid);
    showToast(nowBlocked ? "Blocked (client-side only)" : "Unblocked");
    $("blockUserModal").classList.add("hidden");
    renderUserList();
  });
}

function openEditProfile() {
  const m = state.me; if (!m) return;
  $("editUsername").value = m.username;
  $("editBio").value = m.bio || "";
  $("editPfp").value = ""; $("editBanner").value = "";
  $("profileError").textContent = "";
  $("editProfileAvatar").src = m.pfp || "";
  $("editProfileBanner").style.cssText = bannerStyle(m.accentColor, m.bannerImage);
  $("editProfileModal").classList.remove("hidden");
}

function openBlockUserModal() {
  const sel = $("blockUserSelect"); sel.innerHTML = "";
  const seen = new Set(); const entries = [];
  for (const uid of Object.keys(state.presenceData || {})) {
    if (uid === state.me.uid || seen.has(uid)) continue;
    seen.add(uid); entries.push({ uid, name: uid.slice(0, 6) });
  }
  for (const uid of Object.keys(state.seenData || {})) {
    if (uid === state.me.uid || seen.has(uid)) continue;
    seen.add(uid); entries.push({ uid, name: uid.slice(0, 6) });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  if (!entries.length) {
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "No users in this room";
    sel.appendChild(opt); sel.disabled = true;
  } else {
    sel.disabled = false;
    for (const e of entries) {
      const opt = document.createElement("option");
      opt.value = e.uid;
      opt.textContent = isBlocked(e.uid) ? e.name + " (blocked)" : e.name;
      sel.appendChild(opt);
    }
  }
  $("blockUserModal").classList.remove("hidden");
}

function initSettingsUI() {
  on($("settingsBtn"), "click", () => {
    $("themeSelect").value = getTheme();
    $("languageSelect").value = getLang();
    $("currentPassword").value = ""; $("newPassword").value = "";
    $("settingsError").textContent = "";
    $("editNameColor").value = state.me?.nameColor || "#ffffff";
    $("editAccentColor").value = state.me?.accentColor || "#8c5aff";
    buildPresetGrid(); buildColorGrid();
    $("settingsModal").classList.remove("hidden");
  });
  on($("closeSettingsBtn"), "click", () => $("settingsModal").classList.add("hidden"));
  on($("languageSelect"), "change", () => setLang($("languageSelect").value));
  on($("changePasswordBtn"), "click", async () => {
    $("settingsError").textContent = "";
    try {
      await changePassword($("currentPassword").value, $("newPassword").value);
      $("currentPassword").value = ""; $("newPassword").value = "";
      showToast("Password updated");
    } catch (e) { $("settingsError").textContent = e.message.replace("Firebase: ", ""); }
  });
  document.querySelectorAll(".settings-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      if (!tab.dataset.tab) return;
      document.querySelectorAll(".settings-tab").forEach(x => {
        if (x.dataset.tab) x.classList.remove("active");
      });
      tab.classList.add("active");
      const target = tab.dataset.tab;
      $("paneAccount")?.classList.toggle("hidden", target !== "account");
      $("paneAppearance")?.classList.toggle("hidden", target !== "appearance");
      $("paneDanger")?.classList.toggle("hidden", target !== "danger");
    });
  });
}

function initScrollButtons() {
  on($("chatContainer"), "scroll", updateScrollButtons);
  on($("dmMessages"), "scroll", updateScrollButtons);
  on($("scrollBottomChat"), "click", () => {
    const c = $("chatContainer"); if (c) c.scrollTop = c.scrollHeight;
    updateScrollButtons();
  });
  on($("scrollBottomDm"), "click", () => {
    const c = $("dmMessages"); if (c) c.scrollTop = c.scrollHeight;
    updateScrollButtons();
  });
}

async function ensurePublicRoom() {
  try {
    const s = await get(ref(db, `rooms/${PUBLIC_ROOM}`));
    if (!s.exists()) {
      await set(ref(db, `rooms/${PUBLIC_ROOM}`), {
        name: "Public Lobby", adminUid: "system",
        hasPassword: false, passwordHash: "",
        maxUsers: 500, kicked: {},
        isPublic: true, pinned: true, forever: true,
        createdAt: Date.now()
      });
    }
  } catch {}
}

function jumpToMessage(msgId) {
  const target = document.querySelector(`.msg-line[data-msg-id="${msgId}"]`);
  if (!target) { showToast("Message not in view (older than 100 messages)"); return; }
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("highlight");
  setTimeout(() => target.classList.remove("highlight"), 2500);
}

function initIcons() {
  applyIconMask($("notifIcon"), "bell");
  applyIconMask($("settingsIcon"), "gear");
  applyIconMask($("paperclipIcon"), "paperclip");
  applyIconMask($("dmPaperclipIcon"), "paperclip");
  applyIconMask($("editPfpIcon"), "pencil");
  applyIconMask($("editBannerIcon"), "image");
  applyIconMask($("emptyIcon"), "chat");
  applyIconMask($("sendIcon"), "send");
  applyIconMask($("dmSendIcon"), "send");
  applyIconMask($("messageEmojiIcon"), "react");
  applyIconMask($("dmEmojiIcon"), "react");
}

async function boot() {
  await Promise.all([
    loadLanguages(),
    loadEmojis(),
    loadAdmins(),
    loadBotProfile(),
    EmojiService.initEmoji()
  ]);
  applyTranslations();
  applyTheme();
  applyAppearance();
  initIcons();

  initAuthUI();
  initProfileUI();
  initSettingsUI();
  initAppearance();
  initScrollButtons();

  initNotifications({
    onOpenDm: (uid) => openDmPanel(uid),
    onJoinRoom: (code) => requestJoinRoom(code),
    onJumpToMessage: (msgId) => jumpToMessage(msgId)
  });

  initChat(emojiCategories, {
    onOpenUserProfile: (uid) => openUserProfile(uid, { canKick })
  });

  initDm();

  initMentions($("messageInput"));

  initLobby({ onJoin: (code) => requestJoinRoom(code) });

  initRooms({
    renderMessage,
    hideEmpty: () => {
      const e = $("emptyState");
      if (e && e.parentNode === $("chatContainer")) e.style.display = "none";
    },
    resetChatUI, resetDmUI,
    onRoomJoined, onRoomLeft,
    canModerate, isGlobalAdmin
  });

  initAdminUI({
    onLeaveRoom: async () => { await leaveRoom(); },
    resetChatUI,
    onRoomDeleted: () => { showLobbyView(); }
  });

  initUsers(null);
  wireUserListEvents((uid) => openUserProfile(uid, { canKick }));

  buildPresetGrid(); buildColorGrid();
  updateScrollButtons();
  setStatus(false);
  resetChatUI();
  resetDmUI();

  initAuth(async (profile) => {
    if (!profile) {
      state.me = null;
      stopNotificationListener();
      stopSweeper();
      stopLobbyListener();
      resetSpamState();
      RolesService.stopGlobalListeners();
      RolesService.stopRoomListeners();

      $("authScreen")?.classList.remove("hidden");
      $("appRoot")?.classList.add("hidden");
      return;
    }

    state.me = profile;
    initUsers(profile);
    primeCache(profile);
    RolesService.initRoles(profile);

    $("myUsernameLabel").textContent = profile.username;
    updateMyPfp();

    $("authScreen")?.classList.add("hidden");
    $("appRoot")?.classList.remove("hidden");

    showLobbyView();

    await ensurePublicRoom();
    startLobbyListener();
    startNotificationListener();
    startSweeper(profile);

    EmojiService.startCustomEmojiListeners(null);
  });
}

boot().catch(e => console.error("[boot]", e));
