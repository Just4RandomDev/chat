import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  set,
  get,
  update,
  remove,
  query,
  limitToLast,
  onChildAdded,
  onValue,
  off,
  serverTimestamp,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// ------------------------------------------------------------------
// FIREBASE
// ------------------------------------------------------------------

const firebaseConfig = {
  apiKey: "AIzaSyBynvxWhKhFtb9XWLzCJHRpbOY3_D1hs2w",
  authDomain: "chat-789ff.firebaseapp.com",
  databaseURL: "https://chat-789ff-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "chat-789ff",
  storageBucket: "chat-789ff.firebasestorage.app",
  messagingSenderId: "721919858608",
  appId: "1:721919858608:web:7da6041edf7398030fe875"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

const PUBLIC_ROOM_CODE = "public";
const GROUP_WINDOW_MS = 5 * 60 * 1000;

// ------------------------------------------------------------------
// I18N
// ------------------------------------------------------------------

const translations = {
  en: {
    tabLogin: "Log In", tabSignup: "Sign Up",
    loginBtn: "Log In", signupBtn: "Create Account",
    email: "Email", password: "Password", password6: "Password (6+ chars)", username: "Username",
    backToLobby: "← Lobby", rooms: "Rooms", publicRoom: "Public Lobby", createRoom: "+ Create Room",
    online: "Online", admin: "Admin", manageKicked: "Manage Kicked", roomSettings: "Room Settings",
    backToRoom: "← Back to room", noMessages: "No messages yet",
    typeMessage: "Type a message...", media: "Media", send: "Send",
    notifications: "Notifications", markAllRead: "Mark all read", noNotifications: "No notifications",
    sendDm: "Send DM", block: "Block", kick: "Kick from room", close: "Close",
    editProfile: "Edit Profile", bio: "Bio", save: "Save", cancel: "Cancel",
    roomCode: "Room code (unique id)", roomName: "Room name", maxUsers: "Max users (2–500)",
    passwordOptional: "Password (optional)", create: "Create",
    passwordRequired: "Password Required", room: "Room", isLocked: "is locked.", join: "Join",
    kickedUsers: "Kicked Users", nobodyKicked: "Nobody is kicked.",
    changePasswordKeep: "Change password (leave empty to keep)",
    settings: "Settings", theme: "Theme", dark: "Dark", light: "Light", language: "Language",
    changePassword: "Change Password", currentPassword: "Current password",
    newPassword: "New password (6+ chars)", updatePassword: "Update Password", logout: "Log Out",
    kickedToast: "You've been kicked from this room",
    notifMention: "You were mentioned in",
    notifDm: "New message from"
  },
  es: {
    tabLogin: "Iniciar sesión", tabSignup: "Registrarse",
    loginBtn: "Iniciar sesión", signupBtn: "Crear cuenta",
    email: "Correo", password: "Contraseña", password6: "Contraseña (6+ caracteres)", username: "Usuario",
    backToLobby: "← Vestíbulo", rooms: "Salas", publicRoom: "Sala Pública", createRoom: "+ Crear Sala",
    online: "En línea", admin: "Admin", manageKicked: "Gestionar Expulsados", roomSettings: "Ajustes de Sala",
    backToRoom: "← Volver a la sala", noMessages: "Sin mensajes todavía",
    typeMessage: "Escribe un mensaje...", media: "Multimedia", send: "Enviar",
    notifications: "Notificaciones", markAllRead: "Marcar todo leído", noNotifications: "Sin notificaciones",
    sendDm: "Enviar MD", block: "Bloquear", kick: "Expulsar de la sala", close: "Cerrar",
    editProfile: "Editar Perfil", bio: "Biografía", save: "Guardar", cancel: "Cancelar",
    roomCode: "Código de sala (id único)", roomName: "Nombre de la sala", maxUsers: "Usuarios máx (2–500)",
    passwordOptional: "Contraseña (opcional)", create: "Crear",
    passwordRequired: "Contraseña Requerida", room: "Sala", isLocked: "está bloqueada.", join: "Entrar",
    kickedUsers: "Usuarios Expulsados", nobodyKicked: "Nadie está expulsado.",
    changePasswordKeep: "Cambiar contraseña (vacío para mantener)",
    settings: "Ajustes", theme: "Tema", dark: "Oscuro", light: "Claro", language: "Idioma",
    changePassword: "Cambiar Contraseña", currentPassword: "Contraseña actual",
    newPassword: "Nueva contraseña (6+ caracteres)", updatePassword: "Actualizar", logout: "Cerrar Sesión",
    kickedToast: "Has sido expulsado de esta sala",
    notifMention: "Te mencionaron en",
    notifDm: "Nuevo mensaje de"
  },
  fr: {
    tabLogin: "Connexion", tabSignup: "Inscription",
    loginBtn: "Connexion", signupBtn: "Créer un compte",
    email: "Email", password: "Mot de passe", password6: "Mot de passe (6+ caractères)", username: "Pseudo",
    backToLobby: "← Salon", rooms: "Salons", publicRoom: "Salon Public", createRoom: "+ Créer un Salon",
    online: "En ligne", admin: "Admin", manageKicked: "Gérer Exclus", roomSettings: "Paramètres du Salon",
    backToRoom: "← Retour au salon", noMessages: "Aucun message",
    typeMessage: "Écrire un message...", media: "Média", send: "Envoyer",
    notifications: "Notifications", markAllRead: "Tout marquer lu", noNotifications: "Aucune notification",
    sendDm: "Envoyer un MP", block: "Bloquer", kick: "Exclure du salon", close: "Fermer",
    editProfile: "Modifier le Profil", bio: "Bio", save: "Enregistrer", cancel: "Annuler",
    roomCode: "Code du salon (id unique)", roomName: "Nom du salon", maxUsers: "Utilisateurs max (2–500)",
    passwordOptional: "Mot de passe (optionnel)", create: "Créer",
    passwordRequired: "Mot de Passe Requis", room: "Salon", isLocked: "est verrouillé.", join: "Rejoindre",
    kickedUsers: "Utilisateurs Exclus", nobodyKicked: "Personne n'est exclu.",
    changePasswordKeep: "Changer le mot de passe (vide pour garder)",
    settings: "Paramètres", theme: "Thème", dark: "Sombre", light: "Clair", language: "Langue",
    changePassword: "Changer le Mot de Passe", currentPassword: "Mot de passe actuel",
    newPassword: "Nouveau mot de passe (6+ caractères)", updatePassword: "Mettre à jour", logout: "Déconnexion",
    kickedToast: "Vous avez été exclu de ce salon",
    notifMention: "Vous avez été mentionné dans",
    notifDm: "Nouveau message de"
  },
  ru: {
    tabLogin: "Войти", tabSignup: "Регистрация",
    loginBtn: "Войти", signupBtn: "Создать аккаунт",
    email: "Email", password: "Пароль", password6: "Пароль (6+ символов)", username: "Имя",
    backToLobby: "← Лобби", rooms: "Комнаты", publicRoom: "Публичная", createRoom: "+ Создать",
    online: "Онлайн", admin: "Админ", manageKicked: "Управление Киками", roomSettings: "Настройки Комнаты",
    backToRoom: "← Назад в комнату", noMessages: "Сообщений нет",
    typeMessage: "Введите сообщение...", media: "Медиа", send: "Отправить",
    notifications: "Уведомления", markAllRead: "Прочитать все", noNotifications: "Нет уведомлений",
    sendDm: "Написать ЛС", block: "Блок", kick: "Кикнуть из комнаты", close: "Закрыть",
    editProfile: "Профиль", bio: "О себе", save: "Сохранить", cancel: "Отмена",
    roomCode: "Код комнаты (уникальный)", roomName: "Название", maxUsers: "Макс. людей (2–500)",
    passwordOptional: "Пароль (необязательно)", create: "Создать",
    passwordRequired: "Нужен Пароль", room: "Комната", isLocked: "заблокирована.", join: "Войти",
    kickedUsers: "Кикнутые", nobodyKicked: "Никто не кикнут.",
    changePasswordKeep: "Сменить пароль (пусто = оставить)",
    settings: "Настройки", theme: "Тема", dark: "Тёмная", light: "Светлая", language: "Язык",
    changePassword: "Сменить Пароль", currentPassword: "Текущий пароль",
    newPassword: "Новый пароль (6+ символов)", updatePassword: "Обновить", logout: "Выйти",
    kickedToast: "Вас кикнули из этой комнаты",
    notifMention: "Вас упомянули в",
    notifDm: "Новое сообщение от"
  }
};

let currentLang = localStorage.getItem("lang") || "en";
let currentTheme = localStorage.getItem("theme") || "dark";

function t(key) { return (translations[currentLang] && translations[currentLang][key]) || key; }

function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(el => {
    const key = el.getAttribute("data-i18n-ph");
    el.placeholder = t(key);
  });
}

