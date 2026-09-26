import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updatePassword, EmailAuthProvider, reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase, ref, push, set, get, update, remove, query, limitToLast,
  onChildAdded, onValue, off, serverTimestamp, onDisconnect
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBynvxWhKhFtb9XWLzCJHRpbOY3_D1hs2w",
  authDomain: "chat-789ff.firebaseapp.com",
  databaseURL: "https://chat-789ff-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "chat-789ff",
  storageBucket: "chat-789ff.firebasestorage.app",
  messagingSenderId: "721919858608",
  appId: "1:721919858608:web:7da6041edf7398030fe875"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const PUBLIC_ROOM = "public";
const GROUP_MS = 5 * 60 * 1000;
const EMPTY_TTL = 5 * 60 * 1000;
const SWEEP_MS = 60 * 1000;
const MSG_TTL_MS = 15 * 60 * 1000;
const MSG_MAX = 100;
const AUTO_CLEAN_MS = 60 * 1000;
const BOT_UID = "system";
const PRESENCE_STALE_MS = 2 * 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;
const SPAM_WINDOW_MS = 5000;
const SPAM_MAX = 10;
const STATUS_MAX = 150;
const PRONOUNS_MAX = 32;
const BANNER_MAX_BYTES = 400 * 1024;

let translations = {};
let emojiCategories = [];
let admins = [];

const $ = id => document.getElementById(id);

const on = (element, event, handler) => {
  if (element && typeof element.addEventListener === "function") {
    element.addEventListener(event, handler);
  }
};

const ICON_PATHS = {
  bell:      `M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z`,
  gear:      `M19.14 12.94a7.5 7.5 0 0 0 .06-.94 7.5 7.5 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.24-1.12.55-1.62.94L5.24 4.94a.5.5 0 0 0-.6.22L2.72 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.5 7.5 0 0 0-.06.94c0 .32.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.34.6.22l2.39-.96c.5.39 1.04.7 1.62.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.58-.24 1.12-.55 1.62-.94l2.39.96c.18.12.46.02.6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z`,
  paperclip: `M16.5 6.5v11a4.5 4.5 0 0 1-9 0V6a3 3 0 0 1 6 0v11.5a1.5 1.5 0 0 1-3 0V8h-2v9.5a3.5 3.5 0 0 0 7 0V6a5 5 0 0 0-10 0v11.5a6.5 6.5 0 0 0 13 0V6.5h-2z`,
  lock:      `M17 9V7a5 5 0 0 0-10 0v2a3 3 0 0 0-2 2.83V19a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-7.17A3 3 0 0 0 17 9zM9 7a3 3 0 0 1 6 0v2H9V7z`,
  globe:     `M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7.93 9h-3.44a15.6 15.6 0 0 0-1.2-5.44A8.02 8.02 0 0 1 19.93 11zM12 4.06c.83 1.2 1.7 3.35 1.95 6.94h-3.9c.25-3.59 1.12-5.74 1.95-6.94zM4.07 13h3.44c.16 1.9.6 3.83 1.2 5.44A8.02 8.02 0 0 1 4.07 13zm3.44-2H4.07a8.02 8.02 0 0 1 4.64-5.44A15.6 15.6 0 0 0 7.51 11zM12 19.94c-.83-1.2-1.7-3.35-1.95-6.94h3.9c-.25 3.59-1.12 5.74-1.95 6.94zm2.49-1.5a15.6 15.6 0 0 0 1.2-5.44h3.44a8.02 8.02 0 0 1-4.64 5.44z`,
  crown:     `M3 7l4 4 5-6 5 6 4-4-2 12H5L3 7z`,
  chat:      `M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z`,
  pencil:    `M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z`,
  image:     `M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z`,
  send:      `M2.01 21L23 12 2.01 3 2 10l15 2-15 2z`,
  reply:     `M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z`,
  trash:     `M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z`,
  more:      `M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z`,
  block:     `M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM5.7 7.1l9.2 9.2A8 8 0 0 1 5.7 7.1zm12.6 9.8L9.1 7.7a8 8 0 0 1 9.2 9.2z`
};

function applyIconMask(element, key) {
  if (!element || !ICON_PATHS[key]) return;
  const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='black' d='${ICON_PATHS[key]}'/></svg>`)}")`;
  element.style.webkitMaskImage = url;
  element.style.maskImage = url;
}

const state = {
  me: null, roomCode: null, roomMeta: null, roomRef: null, queryRef: null,
  presenceRef: null, presenceOff: null, kickedOff: null,
  seenOff: null, seenData: {}, presenceData: {},
  blocked: new Set(), userCache: new Map(),
  pendingFile: null, dmPendingFile: null,
  dmUid: null, dmQueryRef: null, dmOff: null,
  groupOff: null,
  notifOff: null, notifications: [], unread: 0,
  lobbyOff: null, lobbyToken: 0, roomCards: new Map(),
  reply: null, dmReply: null,
  lastGroupEl: null, lastGroupUid: null, lastGroupTime: 0,
  dmLastGroupEl: null, dmLastGroupUid: null, dmLastGroupTime: 0,
  sweepId: null, cleanId: null, heartbeatId: null,
  usernameIndex: null,
  admins: [],
  spamTracker: [],
  reactionTarget: null,
  mentionTarget: null,
  mentionList: [],
  mentionIndex: -1,
  mentionStart: -1,
  moreTarget: null,
  enteringRoom: false,
  viewedUid: null,
  reactionListeners: []
};

let currentLang = localStorage.getItem("lang") || "en";
let currentTheme = localStorage.getItem("theme") || "dark";
const t = key => (translations[currentLang]?.[key]) ?? translations.en?.[key] ?? key;

const applyTranslations = () => {
  document.querySelectorAll("[data-i18n]").forEach(el => el.textContent = t(el.getAttribute("data-i18n")));
  document.querySelectorAll("[data-i18n-ph]").forEach(el => el.placeholder = t(el.getAttribute("data-i18n-ph")));
};
const applyTheme = () => document.body.setAttribute("data-theme", currentTheme);

const COLOR_VARS = [
  { key: "bg",           label: "Background" },
  { key: "bg-app",       label: "App" },
  { key: "bg-panel",     label: "Panel" },
  { key: "bg-header",    label: "Header" },
  { key: "bg-input",     label: "Input" },
  { key: "border",       label: "Border" },
  { key: "text",         label: "Text" },
  { key: "text-dim",     label: "Dim Text" },
  { key: "text-bright",  label: "Bright Text" },
  { key: "accent",       label: "Accent" },
  { key: "accent-hover", label: "Accent Hover" },
  { key: "name",         label: "Other Name" },
  { key: "name-own",     label: "Own Name" },
  { key: "link",         label: "Link" },
  { key: "danger",       label: "Danger" },
  { key: "icon-color",   label: "Icon Color" }
];

const PRESETS = {
  "Default Dark":  { bg:"#0e0e0e","bg-app":"#1a1a1a","bg-panel":"#161616","bg-header":"#241a1a","bg-input":"#0e0e0e",border:"#3a2a2a",text:"#d6a0a0","text-dim":"#b08080","text-bright":"#e8d0d0",accent:"#d94a4a","accent-hover":"#ff5a5a",name:"#6fc77f","name-own":"#9ac76f",link:"#6fa8ff",danger:"#ff5a5a","icon-color":"#d94a4a" },
  "Default Light": { bg:"#f5f5f5","bg-app":"#ffffff","bg-panel":"#efefef","bg-header":"#e8e0e0","bg-input":"#ffffff",border:"#d0c0c0",text:"#4a2020","text-dim":"#7a5a5a","text-bright":"#2a1010",accent:"#b83030","accent-hover":"#d94a4a",name:"#2a7a3a","name-own":"#4a8a2a",link:"#1a5ad0",danger:"#c02020","icon-color":"#b83030" },
  "Nord":          { bg:"#2e3440","bg-app":"#3b4252","bg-panel":"#2e3440","bg-header":"#434c5e","bg-input":"#2e3440",border:"#4c566a",text:"#d8dee9","text-dim":"#a0aec0","text-bright":"#eceff4",accent:"#88c0d0","accent-hover":"#8fbcbb",name:"#a3be8c","name-own":"#ebcb8b",link:"#81a1c1",danger:"#bf616a","icon-color":"#88c0d0" },
  "Solarized":     { bg:"#002b36","bg-app":"#073642","bg-panel":"#002b36","bg-header":"#073642","bg-input":"#002b36",border:"#586e75",text:"#93a1a1","text-dim":"#657b83","text-bright":"#eee8d5",accent:"#b58900","accent-hover":"#cb4b16",name:"#859900","name-own":"#2aa198",link:"#268bd2",danger:"#dc322f","icon-color":"#b58900" },
  "Terminal":      { bg:"#000000","bg-app":"#0a0a0a","bg-panel":"#050505","bg-header":"#001a00","bg-input":"#000000",border:"#003300",text:"#00ff41","text-dim":"#008f11","text-bright":"#7aff7a",accent:"#00ff41","accent-hover":"#7aff7a",name:"#00ff41","name-own":"#7aff7a",link:"#00bfff",danger:"#ff0055","icon-color":"#00ff41" },
  "Pink":          { bg:"#1a0a1a","bg-app":"#241224","bg-panel":"#1f0d1f","bg-header":"#3d1a3d","bg-input":"#1a0a1a",border:"#5a2a5a",text:"#ffc0f0","text-dim":"#c080b0","text-bright":"#ffe0f5",accent:"#ff69b4","accent-hover":"#ff85c8",name:"#ffb3d9","name-own":"#ffd9ec",link:"#ff66cc",danger:"#ff3366","icon-color":"#ff69b4" }
};

let appearance = JSON.parse(localStorage.getItem("appearance") || "{}");
let customCss = localStorage.getItem("customCss") || "";
let customHtml = localStorage.getItem("customHtml") || "";
let customJs = localStorage.getItem("customJs") || "";

function applyAppearance() {
  const lines = [":root {"];
  for (const [k, v] of Object.entries(appearance)) {
    if (v) lines.push(`  --${k}: ${v};`);
  }
  lines.push("}");
  const varsBlock = lines.join("\n");
  const combined = varsBlock + "\n\n" + customCss;

  let cssTag = document.getElementById("custom-css");
  if (!cssTag) {
    cssTag = document.createElement("style");
    cssTag.id = "custom-css";
    document.head.appendChild(cssTag);
  }
  cssTag.textContent = combined;

  applyCustomHtml();
  applyCustomJs();
}

function applyCustomHtml() {
  const mount = document.getElementById("customHtmlMount");
  if (!mount) return;
  mount.innerHTML = customHtml;
}

function applyCustomJs() {
  if (!customJs.trim()) return;
  try {
    const fn = new Function(customJs);
    fn();
  } catch (e) {
    console.warn("[custom js]", e);
  }
}

const saveAppearance = () => localStorage.setItem("appearance", JSON.stringify(appearance));
const saveCustomCss = () => localStorage.setItem("customCss", customCss);
const saveCustomHtml = () => localStorage.setItem("customHtml", customHtml);
const saveCustomJs = () => localStorage.setItem("customJs", customJs);

const shaKey = s => CryptoJS.SHA256(s + "::salt::v1").toString();
const encryptText = (plain, key) => plain ? CryptoJS.AES.encrypt(plain, shaKey(key)).toString() : "";
const decryptText = (cipher, key) => {
  if (!cipher) return "";
  try { return CryptoJS.AES.decrypt(cipher, shaKey(key)).toString(CryptoJS.enc.Utf8) || "[could not decrypt]"; }
  catch { return "[could not decrypt]"; }
};
const hashPassword = pw => CryptoJS.SHA256("room::" + pw).toString();
const dmKey = (a, b) => { const [x, y] = [a, b].sort(); return `DM::${x}::${y}`; };
const dmPath = (a, b) => { const [x, y] = [a, b].sort(); return `dms/${x}__${y}/messages`; };

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
const VID_EXT = /\.(mp4|webm|ogg|mov)(\?.*)?$/i;
const MEDIA_HOSTS = new Set(["media.tenor.com","c.tenor.com","media.giphy.com","i.giphy.com","i.imgur.com","cdn.discordapp.com","media.discordapp.net"]);

const classifyUrl = url => {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname;
    if (IMG_EXT.test(path)) return "image";
    if (VID_EXT.test(path)) return "video";
    if (MEDIA_HOSTS.has(host)) return VID_EXT.test(path) ? "video" : "image";
    return "link";
  } catch { return "link"; }
};

const debounce = (fn, ms) => { let to; return (...a) => { clearTimeout(to); to = setTimeout(() => fn(...a), ms); }; };

const presenceCountCache = new Map();
async function getPresenceCount(code) {
  const c = presenceCountCache.get(code);
  if (c && Date.now() - c.ts < 3000) return c.n;
  try {
    const snap = await get(ref(db, `chats/${code}/presence`));
    const n = Object.keys(snap.val() || {}).length;
    presenceCountCache.set(code, { n, ts: Date.now() });
    return n;
  } catch { return 0; }
}

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

async function loadLanguages() {
  const codes = ["en", "es", "fr", "ru"];
  const entries = await Promise.all(
    codes.map(async c => {
      try { return [c, await loadJson(`data/languages/${c}.json`)]; }
      catch { return [c, {}]; }
    })
  );
  translations = Object.fromEntries(entries);
}

async function loadEmojis() {
  try {
    const data = await loadJson("data/emojis.json");
    emojiCategories = Array.isArray(data.categories) ? data.categories : [];
  } catch {
    emojiCategories = [];
  }
}

async function loadAdmins() {
  try {
    const data = await loadJson("data/admins.json");
    admins = Array.isArray(data.admins) ? data.admins : [];
  } catch {
    admins = [];
  }
}

