// 🚢 Amiral Battı — 2 kişi, 8×8. Gemiler sadece sahibinin telefonunda durur; başta yerleşimin hash'i yazılır,
// oyun sonunda yerleşim açılır ve herkesin telefonu hash ile doğrular.
const N = 8;
const SHIPS = [4, 3, 3, 2];
const TOTAL = SHIPS.reduce((a, b) => a + b, 0);
const PLACE_MS = 60000;
const SHOT_MS = 30000;
const REPLY_WAIT_MS = 20000;
const END_SHOW_MS = 7000;

const key = (c) => `tp_fleet_${c.code}_${c.room.runId || c.room.startedAt}`;

function randomFleet() {
  for (;;) {
    const grid = Array.from({ length: N }, () => Array(N).fill(0));
    const ships = [];
    let ok = true;
    for (const len of SHIPS) {
      let placed = false;
      for (let t = 0; t < 200 && !placed; t++) {
        const h = Math.random() < 0.5;
        const x = Math.floor(Math.random() * (h ? N - len + 1 : N));
        const y = Math.floor(Math.random() * (h ? N : N - len + 1));
        const cells = Array.from({ length: len }, (_, i) => [h ? x + i : x, h ? y : y + i]);
        // gemiler birbirine değmesin (köşeler dahil)
        if (cells.every(([cx, cy]) => {
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx >= 0 && ny >= 0 && nx < N && ny < N && grid[ny][nx]) return false;
          }
          return true;
        })) {
          cells.forEach(([cx, cy]) => { grid[cy][cx] = ships.length + 1; });
          ships.push(cells);
          placed = true;
        }
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
}

async function hashFleet(ships, salt) {
  const data = new TextEncoder().encode(JSON.stringify(ships) + "|" + salt);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function loadFleet(c) {
  try { return JSON.parse(localStorage.getItem(key(c)) || "null"); } catch { return null; }
}
function saveFleet(c, f) {
  try { localStorage.setItem(key(c), JSON.stringify(f)); } catch { /* */ }
}

// Atış geçmişini çöz
function replay(room) {
  const g = room.g;
  const shots = [];
  const hits = { [g.p[0]]: 0, [g.p[1]]: 0 }; // hedefe isabet sayısı
  let n = 0, pending = null, winner = null, lastAt = g.fireAt || 0;
  for (; n < N * N * 2; n++) {
    const shooter = g.p[n % 2], target = g.p[(n + 1) % 2];
    const s = room.in?.[`s${n}`]?.[shooter];
    if (!s) break;
    const r = room.in?.[`r${n}`]?.[target];
    lastAt = s.at || lastAt;
    if (!r) { pending = { n, shooter, target, x: s.x, y: s.y, at: s.at }; break; }
    lastAt = r.at || lastAt;
    shots.push({ n, shooter, target, x: s.x, y: s.y, hit: !!r.hit, sunk: r.sunk || 0 });
    if (r.hit) hits[target]++;
    if (hits[target] >= TOTAL) { winner = shooter; n++; break; }
  }
  return { shots, n, pending, winner, lastAt, turn: g.p[n % 2] };
}

export default {
  id: "amiral", name: "Amiral Battı", emoji: "🚢",
  desc: "2 kişi · Gemileri bul, batır",
  rules: `Gemilerin otomatik yerleşir, istersen 🔀 ile karıştır, sonra "Hazırım". Sırayla rakibin tahtasına ateş edin. Rakibin <b>bütün gemilerini (${SHIPS.join(", ")})</b> ilk batıran kazanır. Gemilerinin yeri sadece senin telefonunda durur, oyun sonunda iki taraf da doğrulanır.`,
  minPlayers: 2, maxPlayers: 2, soloTest: false,

  start(c) {
    const p = c.players.map((x) => x.k);
    if (Math.random() < 0.5) p.reverse();
    return { phase: "place", p, endAt: Math.round(c.now() + PLACE_MS) };
  },

  render(c) {
    const { g, local } = c;
    const app = document.getElementById("app");
    c.hideArena();
    const name = (k) => c.esc(c.room.players?.[k]?.name || "?");
    const opp = g.p.find((k) => k !== c.me);
    let fleet = loadFleet(c);

    if (g.phase === "place") {
      const ready = c.inputs.ready || {};
      if (!fleet) { fleet = { ships: randomFleet(), salt: crypto.getRandomValues(new Uint32Array(4)).join("-") }; saveFleet(c, fleet); }
      const iReady = !!ready[c.me] || local.ready;
      const sendReady = async () => {
        if (local.ready) return;
        local.ready = true;
        c.input("ready", { h: await hashFleet(fleet.ships, fleet.salt) });
      };
      app.innerHTML = `
        <section class="card center">
          <p class="eyebrow">🚢 Amiral Battı · Hazırlık</p>
          <h2>${iReady ? "Hazırsın ✓" : "Filonu yerleştir"}</h2>
          <p class="muted small">${iReady ? `${name(opp)} bekleniyor…` : "Gemiler birbirine değmeyecek şekilde rastgele dizildi."}</p>
          ${gridHtml(c, (x, y) => (shipAt(fleet.ships, x, y) ? "ship" : ""), false)}
          ${iReady ? "" : `<div class="row" style="margin-top:1rem"><button class="btn grow" id="shuf">🔀 Karıştır</button><button class="btn primary grow" id="rdy">Hazırım ✓</button></div>`}
          <div class="cd" style="margin-top:1rem"><i id="cdbar"></i></div>
        </section>`;
      const shuf = document.getElementById("shuf");
      if (shuf) shuf.onclick = () => { fleet.ships = randomFleet(); saveFleet(c, fleet); this.render(c); };
      const rdy = document.getElementById("rdy");
      if (rdy) rdy.onclick = sendReady;
      // süre dolarsa otomatik hazır
      if (!iReady && local.autoReady !== (c.room.runId || c.room.startedAt)) {
        local.autoReady = (c.room.runId || c.room.startedAt);
        c.timer(sendReady, Math.max(0, g.endAt - c.now() - 1500));
      }
      bar(c, "place", g.endAt, PLACE_MS);
      return;
    }

    const st = replay(c.room);

    // rakip bana ateş ettiyse otomatik cevap ver
    if (st.pending && st.pending.target === c.me && fleet && local.replied !== st.pending.n) {
      local.replied = st.pending.n;
      const shipIdx = fleet.ships.findIndex((s) => s.some(([x, y]) => x === st.pending.x && y === st.pending.y));
      let sunk = 0;
      if (shipIdx >= 0) {
        const ship = fleet.ships[shipIdx];
        const hitBefore = st.shots.filter((s) => s.target === c.me && s.hit && ship.some(([x, y]) => x === s.x && y === s.y)).length;
        if (hitBefore + 1 === ship.length) sunk = ship.length;
      }
      c.input(`r${st.pending.n}`, { hit: shipIdx >= 0, sunk, at: Math.round(c.now()) });
    }

    if (g.phase === "end") return renderEnd(c, st, fleet, name, opp);

    const myShots = st.shots.filter((s) => s.shooter === c.me);
    const theirShots = st.shots.filter((s) => s.shooter === opp);
    const myTurn = !st.winner && !st.pending && st.turn === c.me && local.fired !== st.n;
    const lastMine = myShots[myShots.length - 1];
    const lastTheirs = theirShots[theirShots.length - 1];
    const hitsOnOpp = myShots.filter((s) => s.hit).length;
    const hitsOnMe = theirShots.filter((s) => s.hit).length;

    app.innerHTML = `
      <section class="card center">
        <p class="eyebrow">🚢 Amiral Battı</p>
        <p class="big-result" style="margin-top:0">${st.winner ? "Oyun bitti!" : st.pending ? (st.pending.shooter === c.me ? "Atış gönderildi…" : `${name(opp)} ateş etti!`) : myTurn ? "Sıra sende: ateş et 🎯" : `${name(opp)} nişan alıyor…`}</p>
        ${lastMine ? `<p class="muted small">Son atışın: ${lastMine.hit ? (lastMine.sunk ? `💥 Batırdın! (${lastMine.sunk}'lü gemi)` : "🔥 İsabet!") : "💧 Iska"}</p>` : ""}
        <div class="cd"><i id="cdbar"></i></div>
        <h3 style="margin-top:.8rem">Rakip: ${name(opp)} <span class="muted small">(${hitsOnOpp}/${TOTAL})</span></h3>
        ${gridHtml(c, (x, y) => { const s = myShots.find((q) => q.x === x && q.y === y); return s ? (s.hit ? "hit" : "miss") : ""; }, myTurn, myShots)}
        <h3 style="margin-top:1rem">Senin filon <span class="muted small">(${hitsOnMe}/${TOTAL} isabet aldı)</span></h3>
        ${gridHtml(c, (x, y) => {
          const s = theirShots.find((q) => q.x === x && q.y === y);
          const ship = fleet && shipAt(fleet.ships, x, y);
          return (ship ? "ship " : "") + (s ? (s.hit ? "hit" : "miss") : "") + (lastTheirs && lastTheirs.x === x && lastTheirs.y === y ? " last" : "");
        }, false, null, true)}
      </section>`;
    app.querySelectorAll("[data-xy]").forEach((b) => b.onclick = () => {
      if (!myTurn) return;
      const [x, y] = b.dataset.xy.split(",").map(Number);
      local.fired = st.n;
      c.input(`s${st.n}`, { x, y, at: Math.round(c.now()) });
      app.querySelectorAll("[data-xy]").forEach((q) => { q.disabled = true; });
    });
    if (!st.winner) bar(c, "n" + st.n, st.lastAt + SHOT_MS, SHOT_MS);
  },

  hostTick(c) {
    const { g } = c;
    if (g.phase === "place") {
      const ready = c.inputs.ready || {};
      if (g.p.every((k) => ready[k])) return c.advance(() => c.setG({ phase: "fire", fireAt: Math.round(c.now()) }));
      if (c.now() > g.endAt + 15000) return c.advance(() => c.setG({ phase: "end", forfeit: g.p.find((k) => !ready[k]), endAt: Math.round(c.now() + END_SHOW_MS) }));
      return;
    }
    if (g.phase === "end") {
      if (c.now() > g.endAt) c.advance(() => c.finish());
      return;
    }
    const st = replay(c.room);
    if (st.winner) return c.advance(() => c.setG({ phase: "end", endAt: Math.round(c.now() + END_SHOW_MS) }));
    if (st.pending) {
      // hedef cevap vermiyorsa (bağlantı koptu) hükmen kaybeder
      if (c.now() - (st.pending.at || st.lastAt) > REPLY_WAIT_MS) c.advance(() => c.setG({ phase: "end", forfeit: st.pending.target, endAt: Math.round(c.now() + END_SHOW_MS) }));
      return;
    }
    if (c.now() - st.lastAt > SHOT_MS + 1000) {
      // süre doldu: denenmemiş rastgele bir kareye ateş
      const tried = new Set(st.shots.filter((s) => s.shooter === st.turn).map((s) => `${s.x},${s.y}`));
      const free = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!tried.has(`${x},${y}`)) free.push([x, y]);
      const [x, y] = free[Math.floor(Math.random() * free.length)];
      c.advance(() => c.inputAs(`s${st.n}`, st.turn, { x, y, at: Math.round(c.now()), auto: true }));
    }
  },

  results(room) {
    const g = room.g;
    let winner = null;
    if (g?.forfeit) winner = g.p.find((k) => k !== g.forfeit);
    else if (g?.p) winner = replay(room).winner;
    return Object.keys(room.players || {}).map((k) => ({
      k, score: winner === k ? 1 : 0,
      label: winner === k ? (g.forfeit ? "Kazandı (hükmen)" : "Kazandı") : winner ? "Kaybetti" : "—"
    })).sort((a, b) => b.score - a.score);
  }
};

const shipAt = (ships, x, y) => ships.some((s) => s.some(([sx, sy]) => sx === x && sy === y));

function gridHtml(c, cls, clickable, shots, mine) {
  let html = `<div class="bs ${mine ? "mine" : ""}">`;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = cls(x, y);
    const tried = shots && shots.some((s) => s.x === x && s.y === y);
    html += `<button class="bscell ${k}" ${clickable && !tried ? `data-xy="${x},${y}"` : "disabled"}>${k.includes("hit") ? "🔥" : k.includes("miss") ? "•" : ""}</button>`;
  }
  return html + "</div>";
}