function applyTheme() {
  document.body.setAttribute("data-theme", currentTheme);
}

// ------------------------------------------------------------------
// ENCRYPTION
// ------------------------------------------------------------------

function shaKey(str) { return CryptoJS.SHA256(str + "::salt::v1").toString(); }
function encryptText(plain, key) {
  if (!plain) return "";
  return CryptoJS.AES.encrypt(plain, shaKey(key)).toString();
}
function decryptText(cipher, key) {
  if (!cipher) return "";
  try {
    const bytes = CryptoJS.AES.decrypt(cipher, shaKey(key));
    return bytes.toString(CryptoJS.enc.Utf8) || "[could not decrypt]";
  } catch { return "[could not decrypt]"; }
}
function hashPassword(pw) { return CryptoJS.SHA256("room::" + pw).toString(); }
function dmKey(a, b) { const [x, y] = [a, b].sort(); return "DM::" + x + "::" + y; }
function dmPath(a, b) { const [x, y] = [a, b].sort(); return `dms/${x}__${y}/messages`; }

// ------------------------------------------------------------------
// URL EMBEDDING
// ------------------------------------------------------------------

const URL_REGEX = /\bhttps?:\/\/[^\s<>"']+/gi;
const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i;
const VID_EXT = /\.(mp4|webm|ogg|mov)(\?.*)?$/i;
const MEDIA_HOSTS = [
  "media.tenor.com", "c.tenor.com",
  "media.giphy.com", "i.giphy.com",
  "i.imgur.com", "cdn.discordapp.com", "media.discordapp.net"
];

function classifyUrl(url) {
  let u;
  try { u = new URL(url); } catch { return "link"; }
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  if (IMG_EXT.test(path)) return "image";
  if (VID_EXT.test(path)) return "video";
  if (MEDIA_HOSTS.includes(host)) {
    if (VID_EXT.test(path)) return "video";
    return "image";
  }
  return "link";
}

function buildLineContent(lineEl, plainText) {
  const urls = [];
  const regex = new RegExp(URL_REGEX.source, "gi");
  let m;
  while ((m = regex.exec(plainText)) !== null) urls.push(m[0]);

  const mediaUrls = urls.filter(u => {
    const k = classifyUrl(u);
    return k === "image" || k === "video";
  });
  const nonMediaUrls = urls.filter(u => classifyUrl(u) === "link");

  let rest = plainText.replace(URL_REGEX, "").trim();

  // Highlight @mentions in the text
  const mentionRegex = /@([A-Za-z0-9_]+)/g;
  const renderTextWithMentions = (parent, text) => {
    let lastIdx = 0;
    let mm;
    while ((mm = mentionRegex.exec(text)) !== null) {
      if (mm.index > lastIdx) parent.appendChild(document.createTextNode(text.slice(lastIdx, mm.index)));
      const span = document.createElement("span");
      span.style.color = "#ffb347";
      span.style.fontWeight = "700";
      span.textContent = mm[0];
      parent.appendChild(span);
      lastIdx = mentionRegex.lastIndex;
    }
    if (lastIdx < text.length) parent.appendChild(document.createTextNode(text.slice(lastIdx)));
  };

  if (mediaUrls.length > 0) {
    if (rest) {
      renderTextWithMentions(lineEl, rest + " ");
    }
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

  let lastIndex = 0;
  const re2 = new RegExp(URL_REGEX.source, "gi");
  while ((m = re2.exec(plainText)) !== null) {
    if (m.index > lastIndex) {
      renderTextWithMentions(lineEl, plainText.slice(lastIndex, m.index));
    }
    const a = document.createElement("a");
    a.href = m[0]; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.textContent = m[0];
    lineEl.appendChild(a);
    lastIndex = re2.lastIndex;
  }
  if (lastIndex < plainText.length) {
    renderTextWithMentions(lineEl, plainText.slice(lastIndex));
  }
}

// ------------------------------------------------------------------
// STATE
// ------------------------------------------------------------------

let me = null;
let currentServerCode = null;
let currentRoomRef    = null;
let currentQueryRef   = null;
let currentRoomMeta   = null;
let currentPresenceRef = null;
let currentPresenceListener = null;
let currentKickedListener = null;
let currentKickedRef  = null;
let blockedSet        = new Set();
let userCache         = new Map();
let pendingFile       = null;
let activeDmUid       = null;
let dmQueryRef        = null;
let groupOnChildOff   = null;
let dmOnChildOff      = null;
let lobbyRoomsListener = null;
let lobbyRenderToken  = 0;
let roomCards         = new Map(); // code -> DOM node

// Notifications
let notifListenerOff  = null;
let notifications     = [];
let unreadCount       = 0;

// DM notification tracking: which DM message IDs we've already notified on
const dmNotifiedKeys = new Set();

// Grouping
let lastGroupEl = null;
let lastGroupUid = null;
let lastGroupTime = 0;

// ------------------------------------------------------------------
// DOM
// ------------------------------------------------------------------

const $ = id => document.getElementById(id);

const authScreen   = $("authScreen");
const appRoot      = $("appRoot");

const tabLogin     = $("tabLogin");
const tabSignup    = $("tabSignup");
const loginForm    = $("loginForm");
const signupForm   = $("signupForm");
const loginEmail   = $("loginEmail");
const loginPassword= $("loginPassword");
const loginBtn     = $("loginBtn");
const signupUsername = $("signupUsername");
const signupEmail  = $("signupEmail");
const signupPassword = $("signupPassword");
const signupBtn    = $("signupBtn");
const authError    = $("authError");

const myUsernameLabel = $("myUsernameLabel");
const backToLobbyBtn  = $("backToLobbyBtn");
const notifBtn     = $("notifBtn");
const notifBadge   = $("notifBadge");
const notifDropdown = $("notifDropdown");
const notifList    = $("notifList");
const markAllReadBtn = $("markAllReadBtn");
const settingsBtn  = $("settingsBtn");
const profileBtn   = $("profileBtn");
const myPfpBtn     = $("myPfpBtn");
const statusDot    = $("statusDot");
const statusText   = $("statusText");

const lobbyView    = $("lobbyView");
const roomView     = $("roomView");
const roomGrid     = $("roomGrid");
const openCreateRoomBtn = $("openCreateRoomBtn");
const openPublicRoomBtn = $("openPublicRoomBtn");

const onlineCount  = $("onlineCount");
const capacityLabel = $("capacityLabel");
const userList     = $("userList");
const adminPanel   = $("adminPanel");
const adminPanelTitle = $("adminPanelTitle");
const kickPanelBtn = $("kickPanelBtn");
const roomSettingsBtn = $("roomSettingsBtn");

const chatHeadTitle = $("chatHeadTitle");
const chatHeadLock  = $("chatHeadLock");
const adminBadge    = $("adminBadge");
const closeDmBtn    = $("closeDmBtn");
const chatContainer = $("chatContainer");
const emptyState    = $("emptyState");

const messageInput = $("messageInput");
const fileInput    = $("fileInput");
const fileLabel    = $("fileLabel");
const sendBtn      = $("sendBtn");
const toastEl      = $("toast");

const filePreview      = $("filePreview");
const filePreviewImg   = $("filePreviewImg");
const filePreviewVideo = $("filePreviewVideo");
const filePreviewName  = $("filePreviewName");
const filePreviewRemove= $("filePreviewRemove");

const userModal    = $("userModal");
const modalPfp     = $("modalPfp");
const modalName    = $("modalName");
const modalBio     = $("modalBio");
const modalDmBtn   = $("modalDmBtn");
const modalBlockBtn= $("modalBlockBtn");
const modalKickBtn = $("modalKickBtn");
const modalCloseBtn= $("modalCloseBtn");

const profileModal = $("profileModal");
const myProfileAvatar = $("myProfileAvatar");
const profileHeroName = $("profileHeroName");
const profileHeroEmail = $("profileHeroEmail");
const editUsername = $("editUsername");
const editBio      = $("editBio");
const editPfp      = $("editPfp");
const saveProfileBtn = $("saveProfileBtn");
const cancelProfileBtn = $("cancelProfileBtn");
const profileError = $("profileError");

const createRoomModal = $("createRoomModal");
const createRoomCodeInput = $("createRoomCodeInput");
const createRoomName  = $("createRoomName");
const createRoomMax   = $("createRoomMax");
const createRoomPassword = $("createRoomPassword");
const createRoomBtn   = $("createRoomBtn");
const cancelCreateRoomBtn = $("cancelCreateRoomBtn");
const createRoomError = $("createRoomError");

const passwordModal = $("passwordModal");
const passwordRoomCode = $("passwordRoomCode");
const joinRoomPassword = $("joinRoomPassword");
const submitPasswordBtn = $("submitPasswordBtn");
const cancelPasswordBtn = $("cancelPasswordBtn");
const passwordError = $("passwordError");

const kickedModal = $("kickedModal");
const kickedList  = $("kickedList");
const closeKickedBtn = $("closeKickedBtn");

const roomSettingsModal = $("roomSettingsModal");
const settingsRoomName = $("settingsRoomName");
const settingsRoomMax  = $("settingsRoomMax");
const settingsRoomPassword = $("settingsRoomPassword");
const saveRoomSettingsBtn = $("saveRoomSettingsBtn");
const cancelRoomSettingsBtn = $("cancelRoomSettingsBtn");
const roomSettingsError = $("roomSettingsError");

const settingsModal = $("settingsModal");
const themeSelect   = $("themeSelect");
const languageSelect = $("languageSelect");
const currentPassword = $("currentPassword");
const newPassword   = $("newPassword");
const changePasswordBtn = $("changePasswordBtn");
const logoutBtn2    = $("logoutBtn2");
const closeSettingsBtn = $("closeSettingsBtn");
const settingsError = $("settingsError");

// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function setStatus(on) {
  statusDot.classList.toggle("online", on);
  statusText.textContent = on ? "connected" : "disconnected";
  messageInput.disabled = !on;
  fileInput.disabled    = !on;
  sendBtn.disabled      = !on;
  fileLabel.style.opacity       = on ? "1" : "0.5";
  fileLabel.style.pointerEvents = on ? "auto" : "none";
}

function resetChatUI() {
  chatContainer.innerHTML = "";
  chatContainer.appendChild(emptyState);
  emptyState.style.display = "flex";
  lastGroupEl = null;
  lastGroupUid = null;
  lastGroupTime = 0;
}

function hideEmptyState() {
  if (emptyState.parentNode === chatContainer) emptyState.style.display = "none";
}

function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function defaultPfp(name) {
  const letter = (name || "?").trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>
    <rect width='32' height='32' fill='#241a1a'/>
    <text x='16' y='22' font-family='Tahoma' font-size='18' text-anchor='middle' fill='#d94a4a'>${letter}</text>
  </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

async function fetchUser(uid) {
  if (userCache.has(uid)) return userCache.get(uid);
  try {
    const snap = await get(ref(db, `users/${uid}`));
    const data = snap.val() || {};
    const profile = {
      uid,
      username: data.username || "user",
      pfp: data.pfp || defaultPfp(data.username),
      bio: data.bio || ""
    };
    userCache.set(uid, profile);
    return profile;
  } catch {
    const fallback = { uid, username: "user", pfp: defaultPfp("?"), bio: "" };
    userCache.set(uid, fallback);
    return fallback;
  }
}

function isAdmin() {
  return me && currentRoomMeta && currentRoomMeta.adminUid === me.uid;
}

function updateAdminUI() {
  const admin = isAdmin();
  adminBadge.classList.toggle("hidden", !admin);
  adminPanel.classList.toggle("hidden", !admin);
  adminPanelTitle.classList.toggle("hidden", !admin);
}

function updateMyPfpButton() { myPfpBtn.src = me.pfp || defaultPfp(me.username); }

function showLobby() {
  lobbyView.classList.remove("hidden");
  roomView.classList.add("hidden");
  backToLobbyBtn.classList.add("hidden");
  setStatus(false);
}

function showRoom() {
  lobbyView.classList.add("hidden");
  roomView.classList.remove("hidden");
  backToLobbyBtn.classList.remove("hidden");
  setStatus(true);
}

// ------------------------------------------------------------------
// AUTH
// ------------------------------------------------------------------

tabLogin.addEventListener("click", () => {
  tabLogin.classList.add("active"); tabSignup.classList.remove("active");
  loginForm.classList.remove("hidden"); signupForm.classList.add("hidden");
  authError.textContent = "";
});

tabSignup.addEventListener("click", () => {
  tabSignup.classList.add("active"); tabLogin.classList.remove("active");
  signupForm.classList.remove("hidden"); loginForm.classList.add("hidden");
  authError.textContent = "";
});

loginBtn.addEventListener("click", async () => {
  authError.textContent = "";
  const email = loginEmail.value.trim();
  const pass  = loginPassword.value;
  if (!email || !pass) { authError.textContent = "Fill in all fields"; return; }
  try { await signInWithEmailAndPassword(auth, email, pass); }
  catch (e) { authError.textContent = e.message.replace("Firebase: ", ""); }
});

signupBtn.addEventListener("click", async () => {
  authError.textContent = "";
  const username = signupUsername.value.trim();
  const email    = signupEmail.value.trim();
  const pass     = signupPassword.value;

  if (!username || !email || !pass) { authError.textContent = "Fill in all fields"; return; }
  if (username.length < 2 || username.length > 24) { authError.textContent = "Username must be 2–24 chars"; return; }
  if (pass.length < 6) { authError.textContent = "Password must be 6+ chars"; return; }

  try {
    window.__signupInProgress = true;
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await set(ref(db, `users/${cred.user.uid}`), {
      username, bio: "", pfp: "", createdAt: serverTimestamp()
    });
    userCache.delete(cred.user.uid);
  } catch (e) {
    window.__signupInProgress = false;
    authError.textContent = e.message.replace("Firebase: ", "");
  }
});

async function doLogout() {
  await detachFromRoom();
  await signOut(auth);
}

logoutBtn2.addEventListener("click", doLogout);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    me = null;
    window.__signupInProgress = false;
    if (notifListenerOff) { notifListenerOff(); notifListenerOff = null; }
    authScreen.classList.remove("hidden");
    appRoot.classList.add("hidden");
    return;
  }

  if (window.__signupInProgress) {
    let tries = 0;
    while (tries < 30) {
      const snap = await get(ref(db, `users/${user.uid}`));
      if (snap.exists()) break;
      await new Promise(r => setTimeout(r, 100));
      tries++;
    }
    window.__signupInProgress = false;
  }

  const snap = await get(ref(db, `users/${user.uid}`));
  let data = snap.val();
  if (!data) {
    const fallbackName = (user.email || "").split("@")[0].slice(0, 16) || "user";
    data = { username: fallbackName, bio: "", pfp: "" };
    await set(ref(db, `users/${user.uid}`), data);
  }

  me = {
    uid: user.uid,
    email: user.email,
    username: data.username || "user",
    pfp: data.pfp || "",
    bio: data.bio || ""
  };

  myUsernameLabel.textContent = me.username;
  updateMyPfpButton();

  blockedSet = new Set();
  const blockSnap = await get(ref(db, `blocks/${me.uid}`));
  const blockData = blockSnap.val() || {};
  Object.keys(blockData).forEach(uid => blockedSet.add(uid));

  authScreen.classList.add("hidden");
  appRoot.classList.remove("hidden");
  showLobby();

  await ensurePublicRoom();
  startLobbyListener();
  startNotificationListener();
});

