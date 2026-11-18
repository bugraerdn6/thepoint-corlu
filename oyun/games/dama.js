// ⚫ Dama (Türk daması) — 2 kişi. Durum hamle listesinden her telefonda yeniden kurulur; yasadışı hamle sayılmaz.
import * as D from "./dama-rules.js";
import { sfx, buzz, unlock } from "../sound.js";
import { burst } from "./cards.js";

const MOVE_MS = 45000;
const DRAW_PLIES = 100; // yemesiz 100 yarım hamle → berabere

export function replay(room) {
  const g = room.g;
  let b = D.initialBoard(), n = 0, noCap = 0, lastAt = g.startAt, last = null, prev = null;
  for (; n < 2000; n++) {
    const side = n % 2, who = g.p[side];
    const mv = room.in?.[`m${n}`]?.[who];
    if (!mv) break;
    const legal = D.legalMoves(b, side);
    const m = legal.find((x) => D.encMove(x) === mv.path);
    if (!m) break; // yasadışı: oda sahibi süre dolunca yerine yasal hamle yazar
    prev = b;
    b = D.applyMove(b, m);
    last = { ...m, side };
    lastAt = mv.at || lastAt;
    noCap = m.caps.length ? 0 : noCap + 1;
  }
  const side = n % 2;
  const legal = D.legalMoves(b, side);
  const winner = legal.length === 0 ? g.p[1 - side] : null;
  const draw = !winner && noCap >= DRAW_PLIES;
  return { board: b, prev, n, side, turn: g.p[side], legal, last, lastAt, winner, draw, invalid: !!room.in?.[`m${n}`]?.[g.p[side]] };
}

// Bot / süre dolunca: yemeyi ve dama olmayı sever, rakibe yem vermekten kaçınır
export function chooseMove(b, side, legal = D.legalMoves(b, side)) {
  let best = null, bestS = -Infinity;
  for (const m of legal) {
    const nb = D.applyMove(b, m);
    const reply = D.legalMoves(nb, 1 - side);
    const danger = reply.length && reply[0].caps.length ? reply[0].caps.length : 0;
    const promoted = Math.abs(nb[m.path[m.path.length - 1]]) === 2 && Math.abs(b[m.path[0]]) === 1;
    // ileri gitmek iyidir (dama olmaya yaklaşır)
    const [r0] = D.rc(m.path[0]), [r1] = D.rc(m.path[m.path.length - 1]);
    const advance = Math.abs(b[m.path[0]]) === 1 ? (side === 0 ? r0 - r1 : r1 - r0) : 0;
    const s = m.caps.length * 10 + (promoted ? 6 : 0) - danger * 6 + advance * 1.2 + Math.random() * 2;
    if (s > bestS) { bestS = s; best = m; }
  }
  return best;
}

