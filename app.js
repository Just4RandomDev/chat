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

const $ = id => document.getElementById(id);

// SVG icons using currentColor so they inherit --icon-color via CSS mask
function iconMask(path) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='#000' d='${path}'/></svg>`;
  return svg;
}
function setMask(el, path) {
  const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(iconMask(path))}")`;
  el.style.webkitMaskImage = url;
  el.style.maskImage = url;
}

const ICON_PATHS = {
  bell:      `M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z`,
  gear:      `M19.14 12.94a7.5 7.5 0 0 0 .06-.94 7.5 7.5 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.24-1.12.55-1.62.94L5.24 4.94a.5.5 0 0 0-.6.22L2.72 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.5 7.5 0 0 0-.06.94c0 .32.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.42.34.6.22l2.39-.96c.5.39 1.04.7 1.62.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.58-.24 1.12-.55 1.62-.94l2.39.96c.18.12.46.02.6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z`,
  paperclip: `M16.5 6.5v11a4.5 4.5 0 0 1-9 0V6a3 3 0 0 1 6 0v11.5a1.5 1.5 0 0 1-3 0V8h-2v9.5a3.5 3.5 0 0 0 7 0V6a5 5 0 0 0-10 0v11.5a6.5 6.5 0 0 0 13 0V6.5h-2z`,
  lock:      `M17 9V7a5 5 0 0 0-10 0v2a3 3 0 0 0-2 2.83V19a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-7.17A3 3 0 0 0 17 9zM9 7a3 3 0 0 1 6 0v2H9V7z`,
  globe:     `M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7.93 9h-3.44a15.6 15.6 0 0 0-1.2-5.44A8.02 8.02 0 0 1 19.93 11zM12 4.06c.83 1.2 1.7 3.35 1.95 6.94h-3.9c.25-3.59 1.12-5.74 1.95-6.94zM4.07 13h3.44c.16 1.9.6 3.83 1.2 5.44A8.02 8.02 0 0 1 4.07 13zm3.44-2H4.07a8.02 8.02 0 0 1 4.64-5.44A15.6 15.6 0 0 0 7.51 11zM12 19.94c-.83-1.2-1.7-3.35-1.95-6.94h3.9c-.25 3.59-1.12 5.74-1.95 6.94zm2.49-1.5a15.6 15.6 0 0 0 1.2-5.44h3.44a8.02 8.02 0 0 1-4.64 5.44z`,
  crown:     `M3 7l4 4 5-6 5 6 4-4-2 12H5L3 7z`,
  chat:      `M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z`,
  pencil:    `M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z`,
  send:      `M2.01 21L23 12 2.01 3 2 10l15 2-15 2z`,
  reply:     `M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z`,
  trash:     `M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z`
};