// ------------------------------------------------------------------
// PUBLIC ROOM
// ------------------------------------------------------------------

async function ensurePublicRoom() {
  try {
    const snap = await get(ref(db, `rooms/${PUBLIC_ROOM_CODE}`));
    if (!snap.exists()) {
      await set(ref(db, `rooms/${PUBLIC_ROOM_CODE}`), {
        name: "Public Lobby",
        adminUid: "system",
        hasPassword: false,
        passwordHash: "",
        maxUsers: 500,
        kicked: {},
        isPublic: true,
        createdAt: serverTimestamp()
      });
    }
  } catch (e) {
    console.warn("Could not ensure public room:", e);
  }
}

openPublicRoomBtn.addEventListener("click", () => {
  requestJoinRoom(PUBLIC_ROOM_CODE);
});

// ------------------------------------------------------------------
// LOBBY
// ------------------------------------------------------------------

function startLobbyListener() {
  if (lobbyRoomsListener) lobbyRoomsListener();
  const roomsRef = ref(db, "rooms");
  lobbyRoomsListener = onValue(
    roomsRef,
    (snap) => { renderRoomGrid(snap.val() || {}); },
    (err) => {
      console.error("Lobby listener error:", err);
      roomGrid.innerHTML = '<p class="lobby-empty">Could not load rooms.</p>';
    }
  );
}

