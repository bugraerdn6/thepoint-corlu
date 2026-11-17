import {
  auth, db, ref, get, update, onValue, query, orderByChild, limitToLast,
  startAt, serverTimestamp, serverNow, ensureAuth
} from "./firebase.js";
import { CHECKIN_COOLDOWN_H, LEVELS, ROOM_TTL_MIN } from "./config.js";
import { chooseVisibility, joinRoom, gameOf, leave, updatePresence, watchInvites } from "./engine.js";
import { access, loadAccess, renderGate, verifyLocation, startLocationWatch, renderAdminCard } from "./gate.js";
import { GAMES, UPCOMING } from "./games/index.js";
import { checkNick, randomNick } from "./filter.js";

const app = document.getElementById("app");
const LS_HANDLE = "tp_handle";

export const state = { uid: null, hk: null, profile: null, blocks: {}, unsubs: [] };

// Diğer oyunculara görünen ad: takma ad (varsa) ya da @instagram
export const displayName = (p) => (!p ? "?" : (p.showIg || !p.nick) ? "@" + p.handle : p.nick);

// ---------- yardımcılar ----------
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const keyOf = (handle) => handle.replace(/\./g, ","); // Firebase anahtarında nokta olamaz
const normHandle = (s) => s.trim().toLowerCase().replace(/^@+/, "");
const validHandle = (h) => /^[a-z0-9._]{1,30}$/.test(h);

export function toast(msg, ms = 2600) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), ms);
}

