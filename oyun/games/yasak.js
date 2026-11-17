// 🚫 Yasak Kelime — takımlar sırayla anlatır, takım arkadaşları sesli tahmin eder, rakipler yasak kelimeyi yakalar.
import { YASAK } from "./banks.js";
import { shuffle } from "./quiz.js";

const TURN_MS = 60000;
const BETWEEN_MS = 6000;
const TURNS = 4; // Mavi, Turuncu, Mavi, Turuncu
const TEAM_LABEL = { A: "🔵 Mavi", B: "🟠 Turuncu" };
const other = (t) => (t === "A" ? "B" : "A");

// Bir turdaki kart sonuçlarını sırayla çöz: her kart için ilk geçerli girdi (en erken) kazanır
function resolveTurn(room, turn) {
  const g = room.g;
  const d = g.order[turn];
  const out = [];
  for (let n = 0; n < 60; n++) {
    const entries = Object.entries(room.in?.[`t${turn}c${n}`] || {}).filter(([k, v]) => {
      if (k === d.k) return v.r === "ok" || v.r === "pas";
      return v.r === "tabu" && room.players?.[k]?.team === other(d.team);
    });
    if (!entries.length) break;
    entries.sort((a, b) => a[1].at - b[1].at);
    out.push(entries[0][1].r);
  }
  return out;
}

function teamScores(room) {
  const s = { A: 0, B: 0 };
  const g = room.g;
  if (!g?.order) return s;
  const last = g.phase === "turn" ? g.turn : g.turn - 1;
  for (let t = 0; t <= Math.min(last, g.order.length - 1); t++) {
    const team = g.order[t].team;
    for (const r of resolveTurn(room, t)) s[team] += r === "ok" ? 1 : r === "tabu" ? -1 : 0;
  }
  return s;
}

function buildOrder(players) {
  const byTeam = { A: players.filter((p) => p.team === "A"), B: players.filter((p) => p.team === "B") };
  const first = Math.random() < 0.5 ? "A" : "B";
  const order = [];
  const idx = { A: 0, B: 0 };
  for (let i = 0; i < TURNS; i++) {
    const team = i % 2 === 0 ? first : other(first);
    const list = byTeam[team];
    const p = list[idx[team]++ % list.length];
    order.push({ team, k: p.k });
  }
  return order;
}