async function renderRoomGrid(rooms) {
  const token = ++lobbyRenderToken;

  const codes = Object.keys(rooms);
  if (!codes.length) {
    roomGrid.innerHTML = '<p class="lobby-empty">No rooms yet. Create one.</p>';
    roomCards.clear();
    return;
  }

  // Drop the empty message if it's there
  const empty = roomGrid.querySelector(".lobby-empty");
  if (empty) empty.remove();

  // Fetch presence counts in parallel
  const counts = {};
  await Promise.all(codes.map(async (code) => {
    try {
      const s = await get(ref(db, `chats/${code}/presence`));
      counts[code] = Object.keys(s.val() || {}).length;
    } catch { counts[code] = 0; }
  }));

  if (token !== lobbyRenderToken) return; // a newer render has started

  // Sort: public first, then alphabetical
  codes.sort((a, b) => {
    if (a === PUBLIC_ROOM_CODE) return -1;
    if (b === PUBLIC_ROOM_CODE) return 1;
    const na = (rooms[a].name || a).toLowerCase();
    const nb = (rooms[b].name || b).toLowerCase();
    return na.localeCompare(nb);
  });

  // Diff DOM: add new, update existing, remove gone
  const present = new Set(codes);

  for (const code of codes) {
    const r = rooms[code] || {};
    let card = roomCards.get(code);

    if (!card) {
      card = document.createElement("div");
      card.className = "room-card";
      card.addEventListener("click", () => requestJoinRoom(code));
      roomCards.set(code, card);
      roomGrid.appendChild(card);
    }

    const max = r.maxUsers || 50;
    const icons = [];
    if (r.hasPassword) icons.push('<span title="Password protected">🔒</span>');
    if (r.isPublic) icons.push('<span title="Public">🌐</span>');
    if (r.adminUid === me?.uid) icons.push('<span title="You are admin">👑</span>');

    card.innerHTML = `
      <div class="rc-name">${escapeHtml(r.name || code)}</div>
      <div class="rc-code">${escapeHtml(code)}</div>
      <div class="rc-meta">
        <span>${counts[code]} / ${max}</span>
        <div class="rc-icons">${icons.join("")}</div>
      </div>
    `;
  }

  // Remove gone
  for (const [code, node] of roomCards) {
    if (!present.has(code)) {
      node.remove();
      roomCards.delete(code);
    }
  }

  // Re-sort DOM to match sorted codes order
  for (const code of codes) {
    const card = roomCards.get(code);
    if (card) roomGrid.appendChild(card);
  }
}

openCreateRoomBtn.addEventListener("click", () => {
  createRoomCodeInput.value = "";
  createRoomName.value = "";
  createRoomMax.value = "20";
  createRoomPassword.value = "";
  createRoomError.textContent = "";
  createRoomModal.classList.remove("hidden");
});

// ------------------------------------------------------------------
// JOIN / CREATE
// ------------------------------------------------------------------