const el = {
  authScreen: $("authScreen"), appRoot: $("appRoot"),
  tabLogin: $("tabLogin"), tabSignup: $("tabSignup"),
  loginForm: $("loginForm"), signupForm: $("signupForm"),
  loginEmail: $("loginEmail"), loginPassword: $("loginPassword"), loginBtn: $("loginBtn"),
  signupUsername: $("signupUsername"), signupEmail: $("signupEmail"), signupPassword: $("signupPassword"), signupBtn: $("signupBtn"),
  authError: $("authError"), myUsernameLabel: $("myUsernameLabel"),
  backToLobbyBtn: $("backToLobbyBtn"), notifBtn: $("notifBtn"), notifBadge: $("notifBadge"),
  notifDropdown: $("notifDropdown"), notifList: $("notifList"), markAllReadBtn: $("markAllReadBtn"),
  settingsBtn: $("settingsBtn"), profileBtn: $("profileBtn"), myPfpBtn: $("myPfpBtn"),
  statusDot: $("statusDot"), statusText: $("statusText"),
  lobbyView: $("lobbyView"), roomView: $("roomView"), roomGrid: $("roomGrid"),
  openCreateRoomBtn: $("openCreateRoomBtn"),
  onlineCount: $("onlineCount"), offlineCount: $("offlineCount"),
  capacityLabel: $("capacityLabel"), userList: $("userList"), offlineList: $("offlineList"),
  adminPanel: $("adminPanel"), adminPanelTitle: $("adminPanelTitle"),
  kickPanelBtn: $("kickPanelBtn"), roomSettingsBtn: $("roomSettingsBtn"),
  togglePinBtn: $("togglePinBtn"), toggleForeverBtn: $("toggleForeverBtn"), wipeRoomBtn: $("wipeRoomBtn"),
  chatHeadTitle: $("chatHeadTitle"), chatHeadLock: $("chatHeadLock"), chatHeadPublic: $("chatHeadPublic"),
  chatHeadForever: $("chatHeadForever"),
  adminBadge: $("adminBadge"),
  chatContainer: $("chatContainer"), emptyState: $("emptyState"),
  messageInput: $("messageInput"), fileInput: $("fileInput"), fileLabel: $("fileLabel"),
  sendBtn: $("sendBtn"), toastEl: $("toast"),
  replyBar: $("replyBar"), replyBarName: $("replyBarName"), replyBarPreview: $("replyBarPreview"), replyBarCancel: $("replyBarCancel"),
  filePreview: $("filePreview"), filePreviewImg: $("filePreviewImg"), filePreviewVideo: $("filePreviewVideo"),
  filePreviewName: $("filePreviewName"), filePreviewRemove: $("filePreviewRemove"),
  dmPanel: $("dmPanel"), dmHeadTitle: $("dmHeadTitle"), dmCloseBtn: $("dmCloseBtn"),
  dmMessages: $("dmMessages"), dmEmptyState: $("dmEmptyState"),
  dmReplyBar: $("dmReplyBar"), dmReplyBarName: $("dmReplyBarName"), dmReplyBarPreview: $("dmReplyBarPreview"), dmReplyBarCancel: $("dmReplyBarCancel"),
  dmFilePreview: $("dmFilePreview"), dmFilePreviewImg: $("dmFilePreviewImg"), dmFilePreviewVideo: $("dmFilePreviewVideo"),
  dmFilePreviewName: $("dmFilePreviewName"), dmFilePreviewRemove: $("dmFilePreviewRemove"),
  dmInput: $("dmInput"), dmFileInput: $("dmFileInput"), dmSendBtn: $("dmSendBtn"), dmFileLabel: $("dmFileLabel"),
  mentionAutocomplete: $("mentionAutocomplete"),
  scrollBottomChat: $("scrollBottomChat"),
  scrollBottomDm: $("scrollBottomDm"),
  userProfileModal: $("userProfileModal"),
  userProfileBanner: $("userProfileBanner"),
  userProfileAvatar: $("userProfileAvatar"),
  userProfileStatusDot: $("userProfileStatusDot"),
  userProfileBlockBadge: $("userProfileBlockBadge"),
  userProfileName: $("userProfileName"),
  userProfileHandle: $("userProfileHandle"),
  userProfileCustomStatus: $("userProfileCustomStatus"),
  userProfileBadges: $("userProfileBadges"),
  userProfileBio: $("userProfileBio"),
  userProfileActivity: $("userProfileActivity"),
  userProfileActivityLabel: $("userProfileActivityLabel"),
  userProfileActivityTitle: $("userProfileActivityTitle"),
  userProfileActivityArtist: $("userProfileActivityArtist"),
  userProfileActivityCurrent: $("userProfileActivityCurrent"),
  userProfileActivityTotal: $("userProfileActivityTotal"),
  userProfileActivityFill: $("userProfileActivityFill"),
  userProfileMeta: $("userProfileMeta"),
  userProfileDmBtn: $("userProfileDmBtn"),
  userProfileBlockBtn: $("userProfileBlockBtn"),
  userProfileKickBtn: $("userProfileKickBtn"),
  userProfileCloseBtn: $("userProfileCloseBtn"),
  profileModal: $("profileModal"), myProfileAvatar: $("myProfileAvatar"), profileBanner: $("profileBanner"),
  profileHeroName: $("profileHeroName"), profileHandle: $("profileHandle"),
  profileCustomStatus: $("profileCustomStatus"), myProfileBio: $("myProfileBio"),
  profileHeroMeta: $("profileHeroMeta"),
  profileBadges: $("profileBadges"), profileMoreBtn: $("profileMoreBtn"),
  openEditProfileBtn: $("openEditProfileBtn"), cancelProfileBtn: $("cancelProfileBtn"),
  editProfileModal: $("editProfileModal"), editProfileBanner: $("editProfileBanner"),
  editProfileAvatar: $("editProfileAvatar"),
  editUsername: $("editUsername"), editPronouns: $("editPronouns"),
  editBio: $("editBio"), editPfp: $("editPfp"), editBanner: $("editBanner"),
  editNameColor: $("editNameColor"), editAccentColor: $("editAccentColor"),
  saveProfileBtn: $("saveProfileBtn"), cancelEditProfileBtn: $("cancelEditProfileBtn"), profileError: $("profileError"),
  saveProfileColorsBtn: $("saveProfileColorsBtn"),
  statusModal: $("statusModal"), statusInput: $("statusInput"),
  saveStatusBtn: $("saveStatusBtn"), cancelStatusBtn: $("cancelStatusBtn"),
  blockUserModal: $("blockUserModal"), blockUserSelect: $("blockUserSelect"),
  confirmBlockBtn: $("confirmBlockBtn"), cancelBlockBtn: $("cancelBlockBtn"),
  profileMoreMenuModal: $("profileMoreMenuModal"), profileMoreMenu: $("profileMoreMenu"),
  createRoomModal: $("createRoomModal"), createRoomCodeInput: $("createRoomCodeInput"),
  createRoomName: $("createRoomName"), createRoomMax: $("createRoomMax"), createRoomPassword: $("createRoomPassword"),
  createRoomPinned: $("createRoomPinned"), createRoomForever: $("createRoomForever"),
  createRoomBtn: $("createRoomBtn"), cancelCreateRoomBtn: $("cancelCreateRoomBtn"), createRoomError: $("createRoomError"),
  passwordModal: $("passwordModal"), passwordRoomCode: $("passwordRoomCode"), joinRoomPassword: $("joinRoomPassword"),
  submitPasswordBtn: $("submitPasswordBtn"), cancelPasswordBtn: $("cancelPasswordBtn"), passwordError: $("passwordError"),
  kickedModal: $("kickedModal"), kickedList: $("kickedList"), closeKickedBtn: $("closeKickedBtn"),
  roomSettingsModal: $("roomSettingsModal"), settingsRoomName: $("settingsRoomName"),
  settingsRoomMax: $("settingsRoomMax"), settingsRoomPassword: $("settingsRoomPassword"),
  settingsRoomPinned: $("settingsRoomPinned"), settingsRoomForever: $("settingsRoomForever"),
  saveRoomSettingsBtn: $("saveRoomSettingsBtn"), cancelRoomSettingsBtn: $("cancelRoomSettingsBtn"),
  deleteRoomBtn: $("deleteRoomBtn"), roomSettingsError: $("roomSettingsError"),
  settingsModal: $("settingsModal"), themeSelect: $("themeSelect"), languageSelect: $("languageSelect"),
  currentPassword: $("currentPassword"), newPassword: $("newPassword"),
  changePasswordBtn: $("changePasswordBtn"), logoutBtn2: $("logoutBtn2"),
  closeSettingsBtn: $("closeSettingsBtn"), settingsError: $("settingsError"),
  presetGrid: $("presetGrid"), colorGrid: $("colorGrid"),
  openAdvancedCssBtn: $("openAdvancedCssBtn"), resetAppearanceBtn: $("resetAppearanceBtn"),
  advancedCssModal: $("advancedCssModal"),
  customCssInput: $("customCssInput"),
  customHtmlInput: $("customHtmlInput"),
  customJsInput: $("customJsInput"),
  saveCustomCssBtn: $("saveCustomCssBtn"), cancelCustomCssBtn: $("cancelCustomCssBtn"), clearCustomCssBtn: $("clearCustomCssBtn"),
  insertVarsBtn: $("insertVarsBtn"),
  reactionPickerModal: $("reactionPickerModal"), reactionPicker: $("reactionPicker"), cancelReactionPicker: $("cancelReactionPicker"),
  reactionSearch: $("reactionSearch"),
  moreMenuModal: $("moreMenuModal"), moreMenu: $("moreMenu")
};

applyIconMask($("notifIcon"), "bell");
applyIconMask($("settingsIcon"), "gear");
applyIconMask($("paperclipIcon"), "paperclip");
applyIconMask($("dmPaperclipIcon"), "paperclip");
applyIconMask($("editPfpIcon"), "pencil");
applyIconMask($("editBannerIcon"), "image");
applyIconMask($("emptyIcon"), "chat");
applyIconMask($("sendIcon"), "send");
applyIconMask($("dmSendIcon"), "send");

function showToast(msg) {
  if (!el.toastEl) return;
  el.toastEl.textContent = msg;
  el.toastEl.classList.add("show");
  setTimeout(() => el.toastEl.classList.remove("show"), 2200);
}

function setStatus(on_) {
  if (el.statusDot) el.statusDot.classList.toggle("online", on_);
  if (el.statusText) el.statusText.textContent = on_ ? "connected" : "disconnected";
  if (el.messageInput) el.messageInput.disabled = !on_;
  if (el.fileInput) el.fileInput.disabled = !on_;
  if (el.sendBtn) el.sendBtn.disabled = !on_;
  if (el.fileLabel) {
    el.fileLabel.style.opacity = on_ ? "1" : "0.5";
    el.fileLabel.style.pointerEvents = on_ ? "auto" : "none";
  }
}

function resetChatUI() {
  if (!el.chatContainer || !el.emptyState) return;
  el.chatContainer.innerHTML = "";
  el.chatContainer.appendChild(el.emptyState);
  el.emptyState.style.display = "flex";
  state.lastGroupEl = null; state.lastGroupUid = null; state.lastGroupTime = 0;
  setReply(null);
}

function resetDmUI() {
  if (!el.dmMessages || !el.dmEmptyState) return;
  el.dmMessages.innerHTML = "";
  el.dmMessages.appendChild(el.dmEmptyState);
  el.dmEmptyState.style.display = "flex";
  state.dmLastGroupEl = null; state.dmLastGroupUid = null; state.dmLastGroupTime = 0;
  setDmReply(null);
}

const hideEmpty = () => { if (el.emptyState && el.emptyState.parentNode === el.chatContainer) el.emptyState.style.display = "none"; };
const hideDmEmpty = () => { if (el.dmEmptyState && el.dmEmptyState.parentNode === el.dmMessages) el.dmEmptyState.style.display = "none"; };
const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

function isAtBottom(container) {
  if (!container) return true;
  return container.scrollTop + container.clientHeight >= container.scrollHeight - 80;
}

