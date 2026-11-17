import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, remove, onValue, off, query,
  orderByChild, limitToLast, startAt, serverTimestamp, onDisconnect,
  onChildAdded, push
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

export {
  ref, get, set, update, remove, onValue, off, query,
  orderByChild, limitToLast, startAt, serverTimestamp, onDisconnect,
  onChildAdded, push
};

// Sunucu saati farkı — refleks ölçümü herkes için aynı saatle yapılsın diye
let offset = 0;
onValue(ref(db, ".info/serverTimeOffset"), (s) => { offset = s.val() || 0; });
export const serverNow = () => Date.now() + offset;

// Ziyaretçiyi görünmez şekilde anonim oturuma al
export function ensureAuth() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) { unsub(); resolve(user); }
    });
    signInAnonymously(auth).catch(reject);
  });
}