async function pinHash(handle, pin) {
  const data = new TextEncoder().encode(`thepoint:${handle}:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function weekId(ts = serverNow()) {
  const d = new Date(ts);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

export function levelOf(visits) {
  let i = 0;
  LEVELS.forEach((l, idx) => { if (visits >= l.minVisits) i = idx; });
  return { cur: LEVELS[i], next: LEVELS[i + 1] || null };
}

function clearSubs() { state.unsubs.forEach((u) => u()); state.unsubs = []; }

// Profile puan ekle (veritabanı kuralı: tek seferde ≤50, 15 sn arayla)
export async function addPoints(n) {
  const p = state.profile;
  if (!p || n <= 0) return false;
  const wk = weekId();
  const weekPts = (p.weekId === wk ? p.weekPts || 0 : 0) + n;
  try {
    await update(ref(db, `players/${state.hk}`), {
      points: (p.points || 0) + n,
      weekPts, weekId: wk,
      lastPointAt: serverTimestamp()
    });
    return true;
  } catch (e) {
    console.warn("puan yazılamadı", e);
    return false;
  }
}

// ---------- giriş ----------
function renderLogin(prefill = "") {
  clearSubs();
  app.innerHTML = `
    <section class="card center">
      <p class="eyebrow">Müdavim Ağı</p>
      <h1>Oyna, kazan,<br>müdavim ol</h1>
      <p class="muted" style="margin-top:.6rem">Diğer masalarla oyna, her gelişinde puan topla, seviye atla.</p>
    </section>
    <form class="card stack" id="loginForm" autocomplete="off">
      <div>
        <label for="h">Instagram kullanıcı adın</label>
        <div class="field"><span>@</span><input id="h" type="text" inputmode="text" autocapitalize="none" spellcheck="false" maxlength="31" placeholder="kullanici.adi" value="${esc(prefill)}" required></div>
      </div>
      <div>
        <label for="p">4 haneli PIN</label>
        <div class="field"><input id="p" class="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="••••" required></div>
        <p class="muted small" style="margin-top:.3rem">İlk girişte PIN'i sen belirlersin. Sonraki girişlerde aynı PIN'i kullan.</p>
      </div>
      <label class="check"><input type="checkbox" id="c">
        <span>Yeni hesap açıyorum. <button type="button" class="linkbtn" id="kvkk">Aydınlatma metnini</button> okudum, takma adımın sıralamalarda görünmesini kabul ediyorum.</span>
      </label>
      <div id="nickBox" hidden>
        <label for="n">Takma adın <span class="muted small">(diğer müşteriler bunu görür)</span></label>
        <div class="row">
          <div class="field grow"><input id="n" type="text" maxlength="20" placeholder="örn. Gece Kuşu" value="${esc(randomNick())}"></div>
          <button class="btn" type="button" id="dice" aria-label="Rastgele ad">🎲</button>
        </div>
        <p class="muted small" style="margin-top:.3rem">Instagram adın gizli kalır. İstersen sonra ayarlardan gösterebilirsin.</p>
      </div>
      <button class="btn primary block" type="submit" id="go">Giriş yap / Katıl →</button>
      <p class="muted small center" id="msg"></p>
    </form>`;

  document.getElementById("kvkk").onclick = showKvkk;
  document.getElementById("c").onchange = (e) => { document.getElementById("nickBox").hidden = !e.target.checked; };
  document.getElementById("dice").onclick = () => { document.getElementById("n").value = randomNick(); };
  document.getElementById("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById("msg");
    const btn = document.getElementById("go");
    const handle = normHandle(document.getElementById("h").value);
    const pin = document.getElementById("p").value.trim();
    const consent = document.getElementById("c").checked;
    const nickRaw = document.getElementById("n").value;
    if (!validHandle(handle)) { msg.textContent = "Kullanıcı adı sadece harf, rakam, nokta ve alt çizgi içerebilir."; return; }
    if (!/^\d{4}$/.test(pin)) { msg.textContent = "PIN 4 rakam olmalı."; return; }
    btn.disabled = true; msg.textContent = "Kontrol ediliyor…";
    try {
      await login(handle, pin, consent, nickRaw);
    } catch (err) {
      msg.textContent = err.message || "Bir şeyler ters gitti, tekrar dene.";
    } finally {
      btn.disabled = false;
    }
  };
}

// Var olan hesaba bu cihazı bağla. Başarılıysa hk döner, değilse null.
async function linkExisting(handle, pin) {
  const hk = keyOf(handle);
  const hash = await pinHash(handle, pin);
  const pinSnap = await get(ref(db, `pins/${hk}/${hash}`)).catch(() => null);
  if (!pinSnap || !pinSnap.exists()) return null;
  await update(ref(db), { [`links/${hk}/${state.uid}`]: hash });
  localStorage.setItem(LS_HANDLE, hk);
  return hk;
}

export async function tryLink(rawHandle, pin) {
  const handle = normHandle(rawHandle);
  if (!validHandle(handle) || !/^\d{4}$/.test(pin)) throw new Error("Kullanıcı adı veya PIN hatalı.");
  const hk = await linkExisting(handle, pin);
  if (!hk) throw new Error("Kullanıcı adı veya PIN yanlış.");
  return hk;
}

async function login(handle, pin, consent, nickRaw) {
  const hk = keyOf(handle);
  const uid = state.uid;

  // 1) Var olan hesap + doğru PIN mi?
  if (await linkExisting(handle, pin)) return enter(hk);
  const hash = await pinHash(handle, pin);

  // 2) Yeni hesap açmayı dene (ad alınmışsa kural reddeder)
  if (!consent) throw new Error("Bu adla hesap yok ya da PIN yanlış. Yeni hesap açıyorsan onay kutusunu işaretle.");
  const nc = checkNick(nickRaw);
  if (!nc.ok) throw new Error(nc.reason);
  try {
    await update(ref(db), {
      [`pins/${hk}/${hash}`]: true,
      [`links/${hk}/${uid}`]: hash,
      [`players/${hk}`]: {
        handle, nick: nc.nick, showIg: false, invites: false,
        visits: 0, points: 0, weekPts: 0, weekId: weekId(),
        createdAt: serverTimestamp(), consentAt: serverTimestamp()
      }
    });
  } catch {
    throw new Error("Bu kullanıcı adı alınmış ya da PIN yanlış.");
  }
  localStorage.setItem(LS_HANDLE, hk);
  toast("Hoş geldin " + nc.nick + " 🎉");
  return enter(hk);
}

function logout() {
  localStorage.removeItem(LS_HANDLE);
  state.hk = null; state.profile = null;
  renderLogin();
}

function showKvkk() {
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = `
    <div class="card">
      <p class="eyebrow">Taslak</p>
      <h2>Aydınlatma Metni</h2>
      <p><b>Veri sorumlusu:</b> The Point Cocktail Bar, Esentepe Mah. Adnan Doğu Cad. No:16, Çorlu/Tekirdağ.</p>
      <p><b>Toplanan veriler:</b> Instagram kullanıcı adın, takma adın, şifrelenmiş PIN'in, ziyaret sayın ve tarihleri, oyun puanların. Check-in sırasında konumun yalnızca telefonunda mekana yakınlık kontrolü için kullanılır, kaydedilmez.</p>
      <p><b>Amaç:</b> Müdavim seviyesi, ödüller, oyunlar ve sıralama tablosu.</p>
      <p><b>Görünürlük:</b> Diğer oyuncular sadece takma adını, seviyeni ve puanını görür. Instagram kullanıcı adın, sen ayarlardan açmadıkça kimseye gösterilmez. Masa numaran hiçbir zaman gösterilmez.</p>
      <p><b>Saklama:</b> Veriler Google Firebase (AB – Belçika) sunucularında tutulur. Hesabını sildirmek için Instagram'dan @thepoint.corlu'ya yazabilirsin.</p>
      <p><b>Hakların:</b> KVKK m.11 kapsamındaki haklarını (bilgi talep etme, düzeltme, silme vb.) aynı kanaldan kullanabilirsin.</p>
      <p class="muted small">Bu metin taslaktır, yayına almadan önce hukuki kontrol önerilir.</p>
      <button class="btn primary block" style="margin-top:1rem">Kapat</button>
    </div>`;
  m.onclick = (e) => { if (e.target === m || e.target.tagName === "BUTTON") m.remove(); };
  document.body.appendChild(m);
}

// ---------- ana sayfa ----------
async function enter(hk) {
  state.hk = hk;
  const linked = await get(ref(db, `links/${hk}/${state.uid}`)).catch(() => null);
  if (!linked || !linked.exists()) { localStorage.removeItem(LS_HANDLE); return renderLogin(); }
  watchInvites();
  renderHome();
}

export function renderHome() {
  clearSubs();
  app.innerHTML = `
    ${access.admin ? `<section class="card center" id="adminCard"></section>` : ""}
    <section class="card" id="profile"><p class="muted">Profil yükleniyor…</p></section>
    <section class="card">
      <p class="eyebrow">Oyunlar</p>
      <h2 style="margin-bottom:.9rem">Masalar arası</h2>
      <div id="games"></div>
    </section>
    <section class="card">
      <p class="eyebrow">Şu an</p>
      <h2>Açık odalar</h2>
      <ul class="list" id="rooms" style="margin-top:.5rem"><li class="muted">Bakılıyor…</li></ul>
      <hr>
      <form class="row" id="joinForm">
        <div class="field grow"><input id="code" type="text" maxlength="4" autocapitalize="characters" placeholder="Oda kodu" style="text-transform:uppercase;letter-spacing:.2em"></div>
        <button class="btn" type="submit">Katıl</button>
      </form>
    </section>
    <section class="card">
      <p class="eyebrow">Bu hafta</p>
      <h2>Sıralama</h2>
      <ol class="list" id="board" style="margin-top:.5rem"><li class="muted">Yükleniyor…</li></ol>
    </section>
    <p class="center"><button class="linkbtn" id="logout" style="color:var(--cream)">Çıkış yap</button></p>`;

  document.getElementById("logout").onclick = logout;
  renderAdminCard(document.getElementById("adminCard"));
  document.getElementById("games").innerHTML =
    GAMES.map((g) => `<button class="game" data-game="${g.id}"><span class="ico">${g.emoji}</span><span class="grow"><div class="t">${esc(g.name)}</div><div class="d">${esc(g.desc)}</div></span></button>`).join("") +
    UPCOMING.map((g) => `<div class="game soon"><span class="ico">${g.emoji}</span><span><div class="t">${esc(g.name)} <span class="tag">yakında</span></div><div class="d">${esc(g.desc)}</div></span></div>`).join("");
  app.querySelectorAll("[data-game]").forEach((b) => b.onclick = () => chooseVisibility(b.dataset.game));
  document.getElementById("joinForm").onsubmit = (e) => {
    e.preventDefault();
    const c = document.getElementById("code").value.trim().toUpperCase();
    if (c.length === 4) joinRoom(c);
  };

  // profil
  state.unsubs.push(onValue(ref(db, `players/${state.hk}`), (s) => {
    const prev = state.profile;
    state.profile = s.val();
    if (state.profile && (!prev || prev.invites !== state.profile.invites || prev.nick !== state.profile.nick || prev.showIg !== state.profile.showIg)) updatePresence();
    if (!state.profile) return logout();
    if (!state.profile.nick && !document.querySelector(".modal")) showSettings(true);
    renderProfile();
  }));

  // engellediklerim
  state.unsubs.push(onValue(ref(db, `blocks/${state.hk}`), (s) => { state.blocks = s.val() || {}; }));

  // açık odalar
  const since = serverNow() - ROOM_TTL_MIN * 60000;
  state.unsubs.push(onValue(query(ref(db, "rooms"), orderByChild("createdAt"), startAt(since)), (s) => {
    const el = document.getElementById("rooms");
    if (!el) return;
    const rows = [];
    s.forEach((c) => {
      const r = c.val();
      const blocked = state.blocks[r.hostHk];
      if (r.state === "lobby" && r.visibility === "public" && gameOf(r.game) && !blocked && !r.kicked?.[state.hk]) rows.push({ code: c.key, ...r });
    });
    el.innerHTML = rows.length
      ? rows.reverse().map((r) => `
          <li><span class="ico">${gameOf(r.game).emoji}</span><span class="name">${esc(gameOf(r.game).name)} · ${esc(r.host)} · ${Object.keys(r.players || {}).length} kişi</span>
          <button class="btn" style="min-height:38px;padding:.3rem 1rem" data-code="${esc(r.code)}">Katıl</button></li>`).join("")
      : `<li class="muted">Şu an herkese açık oda yok. Bir oyun aç ve "Diğer masalar da katılsın"ı seç!</li>`;
    el.querySelectorAll("[data-code]").forEach((b) => b.onclick = () => joinRoom(b.dataset.code));
  }));

  // haftalık sıralama
  state.unsubs.push(onValue(query(ref(db, "players"), orderByChild("weekPts"), limitToLast(20)), (s) => {
    const el = document.getElementById("board");
    if (!el) return;
    const wk = weekId();
    const rows = [];
    s.forEach((c) => { const p = c.val(); if (p.weekId === wk && p.weekPts > 0) rows.push({ k: c.key, ...p }); });
    rows.reverse();
    el.innerHTML = rows.length
      ? rows.slice(0, 10).map((p, i) => `
          <li class="${p.k === state.hk ? "me" : ""}"><span class="rank">${i + 1}</span>
          <span class="name">${levelOf(p.visits || 0).cur.emoji} ${esc(displayName(p))}</span><span class="val">${p.weekPts}</span></li>`).join("")
      : `<li class="muted">Bu hafta henüz puan yok. İlk sen ol!</li>`;
  }));
}

function renderProfile() {
  const p = state.profile;
  const el = document.getElementById("profile");
  if (!el || !p) return;
  const visits = p.visits || 0;
  const { cur, next } = levelOf(visits);
  const pct = next ? Math.round(((visits - cur.minVisits) / (next.minVisits - cur.minVisits)) * 100) : 100;
  const wk = weekId();
  const cooldownLeft = p.lastVisit ? p.lastVisit + CHECKIN_COOLDOWN_H * 3600000 - serverNow() : 0;
  const canCheckin = cooldownLeft <= 0;

  el.innerHTML = `
    <div class="row">
      <div class="avatar">${esc(displayName(p).replace("@", "")[0].toUpperCase())}</div>
      <div class="grow">
        <div class="handle">${esc(p.nick || "@" + p.handle)}</div>
        <div class="muted small">@${esc(p.handle)} · ${p.showIg ? "👁 herkese görünür" : "🔒 gizli"}</div>
        <span class="level-chip">${cur.emoji} ${esc(cur.name)}</span>
      </div>
      <button class="btn" id="settings" style="min-height:42px;padding:.3rem .8rem;align-self:flex-start" aria-label="Ayarlar">⚙️</button>
    </div>
    <div style="margin-top:1rem">
      <div class="bar"><i style="width:${pct}%"></i></div>
      <p class="muted small" style="margin-top:.35rem">
        ${next ? `${visits}/${next.minVisits} ziyaret · Sonraki: ${next.emoji} <b>${esc(next.name)}</b>${next.reward ? ` → ${esc(next.reward)}` : ""}` : "En üst seviyedesin 👑"}
      </p>
    </div>
    <div class="stats" style="margin-top:1rem">
      <div><strong>${visits}</strong><span>Ziyaret</span></div>
      <div><strong>${p.points || 0}</strong><span>Puan</span></div>
      <div><strong>${p.weekId === wk ? p.weekPts || 0 : 0}</strong><span>Bu hafta</span></div>
    </div>
    <button class="btn ${canCheckin ? "accent" : ""} block" id="checkin" style="margin-top:1rem" ${canCheckin ? "" : "disabled"}>
      ${canCheckin ? "📍 Buradayım, check-in yap (+1 ziyaret)" : `✓ Bugünkü check-in yapıldı · ${Math.ceil(cooldownLeft / 3600000)} sa sonra tekrar`}
    </button>`;

  document.getElementById("settings").onclick = () => showSettings(false);
  const b = document.getElementById("checkin");
  if (canCheckin) b.onclick = () => checkin(b);
}

// ---------- ayarlar: takma ad, Instagram görünürlüğü, davetler ----------
function showSettings(firstTime) {
  const p = state.profile;
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = `
    <form class="card stack" id="setForm">
      <p class="eyebrow">${firstTime ? "Yeni" : "Ayarlar"}</p>
      <h2>${firstTime ? "Kendine bir takma ad seç" : "Profil ayarları"}</h2>
      ${firstTime ? `<p class="muted small">Oyunlarda ve sıralamada diğer müşteriler seni bu adla görecek. Instagram adın gizli kalır.</p>` : ""}
      <div>
        <label for="sn">Takma ad</label>
        <div class="row">
          <div class="field grow"><input id="sn" type="text" maxlength="20" value="${esc(p.nick || randomNick())}"></div>
          <button class="btn" type="button" id="sdice" aria-label="Rastgele ad">🎲</button>
        </div>
      </div>
      <label class="check"><input type="checkbox" id="sig" ${p.showIg ? "checked" : ""}>
        <span><b>Instagram adımı göster</b><br><span class="muted small">Açıksa diğer oyuncular takma adın yerine @${esc(p.handle)} görür.</span></span></label>
      <label class="check"><input type="checkbox" id="sinv" ${p.invites ? "checked" : ""}>
        <span><b>Diğer masalardan davet al</b><br><span class="muted small">Kapalıyken başka masalar sana oyun daveti gönderemez.</span></span></label>
      <button class="btn primary block" type="submit">Kaydet</button>
      ${firstTime ? "" : `<button class="btn block" type="button" id="scancel">Vazgeç</button>`}
      <p class="muted small center" id="smsg"></p>
    </form>`;
  document.body.appendChild(m);
  m.querySelector("#sdice").onclick = () => { m.querySelector("#sn").value = randomNick(); };
  const cancel = m.querySelector("#scancel");
  if (cancel) cancel.onclick = () => m.remove();
  m.querySelector("#setForm").onsubmit = async (e) => {
    e.preventDefault();
    const msg = m.querySelector("#smsg");
    const nc = checkNick(m.querySelector("#sn").value);
    if (!nc.ok) { msg.textContent = nc.reason; return; }
    try {
      await update(ref(db, `players/${state.hk}`), {
        nick: nc.nick, showIg: m.querySelector("#sig").checked, invites: m.querySelector("#sinv").checked
      });
      m.remove();
      toast("Kaydedildi ✓");
    } catch (err) {
      console.warn(err); msg.textContent = "Kaydedilemedi, tekrar dene.";
    }
  };
}

async function checkin(btn) {
  btn.disabled = true;
  btn.textContent = "Konum kontrol ediliyor…";
  try {
    await verifyLocation();
    await update(ref(db, `players/${state.hk}`), {
      visits: (state.profile.visits || 0) + 1,
      lastVisit: serverTimestamp()
    });
    toast("Check-in tamam! +1 ziyaret 🍸");
  } catch (e) {
    toast(e.message || "Check-in yapılamadı.");
    renderProfile();
  }
}

// ---------- başlangıç ----------
(async function boot() {
  try {
    const user = await ensureAuth();
    state.uid = user.uid;
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card center"><h2>Bağlanılamadı</h2><p class="muted">İnternet bağlantını kontrol edip sayfayı yenile.</p></div>`;
    return;
  }
  if (await loadAccess()) afterGate(); else renderGate(afterGate);
})();

// Mekandan ayrılınca her şeyi kapat, kapıya dön
async function lockOut() {
  await leave();
  clearSubs();
  renderGate(afterGate, "The Point'ten ayrıldın gibi görünüyor. Tekrar doğrula.");
}

async function afterGate() {
  startLocationWatch(lockOut);
  const params = new URLSearchParams(location.search);
  const hk = localStorage.getItem(LS_HANDLE);
  if (hk) await enter(hk); else renderLogin();
  const oda = params.get("oda");
  if (oda && state.hk) {
    // profil yüklenince odaya gir
    const wait = setInterval(() => { if (state.profile) { clearInterval(wait); joinRoom(oda); } }, 150);
    setTimeout(() => clearInterval(wait), 8000);
  }
}

export { app, clearSubs };
