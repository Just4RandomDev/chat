// BOT
// Single canonical place to send a message as the system bot.
// Guards against writing to a room that no longer exists.

import { ref, push, get, serverTimestamp } from "../firebase/database.js";
import { db } from "../firebase/config.js";
import { BOT_UID } from "../core/constants.js";
import { encryptText } from "../core/crypto.js";

export async function sendBotMessage(roomCode, plainText) {
  if (!roomCode || !plainText) return;

  try {
    // Bail if the room no longer exists (avoids orphan writes).
    const snap = await get(ref(db, `rooms/${roomCode}`));
    if (!snap.exists()) return;

    await push(ref(db, `chats/${roomCode}/messages`), {
      uid: BOT_UID,
      bot: true,
      text: encryptText(plainText, roomCode),
      timestamp: serverTimestamp()
    });
  } catch {}
}