const translations = {
  en: { tabLogin:"Log In",tabSignup:"Sign Up",loginBtn:"Log In",signupBtn:"Create Account",email:"Email",password:"Password",password6:"Password (6+ chars)",username:"Username",backToLobby:"← Lobby",rooms:"Rooms",publicRoom:"Public Lobby",createRoom:"+ Create Room",online:"Online",offline:"Offline",admin:"Admin",manageKicked:"Manage Kicked",roomSettings:"Room Settings",backToRoom:"← Back to room",noMessages:"No messages yet",typeMessage:"Type a message...",media:"Media",send:"Send",notifications:"Notifications",markAllRead:"Mark all read",noNotifications:"No notifications",sendDm:"Send DM",block:"Block",kick:"Kick from room",close:"Close",editProfile:"Edit Profile",bio:"Bio",save:"Save",cancel:"Cancel",clear:"Clear",roomCode:"Room code (unique id)",lobbyName:"Lobby Name",maxUsers:"Max users (2–500)",passwordOptional:"Password (optional)",create:"Create",passwordRequired:"Password Required",room:"Room",isLocked:"is locked.",join:"Join",kickedUsers:"Kicked Users",nobodyKicked:"Nobody is kicked.",changePasswordKeep:"Change password (leave empty to keep)",settings:"Settings",theme:"Theme",dark:"Dark",light:"Light",language:"Language",changePassword:"Change Password",currentPassword:"Current password",newPassword:"New password (6+ chars)",updatePassword:"Update Password",logout:"Log Out",kickedToast:"You've been kicked from this room",notifMention:"You were mentioned in",notifDm:"New message from",notifReply:"replied to you in",replyingTo:"Replying to",deleteRoom:"Delete Lobby",deleteRoomConfirm:"Delete this lobby permanently? This removes all messages.",roomDeleted:"Lobby deleted",tabAccount:"Account",tabAppearance:"Appearance",tabDanger:"Danger",account:"Account",presets:"Presets",colors:"Colors",advanced:"Advanced",advancedHint:"Full CSS override. Applies after all other styles. Only affects your browser.",editCustomCss:"Edit Custom CSS",resetAppearance:"Reset Appearance",danger:"Danger Zone",logoutHint:"Logging out will disconnect you from any room.",customCssTitle:"Custom CSS",customCssHint:"Anything you write here is injected after all other styles. Applies only to your browser.",appearanceReset:"Appearance reset to default",insertVars:"Insert All Variables" },
  es: { tabLogin:"Iniciar sesión",tabSignup:"Registrarse",loginBtn:"Iniciar sesión",signupBtn:"Crear cuenta",email:"Correo",password:"Contraseña",password6:"Contraseña (6+ caracteres)",username:"Usuario",backToLobby:"← Vestíbulo",rooms:"Salas",publicRoom:"Sala Pública",createRoom:"+ Crear Sala",online:"En línea",offline:"Desconectados",admin:"Admin",manageKicked:"Gestionar Expulsados",roomSettings:"Ajustes de Sala",backToRoom:"← Volver a la sala",noMessages:"Sin mensajes todavía",typeMessage:"Escribe un mensaje...",media:"Multimedia",send:"Enviar",notifications:"Notificaciones",markAllRead:"Marcar todo leído",noNotifications:"Sin notificaciones",sendDm:"Enviar MD",block:"Bloquear",kick:"Expulsar de la sala",close:"Cerrar",editProfile:"Editar Perfil",bio:"Biografía",save:"Guardar",cancel:"Cancelar",clear:"Limpiar",roomCode:"Código de sala (id único)",lobbyName:"Nombre del Lobby",maxUsers:"Usuarios máx (2–500)",passwordOptional:"Contraseña (opcional)",create:"Crear",passwordRequired:"Contraseña Requerida",room:"Sala",isLocked:"está bloqueada.",join:"Entrar",kickedUsers:"Usuarios Expulsados",nobodyKicked:"Nadie está expulsado.",changePasswordKeep:"Cambiar contraseña (vacío para mantener)",settings:"Ajustes",theme:"Tema",dark:"Oscuro",light:"Claro",language:"Idioma",changePassword:"Cambiar Contraseña",currentPassword:"Contraseña actual",newPassword:"Nueva contraseña (6+ caracteres)",updatePassword:"Actualizar",logout:"Cerrar Sesión",kickedToast:"Has sido expulsado de esta sala",notifMention:"Te mencionaron en",notifDm:"Nuevo mensaje de",notifReply:"te respondió en",replyingTo:"Respondiendo a",deleteRoom:"Eliminar Lobby",deleteRoomConfirm:"¿Eliminar este lobby permanentemente? Se borrarán todos los mensajes.",roomDeleted:"Lobby eliminado",tabAccount:"Cuenta",tabAppearance:"Apariencia",tabDanger:"Peligro",account:"Cuenta",presets:"Preajustes",colors:"Colores",advanced:"Avanzado",advancedHint:"Sobrescritura completa de CSS. Se aplica después del resto. Solo afecta a tu navegador.",editCustomCss:"Editar CSS",resetAppearance:"Restablecer Apariencia",danger:"Zona de Peligro",logoutHint:"Cerrar sesión te desconectará de cualquier sala.",customCssTitle:"CSS Personalizado",customCssHint:"Todo lo que escribas se inyecta después del resto de estilos. Solo se aplica en tu navegador.",appearanceReset:"Apariencia restablecida",insertVars:"Insertar Variables" },
  fr: { tabLogin:"Connexion",tabSignup:"Inscription",loginBtn:"Connexion",signupBtn:"Créer un compte",email:"Email",password:"Mot de passe",password6:"Mot de passe (6+ caractères)",username:"Pseudo",backToLobby:"← Salon",rooms:"Salons",publicRoom:"Salon Public",createRoom:"+ Créer un Salon",online:"En ligne",offline:"Hors ligne",admin:"Admin",manageKicked:"Gérer Exclus",roomSettings:"Paramètres du Salon",backToRoom:"← Retour au salon",noMessages:"Aucun message",typeMessage:"Écrire un message...",media:"Média",send:"Envoyer",notifications:"Notifications",markAllRead:"Tout marquer lu",noNotifications:"Aucune notification",sendDm:"Envoyer un MP",block:"Bloquer",kick:"Exclure du salon",close:"Fermer",editProfile:"Modifier le Profil",bio:"Bio",save:"Enregistrer",cancel:"Annuler",clear:"Effacer",roomCode:"Code du salon (id unique)",lobbyName:"Nom du Salon",maxUsers:"Utilisateurs max (2–500)",passwordOptional:"Mot de passe (optionnel)",create:"Créer",passwordRequired:"Mot de Passe Requis",room:"Salon",isLocked:"est verrouillé.",join:"Rejoindre",kickedUsers:"Utilisateurs Exclus",nobodyKicked:"Personne n'est exclu.",changePasswordKeep:"Changer le mot de passe (vide pour garder)",settings:"Paramètres",theme:"Thème",dark:"Sombre",light:"Clair",language:"Langue",changePassword:"Changer le Mot de Passe",currentPassword:"Mot de passe actuel",newPassword:"Nouveau mot de passe (6+ caractères)",updatePassword:"Mettre à jour",logout:"Déconnexion",kickedToast:"Vous avez été exclu de ce salon",notifMention:"Vous avez été mentionné dans",notifDm:"Nouveau message de",notifReply:"vous a répondu dans",replyingTo:"Répondre à",deleteRoom:"Supprimer le Salon",deleteRoomConfirm:"Supprimer ce salon définitivement ? Tous les messages seront effacés.",roomDeleted:"Salon supprimé",tabAccount:"Compte",tabAppearance:"Apparence",tabDanger:"Danger",account:"Compte",presets:"Préréglages",colors:"Couleurs",advanced:"Avancé",advancedHint:"Remplacement CSS complet. S'applique après tous les autres styles. N'affecte que votre navigateur.",editCustomCss:"Modifier CSS",resetAppearance:"Réinitialiser l'Apparence",danger:"Zone Dangereuse",logoutHint:"La déconnexion vous déconnectera de tout salon.",customCssTitle:"CSS Personnalisé",customCssHint:"Tout ce que vous écrivez ici est injecté après tous les autres styles. S'applique uniquement à votre navigateur.",appearanceReset:"Apparence réinitialisée",insertVars:"Insérer Variables" },
  ru: { tabLogin:"Войти",tabSignup:"Регистрация",loginBtn:"Войти",signupBtn:"Создать аккаунт",email:"Email",password:"Пароль",password6:"Пароль (6+ символов)",username:"Имя",backToLobby:"← Лобби",rooms:"Комнаты",publicRoom:"Публичная",createRoom:"+ Создать",online:"Онлайн",offline:"Офлайн",admin:"Админ",manageKicked:"Управление Киками",roomSettings:"Настройки Комнаты",backToRoom:"← Назад в комнату",noMessages:"Сообщений нет",typeMessage:"Введите сообщение...",media:"Медиа",send:"Отправить",notifications:"Уведомления",markAllRead:"Прочитать все",noNotifications:"Нет уведомлений",sendDm:"Написать ЛС",block:"Блок",kick:"Кикнуть из комнаты",close:"Закрыть",editProfile:"Профиль",bio:"О себе",save:"Сохранить",cancel:"Отмена",clear:"Очистить",roomCode:"Код комнаты (уникальный)",lobbyName:"Название Лобби",maxUsers:"Макс. людей (2–500)",passwordOptional:"Пароль (необязательно)",create:"Создать",passwordRequired:"Нужен Пароль",room:"Комната",isLocked:"заблокирована.",join:"Войти",kickedUsers:"Кикнутые",nobodyKicked:"Никто не кикнут.",changePasswordKeep:"Сменить пароль (пусто = оставить)",settings:"Настройки",theme:"Тема",dark:"Тёмная",light:"Светлая",language:"Язык",changePassword:"Сменить Пароль",currentPassword:"Текущий пароль",newPassword:"Новый пароль (6+ символов)",updatePassword:"Обновить",logout:"Выйти",kickedToast:"Вас кикнули из этой комнаты",notifMention:"Вас упомянули в",notifDm:"Новое сообщение от",notifReply:"ответил вам в",replyingTo:"Ответ",deleteRoom:"Удалить Лобби",deleteRoomConfirm:"Удалить это лобби навсегда? Все сообщения будут стёрты.",roomDeleted:"Лобби удалено",tabAccount:"Аккаунт",tabAppearance:"Внешний вид",tabDanger:"Опасно",account:"Аккаунт",presets:"Пресеты",colors:"Цвета",advanced:"Дополнительно",advancedHint:"Полная замена CSS. Применяется после всех остальных стилей. Влияет только на ваш браузер.",editCustomCss:"Изменить CSS",resetAppearance:"Сбросить оформление",danger:"Опасная Зона",logoutHint:"Выход отключит вас от комнаты.",customCssTitle:"Свой CSS",customCssHint:"Всё, что вы напишете, добавляется после остальных стилей. Применяется только к вашему браузеру.",appearanceReset:"Оформление сброшено",insertVars:"Вставить переменные" }
};

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
  sweepId: null, cleanId: null, usernameIndex: null
};

let currentLang = localStorage.getItem("lang") || "en";
let currentTheme = localStorage.getItem("theme") || "dark";
const t = key => (translations[currentLang]?.[key]) ?? key;

const applyTranslations = () => {
  document.querySelectorAll("[data-i18n]").forEach(el => el.textContent = t(el.getAttribute("data-i18n")));
  document.querySelectorAll("[data-i18n-ph]").forEach(el => el.placeholder = t(el.getAttribute("data-i18n-ph")));
};
const applyTheme = () => document.body.setAttribute("data-theme", currentTheme);

// ---------- Appearance ----------
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

