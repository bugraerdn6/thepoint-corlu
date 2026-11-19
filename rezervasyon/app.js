// 📋 The Point · Rezervasyon krokisi — menü ve oyundan ayrı, gizli linkle giriş.
// Roller: "edit" (sen + patron: ekler/düzenler) · "view" (çalışanlar: sadece bakar)
// Veri: rez/<gün>/<id>      = { table, name, size, time, note?, status, by, at }   (herkes okur)
//       rezPhone/<gün>/<id> = "05xx…"                                              (sadece edit)
//       rezLayout           = { items: { <id>: { type, label, x, y, w, h, shape?, cap?, min?, kind? } } }
//       rezKeys/<rol>/<anahtar> = true   ·   rezAccess/<uid> = { role, key }
import { db, ref, get, set, update, remove, onValue, push, serverTimestamp, serverNow, ensureAuth } from "./firebase.js";

const DAY_MS = 86400000, TZ_MS = 3 * 3600000, ROLLOVER_H = 6, KEEP_DAYS = 7;
const VB_W = 600, VB_H = 1000, GRID = 5;
const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// İş günü: 06:00 → ertesi 06:00 aynı gece sayılır (gece kodu ile aynı mantık)
const dayId = (ts = serverNow()) => new Date(ts + TZ_MS - ROLLOVER_H * 3600000).toISOString().slice(0, 10);
const shiftDay = (id, n) => new Date(Date.parse(id + "T12:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
const dayLabel = (id) => new Date(id + "T12:00:00Z").toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

// Saat seçenekleri: 17:00 → 03:00, yarım saatte bir. Gece yarısından sonrası sıralamada sona gelsin.
const TIMES = [];
for (let m = 17 * 60; m <= 27 * 60; m += 30) TIMES.push(`${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
const timeKey = (t) => { const [h, m] = String(t).split(":").map(Number); return (h < ROLLOVER_H ? h + 24 : h) * 60 + m; };

// ---------- varsayılan kroki (fotoğraflardan tahmin — Düzenle ile değiştirilebilir) ----------
const T = (label, x, y, w, h, shape, cap) => ({ type: "table", label, x, y, w, h, shape, cap });
const DEFAULT_LAYOUT = {
  items: {
    street: { type: "decor", kind: "street", label: "SOKAK", x: 10, y: 4, w: 580, h: 28 },
    z_teras: { type: "zone", label: "Cam teras", x: 10, y: 40, w: 580, h: 196 },
    z_salon: { type: "zone", label: "Fıçı", x: 10, y: 262, w: 300, h: 728 },
    z_bar: { type: "zone", label: "Bar", x: 320, y: 262, w: 270, h: 728 },
    glass1: { type: "decor", kind: "glass", label: "", x: 10, y: 242, w: 240, h: 8 },
    glass2: { type: "decor", kind: "glass", label: "", x: 330, y: 242, w: 260, h: 8 },
    door: { type: "decor", kind: "door", label: "Giriş", x: 255, y: 236, w: 70, h: 20 },
    rack: { type: "decor", kind: "rack", label: "Şarap", x: 140, y: 440, w: 34, h: 80 },
    counter: { type: "decor", kind: "counter", label: "Bar tezgâhı", x: 330, y: 560, w: 52, h: 280 },
    kasa: { type: "decor", kind: "kasa", label: "Kasa", x: 326, y: 846, w: 60, h: 44 },
    bar2: { type: "decor", kind: "counter", label: "Bar", x: 18, y: 940, w: 200, h: 40 },
    wcE: { type: "decor", kind: "wc", label: "WC Erkek", x: 224, y: 920, w: 80, h: 64 },
    wcK: { type: "decor", kind: "wc", label: "WC Kadın", x: 394, y: 920, w: 86, h: 64 },
    wall: { type: "decor", kind: "rack", label: "Şarap", x: 486, y: 950, w: 98, h: 30 },
    dj: { type: "decor", kind: "dj", label: "DJ", x: 486, y: 300, w: 94, h: 90 },
    fridge: { type: "decor", kind: "fridge", label: "Dolap", x: 326, y: 950, w: 62, h: 30 },
    // Cam teras: cam kenarında C1–C6 (4 kişilik) + iç tarafta K1–K3
    c1: T("C1", 22, 76, 82, 58, "rect", 4), c2: T("C2", 116, 76, 82, 58, "rect", 4), c3: T("C3", 210, 76, 82, 58, "rect", 4),
    c4: T("C4", 304, 76, 82, 58, "rect", 4), c5: T("C5", 398, 76, 82, 58, "rect", 4), c6: T("C6", 492, 76, 82, 58, "rect", 4),
    k1: T("K1", 110, 158, 62, 62, "round", 2), k2: T("K2", 270, 158, 62, 62, "round", 2), k3: T("K3", 430, 158, 62, 62, "round", 2),
    // Fıçı (antika koltuklu bölüm): kanepeler, berjerler, mumlu mermer masalar
    // Sıra: F1 sağ taraf (eski F2 yeri) → aşağı F2, F3 → alt sol F4 → sol orta F5 → sol üst F6 → sağ üst köşe F7
    f1: T("F1", 200, 450, 84, 84, "round", 4),
    f2: T("F2", 201, 606, 84, 84, "round", 4),
    f3: T("F3", 197, 767, 76, 76, "round", 3),
    f4: T("F4", 31, 838, 120, 80, "rect", 6),
    f5: T("F5", 18, 580, 120, 80, "rect", 5),
    f6: T("F6", 20, 305, 120, 80, "rect", 6),
    f7: T("F7", 209, 304, 66, 66, "round", 2),
    // Bar (fıçı masalı bölüm): 6 fıçı, 2'li / 3'lü — B1 sol üstten başlıyor
    b1: { ...T("B1", 410, 430, 74, 74, "round", 3), min: 2 }, b2: { ...T("B2", 506, 430, 74, 74, "round", 3), min: 2 },
    b3: { ...T("B3", 410, 580, 74, 74, "round", 3), min: 2 }, b4: { ...T("B4", 506, 580, 74, 74, "round", 3), min: 2 },
    b5: { ...T("B5", 410, 730, 74, 74, "round", 3), min: 2 }, b6: { ...T("B6", 506, 730, 74, 74, "round", 3), min: 2 }
  }
};

// ---------- durum ----------
const S = {
  day: dayId(), view: "kroki", role: "", uid: "",
  layout: null, rez: {}, phones: {}, unsub: null, unsubP: null,
  edit: null, sel: null // düzenleme modunda yerel kopya + seçili öğe
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const canEdit = () => S.role === "edit";
const capTxt = (it) => (it.min && it.min < it.cap ? `${it.min}–${it.cap}` : `${it.cap || "?"}`);
const items = () => (S.edit || S.layout).items;
const tables = () => Object.entries(items()).filter(([, it]) => it.type === "table").sort((a, b) => a[1].label.localeCompare(b[1].label, "tr", { numeric: true }));
const rezOf = (tid) => Object.entries(S.rez).filter(([, r]) => r.table === tid).sort((a, b) => timeKey(a[1].time) - timeKey(b[1].time));

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- giriş ----------
const newKey = () => { const b = new Uint8Array(18); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const baseUrl = () => location.origin + location.pathname;
const linkOf = (key) => `${baseUrl()}#k=${key}`;
const keyFromText = (t) => { const m = String(t || "").match(/[#&?]k=([A-Za-z0-9_-]{20,})/) || String(t || "").trim().match(/^([A-Za-z0-9_-]{20,})$/); return m ? m[1] : null; };

// Linkteki anahtarla giriş: önce düzenleme, olmazsa bakma rolü denenir (kurallar doğrular)
async function claim(key) {
  for (const role of ["edit", "view"]) {
    try { await set(ref(db, `rezAccess/${S.uid}`), { role, key }); return role; } catch (e) { /* bu rol değil */ }
  }
  return null;
}

async function boot() {
  try {
    const user = await ensureAuth();
    S.uid = user.uid;
    const k = keyFromText(location.hash);
    if (k) {
      history.replaceState(null, "", baseUrl()); // anahtar adres çubuğunda/geçmişte kalmasın
      const role = await claim(k);
      if (!role) return renderLocked("Bu link geçersiz ya da iptal edilmiş. Yeni link iste.");
    }
    const a = (await get(ref(db, `rezAccess/${S.uid}`)).catch(() => null))?.val();
    if (!a) return renderLocked();
    let l;
    try { l = (await get(ref(db, "rezLayout"))).val(); }
    catch (e) { return renderLocked("Linkin iptal edilmiş. Yeni link iste."); }
    S.role = a.role === "edit" ? "edit" : "view";
    S.layout = l && l.items ? l : clone(DEFAULT_LAYOUT);
    if (canEdit()) cleanup();
    watchDay();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card center"><h2>Açılamadı</h2><p class="muted" style="margin-top:.5rem">İnternet bağlantını kontrol et.<br><small>${esc(e.message || "")}</small></p></div>`;
  }
}

function renderLocked(msg) {
  app.innerHTML = `
    <form class="card center stack" id="lk" autocomplete="off">
      <p class="eyebrow">🔑 Sadece personel</p>
      <h2>Rezervasyon</h2>
      <p class="muted">${esc(msg || "Bu sayfa sana gönderilen özel linkle açılır. Linke tıkla ya da aşağıya yapıştır.")}</p>
      <div class="field"><input id="lkIn" type="text" placeholder="Linki buraya yapıştır" autocapitalize="none" spellcheck="false"></div>
      <button class="btn primary block" type="submit">Giriş →</button>
      <p class="rz-warn" id="lkMsg"></p>
    </form>`;
  document.getElementById("lk").onsubmit = (e) => {
    e.preventDefault();
    const k = keyFromText(document.getElementById("lkIn").value);
    if (!k) { document.getElementById("lkMsg").textContent = "Bu bir rezervasyon linki değil."; return; }
    location.hash = "k=" + k; boot();
  };
}

// KVKK: geçmiş gecelerin rezervasyonlarını (isim/telefon) 7 günden fazla tutma
async function cleanup() {
  try {
    const [r, p] = await Promise.all([get(ref(db, "rez")), get(ref(db, "rezPhone"))]);
    const limit = shiftDay(dayId(), -KEEP_DAYS);
    const patch = {};
    Object.keys(r.val() || {}).forEach((d) => { if (d < limit) patch[`rez/${d}`] = null; });
    Object.keys(p.val() || {}).forEach((d) => { if (d < limit) patch[`rezPhone/${d}`] = null; });
    if (Object.keys(patch).length) await update(ref(db), patch);
  } catch (e) { console.warn("temizlik", e); }
}

function watchDay() {
  if (S.unsub) S.unsub();
  if (S.unsubP) { S.unsubP(); S.unsubP = null; }
  S.unsub = onValue(ref(db, `rez/${S.day}`), (s) => { S.rez = s.val() || {}; render(); },
    (e) => { console.error(e); renderLocked("Erişimin kapatılmış. Yeni link iste."); });
  if (canEdit()) S.unsubP = onValue(ref(db, `rezPhone/${S.day}`), (s) => { S.phones = s.val() || {}; refreshSheet(); }, () => {});
}

// ---------- ana ekran ----------
function render() {
  const sheetOpen = document.querySelector(".modal[data-sheet]");
  const list = Object.values(S.rez);
  const people = list.reduce((n, r) => n + (Number(r.size) || 0), 0);
  const busy = new Set(list.map((r) => r.table)).size;
  const today = dayId();
  app.innerHTML = `
    <section class="rz">
      <div class="rz-top">
        <button class="btn rz-nav" id="prev" aria-label="Önceki gün">‹</button>
        <div class="rz-day"><b>${esc(dayLabel(S.day))}</b><small>${S.day === today ? "Bu gece" : S.day === shiftDay(today, 1) ? "Yarın" : S.day < today ? "Geçmiş" : ""}</small></div>
        <button class="btn rz-nav" id="next" aria-label="Sonraki gün">›</button>
      </div>
      ${S.day !== today ? `<button class="btn block rz-today" id="today">↩ Bu geceye dön</button>` : ""}
      <div class="rz-stats">
        <span><b>${list.length}</b> rezervasyon</span><span><b>${people}</b> kişi</span><span><b>${busy}/${tables().length}</b> masa</span>
      </div>
      ${S.edit ? editBar() : `
      <div class="seg rz-seg" id="views">
        <button data-v="kroki" class="${S.view === "kroki" ? "on" : ""}">🗺 Kroki</button>
        <button data-v="liste" class="${S.view === "liste" ? "on" : ""}">📋 Liste</button>
      </div>`}
      <div class="card rz-card">${S.view === "liste" && !S.edit ? listHtml() : planSvg()}</div>
      ${S.edit ? "" : `
      <div class="rz-legend"><span><i class="lg free"></i>Boş</span><span><i class="lg res"></i>Rezerve</span><span><i class="lg in"></i>Geldi</span></div>
      ${canEdit() ? `<div class="rz-ebtns"><button class="btn block rz-editbtn" id="editLayout">✏️ Krokiyi düzenle</button><button class="btn block rz-editbtn" id="links">🔗 Linkler</button></div>`
        : `<p class="rz-role">👀 Sadece görüntüleme</p>`}`}
    </section>`;
  document.getElementById("prev").onclick = () => goDay(shiftDay(S.day, -1));
  document.getElementById("next").onclick = () => goDay(shiftDay(S.day, 1));
  document.getElementById("today")?.addEventListener("click", () => goDay(today));
  app.querySelectorAll("#views [data-v]").forEach((b) => b.onclick = () => { S.view = b.dataset.v; render(); });
  document.getElementById("editLayout")?.addEventListener("click", startEdit);
  document.getElementById("links")?.addEventListener("click", openLinks);
  if (S.edit) bindEdit(); else bindPlan();
  // açık masa penceresi varsa canlı güncelle
  if (sheetOpen && !S.edit) openTable(sheetOpen.dataset.sheet, true);
}

function goDay(d) { closeSheet(); S.day = d; S.rez = {}; S.phones = {}; watchDay(); }
function refreshSheet() { const m = document.querySelector(".modal[data-sheet]"); if (m && !S.edit) openTable(m.dataset.sheet, true); }

// ---------- SVG kroki ----------
function planSvg() {
  const its = Object.entries(items());
  const order = { zone: 0, decor: 1, table: 2 };
  its.sort((a, b) => order[a[1].type] - order[b[1].type]);
  return `<svg class="rz-plan${S.edit ? " editing" : ""}" id="plan" viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg">
    ${S.edit ? `<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#5c6a3f" stroke-opacity=".12"/></pattern></defs><rect width="${VB_W}" height="${VB_H}" fill="url(#grid)"/>` : ""}
    ${its.map(([id, it]) => itemSvg(id, it)).join("")}
  </svg>`;
}

function itemSvg(id, it) {
  const sel = S.edit && S.sel === id;
  const { x, y, w, h } = it;
  let body = "";
  if (it.type === "zone") {
    body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="zn"/>
      <text x="${x + 12}" y="${y + 24}" class="zn-t">${esc(it.label.toLocaleUpperCase("tr"))}</text>`;
  } else if (it.type === "decor") {
    const vertical = h > w * 1.6;
    const cx = x + w / 2, cy = y + h / 2;
    body = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${it.kind === "glass" ? 2 : 6}" class="dc dc-${esc(it.kind || "box")}"/>
      ${it.label ? `<text x="${cx}" y="${cy}" class="dc-t" ${vertical ? `transform="rotate(-90 ${cx} ${cy})"` : ""}>${esc(it.label)}</text>` : ""}`;
  } else {
    const rs = rezOf(id);
    const st = S.edit || !rs.length ? "free" : rs.some(([, r]) => r.status === "geldi") ? "in" : "res";
    const first = rs.find(([, r]) => r.status !== "geldi")?.[1] || rs[0]?.[1];
    const cx = x + w / 2, cy = y + h / 2;
    const shape = it.shape === "round"
      ? `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" class="tb tb-${st}"/>`
      : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" class="tb tb-${st}"/>`;
    const max = w < 90 ? 7 : 10;
    const name = first ? (first.name.length > max ? first.name.slice(0, max - 1) + "…" : first.name) : "";
    const lines = S.edit || !first
      ? `<text x="${cx}" y="${cy - 3}" class="tb-l">${esc(it.label)}</text><text x="${cx}" y="${cy + 19}" class="tb-c">${capTxt(it)} kişi</text>`
      : `<text x="${cx}" y="${cy - 10}" class="tb-l sm">${esc(first.time)}</text><text x="${cx}" y="${cy + 9}" class="tb-n">${esc(name)}</text><text x="${cx}" y="${cy + 27}" class="tb-c on">${esc(it.label)} · ${esc(first.size)} kişi</text>`;
    const badge = rs.length > 1 ? `<circle cx="${x + w - 6}" cy="${y + 6}" r="14" class="bdg"/><text x="${x + w - 6}" y="${y + 7}" class="bdg-t">${rs.length}</text>` : "";
    body = shape + lines + badge;
  }
  const handle = sel ? `<rect x="${x + w - 14}" y="${y + h - 14}" width="28" height="28" rx="6" class="rh" data-resize="${esc(id)}"/>` : "";
  const outline = sel ? `<rect x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${h + 8}" rx="10" class="selbox"/>` : "";
  const clickable = it.type === "table" || S.edit;
  return `<g data-id="${esc(id)}" class="it it-${it.type}${clickable ? " hit" : ""}">${outline}${body}${handle}</g>`;
}

function bindPlan() {
  const svg = document.getElementById("plan");
  if (svg) svg.onclick = (e) => {
    const g = e.target.closest("g[data-id]");
    if (g && items()[g.dataset.id]?.type === "table") openTable(g.dataset.id);
  };
  app.querySelectorAll("[data-open]").forEach((el) => el.onclick = () => openTable(el.dataset.open));
}

// ---------- liste ----------
function listHtml() {
  const rows = Object.entries(S.rez).sort((a, b) => timeKey(a[1].time) - timeKey(b[1].time));
  if (!rows.length) return `<p class="muted center" style="padding:1.5rem 0">Bu gece için rezervasyon yok.<br>Krokide bir masaya dokunup ekleyebilirsin.</p>`;
  return `<ul class="list rz-list">${rows.map(([, r]) => {
    const t = items()[r.table];
    return `<li data-open="${esc(r.table)}" class="${r.status === "geldi" ? "in" : ""}">
      <span class="rz-time">${esc(r.time)}</span>
      <span class="name"><b>${esc(r.name)}</b><small>${esc(r.size)} kişi${r.note ? " · " + esc(r.note) : ""}</small></span>
      <span class="rz-tbl">${esc(t ? t.label : "?")}</span>
    </li>`;
  }).join("")}</ul>`;
}

// ---------- masa penceresi ----------
function closeSheet() { document.querySelector(".modal[data-sheet]")?.remove(); }

function sheet(tid, inner) {
  let m = document.querySelector(".modal[data-sheet]");
  if (!m) {
    m = document.createElement("div");
    m.className = "modal rz-modal";
    m.onclick = (e) => { if (e.target === m) closeSheet(); };
    document.body.appendChild(m);
  }
  m.dataset.sheet = tid;
  m.innerHTML = `<div class="card rz-sheet">${inner}</div>`;
  return m;
}

function openTable(tid, refresh = false) {
  const t = items()[tid];
  if (!t) return closeSheet();
  const m = document.querySelector(".modal[data-sheet]");
  if (refresh && m?.querySelector("form")) return; // form açıkken yazılanı silme
  const rs = rezOf(tid);
  const el = sheet(tid, `
    <div class="rz-sh-top"><div><p class="eyebrow">${esc(zoneOf(t))}</p><h2>Masa ${esc(t.label)} <small class="muted">· ${capTxt(t)} kişilik</small></h2></div>
      <button class="btn rz-x" data-close aria-label="Kapat">✕</button></div>
    ${rs.length ? `<ul class="list rz-list">${rs.map(([rid, r]) => `
      <li class="${r.status === "geldi" ? "in" : ""}">
        <span class="rz-time">${esc(r.time)}</span>
        <span class="name"><b>${esc(r.name)}</b><small>${esc(r.size)} kişi${S.phones[rid] ? ` · <a href="tel:${esc(String(S.phones[rid]).replace(/[^\d+]/g, ""))}">${esc(S.phones[rid])}</a>` : ""}${r.note ? " · " + esc(r.note) : ""}</small></span>
        ${canEdit() ? `<span class="rz-acts">
          <button class="btn sm ${r.status === "geldi" ? "primary" : ""}" data-in="${esc(rid)}" title="Geldi">${r.status === "geldi" ? "✓ Geldi" : "Geldi"}</button>
          <button class="btn sm" data-ed="${esc(rid)}" aria-label="Düzenle">✏️</button>
        </span>` : r.status === "geldi" ? `<span class="rz-pill">✓ Geldi</span>` : ""}
      </li>`).join("")}</ul>` : `<p class="muted" style="margin:.8rem 0">Bu gece boş.</p>`}
    ${canEdit() ? `<button class="btn accent block" data-add style="margin-top:.8rem">+ Rezervasyon ekle</button>` : ""}`);
  el.querySelector("[data-close]").onclick = closeSheet;
  el.querySelector("[data-add]")?.addEventListener("click", () => rezForm(tid, null));
  el.querySelectorAll("[data-ed]").forEach((b) => b.onclick = () => rezForm(tid, b.dataset.ed));
  el.querySelectorAll("[data-in]").forEach((b) => b.onclick = async () => {
    const r = S.rez[b.dataset.in];
    await update(ref(db, `rez/${S.day}/${b.dataset.in}`), { status: r.status === "geldi" ? "bekliyor" : "geldi" }).catch(() => toast("Kaydedilemedi."));
  });
}

const zoneOf = (t) => {
  const cx = t.x + t.w / 2, cy = t.y + t.h / 2;
  const z = Object.values(items()).find((z) => z.type === "zone" && cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h);
  return z ? z.label : "";
};

function rezForm(tid, rid) {
  if (!canEdit()) return;
  const r = rid ? { ...S.rez[rid], phone: S.phones[rid] || "" } : { name: "", time: "21:00", size: items()[tid].cap || 2, phone: "", note: "", table: tid };
  const tbls = tables();
  const el = sheet(tid, `
    <form class="stack" id="rf" autocomplete="off">
      <div class="rz-sh-top"><h2>${rid ? "Rezervasyonu düzenle" : "Yeni rezervasyon"}</h2><button type="button" class="btn rz-x" data-back aria-label="Geri">✕</button></div>
      <div><label for="rn">İsim</label><div class="field"><input id="rn" type="text" maxlength="40" required value="${esc(r.name)}" placeholder="Ör. Ayşe Y."></div></div>
      <div class="rz-row">
        <div><label for="rt">Saat</label><div class="field"><select id="rt">${[...new Set([...TIMES, r.time])].sort((a, b) => timeKey(a) - timeKey(b)).map((t) => `<option ${t === r.time ? "selected" : ""}>${t}</option>`).join("")}</select></div></div>
        <div><label for="rs">Kişi</label><div class="field rz-step"><button type="button" data-d="-1">−</button><input id="rs" type="number" inputmode="numeric" min="1" max="60" value="${esc(r.size)}"><button type="button" data-d="1">+</button></div></div>
      </div>
      <div><label for="rm">Masa</label><div class="field"><select id="rm">${tbls.map(([id, t]) => `<option value="${esc(id)}" ${id === r.table ? "selected" : ""}>${esc(t.label)} · ${capTxt(t)} kişilik${rezOf(id).some(([k]) => k !== rid) ? " (dolu saat var)" : ""}</option>`).join("")}</select></div></div>
      <div><label for="rp">Telefon <small>(isteğe bağlı)</small></label><div class="field"><input id="rp" type="tel" maxlength="20" value="${esc(r.phone || "")}" placeholder="05xx xxx xx xx"></div></div>
      <div><label for="ro">Not <small>(isteğe bağlı)</small></label><div class="field"><input id="ro" type="text" maxlength="160" value="${esc(r.note || "")}" placeholder="Doğum günü, pasta getirecekler…"></div></div>
      <p class="rz-warn" id="rw"></p>
      <button class="btn primary block" type="submit">${rid ? "Kaydet" : "Rezervasyonu ekle"}</button>
      ${rid ? `<button class="btn block rz-del" type="button" data-del>🗑 Rezervasyonu sil</button>` : ""}
    </form>`);
  const $ = (s) => el.querySelector(s);
  const warn = () => {
    const tid2 = $("#rm").value, t = items()[tid2], size = Number($("#rs").value) || 0, tk = timeKey($("#rt").value);
    const msgs = [];
    if (t?.cap && size > t.cap) msgs.push(`⚠️ ${t.label} ${t.cap} kişilik, ${size} kişi yazdın.`);
    const near = rezOf(tid2).filter(([k, x]) => k !== rid && Math.abs(timeKey(x.time) - tk) < 120);
    if (near.length) msgs.push(`⚠️ Bu masada ${near.map(([, x]) => `${x.time} ${esc(x.name)}`).join(", ")} var (2 saatten yakın).`);
    $("#rw").innerHTML = msgs.join("<br>");
  };
  el.querySelectorAll("[data-d]").forEach((b) => b.onclick = () => { $("#rs").value = Math.max(1, Math.min(60, (Number($("#rs").value) || 0) + Number(b.dataset.d))); warn(); });
  ["#rm", "#rs", "#rt"].forEach((s) => $(s).addEventListener("input", warn));
  warn();
  $("[data-back]").onclick = () => openTable(tid);
  $("[data-del]")?.addEventListener("click", async () => {
    if (!confirm(`${r.name} rezervasyonu silinsin mi?`)) return;
    await update(ref(db), { [`rez/${S.day}/${rid}`]: null, [`rezPhone/${S.day}/${rid}`]: null }).then(() => { toast("Silindi"); openTable(tid); }).catch(() => toast("Silinemedi."));
  });
  $("#rf").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("#rn").value.trim(), size = Math.round(Number($("#rs").value));
    if (!name) return;
    if (!(size >= 1 && size <= 60)) { $("#rw").textContent = "Kişi sayısı 1–60 arası olmalı."; return; }
    const data = { table: $("#rm").value, name, size, time: $("#rt").value, status: r.status || "bekliyor", by: r.by || "yonetici", at: r.at || serverTimestamp() };
    const phone = $("#rp").value.trim(), note = $("#ro").value.trim();
    if (note) data.note = note;
    const btn = e.submitter || $("button[type=submit]");
    btn.disabled = true;
    try {
      const id = rid || push(ref(db, `rez/${S.day}`)).key;
      await update(ref(db), { [`rez/${S.day}/${id}`]: data, [`rezPhone/${S.day}/${id}`]: phone || null });
      toast(rid ? "Kaydedildi ✓" : "Rezervasyon eklendi ✓");
      el.querySelector("form").remove();
      openTable(data.table);
    } catch (err) { console.error(err); toast("Kaydedilemedi. İnternet / yetki?"); btn.disabled = false; }
  };
}

// ---------- 🔗 paylaşım linkleri (sadece edit) ----------
async function openLinks() {
  if (!canEdit()) return;
  closeSheet();
  let keys;
  try { keys = (await get(ref(db, "rezKeys"))).val() || {}; } catch (e) { return toast("Linkler okunamadı."); }
  const ek = Object.keys(keys.edit || {})[0], vk = Object.keys(keys.view || {})[0];
  const row = (title, sub, key, role) => `
    <div class="rz-link">
      <b>${title}</b><small class="muted">${sub}</small>
      ${key ? `<input type="text" readonly value="${esc(linkOf(key))}">
      <div class="rz-ebtns">
        <button class="btn sm primary" data-copy="${esc(linkOf(key))}">📋 Kopyala</button>
        <a class="btn sm" href="https://wa.me/?text=${encodeURIComponent("The Point rezervasyon krokisi: " + linkOf(key))}" target="_blank" rel="noopener">WhatsApp</a>
        <button class="btn sm danger" data-regen="${role}">↻ Yenile</button>
      </div>` : `<button class="btn sm primary" data-regen="${role}">Link oluştur</button>`}
    </div>`;
  const el = sheet("__links", `
    <div class="rz-sh-top"><h2>🔗 Linkler</h2><button class="btn rz-x" data-close aria-label="Kapat">✕</button></div>
    ${row("👀 Bakma linki", "Çalışanlara gönder. Sadece görürler, telefonları göremezler.", vk, "view")}
    ${row("✏️ Düzenleme linki", "Sadece sen ve patron. Kimseyle paylaşma.", ek, "edit")}
    <p class="muted small" style="margin-top:.6rem">↻ Yenile: eski link hemen çalışmaz olur, o linkle girmiş herkesin erişimi kapanır. Link yanlış kişiye gittiyse kullan.</p>`);
  el.querySelector("[data-close]").onclick = closeSheet;
  el.querySelectorAll("[data-copy]").forEach((b) => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast("Kopyalandı ✓"); }
    catch { b.closest(".rz-link").querySelector("input").select(); toast("Seçili linki kopyala"); }
  });
  el.querySelectorAll("[data-regen]").forEach((b) => b.onclick = async () => {
    const role = b.dataset.regen, old = Object.keys(keys[role] || {});
    if (old.length && !confirm(role === "edit"
      ? "Düzenleme linki yenilensin mi? Patron dahil eski linkle giren herkes yeni linke ihtiyaç duyacak."
      : "Bakma linki yenilensin mi? Eski linkle giren çalışanlar artık göremez, yeni linki göndermen gerekir.")) return;
    const k = newKey(), patch = { [`rezKeys/${role}/${k}`]: true };
    old.forEach((o) => { patch[`rezKeys/${role}/${o}`] = null; });
    if (role === "edit") patch[`rezAccess/${S.uid}`] = { role: "edit", key: k }; // kendi erişimin kopmasın
    try { await update(ref(db), patch); toast("Yeni link hazır ✓"); openLinks(); }
    catch (e) { console.error(e); toast("Yenilenemedi."); }
  });
}

// ---------- kroki düzenleme ----------
function editBar() {
  return `<div class="rz-editbar">
    <p class="muted small">Sürükle = taşı · dokun = seç · köşedeki kare = boyut</p>
    <div class="rz-ebtns">
      <button class="btn sm" id="addT">+ Masa</button><button class="btn sm" id="addZ">+ Alan</button><button class="btn sm" id="addD">+ Eşya</button>
      <button class="btn sm" id="reset">Varsayılan</button>
    </div>
    <div id="selPanel">${selPanel()}</div>
    <div class="rz-ebtns"><button class="btn block" id="cancelE">Vazgeç</button><button class="btn primary block" id="saveE">Kaydet</button></div>
  </div>`;
}

function selPanel() {
  const it = S.sel && S.edit.items[S.sel];
  if (!it) return "";
  const kinds = [["box", "Kutu"], ["counter", "Tezgâh"], ["rack", "Raf"], ["fridge", "Dolap"], ["glass", "Cam"], ["dj", "DJ / neon"], ["wc", "WC"], ["kasa", "Kasa"], ["door", "Kapı"], ["street", "Sokak"]];
  return `<div class="rz-sel">
    <div class="rz-row">
      <div><label>${it.type === "table" ? "Masa adı" : "Yazı"}</label><div class="field"><input id="eL" type="text" maxlength="24" value="${esc(it.label)}"></div></div>
      ${it.type === "table" ? `<div><label>Kişi</label><div class="field"><input id="eC" type="number" min="1" max="40" value="${it.cap || 4}"></div></div>` : ""}
    </div>
    ${it.type === "table" ? `<div class="seg" id="eS"><button data-s="rect" class="${it.shape !== "round" ? "on" : ""}">▭ Köşeli</button><button data-s="round" class="${it.shape === "round" ? "on" : ""}">◯ Yuvarlak</button></div>` : ""}
    ${it.type === "decor" ? `<div><label>Tür</label><div class="field"><select id="eK">${kinds.map(([k, l]) => `<option value="${k}" ${it.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>` : ""}
    <div class="rz-ebtns"><button class="btn sm" id="eDup">⧉ Kopyala</button><button class="btn sm" id="eRot">⟲ Çevir</button><button class="btn sm danger" id="eDel">🗑 Sil</button></div>
  </div>`;
}

function startEdit() { if (!canEdit()) return; closeSheet(); S.edit = clone(S.layout); S.sel = null; S.view = "kroki"; render(); }

function newId(p) { let i = 1; while (S.edit.items[p + i]) i++; return p + i; }

function bindEdit() {
  const E = S.edit.items;
  const $ = (s) => document.getElementById(s);
  const add = (p, it) => { const id = newId(p); E[id] = it; S.sel = id; render(); };
  $("addT").onclick = () => {
    const n = tables().length + 1;
    add("m", { type: "table", label: "M" + n, x: 260, y: 470, w: 80, h: 80, shape: "round", cap: 4 });
  };
  $("addZ").onclick = () => add("z", { type: "zone", label: "Yeni alan", x: 150, y: 400, w: 300, h: 200 });
  $("addD").onclick = () => add("d", { type: "decor", kind: "box", label: "Eşya", x: 250, y: 480, w: 100, h: 40 });
  $("reset").onclick = () => { if (confirm("Kroki fotoğraflardan çıkarılan ilk hâline dönsün mü? (Kaydet'e basmazsan hiçbir şey değişmez.)")) { S.edit = clone(DEFAULT_LAYOUT); S.sel = null; render(); } };
  $("cancelE").onclick = () => { S.edit = null; S.sel = null; render(); };
  $("saveE").onclick = async () => {
    const orphan = Object.values(S.rez).filter((r) => !S.edit.items[r.table]);
    if (orphan.length && !confirm(`Silinen masada bu gece ${orphan.length} rezervasyon var. Yine de kaydedilsin mi?`)) return;
    try {
      await set(ref(db, "rezLayout"), S.edit);
      S.layout = S.edit; S.edit = null; S.sel = null;
      toast("Kroki kaydedildi ✓"); render();
    } catch (e) { console.error(e); toast("Kaydedilemedi."); }
  };
  const it = S.sel && E[S.sel];
  if (it) {
    $("eL").oninput = (e) => { it.label = e.target.value; redrawPlan(); };
    $("eC")?.addEventListener("input", (e) => { it.cap = Math.max(1, Math.min(40, Math.round(Number(e.target.value)) || 1)); if (it.min && it.min >= it.cap) delete it.min; redrawPlan(); });
    document.querySelectorAll("#eS [data-s]").forEach((b) => b.onclick = () => { it.shape = b.dataset.s; render(); });
    $("eK")?.addEventListener("change", (e) => { it.kind = e.target.value; redrawPlan(); });
    $("eDup").onclick = () => add(it.type === "table" ? "m" : it.type === "zone" ? "z" : "d", { ...clone(it), x: Math.min(VB_W - it.w, it.x + 20), y: Math.min(VB_H - it.h, it.y + 20), label: it.type === "table" ? "M" + (tables().length + 1) : it.label });
    $("eRot").onclick = () => { [it.w, it.h] = [it.h, it.w]; clamp(it); render(); };
    $("eDel").onclick = () => { delete E[S.sel]; S.sel = null; render(); };
  }
  bindDrag();
}

const snap = (v) => Math.round(v / GRID) * GRID;
const clamp = (it) => {
  it.w = Math.max(20, Math.min(VB_W, it.w)); it.h = Math.max(8, Math.min(VB_H, it.h));
  it.x = Math.max(0, Math.min(VB_W - it.w, it.x)); it.y = Math.max(0, Math.min(VB_H - it.h, it.y));
};

function redrawPlan() {
  const card = document.querySelector(".rz-card");
  if (!card) return;
  card.innerHTML = planSvg();
  bindDrag();
}

function bindDrag() {
  const svg = document.getElementById("plan");
  if (!svg) return;
  const pt = (e) => { const m = svg.getScreenCTM().inverse(); const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return { x: p.x, y: p.y }; };
  let drag = null;
  svg.onpointerdown = (e) => {
    const rh = e.target.closest("[data-resize]");
    const g = e.target.closest("g[data-id]");
    if (!g && !rh) { if (S.sel) { S.sel = null; render(); } return; }
    const id = rh ? rh.dataset.resize : g.dataset.id;
    const it = S.edit.items[id];
    const p = pt(e);
    drag = { id, it, mode: rh ? "size" : "move", sx: p.x, sy: p.y, o: { ...it }, moved: false };
    svg.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  svg.onpointermove = (e) => {
    if (!drag) return;
    const p = pt(e), dx = p.x - drag.sx, dy = p.y - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    const { it, o } = drag;
    if (drag.mode === "move") { it.x = snap(o.x + dx); it.y = snap(o.y + dy); }
    else { it.w = snap(o.w + dx); it.h = snap(o.h + dy); }
    clamp(it);
    const g = svg.querySelector(`g[data-id="${CSS.escape(drag.id)}"]`);
    if (g) g.outerHTML = itemSvg(drag.id, it);
  };
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved || S.sel !== d.id) { S.sel = d.id; render(); }
    else redrawPlan();
  };
  svg.onpointerup = end;
  svg.onpointercancel = end;
}

boot();
