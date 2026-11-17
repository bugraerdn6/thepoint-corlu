// 🎲 Yalancı Zar — herkesin gizli zarları var. Sırayla "masada en az şu kadar X var" diye teklif artırılır
// ya da "Yalan!" denir. Zarlar sadece sahibinin telefonunda durur; başta hash yazılır, açılışta doğrulanır.
const DICE = 4;
const BID_MS = 30000;
const COMMIT_MS = 15000;
const REVEAL_MS = 15000;
const RESULT_MS = 6000;
const FACE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

const lsKey = (c, r) => `tp_dice_${c.code}_${c.room.runId || c.room.startedAt}_${r}`;

async function sha(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const alive = (g) => g.order.filter((k) => (g.dice[k] || 0) > 0);
const totalDice = (g) => alive(g).reduce((a, k) => a + g.dice[k], 0);

// Bu eldeki teklifler
function bids(room) {
  const g = room.g;
  const list = [];
  const al = alive(g);
  let idx = al.indexOf(g.starter);
  if (idx < 0) idx = 0;
  for (let n = 0; n < 200; n++) {
    const who = al[(idx + n) % al.length];
    const b = room.in?.[`b${g.round}_${n}`]?.[who];
    if (!b) return { list, turn: who, n, lastAt: list.length ? list[list.length - 1].at : g.bidAt };
    list.push({ ...b, who, n });
    if (b.call) return { list, turn: null, n: n + 1, called: true, lastAt: b.at };
  }
  return { list, turn: null, n: 200 };
}

const higher = (q, f, prev) => !prev || q > prev.q || (q === prev.q && f > prev.f);

export default {
  id: "zar", name: "Yalancı Zar", emoji: "🎲",
  desc: "2–6 kişi · Blöf yap ya da yalanı yakala",
  rules: `Herkesin ${DICE} gizli zarı var. Sırayla <b>"masadaki bütün zarlarda en az şu kadar şu sayı var"</b> diye teklif ver, her teklif öncekinden yüksek olmalı. İnanmıyorsan <b>🤥 Yalan!</b> de: zarlar açılır, haksız çıkan bir zar kaybeder. Zarı biten elenir, son kalan kazanır.`,
  minPlayers: 2, maxPlayers: 6, soloTest: false,

  start(c) {
    const order = c.players.map((p) => p.k).sort(() => Math.random() - 0.5);
    const dice = Object.fromEntries(order.map((k) => [k, DICE]));
    return { phase: "roll", round: 0, order, dice, starter: order[0], out: null, endAt: Math.round(c.now() + COMMIT_MS) };
  },

  render(c) {
    const { g, local } = c;
    const app = document.getElementById("app");
    c.hideArena();
    const r = g.round;
    const name = (k) => c.esc(c.room.players?.[k]?.name || "?");
    const amAlive = (g.dice[c.me] || 0) > 0;

    // bu elin zarlarını at ve hash'ini yaz
    let mine = null;
    try { mine = JSON.parse(localStorage.getItem(lsKey(c, r)) || "null"); } catch { /* */ }
    if (amAlive && !mine) {
      const d = Array.from(crypto.getRandomValues(new Uint32Array(g.dice[c.me])), (x) => (x % 6) + 1);
      mine = { d, salt: crypto.getRandomValues(new Uint32Array(4)).join("-") };
      try { localStorage.setItem(lsKey(c, r), JSON.stringify(mine)); } catch { /* */ }
    }
    if (amAlive && mine && !c.inputs[`c${r}`]?.[c.me] && local.committed !== r) {
      local.committed = r;
      sha(JSON.stringify(mine.d) + "|" + mine.salt).then((h) => c.input(`c${r}`, { h }));
    }
    if (amAlive && mine && g.phase === "reveal" && !c.inputs[`v${r}`]?.[c.me] && local.revealed !== r) {
      local.revealed = r;
      c.input(`v${r}`, { d: mine.d, salt: mine.salt });
    }

    const table = `<ul class="list mini" style="margin-top:.6rem">${g.order.map((k) => `
      <li class="${k === c.me ? "me" : ""}"><span class="name">${name(k)}</span><span class="val">${(g.dice[k] || 0) > 0 ? "🎲".repeat(g.dice[k]) : "elendi"}</span></li>`).join("")}</ul>`;
    const myDice = amAlive && mine ? `<div class="dice">${mine.d.map((v) => `<span>${FACE[v]}</span>`).join("")}</div>` : `<p class="muted">Elendin, izlemeye devam et 👀</p>`;

    if (g.phase === "roll") {
      app.innerHTML = `<section class="card center"><p class="eyebrow">🎲 Yalancı Zar · El ${r + 1}</p><h2>Zarlar atılıyor…</h2>${myDice}${table}</section>`;
      return;
    }

    if (g.phase === "bid") {
      const b = bids(c.room);
      const prev = b.list.filter((x) => !x.call).pop();
      const myTurn = b.turn === c.me && local.bidSent !== `${r}_${b.n}`;
      const tot = totalDice(g);
      local.q = local.q && higher(local.q, local.f || 6, prev) ? local.q : prev ? prev.q : 1;
      local.f = local.f || (prev ? prev.f : 2);
      app.innerHTML = `
        <section class="card center">
          <p class="eyebrow">🎲 Yalancı Zar · El ${r + 1} · Masada ${tot} zar</p>
          <p class="muted small">Senin zarların (sadece sen görüyorsun):</p>
          ${myDice}
          <div class="cd"><i id="cdbar"></i></div>
          <p class="big-result">${prev ? `${name(prev.who)}: "En az <b>${prev.q}</b> tane ${FACE[prev.f]}"` : "İlk teklif bekleniyor"}</p>
          <p class="muted">${myTurn ? "Sıra sende!" : `${name(b.turn)} düşünüyor…`}</p>
          ${myTurn ? `
            <div class="bid">
              <div class="row" style="justify-content:center">
                <button class="btn" id="qm">−</button><span class="bidq" id="qv">${local.q}</span><button class="btn" id="qp">+</button>
                <span class="muted">tane</span>
              </div>
              <div class="faces">${[1, 2, 3, 4, 5, 6].map((f) => `<button class="face ${local.f === f ? "on" : ""}" data-f="${f}">${FACE[f]}</button>`).join("")}</div>
              <div class="row" style="margin-top:.8rem">
                ${prev ? `<button class="btn accent grow" id="call">🤥 Yalan!</button>` : ""}
                <button class="btn primary grow" id="bidbtn">Teklif ver</button>
              </div>
              <p class="muted small" id="bidmsg"></p>
            </div>` : ""}
          ${table}
        </section>`;
      if (myTurn) {
        const send = (val) => {
          local.bidSent = `${r}_${b.n}`;
          c.input(`b${r}_${b.n}`, { ...val, at: Math.round(c.now()) });
        };
        document.getElementById("qm").onclick = () => { local.q = Math.max(1, local.q - 1); this.render(c); };
        document.getElementById("qp").onclick = () => { local.q = Math.min(tot, local.q + 1); this.render(c); };
        app.querySelectorAll("[data-f]").forEach((x) => x.onclick = () => { local.f = Number(x.dataset.f); this.render(c); });
        document.getElementById("bidbtn").onclick = () => {
          if (!higher(local.q, local.f, prev)) { document.getElementById("bidmsg").textContent = "Teklif öncekinden yüksek olmalı (daha çok adet ya da aynı adette daha büyük sayı)."; return; }
          send({ q: local.q, f: local.f });
        };
        const call = document.getElementById("call");
        if (call) call.onclick = () => send({ call: true });
      }
      barTick(c, `${r}_${b.n}`, b.lastAt + BID_MS, BID_MS);
      return;
    }

    // açılış / sonuç
    const res = g.last;
    const reveals = c.inputs[`v${r}`] || {};
    app.innerHTML = `
      <section class="card center">
        <p class="eyebrow">🎲 Yalancı Zar · El ${r + 1}</p>
        ${res ? `<p class="big-result">"En az ${res.q} tane ${FACE[res.f]}" → masada <b>${res.count}</b> tane</p>
          <p>${res.liar ? `${name(res.liar)} hile şüphesiyle zar kaybetti ⚠️` : `<b>${name(res.loser)}</b> bir zar kaybetti`}</p>` : `<h2>🤥 Yalan dendi! Zarlar açılıyor…</h2>`}
        <ul class="list mini" style="margin-top:.6rem">${alive(g).map((k) => `<li class="${k === c.me ? "me" : ""}"><span class="name">${name(k)}</span>
          <span class="val dice small">${reveals[k] ? reveals[k].d.map((v) => `<span class="${res && v === res.f ? "hl" : ""}">${FACE[v]}</span>`).join("") : "…"}</span></li>`).join("")}</ul>
      </section>`;
  },

  hostTick(c) {
    const { g } = c;
    const al = alive(g);
    if (g.phase === "roll") {
      const com = c.inputs[`c${g.round}`] || {};
      if (al.every((k) => com[k])) return c.advance(() => c.setG({ phase: "bid", bidAt: Math.round(c.now()) }));
      if (c.now() > g.endAt) {
        // zar atamayan (bağlantısı kopan) oyuncular elenir
        const dice = { ...g.dice };
        al.forEach((k) => { if (!com[k]) dice[k] = 0; });
        return c.advance(() => afterRound(c, dice, g.starter));
      }
      return;
    }
    if (g.phase === "bid") {
      const b = bids(c.room);
      if (b.called) {
        const call = b.list[b.list.length - 1];
        const bid = b.list[b.list.length - 2];
        return c.advance(() => c.setG({ phase: "reveal", call: { caller: call.who, bidder: bid.who, q: bid.q, f: bid.f }, endAt: Math.round(c.now() + REVEAL_MS) }));
      }
      if (c.now() - b.lastAt > BID_MS + 1000) {
        // süre doldu: ilk teklifse en küçük teklif, değilse "Yalan!"
        const prev = b.list[b.list.length - 1];
        const val = prev ? { call: true } : { q: 1, f: 1 + Math.floor(Math.random() * 6) };
        return c.advance(() => c.inputAs(`b${g.round}_${b.n}`, b.turn, { ...val, at: Math.round(c.now()), auto: true }));
      }
      return;
    }
    if (g.phase === "reveal") {
      const rev = c.inputs[`v${g.round}`] || {};
      if (!al.every((k) => rev[k]) && c.now() < g.endAt) return;
      c.advance(async () => {
        const com = c.inputs[`c${g.round}`] || {};
        let liar = null, count = 0;
        for (const k of al) {
          const v = rev[k];
          const ok = v && Array.isArray(v.d) && v.d.length === g.dice[k] && v.d.every((x) => x >= 1 && x <= 6) &&
            (await sha(JSON.stringify(v.d) + "|" + v.salt)) === com[k]?.h;
          if (!ok) { liar = liar || k; continue; }
          count += v.d.filter((x) => x === g.call.f).length;
        }
        const loser = liar || (count >= g.call.q ? g.call.caller : g.call.bidder);
        await c.setG({ phase: "result", last: { q: g.call.q, f: g.call.f, count, loser, liar }, endAt: Math.round(c.now() + RESULT_MS) });
      });
      return;
    }
    if (g.phase === "result" && c.now() > g.endAt) {
      const dice = { ...g.dice };
      dice[g.last.loser] = Math.max(0, (dice[g.last.loser] || 0) - 1);
      c.advance(() => afterRound(c, dice, g.last.loser));
    }
  },

  results(room) {
    const g = room.g;
    const out = g?.out || [];
    return Object.keys(room.players || {}).map((k) => {
      const alive = (g?.dice?.[k] || 0) > 0;
      const rank = alive ? 999 : out.indexOf(k);
      return { k, score: rank, label: alive ? "Kazandı 🎲" : `${out.length - out.indexOf(k) + 1}. oldu` };
    }).sort((a, b) => b.score - a.score);
  }
};

async function afterRound(c, dice, nextStarter) {
  const g = c.g;
  const out = [...(g.out || [])];
  for (const k of g.order) if ((g.dice[k] || 0) > 0 && !(dice[k] > 0) && !out.includes(k)) out.push(k);
  const left = g.order.filter((k) => dice[k] > 0);
  if (left.length <= 1) {
    await c.setG({ dice, out });
    return c.finish();
  }
  let starter = nextStarter;
  if (!(dice[starter] > 0)) {
    const i = g.order.indexOf(starter);
    for (let j = 1; j <= g.order.length; j++) { const k = g.order[(i + j) % g.order.length]; if (dice[k] > 0) { starter = k; break; } }
  }
  await c.setG({ phase: "roll", round: g.round + 1, dice, out, starter, call: null, last: null, endAt: Math.round(c.now() + COMMIT_MS) });
}

function barTick(c, id, endAt, total) {
  const set = () => { const b = document.getElementById("cdbar"); if (b) b.style.width = Math.max(0, (endAt - c.now()) / total) * 100 + "%"; };
  set();
  if (c.local.barId !== id) {
    c.local.barId = id;
    const tick = () => { if (c.local.barId !== id || c.room.state !== "play") return; set(); c.timer(tick, 250); };
    c.timer(tick, 250);
  }
}