export default {
  id: "dama", name: "Dama", emoji: "⚫",
  desc: "2 kişi · Türk daması",
  rules: "Türk daması: taşlar <b>ileri ve yana</b> birer kare gider, geri ve çapraz gidemez. <b>Yeme zorunlu</b>, birden fazla yol varsa <b>en çok yiyen</b> seçilir; arka arkaya yenebilir. Son sıraya ulaşan taş <b>dama</b> olur, düz çizgide istediği kadar gider ve uzaktan yer. Rakibin taşı ya da hamlesi kalmazsa kazanırsın. Hamle süresi 45 sn.",
  minPlayers: 2, maxPlayers: 2, soloTest: false,

  start(c) {
    const p = c.players.map((x) => x.k);
    if (Math.random() < 0.5) p.reverse();
    return { p, startAt: Math.round(c.now()) };
  },

  render(c) {
    const { g, local } = c;
    const app = document.getElementById("app");
    c.hideArena();
    const st = replay(c.room);
    const me = g.p.indexOf(c.me);
    const flip = me === 1; // herkes kendi taşlarını altta görür
    const myTurn = st.turn === c.me && !st.winner && !st.draw && local.sent !== st.n;
    const name = (k) => (k === c.me ? "Sen" : c.esc(c.room.players?.[k]?.name || "?"));
    if (local.selN !== st.n) { local.selN = st.n; local.sel = null; }
    const fresh = local.seenN !== undefined && local.seenN !== st.n && st.last;
    local.seenN = st.n;
    const mustCap = st.legal[0]?.caps.length > 0;
    const sources = new Set(myTurn ? st.legal.map((m) => m.path[0]) : []);
    const selMoves = local.sel != null ? st.legal.filter((m) => m.path[0] === local.sel) : [];
    const targets = new Map(selMoves.map((m) => [m.path[m.path.length - 1], m]));
    const via = new Set(selMoves.flatMap((m) => m.path.slice(1, -1)));
    const lastSet = new Set(st.last ? [st.last.path[0], st.last.path[st.last.path.length - 1]] : []);
    const cnt = [D.count(st.board, 0), D.count(st.board, 1)];
    const chip = (side) => `<span class="c4pl dm ${!st.winner && !st.draw && st.side === side ? "on" : ""}"><i class="dmi s${side}"></i>${name(g.p[side])} <small>${cnt[side]}</small></span>`;

    let cells = "";
    for (let vr = 0; vr < 8; vr++) for (let vc = 0; vc < 8; vc++) {
      const r = flip ? 7 - vr : vr, cc = flip ? 7 - vc : vc, i = D.idx(r, cc);
      const v = st.board[i];
      const cls = [(r + cc) % 2 ? "dk" : "lt", sources.has(i) ? "src" : "", local.sel === i ? "sel" : "", targets.has(i) ? "tgt" : "", via.has(i) ? "via" : "", lastSet.has(i) ? "last" : ""].join(" ");
      const piece = v ? `<span class="dpc s${v > 0 ? 0 : 1} ${Math.abs(v) === 2 ? "king" : ""} ${fresh && i === st.last.path[st.last.path.length - 1] ? "arrive" : ""}"></span>` : "";
      cells += `<button class="dsq ${cls}" data-i="${i}" ${myTurn && (sources.has(i) || targets.has(i)) ? "" : "disabled"}>${piece}</button>`;
    }

    app.innerHTML = `
      <section class="card center dmcard">
        <p class="eyebrow">⚫ Dama</p>
        <div class="c4head">${chip(1 - me)}<span class="vs">vs</span>${chip(me)}</div>
        <p class="big-result" style="margin:.4rem 0">${st.winner ? (st.winner === c.me ? "Kazandın! 🏆" : `${name(st.winner)} kazandı`) : st.draw ? "Berabere 🤝" : myTurn ? (mustCap ? "Yeme zorunlu! Taşını seç" : "Sıra sende: taşını seç") : `${name(st.turn)} düşünüyor…`}</p>
        <div class="cd"><i id="cdbar"></i></div>
        <div class="dboard" id="dboard">${cells}</div>
      </section>`;

    app.querySelectorAll(".dsq[data-i]").forEach((el) => el.onclick = () => {
      if (!myTurn) return;
      unlock();
      const i = Number(el.dataset.i);
      if (targets.has(i)) {
        const m = targets.get(i);
        local.sent = st.n;
        c.input(`m${st.n}`, { path: D.encMove(m), at: Math.round(c.now()) });
        app.querySelectorAll(".dsq").forEach((x) => { x.disabled = true; });
        return;
      }
      if (sources.has(i)) {
        local.sel = local.sel === i ? null : i;
        // tek gidiş varsa hemen oyna
        const only = st.legal.filter((m) => m.path[0] === i);
        if (only.length === 1 && local.sel === i) {
          local.sent = st.n;
          c.input(`m${st.n}`, { path: D.encMove(only[0]), at: Math.round(c.now()) });
          return;
        }
        sfx.tick();
        this.render(c);
      }
    });

    // son hamle: yol boyunca kayma + yenen taşlar kaybolur
    if (fresh) animateMove(app, st, flip);
    if (fresh) {
      const promo = Math.abs(st.board[st.last.path[st.last.path.length - 1]]) === 2 && st.prev && Math.abs(st.prev[st.last.path[0]]) === 1;
      c.timer(() => { (st.last.caps.length ? sfx.hit : sfx.checker)(); buzz(st.last.caps.length ? [25, 30, 25] : 10); if (promo) burst(document.getElementById("dboard"), "DAMA! 👑", "gold"); }, 120 + st.last.path.length * 140);
    }
    if (st.winner && !local.winShown) { local.winShown = true; }

    const setBar = () => { const bar = document.getElementById("cdbar"); if (bar) bar.style.width = Math.max(0, 1 - (c.now() - st.lastAt) / MOVE_MS) * 100 + "%"; };
    setBar();
    if (local.tickN !== st.n && !st.winner && !st.draw) {
      local.tickN = st.n;
      const n = st.n;
      const tick = () => { if (local.tickN !== n || c.room.state !== "play") return; setBar(); c.timer(tick, 250); };
      c.timer(tick, 250);
    }
  },

  hostTick(c) {
    const st = replay(c.room);
    if (st.winner || st.draw) { c.advance(async () => { await new Promise((r) => setTimeout(r, 2500)); await c.finish(); }); return; }
    if (c.now() - st.lastAt > MOVE_MS + 1000 || (st.invalid && c.now() - st.lastAt > 3000)) {
      const m = chooseMove(st.board, st.side, st.legal);
      c.advance(() => c.inputAs(`m${st.n}`, st.turn, { path: D.encMove(m), at: Math.round(c.now()), auto: true }));
    }
  },

  results(room) {
    const st = replay(room);
    return Object.keys(room.players || {}).map((k) => ({
      k, score: st.winner === k ? 1 : 0,
      label: st.winner ? (st.winner === k ? "Kazandı" : "Kaybetti") : "Berabere"
    })).sort((a, b) => b.score - a.score);
  }
};

// Taşı yol boyunca kaydır (WAAPI), yenen taşları eski yerlerinde söndür
function animateMove(app, st, flip) {
  const board = app.querySelector("#dboard");
  if (!board || !st.last) return;
  const cellOf = (i) => board.querySelector(`[data-i="${i}"]`);
  const end = st.last.path[st.last.path.length - 1];
  const piece = cellOf(end)?.querySelector(".dpc");
  const endRect = cellOf(end)?.getBoundingClientRect();
  if (!piece || !endRect) return;
  const frames = st.last.path.map((i) => { const r = cellOf(i).getBoundingClientRect(); return { transform: `translate(${r.left - endRect.left}px, ${r.top - endRect.top}px)` }; });
  try { piece.animate(frames, { duration: 140 * (frames.length - 1) + 120, easing: "ease-in-out" }); } catch { /* */ }
  // yenen taşlar: hayalet olarak kısa süre görünüp söner
  for (const capIdx of st.last.caps) {
    const cell = cellOf(capIdx);
    if (!cell || !st.prev) continue;
    const v = st.prev[capIdx];
    const ghost = document.createElement("span");
    ghost.className = `dpc s${v > 0 ? 0 : 1} ${Math.abs(v) === 2 ? "king" : ""} gone`;
    cell.appendChild(ghost);
    setTimeout(() => ghost.remove(), 900);
  }
}