function scrollIfAtBottom(container, wasAtBottom) {
  if (container && wasAtBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

function updateScrollButtons() {
  if (el.chatContainer && el.scrollBottomChat) {
    const show = !isAtBottom(el.chatContainer) && el.chatContainer.scrollHeight > el.chatContainer.clientHeight + 20;
    el.scrollBottomChat.classList.toggle("hidden", !show);
  }
  if (el.dmMessages && el.scrollBottomDm) {
    const show = !isAtBottom(el.dmMessages) && el.dmMessages.scrollHeight > el.dmMessages.clientHeight + 20;
    el.scrollBottomDm.classList.toggle("hidden", !show);
  }
}

on(el.chatContainer, "scroll", updateScrollButtons);
on(el.dmMessages, "scroll", updateScrollButtons);

on(el.scrollBottomChat, "click", () => {
  if (el.chatContainer) el.chatContainer.scrollTop = el.chatContainer.scrollHeight;
  updateScrollButtons();
});

on(el.scrollBottomDm, "click", () => {
  if (el.dmMessages) el.dmMessages.scrollTop = el.dmMessages.scrollHeight;
  updateScrollButtons();
});

function defaultPfp(name) {
  const letter = (name || "?").trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='#241a1a'/><text x='16' y='22' font-family='Tahoma' font-size='18' text-anchor='middle' fill='#d94a4a'>${letter}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function botPfp() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='#5865f2'/><circle cx='11' cy='14' r='2.4' fill='#fff'/><circle cx='21' cy='14' r='2.4' fill='#fff'/><rect x='10' y='20' width='12' height='2.5' rx='1' fill='#fff'/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function bannerStyle(accent, bannerImage) {
  if (bannerImage) {
    return `background-image: url('${bannerImage}'); background-size: cover; background-position: center;`;
  }
  const a = accent || "#8c5aff";
  return `background: linear-gradient(135deg, ${a}, ${a}88);`;
}

function memberSince(createdAt) {
  if (!createdAt) return "Unknown";
  try {
    return new Date(createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  } catch { return "Unknown"; }
}

async function fetchUser(uid) {
  if (uid === BOT_UID) return { uid: BOT_UID, username: "IlloComoVamos", pfp: botPfp(), bio: "System bot", nameColor: "", accentColor: "", status: "", pronouns: "", bannerImage: "", createdAt: null };
  const cached = state.userCache.get(uid);
  if (cached) return cached;
  try {
    const snap = await get(ref(db, `users/${uid}`));
    const d = snap.val() || {};
    const p = {
      uid,
      username: d.username || "user",
      pfp: d.pfp || defaultPfp(d.username),
      bio: d.bio || "",
      createdAt: d.createdAt || null,
      nameColor: d.nameColor || "",
      accentColor: d.accentColor || "",
      status: d.status || "",
      pronouns: d.pronouns || "",
      bannerImage: d.bannerImage || ""
    };
    state.userCache.set(uid, p);
    return p;
  } catch {
    const f = { uid, username: "user", pfp: defaultPfp("?"), bio: "", nameColor: "", accentColor: "", status: "", pronouns: "", bannerImage: "", createdAt: null };
    state.userCache.set(uid, f);
    return f;
  }
}

const isAdmin = () => state.me && state.roomMeta && state.roomMeta.adminUid === state.me.uid;
const isGlobalAdmin = () => state.me && state.admins.includes(state.me.uid);
const canModerate = () => isAdmin() || isGlobalAdmin();

function updateAdminUI() {
  const a = canModerate();
  if (el.adminBadge) el.adminBadge.classList.toggle("hidden", !a);
  if (el.adminPanel) el.adminPanel.classList.toggle("hidden", !a);
  if (el.adminPanelTitle) el.adminPanelTitle.classList.toggle("hidden", !a);
}

const updateMyPfp = () => { if (el.myPfpBtn && state.me) el.myPfpBtn.src = state.me.pfp || defaultPfp(state.me.username); };

function showLobby() {
  try { closeDm(); } catch (e) {}
  if (el.lobbyView) el.lobbyView.classList.remove("hidden");
  if (el.roomView) el.roomView.classList.add("hidden");
  if (el.backToLobbyBtn) el.backToLobbyBtn.classList.add("hidden");
  setStatus(false);
}

function showRoom() {
  if (el.lobbyView) el.lobbyView.classList.add("hidden");
  if (el.roomView) el.roomView.classList.remove("hidden");
  if (el.backToLobbyBtn) el.backToLobbyBtn.classList.remove("hidden");
  setStatus(true);
}

function setReply(target) {
  state.reply = target;
  if (!el.replyBar) return;
  if (target) {
    el.replyBarName.textContent = target.username;
    el.replyBarPreview.textContent = target.previewText || "";
    el.replyBar.classList.remove("hidden");
  } else el.replyBar.classList.add("hidden");
}

function setDmReply(target) {
  state.dmReply = target;
  if (!el.dmReplyBar) return;
  if (target) {
    el.dmReplyBarName.textContent = target.username;
    el.dmReplyBarPreview.textContent = target.previewText || "";
    el.dmReplyBar.classList.remove("hidden");
  } else el.dmReplyBar.classList.add("hidden");
}

const clearReply = () => setReply(null);
const clearDmReply = () => setDmReply(null);

function buildPresetGrid() {
  if (!el.presetGrid) return;
  el.presetGrid.innerHTML = "";
  for (const [name, colors] of Object.entries(PRESETS)) {
    const btn = document.createElement("button");
    btn.className = "preset-btn";
    const swatches = ["bg", "accent", "name", "text"].map(k =>
      `<span class="preset-swatch" style="background:${colors[k]}"></span>`).join("");
    btn.innerHTML = `<div class="preset-swatches">${swatches}</div><div class="preset-name">${name}</div>`;
    btn.addEventListener("click", () => {
      appearance = { ...colors };
      saveAppearance();
      applyAppearance();
      buildColorGrid();
      showToast("Preset applied: " + name);
    });
    el.presetGrid.appendChild(btn);
  }
}

function buildColorGrid() {
  if (!el.colorGrid) return;
  el.colorGrid.innerHTML = "";
  for (const { key, label } of COLOR_VARS) {
    const current = appearance[key] || "";
    const row = document.createElement("div");
    row.className = "color-row";
    const fallback = getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim() || "#000000";
    const val = current || fallback;
    row.innerHTML = `<label>${label}</label><input type="color" value="${val}"><input type="text" value="${val}">`;
    const picker = row.querySelector('input[type="color"]');
    const hex = row.querySelector('input[type="text"]');
    picker.addEventListener("input", () => {
      const v = picker.value;
      hex.value = v;
      appearance[key] = v;
      saveAppearance();
      applyAppearance();
    });
    hex.addEventListener("change", () => {
      let v = hex.value.trim();
      if (!v.startsWith("#")) v = "#" + v;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        picker.value = v;
        appearance[key] = v;
        saveAppearance();
        applyAppearance();
      } else hex.value = appearance[key] || fallback;
    });
    el.colorGrid.appendChild(row);
  }
}

function generateVarsTemplate() {
  const lines = [":root {"];
  for (const { key, label } of COLOR_VARS) {
    const v = appearance[key] || getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim() || "#000000";
    lines.push(`  --${key}: ${v}; /* ${label} */`);
  }
  lines.push("}");
  return lines.join("\n");
}

function spamCheck() {
  const now = Date.now();
  state.spamTracker = state.spamTracker.filter(ts => now - ts < SPAM_WINDOW_MS);
  if (state.spamTracker.length >= SPAM_MAX) {
    showToast(t("spamWarning"));
    return false;
  }
  state.spamTracker.push(now);
  return true;
}

on(el.tabLogin, "click", () => {
  el.tabLogin.classList.add("active"); el.tabSignup.classList.remove("active");
  el.loginForm.classList.remove("hidden"); el.signupForm.classList.add("hidden");
  el.authError.textContent = "";
});

on(el.tabSignup, "click", () => {
  el.tabSignup.classList.add("active"); el.tabLogin.classList.remove("active");
  el.signupForm.classList.remove("hidden"); el.loginForm.classList.add("hidden");
  el.authError.textContent = "";
});

on(el.loginBtn, "click", async () => {
  el.authError.textContent = "";
  const email = el.loginEmail.value.trim(), pass = el.loginPassword.value;
  if (!email || !pass) return el.authError.textContent = "Fill in all fields";
  try { await signInWithEmailAndPassword(auth, email, pass); }
  catch (e) { el.authError.textContent = e.message.replace("Firebase: ", ""); }
});

on(el.signupBtn, "click", async () => {
  el.authError.textContent = "";
  const username = el.signupUsername.value.trim();
  const email = el.signupEmail.value.trim();
  const pass = el.signupPassword.value;
  if (!username || !email || !pass) return el.authError.textContent = "Fill in all fields";
  if (username.length < 2 || username.length > 24) return el.authError.textContent = "Username must be 2–24 chars";
  if (pass.length < 6) return el.authError.textContent = "Password must be 6+ chars";
  try {
    window.__signupInProgress = true;
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await set(ref(db, `users/${cred.user.uid}`), { username, bio: "", pfp: "", nameColor: "", accentColor: "", status: "", pronouns: "", bannerImage: "", createdAt: serverTimestamp() });
    state.userCache.delete(cred.user.uid);
  } catch (e) {
    window.__signupInProgress = false;
    el.authError.textContent = e.message.replace("Firebase: ", "");
  }
});

on(el.logoutBtn2, "click", async () => {
  await detachFromRoom();
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    state.me = null;
    window.__signupInProgress = false;
    if (state.notifOff) { state.notifOff(); state.notifOff = null; }
    if (state.sweepId) { clearInterval(state.sweepId); state.sweepId = null; }
    if (state.cleanId) { clearInterval(state.cleanId); state.cleanId = null; }
    if (state.heartbeatId) { clearInterval(state.heartbeatId); state.heartbeatId = null; }
    if (state.lobbyOff) { state.lobbyOff(); state.lobbyOff = null; }
    if (el.authScreen) el.authScreen.classList.remove("hidden");
    if (el.appRoot) el.appRoot.classList.add("hidden");
    return;
  }

  if (!Object.keys(translations).length) {
    await Promise.all([loadLanguages(), loadEmojis(), loadAdmins()]);
    applyTranslations();
  }
  if (!admins.length) await loadAdmins();
  state.admins = admins;

  if (window.__signupInProgress) {
    for (let i = 0; i < 30; i++) {
      const s = await get(ref(db, `users/${user.uid}`));
      if (s.exists()) break;
      await new Promise(r => setTimeout(r, 100));
    }
    window.__signupInProgress = false;
  }

  const snap = await get(ref(db, `users/${user.uid}`));
  let d = snap.val();
  if (!d) {
    const fallback = (user.email || "").split("@")[0].slice(0, 16) || "user";
    d = { username: fallback, bio: "", pfp: "", nameColor: "", accentColor: "", status: "", pronouns: "", bannerImage: "" };
    await set(ref(db, `users/${user.uid}`), d);
  }

  state.me = {
    uid: user.uid, email: user.email,
    username: d.username || "user", pfp: d.pfp || "", bio: d.bio || "",
    createdAt: d.createdAt || null, nameColor: d.nameColor || "", accentColor: d.accentColor || "",
    status: d.status || "", pronouns: d.pronouns || "", bannerImage: d.bannerImage || ""
  };
  if (el.myUsernameLabel) el.myUsernameLabel.textContent = state.me.username;
  updateMyPfp();

  state.blocked = new Set();
  const bSnap = await get(ref(db, `blocks/${state.me.uid}`));
  Object.keys(bSnap.val() || {}).forEach(uid => state.blocked.add(uid));

  if (el.authScreen) el.authScreen.classList.add("hidden");
  if (el.appRoot) el.appRoot.classList.remove("hidden");
  showLobby();

  await ensurePublicRoom();
  startLobbyListener();
  startNotificationListener();
  startSweeper();
});

async function ensurePublicRoom() {
  try {
    const s = await get(ref(db, `rooms/${PUBLIC_ROOM}`));
    if (!s.exists()) {
      await set(ref(db, `rooms/${PUBLIC_ROOM}`), {
        name: "Public Lobby", adminUid: "system", hasPassword: false, passwordHash: "",
        maxUsers: 500, kicked: {}, isPublic: true, pinned: true, forever: true, createdAt: serverTimestamp()
      });
    }
  } catch (e) {}
}

function startSweeper() {
  if (state.sweepId) clearInterval(state.sweepId);
  state.sweepId = setInterval(sweepRooms, SWEEP_MS);
  setTimeout(sweepRooms, 5000);
}

async function sweepRooms() {
  if (!state.me) return;
  try {
    const rs = await get(ref(db, "rooms"));
    const rooms = rs.val() || {};
    const now = Date.now();
    for (const [code, room] of Object.entries(rooms)) {
      if (code === PUBLIC_ROOM || room.isPublic) continue;
      if (room.pinned || room.forever) continue;
      if (!room.adminUid || room.adminUid === "system") continue;
      const p = await getPresenceCount(code);
      if (p > 0) continue;
      let last = room.createdAt || 0;
      try {
        const lm = await get(query(ref(db, `chats/${code}/messages`), limitToLast(1)));
        const arr = lm.val();
        if (arr) {
          const msg = Object.values(arr)[0];
          if (msg?.timestamp > last) last = msg.timestamp;
        }
      } catch {}
      if (room.lastActivity > last) last = room.lastActivity;
      if (now - last > EMPTY_TTL) {
        try {
          await remove(ref(db, `rooms/${code}`));
          await remove(ref(db, `chats/${code}`));
          presenceCountCache.delete(code);
        } catch {}
      }
    }
  } catch (e) {}
}

async function cleanRoomMessages() {
  if (!state.me || !state.roomCode) return;
  try {
    const snap = await get(query(ref(db, `chats/${state.roomCode}/messages`), limitToLast(200)));
    const data = snap.val() || {};
    const now = Date.now();
    const entries = Object.entries(data);
    const toDelete = [];
    for (const [id, msg] of entries) {
      if (msg.timestamp && now - msg.timestamp > MSG_TTL_MS) toDelete.push(id);
    }
    const remaining = entries.length - toDelete.length;
    if (remaining > MSG_MAX) {
      const sorted = entries.filter(([id]) => !toDelete.includes(id))
        .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
      const extra = remaining - MSG_MAX;
      for (let i = 0; i < extra; i++) toDelete.push(sorted[i][0]);
    }
    for (const id of toDelete) {
      try { await remove(ref(db, `chats/${state.roomCode}/messages/${id}`)); } catch {}
    }
  } catch (e) {}
  await cleanStalePresence();
}

async function cleanStalePresence() {
  if (!state.me || !state.roomCode) return;
  try {
    const snap = await get(ref(db, `chats/${state.roomCode}/presence`));
    const data = snap.val() || {};
    const now = Date.now();
    for (const [uid, entry] of Object.entries(data)) {
      if (!entry?.joinedAt) continue;
      if (uid === state.me.uid) continue;
      if (now - entry.joinedAt > PRESENCE_STALE_MS) {
        try { await remove(ref(db, `chats/${state.roomCode}/presence/${uid}`)); } catch {}
      }
    }
  } catch (e) {}
}

function startLobbyListener() {
  if (state.lobbyOff) state.lobbyOff();
  state.lobbyOff = onValue(ref(db, "rooms"),
    (snap) => scheduleLobbyRender(snap.val() || {}),
    (err) => {
      if (el.roomGrid) el.roomGrid.innerHTML = '<p class="lobby-empty">Could not load rooms.</p>';
    }
  );
}

const scheduleLobbyRender = debounce(async (rooms) => {
  const token = ++state.lobbyToken;
  const codes = Object.keys(rooms);
  if (!codes.length) {
    if (el.roomGrid) el.roomGrid.innerHTML = '<p class="lobby-empty">No rooms yet. Create one.</p>';
    state.roomCards.clear();
    return;
  }
  if (el.roomGrid) el.roomGrid.querySelector(".lobby-empty")?.remove();

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
      if (el.roomGrid) el.roomGrid.appendChild(card);
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
    if (!present.has(code)) { node.remove(); state.roomCards.delete(code); }
  }
  for (const code of codes) {
    const card = state.roomCards.get(code);
    if (card && el.roomGrid) el.roomGrid.appendChild(card);
  }
}, 60);

on(el.roomGrid, "click", (e) => {
  const card = e.target.closest(".room-card");
  if (card?.dataset.code) requestJoinRoom(card.dataset.code);
});

on(el.openCreateRoomBtn, "click", () => {
  el.createRoomCodeInput.value = "";
  el.createRoomName.value = "";
  el.createRoomMax.value = "20";
  el.createRoomPassword.value = "";
  el.createRoomPinned.checked = false;
  el.createRoomForever.checked = false;
  el.createRoomPinned.parentElement.style.display = canModerate() ? "flex" : "none";
  el.createRoomForever.parentElement.style.display = canModerate() ? "flex" : "none";
  el.createRoomError.textContent = "";
  el.createRoomModal.classList.remove("hidden");
});

async function requestJoinRoom(code) {
  const rs = await get(ref(db, `rooms/${code}`));
  if (!rs.exists()) return showToast("That room no longer exists");
  const room = rs.val();
  if (room.kicked?.[state.me.uid] && !isGlobalAdmin()) return showToast(t("kickedToast"));
  const max = room.maxUsers || 50;
  const pSnap = await get(ref(db, `chats/${code}/presence`));
  const pData = pSnap.val() || {};
  const inRoom = !!pData[state.me.uid];
  const count = Object.keys(pData).length;
  if (!inRoom && count >= max) return showToast(`Room is full (${count}/${max})`);
  if (room.hasPassword && !isGlobalAdmin()) {
    el.passwordRoomCode.textContent = code;
    el.joinRoomPassword.value = "";
    el.passwordError.textContent = "";
    el.passwordModal.classList.remove("hidden");
    return;
  }
  await enterRoom(code, room);
}

on(el.createRoomBtn, "click", async () => {
  const code = el.createRoomCodeInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const name = el.createRoomName.value.trim() || code;
  const max = parseInt(el.createRoomMax.value, 10) || 20;
  const pw = el.createRoomPassword.value;
  const pinned = canModerate() && el.createRoomPinned.checked;
  const forever = canModerate() && el.createRoomForever.checked;
  el.createRoomError.textContent = "";
  if (code.length < 2) return el.createRoomError.textContent = "Code must be 2+ chars (a-z, 0-9, -, _)";
  if (code === PUBLIC_ROOM) return el.createRoomError.textContent = "That code is reserved";
  if (name.length > 40) return el.createRoomError.textContent = "Name too long";
  if (max < 2 || max > 500) return el.createRoomError.textContent = "Max users must be 2–500";
  const ex = await get(ref(db, `rooms/${code}`));
  if (ex.exists()) return el.createRoomError.textContent = "That code is taken";
  const meta = {
    name, adminUid: state.me.uid, createdAt: serverTimestamp(), lastActivity: Date.now(),
    hasPassword: !!pw, passwordHash: pw ? hashPassword(pw) : "", maxUsers: max, kicked: {},
    pinned: !!pinned, forever: !!forever
  };
  try {
    await set(ref(db, `rooms/${code}`), meta);
    el.createRoomModal.classList.add("hidden");
    showToast("Room created");
    await enterRoom(code, { ...meta, hasPassword: !!pw });
  } catch (e) { el.createRoomError.textContent = e.message; }
});

on(el.cancelCreateRoomBtn, "click", () => el.createRoomModal.classList.add("hidden"));

on(el.submitPasswordBtn, "click", async () => {
  const code = el.passwordRoomCode.textContent;
  const pw = el.joinRoomPassword.value;
  el.passwordError.textContent = "";
  const rs = await get(ref(db, `rooms/${code}`));
  const room = rs.val();
  if (!room) return el.passwordError.textContent = "Room disappeared";
  if (room.passwordHash !== hashPassword(pw)) return el.passwordError.textContent = "Wrong password";
  if (room.kicked?.[state.me.uid] && !isGlobalAdmin()) return el.passwordError.textContent = t("kickedToast");
  const max = room.maxUsers || 50;
  const c = await getPresenceCount(code);
  if (c >= max) return el.passwordError.textContent = `Room is full (${c}/${max})`;
  el.passwordModal.classList.add("hidden");
  await enterRoom(code, room);
});

on(el.cancelPasswordBtn, "click", () => el.passwordModal.classList.add("hidden"));

async function enterRoom(code, roomMeta) {
  if (state.enteringRoom) return;
  if (state.roomCode === code) return;
  state.enteringRoom = true;
  try {
    await detachFromRoom();
    state.roomCode = code;
    state.roomMeta = roomMeta;
    state.roomRef = ref(db, `chats/${code}/messages`);
    state.queryRef = query(state.roomRef, limitToLast(100));
    closeDm();
    resetChatUI();
    showRoom();
    updateAdminUI();
    if (el.chatHeadTitle) el.chatHeadTitle.textContent = "# " + (roomMeta.name || code);
    if (el.chatHeadLock) el.chatHeadLock.classList.toggle("hidden", !roomMeta.hasPassword);
    if (el.chatHeadPublic) el.chatHeadPublic.classList.toggle("hidden", !(roomMeta.isPublic || code === PUBLIC_ROOM));
    if (el.chatHeadForever) el.chatHeadForever.classList.toggle("hidden", !roomMeta.forever);
    try { update(ref(db, `rooms/${code}`), { lastActivity: Date.now() }); } catch {}
    if (el.capacityLabel) el.capacityLabel.textContent = "/ " + (roomMeta.maxUsers || 50);

    const renderedIds = new Set();

    try {
      const initialSnap = await get(state.queryRef);
      const initialData = initialSnap.val() || {};
      const sorted = Object.entries(initialData).sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
      for (const [id, msg] of sorted) {
        if (state.blocked.has(msg.uid)) continue;
        renderedIds.add(id);
        renderMessage(el.chatContainer, id, msg, msg.uid === state.me.uid, false);
      }
      if (sorted.length) hideEmpty();
      el.chatContainer.scrollTop = el.chatContainer.scrollHeight;
    } catch (e) {}

    const handler = (snapshot) => {
      if (renderedIds.has(snapshot.key)) return;
      renderedIds.add(snapshot.key);
      const msg = snapshot.val();
      if (!msg || state.blocked.has(msg.uid)) return;
      const wasAtBottom = isAtBottom(el.chatContainer);
      renderMessage(el.chatContainer, snapshot.key, msg, msg.uid === state.me.uid, false);
      hideEmpty();
      scrollIfAtBottom(el.chatContainer, wasAtBottom);
      updateScrollButtons();
    };
    onChildAdded(state.queryRef, handler);
    state.groupOff = () => off(state.queryRef, "child_added", handler);

    state.presenceRef = ref(db, `chats/${code}/presence/${state.me.uid}`);
    await set(state.presenceRef, { username: state.me.username, joinedAt: serverTimestamp() });
    await set(ref(db, `chats/${code}/seen/${state.me.uid}`), {
      username: state.me.username, lastSeen: serverTimestamp()
    });
    onDisconnect(state.presenceRef).remove();

    if (state.heartbeatId) clearInterval(state.heartbeatId);
    state.heartbeatId = setInterval(() => {
      if (state.roomCode !== code || !state.presenceRef) return;
      update(state.presenceRef, { joinedAt: serverTimestamp() }).catch(() => {});
    }, HEARTBEAT_MS);

    state.presenceOff = onValue(ref(db, `chats/${code}/presence`), (snap) => {
      state.presenceData = snap.val() || {};
      renderUserList();
    });

    state.seenOff = onValue(ref(db, `chats/${code}/seen`), (snap) => {
      state.seenData = snap.val() || {};
      renderUserList();
    });

    state.kickedOff = onValue(ref(db, `rooms/${code}/kicked/${state.me.uid}`), async (snap) => {
      if (snap.val() === true && state.roomCode === code && !isGlobalAdmin()) {
        showToast(t("kickedToast"));
        await detachFromRoom();
        resetChatUI();
        showLobby();
      }
    });

    pushAdvisory(code);
    if (state.cleanId) clearInterval(state.cleanId);
    state.cleanId = setInterval(cleanRoomMessages, AUTO_CLEAN_MS);
    setTimeout(cleanRoomMessages, 5000);
    updateScrollButtons();
  } finally {
    state.enteringRoom = false;
  }
}

async function pushAdvisory(code) {
  try {
    const existing = await get(ref(db, `chats/${code}/advisoryShown`));
    if (existing.exists()) return;
    await set(ref(db, `chats/${code}/advisoryShown`), true);
    await push(ref(db, `chats/${code}/messages`), {
      uid: BOT_UID, bot: true,
      text: encryptText("👋 Hi! I'm the room bot. Type !help to see commands. Messages auto-delete after 15 minutes.", code),
      timestamp: serverTimestamp()
    });
  } catch (e) {}
}

async function botSay(code, plainText) {
  try {
    await push(ref(db, `chats/${code}/messages`), {
      uid: BOT_UID, bot: true,
      text: encryptText(plainText, code),
      timestamp: serverTimestamp()
    });
  } catch (e) {}
}

async function detachFromRoom() {
  if (state.groupOff) { state.groupOff(); state.groupOff = null; }
  if (state.presenceOff) { state.presenceOff(); state.presenceOff = null; }
  if (state.seenOff) { state.seenOff(); state.seenOff = null; }
  if (state.kickedOff) { state.kickedOff(); state.kickedOff = null; }
  if (state.cleanId) { clearInterval(state.cleanId); state.cleanId = null; }
  if (state.heartbeatId) { clearInterval(state.heartbeatId); state.heartbeatId = null; }
  if (state.reactionListeners) {
    state.reactionListeners.forEach(fn => { try { fn(); } catch (e) {} });
    state.reactionListeners = [];
  }
  if (state.presenceRef) { try { await remove(state.presenceRef); } catch {} state.presenceRef = null; }
  state.roomRef = null; state.queryRef = null; state.roomCode = null; state.roomMeta = null;
  state.presenceData = {}; state.seenData = {};
  updateAdminUI();
}

on(el.backToLobbyBtn, "click", async () => {
  try { closeDm(); } catch (e) {}
  await detachFromRoom();
  resetChatUI();
  showLobby();
});

function startNotificationListener() {
  if (state.notifOff) state.notifOff();
  state.notifOff = onValue(ref(db, `notifications/${state.me.uid}`), (snap) => {
    const data = snap.val() || {};
    state.notifications = Object.entries(data).map(([id, n]) => ({ id, ...n }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    state.unread = state.notifications.filter(n => !n.read).length;
    renderNotifications();
  });
}

function renderNotifications() {
  if (!el.notifBadge || !el.notifList) return;
  if (state.unread > 0) {
    el.notifBadge.textContent = state.unread > 99 ? "99+" : String(state.unread);
    el.notifBadge.classList.remove("hidden");
  } else el.notifBadge.classList.add("hidden");

  el.notifList.innerHTML = "";
  if (!state.notifications.length) {
    el.notifList.innerHTML = `<p class="notif-empty">${t("noNotifications")}</p>`;
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
  el.notifList.appendChild(frag);
}

on(el.notifList, "click", async (e) => {
  const item = e.target.closest(".notif-item");
  if (!item) return;
  const id = item.dataset.notifId;
  const n = state.notifications.find(x => x.id === id);
  if (!n) return;
  if (!n.read) try { update(ref(db, `notifications/${state.me.uid}/${n.id}`), { read: true }); } catch {}
  el.notifDropdown.classList.add("hidden");

  if (n.type === "dm") {
    if (n.fromUid && n.fromUid !== state.me.uid) {
      if (!state.roomCode) await requestJoinRoom(PUBLIC_ROOM);
      openDm(n.fromUid);
    }
    return;
  }

  if ((n.type === "mention" || n.type === "reply" || n.type === "everyone") && n.roomCode) {
    if (state.roomCode !== n.roomCode) {
      await requestJoinRoom(n.roomCode);
    }
    if (n.msgId) {
      setTimeout(() => jumpToMessage(n.msgId), 400);
    }
  }
});

function jumpToMessage(msgId) {
  const target = el.chatContainer.querySelector(`.msg-line[data-msg-id="${msgId}"]`);
  if (!target) {
    showToast("Message not in view (older than 100 messages)");
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("highlight");
  setTimeout(() => target.classList.remove("highlight"), 2500);
}

on(el.notifBtn, "click", (e) => {
  e.stopPropagation();
  el.notifDropdown.classList.toggle("hidden");
});

on(document, "click", (e) => {
  if (!el.notifDropdown) return;
  if (!el.notifDropdown.classList.contains("hidden") &&
      !el.notifDropdown.contains(e.target) &&
      !el.notifBtn.contains(e.target)) {
    el.notifDropdown.classList.add("hidden");
  }
});

on(el.markAllReadBtn, "click", async () => {
  const updates = {};
  for (const n of state.notifications) {
    if (!n.read) updates[`${n.id}/read`] = true;
  }
  if (Object.keys(updates).length) {
    try {
      await update(ref(db, `notifications/${state.me.uid}`), updates);
      showToast("Marked " + Object.keys(updates).length + " as read");
    } catch (e) { showToast("Could not mark read"); }
  }
});

async function pushNotification(targetUid, payload) {
  if (!targetUid || targetUid === state.me.uid || targetUid === BOT_UID) return;
  try { await push(ref(db, `notifications/${targetUid}`), { ...payload, read: false, timestamp: serverTimestamp() }); }
  catch (e) {}
}

const extractMentions = text => [...new Set([...text.matchAll(/@([A-Za-z0-9_]+)/g)].map(m => m[1].toLowerCase()))];
const hasEveryone = text => /@everyone\b/i.test(text);

function applyNameColor(span, profile) {
  if (profile && profile.nameColor) span.style.color = profile.nameColor;
}

function renderTextWithMentions(parent, text) {
  const parts = text.split(/(@everyone\b|@[A-Za-z0-9_]+)/gi);
  for (const part of parts) {
    if (!part) continue;
    if (/^@everyone$/i.test(part)) {
      const span = document.createElement("span");
      span.className = "mention-everyone";
      span.textContent = part;
      parent.appendChild(span);
    } else if (/^@[A-Za-z0-9_]+$/.test(part)) {
      const span = document.createElement("span");
      span.style.color = "#ffb347";
      span.style.fontWeight = "700";
      span.textContent = part;
      parent.appendChild(span);
    } else {
      parent.appendChild(document.createTextNode(part));
    }
  }
}

async function renderMessage(container, msgId, msg, isOwn, isDm) {
  const isBot = msg.uid === BOT_UID || msg.bot === true;
  const sender = isBot ? await fetchUser(BOT_UID) : await fetchUser(msg.uid);
  const now = msg.timestamp || Date.now();

  const groupEl = isDm ? state.dmLastGroupEl : state.lastGroupEl;
  const groupUid = isDm ? state.dmLastGroupUid : state.lastGroupUid;
  const groupTime = isDm ? state.dmLastGroupTime : state.lastGroupTime;

  const sameUser = groupUid === msg.uid;
  const withinWindow = (now - groupTime) < GROUP_MS;

  let plainText = "";
  if (msg.text) {
    const key = msg.dmKey || state.roomCode;
    plainText = decryptText(msg.text, key);
  }
  const mentionsEveryone = hasEveryone(plainText);
  const mentionedMe = !isDm && !isBot && plainText && state.me && extractMentions(plainText).includes(state.me.username.toLowerCase());

  if (!groupEl || !sameUser || !withinWindow) {
    const group = document.createElement("div");
    group.className = "msg-group" + (isOwn ? " own" : "") + (isBot ? " bot" : "");
    const head = document.createElement("div");
    head.className = "group-head";

    const pfp = document.createElement("img");
    pfp.className = "mini-pfp";
    pfp.src = sender.pfp || defaultPfp(sender.username);
    pfp.alt = "";
    pfp.style.cursor = "pointer";
    pfp.addEventListener("click", () => { if (!isBot) openUserProfile(msg.uid); });
    head.appendChild(pfp);

    const nameSpan = document.createElement("span");
    nameSpan.textContent = sender.username;
    applyNameColor(nameSpan, sender);
    nameSpan.style.cursor = "pointer";
    nameSpan.addEventListener("click", () => { if (!isBot) openUserProfile(msg.uid); });
    head.appendChild(nameSpan);

    if (isBot) {
      const botTag = document.createElement("span");
      botTag.className = "bot-tag";
      botTag.textContent = "BOT";
      head.appendChild(botTag);
    }

    const timeSpan = document.createElement("span");
    timeSpan.className = "group-time";
    timeSpan.textContent = fmtTime(msg.timestamp);
    head.appendChild(timeSpan);

    const body = document.createElement("div");
    body.className = "group-body";
    group.appendChild(head); group.appendChild(body);
    container.appendChild(group);
    if (isDm) { state.dmLastGroupEl = group; state.dmLastGroupUid = msg.uid; }
    else      { state.lastGroupEl = group; state.lastGroupUid = msg.uid; }
  }
  if (isDm) state.dmLastGroupTime = now; else state.lastGroupTime = now;

  const curGroup = isDm ? state.dmLastGroupEl : state.lastGroupEl;
  const body = curGroup.querySelector(".group-body");

  const line = document.createElement("div");
  line.className = "msg-line" + (mentionedMe || mentionsEveryone ? " mention" : "") + (isBot ? " advisory-line" : "");
  line.dataset.msgId = msgId;

  if (msg.replyTo?.uid) {
    const reply = document.createElement("div");
    reply.className = "reply-preview";
    reply.innerHTML = `<div class="rp-name">${esc(msg.replyTo.username || "user")}</div>
      <div class="rp-text">${esc(msg.replyTo.previewText || "[message]")}</div>`;
    line.appendChild(reply);
  }

  const contentWrap = document.createElement("div");
  contentWrap.style.display = "inline";
  if (plainText && plainText !== "[could not decrypt]") buildLineContent(contentWrap, plainText);
  else if (plainText) contentWrap.appendChild(document.createTextNode(plainText));
  line.appendChild(contentWrap);

  if (msg.mediaType && msg.mediaData) {
    const src = decryptText(msg.mediaData, msg.dmKey || state.roomCode);
    if (src?.startsWith("data:")) {
      if (msg.mediaType === "image" || msg.mediaType === "gif") {
        const img = document.createElement("img");
        img.src = src; img.loading = "lazy";
        line.appendChild(img);
        if (msg.mediaType === "gif") {
          const tag = document.createElement("span");
          tag.className = "gif-tag"; tag.textContent = "GIF";
          line.appendChild(tag);
        }
      } else if (msg.mediaType === "video") {
        const v = document.createElement("video");
        v.src = src; v.controls = true; v.preload = "metadata";
        line.appendChild(v);
      }
    }
  }

  const reactionsEl = document.createElement("div");
  reactionsEl.className = "reactions";
  line.appendChild(reactionsEl);

  const reactionsPath = isDm
    ? `${dmPath(state.me.uid, state.dmUid)}/${msgId}/reactions`
    : `chats/${state.roomCode}/messages/${msgId}/reactions`;

  const renderPills = (data) => {
    reactionsEl.innerHTML = "";
    if (!data) return;
    for (const [emoji, users] of Object.entries(data)) {
      if (!users) continue;
      const uids = Object.keys(users).filter(u => users[u] === true);
      if (!uids.length) continue;
      const pill = document.createElement("button");
      pill.className = "reaction-pill" + (state.me && users[state.me.uid] ? " mine" : "");
      pill.innerHTML = `<span>${emoji}</span><span class="count">${uids.length}</span>`;
      pill.title = uids.map(u => (state.userCache.get(u)?.username) || u.slice(0, 6)).join(", ");
      pill.addEventListener("click", () => toggleReaction(msgId, emoji, isDm));
      reactionsEl.appendChild(pill);
    }
  };

  const reactionsRef = ref(db, reactionsPath);
  const reactionsHandler = onValue(reactionsRef, (snap) => {
    renderPills(snap.val());
  });

  if (!state.reactionListeners) state.reactionListeners = [];
  state.reactionListeners.push(() => {
    try { off(reactionsRef, "value", reactionsHandler); } catch (e) {}
  });

  if (!isBot) {
    const actions = document.createElement("div");
    actions.className = "msg-actions";

    const reactBtn = document.createElement("button");
    reactBtn.title = "React";
    reactBtn.textContent = "😊";
    reactBtn.addEventListener("click", () => openReactionPicker(msgId, isDm));
    actions.appendChild(reactBtn);

    const replyBtn = document.createElement("button");
    replyBtn.title = "Reply";
    const replyIcon = document.createElement("span");
    replyIcon.className = "icon-img";
    applyIconMask(replyIcon, "reply");
    replyBtn.appendChild(replyIcon);
    replyBtn.addEventListener("click", () => {
      const target = { uid: msg.uid, username: sender.username, previewText: plainText ? plainText.slice(0, 80) : "[media]", msgId };
      if (isDm) setDmReply(target); else setReply(target);
      (isDm ? el.dmInput : el.messageInput).focus();
    });
    actions.appendChild(replyBtn);

    const moreBtn = document.createElement("button");
    moreBtn.title = "More";
    const moreIcon = document.createElement("span");
    moreIcon.className = "icon-img";
    applyIconMask(moreIcon, "more");
    moreBtn.appendChild(moreIcon);
    moreBtn.addEventListener("click", () => openMoreMenu(msgId, msg, isOwn, isDm, sender, plainText));
    actions.appendChild(moreBtn);

    line.appendChild(actions);
  }

  body.appendChild(line);
}

function openMoreMenu(msgId, msg, isOwn, isDm, sender, plainText) {
  el.moreMenu.innerHTML = "";

  const canDelete = isOwn || (canModerate() && !isDm);
  if (canDelete) {
    const del = document.createElement("button");
    del.className = "danger";
    del.textContent = "Delete Message";
    del.addEventListener("click", async () => {
      el.moreMenuModal.classList.add("hidden");
      if (!confirm("Delete this message?")) return;
      try {
        if (isDm) {
          await remove(ref(db, dmPath(state.me.uid, state.dmUid) + "/" + msgId));
        } else {
          await remove(ref(db, `chats/${state.roomCode}/messages/${msgId}`));
        }
        const line = el.chatContainer.querySelector(`.msg-line[data-msg-id="${msgId}"]`) ||
                     el.dmMessages.querySelector(`.msg-line[data-msg-id="${msgId}"]`);
        if (line) line.remove();
      } catch (e) { showToast("Could not delete"); }
    });
    el.moreMenu.appendChild(del);
  }

  const copyText = document.createElement("button");
  copyText.textContent = "Copy Text";
  copyText.addEventListener("click", () => {
    el.moreMenuModal.classList.add("hidden");
    navigator.clipboard.writeText(plainText || "").then(() => showToast("Copied"));
  });
  el.moreMenu.appendChild(copyText);

  const copyId = document.createElement("button");
  copyId.textContent = "Copy Message ID";
  copyId.addEventListener("click", () => {
    el.moreMenuModal.classList.add("hidden");
    navigator.clipboard.writeText(msgId).then(() => showToast("Copied ID"));
  });
  el.moreMenu.appendChild(copyId);

  if (!isDm && canModerate()) {
    const kickUser = document.createElement("button");
    kickUser.className = "danger";
    kickUser.textContent = "Kick " + sender.username;
    kickUser.addEventListener("click", async () => {
      el.moreMenuModal.classList.add("hidden");
      if (!confirm("Kick " + sender.username + "?")) return;
      try {
        await set(ref(db, `rooms/${state.roomCode}/kicked/${msg.uid}`), true);
        await remove(ref(db, `chats/${state.roomCode}/presence/${msg.uid}`));
        botSay(state.roomCode, "🚪 " + sender.username + " was kicked by " + state.me.username);
        showToast("Kicked");
      } catch (e) { showToast("Could not kick"); }
    });
    el.moreMenu.appendChild(kickUser);
  }

  el.moreMenuModal.classList.remove("hidden");
}

on(el.moreMenuModal, "click", (e) => {
  if (e.target === el.moreMenuModal) el.moreMenuModal.classList.add("hidden");
});

async function toggleReaction(msgId, emoji, isDm) {
  if (!state.me) return;
  const path = isDm
    ? `${dmPath(state.me.uid, state.dmUid)}/${msgId}/reactions/${emoji}/${state.me.uid}`
    : `chats/${state.roomCode}/messages/${msgId}/reactions/${emoji}/${state.me.uid}`;
  const r = ref(db, path);
  const snap = await get(r);
  if (snap.exists() && snap.val() === true) {
    try { await remove(r); } catch {}
  } else {
    try { await set(r, true); } catch {}
  }
}

function openReactionPicker(msgId, isDm) {
  state.reactionTarget = { msgId, isDm };
  el.reactionPicker.innerHTML = "";
  if (el.reactionSearch) el.reactionSearch.value = "";
  renderReactionPicker("");
  el.reactionPickerModal.classList.remove("hidden");
  setTimeout(() => el.reactionSearch?.focus(), 50);
}

function renderReactionPicker(query) {
  el.reactionPicker.innerHTML = "";
  const q = (query || "").trim().toLowerCase();

  if (q) {
    const all = emojiCategories.flatMap(c => c.emojis);
    const unique = [...new Set(all)];
    if (!unique.length) {
      el.reactionPicker.innerHTML = '<div class="rp-cat">No matches</div>';
      return;
    }
    for (const e of unique) {
      const btn = document.createElement("button");
      btn.textContent = e;
      btn.addEventListener("click", () => selectReaction(e));
      el.reactionPicker.appendChild(btn);
    }
    return;
  }

  for (const cat of emojiCategories) {
    const header = document.createElement("div");
    header.className = "rp-cat";
    header.textContent = cat.name;
    el.reactionPicker.appendChild(header);
    for (const e of cat.emojis) {
      const btn = document.createElement("button");
      btn.textContent = e;
      btn.addEventListener("click", () => selectReaction(e));
      el.reactionPicker.appendChild(btn);
    }
  }
}

function selectReaction(emoji) {
  if (!state.reactionTarget) return;
  const { msgId, isDm } = state.reactionTarget;
  el.reactionPickerModal.classList.add("hidden");
  toggleReaction(msgId, emoji, isDm);
  state.reactionTarget = null;
}

on(el.reactionSearch, "input", () => {
  renderReactionPicker(el.reactionSearch.value);
});

on(el.cancelReactionPicker, "click", () => {
  el.reactionPickerModal.classList.add("hidden");
  state.reactionTarget = null;
});

function buildLineContent(lineEl, plainText) {
  const urls = [...plainText.matchAll(URL_RE)].map(m => m[0]);
  const mediaUrls = urls.filter(u => ["image", "video"].includes(classifyUrl(u)));
  const nonMediaUrls = urls.filter(u => classifyUrl(u) === "link");
  const rest = plainText.replace(URL_RE, "").trim();

  if (mediaUrls.length) {
    if (rest) renderTextWithMentions(lineEl, rest + " ");
    for (const u of nonMediaUrls) {
      const a = document.createElement("a");
      a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.textContent = u;
      lineEl.appendChild(a);
      lineEl.appendChild(document.createTextNode(" "));
    }
    for (const u of mediaUrls) {
      const kind = classifyUrl(u);
      if (kind === "image") {
        const img = document.createElement("img");
        img.src = u; img.loading = "lazy"; img.alt = "";
        img.onerror = () => img.remove();
        lineEl.appendChild(img);
      } else {
        const v = document.createElement("video");
        v.src = u; v.controls = true; v.preload = "metadata";
        lineEl.appendChild(v);
      }
    }
    return;
  }

  let lastIndex = 0, m;
  const re = new RegExp(URL_RE.source, "gi");
  while ((m = re.exec(plainText)) !== null) {
    if (m.index > lastIndex) renderTextWithMentions(lineEl, plainText.slice(lastIndex, m.index));
    const a = document.createElement("a");
    a.href = m[0]; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.textContent = m[0];
    lineEl.appendChild(a);
    lastIndex = re.lastIndex;
  }
  if (lastIndex < plainText.length) renderTextWithMentions(lineEl, plainText.slice(lastIndex));
}

async function renderUserList() {
  if (!el.userList || !el.offlineList) return;

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
      if (thisIsOnline && !existingIsOnline) {
        byName.set(key, uid);
      }
    }
  }

  const onlineList = [];
  const offlineList = [];

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
    else offlineList.push(entry);
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
  offlineList.sort(sortFn);

  if (el.onlineCount) el.onlineCount.textContent = onlineList.length;
  if (el.offlineCount) el.offlineCount.textContent = offlineList.length;

  el.userList.innerHTML = "";
  const onlineFrag = document.createDocumentFragment();
  for (const u of onlineList) onlineFrag.appendChild(buildUserRow(u, true));
  el.userList.appendChild(onlineFrag);

  el.offlineList.innerHTML = "";
  const offlineFrag = document.createDocumentFragment();
  for (const u of offlineList) offlineFrag.appendChild(buildUserRow(u, false));
  el.offlineList.appendChild(offlineFrag);
}

function buildUserRow(entry, isOnline) {
  const { uid, profile, isSelf } = entry;

  const row = document.createElement("div");
  row.className = "user-item";
  if (!isOnline) row.classList.add("offline");
  if (state.blocked.has(uid)) row.classList.add("blocked");
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

  if (isSelf) {
    const youBadge = document.createElement("span");
    youBadge.className = "u-badge you";
    youBadge.textContent = "YOU";
    nameLine.appendChild(youBadge);
  } else if (state.admins.includes(uid)) {
    const adminBadge = document.createElement("span");
    adminBadge.className = "u-badge";
    adminBadge.textContent = "ADMIN";
    nameLine.appendChild(adminBadge);
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
    } else subLine.textContent = "offline";
  }
  meta.appendChild(subLine);

  row.appendChild(meta);

  return row;
}

on(el.userList, "click", (e) => {
  const row = e.target.closest(".user-item");
  if (!row || row.dataset.self === "true") return;
  const uid = row.dataset.uid;
  if (uid) openUserProfile(uid);
});

on(el.offlineList, "click", (e) => {
  const row = e.target.closest(".user-item");
  if (!row) return;
  const uid = row.dataset.uid;
  if (uid) openUserProfile(uid);
});

async function openUserProfile(uid) {
  if (!uid) return;
  state.viewedUid = uid;
  const p = await fetchUser(uid);
  const isSelf = uid === state.me.uid;
  const isAdminUser = state.admins.includes(uid);
  const isOnline = !!(state.presenceData && state.presenceData[uid]);
  const isBlocked = state.blocked.has(uid);

  if (el.userProfileAvatar) el.userProfileAvatar.src = p.pfp || defaultPfp(p.username);
  if (el.userProfileName) {
    el.userProfileName.textContent = p.username || "user";
    if (p.nameColor) el.userProfileName.style.color = p.nameColor;
    else el.userProfileName.style.color = "";
  }
  if (el.userProfileHandle) {
    el.userProfileHandle.textContent = "@" + (p.username || "user").toLowerCase();
  }
  if (el.userProfileCustomStatus) {
    el.userProfileCustomStatus.textContent = p.status || "";
    el.userProfileCustomStatus.style.display = p.status ? "" : "none";
  }
  if (el.userProfileBio) el.userProfileBio.textContent = p.bio || "No bio yet.";
  if (el.userProfileBanner) {
    el.userProfileBanner.style.cssText = bannerStyle(p.accentColor, p.bannerImage);
  }
  if (el.userProfileMeta) {
    el.userProfileMeta.textContent = memberSince(p.createdAt);
  }

  if (el.userProfileStatusDot) {
    el.userProfileStatusDot.classList.toggle("offline", !isOnline);
    el.userProfileStatusDot.style.display = isBlocked ? "none" : "block";
  }
  if (el.userProfileBlockBadge) {
    el.userProfileBlockBadge.classList.toggle("hidden", !isBlocked);
  }

  if (el.userProfileBadges) {
    el.userProfileBadges.innerHTML = "";
    if (isSelf) {
      const b = document.createElement("span");
      b.className = "dc-badge you";
      b.textContent = "YOU";
      el.userProfileBadges.appendChild(b);
    }
    if (isAdminUser) {
      const b = document.createElement("span");
      b.className = "dc-badge admin";
      b.textContent = "ADMIN";
      el.userProfileBadges.appendChild(b);
    }
    if (isOnline) {
      const b = document.createElement("span");
      b.className = "dc-badge online";
      b.textContent = "ONLINE";
      el.userProfileBadges.appendChild(b);
    }
  }

  if (el.userProfileDmBtn) el.userProfileDmBtn.style.display = isSelf ? "none" : "";
  if (el.userProfileBlockBtn) {
    el.userProfileBlockBtn.style.display = isSelf ? "none" : "";
    el.userProfileBlockBtn.textContent = isBlocked ? "Unblock" : t("block");
  }
  if (el.userProfileKickBtn) {
    const canKick = !isSelf && canModerate() && !state.roomMeta?.isPublic;
    el.userProfileKickBtn.classList.toggle("hidden", !canKick);
  }

  el.userProfileModal.classList.remove("hidden");
}

on(el.userProfileCloseBtn, "click", () => {
  el.userProfileModal.classList.add("hidden");
  state.viewedUid = null;
});

on(el.userProfileDmBtn, "click", () => {
  const uid = state.viewedUid;
  if (!uid) return;
  el.userProfileModal.classList.add("hidden");
  openDm(uid);
  state.viewedUid = null;
});

on(el.userProfileBlockBtn, "click", async () => {
  const uid = state.viewedUid;
  if (!uid) return;
  if (state.blocked.has(uid)) {
    state.blocked.delete(uid);
    try { await remove(ref(db, `blocks/${state.me.uid}/${uid}`)); } catch {}
    showToast("Unblocked");
  } else {
    state.blocked.add(uid);
    try { await set(ref(db, `blocks/${state.me.uid}/${uid}`), true); } catch {}
    showToast("Blocked (client-side only)");
  }
  el.userProfileBlockBtn.textContent = state.blocked.has(uid) ? "Unblock" : t("block");
  if (el.userProfileBlockBadge) el.userProfileBlockBadge.classList.toggle("hidden", !state.blocked.has(uid));
  if (el.userProfileStatusDot) el.userProfileStatusDot.style.display = state.blocked.has(uid) ? "none" : "block";
  renderUserList();
});

on(el.userProfileKickBtn, "click", async () => {
  const uid = state.viewedUid;
  if (!uid || !canModerate() || state.roomMeta?.isPublic) return;
  const p = await fetchUser(uid);
  try {
    await set(ref(db, `rooms/${state.roomCode}/kicked/${uid}`), true);
    await remove(ref(db, `chats/${state.roomCode}/presence/${uid}`));
    botSay(state.roomCode, "🚪 " + p.username + " was kicked by " + state.me.username);
    showToast("Kicked");
  } catch (e) { showToast("Could not kick"); }
  el.userProfileModal.classList.add("hidden");
  state.viewedUid = null;
});

function openMyProfile() {
  const me = state.me;
  if (!me) return;
  if (el.myProfileAvatar) el.myProfileAvatar.src = me.pfp || defaultPfp(me.username);
  if (el.profileHeroName) {
    el.profileHeroName.textContent = me.username;
    if (me.nameColor) el.profileHeroName.style.color = me.nameColor;
    else el.profileHeroName.style.color = "";
  }
  if (el.profileHandle) {
    el.profileHandle.textContent = "@" + (me.username || "user").toLowerCase();
  }
  if (el.profileCustomStatus) {
    el.profileCustomStatus.textContent = me.status || "";
    el.profileCustomStatus.style.display = me.status ? "" : "none";
  }
  if (el.myProfileBio) el.myProfileBio.textContent = me.bio || "No bio yet.";
  if (el.profileBanner) {
    el.profileBanner.style.cssText = bannerStyle(me.accentColor, me.bannerImage);
  }
  if (el.profileHeroMeta) {
    el.profileHeroMeta.textContent = memberSince(me.createdAt);
  }

  if (el.profileBadges) {
    el.profileBadges.innerHTML = "";
    const youBadge = document.createElement("span");
    youBadge.className = "dc-badge you";
    youBadge.textContent = "YOU";
    el.profileBadges.appendChild(youBadge);
    if (isGlobalAdmin()) {
      const adm = document.createElement("span");
      adm.className = "dc-badge admin";
      adm.textContent = "ADMIN";
      el.profileBadges.appendChild(adm);
    }
  }

  el.profileModal.classList.remove("hidden");
}

on(el.profileBtn, "click", openMyProfile);

on(el.openEditProfileBtn, "click", () => {
  el.profileModal.classList.add("hidden");
  openEditProfile();
});

on(el.cancelProfileBtn, "click", () => el.profileModal.classList.add("hidden"));

function openEditProfile() {
  const me = state.me;
  if (!me) return;
  el.editUsername.value = me.username;
  el.editBio.value = me.bio || "";
  el.editPfp.value = "";
  el.editBanner.value = "";
  el.profileError.textContent = "";
  el.editProfileAvatar.src = me.pfp || defaultPfp(me.username);
  el.editProfileBanner.style.cssText = bannerStyle(me.accentColor, me.bannerImage);
  el.editProfileModal.classList.remove("hidden");
}

on(el.cancelEditProfileBtn, "click", () => el.editProfileModal.classList.add("hidden"));

on(el.editPfp, "change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = (ev) => { el.editProfileAvatar.src = ev.target.result; };
  r.readAsDataURL(f);
});

on(el.editBanner, "change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > BANNER_MAX_BYTES) { showToast("Banner too big (400KB max)"); e.target.value = ""; return; }
  const r = new FileReader();
  r.onload = (ev) => {
    el.editProfileBanner.style.backgroundImage = `url('${ev.target.result}')`;
    el.editProfileBanner.style.backgroundSize = "cover";
    el.editProfileBanner.style.backgroundPosition = "center";
  };
  r.readAsDataURL(f);
});