export default {
  id: "yasak", name: "Yasak Kelime", emoji: "🚫", teams: true,
  desc: "4–12 kişi · İki takım, anlat ama yasak kelimeleri söyleme",
  rules: `İki takım. Sırası gelen anlatıcı kartı görür ve kelimeyi <b>yasak kelimeleri söylemeden</b> anlatır, takım arkadaşları <b>sesli</b> tahmin eder. Bilinince anlatıcı ✅'e basar (+1), zorsa ⏭ pas geçer. Rakip takım da kartı görür: yasak kelime söylenirse ❌'e basar (−1). ${TURNS} tur, her tur ${TURN_MS / 1000} sn.`,
  minPlayers: 4, maxPlayers: 12, soloTest: false,

  start(c) {
    const deck = shuffle(YASAK).slice(0, 45).map(([w, ...f]) => ({ w, f }));
    return { phase: "between", turn: 0, order: buildOrder(c.players), deck, base: 0, endAt: Math.round(c.now() + BETWEEN_MS) };
  },

  render(c) {
    const { g, local } = c;
    const app = document.getElementById("app");
    c.hideArena();
    const d = g.order[g.turn];
    const describer = c.room.players?.[d?.k]?.name || "?";
    const myTeam = c.room.players?.[c.me]?.team;
    const sc = teamScores(c.room);
    const scoreBar = `<div class="row" style="justify-content:center;gap:1rem;margin-top:.3rem">
      <span class="level-chip">${TEAM_LABEL.A}: <b>${sc.A}</b></span><span class="level-chip">${TEAM_LABEL.B}: <b>${sc.B}</b></span></div>`;

    if (g.phase === "between") {
      const last = g.turn > 0 ? resolveTurn(c.room, g.turn - 1) : null;
      app.innerHTML = `
        <section class="card center">
          <p class="eyebrow">🚫 Yasak Kelime · Tur ${g.turn + 1}/${g.order.length}</p>
          ${scoreBar}
          ${last ? `<p class="muted" style="margin-top:.8rem">Geçen tur: ✅ ${last.filter((r) => r === "ok").length} · ❌ ${last.filter((r) => r === "tabu").length} · ⏭ ${last.filter((r) => r === "pas").length}</p>` : ""}
          <h2 style="margin-top:1rem">Sıradaki anlatıcı</h2>
          <p class="big-result">${TEAM_LABEL[d.team]} · ${c.esc(describer)}${d.k === c.me ? " (SEN!)" : ""}</p>
          <p class="muted small">${d.k === c.me ? "Telefonunu takım arkadaşlarına gösterme 😉" : myTeam === d.team ? "Kulaklarını aç, tahmin etmeye hazırlan!" : "Kartı sen de göreceksin: yasak kelimeyi yakala!"}</p>
        </section>`;
      return;
    }

    // tur sürüyor
    const results = resolveTurn(c.room, g.turn);
    const n = results.length;
    const card = g.deck[(g.base + n) % g.deck.length];
    const key = `t${g.turn}c${n}`;
    const iWrote = !!c.inputs[key]?.[c.me] || local.wrote === key;
    const role = d.k === c.me ? "desc" : myTeam === d.team ? "guess" : "police";
    const cardHtml = `
      <div class="taboo">
        <div class="taboo-word">${c.esc(card.w)}</div>
        <ul>${card.f.map((f) => `<li>${c.esc(f)}</li>`).join("")}</ul>
      </div>`;

    app.innerHTML = `
      <section class="card center">
        <p class="eyebrow">🚫 ${TEAM_LABEL[d.team]} anlatıyor · ${c.esc(describer)}</p>
        <div class="cd"><i id="cdbar"></i></div>
        ${scoreBar}
        ${role === "guess"
          ? `<h2 style="margin-top:1.2rem">Tahmin et! 🗣️</h2><p class="muted">${c.esc(describer)} anlatıyor, sesli söyle.</p><p class="big-result">Bu tur ✅ ${results.filter((r) => r === "ok").length}</p>`
          : cardHtml}
        ${role === "desc" ? `
          <div class="row" style="margin-top:1rem">
            <button class="btn grow" data-r="pas" ${iWrote ? "disabled" : ""}>⏭ Pas</button>
            <button class="btn primary grow" data-r="ok" ${iWrote ? "disabled" : ""}>✅ Doğru</button>
          </div>` : ""}
        ${role === "police" ? `<button class="btn block buzz" data-r="tabu" style="margin-top:1rem" ${iWrote ? "disabled" : ""}>❌ YASAK! (söyledi)</button>` : ""}
      </section>`;
    app.querySelectorAll("[data-r]").forEach((b) => b.onclick = () => {
      if (local.wrote === key) return;
      local.wrote = key;
      c.input(key, { r: b.dataset.r, at: Math.round(c.now()) });
      app.querySelectorAll("[data-r]").forEach((x) => { x.disabled = true; });
    });

    if (local.cdTurn !== g.turn) {
      local.cdTurn = g.turn;
      const tick = () => {
        const bar = document.getElementById("cdbar");
        if (c.room.g?.phase !== "turn" || c.room.g?.turn !== g.turn) return;
        if (bar) bar.style.width = Math.max(0, (g.endAt - c.now()) / TURN_MS) * 100 + "%";
        if (g.endAt - c.now() > 0) c.timer(tick, 200);
      };
      tick();
    } else {
      const bar = document.getElementById("cdbar");
      if (bar) bar.style.width = Math.max(0, (g.endAt - c.now()) / TURN_MS) * 100 + "%";
    }
  },

  hostTick(c) {
    const { g } = c;
    if (c.now() < g.endAt) return;
    c.advance(async () => {
      if (g.phase === "between") {
        await c.setG({ phase: "turn", endAt: Math.round(c.now() + TURN_MS) });
      } else {
        const used = resolveTurn(c.room, g.turn).length + 1; // eldeki kart da harcanır
        if (g.turn + 1 < g.order.length) await c.setG({ phase: "between", turn: g.turn + 1, base: g.base + used, endAt: Math.round(c.now() + BETWEEN_MS) });
        else await c.finish();
      }
    });
  },

  results(room) {
    const g = room.g;
    const s = { A: 0, B: 0 };
    (g?.order || []).forEach((o, t) => { for (const r of resolveTurn(room, t)) s[o.team] += r === "ok" ? 1 : r === "tabu" ? -1 : 0; });
    return Object.entries(room.players || {})
      .map(([k, p]) => ({ k, score: p.team ? s[p.team] : -99, label: `${TEAM_LABEL[p.team] || ""} ${p.team ? s[p.team] : 0}` }))
      .sort((a, b) => b.score - a.score);
  }
};
