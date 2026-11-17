// Kapı: sadece The Point'teyken erişim — konum + gece kodu. Yönetici bunları atlar.
import { db, ref, get, set, update, serverNow } from "./firebase.js";
import { VENUE } from "./config.js";
import { state, app, esc, toast, tryLink } from "./app.js";

const DAY_MS = 86400000;
const TZ_MS = 3 * 3600000;     // İstanbul UTC+3
const ROLLOVER_H = 6;          // gece kodu her gün 06:00'da değişir
const RECHECK_MS = 10 * 60000; // açıkken 10 dk'da bir konum kontrolü

// İş günü kimliği: 06:00'dan ertesi 06:00'ya kadar aynı gün sayılır
export function dayId(ts = serverNow()) {
  const d = new Date(ts + TZ_MS - ROLLOVER_H * 3600000);
  return d.toISOString().slice(0, 10);
}
export function dayWindow(id) {
  const from = Date.parse(id + "T00:00:00Z") - TZ_MS + ROLLOVER_H * 3600000;
  return { from, to: from + DAY_MS };
}

export const access = { until: 0, admin: false };

export async function loadAccess() {
  const s = await get(ref(db, `access/${state.uid}`)).catch(() => null);
  const v = s?.val();
  if (v && v.until > serverNow()) { access.until = v.until; access.admin = !!v.admin; return true; }
  return false;
}

// ---------- konum ----------
export function verifyLocation() {
  if (access.admin || VENUE.lat == null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Telefonun konum desteklemiyor."));
    navigator.geolocation.getCurrentPosition((pos) => {
      const d = distanceM(pos.coords.latitude, pos.coords.longitude, VENUE.lat, VENUE.lng);
      const slack = Math.min(pos.coords.accuracy || 0, 150); // iç mekanda GPS sapması
      if (d <= VENUE.radiusM + slack) resolve();
      else reject(new Error("Oyunlar sadece The Point'teyken açılır 📍"));
    }, (err) => reject(new Error(err.code === 1
      ? "Konum izni gerekli. Tarayıcı ayarlarından bu siteye konum izni ver."
      : "Konum alınamadı, tekrar dene.")), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });
}

function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000, toR = (x) => x * Math.PI / 180;
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

let watchTimer = null;
export function startLocationWatch(onLost) {
  clearInterval(watchTimer);
  if (access.admin) return;
  watchTimer = setInterval(() => {
    verifyLocation().catch(() => { clearInterval(watchTimer); onLost(); });
  }, RECHECK_MS);
}

// ---------- kapı ekranı ----------
export function renderGate(onPass, msg = "") {
  app.innerHTML = `
    <section class="card center">
      <p class="eyebrow"><span lang="en">The Point</span>'e hoş geldin</p>
      <h1>Oyunlar sadece<br>mekanda açılır</h1>
      <p class="muted" style="margin-top:.6rem">Önce konumunu doğrula, sonra bu gecenin kodunu gir. Kodu bara ya da garsona sorabilirsin.</p>
      ${msg ? `<p class="small" style="margin-top:.6rem;color:var(--terracotta)">${esc(msg)}</p>` : ""}
    </section>
    <section class="card stack" id="gateBox">
      <button class="btn accent block" id="loc">📍 Konumumu doğrula</button>
      <p class="muted small center" id="locMsg"></p>
    </section>
    <p class="center"><button class="linkbtn" id="adm" style="color:var(--cream);opacity:.7">Yönetici girişi</button></p>`;

  document.getElementById("adm").onclick = () => renderAdminLogin(onPass);
  const btn = document.getElementById("loc");
  btn.onclick = async () => {
    const m = document.getElementById("locMsg");
    btn.disabled = true; m.textContent = "Konum alınıyor…";
    try {
      await verifyLocation();
      renderCodeStep(onPass);
    } catch (e) {
      m.textContent = e.message; btn.disabled = false;
    }
  };
}

