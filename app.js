import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
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
// FIREBASE INIT
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

// ------------------------------------------------------------------
// ENCRYPTION
// Group messages: key from server code.
// DMs: key from both UIDs joined + server code (so both sides compute the same key).
// ------------------------------------------------------------------

function shaKey(str) {
  return CryptoJS.SHA256(str + "::salt::v1").toString();
}

function encryptText(plain, key) {
  if (!plain) return "";
  return CryptoJS.AES.encrypt(plain, shaKey(key)).toString();
}

function decryptText(cipher, key) {
  if (!cipher) return "";
  try {
    const bytes = CryptoJS.AES.decrypt(cipher, shaKey(key));
    return bytes.toString(CryptoJS.enc.Utf8) || "[could not decrypt]";
  } catch {
    return "[could not decrypt]";
  }
}

function dmKey(uidA, uidB) {
  // Sort so both sides compute the same value regardless of who opens the DM
  const [a, b] = [uidA, uidB].sort();
  return "DM::" + a + "::" + b;
}

function dmPath(uidA, uidB) {
  const [a, b] = [uidA, uidB].sort();
  return `dms/${a}__${b}/messages`;
}

// ------------------------------------------------------------------
// STATE
// ------------------------------------------------------------------

let me = null;                       // { uid, email, username, pfp, bio }
let currentServerCode = null;        // e.g. "demo-room"
let currentRoomRef    = null;        // /chats/<code>/messages
let currentQueryRef   = null;        // limited query on the above
let currentPresenceRef = null;       // /chats/<code>/presence/<myUid>
let currentPresenceListener = null;  // onValue unsubscribe
let blockedSet        = new Set();   // uids I've blocked
let userCache         = new Map();   // uid -> { username, pfp, bio }
let pendingFile       = null;        // { type, dataUrl }
let activeDmUid       = null;        // uid of the DM partner, or null for group
let dmQueryRef        = null;        // current DM query (for detach)
let groupOnChildOff   = null;        // detach function for group listener
let dmOnChildOff      = null;        // detach function for dm listener

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
const serverCodeInput = $("serverCodeInput");
const joinBtn      = $("joinBtn");
const profileBtn   = $("profileBtn");
const logoutBtn    = $("logoutBtn");
const statusDot    = $("statusDot");
const statusText   = $("statusText");

const onlineCount  = $("onlineCount");
const userList     = $("userList");

const chatHeadTitle = $("chatHeadTitle");
const closeDmBtn    = $("closeDmBtn");
const chatContainer = $("chatContainer");
const emptyState    = $("emptyState");

const messageInput = $("messageInput");
const fileInput    = $("fileInput");
const fileLabel    = $("fileLabel");
const sendBtn      = $("sendBtn");
const toastEl      = $("toast");

const userModal    = $("userModal");
const modalPfp     = $("modalPfp");
const modalName    = $("modalName");
const modalBio     = $("modalBio");
const modalDmBtn   = $("modalDmBtn");
const modalBlockBtn= $("modalBlockBtn");
const modalCloseBtn= $("modalCloseBtn");

const profileModal = $("profileModal");
const editUsername = $("editUsername");
const editBio      = $("editBio");
const editPfp      = $("editPfp");
const saveProfileBtn = $("saveProfileBtn");
const cancelProfileBtn = $("cancelProfileBtn");
const profileError = $("profileError");

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
  // tiny inline SVG avatar
  const letter = (name || "?").trim().charAt(0).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>
    <rect width='32' height='32' fill='#f0e0d6'/>
    <text x='16' y='22' font-family='Tahoma' font-size='18' text-anchor='middle' fill='#800000'>${letter}</text>
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

// ------------------------------------------------------------------
// AUTH FLOW
// ------------------------------------------------------------------

tabLogin.addEventListener("click", () => {
  tabLogin.classList.add("active");
  tabSignup.classList.remove("active");
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");
  authError.textContent = "";
});

