// 🔴 Dörtlü Bağla — 2 kişi, 7×6 tahta, 4 taşı yan yana/üst üste/çapraz getiren kazanır.
// Tahta, hamle listesinden her telefonda yeniden kurulur; sadece sırası gelenin hamlesi sayılır.
import { sfx, buzz, unlock } from "../sound.js";
import { burst } from "./cards.js";
const COLS = 7, ROWS = 6;
const MOVE_MS = 30000;

export function replay(room) {
  const g = room.g;
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  let n = 0, winner = null, line = null, lastAt = g.startAt, last = null;
  while (n < COLS * ROWS) {
    const who = g.p[n % 2];
    const mv = room.in?.[`m${n}`]?.[who];
    if (!mv) break;
    const col = mv.col;
    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) if (board[r][col] === null) { row = r; break; } // 0 = ilk oyuncunun taşı, boş değil!
    if (row < 0) break; // geçersiz hamle (olmamalı)
    board[row][col] = n % 2;
    last = { row, col };
    lastAt = mv.at || lastAt;
    n++;
    const w = winAt(board, row, col);
    if (w) { winner = who; line = w; break; }
  }
  const full = n >= COLS * ROWS;
  return { board, n, turn: g.p[n % 2], winner, line, draw: !winner && full, lastAt, last };
}

function winAt(b, r, c) {
  const me = b[r][c];
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [[r, c]];
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && b[rr][cc] === me) { cells.push([rr, cc]); rr += dr * s; cc += dc * s; }
    }
    if (cells.length >= 4) return cells;
  }
  return null;
}

// kazanan 4 taşın üstünden geçen çizgi (tahta üstünde, yüzde koordinatla)
function winLine(line) {
  const pts = line.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const [r1, c1] = pts[0], [r2, c2] = pts[pts.length - 1];
  return `<svg class="c4line" viewBox="0 0 ${COLS} ${ROWS}" preserveAspectRatio="none"><line x1="${c1 + 0.5}" y1="${r1 + 0.5 + 0.08}" x2="${c2 + 0.5}" y2="${r2 + 0.5 + 0.08}" vector-effect="non-scaling-stroke"/></svg>`;
}

const validCols = (board) => [...Array(COLS).keys()].filter((c) => board[0][c] === null);

export default {
  id: "dortlu", name: "Dörtlü Bağla", emoji: "🔴",
  desc: "2 kişi · 4 taşı yan yana getir",
  rules: "Sırayla bir sütun seçip taşını bırak. <b>4 taşını</b> yatay, dikey ya da çapraz yan yana getiren kazanır. Hamle süresi 30 sn, dolarsa rastgele oynanır.",
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
    const myIdx = g.p.indexOf(c.me);
    const myTurn = st.turn === c.me && !st.winner && !st.draw && local.sent !== st.n;
    const name = (k) => c.esc(c.room.players?.[k]?.name || "?");
    const winCells = new Set((st.line || []).map(([r, cc]) => `${r},${cc}`));
    const canDrop = new Set(validCols(st.board));
    const fresh = local.seenN !== undefined && local.seenN !== st.n; // yeni bir taş düştü
    const firstWin = st.winner && !local.winShown;
    local.seenN = st.n;
    const turnIdx = g.p.indexOf(st.turn);
    const pl = (i) => `<span class="c4pl ${!st.winner && !st.draw && turnIdx === i ? "on" : ""}"><i class="d${i}"></i>${g.p[i] === c.me ? "Sen" : name(g.p[i])}</span>`;

    app.innerHTML = `
      <section class="card center c4card">
        <p class="eyebrow">🔴 Dörtlü Bağla</p>
        <div class="c4head">${pl(0)}<span class="vs">vs</span>${pl(1)}</div>
        <p class="big-result" style="margin:.4rem 0">${st.winner ? (st.winner === c.me ? "Kazandın! 🏆" : `${name(st.winner)} kazandı`) : st.draw ? "Berabere 🤝" : myTurn ? "Sıra sende: bir sütuna dokun" : `${name(st.turn)} düşünüyor…`}</p>
        <div class="cd"><i id="cdbar"></i></div>
        <div class="c4board ${myTurn ? "my" : ""}" id="c4b">
          ${[...Array(COLS).keys()].map((cc) => `
            <button class="c4col" data-col="${cc}" ${myTurn && canDrop.has(cc) ? "" : "disabled"} aria-label="Sütun ${cc + 1}">
              <span class="c4ghost d${myIdx}"></span>
              ${st.board.map((row, r) => {
                const v = row[cc];
                const isLast = st.last && st.last.row === r && st.last.col === cc;
                return `<span class="c4hole">${v === null ? "" : `<span class="disc d${v} ${winCells.has(`${r},${cc}`) ? "win" : ""} ${isLast && fresh ? "drop" : ""}" style="--fall:${r + 1}"></span>`}</span>`;
              }).join("")}
            </button>`).join("")}
          ${st.line ? winLine(st.line) : ""}
        </div>
      </section>`;
    app.querySelectorAll("[data-col]").forEach((b) => b.onclick = () => {
      if (!myTurn) return;
      unlock();
      local.sent = st.n;
      c.input(`m${st.n}`, { col: Number(b.dataset.col), at: Math.round(c.now()) });
      app.querySelectorAll("[data-col]").forEach((x) => { x.disabled = true; });
    });

    // ses: taş yere değdiğinde; kazanınca zil + yazı
    if (fresh && st.last) { const r = st.last.row; c.timer(() => { sfx.checker(); buzz(12); }, 120 + r * 45); }
    if (firstWin) {
      local.winShown = true;
      c.timer(() => { burst(document.getElementById("c4b"), st.winner === c.me ? "DÖRTLÜ! 🏆" : "DÖRTLÜ!", "gold"); sfx.turn(); buzz([40, 40, 90]); }, 550);
    }

    // hamle süresi çubuğu
    const setBar = () => {
      const bar = document.getElementById("cdbar");
      if (bar) bar.style.width = Math.max(0, 1 - (c.now() - st.lastAt) / MOVE_MS) * 100 + "%";
    };
    setBar();
    if (local.tickN !== st.n && !st.winner && !st.draw) {
      local.tickN = st.n; // her hamlede tek bir zamanlayıcı
      const n = st.n;
      const tick = () => {
        if (local.tickN !== n || c.room.state !== "play") return;
        setBar();
        c.timer(tick, 250);
      };
      c.timer(tick, 250);
    }
  },

  hostTick(c) {
    const st = replay(c.room);
    if (st.winner || st.draw) {
      c.advance(async () => { await new Promise((r) => setTimeout(r, 2500)); await c.finish(); });
      return;
    }
    if (c.now() - st.lastAt > MOVE_MS + 1000) {
      const cols = validCols(st.board);
      c.advance(() => c.inputAs(`m${st.n}`, st.turn, { col: cols[Math.floor(Math.random() * cols.length)], at: Math.round(c.now()), auto: true }));
    }
  },

  results(room) {
    const st = replay(room);
    return Object.keys(room.players || {}).map((k) => ({
      k,
      score: st.winner ? (st.winner === k ? 1 : 0) : 0,
      label: st.winner ? (st.winner === k ? "Kazandı" : "Kaybetti") : "Berabere"
    })).sort((a, b) => b.score - a.score);
  }
};
