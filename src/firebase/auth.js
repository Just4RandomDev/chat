// AUTH API

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { ref, set, get, update, serverTimestamp } from "./database.js";
import { auth, db } from "./config.js";

let currentUser = null;
const listeners = new Set();

function emit(user) {
  currentUser = user;
  listeners.forEach(cb => { try { cb(user); } catch (e) { console.error(e); } });
}

export function onUser(cb) {
  listeners.add(cb);
  if (currentUser) cb(currentUser);
  return () => listeners.delete(cb);
}

export function getCurrentUser() {
  return currentUser;
}

async function ensureUserRecord(user) {
  const snap = await get(ref(db, `users/${user.uid}`));
  let d = snap.val();

  if (!d) {
    const fallback = (user.email || "").split("@")[0].slice(0, 16) || "user";
    d = {
      username: fallback,
      bio: "",
      pfp: "",
      nameColor: "",
      accentColor: "",
      status: "",
      bannerImage: "",
      createdAt: Date.now()
    };
    await set(ref(db, `users/${user.uid}`), d);
  }

  if (!d.createdAt) {
    d.createdAt = Date.now();
    try { await update(ref(db, `users/${user.uid}`), { createdAt: d.createdAt }); } catch {}
  }

  return d;
}

export function initAuth(onReady) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      emit(null);
      onReady(null);
      return;
    }

    try {
      const d = await ensureUserRecord(user);
      const profile = {
        uid: user.uid,
        email: user.email,
        username: d.username || "user",
        pfp: d.pfp || "",
        bio: d.bio || "",
        createdAt: d.createdAt,
        nameColor: d.nameColor || "",
        accentColor: d.accentColor || "",
        status: d.status || "",
        bannerImage: d.bannerImage || ""
      };
      emit(profile);
      onReady(profile);
    } catch (e) {
      console.error("[auth] profile load failed", e);
      emit(null);
      onReady(null);
    }
  });
}

export async function signup(username, email, password) {
  if (!username || !email || !password) throw new Error("Fill in all fields");
  if (username.length < 2 || username.length > 24) throw new Error("Username must be 2-24 chars");
  if (password.length < 6) throw new Error("Password must be 6+ chars");

  // @everyone is reserved for the broadcast mention. Ban it as a username
  // so the mention parser is unambiguous.
  if (username.toLowerCase() === "everyone") throw new Error("That username is reserved");

  const cred = await createUserWithEmailAndPassword(auth, email, password);

  await set(ref(db, `users/${cred.user.uid}`), {
    username,
    bio: "",
    pfp: "",
    nameColor: "",
    accentColor: "",
    status: "",
    bannerImage: "",
    createdAt: serverTimestamp()
  });

  // Wait briefly for the write to become readable.
  for (let i = 0; i < 30; i++) {
    const s = await get(ref(db, `users/${cred.user.uid}`));
    if (s.exists()) break;
    await new Promise(r => setTimeout(r, 100));
  }

  return cred.user;
}

export async function login(email, password) {
  if (!email || !password) throw new Error("Fill in all fields");
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  await signOut(auth);
}

export async function changePassword(currentPassword, newPassword) {
  if (!currentPassword || !newPassword) throw new Error("Fill in both password fields");
  if (newPassword.length < 6) throw new Error("New password must be 6+ chars");

  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in");

  await reauthenticateWithCredential(
    user,
    EmailAuthProvider.credential(user.email, currentPassword)
  );
  await updatePassword(user, newPassword);
}