function bar(c, id, endAt, total) {
  const set = () => { const b = document.getElementById("cdbar"); if (b) b.style.width = Math.max(0, (endAt - c.now()) / total) * 100 + "%"; };
  set();
  if (c.local.barId !== id) {
    c.local.barId = id;
    const tick = () => { if (c.local.barId !== id || c.room.state !== "play") return; set(); c.timer(tick, 250); };
    c.timer(tick, 250);
  }
}

function renderEnd(c, st, fleet, name, opp) {
  const { local } = c;
  const app = document.getElementById("app");
  // yerleşimini aç (doğrulama için)
  if (fleet && !c.inputs.rev?.[c.me] && !local.revealed) {
    local.revealed = true;
    c.input("rev", { ships: JSON.stringify(fleet.ships), salt: fleet.salt });
  }
  const rev = c.inputs.rev?.[opp];
  let oppShips = null;
  try { oppShips = rev ? JSON.parse(rev.ships) : null; } catch { /* */ }
  if (rev && local.verified === undefined) {
    local.verified = "…";
    hashFleet(oppShips, rev.salt).then((h) => {
      local.verified = h === c.inputs.ready?.[opp]?.h && consistent(st, opp, oppShips) ? "ok" : "bad";
      if (c.room.g?.phase === "end") renderEnd(c, st, fleet, name, opp);
    });
  }
  const g = c.room.g;
  const winner = g.forfeit ? g.p.find((k) => k !== g.forfeit) : st.winner;
  const myShots = st.shots.filter((s) => s.shooter === c.me);
  app.innerHTML = `
    <section class="card center">
      <p class="eyebrow">🚢 Amiral Battı</p>
      <h2>${winner === c.me ? "Kazandın! 🏆" : winner ? `${name(winner)} kazandı` : "Oyun bitti"}</h2>
      ${g.forfeit ? `<p class="muted">${name(g.forfeit)} oyundan düştü.</p>` : ""}
      <h3 style="margin-top:.8rem">${name(opp)} filosu</h3>
      ${oppShips ? gridHtml(c, (x, y) => { const s = myShots.find((q) => q.x === x && q.y === y); return (shipAt(oppShips, x, y) ? "ship " : "") + (s ? (s.hit ? "hit" : "miss") : ""); }, false) : `<p class="muted small">Filo açılıyor…</p>`}
      <p class="small" style="margin-top:.6rem">${local.verified === "ok" ? "✓ Rakibin yerleşimi doğrulandı" : local.verified === "bad" ? "⚠️ Rakibin yerleşimi doğrulanamadı (hile şüphesi)" : ""}</p>
    </section>`;
}

// Açılan yerleşim, oyun sırasında verilen isabet/ıska cevaplarıyla tutarlı mı?
function consistent(st, owner, ships) {
  if (!Array.isArray(ships)) return false;
  return st.shots.filter((s) => s.target === owner).every((s) => shipAt(ships, s.x, s.y) === s.hit);
}