tabSignup.addEventListener("click", () => {
  tabSignup.classList.add("active");
  tabLogin.classList.remove("active");
  signupForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  authError.textContent = "";
});

loginBtn.addEventListener("click", async () => {
  authError.textContent = "";
  const email = loginEmail.value.trim();
  const pass  = loginPassword.value;
  if (!email || !pass) { authError.textContent = "Fill in all fields"; return; }
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    authError.textContent = e.message.replace("Firebase: ", "");
  }
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
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await set(ref(db, `users/${cred.user.uid}`), {
      username,
      bio: "",
      pfp: "",
      createdAt: serverTimestamp()
    });
  } catch (e) {
    authError.textContent = e.message.replace("Firebase: ", "");
  }
});

logoutBtn.addEventListener("click", async () => {
  // Clean up presence before signing out
  await detachFromRoom();
  await signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    me = null;
    authScreen.classList.remove("hidden");
    appRoot.classList.add("hidden");
    return;
  }

  // Load profile
  const snap = await get(ref(db, `users/${user.uid}`));
  let data = snap.val();
  if (!data) {
    // Profile missing (e.g. legacy account). Create a default one.
    data = { username: "user_" + user.uid.slice(0, 5), bio: "", pfp: "" };
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

  // Load block list
  blockedSet = new Set();
  const blockSnap = await get(ref(db, `blocks/${me.uid}`));
  const blockData = blockSnap.val() || {};
  Object.keys(blockData).forEach(uid => blockedSet.add(uid));

  authScreen.classList.add("hidden");
  appRoot.classList.remove("hidden");
  setStatus(false);
});

// ------------------------------------------------------------------
// PROFILE EDIT
// ------------------------------------------------------------------

profileBtn.addEventListener("click", () => {
  editUsername.value = me.username;
  editBio.value      = me.bio;
  editPfp.value      = "";
  profileError.textContent = "";
  profileModal.classList.remove("hidden");
});

cancelProfileBtn.addEventListener("click", () => {
  profileModal.classList.add("hidden");
});

saveProfileBtn.addEventListener("click", async () => {
  profileError.textContent = "";

  const newName = editUsername.value.trim();
  if (newName.length < 2 || newName.length > 24) {
    profileError.textContent = "Username must be 2–24 chars";
    return;
  }

  let newPfp = me.pfp;

  // If a file was chosen, convert it and store as data URL
  if (editPfp.files[0]) {
    const file = editPfp.files[0];
    if (file.size > 400 * 1024) {
      profileError.textContent = "PFP too big (400KB max)";
      return;
    }
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
    userCache.delete(me.uid); // so everyone fetches the fresh copy

    profileModal.classList.add("hidden");
    showToast("Profile saved");

    // Refresh the side panel since our name/pfp changed
    if (currentServerCode) refreshUserList();
  } catch (e) {
    profileError.textContent = e.message;
  }
});

// ------------------------------------------------------------------
// JOIN / LEAVE ROOM
// ------------------------------------------------------------------

joinBtn.addEventListener("click", () => joinRoom(serverCodeInput.value));

serverCodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinRoom(serverCodeInput.value);
});

async function detachFromRoom() {
  if (groupOnChildOff) { groupOnChildOff(); groupOnChildOff = null; }
  if (dmOnChildOff)    { dmOnChildOff();    dmOnChildOff    = null; }

  if (currentPresenceListener) {
    currentPresenceListener();
    currentPresenceListener = null;
  }

  if (currentPresenceRef) {
    try { await remove(currentPresenceRef); } catch {}
    currentPresenceRef = null;
  }

  currentRoomRef  = null;
  currentQueryRef = null;
  currentServerCode = null;
  activeDmUid = null;
  dmQueryRef = null;
}