function applyAppearance() {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(appearance)) {
    if (v) root.style.setProperty(`--${k}`, v);
    else root.style.removeProperty(`--${k}`);
  }
  let cssTag = document.getElementById("custom-css");
  if (!cssTag) {
    cssTag = document.createElement("style");
    cssTag.id = "custom-css";
    document.head.appendChild(cssTag);
  }
  cssTag.textContent = customCss;
}

const saveAppearance = () => localStorage.setItem("appearance", JSON.stringify(appearance));
const saveCustomCss = () => localStorage.setItem("customCss", customCss);

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

// Icon element mask setup
function applyIconMask(el, key) {
  if (!el || !ICON_PATHS[key]) return;
  const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='black' d='${ICON_PATHS[key]}'/></svg>`)}")`;
  el.style.webkitMaskImage = url;
  el.style.maskImage = url;
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
  chatHeadTitle: $("chatHeadTitle"), chatHeadLock: $("chatHeadLock"), chatHeadPublic: $("chatHeadPublic"),
  adminBadge: $("adminBadge"),
  chatContainer: $("chatContainer"), emptyState: $("emptyState"),
  messageInput: $("messageInput"), fileInput: $("fileInput"), fileLabel: $("fileLabel"),
  sendBtn: $("sendBtn"), sendIcon: $("sendIcon"), toastEl: $("toast"),
  replyBar: $("replyBar"), replyBarName: $("replyBarName"), replyBarPreview: $("replyBarPreview"), replyBarCancel: $("replyBarCancel"),
  filePreview: $("filePreview"), filePreviewImg: $("filePreviewImg"), filePreviewVideo: $("filePreviewVideo"),
  filePreviewName: $("filePreviewName"), filePreviewRemove: $("filePreviewRemove"),
  dmPanel: $("dmPanel"), dmHeadTitle: $("dmHeadTitle"), dmCloseBtn: $("dmCloseBtn"),
  dmMessages: $("dmMessages"), dmEmptyState: $("dmEmptyState"),
  dmReplyBar: $("dmReplyBar"), dmReplyBarName: $("dmReplyBarName"), dmReplyBarPreview: $("dmReplyBarPreview"), dmReplyBarCancel: $("dmReplyBarCancel"),
  dmFilePreview: $("dmFilePreview"), dmFilePreviewImg: $("dmFilePreviewImg"), dmFilePreviewVideo: $("dmFilePreviewVideo"),
  dmFilePreviewName: $("dmFilePreviewName"), dmFilePreviewRemove: $("dmFilePreviewRemove"),
  dmInput: $("dmInput"), dmFileInput: $("dmFileInput"), dmSendBtn: $("dmSendBtn"), dmSendIcon: $("dmSendIcon"), dmFileLabel: $("dmFileLabel"),
  userModal: $("userModal"), modalPfp: $("modalPfp"), modalName: $("modalName"), modalBio: $("modalBio"),
  modalDmBtn: $("modalDmBtn"), modalBlockBtn: $("modalBlockBtn"), modalKickBtn: $("modalKickBtn"), modalCloseBtn: $("modalCloseBtn"),
  profileModal: $("profileModal"), myProfileAvatar: $("myProfileAvatar"),
  profileHeroName: $("profileHeroName"), profileHeroEmail: $("profileHeroEmail"), profileHeroMeta: $("profileHeroMeta"),
  editUsername: $("editUsername"), editBio: $("editBio"), editPfp: $("editPfp"),
  saveProfileBtn: $("saveProfileBtn"), cancelProfileBtn: $("cancelProfileBtn"), profileError: $("profileError"),
  createRoomModal: $("createRoomModal"), createRoomCodeInput: $("createRoomCodeInput"),
  createRoomName: $("createRoomName"), createRoomMax: $("createRoomMax"), createRoomPassword: $("createRoomPassword"),
  createRoomBtn: $("createRoomBtn"), cancelCreateRoomBtn: $("cancelCreateRoomBtn"), createRoomError: $("createRoomError"),
  passwordModal: $("passwordModal"), passwordRoomCode: $("passwordRoomCode"), joinRoomPassword: $("joinRoomPassword"),
  submitPasswordBtn: $("submitPasswordBtn"), cancelPasswordBtn: $("cancelPasswordBtn"), passwordError: $("passwordError"),
  kickedModal: $("kickedModal"), kickedList: $("kickedList"), closeKickedBtn: $("closeKickedBtn"),
  roomSettingsModal: $("roomSettingsModal"), settingsRoomName: $("settingsRoomName"),
  settingsRoomMax: $("settingsRoomMax"), settingsRoomPassword: $("settingsRoomPassword"),
  saveRoomSettingsBtn: $("saveRoomSettingsBtn"), cancelRoomSettingsBtn: $("cancelRoomSettingsBtn"),
  deleteRoomBtn: $("deleteRoomBtn"), roomSettingsError: $("roomSettingsError"),
  settingsModal: $("settingsModal"), themeSelect: $("themeSelect"), languageSelect: $("languageSelect"),
  currentPassword: $("currentPassword"), newPassword: $("newPassword"),
  changePasswordBtn: $("changePasswordBtn"), logoutBtn2: $("logoutBtn2"),
  closeSettingsBtn: $("closeSettingsBtn"), settingsError: $("settingsError"),
  presetGrid: $("presetGrid"), colorGrid: $("colorGrid"),
  openAdvancedCssBtn: $("openAdvancedCssBtn"), resetAppearanceBtn: $("resetAppearanceBtn"),
  advancedCssModal: $("advancedCssModal"), customCssInput: $("customCssInput"),
  saveCustomCssBtn: $("saveCustomCssBtn"), cancelCustomCssBtn: $("cancelCustomCssBtn"), clearCustomCssBtn: $("clearCustomCssBtn"),
  insertVarsBtn: $("insertVarsBtn")
};

applyIconMask($("notifIcon"), "bell");
applyIconMask($("settingsIcon"), "gear");
applyIconMask($("paperclipIcon"), "paperclip");
applyIconMask($("dmPaperclipIcon"), "paperclip");
applyIconMask($("editPfpIcon"), "pencil");
applyIconMask($("emptyIcon"), "chat");
applyIconMask(el.sendIcon, "send");
applyIconMask(el.dmSendIcon, "send");

function showToast(msg) {
  el.toastEl.textContent = msg;
  el.toastEl.classList.add("show");
  setTimeout(() => el.toastEl.classList.remove("show"), 2200);
}

function setStatus(on) {
  el.statusDot.classList.toggle("online", on);
  el.statusText.textContent = on ? "connected" : "disconnected";
  el.messageInput.disabled = !on; el.fileInput.disabled = !on; el.sendBtn.disabled = !on;
  el.fileLabel.style.opacity = on ? "1" : "0.5";
  el.fileLabel.style.pointerEvents = on ? "auto" : "none";
}

function resetChatUI() {
  el.chatContainer.innerHTML = "";
  el.chatContainer.appendChild(el.emptyState);
  el.emptyState.style.display = "flex";
  state.lastGroupEl = null; state.lastGroupUid = null; state.lastGroupTime = 0;
  setReply(null);
}

function resetDmUI() {
  el.dmMessages.innerHTML = "";
  el.dmMessages.appendChild(el.dmEmptyState);
  el.dmEmptyState.style.display = "flex";
  state.dmLastGroupEl = null; state.dmLastGroupUid = null; state.dmLastGroupTime = 0;
  setDmReply(null);
}