on(el.saveProfileBtn, "click", async () => {
  el.profileError.textContent = "";
  const newName = el.editUsername.value.trim();
  if (newName.length < 2 || newName.length > 24) return el.profileError.textContent = "Username must be 2–24 chars";
  const newBio = el.editBio.value.trim();
  if (newBio.length > 200) return el.profileError.textContent = "Bio too long (200 max)";

  let newPfp = state.me.pfp;
  if (el.editPfp.files[0]) {
    const file = el.editPfp.files[0];
    if (file.size > 400 * 1024) return el.profileError.textContent = "PFP too big (400KB max)";
    newPfp = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  let newBanner = state.me.bannerImage;
  if (el.editBanner.files[0]) {
    const file = el.editBanner.files[0];
    if (file.size > BANNER_MAX_BYTES) return el.profileError.textContent = "Banner too big (400KB max)";
    newBanner = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  try {
    await update(ref(db, `users/${state.me.uid}`), {
      username: newName,
      bio: newBio,
      pfp: newPfp,
      bannerImage: newBanner
    });
    state.me.username = newName;
    state.me.bio = newBio;
    state.me.pfp = newPfp;
    state.me.bannerImage = newBanner;
    el.myUsernameLabel.textContent = state.me.username;
    updateMyPfp();
    state.userCache.set(state.me.uid, {
      uid: state.me.uid, username: state.me.username, pfp: state.me.pfp,
      bio: state.me.bio, nameColor: state.me.nameColor, accentColor: state.me.accentColor,
      status: state.me.status, pronouns: state.me.pronouns, bannerImage: state.me.bannerImage,
      createdAt: state.me.createdAt
    });
    state.usernameIndex = null;
    el.editProfileModal.classList.add("hidden");
    showToast("Profile saved");
    if (state.roomCode) renderUserList();
  } catch (e) { el.profileError.textContent = e.message; }
});

on(el.profileMoreBtn, "click", () => {
  el.profileMoreMenu.innerHTML = "";

  const editBtn = document.createElement("button");
  editBtn.textContent = t("editProfile");
  editBtn.addEventListener("click", () => {
    el.profileMoreMenuModal.classList.add("hidden");
    el.profileModal.classList.add("hidden");
    openEditProfile();
  });
  el.profileMoreMenu.appendChild(editBtn);

  const statusBtn = document.createElement("button");
  statusBtn.textContent = t("status");
  statusBtn.addEventListener("click", () => {
    el.profileMoreMenuModal.classList.add("hidden");
    openStatusModal();
  });
  el.profileMoreMenu.appendChild(statusBtn);

  const blockBtn = document.createElement("button");
  blockBtn.className = "danger";
  blockBtn.textContent = t("block");
  blockBtn.addEventListener("click", () => {
    el.profileMoreMenuModal.classList.add("hidden");
    openBlockUserModal();
  });
  el.profileMoreMenu.appendChild(blockBtn);

  el.profileMoreMenuModal.classList.remove("hidden");
});

on(el.profileMoreMenuModal, "click", (e) => {
  if (e.target === el.profileMoreMenuModal) el.profileMoreMenuModal.classList.add("hidden");
});

function openStatusModal() {
  el.statusInput.value = state.me.status || "";
  el.statusModal.classList.remove("hidden");
  setTimeout(() => el.statusInput.focus(), 50);
}

on(el.cancelStatusBtn, "click", () => el.statusModal.classList.add("hidden"));

on(el.saveStatusBtn, "click", async () => {
  const newStatus = (el.statusInput.value || "").slice(0, STATUS_MAX);
  try {
    await update(ref(db, `users/${state.me.uid}`), { status: newStatus });
    state.me.status = newStatus;
    if (state.userCache.has(state.me.uid)) {
      const c = state.userCache.get(state.me.uid);
      c.status = newStatus;
      state.userCache.set(state.me.uid, c);
    }
    el.statusModal.classList.add("hidden");
    showToast("Status updated");
    if (state.roomCode) renderUserList();
  } catch (e) { showToast("Could not update status"); }
});

function openBlockUserModal() {
  el.blockUserSelect.innerHTML = "";

  const seen = new Set();
  const entries = [];
  for (const uid of Object.keys(state.presenceData || {})) {
    if (uid === state.me.uid || seen.has(uid)) continue;
    seen.add(uid);
    const p = state.userCache.get(uid);
    entries.push({ uid, name: p?.username || uid.slice(0, 6) });
  }
  for (const uid of Object.keys(state.seenData || {})) {
    if (uid === state.me.uid || seen.has(uid)) continue;
    seen.add(uid);
    const p = state.userCache.get(uid);
    entries.push({ uid, name: p?.username || uid.slice(0, 6) });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  if (!entries.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No users in this room";
    el.blockUserSelect.appendChild(opt);
    el.blockUserSelect.disabled = true;
  } else {
    el.blockUserSelect.disabled = false;
    for (const e of entries) {
      const opt = document.createElement("option");
      opt.value = e.uid;
      opt.textContent = state.blocked.has(e.uid) ? e.name + " (blocked)" : e.name;
      el.blockUserSelect.appendChild(opt);
    }
  }

  el.blockUserModal.classList.remove("hidden");
}

on(el.cancelBlockBtn, "click", () => el.blockUserModal.classList.add("hidden"));

on(el.confirmBlockBtn, "click", async () => {
  const uid = el.blockUserSelect.value;
  if (!uid) return showToast("Pick a user");
  if (state.blocked.has(uid)) {
    state.blocked.delete(uid);
    try { await remove(ref(db, `blocks/${state.me.uid}/${uid}`)); } catch {}
    showToast("Unblocked");
  } else {
    state.blocked.add(uid);
    try { await set(ref(db, `blocks/${state.me.uid}/${uid}`), true); } catch {}
    showToast("Blocked (client-side only)");
  }
  el.blockUserModal.classList.add("hidden");
  renderUserList();
});

on(el.saveProfileColorsBtn, "click", async () => {
  const nameColor = el.editNameColor.value;
  const accentColor = el.editAccentColor.value;
  try {
    await update(ref(db, `users/${state.me.uid}`), { nameColor, accentColor });
    state.me.nameColor = nameColor;
    state.me.accentColor = accentColor;
    if (state.userCache.has(state.me.uid)) {
      const c = state.userCache.get(state.me.uid);
      c.nameColor = nameColor;
      c.accentColor = accentColor;
      state.userCache.set(state.me.uid, c);
    }
    showToast("Colors saved");
    if (state.roomCode) renderUserList();
  } catch (e) { showToast("Could not save colors"); }
});

on(el.kickPanelBtn, "click", async () => {
  el.kickedList.innerHTML = "";
  const snap = await get(ref(db, `rooms/${state.roomCode}/kicked`));
  const uids = Object.keys(snap.val() || {});
  if (!uids.length) {
    el.kickedList.innerHTML = `<p class="modal-sub">${t("nobodyKicked")}</p>`;
  } else {
    const frag = document.createDocumentFragment();
    for (const uid of uids) {
      const p = await fetchUser(uid);
      const row = document.createElement("div");
      row.className = "kicked-row";
      row.innerHTML = `<img src="${p.pfp || defaultPfp(p.username)}" alt=""><span>${esc(p.username)}</span><button>Un-kick</button>`;
      row.querySelector("button").addEventListener("click", async () => {
        try {
          await remove(ref(db, `rooms/${state.roomCode}/kicked/${uid}`));
          row.remove();
          showToast("Un-kicked");
        } catch (e) { showToast(e.message); }
      });
      frag.appendChild(row);
    }
    el.kickedList.appendChild(frag);
  }
  el.kickedModal.classList.remove("hidden");
});

on(el.closeKickedBtn, "click", () => el.kickedModal.classList.add("hidden"));

on(el.roomSettingsBtn, "click", () => {
  el.settingsRoomName.value = state.roomMeta?.name || "";
  el.settingsRoomMax.value = state.roomMeta?.maxUsers || 20;
  el.settingsRoomPassword.value = "";
  el.settingsRoomPinned.checked = !!state.roomMeta?.pinned;
  el.settingsRoomForever.checked = !!state.roomMeta?.forever;
  el.roomSettingsError.textContent = "";
  el.deleteRoomBtn.classList.toggle("hidden", state.roomMeta?.isPublic || state.roomCode === PUBLIC_ROOM);
  el.roomSettingsModal.classList.remove("hidden");
});

on(el.cancelRoomSettingsBtn, "click", () => el.roomSettingsModal.classList.add("hidden"));

on(el.saveRoomSettingsBtn, "click", async () => {
  if (!canModerate()) return;
  el.roomSettingsError.textContent = "";
  const name = el.settingsRoomName.value.trim();
  const max = parseInt(el.settingsRoomMax.value, 10) || 20;
  if (!name || name.length > 40) return el.roomSettingsError.textContent = "Name must be 1–40 chars";
  if (max < 2 || max > 500) return el.roomSettingsError.textContent = "Max users must be 2–500";
  const updates = { name, maxUsers: max, lastActivity: Date.now() };
  const newPw = el.settingsRoomPassword.value;
  if (newPw) { updates.hasPassword = true; updates.passwordHash = hashPassword(newPw); }
  updates.pinned = el.settingsRoomPinned.checked;
  updates.forever = el.settingsRoomForever.checked;
  try {
    await update(ref(db, `rooms/${state.roomCode}`), updates);
    state.roomMeta = { ...state.roomMeta, ...updates };
    el.chatHeadTitle.textContent = "# " + name;
    el.chatHeadLock.classList.toggle("hidden", !state.roomMeta.hasPassword);
    if (el.chatHeadForever) el.chatHeadForever.classList.toggle("hidden", !state.roomMeta.forever);
    el.capacityLabel.textContent = "/ " + max;
    el.roomSettingsModal.classList.add("hidden");
    showToast("Room updated");
  } catch (e) { el.roomSettingsError.textContent = e.message; }
});

on(el.togglePinBtn, "click", async () => {
  if (!canModerate() || !state.roomCode) return;
  const nowPinned = !state.roomMeta.pinned;
  try {
    await update(ref(db, `rooms/${state.roomCode}`), { pinned: nowPinned });
    state.roomMeta.pinned = nowPinned;
    showToast(nowPinned ? t("pinned") : t("unpinned"));
  } catch (e) { showToast("Could not toggle pin"); }
});

on(el.toggleForeverBtn, "click", async () => {
  if (!canModerate() || !state.roomCode) return;
  const nowForever = !state.roomMeta.forever;
  try {
    await update(ref(db, `rooms/${state.roomCode}`), { forever: nowForever });
    state.roomMeta.forever = nowForever;
    if (el.chatHeadForever) el.chatHeadForever.classList.toggle("hidden", !nowForever);
    showToast(nowForever ? t("foreverOn") : t("foreverOff"));
  } catch (e) { showToast("Could not toggle forever"); }
});

on(el.wipeRoomBtn, "click", async () => {
  if (!canModerate() || !state.roomCode) return;
  if (!confirm(t("wipeConfirm"))) return;
  try {
    await remove(ref(db, `chats/${state.roomCode}/messages`));
    resetChatUI();
    showToast(t("wiped"));
  } catch (e) { showToast("Could not wipe"); }
});

on(el.deleteRoomBtn, "click", async () => {
  if (!canModerate() || state.roomMeta?.isPublic || state.roomCode === PUBLIC_ROOM) return;
  if (!confirm(t("deleteRoomConfirm"))) return;
  const code = state.roomCode;
  try {
    await detachFromRoom();
    resetChatUI();
    showLobby();
    await remove(ref(db, `chats/${code}`));
    await remove(ref(db, `rooms/${code}`));
    presenceCountCache.delete(code);
    el.roomSettingsModal.classList.add("hidden");
    showToast(t("roomDeleted"));
  } catch (e) { showToast("Could not delete"); }
});

async function openDm(otherUid) {
  if (!state.roomCode) await requestJoinRoom(PUBLIC_ROOM);
  if (state.dmUid === otherUid && !el.dmPanel.classList.contains("hidden")) return;

  try { if (state.dmOff) { state.dmOff(); state.dmOff = null; } } catch {}

  state.dmUid = otherUid;
  state.dmQueryRef = query(ref(db, dmPath(state.me.uid, otherUid)), limitToLast(100));
  resetDmUI();
  el.dmPanel.classList.remove("hidden");
  el.dmInput.disabled = false;
  el.dmFileInput.disabled = false;
  el.dmSendBtn.disabled = false;

  const other = await fetchUser(otherUid);
  el.dmHeadTitle.textContent = "DM with " + other.username;
  if (other.nameColor) el.dmHeadTitle.style.color = other.nameColor;
  else el.dmHeadTitle.style.color = "";

  const renderedIds = new Set();

  try {
    const snap = await get(state.dmQueryRef);
    const data = snap.val() || {};
    const sorted = Object.entries(data).sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
    for (const [id, msg] of sorted) {
      renderedIds.add(id);
      renderMessage(el.dmMessages, id, msg, msg.uid === state.me.uid, true);
    }
    if (sorted.length) hideDmEmpty();
    el.dmMessages.scrollTop = el.dmMessages.scrollHeight;
  } catch (e) {}

  const handler = (snapshot) => {
    if (renderedIds.has(snapshot.key)) return;
    renderedIds.add(snapshot.key);
    const msg = snapshot.val();
    if (!msg) return;
    const wasAtBottom = isAtBottom(el.dmMessages);
    renderMessage(el.dmMessages, snapshot.key, msg, msg.uid === state.me.uid, true);
    hideDmEmpty();
    scrollIfAtBottom(el.dmMessages, wasAtBottom);
    updateScrollButtons();
  };
  onChildAdded(state.dmQueryRef, handler);
  state.dmOff = () => off(state.dmQueryRef, "child_added", handler);

  el.dmInput.focus();
  updateScrollButtons();
}

function closeDm() {
  state.dmUid = null;
  state.dmQueryRef = null;
  try { if (typeof state.dmOff === "function") { state.dmOff(); state.dmOff = null; } } catch (e) {}
  if (el.dmPanel) el.dmPanel.classList.add("hidden");
  if (el.dmInput) el.dmInput.disabled = true;
  if (el.dmFileInput) el.dmFileInput.disabled = true;
  if (el.dmSendBtn) el.dmSendBtn.disabled = true;
  if (el.dmHeadTitle) el.dmHeadTitle.style.color = "";
  resetDmUI();
}

on(el.dmCloseBtn, "click", () => closeDm());

async function reattachGroupListener() {
  if (state.groupOff) { state.groupOff(); state.groupOff = null; }
  resetChatUI();
  const renderedIds = new Set();
  const handler = (snapshot) => {
    if (renderedIds.has(snapshot.key)) return;
    renderedIds.add(snapshot.key);
    const msg = snapshot.val();
    if (!msg || state.blocked.has(msg.uid)) return;
    const wasAtBottom = isAtBottom(el.chatContainer);
    renderMessage(el.chatContainer, snapshot.key, msg, msg.uid === state.me.uid, false);
    hideEmpty();
    scrollIfAtBottom(el.chatContainer, wasAtBottom);
    updateScrollButtons();
  };
  onChildAdded(state.queryRef, handler);
  state.groupOff = () => off(state.queryRef, "child_added", handler);
}

on(el.sendBtn, "click", sendMessage);
on(el.messageInput, "keydown", (e) => {
  handleMentionKeys(e);
  if (e.key === "Enter" && !e.shiftKey && !state.mentionTarget) { e.preventDefault(); sendMessage(); }
});
on(el.replyBarCancel, "click", clearReply);

on(el.dmSendBtn, "click", sendDm);
on(el.dmInput, "keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDm(); }
});
on(el.dmReplyBarCancel, "click", clearDmReply);

function handleMentionKeys(e) {
  if (!el.mentionAutocomplete || el.mentionAutocomplete.classList.contains("hidden")) {
    if (e.key === "@") {
      const cursor = el.messageInput.selectionStart;
      const before = el.messageInput.value.slice(0, cursor);
      const atIdx = before.lastIndexOf("@");
      if (atIdx >= 0 && (atIdx === 0 || /\s/.test(before[atIdx - 1]))) {
        setTimeout(() => showMentionAutocomplete("", atIdx + 1), 0);
      }
    }
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    state.mentionIndex = Math.min(state.mentionIndex + 1, state.mentionList.length - 1);
    renderMentionList();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    state.mentionIndex = Math.max(state.mentionIndex - 1, 0);
    renderMentionList();
  } else if (e.key === "Enter" || e.key === "Tab") {
    if (state.mentionIndex >= 0 && state.mentionList[state.mentionIndex]) {
      e.preventDefault();
      insertMention(state.mentionList[state.mentionIndex]);
    }
  } else if (e.key === "Escape") {
    hideMentionAutocomplete();
  }
}

on(el.messageInput, "input", () => {
  const val = el.messageInput.value;
  const cursor = el.messageInput.selectionStart;
  const before = val.slice(0, cursor);
  const atIdx = before.lastIndexOf("@");
  if (atIdx >= 0 && (atIdx === 0 || /\s/.test(before[atIdx - 1]))) {
    const query = before.slice(atIdx + 1);
    if (/^[A-Za-z0-9_]*$/.test(query)) {
      showMentionAutocomplete(query, atIdx + 1);
      return;
    }
  }
  hideMentionAutocomplete();
});

async function showMentionAutocomplete(query, startIdx) {
  if (!el.mentionAutocomplete) return;

  const presentUids = [...Object.keys(state.presenceData || {}), ...Object.keys(state.seenData || {})];
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
    el.mentionAutocomplete.innerHTML = `<div class="ma-item" style="cursor:default;color:var(--text-dim);">no match</div>`;
    el.mentionAutocomplete.classList.remove("hidden");
    state.mentionList = [];
    state.mentionIndex = -1;
    return;
  }

  const everyoneEntry = { uid: "everyone", username: "everyone", pfp: null, isEveryone: true };
  const list = [everyoneEntry, ...users];
  state.mentionList = list;
  state.mentionIndex = 0;
  state.mentionStart = startIdx;
  renderMentionList();
  el.mentionAutocomplete.classList.remove("hidden");
}

function renderMentionList() {
  if (!el.mentionAutocomplete) return;
  el.mentionAutocomplete.innerHTML = "";
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
    item.addEventListener("click", () => insertMention(u));
    el.mentionAutocomplete.appendChild(item);
  });
}

