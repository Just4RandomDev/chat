import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref,
  push,
  query,
  limitToLast,
  onChildAdded,
  off,
  serverTimestamp
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
const db = getDatabase(app);

function getEncryptionKey(serverCode) {
  return CryptoJS.SHA256(serverCode + "::salt::v1").toString();
}

function encryptText(plainText, serverCode) {
  if (!plainText) return "";
  return CryptoJS.AES.encrypt(plainText, getEncryptionKey(serverCode)).toString();
}

function decryptText(cipherText, serverCode) {
  if (!cipherText) return "";
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, getEncryptionKey(serverCode));
    return bytes.toString(CryptoJS.enc.Utf8) || "[could not decrypt]";
  } catch {
    return "[could not decrypt]";
  }
}

const serverCodeInput = document.getElementById("serverCodeInput");
const joinBtn         = document.getElementById("joinBtn");
const chatContainer   = document.getElementById("chatContainer");
const emptyState      = document.getElementById("emptyState");
const messageInput    = document.getElementById("messageInput");
const fileInput       = document.getElementById("fileInput");
const fileLabel       = document.getElementById("fileLabel");
const sendBtn         = document.getElementById("sendBtn");
const statusDot       = document.getElementById("statusDot");
const statusText      = document.getElementById("statusText");
const toastEl         = document.getElementById("toast");

let currentServerCode = null;
let currentQueryRef   = null;
let currentRoomRef    = null;
let pendingFile       = null;

const currentUser = "user_" + Math.random().toString(36).substring(2, 8);

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2200);
}

function setConnectedUI(on) {
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

function renderMessage(msg, isOwn) {
  const wrapper = document.createElement("div");
  wrapper.className = "message " + (isOwn ? "own" : "other");

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${msg.user || "anon"} · ${formatTime(msg.timestamp)}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (msg.text) {
    const plain = currentServerCode ? decryptText(msg.text, currentServerCode) : "[encrypted]";
    bubble.appendChild(document.createTextNode(plain));
  }

  if (msg.mediaType && msg.mediaData) {
    const src = currentServerCode ? decryptText(msg.mediaData, currentServerCode) : "";

    if (src && src.startsWith("data:")) {
      if (msg.mediaType === "image" || msg.mediaType === "gif") {
        const img = document.createElement("img");
        img.src = src;
        img.alt = msg.mediaType === "gif" ? "GIF" : "Image";
        img.loading = "lazy";
        bubble.appendChild(img);
        if (msg.mediaType === "gif") {
          const tag = document.createElement("span");
          tag.className = "gif-tag";
          tag.textContent = "GIF";
          bubble.appendChild(tag);
        }
      } else if (msg.mediaType === "video") {
        const vid = document.createElement("video");
        vid.src = src;
        vid.controls = true;
        vid.preload = "metadata";
        bubble.appendChild(vid);
      }
    } else {
      const err = document.createElement("span");
      err.textContent = "🔒 media (could not decrypt)";
      err.style.color = "#b0a0c0";
      bubble.appendChild(err);
    }
  }

  wrapper.appendChild(meta);
  wrapper.appendChild(bubble);
  chatContainer.appendChild(wrapper);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function joinServer(rawCode) {
  if (!rawCode || !rawCode.trim()) {
    showToast("Please enter a server code");
    return;
  }

  const code = rawCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (code.length < 2) {
    showToast("Server code needs at least 2 characters");
    return;
  }

  if (currentQueryRef) {
    off(currentQueryRef);
    currentQueryRef = null;
    currentRoomRef  = null;
  }

  currentServerCode = code;
  currentRoomRef    = ref(db, `chats/${code}/messages`);
  currentQueryRef   = query(currentRoomRef, limitToLast(100));

  resetChatUI();
  setConnectedUI(true);

  onChildAdded(
    currentQueryRef,
    (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      renderMessage(data, data.user === currentUser);
      hideEmptyState();
    },
    (error) => {
      console.error("Firebase listener error:", error);
      showToast("Connection error: " + error.message);
      setConnectedUI(false);
    }
  );

  showToast("Joined server: " + code);
}

async function sendMessage() {
  if (!currentServerCode || !currentRoomRef) {
    showToast("Join a server first");
    return;
  }

  const rawText  = messageInput.value.trim();
  const hasMedia = !!pendingFile;

  if (!rawText && !hasMedia) {
    showToast("Nothing to send");
    return;
  }

  const payload = {
    user: currentUser,
    text: rawText ? encryptText(rawText, currentServerCode) : "",
    mediaType: hasMedia ? pendingFile.type : null,
    mediaData: hasMedia ? encryptText(pendingFile.dataUrl, currentServerCode) : null,
    timestamp: serverTimestamp()
  };

  try {
    await push(currentRoomRef, payload);
    messageInput.value = "";
    pendingFile = null;
    fileInput.value = "";
  } catch (err) {
    console.error("Send failed:", err);
    showToast("Could not send: " + err.message);
  }
}

fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  if (file.size > 1.5 * 1024 * 1024) {
    showToast("File is too big (1.5MB max)");
    fileInput.value = "";
    pendingFile = null;
    return;
  }

  let type = null;
  if (file.type === "image/gif") type = "gif";
  else if (file.type.startsWith("image/")) type = "image";
  else if (file.type.startsWith("video/")) type = "video";
  else {
    showToast("Only images, GIFs, and videos are allowed");
    fileInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    pendingFile = { type, dataUrl: ev.target.result };
    showToast(type + " attached — press Send");
  };
  reader.readAsDataURL(file);
});

joinBtn.addEventListener("click", () => joinServer(serverCodeInput.value));

serverCodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinServer(serverCodeInput.value);
});

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

setConnectedUI(false);
resetChatUI();
serverCodeInput.value = "demo-room";