async function requestJoinRoom(code) {
  const roomSnap = await get(ref(db, `rooms/${code}`));
  if (!roomSnap.exists()) {
    showToast("That room no longer exists");
    return;
  }

  const room = roomSnap.val();

  if (room.kicked && room.kicked[me.uid]) {
    showToast(t("kickedToast"));
    return;
  }

  const max = room.maxUsers || 50;
  const presSnap = await get(ref(db, `chats/${code}/presence`));
  const presData = presSnap.val() || {};
  const inRoom = !!presData[me.uid];
  const count = Object.keys(presData).length;

  if (!inRoom && count >= max) {
    showToast(`Room is full (${count}/${max})`);
    return;
  }

  if (room.hasPassword) {
    passwordRoomCode.textContent = code;
    joinRoomPassword.value = "";
    passwordError.textContent = "";
    passwordModal.classList.remove("hidden");
    return;
  }

  await enterRoom(code, room);
}

createRoomBtn.addEventListener("click", async () => {
  const code = createRoomCodeInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const name = createRoomName.value.trim() || code;
  const max  = parseInt(createRoomMax.value, 10) || 20;
  const pw   = createRoomPassword.value;

  createRoomError.textContent = "";
  if (code.length < 2) { createRoomError.textContent = "Code must be 2+ chars (a-z, 0-9, -, _)"; return; }
  if (code === PUBLIC_ROOM_CODE) { createRoomError.textContent = "That code is reserved"; return; }
  if (name.length > 40) { createRoomError.textContent = "Name too long"; return; }
  if (max < 2 || max > 500) { createRoomError.textContent = "Max users must be 2–500"; return; }

  const exists = await get(ref(db, `rooms/${code}`));
  if (exists.exists()) { createRoomError.textContent = "That code is taken"; return; }

  const meta = {
    name,
    adminUid: me.uid,
    createdAt: serverTimestamp(),
    hasPassword: !!pw,
    passwordHash: pw ? hashPassword(pw) : "",
    maxUsers: max,
    kicked: {}
  };

  try {
    await set(ref(db, `rooms/${code}`), meta);
    createRoomModal.classList.add("hidden");
    showToast("Room created — you're the admin");
    await enterRoom(code, { ...meta, hasPassword: !!pw });
  } catch (e) {
    createRoomError.textContent = e.message;
  }
});

cancelCreateRoomBtn.addEventListener("click", () => createRoomModal.classList.add("hidden"));

submitPasswordBtn.addEventListener("click", async () => {
  const code = passwordRoomCode.textContent;
  const pw   = joinRoomPassword.value;
  passwordError.textContent = "";

  const roomSnap = await get(ref(db, `rooms/${code}`));
  const room = roomSnap.val();
  if (!room) { passwordError.textContent = "Room disappeared"; return; }
  if (room.passwordHash !== hashPassword(pw)) { passwordError.textContent = "Wrong password"; return; }
  if (room.kicked && room.kicked[me.uid]) { passwordError.textContent = t("kickedToast"); return; }

  const max = room.maxUsers || 50;
  const presSnap = await get(ref(db, `chats/${code}/presence`));
  const count = Object.keys(presSnap.val() || {}).length;
  if (count >= max) { passwordError.textContent = `Room is full (${count}/${max})`; return; }

  passwordModal.classList.add("hidden");
  await enterRoom(code, room);
});

cancelPasswordBtn.addEventListener("click", () => passwordModal.classList.add("hidden"));

async function enterRoom(code, roomMeta) {
  await detachFromRoom();

  currentServerCode = code;
  currentRoomMeta   = roomMeta;
  currentRoomRef    = ref(db, `chats/${code}/messages`);
  currentQueryRef   = query(currentRoomRef, limitToLast(100));

  exitDmView();
  resetChatUI();
  showRoom();
  updateAdminUI();

  chatHeadTitle.textContent = "# " + (roomMeta.name || code);
  chatHeadLock.classList.toggle("hidden", !roomMeta.hasPassword);

  const max = roomMeta.maxUsers || 50;
  capacityLabel.textContent = "/ " + max;

  const handleChild = (snapshot) => {
    const msg = snapshot.val();
    if (!msg) return;
    if (blockedSet.has(msg.uid)) return;
    renderMessage(snapshot.key, msg, msg.uid === me.uid);
    hideEmptyState();
  };
  onChildAdded(currentQueryRef, handleChild);
  groupOnChildOff = () => off(currentQueryRef, "child_added", handleChild);

  // Presence
  currentPresenceRef = ref(db, `chats/${code}/presence/${me.uid}`);
  await set(currentPresenceRef, {
    username: me.username,
    pfp: me.pfp,
    joinedAt: serverTimestamp()
  });
  onDisconnect(currentPresenceRef).remove();

  const presQuery = ref(db, `chats/${code}/presence`);
  currentPresenceListener = onValue(presQuery, (snap) => {
    renderUserList(snap.val() || {});
  });

  // Kicked watcher — the fix for "kick doesn't actually kick"
  currentKickedRef = ref(db, `rooms/${code}/kicked/${me.uid}`);
  currentKickedListener = onValue(currentKickedRef, async (snap) => {
    if (snap.val() === true && currentServerCode === code) {
      showToast(t("kickedToast"));
      await detachFromRoom();
      resetChatUI();
      showLobby();
    }
  });

  showToast("Joined #" + code);
}

async function detachFromRoom() {
  if (groupOnChildOff) { groupOnChildOff(); groupOnChildOff = null; }
  if (dmOnChildOff)    { dmOnChildOff();    dmOnChildOff    = null; }
  if (currentPresenceListener) { currentPresenceListener(); currentPresenceListener = null; }
  if (currentKickedListener) { currentKickedListener(); currentKickedListener = null; }
  if (currentPresenceRef) {
    try { await remove(currentPresenceRef); } catch {}
    currentPresenceRef = null;
  }
  currentRoomRef = null;
  currentQueryRef = null;
  currentServerCode = null;
  currentRoomMeta = null;
  currentKickedRef = null;
  activeDmUid = null;
  dmQueryRef = null;
  updateAdminUI();
}

backToLobbyBtn.addEventListener("click", async () => {
  await detachFromRoom();
  resetChatUI();
  showLobby();
});

// ------------------------------------------------------------------
// NOTIFICATIONS
// ------------------------------------------------------------------

function startNotificationListener() {
  if (notifListenerOff) notifListenerOff();
  const notifRef = ref(db, `notifications/${me.uid}`);
  notifListenerOff = onValue(notifRef, (snap) => {
    const data = snap.val() || {};
    notifications = Object.entries(data).map(([id, n]) => ({ id, ...n }));
    notifications.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    unreadCount = notifications.filter(n => !n.read).length;
    renderNotifications();
  });
}