function insertMention(user) {
  const val = el.messageInput.value;
  const cursor = el.messageInput.selectionStart;
  const before = val.slice(0, state.mentionStart);
  const after = val.slice(cursor);
  const insertText = "@" + user.username + " ";
  el.messageInput.value = before + insertText + after;
  const newCursor = before.length + insertText.length;
  el.messageInput.setSelectionRange(newCursor, newCursor);
  el.messageInput.focus();
  hideMentionAutocomplete();
}

function hideMentionAutocomplete() {
  if (!el.mentionAutocomplete) return;
  el.mentionAutocomplete.classList.add("hidden");
  el.mentionAutocomplete.innerHTML = "";
  state.mentionList = [];
  state.mentionIndex = -1;
  state.mentionStart = -1;
}

async function sendMessage() {
  if (!state.roomCode || !state.roomRef) return showToast("Join a room first");
  const rawText = el.messageInput.value.trim();
  const hasMedia = !!state.pendingFile;
  if (!rawText && !hasMedia) return showToast("Nothing to send");
  if (!spamCheck()) return;

  const replyPayload = state.reply ? {
    uid: state.reply.uid, username: state.reply.username,
    previewText: state.reply.previewText, msgId: state.reply.msgId
  } : null;

  const pushed = await push(state.roomRef, {
    uid: state.me.uid,
    text: rawText ? encryptText(rawText, state.roomCode) : "",
    mediaType: hasMedia ? state.pendingFile.type : null,
    mediaData: hasMedia ? encryptText(state.pendingFile.dataUrl, state.roomCode) : null,
    replyTo: replyPayload, timestamp: serverTimestamp()
  });

  try { update(ref(db, `rooms/${state.roomCode}`), { lastActivity: Date.now() }); } catch {}

  if (rawText) {
    const msgId = pushed.key;

    if (hasEveryone(rawText)) {
      const presSnap = await get(ref(db, `chats/${state.roomCode}/presence`));
      const pData = presSnap.val() || {};
      for (const uid of Object.keys(pData)) {
        if (uid === state.me.uid) continue;
        pushNotification(uid, {
          type: "everyone",
          title: `@everyone in #${state.roomMeta?.name || state.roomCode}`,
          body: `${state.me.username}: ${rawText.slice(0, 80)}`,
          roomCode: state.roomCode, fromUid: state.me.uid, msgId
        });
      }
    } else {
      const mentions = extractMentions(rawText);
      if (mentions.length) {
        if (!state.usernameIndex) {
          const us = await get(ref(db, "users"));
          const byName = {};
          for (const [uid, u] of Object.entries(us.val() || {})) if (u.username) byName[u.username.toLowerCase()] = uid;
          state.usernameIndex = byName;
        }
        for (const mention of mentions) {
          const uid = state.usernameIndex[mention];
          if (uid && uid !== state.me.uid) {
            pushNotification(uid, {
              type: "mention",
              title: `${t("notifMention")} #${state.roomMeta?.name || state.roomCode}`,
              body: `${state.me.username}: ${rawText.slice(0, 80)}`,
              roomCode: state.roomCode, fromUid: state.me.uid, msgId
            });
          }
        }
      }
    }

    if (replyPayload && replyPayload.uid !== state.me.uid) {
      pushNotification(replyPayload.uid, {
        type: "reply",
        title: `${state.me.username} ${t("notifReply")} #${state.roomMeta?.name || state.roomCode}`,
        body: rawText ? rawText.slice(0, 80) : "[media]",
        roomCode: state.roomCode, fromUid: state.me.uid, msgId
      });
    }

    if (/^!help\b/i.test(rawText)) {
      botSay(state.roomCode, "📋 Commands: !help, !roll (1-6), !8ball <question>, !me <action>");
    } else if (/^!roll\b/i.test(rawText)) {
      const n = Math.floor(Math.random() * 6) + 1;
      botSay(state.roomCode, "🎲 " + state.me.username + " rolled a " + n);
    } else if (/^!8ball\b/i.test(rawText)) {
      const answers = ["Yes", "No", "Maybe", "Ask again later", "Definitely", "Absolutely not", "Probably", "Unlikely"];
      const a = answers[Math.floor(Math.random() * answers.length)];
      botSay(state.roomCode, "🎱 " + a);
    } else if (/^!me\b/i.test(rawText)) {
      const action = rawText.replace(/^!me\s*/i, "");
      if (action) {
        botSay(state.roomCode, "* " + state.me.username + " " + action);
      }
    }
  }

  el.messageInput.value = "";
  clearPendingFile();
  clearReply();
  hideMentionAutocomplete();
  el.messageInput.focus();
  updateScrollButtons();
}

