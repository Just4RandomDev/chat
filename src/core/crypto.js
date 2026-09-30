// CRYPTO
// Uses CryptoJS (loaded via <script> tag before main.js).

const shaKey = s => CryptoJS.SHA256(s + "::salt::v1").toString();

export function encryptText(plain, key) {
  if (!plain) return "";
  return CryptoJS.AES.encrypt(plain, shaKey(key)).toString();
}

// Returns null on failure instead of a magic string, so callers can
// distinguish "could not decrypt" from literal text.
export function decryptText(cipher, key) {
  if (!cipher) return "";
  try {
    const out = CryptoJS.AES.decrypt(cipher, shaKey(key)).toString(CryptoJS.enc.Utf8);
    return out || null;
  } catch {
    return null;
  }
}

export function hashPassword(pw) {
  return CryptoJS.SHA256("room::" + pw).toString();
}

// DM pair helpers
export const dmPairKey = (a, b) => {
  const [x, y] = [a, b].sort();
  return `${x}__${y}`;
};

export const dmPath = (a, b) => `dms/${dmPairKey(a, b)}/messages`;
export const dmKeyForCrypto = (a, b) => `DM::${dmPairKey(a, b)}`;