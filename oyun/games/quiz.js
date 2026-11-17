// Soru oyunları için ortak yapı: soru → şıklar → süre → cevap gösterimi → sonraki soru.
// Kademeli zorluk: her soru kendi süresini (tm) ve puan çarpanını (x) taşıyabilir.
// cfg: { id, name, emoji, desc, rules, minPlayers, maxPlayers, timeMs,
//        pick(c) → [{ o?: [şıklar], a?: doğru şık, tm?: süre ms, x?: çarpan,
//                     b?: true (harflere dokunarak kur), s?: harfler, ans?: doğru kelime, ...veri }],
//        prompt?(q, esc) → soru html'i (veriden, kaçışlanmış)
//        mode: "speed" (doğru + hızlı) | "majority" (çoğunluk) | "who" (en çok oy alan kişiyi bil),
//        reveal?(q, counts) → ek açıklama html }
const REVEAL_MS = 4500;
const LEAD_MS = 1200;

const TEAM_LABEL = { A: "🔵 Mavi", B: "🟠 Turuncu" };

export const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
export const sample = (arr, n) => shuffle(arr).slice(0, n);

// Kademe: 10 soruda 0–2 kolay, 3–6 orta, 7–9 zor
export const tierOf = (i, n) => (i < Math.round(n * 0.3) ? 0 : i < Math.round(n * 0.7) ? 1 : 2);