async function sendDm() {
  if (!state.dmUid) return;
  const rawText = el.dmInput.value.trim();
  const hasMedia = !!state.dmPendingFile;
  if (!rawText && !hasMedia) return showToast("Nothing to send");
  if (!spamCheck()) return;

  const replyPayload = state.dmReply ? {
    uid: state.dmReply.uid, username: state.dmReply.username,
    previewText: state.dmReply.previewText, msgId: state.dmReply.msgId
  } : null;

  const encKey = dmKey(state.me.uid, state.dmUid);
  await push(ref(db, dmPath(state.me.uid, state.dmUid)), {
    uid: state.me.uid,
    text: rawText ? encryptText(rawText, encKey) : "",
    mediaType: hasMedia ? state.dmPendingFile.type : null,
    mediaData: hasMedia ? encryptText(state.dmPendingFile.dataUrl, encKey) : null,
    dmKey: encKey, replyTo: replyPayload, timestamp: serverTimestamp()
  });

  await pushNotification(state.dmUid, {
    type: "dm",
    title: t("notifDm") + " " + state.me.username,
    body: rawText ? rawText.slice(0, 80) : "[media]",
    fromUid: state.me.uid
  });

  el.dmInput.value = "";
  clearDmPendingFile();
  clearDmReply();
  el.dmInput.focus();
  updateScrollButtons();
}