async function joinRoom(rawCode) {
  if (!rawCode || !rawCode.trim()) { showToast("Enter a server code"); return; }

  const code = rawCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (code.length < 2) { showToast("Server code needs 2+ chars"); return; }

  await detachFromRoom();

  currentServerCode = code;
  currentRoomRef    = ref(db, `chats/${code}/messages`);
  currentQueryRef   = query(currentRoomRef, limitToLast(100));

  // Back to group view
  exitDmView();

  resetChatUI();
  setStatus(true);
  chatHeadTitle.textContent = "# " + code;

  // Attach group listener
  const handleChild = (snapshot) => {
    const msg = snapshot.val();
    if (!msg) return;
    if (blockedSet.has(msg.uid)) return;   // client-side block
    renderMessage(msg, msg.uid === me.uid);
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

  // Watch presence list
  const presQuery = ref(db, `chats/${code}/presence`);
  currentPresenceListener = onValue(presQuery, (snap) => {
    const data = snap.val() || {};
    renderUserList(data);
  });

  showToast("Joined #" + code);
}

// ------------------------------------------------------------------
// RENDER MESSAGES
// ------------------------------------------------------------------

async function renderMessage(msg, isOwn) {
  const wrapper = document.createElement("div");
  wrapper.className = "message" + (isOwn ? " own" : "");

  // Fetch sender profile (cached)
  const sender = await fetchUser(msg.uid);

  const meta = document.createElement("div");
  meta.className = "meta";
  const pfpUrl = sender.pfp || defaultPfp(sender.username);
  meta.innerHTML = `<img class="mini-pfp" src="${pfpUrl}" alt="">${escapeHtml(sender.username)} · ${formatTime(msg.timestamp)}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (msg.text) {
    const key = msg.dmKey ? msg.dmKey : currentServerCode;
    bubble.appendChild(document.createTextNode(decryptText(msg.text, key)));
  }

  if (msg.mediaType && msg.mediaData) {
    const key = msg.dmKey ? msg.dmKey : currentServerCode;
    const src = decryptText(msg.mediaData, key);
    if (src && src.startsWith("data:")) {
      if (msg.mediaType === "image" || msg.mediaType === "gif") {
        const img = document.createElement("img");
        img.src = src;
        img.loading = "lazy";
        bubble.appendChild(img);
        if (msg.mediaType === "gif") {
          const t = document.createElement("span");
          t.className = "gif-tag";
          t.textContent = "GIF";
          bubble.appendChild(t);
        }
      } else if (msg.mediaType === "video") {
        const v = document.createElement("video");
        v.src = src;
        v.controls = true;
        v.preload = "metadata";
        bubble.appendChild(v);
      }
    }
  }

  wrapper.appendChild(meta);
  wrapper.appendChild(bubble);
  chatContainer.appendChild(wrapper);
  chatContainer.scrollTop = chatContainer.scrollHeight;
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

  // Sort: me first, then alphabetical
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

    if (uid !== me.uid) {
      row.addEventListener("click", () => openUserModal(uid));
    }

    userList.appendChild(row);
  }
}

// ------------------------------------------------------------------
// USER MODAL (DM / Profile / Block)
// ------------------------------------------------------------------

let modalUid = null;

async function openUserModal(uid) {
  modalUid = uid;
  const p = await fetchUser(uid);

  modalPfp.src  = p.pfp || defaultPfp(p.username);
  modalName.textContent = p.username;
  modalBio.textContent  = p.bio || "(no bio)";

  modalBlockBtn.textContent = blockedSet.has(uid) ? "Unblock" : "Block";

  userModal.classList.remove("hidden");
}

modalCloseBtn.addEventListener("click", () => {
  userModal.classList.add("hidden");
  modalUid = null;
});

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

  // Re-render side panel highlight
  refreshUserList();

  // Re-render group chat (blocked messages disappear / reappear)
  if (!activeDmUid && currentServerCode) {
    await reattachGroupListener();
  }
});

async function reattachGroupListener() {
  if (groupOnChildOff) { groupOnChildOff(); groupOnChildOff = null; }
  resetChatUI();

  const handleChild = (snapshot) => {
    const msg = snapshot.val();
    if (!msg) return;
    if (blockedSet.has(msg.uid)) return;
    renderMessage(msg, msg.uid === me.uid);
    hideEmptyState();
  };
  onChildAdded(currentQueryRef, handleChild);
  groupOnChildOff = () => off(currentQueryRef, "child_added", handleChild);
}

// ------------------------------------------------------------------
// DMs
// ------------------------------------------------------------------

async function openDm(otherUid) {
  if (!currentServerCode) {
    showToast("Join a server code first");
    return;
  }
  if (dmOnChildOff) { dmOnChildOff(); dmOnChildOff = null; }

  activeDmUid = otherUid;
  dmQueryRef  = query(ref(db, dmPath(me.uid, otherUid)), limitToLast(100));

  resetChatUI();

  const other = await fetchUser(otherUid);
  chatHeadTitle.textContent = "DM with " + other.username;
  closeDmBtn.classList.remove("hidden");

  const handleChild = (snapshot) => {
    const msg = snapshot.val();
    if (!msg) return;
    renderMessage(msg, msg.uid === me.uid);
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
  if (currentServerCode) chatHeadTitle.textContent = "# " + currentServerCode;
}

closeDmBtn.addEventListener("click", async () => {
  exitDmView();
  resetChatUI();
  await reattachGroupListener();
});

// ------------------------------------------------------------------
// SEND (group OR dm)
// ------------------------------------------------------------------

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

async function sendMessage() {
  if (!currentServerCode) { showToast("Join a server first"); return; }
  if (!currentRoomRef) return;

  const rawText  = messageInput.value.trim();
  const hasMedia = !!pendingFile;
  if (!rawText && !hasMedia) { showToast("Nothing to send"); return; }

  // Pick encryption key + destination
  let encKey, payload;

  if (activeDmUid) {
    encKey = dmKey(me.uid, activeDmUid);
    payload = {
      uid: me.uid,
      text: rawText ? encryptText(rawText, encKey) : "",
      mediaType: hasMedia ? pendingFile.type : null,
      mediaData: hasMedia ? encryptText(pendingFile.dataUrl, encKey) : null,
      dmKey: encKey,  // stored so the reader knows the key derivation
      timestamp: serverTimestamp()
    };
    await push(ref(db, dmPath(me.uid, activeDmUid)), payload);
  } else {
    encKey = currentServerCode;
    payload = {
      uid: me.uid,
      text: rawText ? encryptText(rawText, encKey) : "",
      mediaType: hasMedia ? pendingFile.type : null,
      mediaData: hasMedia ? encryptText(pendingFile.dataUrl, encKey) : null,
      timestamp: serverTimestamp()
    };
    await push(currentRoomRef, payload);
  }

  messageInput.value = "";
  pendingFile = null;
  fileInput.value = "";
}

// ------------------------------------------------------------------
// FILE PICKER
// ------------------------------------------------------------------

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 1.5 * 1024 * 1024) {
    showToast("File too big (1.5MB max)");
    fileInput.value = "";
    pendingFile = null;
    return;
  }

  let type = null;
  if (file.type === "image/gif") type = "gif";
  else if (file.type.startsWith("image/")) type = "image";
  else if (file.type.startsWith("video/")) type = "video";
  else { showToast("Images, GIFs, videos only"); fileInput.value = ""; return; }

  const r = new FileReader();
  r.onload = (ev) => {
    pendingFile = { type, dataUrl: ev.target.result };
    showToast(type + " attached");
  };
  r.readAsDataURL(file);
});

// ------------------------------------------------------------------
// BOOT
// ------------------------------------------------------------------

setStatus(false);
resetChatUI();
serverCodeInput.value = "demo-room";