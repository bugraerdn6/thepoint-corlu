// 📜 Hikaye Zinciri — herkes sırayla bir cümle ekler ama sadece bir önceki cümleyi görür.
// Sonunda hikaye okunur, en komik cümle oylanır.
import { checkText } from "../filter.js";
import { shuffle } from "./quiz.js";

const WRITE_MS = 50000;
const READ_PER_LINE_MS = 3500;
const VOTE_MS = 25000;
const MAXLEN = 120;

const OPENINGS = [
  "Bir cuma gecesi The Point'in kapısı açıldı ve içeri bir ördek girdi.",
  "Barmen kokteyli karıştırırken birden ışıklar söndü.",
  "O gece masadaki herkesin telefonuna aynı garip mesaj geldi.",
  "Çorlu'da sıradan bir salı akşamıydı, ta ki uzaylılar inene kadar.",
  "Kasadaki adam aslında 200 yıllık bir vampirdi.",
  "Garson tepsiyi düşürdü ve zaman durdu.",
  "Masanın altında eski bir hazine haritası bulduk.",
  "DJ ilk şarkıyı çaldığında herkes kontrolsüzce dans etmeye başladı.",
  "Ünlü bir şarkıcı kılık değiştirip bara geldi.",
  "Bütün burgerler bir anda konuşmaya başladı."
];