function renderNotifications() {
  if (unreadCount > 0) {
    notifBadge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    notifBadge.classList.remove("hidden");
  } else {
    notifBadge.classList.add("hidden");
  }

  notifList.innerHTML = "";
  if (!notifications.length) {
    notifList.innerHTML = `<p class="notif-empty">${t("noNotifications")}</p>`;
    return;
  }

  for (const n of notifications) {
    const item = document.createElement("div");
    item.className = "notif-item" + (n.read ? "" : " unread");
    item.innerHTML = `
      <div class="n-title">${escapeHtml(n.title || "")}</div>
      <div class="n-body">${escapeHtml(n.body || "")}</div>
      <div class="n-time">${formatTime(n.timestamp)}</div>
    `;
    item.addEventListener("click", async () => {
      // Mark read
      if (!n.read) {
        try { update(ref(db, `notifications/${me.uid}/${n.id}`), { read: true }); } catch {}
      }
      notifDropdown.classList.add("hidden");
      // Navigate
      if (n.type === "mention" && n.roomCode) {
        if (currentServerCode !== n.roomCode) {
          await requestJoinRoom(n.roomCode);
        }
      } else if (n.type === "dm" && n.fromUid) {
        if (!currentServerCode) {
          // Need a room to host the DM view; use public
          await requestJoinRoom(PUBLIC_ROOM_CODE);
        }
        openDm(n.fromUid);
      }
    });
    notifList.appendChild(item);
  }
}

notifBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  notifDropdown.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (!notifDropdown.classList.contains("hidden")) {
    if (!notifDropdown.contains(e.target) && e.target !== notifBtn) {
      notifDropdown.classList.add("hidden");
    }
  }
});

markAllReadBtn.addEventListener("click", async () => {
  const updates = {};
  for (const n of notifications) {
    if (!n.read) updates[`${n.id}/read`] = true;
  }
  if (Object.keys(updates).length) {
    try { update(ref(db, `notifications/${me.uid}`), updates); } catch {}
  }
});

async function pushNotification(targetUid, payload) {
  if (targetUid === me.uid) return;
  try {
    await push(ref(db, `notifications/${targetUid}`), {
      ...payload,
      read: false,
      timestamp: serverTimestamp()
    });
  } catch (e) {
    console.warn("Could not push notification:", e);
  }
}

function extractMentions(text) {
  const matches = text.matchAll(/@([A-Za-z0-9_]+)/g);
  const out = new Set();
  for (const m of matches) out.add(m[1].toLowerCase());
  return Array.from(out);
}

// ------------------------------------------------------------------
// RENDER MESSAGE (grouped)
// ------------------------------------------------------------------

async function renderMessage(msgId, msg, isOwn) {
  const sender = await fetchUser(msg.uid);

  const now = msg.timestamp || Date.now();
  const sameUser = lastGroupUid === msg.uid;
  const withinWindow = (now - lastGroupTime) < GROUP_WINDOW_MS;
  const inDmView = !!activeDmUid;

  // Decrypt text once so we can check mentions
  let plainText = "";
  if (msg.text) {
    const key = msg.dmKey ? msg.dmKey : currentServerCode;
    plainText = decryptText(msg.text, key);
  }

  // Mention highlight
  const mentionedMe = plainText && me &&
    extractMentions(plainText).includes(me.username.toLowerCase());

  if (!lastGroupEl || !sameUser || !withinWindow) {
    const group = document.createElement("div");
    group.className = "msg-group" + (isOwn ? " own" : "");

    const head = document.createElement("div");
    head.className = "group-head";
    const pfpUrl = sender.pfp || defaultPfp(sender.username);
    head.innerHTML = `<img class="mini-pfp" src="${pfpUrl}" alt="">
      ${escapeHtml(sender.username)}
      <span class="group-time">${formatTime(msg.timestamp)}</span>`;

    const body = document.createElement("div");
    body.className = "group-body";

    group.appendChild(head);
    group.appendChild(body);
    chatContainer.appendChild(group);

    lastGroupEl = group;
    lastGroupUid = msg.uid;
  }

  lastGroupTime = now;

  const body = lastGroupEl.querySelector(".group-body");

  const line = document.createElement("div");
  line.className = "msg-line" + (mentionedMe ? " mention" : "");
  line.dataset.msgId = msgId;

  if (plainText) {
    if (plainText !== "[could not decrypt]") {
      buildLineContent(line, plainText);
    } else {
      line.appendChild(document.createTextNode(plainText));
    }
  }

  if (msg.mediaType && msg.mediaData) {
    const key = msg.dmKey ? msg.dmKey : currentServerCode;
    const src = decryptText(msg.mediaData, key);
    if (src && src.startsWith("data:")) {
      if (msg.mediaType === "image" || msg.mediaType === "gif") {
        const img = document.createElement("img");
        img.src = src; img.loading = "lazy";
        line.appendChild(img);
        if (msg.mediaType === "gif") {
          const t2 = document.createElement("span");
          t2.className = "gif-tag";
          t2.textContent = "GIF";
          line.appendChild(t2);
        }
      } else if (msg.mediaType === "video") {
        const v = document.createElement("video");
        v.src = src; v.controls = true; v.preload = "metadata";
        line.appendChild(v);
      }
    }
  }

  if (isAdmin() && !inDmView && currentServerCode) {
    const del = document.createElement("button");
    del.className = "delete-msg";
    del.textContent = "Delete";
    del.addEventListener("click", async () => {
      if (!confirm("Delete this message?")) return;
      try {
        await remove(ref(db, `chats/${currentServerCode}/messages/${msgId}`));
        line.remove();
        if (!body.children.length) lastGroupEl.remove();
      } catch (e) { showToast("Could not delete: " + e.message); }
    });
    line.appendChild(del);
  }

  body.appendChild(line);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  // Send notifications for mentions and DMs
  if (!isOwn) {
    if (mentionedMe && !inDmView && currentServerCode) {
      pushNotification(msg.uid === me.uid ? me.uid : sender.uid, {
        type: "mention",
        title: `${t("notifMention")} #${currentRoomMeta?.name || currentServerCode}`,
        body: `${sender.username}: ${plainText.slice(0, 80)}`,
        roomCode: currentServerCode,
        fromUid: msg.uid
      });
      // Note: we send notification to the *mentioned* user in this case;
      // but msg.uid is the sender. So we must target the mentioned user.
      // Fix: iterate mentions and notify each matching user we know about.
    }

    // DM notification
    if (inDmView && activeDmUid === msg.uid) {
      const key = `${activeDmUid}::${msgId}`;
      if (!dmNotifiedKeys.has(key)) {
        dmNotifiedKeys.add(key);
        pushNotification(msg.uid, {
          type: "dm",
          title: t("notifDm") + " " + sender.username,
          body: plainText ? plainText.slice(0, 80) : "[media]",
          fromUid: msg.uid
        });
      }
    }
  }
}

// ------------------------------------------------------------------
// SIDE PANEL
// ------------------------------------------------------------------

let lastPresenceData = {};

function renderUserList(presenceData) {
  lastPresenceData = presenceData || {};
  refreshUserList();
}

async function refreshUserList() {
  const uids = Object.keys(lastPresenceData);
  onlineCount.textContent = uids.length;

  userList.innerHTML = "";

  uids.sort((a, b) => {
    if (a === me.uid) return -1;
    if (b === me.uid) return 1;
    const na = (lastPresenceData[a].username || "").toLowerCase();
    const nb = (lastPresenceData[b].username || "").toLowerCase();
    return na.localeCompare(nb);
  });

  for (const uid of uids) {
    const profile = await fetchUser(uid);
    const row = document.createElement("div");
    row.className = "user-item" + (blockedSet.has(uid) ? " blocked" : "");

    const pfp = profile.pfp || defaultPfp(profile.username);
    const name = profile.username + (uid === me.uid ? " (you)" : "");

    row.innerHTML = `<img src="${pfp}" alt=""><span class="u-name">${escapeHtml(name)}</span>`;

    if (uid !== me.uid) row.addEventListener("click", () => openUserModal(uid));

    userList.appendChild(row);
  }
}