export function makeQuiz(cfg) {
  const mode = cfg.mode || "speed";
  // Veritabanında sadece düz veri durur; HTML her telefonda burada, kaçışlanarak üretilir.
  const prompt = (q, esc) => cfg.prompt ? cfg.prompt(q, esc) : esc(q.p ?? "");
  const tmOf = (q) => q.tm || cfg.timeMs;
  const isRight = (q, v) => (q.b ? v.w === q.ans : v.c === q.a);

  function roundPoints(q, answers) {
    const pts = {};
    const entries = Object.entries(answers || {});
    const x = q.x || 1;
    if (mode === "speed") {
      for (const [k, v] of entries) {
        if (isRight(q, v)) pts[k] = Math.round((100 + 100 * Math.max(0, 1 - v.t / tmOf(q))) * x);
      }
    } else {
      const counts = {};
      for (const [, v] of entries) counts[v.c] = (counts[v.c] || 0) + 1;
      const max = Math.max(0, ...Object.values(counts));
      if (max > 0) for (const [k, v] of entries) if (counts[v.c] === max) pts[k] = 100 * x;
    }
    return pts;
  }

  function totalsUpTo(room, upto) {
    const t = {};
    for (let i = 0; i <= upto; i++) {
      const p = roundPoints(room.g.qs[i], room.in?.[`q${i}`]);
      for (const [k, v] of Object.entries(p)) t[k] = (t[k] || 0) + v;
    }
    return t;
  }

  const badge = (q) => (q.x > 1 ? `<span class="x2">🔥 ${q.x}× puan</span>` : "");

  return {
    id: cfg.id, name: cfg.name, emoji: cfg.emoji, desc: cfg.desc, rules: cfg.rules, teams: !!cfg.teams,
    minPlayers: cfg.minPlayers ?? 2, maxPlayers: cfg.maxPlayers ?? 12, soloTest: cfg.soloTest ?? true,

    start(c) {
      const qs = cfg.pick(c);
      return { phase: "q", round: 0, qs, endAt: Math.round(c.now() + LEAD_MS + tmOf(qs[0])) };
    },

    render(c) {
      const { g, local } = c;
      const r = g.round;
      const q = g.qs[r];
      const tm = tmOf(q);
      const answers = c.inputs[`q${r}`] || {};
      const mine = answers[c.me];
      const startAt = g.endAt - tm;
      const answeredCount = Object.keys(answers).length;
      local.picked = local.picked || {};
      local.build = local.build || {};
      const app = document.getElementById("app");
      c.hideArena();

      if (g.phase === "q") {
        const done = mine || local.picked[r] !== undefined;
        const head = `
          <p class="eyebrow">${cfg.emoji} ${c.esc(cfg.name)} · ${r + 1}/${g.qs.length} ${badge(q)}</p>
          <div class="cd"><i id="cdbar"></i></div>
          <div class="prompt">${prompt(q, c.esc)}</div>`;
        const foot = `<p class="muted small" style="margin-top:.8rem">${done ? "Cevabın alındı ✓ · " : ""}${answeredCount}/${c.players.length} kişi cevapladı</p>`;

        if (q.b) {
          // harflere dokunarak kelimeyi kur
          const letters = [...String(q.s)];
          const used = local.build[r] || (local.build[r] = []);
          const word = mine ? mine.w : used.map((i) => letters[i]).join("");
          app.innerHTML = `
            <section class="card center quiz">${head}
              <div class="slots">${letters.map((_, i) => `<span class="slot">${c.esc([...word][i] || "")}</span>`).join("")}</div>
              <div class="tiles pick">${letters.map((ch, i) => `<button class="tile" data-t="${i}" ${done || used.includes(i) ? "disabled" : ""}>${c.esc(ch)}</button>`).join("")}</div>
              ${done ? "" : `<button class="btn" id="undo" style="margin-top:.8rem">⌫ Sil</button>`}
              ${foot}
            </section>`;
          app.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => {
            if (local.picked[r] !== undefined || c.now() < startAt) return;
            used.push(Number(b.dataset.t));
            if (used.length === letters.length) {
              local.picked[r] = -1;
              c.input(`q${r}`, { w: used.map((i) => letters[i]).join(""), t: Math.max(0, Math.round(c.now() - startAt)) });
            }
            this.render(c);
          });
          const undo = document.getElementById("undo");
          if (undo) undo.onclick = () => { used.pop(); this.render(c); };
        } else {
          const picked = mine ? mine.c : local.picked[r];
          app.innerHTML = `
            <section class="card center quiz">${head}
              <div class="opts ${q.o.length > 2 ? "" : "two"}">
                ${q.o.map((o, i) => `<button class="opt ${picked === i ? "picked" : ""}" data-i="${i}" ${picked !== undefined ? "disabled" : ""}>${c.esc(o)}</button>`).join("")}
              </div>
              ${foot}
            </section>`;
          app.querySelectorAll(".opt").forEach((b) => b.onclick = () => {
            if (local.picked[r] !== undefined || c.now() < startAt) return;
            const i = Number(b.dataset.i);
            local.picked[r] = i;
            c.input(`q${r}`, { c: i, t: Math.max(0, Math.round(c.now() - startAt)) });
            app.querySelectorAll(".opt").forEach((x) => { x.disabled = true; if (Number(x.dataset.i) === i) x.classList.add("picked"); });
          });
        }

        // geri sayım çubuğu
        const setBar = () => {
          const bar = document.getElementById("cdbar");
          if (bar) bar.style.width = Math.min(100, (Math.max(0, g.endAt - c.now()) / tm) * 100) + "%";
          return bar;
        };
        if (local.cdRound !== r) {
          local.cdRound = r;
          const tick = () => {
            if (c.room.state !== "play" || c.room.g?.round !== r || c.room.g?.phase !== "q") return;
            setBar();
            if (g.endAt - c.now() > 0) c.timer(tick, 100);
          };
          tick();
        } else setBar();
        return;
      }

      // cevap gösterimi
      const pts = roundPoints(q, answers);
      const myPts = pts[c.me] || 0;
      const totals = totalsUpTo(c.room, r);
      let top = c.players.map((p) => ({ ...p, s: totals[p.k] || 0 })).sort((a, b) => b.s - a.s).slice(0, 3);
      if (cfg.teams) {
        const tt = { A: 0, B: 0 };
        c.players.forEach((p) => { if (p.team) tt[p.team] += totals[p.k] || 0; });
        const myTeam = c.room.players?.[c.me]?.team;
        top = ["A", "B"].map((t) => ({ k: myTeam === t ? c.me : t, name: TEAM_LABEL[t], s: tt[t] })).sort((a, b) => b.s - a.s);
      }
      let body;
      if (q.b) {
        const right = Object.values(answers).filter((v) => isRight(q, v)).length;
        body = `
          <div class="slots">${[...String(q.ans)].map((ch) => `<span class="slot ok">${c.esc(ch)}</span>`).join("")}</div>
          <p class="muted" style="margin-top:.6rem">${right}/${c.players.length} kişi bildi${mine && !isRight(q, mine) ? ` · Senin cevabın: ${c.esc(mine.w)}` : ""}</p>`;
      } else {
        const picked = mine ? mine.c : local.picked[r];
        const counts = {};
        Object.values(answers).forEach((v) => { counts[v.c] = (counts[v.c] || 0) + 1; });
        const max = Math.max(0, ...Object.values(counts));
        const winOpt = (i) => mode === "speed" ? i === q.a : (counts[i] || 0) === max && max > 0;
        body = `
          <div class="opts ${q.o.length > 2 ? "" : "two"}">
            ${q.o.map((o, i) => `<div class="opt ${winOpt(i) ? "right" : picked === i ? "wrong" : ""} ${picked === i ? "picked" : ""}">
              ${c.esc(o)}<span class="cnt">${counts[i] || 0}</span></div>`).join("")}
          </div>
          ${cfg.reveal ? `<div class="muted" style="margin-top:.7rem">${cfg.reveal(q, counts, c)}</div>` : ""}`;
      }
      app.innerHTML = `
        <section class="card center quiz">
          <p class="eyebrow">${cfg.emoji} ${c.esc(cfg.name)} · ${r + 1}/${g.qs.length} ${badge(q)}</p>
          <div class="prompt">${prompt(q, c.esc)}</div>
          ${body}
          <p class="big-result">${myPts ? `+${myPts} puan 🎉` : !mine ? "Cevap vermedin" : mode === "speed" ? "Olmadı 😅" : "Azınlıkta kaldın 😅"}</p>
          <ol class="list mini">${top.map((p, i) => `<li class="${p.k === c.me ? "me" : ""}"><span class="rank">${i + 1}</span><span class="name">${c.esc(p.name)}</span><span class="val">${p.s}</span></li>`).join("")}</ol>
        </section>`;
    },

    hostTick(c) {
      const { g } = c;
      if (g.phase !== "q") return;
      const answers = c.inputs[`q${g.round}`] || {};
      const allIn = c.players.length > 0 && c.players.every((p) => answers[p.k]);
      if (!allIn && c.now() < g.endAt + 600) return;
      c.advance(async () => {
        await c.setG({ phase: "reveal" });
        await new Promise((res) => setTimeout(res, REVEAL_MS));
        const next = g.qs[g.round + 1];
        if (next) await c.setG({ phase: "q", round: g.round + 1, endAt: Math.round(c.now() + LEAD_MS + tmOf(next)) });
        else await c.finish();
      });
    },

    results(room) {
      const t = {};
      (room.g?.qs || []).forEach((q, i) => {
        const p = roundPoints(q, room.in?.[`q${i}`]);
        for (const [k, v] of Object.entries(p)) t[k] = (t[k] || 0) + v;
      });
      if (cfg.teams) {
        // takım oyunu: herkesin skoru takımının toplamıdır, kazanan takımın hepsi kazanır
        const tt = { A: 0, B: 0 };
        for (const [k, p] of Object.entries(room.players || {})) if (p.team) tt[p.team] += t[k] || 0;
        return Object.entries(room.players || {})
          .map(([k, p]) => ({ k, score: p.team ? tt[p.team] : 0, label: `${TEAM_LABEL[p.team] || ""} ${p.team ? tt[p.team] : 0} · kendi: ${t[k] || 0}` }))
          .sort((a, b) => b.score - a.score || (t[b.k] || 0) - (t[a.k] || 0));
      }
      return Object.keys(room.players || {})
        .map((k) => ({ k, score: t[k] || 0, label: `${t[k] || 0} puan` }))
        .sort((a, b) => b.score - a.score);
    }
  };
}