function renderCodeStep(onPass) {
  const box = document.getElementById("gateBox");
  box.innerHTML = `
    <p class="center">✅ Konum doğrulandı</p>
    <form id="codeForm" class="stack">
      <label for="gc">Bu gecenin kodu</label>
      <div class="field"><input id="gc" class="pin" type="tel" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="off" required></div>
      <button class="btn primary block" type="submit">Gir →</button>
      <p class="muted small center" id="codeMsg"></p>
    </form>`;
  document.getElementById("gc").focus();
  document.getElementById("codeForm").onsubmit = async (e) => {
    e.preventDefault();
    const code = document.getElementById("gc").value.trim();
    const m = document.getElementById("codeMsg");
    if (!/^\d{4}$/.test(code)) { m.textContent = "Kod 4 rakam."; return; }
    m.textContent = "Kontrol ediliyor…";
    const day = dayId();
    const g = await get(ref(db, `gate/${day}/${code}`)).catch(() => null);
    const v = g?.val();
    if (!v || !(v.from <= serverNow() && serverNow() < v.to)) { m.textContent = "Kod yanlış. Bu gecenin kodunu bara sor."; return; }
    try {
      await set(ref(db, `access/${state.uid}`), { day, code, until: v.to });
      access.until = v.to; access.admin = false;
      onPass();
    } catch (err) {
      console.warn(err); m.textContent = "Giriş yapılamadı, tekrar dene.";
    }
  };
}

function renderAdminLogin(onPass) {
  app.innerHTML = `
    <form class="card stack" id="admForm" autocomplete="off">
      <p class="eyebrow">Yönetici</p>
      <h2>Yönetici girişi</h2>
      <div><label for="ah">Instagram kullanıcı adı</label>
        <div class="field"><span>@</span><input id="ah" type="text" autocapitalize="none" spellcheck="false" required></div></div>
      <div><label for="ap">PIN</label>
        <div class="field"><input id="ap" class="pin" type="password" inputmode="numeric" maxlength="4" required></div></div>
      <button class="btn primary block" type="submit">Giriş →</button>
      <button class="btn block" type="button" id="back">← Geri</button>
      <p class="muted small center" id="am"></p>
    </form>`;
  document.getElementById("back").onclick = () => renderGate(onPass);
  document.getElementById("admForm").onsubmit = async (e) => {
    e.preventDefault();
    const m = document.getElementById("am");
    m.textContent = "Kontrol ediliyor…";
    try {
      const hk = await tryLink(document.getElementById("ah").value, document.getElementById("ap").value.trim());
      const isAdm = await get(ref(db, `admins/${hk}`)).then((s) => s.val() === true).catch(() => false);
      if (!isAdm) { m.textContent = "Bu hesap yönetici değil."; return; }
      const until = serverNow() + DAY_MS - 60000;
      await set(ref(db, `access/${state.uid}`), { admin: true, hk, until });
      access.until = until; access.admin = true;
      toast("Yönetici olarak girildi 🔑");
      onPass();
    } catch (err) {
      m.textContent = err.message || "Giriş yapılamadı.";
    }
  };
}

// ---------- yönetici paneli: gece kodları ----------
export async function renderAdminCard(el) {
  if (!access.admin || !el) return;
  el.innerHTML = `<p class="muted">Yükleniyor…</p>`;
  const s = await get(ref(db, "gateAdmin")).catch(() => null);
  const all = s?.val() || {};
  const today = dayId();
  const tonight = all[today];
  const ahead = Object.keys(all).filter((d) => d >= today).length;
  el.innerHTML = `
    <p class="eyebrow">🔑 Yönetici</p>
    <h2>Bu gecenin kodu</h2>
    <div class="code-big" style="margin:.6rem 0">${tonight ? esc(tonight.code) : "—"}</div>
    <p class="muted small">${tonight ? `${today} 06:00 → ertesi gün 06:00 geçerli.` : "Bu gece için kod yok! Aşağıdan üret."} Hazır kod: ${ahead} gün.</p>
    <button class="btn primary block" id="gen" style="margin-top:.8rem">30 günlük kod üret</button>
    <details style="margin-top:.8rem"><summary class="muted small">Sonraki günlerin kodları</summary>
      <ul class="list">${Object.keys(all).filter((d) => d >= today).sort().slice(0, 14).map((d) => `<li><span class="name">${d}</span><span class="val">${esc(all[d].code)}</span></li>`).join("")}</ul>
    </details>`;
  document.getElementById("gen").onclick = async (e) => {
    e.target.disabled = true;
    try {
      const n = await generateCodes(30, all);
      toast(n ? `${n} günlük yeni kod üretildi ✓` : "Önümüzdeki 30 günün kodları zaten hazır.");
      renderAdminCard(el);
    } catch (err) { console.error(err); toast("Kodlar üretilemedi."); e.target.disabled = false; }
  };
}

async function generateCodes(days, existing) {
  const patch = {};
  let n = 0;
  for (let i = 0; i < days; i++) {
    const d = dayId(serverNow() + i * DAY_MS);
    if (existing[d]) continue;
    const code = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    const w = dayWindow(d);
    patch[`gate/${d}/${code}`] = w;
    patch[`gateAdmin/${d}`] = { code, ...w };
    n++;
  }
  if (n) await update(ref(db), patch);
  return n;
}

