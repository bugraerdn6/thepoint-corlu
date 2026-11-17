// 🎭 Sessiz Sinema — takımlar sırayla oynar; oyuncu konuşmadan hareketlerle anlatır, takım arkadaşları sesli tahmin eder.
// Telefon sadece anlatılacak şeyi ve süreyi gösterir; asıl oyun masada.
import { shuffle } from "./quiz.js";
import { sfx, buzz, unlock } from "../sound.js";
import { burst } from "./cards.js";

const TURN_MS = 75000;
const BETWEEN_MS = 6000;
const TEAM_LABEL = { A: "🔵 Mavi", B: "🟠 Turuncu" };
const other = (t) => (t === "A" ? "B" : "A");

// [kategori, anlatılacak]
export const SESSIZ = [
  ...["Titanik", "Hababam Sınıfı", "Aslan Kral", "Babam ve Oğlum", "Yüzüklerin Efendisi", "Karayip Korsanları", "Örümcek Adam", "Kayıp Balık Nemo", "Eşkıya", "G.O.R.A.",
    "Vizontele", "Harry Potter", "Rocky", "Matrix", "Jurassic Park", "Buz Devri", "Shrek", "Forrest Gump", "Gladyatör", "Yahşi Batı", "Arabalar", "Karlar Ülkesi",
    "Hızlı ve Öfkeli", "Yıldızlararası", "Kung Fu Panda"].map((x) => ["🎬 Film", x]),
  ...["Kurtlar Vadisi", "Leyla ile Mecnun", "Avrupa Yakası", "Muhteşem Yüzyıl", "Ezel", "Behzat Ç.", "Yaprak Dökümü", "La Casa de Papel", "Breaking Bad", "Game of Thrones", "Friends", "Squid Game"].map((x) => ["📺 Dizi", x]),
  ...["Şımarık", "Kuzu Kuzu", "Gülpembe", "Arkadaşım Eşek", "Bir Derdim Var", "Hadi Bakalım", "Dönence"].map((x) => ["🎵 Şarkı", x]),
  ...["Damlaya damlaya göl olur", "Ağaç yaşken eğilir", "Sakla samanı gelir zamanı", "Üzüm üzüme baka baka kararır", "Bir elin nesi var iki elin sesi var", "Erken kalkan yol alır",
    "Dost kara günde belli olur", "Acele işe şeytan karışır", "Ayağını yorganına göre uzat", "Komşu komşunun külüne muhtaçtır"].map((x) => ["📜 Atasözü", x]),
  ...["Dişçi", "Pilot", "Aşçı", "Berber", "İtfaiyeci", "Fotoğrafçı", "Garson", "Barmen", "Cerrah", "Bahçıvan", "Kaptan", "Hakem"].map((x) => ["👔 Meslek", x]),
  ...["Penguen", "Kanguru", "Zürafa", "Ahtapot", "Maymun", "Tavşan", "Fil", "Yılan", "Kartal", "Yengeç"].map((x) => ["🐾 Hayvan", x])
];

const words = (s) => s.split(/\s+/).filter(Boolean).length;

// Bu turda oynayanın sonuçları: her kart için oynayanın ilk girdisi
export function resolveTurn(room, turn) {
  const g = room.g;
  const d = g.order[turn];
  const out = [];
  for (let n = 0; n < 80; n++) {
    const v = room.in?.[`t${turn}c${n}`]?.[d.k];
    if (!v || (v.r !== "ok" && v.r !== "pas")) break;
    out.push(v.r);
  }
  return out;
}

function teamScores(room) {
  const s = { A: 0, B: 0 };
  const g = room.g;
  if (!g?.order) return s;
  const last = g.phase === "turn" ? g.turn : g.turn - 1;
  for (let t = 0; t <= Math.min(last, g.order.length - 1); t++) s[g.order[t].team] += resolveTurn(room, t).filter((r) => r === "ok").length;
  return s;
}