const hideEmpty = () => { if (el.emptyState.parentNode === el.chatContainer) el.emptyState.style.display = "none"; };
const hideDmEmpty = () => { if (el.dmEmptyState.parentNode === el.dmMessages) el.dmEmptyState.style.display = "none"; };
const fmtTime = ts => ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

function defaultPfp(name) {
  const letter = (name || "?").trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='#241a1a'/><text x='16' y='22' font-family='Tahoma' font-size='18' text-anchor='middle' fill='#d94a4a'>${letter}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function botPfp() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='#5865f2'/><circle cx='11' cy='14' r='2.4' fill='#fff'/><circle cx='21' cy='14' r='2.4' fill='#fff'/><rect x='10' y='20' width='12' height='2.5' rx='1' fill='#fff'/></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

async function fetchUser(uid) {
  if (uid === BOT_UID) return { uid: BOT_UID, username: "IlloComoVamos", pfp: botPfp(), bio: "System bot" };
  const cached = state.userCache.get(uid);
  if (cached) return cached;
  try {
    const snap = await get(ref(db, `users/${uid}`));
    const d = snap.val() || {};
    const p = { uid, username: d.username || "user", pfp: d.pfp || defaultPfp(d.username), bio: d.bio || "", createdAt: d.createdAt || null };
    state.userCache.set(uid, p);
    return p;
  } catch {
    const f = { uid, username: "user", pfp: defaultPfp("?"), bio: "" };
    state.userCache.set(uid, f);
    return f;
  }
}

const isAdmin = () => state.me && state.roomMeta && state.roomMeta.adminUid === state.me.uid;

function updateAdminUI() {
  const a = isAdmin();
  el.adminBadge.classList.toggle("hidden", !a);
  el.adminPanel.classList.toggle("hidden", !a);
  el.adminPanelTitle.classList.toggle("hidden", !a);
}

const updateMyPfp = () => { el.myPfpBtn.src = state.me.pfp || defaultPfp(state.me.username); };

function showLobby() {
  try { closeDm(); } catch (e) { console.warn("closeDm error:", e); }
  el.lobbyView.classList.remove("hidden");
  el.roomView.classList.add("hidden");
  el.backToLobbyBtn.classList.add("hidden");
  setStatus(false);
}

function showRoom() {
  el.lobbyView.classList.add("hidden");
  el.roomView.classList.remove("hidden");
  el.backToLobbyBtn.classList.remove("hidden");
  setStatus(true);
}

function setReply(target) {
  state.reply = target;
  if (target) {
    el.replyBarName.textContent = target.username;
    el.replyBarPreview.textContent = target.previewText || "";
    el.replyBar.classList.remove("hidden");
  } else el.replyBar.classList.add("hidden");
}

function setDmReply(target) {
  state.dmReply = target;
  if (target) {
    el.dmReplyBarName.textContent = target.username;
    el.dmReplyBarPreview.textContent = target.previewText || "";
    el.dmReplyBar.classList.remove("hidden");
  } else el.dmReplyBar.classList.add("hidden");
}

const clearReply = () => setReply(null);
const clearDmReply = () => setDmReply(null);

// ---------- Appearance UI ----------
function buildPresetGrid() {
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
  el.colorGrid.innerHTML = "";
  for (const { key, label } of COLOR_VARS) {
    const current = appearance[key] || "";
    const row = document.createElement("div");
    row.className = "color-row";
    const fallback = getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim() || "#000000";
    const val = current || fallback;
    row.innerHTML = `
      <label>${label}</label>
      <input type="color" value="${val}">
      <input type="text" value="${val}">
    `;
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

// ---------- Auth ----------
el.tabLogin.addEventListener("click", () => {
  el.tabLogin.classList.add("active"); el.tabSignup.classList.remove("active");
  el.loginForm.classList.remove("hidden"); el.signupForm.classList.add("hidden");
  el.authError.textContent = "";
});

el.tabSignup.addEventListener("click", () => {
  el.tabSignup.classList.add("active"); el.tabLogin.classList.remove("active");
  el.signupForm.classList.remove("hidden"); el.loginForm.classList.add("hidden");
  el.authError.textContent = "";
});

el.loginBtn.addEventListener("click", async () => {
  el.authError.textContent = "";
  const email = el.loginEmail.value.trim(), pass = el.loginPassword.value;
  if (!email || !pass) return el.authError.textContent = "Fill in all fields";
  try { await signInWithEmailAndPassword(auth, email, pass); }
  catch (e) { el.authError.textContent = e.message.replace("Firebase: ", ""); }
});

el.signupBtn.addEventListener("click", async () => {
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
    await set(ref(db, `users/${cred.user.uid}`), { username, bio: "", pfp: "", createdAt: serverTimestamp() });
    state.userCache.delete(cred.user.uid);
  } catch (e) {
    window.__signupInProgress = false;
    el.authError.textContent = e.message.replace("Firebase: ", "");
  }
});

el.logoutBtn2.addEventListener("click", async () => {
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
    if (state.lobbyOff) { state.lobbyOff(); state.lobbyOff = null; }
    el.authScreen.classList.remove("hidden");
    el.appRoot.classList.add("hidden");
    return;
  }

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
    d = { username: fallback, bio: "", pfp: "" };
    await set(ref(db, `users/${user.uid}`), d);
  }

  state.me = { uid: user.uid, email: user.email, username: d.username || "user", pfp: d.pfp || "", bio: d.bio || "", createdAt: d.createdAt || null };
  el.myUsernameLabel.textContent = state.me.username;
  updateMyPfp();

  state.blocked = new Set();
  const bSnap = await get(ref(db, `blocks/${state.me.uid}`));
  Object.keys(bSnap.val() || {}).forEach(uid => state.blocked.add(uid));

  el.authScreen.classList.add("hidden");
  el.appRoot.classList.remove("hidden");
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
        maxUsers: 500, kicked: {}, isPublic: true, createdAt: serverTimestamp()
      });
    }
  } catch (e) { console.warn(e); }
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
  } catch (e) { console.warn("Sweep error:", e); }
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
  } catch (e) { console.warn("Clean error:", e); }
}

// ---------- Lobby ----------
function startLobbyListener() {
  if (state.lobbyOff) state.lobbyOff();
  state.lobbyOff = onValue(ref(db, "rooms"),
    (snap) => scheduleLobbyRender(snap.val() || {}),
    (err) => {
      console.error(err);
      el.roomGrid.innerHTML = '<p class="lobby-empty">Could not load rooms.</p>';
    }
  );
}

const scheduleLobbyRender = debounce(async (rooms) => {
  const token = ++state.lobbyToken;
  const codes = Object.keys(rooms);
  if (!codes.length) {
    el.roomGrid.innerHTML = '<p class="lobby-empty">No rooms yet. Create one.</p>';
    state.roomCards.clear();
    return;
  }
  el.roomGrid.querySelector(".lobby-empty")?.remove();

  const counts = {};
  await Promise.all(codes.map(async (c) => { counts[c] = await getPresenceCount(c); }));
  if (token !== state.lobbyToken) return;

  codes.sort((a, b) => {
    if (a === PUBLIC_ROOM) return -1;
    if (b === PUBLIC_ROOM) return 1;
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
      el.roomGrid.appendChild(card);
    }
    const max = r.maxUsers || 50;
    const iconParts = [];
    if (r.hasPassword) iconParts.push(`<span class="icon-img" data-icon="lock"></span>`);
    if (r.isPublic || code === PUBLIC_ROOM) iconParts.push(`<span class="icon-img" data-icon="globe"></span>`);
    if (r.adminUid === state.me?.uid) iconParts.push(`<span class="icon-img" data-icon="crown"></span>`);
    card.classList.toggle("pinned", code === PUBLIC_ROOM);
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
    if (card) el.roomGrid.appendChild(card);
  }
}, 60);