export default {
  id: "hikaye", name: "Hikaye Zinciri", emoji: "📜",
  desc: "3–8 kişi · Sırayla cümle ekle, sonunda oku",
  rules: "Hikaye bir başlangıç cümlesiyle açılır. Sırası gelen <b>sadece bir önceki cümleyi görür</b> ve bir cümle ekler. Herkes 2 kez yazar. Sonunda bütün hikaye okunur ve <b>en komik cümle oylanır</b>: aldığın her oy +100 puan. Uygunsuz kelime ve iletişim bilgisi yazılamaz.",
  minPlayers: 3, maxPlayers: 8, soloTest: false,

  start(c) {
    const order = shuffle(c.players.map((p) => p.k));
    const turns = order.length * 2;
    return { phase: "write", order, turns, n: 0, open: OPENINGS[Math.floor(Math.random() * OPENINGS.length)], endAt: Math.round(c.now() + WRITE_MS) };
  },

  render(c) {
    const { g, local } = c;
    const app = document.getElementById("app");
    c.hideArena();
    const name = (k) => c.esc(c.room.players?.[k]?.name || "?");
    const line = (i) => (i < 0 ? { t: g.open } : c.inputs[`s${i}`]?.[g.order[i % g.order.length]] || { t: "…" });

    if (g.phase === "write") {
      const writer = g.order[g.n % g.order.length];
      const prev = line(g.n - 1).t;
      if (writer !== c.me || local.sent === g.n) {
        local.formN = null;
        app.innerHTML = `
          <section class="card center">
            <p class="eyebrow">📜 Hikaye Zinciri · ${g.n + 1}/${g.turns}</p>
            <div class="cd"><i id="cdbar"></i></div>
            <h2 style="margin-top:1rem">${name(writer)} yazıyor… ✍️</h2>
            <p class="muted">Hikayenin tamamı en sonda okunacak.</p>
          </section>`;
      } else if (local.formN !== g.n) {
        local.formN = g.n;
        app.innerHTML = `
          <form class="card stack" id="hkForm">
            <p class="eyebrow">📜 Sıra sende · ${g.n + 1}/${g.turns}</p>
            <div class="cd"><i id="cdbar"></i></div>
            <p class="muted small">Önceki cümle:</p>
            <blockquote class="quote">${c.esc(prev)}</blockquote>
            <div class="field"><input id="hk" type="text" maxlength="${MAXLEN}" placeholder="Hikayeyi devam ettir…" autocomplete="off" required></div>
            <button class="btn primary block" type="submit">Ekle →</button>
            <p class="muted small center" id="hkMsg"></p>
          </form>`;
        document.getElementById("hk").focus();
        document.getElementById("hkForm").onsubmit = (e) => {
          e.preventDefault();
          const t = document.getElementById("hk").value.trim().replace(/\s+/g, " ");
          const msg = document.getElementById("hkMsg");
          if (t.length < 3) { msg.textContent = "Biraz daha yaz."; return; }
          const ch = checkText(t);
          if (!ch.ok) { msg.textContent = ch.reason; return; }
          local.sent = g.n;
          c.input(`s${g.n}`, { t });
          this.render(c);
        };
      }
      bar(c, `w${g.n}`, g.endAt, WRITE_MS);
      return;
    }

    const lines = [{ t: g.open, k: null }, ...Array.from({ length: g.turns }, (_, i) => ({ ...line(i), k: g.order[i % g.order.length], i }))];

    if (g.phase === "read") {
      const shown = Math.min(lines.length, 1 + Math.floor((c.now() - g.readAt) / READ_PER_LINE_MS));
      app.innerHTML = `
        <section class="card">
          <p class="eyebrow center">📜 Hikayemiz</p>
          <div class="story">${lines.slice(0, shown).map((l) => `<p>${c.esc(l.t)} ${l.k ? `<small>— ${name(l.k)}</small>` : ""}</p>`).join("")}</div>
        </section>`;
      if (shown < lines.length) c.timer(() => { if (c.room.g?.phase === "read") this.render(c); }, READ_PER_LINE_MS);
      return;
    }

    // oylama
    const votes = c.inputs.vote || {};
    const myVote = votes[c.me]?.i ?? local.vote;
    app.innerHTML = `
      <section class="card">
        <p class="eyebrow center">📜 En komik cümle hangisi?</p>
        <div class="cd"><i id="cdbar"></i></div>
        <div class="opts one" style="margin-top:.8rem">
          ${lines.slice(1).map((l) => `<button class="opt ${myVote === l.i ? "picked" : ""}" data-i="${l.i}" ${l.k === c.me || myVote !== undefined ? "disabled" : ""}>${c.esc(l.t)}${l.k === c.me ? " <small>(senin)</small>" : ""}</button>`).join("")}
        </div>
        <p class="muted small center" style="margin-top:.6rem">${Object.keys(votes).length}/${g.order.length} kişi oyladı · Kendi cümlene oy veremezsin</p>
      </section>`;
    app.querySelectorAll("[data-i]").forEach((b) => b.onclick = () => {
      if (local.vote !== undefined) return;
      local.vote = Number(b.dataset.i);
      c.input("vote", { i: local.vote });
      this.render(c);
    });
    bar(c, "vote", g.endAt, VOTE_MS);
  },

  hostTick(c) {
    const { g } = c;
    if (g.phase === "write") {
      const done = c.inputs[`s${g.n}`]?.[g.order[g.n % g.order.length]];
      if (!done && c.now() < g.endAt + 800) return;
      c.advance(() => g.n + 1 < g.turns
        ? c.setG({ n: g.n + 1, endAt: Math.round(c.now() + WRITE_MS) })
        : c.setG({ phase: "read", readAt: Math.round(c.now()) }));
      return;
    }
    if (g.phase === "read") {
      if (c.now() > g.readAt + (g.turns + 2) * READ_PER_LINE_MS + 2000) c.advance(() => c.setG({ phase: "vote", endAt: Math.round(c.now() + VOTE_MS) }));
      return;
    }
    if (g.phase === "vote") {
      const votes = c.inputs.vote || {};
      if (g.order.every((k) => votes[k]) || c.now() > g.endAt + 800) c.advance(() => c.finish());
    }
  },

  results(room) {
    const g = room.g;
    const pts = {};
    for (const [voter, v] of Object.entries(room.in?.vote || {})) {
      const author = g.order[v.i % g.order.length];
      if (author && author !== voter && room.in?.[`s${v.i}`]?.[author]) pts[author] = (pts[author] || 0) + 100;
    }
    return Object.keys(room.players || {}).map((k) => ({ k, score: pts[k] || 0, label: `${(pts[k] || 0) / 100} oy` })).sort((a, b) => b.score - a.score);
  }
};

function bar(c, id, endAt, total) {
  const set = () => { const b = document.getElementById("cdbar"); if (b) b.style.width = Math.max(0, (endAt - c.now()) / total) * 100 + "%"; };
  set();
  if (c.local.barId !== id) {
    c.local.barId = id;
    const tick = () => { if (c.local.barId !== id || c.room.state !== "play") return; set(); c.timer(tick, 250); };
    c.timer(tick, 250);
  }
}