function buildOrder(players) {
  const byTeam = { A: players.filter((p) => p.team === "A"), B: players.filter((p) => p.team === "B") };
  const turns = Math.max(4, Math.min(8, Math.max(byTeam.A.length, byTeam.B.length) * 2)); // herkes en az bir kez oynasın
  const first = Math.random() < 0.5 ? "A" : "B";
  const order = [];
  const idx = { A: 0, B: 0 };
  for (let i = 0; i < turns; i++) {
    const team = i % 2 === 0 ? first : other(first);
    const list = byTeam[team];
    order.push({ team, k: list[idx[team]++ % list.length].k });
  }
  return order;
}

export default {
  id: "sessiz", name: "Sessiz Sinema", emoji: "🎭", teams: true,
  desc: "4–12 kişi · Konuşmadan anlat, takımın bilsin",
  rules: `İki takım. Sırası gelen oyuncu telefonunda film, dizi, şarkı, atasözü, meslek ya da hayvan görür ve <b>hiç konuşmadan, sadece hareketlerle</b> anlatır. Takım arkadaşları <b>sesli</b> tahmin eder. Bilince ✅ (+1), zorsa ⏭ pas. Her tur ${TURN_MS / 1000} sn, en çok bilen takım kazanır.`,
  minPlayers: 4, maxPlayers: 12, soloTest: false,

  start(c) {
    const deck = shuffle(SESSIZ).map(([cat, w]) => ({ cat, w }));
    return { phase: "between", turn: 0, order: buildOrder(c.players), deck, base: 0, endAt: Math.round(c.now() + BETWEEN_MS) };
  },

  render(c) {
    const { g, local } = c;
    const app = document.getElementById("app");
    c.hideArena();
    const d = g.order[g.turn];
    const actor = c.room.players?.[d?.k]?.name || "?";
    const myTeam = c.room.players?.[c.me]?.team;
    const sc = teamScores(c.room);
    const scoreBar = `<div class="row" style="justify-content:center;gap:1rem;margin-top:.3rem">
      <span class="level-chip">${TEAM_LABEL.A}: <b>${sc.A}</b></span><span class="level-chip">${TEAM_LABEL.B}: <b>${sc.B}</b></span></div>`;

    if (g.phase === "between") {
      const last = g.turn > 0 ? resolveTurn(c.room, g.turn - 1) : null;
      app.innerHTML = `
        <section class="card center ss">
          <p class="eyebrow">🎭 Sessiz Sinema · Tur ${g.turn + 1}/${g.order.length}</p>
          ${scoreBar}
          ${last ? `<p class="muted" style="margin-top:.8rem">Geçen tur: ✅ ${last.filter((r) => r === "ok").length} · ⏭ ${last.filter((r) => r === "pas").length}</p>` : ""}
          <div class="ss-next"><span class="ss-mask">🎭</span><h2>Sıradaki</h2>
          <p class="big-result">${TEAM_LABEL[d.team]} · ${c.esc(actor)}${d.k === c.me ? " (SEN!)" : ""}</p></div>
          <p class="muted small">${d.k === c.me ? "Ekranını kimseye gösterme, konuşmak yasak! 🤫" : myTeam === d.team ? "Hazır ol, bağırarak tahmin edeceksin!" : "Rakip anlatırken sen de görebileceksin 👀"}</p>
        </section>`;
      return;
    }

    const results = resolveTurn(c.room, g.turn);
    const n = results.length;
    const card = g.deck[(g.base + n) % g.deck.length];
    const key = `t${g.turn}c${n}`;
    const iWrote = !!c.inputs[key]?.[c.me] || local.wrote === key;
    const role = d.k === c.me ? "actor" : myTeam === d.team ? "guess" : "watch";
    const okCount = results.filter((r) => r === "ok").length;
    // yeni bilinen → kısa kutlama
    if (local.lastOk !== `${g.turn}:${okCount}`) {
      if (local.lastOk && local.lastOk.startsWith(`${g.turn}:`) && okCount > 0) { burst(document.querySelector(".ss") || app, "BİLDİLER! ✅", "green"); sfx.turn(); buzz(30); }
      local.lastOk = `${g.turn}:${okCount}`;
    }

    app.innerHTML = `
      <section class="card center ss">
        <p class="eyebrow">🎭 ${TEAM_LABEL[d.team]} oynuyor · ${c.esc(actor)}</p>
        <div class="cd"><i id="cdbar"></i></div>
        ${scoreBar}
        ${role === "guess"
          ? `<div class="ss-guess"><span class="ss-mask big">🎭</span><h2>Tahmin et! 🗣️</h2><p class="muted">${c.esc(actor)} konuşmadan anlatıyor.</p>
             <p class="ss-hint">${card.cat} · ${words(card.w)} kelime</p><p class="big-result">Bu tur ✅ ${okCount}</p></div>`
          : `<div class="ss-card ${role}">
              <span class="ss-cat">${card.cat}</span>
              <b class="ss-word">${c.esc(card.w)}</b>
              <span class="ss-wc">${words(card.w)} kelime</span>
            </div>
            ${role === "actor" ? `<p class="muted small">🤫 Konuşmak yok! Sadece hareket.</p>` : `<p class="muted small">Rakip takım anlatıyor, sen sadece izle 👀</p>`}`}
        ${role === "actor" ? `
          <div class="row" style="margin-top:1rem">
            <button class="btn grow" data-r="pas" ${iWrote ? "disabled" : ""}>⏭ Pas</button>
            <button class="btn primary grow ss-ok" data-r="ok" ${iWrote ? "disabled" : ""}>✅ Bildiler</button>
          </div>` : ""}
      </section>`;
    app.querySelectorAll("[data-r]").forEach((b) => b.onclick = () => {
      if (local.wrote === key) return;
      unlock();
      local.wrote = key;
      c.input(key, { r: b.dataset.r, at: Math.round(c.now()) });
      app.querySelectorAll("[data-r]").forEach((x) => { x.disabled = true; });
      buzz(b.dataset.r === "ok" ? 25 : 10);
    });

    const setBar = () => {
      const bar = document.getElementById("cdbar");
      const left = Math.max(0, g.endAt - c.now());
      if (bar) { bar.style.width = (left / TURN_MS) * 100 + "%"; bar.parentElement.classList.toggle("hurry", left < 10000); }
    };
    setBar();
    if (local.cdTurn !== g.turn) {
      local.cdTurn = g.turn;
      const tick = () => {
        if (c.room.g?.phase !== "turn" || c.room.g?.turn !== g.turn) return;
        setBar();
        if (g.endAt - c.now() > 0) c.timer(tick, 250);
      };
      tick();
    }
  },

  hostTick(c) {
    const { g } = c;
    if (c.now() < g.endAt) return;
    c.advance(async () => {
      if (g.phase === "between") {
        await c.setG({ phase: "turn", endAt: Math.round(c.now() + TURN_MS) });
      } else {
        const used = resolveTurn(c.room, g.turn).length + 1;
        if (g.turn + 1 < g.order.length) await c.setG({ phase: "between", turn: g.turn + 1, base: g.base + used, endAt: Math.round(c.now() + BETWEEN_MS) });
        else await c.finish();
      }
    });
  },

  results(room) {
    const g = room.g;
    const s = { A: 0, B: 0 };
    (g?.order || []).forEach((o, t) => { s[o.team] += resolveTurn(room, t).filter((r) => r === "ok").length; });
    return Object.entries(room.players || {})
      .map(([k, p]) => ({ k, score: p.team ? s[p.team] : -99, label: `${TEAM_LABEL[p.team] || ""} ${p.team ? s[p.team] : 0}` }))
      .sort((a, b) => b.score - a.score);
  }
};