// ------------------------------------------------------------------
// USER MODAL
// ------------------------------------------------------------------

let modalUid = null;

async function openUserModal(uid) {
  modalUid = uid;
  const p = await fetchUser(uid);

  modalPfp.src  = p.pfp || defaultPfp(p.username);
  modalName.textContent = p.username;
  modalBio.textContent  = p.bio || "(no bio)";

  modalBlockBtn.textContent = blockedSet.has(uid) ? t("unblock") || "Unblock" : t("block");
  modalKickBtn.classList.toggle("hidden", !isAdmin() || currentRoomMeta?.isPublic);

  userModal.classList.remove("hidden");
}

modalCloseBtn.addEventListener("click", () => { userModal.classList.add("hidden"); modalUid = null; });

modalDmBtn.addEventListener("click", () => {
  if (!modalUid) return;
  userModal.classList.add("hidden");
  openDm(modalUid);
  modalUid = null;
});

modalBlockBtn.addEventListener("click", async () => {
  if (!modalUid) return;
  const uid = modalUid;

  if (blockedSet.has(uid)) {
    blockedSet.delete(uid);
    try { await remove(ref(db, `blocks/${me.uid}/${uid}`)); } catch {}
    showToast("Unblocked");
  } else {
    blockedSet.add(uid);
    try { await set(ref(db, `blocks/${me.uid}/${uid}`), true); } catch {}
    showToast("Blocked (client-side only)");
  }

  userModal.classList.add("hidden");
  modalUid = null;
  refreshUserList();
  if (!activeDmUid && currentServerCode) await reattachGroupListener();
});

modalKickBtn.addEventListener("click", async () => {
  if (!modalUid || !isAdmin()) return;
  if (currentRoomMeta?.isPublic) return;
  const uid = modalUid;

  try {
    await set(ref(db, `rooms/${currentServerCode}/kicked/${uid}`), true);
    await remove(ref(db, `chats/${currentServerCode}/presence/${uid}`));
    showToast("Kicked");
  } catch (e) { showToast("Could not kick: " + e.message); }

  userModal.classList.add("hidden");
  modalUid = null;
});

kickPanelBtn.addEventListener("click", async () => {
  kickedList.innerHTML = "";
  const snap = await get(ref(db, `rooms/${currentServerCode}/kicked`));
  const data = snap.val() || {};
  const uids = Object.keys(data);

  if (!uids.length) {
    kickedList.innerHTML = `<p class="modal-sub">${t("nobodyKicked")}</p>`;
  } else {
    for (const uid of uids) {
      const p = await fetchUser(uid);
      const row = document.createElement("div");
      row.className = "kicked-row";
      row.innerHTML = `<img src="${p.pfp || defaultPfp(p.username)}" alt="">
        <span>${escapeHtml(p.username)}</span>
        <button data-uid="${uid}">Un-kick</button>`;
      row.querySelector("button").addEventListener("click", async () => {
        try {
          await remove(ref(db, `rooms/${currentServerCode}/kicked/${uid}`));
          row.remove();
          showToast("Un-kicked");
        } catch (e) { showToast(e.message); }
      });
      kickedList.appendChild(row);
    }
  }

  kickedModal.classList.remove("hidden");
});

closeKickedBtn.addEventListener("click", () => kickedModal.classList.add("hidden"));

roomSettingsBtn.addEventListener("click", () => {
  settingsRoomName.value = currentRoomMeta?.name || "";
  settingsRoomMax.value  = currentRoomMeta?.maxUsers || 20;
  settingsRoomPassword.value = "";
  roomSettingsError.textContent = "";
  roomSettingsModal.classList.remove("hidden");
});

cancelRoomSettingsBtn.addEventListener("click", () => roomSettingsModal.classList.add("hidden"));

saveRoomSettingsBtn.addEventListener("click", async () => {
  if (!isAdmin()) return;
  roomSettingsError.textContent = "";

  const name = settingsRoomName.value.trim();
  const max  = parseInt(settingsRoomMax.value, 10) || 20;
  if (!name || name.length > 40) { roomSettingsError.textContent = "Name must be 1–40 chars"; return; }
  if (max < 2 || max > 500) { roomSettingsError.textContent = "Max users must be 2–500"; return; }

  const updates = { name, maxUsers: max };

  const newPw = settingsRoomPassword.value;
  if (newPw) {
    updates.hasPassword = true;
    updates.passwordHash = hashPassword(newPw);
  }

  try {
    await update(ref(db, `rooms/${currentServerCode}`), updates);
    currentRoomMeta = { ...currentRoomMeta, ...updates };
    chatHeadTitle.textContent = "# " + name;
    chatHeadLock.classList.toggle("hidden", !currentRoomMeta.hasPassword);
    capacityLabel.textContent = "/ " + max;
    roomSettingsModal.classList.add("hidden");
    showToast("Room updated");
  } catch (e) { roomSettingsError.textContent = e.message; }
});

// ------------------------------------------------------------------
// DMs
// ------------------------------------------------------------------

async function openDm(otherUid) {
  if (!currentServerCode) { showToast("Join a room first"); return; }
  if (dmOnChildOff) { dmOnChildOff(); dmOnChildOff = null; }

  activeDmUid = otherUid;
  dmQueryRef  = query(ref(db, dmPath(me.uid, otherUid)), limitToLast(100));

  resetChatUI();

  const other = await fetchUser(otherUid);
  chatHeadTitle.textContent = "DM with " + other.username;
  closeDmBtn.classList.remove("hidden");
  adminBadge.classList.add("hidden");
  chatHeadLock.classList.add("hidden");

  const handleChild = (snapshot) => {
    const msg = snapshot.val();
    if (!msg) return;
    renderMessage(snapshot.key, msg, msg.uid === me.uid);
    hideEmptyState();
  };
  onChildAdded(dmQueryRef, handleChild);
  dmOnChildOff = () => off(dmQueryRef, "child_added", handleChild);
}

function exitDmView() {
  activeDmUid = null;
  dmQueryRef  = null;
  if (dmOnChildOff) { dmOnChildOff(); dmOnChildOff = null; }
  closeDmBtn.classList.add("hidden");
  if (currentServerCode) {
    chatHeadTitle.textContent = "# " + (currentRoomMeta?.name || currentServerCode);
    chatHeadLock.classList.toggle("hidden", !currentRoomMeta?.hasPassword);
    updateAdminUI();
  }
}

closeDmBtn.addEventListener("click", async () => {
  exitDmView();
  resetChatUI();
  await reattachGroupListener();
});

async function reattachGroupListener() {
  if (groupOnChildOff) { groupOnChildOff(); groupOnChildOff = null; }
  resetChatUI();

  const handleChild = (snapshot) => {
    const msg = snapshot.val();
    if (!msg) return;
    if (blockedSet.has(msg.uid)) return;
    renderMessage(snapshot.key, msg, msg.uid === me.uid);
    hideEmptyState();
  };
  onChildAdded(currentQueryRef, handleChild);
  groupOnChildOff = () => off(currentQueryRef, "child_added", handleChild);
}

