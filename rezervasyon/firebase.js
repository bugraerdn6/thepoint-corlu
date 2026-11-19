// Rezervasyon — Firebase bağlantısı (oyunla aynı proje, ayrı giriş: rezKeys/rezAccess)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, remove, onValue, push, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-database.js";

const app = initializeApp({
  apiKey: "AIzaSyAKGBIlZER2aUhzooAYw8pnXINyrAbNE4k",
  authDomain: "thepointoyun.firebaseapp.com",
  databaseURL: "https://thepointoyun-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "thepointoyun",
  storageBucket: "thepointoyun.firebasestorage.app",
  messagingSenderId: "954554119718",
  appId: "1:954554119718:web:14b11fefed8a829e9118e7"
}, "rez");
const auth = getAuth(app);
export const db = getDatabase(app);
export { ref, get, set, update, remove, onValue, push, serverTimestamp };

let offset = 0;
onValue(ref(db, ".info/serverTimeOffset"), (s) => { offset = s.val() || 0; });
export const serverNow = () => Date.now() + offset;

export function ensureAuth() {
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, (user) => { if (user) { unsub(); resolve(user); } });
    signInAnonymously(auth).catch(reject);
  });
}