function pasteHandler(e, isDm) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      handleFileObject(file, isDm);
      return;
    }
  }
}

on(el.messageInput, "paste", (e) => pasteHandler(e, false));
on(el.dmInput, "paste", (e) => pasteHandler(e, true));

on(el.fileInput, "change", (e) => {
  const file = e.target.files[0];
  if (file) handleFileObject(file, false);
  e.target.value = "";
});
on(el.dmFileInput, "change", (e) => {
  const file = e.target.files[0];
  if (file) handleFileObject(file, true);
  e.target.value = "";
});
on(el.filePreviewRemove, "click", () => clearPendingFile());
on(el.dmFilePreviewRemove, "click", () => clearDmPendingFile());

function handleFileObject(file, isDm) {
  if (file.size > 1.5 * 1024 * 1024) { showToast("File too big (1.5MB max)"); return; }
  let type = null;
  if (file.type === "image/gif") type = "gif";
  else if (file.type.startsWith("image/")) type = "image";
  else if (file.type.startsWith("video/")) type = "video";
  else { showToast("Images, GIFs, videos only"); return; }
  const objectUrl = URL.createObjectURL(file);
  const r = new FileReader();
  r.onload = (ev) => {
    const container = isDm ? {
      preview: el.dmFilePreview, img: el.dmFilePreviewImg, video: el.dmFilePreviewVideo, name: el.dmFilePreviewName
    } : {
      preview: el.filePreview, img: el.filePreviewImg, video: el.filePreviewVideo, name: el.filePreviewName
    };
    const prev = isDm ? state.dmPendingFile : state.pendingFile;
    if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
    const payload = { type, dataUrl: ev.target.result, objectUrl, name: file.name };
    if (isDm) state.dmPendingFile = payload; else state.pendingFile = payload;
    container.name.textContent = `${type.toUpperCase()} · ${file.name}`;
    if (type === "video") {
      container.img.classList.add("hidden");
      container.video.classList.remove("hidden");
      container.video.src = objectUrl;
    } else {
      container.video.classList.add("hidden");
      container.img.classList.remove("hidden");
      container.img.src = objectUrl;
    }
    container.preview.classList.remove("hidden");
    (isDm ? el.dmInput : el.messageInput).focus();
  };
  r.readAsDataURL(file);
}