el.roomGrid.addEventListener("click", (e) => {
  const card = e.target.closest(".room-card");
  if (card?.dataset.code) requestJoinRoom(card.dataset.code);
});

el.openCreateRoomBtn.addEventListener("click", () => {
  el.createRoomCodeInput.value = "";
  el.createRoomName.value = "";
  el.createRoomMax.value = "20";
  el.createRoomPassword.value = "";
  el.createRoomError.textContent = "";
  el.createRoomModal.classList.remove("hidden");
});

async function requestJoinRoom(code) {
  const rs = await get(ref(db, `rooms/${code}`));
  if (!rs.exists()) return showToast("That room no longer exists");
  const room = rs.val();
  if (room.kicked?.[state.me.uid]) return showToast(t("kickedToast"));
  const max = room.maxUsers || 50;
  const pSnap = await get(ref(db, `chats/${code}/presence`));
  const pData = pSnap.val() || {};
  const inRoom = !!pData[state.me.uid];
  const count = Object.keys(pData).length;
  if (!inRoom && count >= max) return showToast(`Room is full (${count}/${max})`);
  if (room.hasPassword) {
    el.passwordRoomCode.textContent = code;
    el.joinRoomPassword.value = "";
    el.passwordError.textContent = "";
    el.passwordModal.classList.remove("hidden");
    return;
  }
  await enterRoom(code, room);
}

el.createRoomBtn.addEventListener("click", async () => {
  const code = el.createRoomCodeInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const name = el.createRoomName.value.trim() || code;
  const max = parseInt(el.createRoomMax.value, 10) || 20;
  const pw = el.createRoomPassword.value;
  el.createRoomError.textContent = "";
  if (code.length < 2) return el.createRoomError.textContent = "Code must be 2+ chars (a-z, 0-9, -, _)";
  if (code === PUBLIC_ROOM) return el.createRoomError.textContent = "That code is reserved";
  if (name.length > 40) return el.createRoomError.textContent = "Name too long";
  if (max < 2 || max > 500) return el.createRoomError.textContent = "Max users must be 2–500";
  const ex = await get(ref(db, `rooms/${code}`));
  if (ex.exists()) return el.createRoomError.textContent = "That code is taken";
  const meta = {
    name, adminUid: state.me.uid, createdAt: serverTimestamp(), lastActivity: Date.now(),
    hasPassword: !!pw, passwordHash: pw ? hashPassword(pw) : "", maxUsers: max, kicked: {}
  };
  try {
    await set(ref(db, `rooms/${code}`), meta);
    el.createRoomModal.classList.add("hidden");
    showToast("Room created — you're the admin");
    await enterRoom(code, { ...meta, hasPassword: !!pw });
  } catch (e) { el.createRoomError.textContent = e.message; }
});

el.cancelCreateRoomBtn.addEventListener("click", () => el.createRoomModal.classList.add("hidden"));

el.submitPasswordBtn.addEventListener("click", async () => {
  const code = el.passwordRoomCode.textContent;
  const pw = el.joinRoomPassword.value;
  el.passwordError.textContent = "";
  const rs = await get(ref(db, `rooms/${code}`));
  const room = rs.val();
  if (!room) return el.passwordError.textContent = "Room disappeared";
  if (room.passwordHash !== hashPassword(pw)) return el.passwordError.textContent = "Wrong password";
  if (room.kicked?.[state.me.uid]) return el.passwordError.textContent = t("kickedToast");
  const max = room.maxUsers || 50;
  const c = await getPresenceCount(code);
  if (c >= max) return el.passwordError.textContent = `Room is full (${c}/${max})`;
  el.passwordModal.classList.add("hidden");
  await enterRoom(code, room);
});

el.cancelPasswordBtn.addEventListener("click", () => el.passwordModal.classList.add("hidden"));