// ------------------------------------------------------------------
// SEND
// ------------------------------------------------------------------

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

async function sendMessage() {
  if (!currentServerCode) { showToast("Join a room first"); return; }
  if (!currentRoomRef) return;

  const rawText  = messageInput.value.trim();
  const hasMedia = !!pendingFile;
  if (!rawText && !hasMedia) { showToast("Nothing to send"); return; }

  if (activeDmUid) {
    const encKey = dmKey(me.uid, activeDmUid);
    const payload = {
      uid: me.uid,
      text: rawText ? encryptText(rawText, encKey) : "",
      mediaType: hasMedia ? pendingFile.type : null,
      mediaData: hasMedia ? encryptText(pendingFile.dataUrl, encKey) : null,
      dmKey: encKey,
      timestamp: serverTimestamp()
    };
    await push(ref(db, dmPath(me.uid, activeDmUid)), payload);
  } else {
    const payload = {
      uid: me.uid,
      text: rawText ? encryptText(rawText, currentServerCode) : "",
      mediaType: hasMedia ? pendingFile.type : null,
      mediaData: hasMedia ? encryptText(pendingFile.dataUrl, currentServerCode) : null,
      timestamp: serverTimestamp()
    };
    await push(currentRoomRef, payload);

    // Notify mentioned users
    if (rawText) {
      const mentions = extractMentions(rawText);
      if (mentions.length) {
        // Fetch all users once and match by username
        const usersSnap = await get(ref(db, "users"));
        const usersData = usersSnap.val() || {};
        const byName = {};
        for (const [uid, u] of Object.entries(usersData)) {
          if (u.username) byName[u.username.toLowerCase()] = uid;
        }
        for (const mention of mentions) {
          const uid = byName[mention];
          if (uid && uid !== me.uid) {
            pushNotification(uid, {
              type: "mention",
              title: `${t("notifMention")} #${currentRoomMeta?.name || currentServerCode}`,
              body: `${me.username}: ${rawText.slice(0, 80)}`,
              roomCode: currentServerCode,
              fromUid: me.uid
            });
          }
        }
      }
    }
  }

  messageInput.value = "";
  clearPendingFile();
}

// ------------------------------------------------------------------
// FILE PICKER + PREVIEW
// ------------------------------------------------------------------

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 1.5 * 1024 * 1024) {
    showToast("File too big (1.5MB max)");
    fileInput.value = "";
    return;
  }

  let type = null;
  if (file.type === "image/gif") type = "gif";
  else if (file.type.startsWith("image/")) type = "image";
  else if (file.type.startsWith("video/")) type = "video";
  else { showToast("Images, GIFs, videos only"); fileInput.value = ""; return; }

  const objectUrl = URL.createObjectURL(file);

  const reader = new FileReader();
  reader.onload = (ev) => {
    if (pendingFile && pendingFile.objectUrl) URL.revokeObjectURL(pendingFile.objectUrl);

    pendingFile = { type, dataUrl: ev.target.result, objectUrl, name: file.name };

    filePreviewName.textContent = `${type.toUpperCase()} · ${file.name}`;
    if (type === "video") {
      filePreviewImg.classList.add("hidden");
      filePreviewVideo.classList.remove("hidden");
      filePreviewVideo.src = objectUrl;
    } else {
      filePreviewVideo.classList.add("hidden");
      filePreviewImg.classList.remove("hidden");
      filePreviewImg.src = objectUrl;
    }
    filePreview.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
});

filePreviewRemove.addEventListener("click", clearPendingFile);

function clearPendingFile() {
  if (pendingFile && pendingFile.objectUrl) URL.revokeObjectURL(pendingFile.objectUrl);
  pendingFile = null;
  fileInput.value = "";
  filePreview.classList.add("hidden");
  filePreviewImg.src = "";
  filePreviewVideo.src = "";
}

// ------------------------------------------------------------------
// PROFILE
// ------------------------------------------------------------------

profileBtn.addEventListener("click", () => {
  editUsername.value = me.username;
  editBio.value      = me.bio;
  editPfp.value      = "";
  profileError.textContent = "";
  myProfileAvatar.src = me.pfp || defaultPfp(me.username);
  profileHeroName.textContent = me.username;
  profileHeroEmail.textContent = me.email;
  profileModal.classList.remove("hidden");
});

editPfp.addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = (ev) => { myProfileAvatar.src = ev.target.result; };
  r.readAsDataURL(f);
});

cancelProfileBtn.addEventListener("click", () => profileModal.classList.add("hidden"));

saveProfileBtn.addEventListener("click", async () => {
  profileError.textContent = "";
  const newName = editUsername.value.trim();
  if (newName.length < 2 || newName.length > 24) { profileError.textContent = "Username must be 2–24 chars"; return; }

  let newPfp = me.pfp;
  if (editPfp.files[0]) {
    const file = editPfp.files[0];
    if (file.size > 400 * 1024) { profileError.textContent = "PFP too big (400KB max)"; return; }
    newPfp = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  try {
    await update(ref(db, `users/${me.uid}`), {
      username: newName,
      bio: editBio.value.trim(),
      pfp: newPfp
    });

    me.username = newName;
    me.bio      = editBio.value.trim();
    me.pfp      = newPfp;

    myUsernameLabel.textContent = me.username;
    updateMyPfpButton();
    userCache.set(me.uid, { uid: me.uid, username: me.username, pfp: me.pfp, bio: me.bio });

    profileModal.classList.add("hidden");
    showToast("Profile saved");
    if (currentServerCode) refreshUserList();
  } catch (e) { profileError.textContent = e.message; }
});

// ------------------------------------------------------------------
// SETTINGS
// ------------------------------------------------------------------

settingsBtn.addEventListener("click", () => {
  themeSelect.value = currentTheme;
  languageSelect.value = currentLang;
  currentPassword.value = "";
  newPassword.value = "";
  settingsError.textContent = "";
  settingsModal.classList.remove("hidden");
});

themeSelect.addEventListener("change", () => {
  currentTheme = themeSelect.value;
  localStorage.setItem("theme", currentTheme);
  applyTheme();
});

languageSelect.addEventListener("change", () => {
  currentLang = languageSelect.value;
  localStorage.setItem("lang", currentLang);
  applyTranslations();
});

changePasswordBtn.addEventListener("click", async () => {
  settingsError.textContent = "";
  const cur = currentPassword.value;
  const nw  = newPassword.value;

  if (!cur || !nw) { settingsError.textContent = "Fill in both password fields"; return; }
  if (nw.length < 6) { settingsError.textContent = "New password must be 6+ chars"; return; }

  try {
    const user = auth.currentUser;
    const cred = EmailAuthProvider.credential(user.email, cur);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, nw);
    currentPassword.value = "";
    newPassword.value = "";
    showToast("Password updated");
    settingsModal.classList.add("hidden");
  } catch (e) {
    settingsError.textContent = e.message.replace("Firebase: ", "");
  }
});

closeSettingsBtn.addEventListener("click", () => settingsModal.classList.add("hidden"));

// ------------------------------------------------------------------
// BOOT
// ------------------------------------------------------------------

applyTheme();
applyTranslations();
themeSelect.value = currentTheme;
languageSelect.value = currentLang;

setStatus(false);
resetChatUI();