function clearPendingFile() {
  if (state.pendingFile?.objectUrl) URL.revokeObjectURL(state.pendingFile.objectUrl);
  state.pendingFile = null;
  if (el.fileInput) el.fileInput.value = "";
  if (el.filePreview) el.filePreview.classList.add("hidden");
  if (el.filePreviewImg) el.filePreviewImg.src = "";
  if (el.filePreviewVideo) el.filePreviewVideo.src = "";
}

function clearDmPendingFile() {
  if (state.dmPendingFile?.objectUrl) URL.revokeObjectURL(state.dmPendingFile.objectUrl);
  state.dmPendingFile = null;
  if (el.dmFileInput) el.dmFileInput.value = "";
  if (el.dmFilePreview) el.dmFilePreview.classList.add("hidden");
  if (el.dmFilePreviewImg) el.dmFilePreviewImg.src = "";
  if (el.dmFilePreviewVideo) el.dmFilePreviewVideo.src = "";
}

on(el.settingsBtn, "click", () => {
  el.themeSelect.value = currentTheme;
  el.languageSelect.value = currentLang;
  el.currentPassword.value = "";
  el.newPassword.value = "";
  el.settingsError.textContent = "";
  el.editNameColor.value = state.me.nameColor || "#ffffff";
  el.editAccentColor.value = state.me.accentColor || "#8c5aff";
  buildPresetGrid();
  buildColorGrid();
  el.settingsModal.classList.remove("hidden");
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

document.querySelectorAll("[data-custom-tab]").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-custom-tab]").forEach(x => x.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.customTab;
    $("customPaneCss")?.classList.toggle("hidden", target !== "css");
    $("customPaneHtml")?.classList.toggle("hidden", target !== "html");
    $("customPaneJs")?.classList.toggle("hidden", target !== "js");
  });
});

on(el.themeSelect, "change", () => {
  currentTheme = el.themeSelect.value;
  localStorage.setItem("theme", currentTheme);
  applyTheme();
  appearance = {};
  saveAppearance();
  applyAppearance();
  buildColorGrid();
});

on(el.languageSelect, "change", () => {
  currentLang = el.languageSelect.value;
  localStorage.setItem("lang", currentLang);
  applyTranslations();
});

on(el.changePasswordBtn, "click", async () => {
  el.settingsError.textContent = "";
  const cur = el.currentPassword.value, nw = el.newPassword.value;
  if (!cur || !nw) return el.settingsError.textContent = "Fill in both password fields";
  if (nw.length < 6) return el.settingsError.textContent = "New password must be 6+ chars";
  try {
    const user = auth.currentUser;
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, cur));
    await updatePassword(user, nw);
    el.currentPassword.value = ""; el.newPassword.value = "";
    showToast("Password updated");
  } catch (e) { el.settingsError.textContent = e.message.replace("Firebase: ", ""); }
});

on(el.closeSettingsBtn, "click", () => el.settingsModal.classList.add("hidden"));

on(el.openAdvancedCssBtn, "click", () => {
  el.customCssInput.value = customCss;
  el.customHtmlInput.value = customHtml;
  el.customJsInput.value = customJs;
  document.querySelectorAll("[data-custom-tab]").forEach(x => x.classList.remove("active"));
  const cssTab = document.querySelector('[data-custom-tab="css"]');
  if (cssTab) cssTab.classList.add("active");
  $("customPaneCss")?.classList.remove("hidden");
  $("customPaneHtml")?.classList.add("hidden");
  $("customPaneJs")?.classList.add("hidden");
  el.advancedCssModal.classList.remove("hidden");
});

on(el.insertVarsBtn, "click", () => {
  const template = generateVarsTemplate();
  const cur = el.customCssInput.value;
  el.customCssInput.value = cur ? cur + "\n\n" + template : template;
});

on(el.saveCustomCssBtn, "click", () => {
  customCss = el.customCssInput.value;
  customHtml = el.customHtmlInput.value;
  customJs = el.customJsInput.value;
  saveCustomCss();
  saveCustomHtml();
  saveCustomJs();
  applyAppearance();
  el.advancedCssModal.classList.add("hidden");
  showToast("Saved");
});

on(el.cancelCustomCssBtn, "click", () => el.advancedCssModal.classList.add("hidden"));

on(el.clearCustomCssBtn, "click", () => {
  el.customCssInput.value = "";
  el.customHtmlInput.value = "";
  el.customJsInput.value = "";
});

on(el.resetAppearanceBtn, "click", () => {
  appearance = {};
  customCss = "";
  customHtml = "";
  customJs = "";
  saveAppearance();
  saveCustomCss();
  saveCustomHtml();
  saveCustomJs();
  document.documentElement.style.cssText = "";
  applyAppearance();
  buildColorGrid();
  showToast(t("appearanceReset"));
});

try {
  applyTheme();
  applyTranslations();
  applyAppearance();
  if (el.themeSelect) el.themeSelect.value = currentTheme;
  if (el.languageSelect) el.languageSelect.value = currentLanguage;
  setStatus(false);
  resetChatUI();
  resetDmUI();
  buildPresetGrid();
  buildColorGrid();
  updateScrollButtons();
} catch (e) {
  console.error("Boot error:", e);
}
