// DATABASE RE-EXPORTS
// Thin facade so swapping backends is possible later.

export {
  ref,
  push,
  set,
  get,
  update,
  remove,
  query,
  limitToLast,
  onValue,
  off,
  serverTimestamp,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";