// 🛠 Yönetim paneli — sadece yöneticiler (personel = yönetici).
// Müşteri: ara, PIN sıfırla, engelle, hesabı sil, yönetici yap · Şikayetler · Odalar · Ayarlar
import { db, ref, get, set, update, remove, onValue, serverTimestamp, serverNow } from "./firebase.js";
import { state, app, esc, toast, clearSubs, renderHome, levelOf } from "./app.js";
import { access } from "./gate.js";
import { gameOf } from "./engine.js";

// ---------- canlı ayarlar (herkes okur) ----------
export const settings = { crossTable: true };
const listeners = new Set();
export function onSettings(fn) { listeners.add(fn); return () => listeners.delete(fn); }
let watching = false;
export function watchSettings() {
  if (watching) return;
  watching = true;
  onValue(ref(db, "settings"), (s) => {
    const v = s.val() || {};
    settings.crossTable = v.crossTable !== false;
    listeners.forEach((fn) => { try { fn(settings); } catch (e) { console.warn(e); } });
  }, () => { watching = false; });
}

// Yasaklı mı? (giriş sırasında kontrol edilir)
export async function banOf(hk) {
  const s = await get(ref(db, `bans/${hk}`)).catch(() => null);
  return s?.val() || null;
}

const fmt = (ts) => (ts ? new Date(ts).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const ago = (ts) => {
  if (!ts) return "—";
  const m = Math.round((serverNow() - ts) / 60000);
  return m < 1 ? "şimdi" : m < 60 ? `${m} dk önce` : m < 1440 ? `${Math.round(m / 60)} sa önce` : `${Math.round(m / 1440)} gün önce`;
};
const confirmBox = (title, text, okLabel = "Evet", danger = false) => new Promise((resolve) => {
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = `<div class="card center"><h2>${title}</h2><p class="muted" style="margin-top:.5rem">${text}</p>
    <div class="stack" style="margin-top:1rem"><button class="btn ${danger ? "danger" : "primary"} block" data-ok="1">${okLabel}</button><button class="btn block" data-ok="">Vazgeç</button></div></div>`;
  m.onclick = (e) => { const b = e.target.closest("button"); if (!b && e.target !== m) return; m.remove(); resolve(!!b?.dataset.ok); };
  document.body.appendChild(m);
});

const TABS = [["musteri", "👤 Müşteri"], ["sikayet", "🚩 Şikayet"], ["oda", "🎲 Odalar"], ["ayar", "⚙️ Ayarlar"]];
let tab = "musteri", focusHk = null;

export function openAdmin(startTab, hk) {
  if (!access.admin) return;
  if (startTab) tab = startTab;
  if (hk !== undefined) focusHk = hk;
  clearSubs();
  window.scrollTo({ top: 0 });
  app.innerHTML = `
    <section class="adm">
      <div class="adm-top"><button class="btn" id="admBack">← Geri</button><h2>🛠 Yönetim</h2></div>
      <div class="seg" id="admTabs">${TABS.map(([id, l]) => `<button data-t="${id}" class="${tab === id ? "on" : ""}">${l}</button>`).join("")}</div>
      <div id="admBody"><p class="muted center">Yükleniyor…</p></div>
    </section>`;
  document.getElementById("admBack").onclick = () => renderHome();
  app.querySelectorAll("#admTabs [data-t]").forEach((b) => b.onclick = () => openAdmin(b.dataset.t));
  const body = document.getElementById("admBody");
  ({ musteri: renderCustomers, sikayet: renderReports, oda: renderRooms, ayar: renderSettings })[tab](body)
    .catch((e) => { console.error(e); body.innerHTML = `<p class="center muted">Yüklenemedi. Firebase kuralları güncel mi?<br><small>${esc(e.message || "")}</small></p>`; });
}

// ---------- 👤 Müşteri ----------
async function renderCustomers(body) {
  const [ps, bs, as] = await Promise.all([get(ref(db, "players")), get(ref(db, "bans")).catch(() => null), get(ref(db, "admins"))]);
  const players = Object.entries(ps.val() || {}).map(([k, p]) => ({ k, ...p }));
  const bans = bs?.val() || {}, admins = as.val() || {};
  body.innerHTML = `
    <div class="card">
      <form id="srch" class="adm-search"><input id="q" placeholder="Instagram adı ya da takma ad" autocapitalize="none" spellcheck="false" value="${esc(focusHk ? focusHk.replace(/,/g, ".") : "")}"><button class="btn primary">Ara</button></form>
      <p class="muted small" style="margin-top:.4rem">Toplam ${players.length} kayıtlı müşteri · ${Object.keys(bans).length} engelli</p>
      <ul class="list adm-list" id="res"></ul>
    </div>
    <div id="detail"></div>`;
  const res = document.getElementById("res");
  const show = (q) => {
    q = q.trim().toLowerCase().replace(/^@/, "");
    const rows = (q ? players.filter((p) => p.handle?.includes(q) || (p.nick || "").toLowerCase().includes(q)) : [...players].sort((a, b) => (b.lastVisit || b.createdAt || 0) - (a.lastVisit || a.createdAt || 0))).slice(0, 25);
    res.innerHTML = rows.length ? rows.map((p) => `<li><button class="adm-row" data-k="${esc(p.k)}"><span class="name">${levelOf(p.visits || 0).cur.emoji} @${esc(p.handle)}${admins[p.k] ? " 🔑" : ""}${bans[p.k] ? " ⛔" : ""}</span><small>${esc(p.nick || "")} · ${p.visits || 0} ziyaret</small></button></li>`).join("")
      : `<li class="muted">Bulunamadı.</li>`;
    res.querySelectorAll("[data-k]").forEach((b) => b.onclick = () => detail(b.dataset.k));
  };
  document.getElementById("srch").onsubmit = (e) => { e.preventDefault(); show(document.getElementById("q").value); };
  show(document.getElementById("q").value);
  if (focusHk && players.some((p) => p.k === focusHk)) detail(focusHk);

  function detail(k) {
    focusHk = k;
    const p = players.find((x) => x.k === k);
    const el = document.getElementById("detail");
    if (!p) { el.innerHTML = ""; return; }
    const isAdm = !!admins[k], ban = bans[k], self = k === state.hk;
    el.innerHTML = `
      <div class="card adm-detail">
        <p class="eyebrow">Müşteri</p>
        <h2>@${esc(p.handle)}</h2>
        <p class="muted small">Takma ad: <b>${esc(p.nick || "—")}</b> · ${levelOf(p.visits || 0).cur.emoji} ${esc(levelOf(p.visits || 0).cur.name)}${isAdm ? " · 🔑 yönetici" : ""}</p>
        <div class="stats" style="margin-top:.8rem">
          <div><strong>${p.visits || 0}</strong><span>Ziyaret</span></div>
          <div><strong>${p.points || 0}</strong><span>Puan</span></div>
          <div><strong>${p.weekPts || 0}</strong><span>Hafta</span></div>
        </div>
        <p class="muted small" style="margin-top:.6rem">Kayıt: ${fmt(p.createdAt)} · Son ziyaret: ${ago(p.lastVisit)}</p>
        ${ban ? `<p class="adm-ban">⛔ Engelli · ${ago(ban.at)} · @${esc((ban.by || "").replace(/,/g, "."))}${ban.reason ? `<br><small>${esc(ban.reason)}</small>` : ""}</p>` : ""}
        <div class="stack" style="margin-top:1rem">
          <button class="btn primary block" data-a="pin">🔄 PIN sıfırla</button>
          <p class="muted small">PIN'ini unutan müşteri için. Sıfırladıktan sonra müşteri <b>hemen</b> aynı Instagram adıyla yeni bir PIN girerek giriş yapar; puanları ve ziyaretleri kaybolmaz.</p>
          ${self ? "" : `<button class="btn block" data-a="ban">${ban ? "✅ Engeli kaldır" : "⛔ Engelle"}</button>`}
          ${self ? "" : `<button class="btn block" data-a="adm">${isAdm ? "Yöneticilikten çıkar" : "🔑 Yönetici yap"}</button>`}
          ${self ? "" : `<button class="btn danger block" data-a="del">🗑 Hesabı sil (KVKK talebi)</button>`}
        </div>
      </div>`;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.querySelectorAll("[data-a]").forEach((b) => b.onclick = async () => {
      const a = b.dataset.a;
      try {
        if (a === "pin") {
          if (!(await confirmBox("PIN sıfırlansın mı?", `@${esc(p.handle)} bütün telefonlardan çıkış yapacak. Müşteri yanındayken yap: aynı adla yeni PIN girerek hemen giriş yapsın.`, "Sıfırla"))) return;
          await update(ref(db), { [`pins/${k}`]: null, [`links/${k}`]: null });
          toast("PIN sıfırlandı. Müşteri şimdi yeni PIN'le giriş yapabilir.");
        } else if (a === "ban") {
          if (ban) { await remove(ref(db, `bans/${k}`)); toast("Engel kaldırıldı."); }
          else {
            const reason = await askReason();
            if (reason === null) return;
            await set(ref(db, `bans/${k}`), { at: serverTimestamp(), by: state.hk, ...(reason ? { reason } : {}) });
            toast("Engellendi: oyunlara katılamaz, oda açamaz.");
          }
        } else if (a === "adm") {
          if (isAdm) { if (!(await confirmBox("Yöneticilikten çıkarılsın mı?", `@${esc(p.handle)} artık paneli göremez.`, "Çıkar"))) return; await remove(ref(db, `admins/${k}`)); }
          else { if (!(await confirmBox("Yönetici yapılsın mı?", `@${esc(p.handle)} bu paneldeki her şeyi yapabilecek (PIN sıfırlama, engelleme, gece kodu…). Sadece güvendiğin personel için.`, "Yönetici yap"))) return; await set(ref(db, `admins/${k}`), true); }
          toast("Kaydedildi.");
        } else if (a === "del") {
          if (!(await confirmBox("Hesap kalıcı olarak silinsin mi?", `@${esc(p.handle)} adlı hesabın puanları, ziyaretleri ve bütün bilgileri silinir. Geri alınamaz.`, "Kalıcı olarak sil", true))) return;
          await update(ref(db), { [`pins/${k}`]: null, [`links/${k}`]: null, [`blocks/${k}`]: null, [`admins/${k}`]: null });
          await remove(ref(db, `players/${k}`));
          focusHk = null;
          toast("Hesap silindi.");
        }
        openAdmin("musteri");
      } catch (e) { console.error(e); toast("Yapılamadı: yetki yok ya da bağlantı sorunu."); }
    });
  }
}

const askReason = () => new Promise((resolve) => {
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = `<form class="card stack"><h2>Engelleme nedeni</h2><p class="muted small">İsteğe bağlı, sadece yöneticiler görür.</p>
    <input id="why" maxlength="200" placeholder="ör. diğer masaları rahatsız etti">
    <button class="btn danger block">Engelle</button><button class="btn block" type="button" id="no">Vazgeç</button></form>`;
  m.querySelector("form").onsubmit = (e) => { e.preventDefault(); const v = m.querySelector("#why").value.trim().slice(0, 200); m.remove(); resolve(v); };
  m.querySelector("#no").onclick = () => { m.remove(); resolve(null); };
  document.body.appendChild(m);
  m.querySelector("#why").focus();
});

// ---------- 🚩 Şikayetler ----------
async function renderReports(body) {
  const s = await get(ref(db, "reports"));
  const rows = Object.entries(s.val() || {}).map(([id, r]) => ({ id, ...r })).sort((a, b) => (b.at || 0) - (a.at || 0));
  const h = (k) => "@" + esc(String(k || "?").replace(/,/g, "."));
  const count = {};
  rows.forEach((r) => { count[r.target] = (count[r.target] || 0) + 1; });
  body.innerHTML = `<div class="card">
    <p class="muted small">${rows.length ? `${rows.length} açık şikayet. İnceledikten sonra "Kapat"a bas.` : ""}</p>
    ${rows.length ? `<ul class="list adm-list">${rows.map((r) => `<li class="adm-rep">
        <div><b>${h(r.target)}</b>${count[r.target] > 1 ? ` <span class="adm-badge">${count[r.target]} şikayet</span>` : ""}<br>
        <small>${h(r.by)} şikayet etti · ${ago(r.at)}${r.room ? ` · oda ${esc(r.room)}` : ""}</small>
        ${r.reason ? `<p class="small">“${esc(r.reason)}”</p>` : ""}</div>
        <div class="adm-acts"><button class="btn" data-see="${esc(r.target)}">İncele</button><button class="btn" data-close="${esc(r.id)}">Kapat</button></div>
      </li>`).join("")}</ul>` : `<p class="center muted" style="padding:1rem 0">Şikayet yok 🎉</p>`}
  </div>`;
  body.querySelectorAll("[data-see]").forEach((b) => b.onclick = () => openAdmin("musteri", b.dataset.see));
  body.querySelectorAll("[data-close]").forEach((b) => b.onclick = async () => {
    try { await remove(ref(db, `reports/${b.dataset.close}`)); openAdmin("sikayet"); } catch { toast("Kapatılamadı."); }
  });
}

// ---------- 🎲 Odalar ----------
const OLD_H = 6;
async function renderRooms(body) {
  const s = await get(ref(db, "rooms"));
  const all = Object.entries(s.val() || {}).map(([code, r]) => ({ code, ...r }));
  const cutoff = serverNow() - OLD_H * 3600000;
  const active = all.filter((r) => (r.state === "lobby" || r.state === "play") && (r.createdAt || 0) > cutoff).sort((a, b) => b.createdAt - a.createdAt);
  const old = all.filter((r) => !((r.state === "lobby" || r.state === "play") && (r.createdAt || 0) > cutoff));
  const stLabel = { lobby: "⏳ lobide", play: "▶️ oynanıyor" };
  body.innerHTML = `<div class="card">
    <h3>Açık odalar (${active.length})</h3>
    ${active.length ? `<ul class="list adm-list">${active.map((r) => { const g = gameOf(r.game); const ps = Object.values(r.players || {}).map((p) => esc(p.name)).join(", "); return `<li class="adm-rep">
        <div><b>${g ? g.emoji + " " + esc(g.name) : esc(r.game)}</b> · <code>${esc(r.code)}</code> ${r.visibility === "public" ? "🌐" : "🔒"}<br>
        <small>${stLabel[r.state]} · ${ago(r.createdAt)} · kuran ${esc(r.host || "")}</small><br><small class="muted">${ps}</small></div>
        <div class="adm-acts"><button class="btn" data-shut="${esc(r.code)}">Kapat</button></div></li>`; }).join("")}</ul>` : `<p class="muted">Şu an açık oda yok.</p>`}
    <hr>
    <p class="muted small">${old.length} biten ya da ${OLD_H} saatten eski oda veritabanında duruyor.</p>
    <button class="btn block" id="clean" ${old.length ? "" : "disabled"}>🧹 Eski odaları temizle</button>
  </div>`;
  body.querySelectorAll("[data-shut]").forEach((b) => b.onclick = async () => {
    if (!(await confirmBox("Oda kapatılsın mı?", "İçindeki oyuncular ana sayfaya döner.", "Kapat"))) return;
    try { await update(ref(db, `rooms/${b.dataset.shut}`), { state: "closed" }); toast("Oda kapatıldı."); openAdmin("oda"); } catch { toast("Kapatılamadı."); }
  });
  const clean = document.getElementById("clean");
  clean.onclick = async () => {
    clean.disabled = true;
    try {
      const patch = Object.fromEntries(old.map((r) => [`rooms/${r.code}`, null]));
      await update(ref(db), patch);
      toast(`${old.length} oda temizlendi.`);
      openAdmin("oda");
    } catch (e) { console.error(e); toast("Temizlenemedi."); clean.disabled = false; }
  };
}

// ---------- ⚙️ Ayarlar ----------
async function renderSettings(body) {
  const [as, ps] = await Promise.all([get(ref(db, "admins")), get(ref(db, "settings"))]);
  const admins = Object.keys(as.val() || {});
  const cross = (ps.val() || {}).crossTable !== false;
  body.innerHTML = `
    <div class="card">
      <h3>Masalar arası oyun</h3>
      <p class="muted small">Kapalıyken herkes sadece kendi masasıyla (oda koduyla) oynar: açık oda listesi, "diğer masalar katılsın" ve meydan okuma davetleri gizlenir. Kalabalık ya da sorunlu gecelerde kapat.</p>
      <label class="adm-switch"><input type="checkbox" id="cross" ${cross ? "checked" : ""}><span></span><b>${cross ? "Açık" : "Kapalı"}</b></label>
    </div>
    <div class="card">
      <h3>Yöneticiler / personel</h3>
      <p class="muted small">Yönetici eklemek için Müşteri sekmesinde kişiyi bulup "Yönetici yap"a bas.</p>
      <ul class="list adm-list">${admins.map((k) => `<li><button class="adm-row" data-k="${esc(k)}"><span class="name">🔑 @${esc(k.replace(/,/g, "."))}${k === state.hk ? " (sen)" : ""}</span></button></li>`).join("")}</ul>
    </div>`;
  document.getElementById("cross").onchange = async (e) => {
    try { await set(ref(db, "settings/crossTable"), e.target.checked); toast(e.target.checked ? "Masalar arası oyun açıldı 🌐" : "Masalar arası oyun kapatıldı 🔒"); openAdmin("ayar"); }
    catch { toast("Kaydedilemedi. Firebase kuralları güncel mi?"); e.target.checked = !e.target.checked; }
  };
  body.querySelectorAll("[data-k]").forEach((b) => b.onclick = () => openAdmin("musteri", b.dataset.k));
}