async function enterRoom(code, roomMeta) {
  await detachFromRoom();
  state.roomCode = code;
  state.roomMeta = roomMeta;
  state.roomRef = ref(db, `chats/${code}/messages`);
  state.queryRef = query(state.roomRef, limitToLast(100));
  closeDm();
  resetChatUI();
  showRoom();
  updateAdminUI();
  el.chatHeadTitle.textContent = "# " + (roomMeta.name || code);
  el.chatHeadLock.classList.toggle("hidden", !roomMeta.hasPassword);
  el.chatHeadPublic.classList.toggle("hidden", !(roomMeta.isPublic || code === PUBLIC_ROOM));
  try { update(ref(db, `rooms/${code}`), { lastActivity: Date.now() }); } catch {}
  el.capacityLabel.textContent = "/ " + (roomMeta.maxUsers || 50);

  const handler = (snapshot) => {
    const msg = snapshot.val();
    if (!msg || state.blocked.has(msg.uid)) return;
    renderMessage(el.chatContainer, snapshot.key, msg, msg.uid === state.me.uid, false);
    hideEmpty();
  };
  onChildAdded(state.queryRef, handler);
  state.groupOff = () => off(state.queryRef, "child_added", handler);

  state.presenceRef = ref(db, `chats/${code}/presence/${state.me.uid}`);
  await set(state.presenceRef, { username: state.me.username, joinedAt: serverTimestamp() });
  await set(ref(db, `chats/${code}/seen/${state.me.uid}`), {
    username: state.me.username, lastSeen: serverTimestamp()
  });
  onDisconnect(state.presenceRef).remove();

  state.presenceOff = onValue(ref(db, `chats/${code}/presence`), (snap) => {
    state.presenceData = snap.val() || {};
    renderUserList();
  });

  state.seenOff = onValue(ref(db, `chats/${code}/seen`), (snap) => {
    state.seenData = snap.val() || {};
    renderUserList();
  });

  state.kickedOff = onValue(ref(db, `rooms/${code}/kicked/${state.me.uid}`), async (snap) => {
    if (snap.val() === true && state.roomCode === code) {
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

  showToast("Joined #" + code);
}

async function pushAdvisory(code) {
  try {
    const existing = await get(ref(db, `chats/${code}/advisoryShown`));
    if (existing.exists()) return;
    await set(ref(db, `chats/${code}/advisoryShown`), true);
    await push(ref(db, `chats/${code}/messages`), {
      uid: BOT_UID,
      bot: true,
      text: encryptText("Heads up: messages in this room are auto-deleted after 15 minutes. This room keeps a maximum of 100 messages at a time.", code),
      timestamp: serverTimestamp()
    });
  } catch (e) { console.warn(e); }
}

async function detachFromRoom() {
  if (state.groupOff) { state.groupOff(); state.groupOff = null; }
  if (state.presenceOff) { state.presenceOff(); state.presenceOff = null; }
  if (state.seenOff) { state.seenOff(); state.seenOff = null; }
  if (state.kickedOff) { state.kickedOff(); state.kickedOff = null; }
  if (state.cleanId) { clearInterval(state.cleanId); state.cleanId = null; }
  if (state.presenceRef) { try { await remove(state.presenceRef); } catch {} state.presenceRef = null; }
  state.roomRef = null; state.queryRef = null; state.roomCode = null; state.roomMeta = null;
  state.presenceData = {}; state.seenData = {};
  updateAdminUI();
}

el.backToLobbyBtn.addEventListener("click", async () => {
  try { closeDm(); } catch (e) { console.warn(e); }
  await detachFromRoom();
  resetChatUI();
  showLobby();
});

// ---------- Notifications ----------
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
      <div class="n-time">${fmtTime(n.timestamp)}</div>`;
    frag.appendChild(item);
  }
  el.notifList.appendChild(frag);
}

el.notifList.addEventListener("click", async (e) => {
  const item = e.target.closest(".notif-item");
  if (!item) return;
  const id = item.dataset.notifId;
  const n = state.notifications.find(x => x.id === id);
  if (!n) return;
  if (!n.read) try { update(ref(db, `notifications/${state.me.uid}/${n.id}`), { read: true }); } catch {}
  el.notifDropdown.classList.add("hidden");

  if (n.type === "mention" || n.type === "reply") {
    if (n.roomCode && state.roomCode !== n.roomCode) await requestJoinRoom(n.roomCode);
  } else if (n.type === "dm") {
    if (n.fromUid && n.fromUid !== state.me.uid) {
      if (!state.roomCode) await requestJoinRoom(PUBLIC_ROOM);
      openDm(n.fromUid);
    }
  }
});

el.notifBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  el.notifDropdown.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (!el.notifDropdown.classList.contains("hidden") &&
      !el.notifDropdown.contains(e.target) &&
      !el.notifBtn.contains(e.target)) {
    el.notifDropdown.classList.add("hidden");
  }
});

el.markAllReadBtn.addEventListener("click", async () => {
  const updates = {};
  for (const n of state.notifications) {
    if (!n.read) updates[`${n.id}/read`] = true;
  }
  if (Object.keys(updates).length) {
    try {
      await update(ref(db, `notifications/${state.me.uid}`), updates);
    } catch (e) { showToast("Could not mark read: " + e.message); }
  }
});

async function pushNotification(targetUid, payload) {
  if (!targetUid || targetUid === state.me.uid || targetUid === BOT_UID) return;
  try { await push(ref(db, `notifications/${targetUid}`), { ...payload, read: false, timestamp: serverTimestamp() }); }
  catch (e) { console.warn(e); }
}

const extractMentions = text => [...new Set([...text.matchAll(/@([A-Za-z0-9_]+)/g)].map(m => m[1].toLowerCase()))];

// ---------- Render message ----------
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
  const mentionedMe = !isDm && !isBot && plainText && state.me && extractMentions(plainText).includes(state.me.username.toLowerCase());

  if (!groupEl || !sameUser || !withinWindow) {
    const group = document.createElement("div");
    group.className = "msg-group" + (isOwn ? " own" : "") + (isBot ? " bot" : "");
    const head = document.createElement("div");
    head.className = "group-head";
    const botTag = isBot ? '<span class="bot-tag">BOT</span>' : "";
    head.innerHTML = `<img class="mini-pfp" src="${sender.pfp || defaultPfp(sender.username)}" alt="">
      ${esc(sender.username)}${botTag}<span class="group-time">${fmtTime(msg.timestamp)}</span>`;
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
  line.className = "msg-line" + (mentionedMe ? " mention" : "") + (isBot ? " advisory-line" : "");
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

  if (!isBot) {
    const actions = document.createElement("div");
    actions.className = "msg-actions";

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

    const canDelete = isOwn || (isAdmin() && !isDm);
    if (canDelete) {
      const del = document.createElement("button");
      del.className = "delete-msg";
      del.title = "Delete";
      const delIcon = document.createElement("span");
      delIcon.className = "icon-img";
      applyIconMask(delIcon, "trash");
      del.appendChild(delIcon);
      del.addEventListener("click", async () => {
        if (!confirm("Delete this message?")) return;
        try {
          if (isDm) {
            await remove(ref(db, dmPath(state.me.uid, state.dmUid) + "/" + msgId));
          } else {
            await remove(ref(db, `chats/${state.roomCode}/messages/${msgId}`));
          }
          line.remove();
          if (!body.children.length) curGroup.remove();
        } catch (e) { showToast("Could not delete: " + e.message); }
      });
      actions.appendChild(del);
    }
    line.appendChild(actions);
  }

  body.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

function buildLineContent(lineEl, plainText) {
  const urls = [...plainText.matchAll(URL_RE)].map(m => m[0]);
  const mediaUrls = urls.filter(u => ["image", "video"].includes(classifyUrl(u)));
  const nonMediaUrls = urls.filter(u => classifyUrl(u) === "link");
  const rest = plainText.replace(URL_RE, "").trim();
  const mentionRe = /@([A-Za-z0-9_]+)/g;
  const renderText = (parent, text) => {
    let lastIdx = 0, mm;
    while ((mm = mentionRe.exec(text)) !== null) {
      if (mm.index > lastIdx) parent.appendChild(document.createTextNode(text.slice(lastIdx, mm.index)));
      const span = document.createElement("span");
      span.style.color = "#ffb347"; span.style.fontWeight = "700";
      span.textContent = mm[0];
      parent.appendChild(span);
      lastIdx = mentionRe.lastIndex;
    }
    if (lastIdx < text.length) parent.appendChild(document.createTextNode(text.slice(lastIdx)));
  };

  if (mediaUrls.length) {
    if (rest) renderText(lineEl, rest + " ");
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
    if (m.index > lastIndex) renderText(lineEl, plainText.slice(lastIndex, m.index));
    const a = document.createElement("a");
    a.href = m[0]; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.textContent = m[0];
    lineEl.appendChild(a);
    lastIndex = re.lastIndex;
  }
  if (lastIndex < plainText.length) renderText(lineEl, plainText.slice(lastIndex));
}

// ---------- Sidebar ----------
async function renderUserList() {
  const onlineUids = Object.keys(state.presenceData).sort((a, b) => {
    if (a === state.me.uid) return -1;
    if (b === state.me.uid) return 1;
    return (state.presenceData[a]?.username || "").toLowerCase().localeCompare((state.presenceData[b]?.username || "").toLowerCase());
  });
  const offlineUids = Object.keys(state.seenData)
    .filter(uid => !state.presenceData[uid] && uid !== state.me.uid)
    .sort((a, b) => (state.seenData[a]?.username || "").toLowerCase().localeCompare((state.seenData[b]?.username || "").toLowerCase()));

  el.onlineCount.textContent = onlineUids.length;
  el.offlineCount.textContent = offlineUids.length;

  el.userList.innerHTML = "";
  const frag = document.createDocumentFragment();
  for (const uid of onlineUids) {
    const p = await fetchUser(uid);
    const row = document.createElement("div");
    row.className = "user-item" + (state.blocked.has(uid) ? " blocked" : "");
    row.dataset.uid = uid;
    const name = p.username + (uid === state.me.uid ? " (you)" : "");
    row.innerHTML = `<img src="${p.pfp || defaultPfp(p.username)}" alt=""><span class="u-name">${esc(name)}</span>`;
    frag.appendChild(row);
  }
  el.userList.appendChild(frag);

  el.offlineList.innerHTML = "";
  const frag2 = document.createDocumentFragment();
  for (const uid of offlineUids) {
    const p = await fetchUser(uid);
    const row = document.createElement("div");
    row.className = "user-item offline" + (state.blocked.has(uid) ? " blocked" : "");
    row.dataset.uid = uid;
    row.innerHTML = `<img src="${p.pfp || defaultPfp(p.username)}" alt=""><span class="u-name">${esc(p.username)}</span>`;
    frag2.appendChild(row);
  }
  el.offlineList.appendChild(frag2);
}

el.userList.addEventListener("click", (e) => {
  const row = e.target.closest(".user-item");
  if (row?.dataset.uid && row.dataset.uid !== state.me.uid) openUserModal(row.dataset.uid);
});
el.offlineList.addEventListener("click", (e) => {
  const row = e.target.closest(".user-item");
  if (row?.dataset.uid && row.dataset.uid !== state.me.uid) openUserModal(row.dataset.uid);
});

// ---------- User modal ----------
let modalUid = null;

async function openUserModal(uid) {
  modalUid = uid;
  const p = await fetchUser(uid);
  el.modalPfp.src = p.pfp || defaultPfp(p.username);
  el.modalName.textContent = p.username;
  el.modalBio.textContent = p.bio || "(no bio)";
  el.modalBlockBtn.textContent = state.blocked.has(uid) ? "Unblock" : t("block");
  el.modalKickBtn.classList.toggle("hidden", !isAdmin() || state.roomMeta?.isPublic);
  el.userModal.classList.remove("hidden");
}

el.modalCloseBtn.addEventListener("click", () => { el.userModal.classList.add("hidden"); modalUid = null; });

el.modalDmBtn.addEventListener("click", () => {
  if (!modalUid) return;
  el.userModal.classList.add("hidden");
  openDm(modalUid);
  modalUid = null;
});

el.modalBlockBtn.addEventListener("click", async () => {
  if (!modalUid) return;
  const uid = modalUid;
  if (state.blocked.has(uid)) {
    state.blocked.delete(uid);
    try { await remove(ref(db, `blocks/${state.me.uid}/${uid}`)); } catch {}
    showToast("Unblocked");
  } else {
    state.blocked.add(uid);
    try { await set(ref(db, `blocks/${state.me.uid}/${uid}`), true); } catch {}
    showToast("Blocked (client-side only)");
  }
  el.userModal.classList.add("hidden");
  modalUid = null;
  renderUserList();
  if (!state.dmUid && state.roomCode) await reattachGroupListener();
});

el.modalKickBtn.addEventListener("click", async () => {
  if (!modalUid || !isAdmin() || state.roomMeta?.isPublic) return;
  const uid = modalUid;
  try {
    await set(ref(db, `rooms/${state.roomCode}/kicked/${uid}`), true);
    await remove(ref(db, `chats/${state.roomCode}/presence/${uid}`));
    showToast("Kicked");
  } catch (e) { showToast("Could not kick: " + e.message); }
  el.userModal.classList.add("hidden");
  modalUid = null;
});

el.kickPanelBtn.addEventListener("click", async () => {
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

el.closeKickedBtn.addEventListener("click", () => el.kickedModal.classList.add("hidden"));

el.roomSettingsBtn.addEventListener("click", () => {
  el.settingsRoomName.value = state.roomMeta?.name || "";
  el.settingsRoomMax.value = state.roomMeta?.maxUsers || 20;
  el.settingsRoomPassword.value = "";
  el.roomSettingsError.textContent = "";
  el.deleteRoomBtn.classList.toggle("hidden", state.roomMeta?.isPublic || state.roomCode === PUBLIC_ROOM);
  el.roomSettingsModal.classList.remove("hidden");
});

el.cancelRoomSettingsBtn.addEventListener("click", () => el.roomSettingsModal.classList.add("hidden"));

el.saveRoomSettingsBtn.addEventListener("click", async () => {
  if (!isAdmin()) return;
  el.roomSettingsError.textContent = "";
  const name = el.settingsRoomName.value.trim();
  const max = parseInt(el.settingsRoomMax.value, 10) || 20;
  if (!name || name.length > 40) return el.roomSettingsError.textContent = "Name must be 1–40 chars";
  if (max < 2 || max > 500) return el.roomSettingsError.textContent = "Max users must be 2–500";
  const updates = { name, maxUsers: max, lastActivity: Date.now() };
  const newPw = el.settingsRoomPassword.value;
  if (newPw) { updates.hasPassword = true; updates.passwordHash = hashPassword(newPw); }
  try {
    await update(ref(db, `rooms/${state.roomCode}`), updates);
    state.roomMeta = { ...state.roomMeta, ...updates };
    el.chatHeadTitle.textContent = "# " + name;
    el.chatHeadLock.classList.toggle("hidden", !state.roomMeta.hasPassword);
    el.capacityLabel.textContent = "/ " + max;
    el.roomSettingsModal.classList.add("hidden");
    showToast("Room updated");
  } catch (e) { el.roomSettingsError.textContent = e.message; }
});

el.deleteRoomBtn.addEventListener("click", async () => {
  if (!isAdmin() || state.roomMeta?.isPublic || state.roomCode === PUBLIC_ROOM) return;
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
  } catch (e) { showToast("Could not delete: " + e.message); }
});

// ---------- DMs ----------
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

  const handler = (snapshot) => {
    const msg = snapshot.val();
    if (!msg) return;
    renderMessage(el.dmMessages, snapshot.key, msg, msg.uid === state.me.uid, true);
    hideDmEmpty();
  };
  onChildAdded(state.dmQueryRef, handler);
  state.dmOff = () => off(state.dmQueryRef, "child_added", handler);

  el.dmInput.focus();
}

function closeDm() {
  state.dmUid = null;
  state.dmQueryRef = null;
  try { if (typeof state.dmOff === "function") { state.dmOff(); state.dmOff = null; } } catch (e) { console.warn("dmOff error", e); }
  el.dmPanel.classList.add("hidden");
  el.dmInput.disabled = true;
  el.dmFileInput.disabled = true;
  el.dmSendBtn.disabled = true;
  resetDmUI();
}

el.dmCloseBtn.addEventListener("click", () => {
  closeDm();
});

async function reattachGroupListener() {
  if (state.groupOff) { state.groupOff(); state.groupOff = null; }
  resetChatUI();
  const handler = (snapshot) => {
    const msg = snapshot.val();
    if (!msg || state.blocked.has(msg.uid)) return;
    renderMessage(el.chatContainer, snapshot.key, msg, msg.uid === state.me.uid, false);
    hideEmpty();
  };
  onChildAdded(state.queryRef, handler);
  state.groupOff = () => off(state.queryRef, "child_added", handler);
}

// ---------- Send ----------
el.sendBtn.addEventListener("click", sendMessage);
el.messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
el.replyBarCancel.addEventListener("click", clearReply);

el.dmSendBtn.addEventListener("click", sendDm);
el.dmInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDm(); }
});
el.dmReplyBarCancel.addEventListener("click", clearDmReply);

async function sendMessage() {
  if (!state.roomCode || !state.roomRef) return showToast("Join a room first");
  const rawText = el.messageInput.value.trim();
  const hasMedia = !!state.pendingFile;
  if (!rawText && !hasMedia) return showToast("Nothing to send");

  const replyPayload = state.reply ? {
    uid: state.reply.uid, username: state.reply.username,
    previewText: state.reply.previewText, msgId: state.reply.msgId
  } : null;

  await push(state.roomRef, {
    uid: state.me.uid,
    text: rawText ? encryptText(rawText, state.roomCode) : "",
    mediaType: hasMedia ? state.pendingFile.type : null,
    mediaData: hasMedia ? encryptText(state.pendingFile.dataUrl, state.roomCode) : null,
    replyTo: replyPayload, timestamp: serverTimestamp()
  });

  try { update(ref(db, `rooms/${state.roomCode}`), { lastActivity: Date.now() }); } catch {}

  if (rawText) {
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
            roomCode: state.roomCode, fromUid: state.me.uid
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
      roomCode: state.roomCode, fromUid: state.me.uid
    });
  }

  el.messageInput.value = "";
  clearPendingFile();
  clearReply();
  el.messageInput.focus();
}

async function sendDm() {
  if (!state.dmUid) return;
  const rawText = el.dmInput.value.trim();
  const hasMedia = !!state.dmPendingFile;
  if (!rawText && !hasMedia) return showToast("Nothing to send");

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
}

el.fileInput.addEventListener("change", (e) => handleFileSelect(e, false));
el.dmFileInput.addEventListener("change", (e) => handleFileSelect(e, true));
el.filePreviewRemove.addEventListener("click", () => clearPendingFile());
el.dmFilePreviewRemove.addEventListener("click", () => clearDmPendingFile());

function handleFileSelect(e, isDm) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 1.5 * 1024 * 1024) { showToast("File too big (1.5MB max)"); e.target.value = ""; return; }
  let type = null;
  if (file.type === "image/gif") type = "gif";
  else if (file.type.startsWith("image/")) type = "image";
  else if (file.type.startsWith("video/")) type = "video";
  else { showToast("Images, GIFs, videos only"); e.target.value = ""; return; }
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
  el.fileInput.value = "";
  el.filePreview.classList.add("hidden");
  el.filePreviewImg.src = "";
  el.filePreviewVideo.src = "";
}

function clearDmPendingFile() {
  if (state.dmPendingFile?.objectUrl) URL.revokeObjectURL(state.dmPendingFile.objectUrl);
  state.dmPendingFile = null;
  el.dmFileInput.value = "";
  el.dmFilePreview.classList.add("hidden");
  el.dmFilePreviewImg.src = "";
  el.dmFilePreviewVideo.src = "";
}

// ---------- Profile ----------
el.profileBtn.addEventListener("click", () => {
  el.editUsername.value = state.me.username;
  el.editBio.value = state.me.bio;
  el.editPfp.value = "";
  el.profileError.textContent = "";
  el.myProfileAvatar.src = state.me.pfp || defaultPfp(state.me.username);
  el.profileHeroName.textContent = state.me.username;
  el.profileHeroEmail.textContent = state.me.email;
  const memberSince = state.me.createdAt ? new Date(state.me.createdAt).toLocaleDateString() : "—";
  el.profileHeroMeta.innerHTML = `<span>Member since ${memberSince}</span>`;
  el.profileModal.classList.remove("hidden");
});

el.editPfp.addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = (ev) => { el.myProfileAvatar.src = ev.target.result; };
  r.readAsDataURL(f);
});

el.cancelProfileBtn.addEventListener("click", () => el.profileModal.classList.add("hidden"));

el.saveProfileBtn.addEventListener("click", async () => {
  el.profileError.textContent = "";
  const newName = el.editUsername.value.trim();
  if (newName.length < 2 || newName.length > 24) return el.profileError.textContent = "Username must be 2–24 chars";
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
  try {
    await update(ref(db, `users/${state.me.uid}`), { username: newName, bio: el.editBio.value.trim(), pfp: newPfp });
    state.me.username = newName; state.me.bio = el.editBio.value.trim(); state.me.pfp = newPfp;
    el.myUsernameLabel.textContent = state.me.username;
    updateMyPfp();
    state.userCache.set(state.me.uid, { uid: state.me.uid, username: state.me.username, pfp: state.me.pfp, bio: state.me.bio });
    state.usernameIndex = null;
    el.profileModal.classList.add("hidden");
    showToast("Profile saved");
    if (state.roomCode) renderUserList();
  } catch (e) { el.profileError.textContent = e.message; }
});

// ---------- Settings ----------
el.settingsBtn.addEventListener("click", () => {
  el.themeSelect.value = currentTheme;
  el.languageSelect.value = currentLang;
  el.currentPassword.value = "";
  el.newPassword.value = "";
  el.settingsError.textContent = "";
  buildPresetGrid();
  buildColorGrid();
  el.settingsModal.classList.remove("hidden");
});

document.querySelectorAll(".settings-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".settings-tab").forEach(x => x.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    $("paneAccount").classList.toggle("hidden", target !== "account");
    $("paneAppearance").classList.toggle("hidden", target !== "appearance");
    $("paneDanger").classList.toggle("hidden", target !== "danger");
  });
});

el.themeSelect.addEventListener("change", () => {
  currentTheme = el.themeSelect.value;
  localStorage.setItem("theme", currentTheme);
  applyTheme();
  appearance = {};
  saveAppearance();
  applyAppearance();
  buildColorGrid();
});

el.languageSelect.addEventListener("change", () => {
  currentLang = el.languageSelect.value;
  localStorage.setItem("lang", currentLang);
  applyTranslations();
});

el.changePasswordBtn.addEventListener("click", async () => {
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

el.closeSettingsBtn.addEventListener("click", () => el.settingsModal.classList.add("hidden"));

el.openAdvancedCssBtn.addEventListener("click", () => {
  el.customCssInput.value = customCss;
  el.advancedCssModal.classList.remove("hidden");
});

el.insertVarsBtn.addEventListener("click", () => {
  const template = generateVarsTemplate();
  const cur = el.customCssInput.value;
  el.customCssInput.value = cur ? cur + "\n\n" + template : template;
});

el.saveCustomCssBtn.addEventListener("click", () => {
  customCss = el.customCssInput.value;
  saveCustomCss();
  applyAppearance();
  el.advancedCssModal.classList.add("hidden");
  showToast("Custom CSS saved");
});

el.cancelCustomCssBtn.addEventListener("click", () => el.advancedCssModal.classList.add("hidden"));
el.clearCustomCssBtn.addEventListener("click", () => { el.customCssInput.value = ""; });

el.resetAppearanceBtn.addEventListener("click", () => {
  appearance = {};
  customCss = "";
  saveAppearance();
  saveCustomCss();
  document.documentElement.style.cssText = "";
  applyAppearance();
  buildColorGrid();
  showToast(t("appearanceReset"));
});

// ---------- Boot ----------
applyTheme();
applyTranslations();
applyAppearance();
el.themeSelect.value = currentTheme;
el.languageSelect.value = currentLang;
setStatus(false);
resetChatUI();
resetDmUI();
buildPresetGrid();
buildColorGrid();
