// 🎲 Tavla — 2 kişi, tam kurallar, 1/3/5 sayılık maç, mars = 2 sayı.
// Zar iki telefonun birlikte ürettiği sayılardan çıkar (kimse önceden bilemez/değiştiremez):
//   hamle yapmayan taraf gizli bir sayının hash'ini kilitler → oynayan "Zar at" der (kendi sayısı) → gizli sayı açılır → zar = f(ikisi).
// Oyun durumu tamamen girdilerden her telefonda yeniden kurulur; yasadışı hamle sayılmaz.
import * as R from "./tavla-rules.js";

const ROLL_MS = 25000;
const MOVE_MS = 60000;
const AUTO_WAIT_MS = 20000;   // otomatik adımları yapmayan (bağlantısı kopan) taraf hükmen kaybeder
const BETWEEN_GAMES_MS = 3500;
const CLR = ["#f3ede2", "#2b2622"]; // taraf 0 açık, taraf 1 koyu pul

const enc = (moves) => (moves.length ? moves.map((m) => `${m.from}-${m.to}-${m.d}`).join(",") : "-");
const dec = (s) => (!s || s === "-" ? [] : String(s).split(",").map((x) => { const [from, to, d] = x.split("-").map(Number); return { from, to, d }; }));
const lsKey = (c, key) => `tp_tv_${c.code}_${c.room.startedAt}_${key}`;
const valCache = new Map();
// Girdiler bir kez yazılır (sonradan değişmez), bu yüzden tamamlanan turlar güvenle önbelleğe alınır:
// her ekran yenilemesinde maçı baştan hesaplamak yerine kaldığı yerden devam eder.
const ckpt = new Map();   // "başlangıç|oyuncular|oyun" → { opening, n, real, lastTurn, lastAt }
const doneGames = new Map();
const shaMemo = new Map();
const sha = (x) => { x = String(x); if (!shaMemo.has(x)) { if (shaMemo.size > 5000) shaMemo.clear(); shaMemo.set(x, R.sha256(x)); } return shaMemo.get(x); };

function validateCached(v, dl, mv) {
  const k = JSON.stringify([v.p, v.bar, v.off, dl, mv]); // her alan ayrı: "1"+"10" ile "11"+"0" karışmasın
  if (!valCache.has(k)) { if (valCache.size > 3000) valCache.clear(); valCache.set(k, R.validateTurn(v, dl, dec(mv))); }
  return valCache.get(k);
}

// ---------- tek oyunu girdilerden yeniden kur ----------
function replayGame(room, gm, startAt) {
  const g = room.g;
  const ck = `${room.startedAt}|${g.p.join(",")}|${gm}`;
  if (doneGames.has(ck)) return doneGames.get(ck);
  const res = replayGameInner(room, gm, startAt, ck);
  if (res.over) { if (doneGames.size > 200) doneGames.clear(); doneGames.set(ck, res); }
  return res;
}

function replayGameInner(room, gm, startAt, ck) {
  const g = room.g;
  const saved = ckpt.get(ck);
  const I = (key, side) => room.in?.[key]?.[g.p[side]];
  let lastAt = startAt;
  const wait = (phase, side, extra = {}) => ({ gm, phase, side, lastAt, ...extra });
  const seen = (x) => { if (x?.at) lastAt = Math.max(lastAt, x.at); };

  // açılış: taraf 0 ve taraf 1 birer zar; büyük atan başlar ve iki zarı kullanır
  let starter = saved ? saved.starter : null, open = saved ? saved.open : null, k = 0;
  if (saved) lastAt = Math.max(lastAt, saved.openAt);
  for (; !saved && k < 30; k++) {
    const pre = `g${gm}o${k}`;
    const c = I(pre + "c", 1); if (!c) return wait("o-commit", 1, { pre });
    seen(c);
    const r = I(pre + "r", 0); if (!r) return wait("o-roll", 0, { pre });
    seen(r);
    const s = I(pre + "s", 1); if (!s) return wait("o-reveal", 1, { pre });
    seen(s);
    if (sha(s.s) !== c.h) return { gm, over: true, cheat: 1, winner: 0, pts: 1, lastAt };
    const [a, b] = R.deriveDice(s.s, r.v, pre);
    if (a !== b) { starter = a > b ? 0 : 1; open = [a, b]; break; }
  }
  if (starter === null) return wait("o-commit", 1, { pre: `g${gm}o${k}` });

  let real = R.initialReal();
  let lastTurn = null;
  let n0 = 0;
  if (saved && saved.n != null) {
    real = saved.real; lastTurn = saved.lastTurn; lastAt = Math.max(lastAt, saved.lastAt); n0 = saved.n + 1;
    // kayıt noktası oyunu bitiren tursa, kaldığı yerden devam ederken de "bitti" de
    const mv = (starter + saved.n) % 2;
    if (real.off[mv] === 15) return { gm, over: true, winner: mv, pts: real.off[1 - mv] === 0 ? 2 : 1, real, lastTurn, lastAt };
  }
  else ckpt.set(ck, { starter, open, openAt: lastAt });
  for (let n = n0; n < 1000; n++) {
    const mover = (starter + n) % 2, non = 1 - mover;
    const pre = `g${gm}t${n}`;
    let dice;
    if (n === 0) dice = open;
    else {
      const c = I(pre + "c", non); if (!c) return wait("commit", non, { pre, n, mover, real, lastTurn, starter, open });
      seen(c);
      const r = I(pre + "r", mover); if (!r) return wait("roll", mover, { pre, n, mover, real, lastTurn, starter, open });
      seen(r);
      const s = I(pre + "s", non); if (!s) return wait("reveal", non, { pre, n, mover, real, lastTurn, starter, open });
      seen(s);
      if (sha(s.s) !== c.h) return { gm, over: true, cheat: non, winner: mover, pts: 1, lastAt, real };
      dice = R.deriveDice(s.s, r.v, pre);
    }
    const dl = R.diceList(dice[0], dice[1]);
    const v = R.view(real, mover);
    const m = I(pre + "m", mover);
    const after = m ? validateCached(v, dl, m.mv) : null;
    if (!after) return wait("move", mover, { pre, n, mover, real, dice, dl, v, lastTurn, starter, open, invalid: !!m });
    seen(m);
    real = R.unview(after, mover);
    lastTurn = { mover, moves: dec(m.mv), dice, n };
    if (ckpt.size > 200) ckpt.clear();
    ckpt.set(ck, { starter, open, openAt: (ckpt.get(ck) || {}).openAt ?? lastAt, n, real, lastTurn, lastAt });
    if (real.off[mover] === 15) return { gm, over: true, winner: mover, pts: real.off[non] === 0 ? 2 : 1, real, lastTurn, lastAt };
  }
  return wait("move", 0, {});
}

function replayMatch(room) {
  const g = room.g;
  const score = [0, 0];
  const games = [];
  let startAt = g.startAt;
  for (let gm = 0; gm < 50; gm++) {
    const r = replayGame(room, gm, startAt);
    games.push(r);
    if (!r.over) return { score, games, cur: r, over: false };
    score[r.winner] += r.pts;
    if (r.cheat !== undefined || score[r.winner] >= g.target) return { score, games, cur: r, over: true, winner: r.winner };
    startAt = r.lastAt + BETWEEN_GAMES_MS;
  }
  return { score, games, cur: games[games.length - 1], over: true, winner: score[0] >= score[1] ? 0 : 1 };
}

// ---------- oyun modülü ----------
export default {
  id: "tavla", name: "Tavla", emoji: "🎲",
  desc: "2 kişi · Klasik tavla, maç usulü",
  rules: "Standart tavla kuralları: kırılan pul önce girer, iki zar da oynanabiliyorsa ikisi de oynanır, biri oynanabiliyorsa büyüğü. Çift gelirse 4 hamle. Bütün pullar evdeyken toplanır. <b>Rakip hiç pul toplamadan bitirirsen mars: 2 sayı.</b> Zar iki telefonun birlikte ürettiği sayılarla atılır, kimse önceden bilemez. Hamle süresi 60 sn.",
  minPlayers: 2, maxPlayers: 2, soloTest: false,
  options: [{ key: "target", label: "Maç uzunluğu", default: 3, values: [{ v: 1, label: "Tek oyun" }, { v: 3, label: "3 sayı" }, { v: 5, label: "5 sayı" }] }],

  start(c) {
    const p = c.players.map((x) => x.k);
    if (Math.random() < 0.5) p.reverse();
    return { p, target: Number(c.opt("target")) || 3, startAt: Math.round(c.now()) };
  },

  render(c) {
    const { g, local } = c;
    const app = document.getElementById("app");
    c.hideArena();
    const me = g.p.indexOf(c.me);
    const opp = 1 - me;
    const name = (side) => c.esc(c.room.players?.[g.p[side]]?.name || "?");
    const M = replayMatch(c.room);
    const st = M.cur;
    autoActions(c, st, me, M);

    // tahta durumu (oyun bittiyse son hali)
    const real = st.real || R.initialReal();
    let v = R.view(real, me);
    const myMove = st.phase === "move" && st.side === me && !M.over;
    if (local.pendKey !== st.pre) { local.pendKey = st.pre; local.pend = []; local.sel = null; }
    let info = null, steps = [];
    if (myMove) {
      info = local.info?.key === st.pre ? local.info.val : (local.info = { key: st.pre, val: R.turnInfo(st.v, st.dl) }).val;
      for (const m of local.pend) v = R.applyMove(v, m);
      steps = R.nextSteps(st.v, st.dl, local.pend, info);
    }
    const done = myMove && local.pend.length === info.total;
    const sources = new Set(steps.map((s) => s.from));
    const targets = local.sel != null ? steps.filter((s) => s.from === local.sel) : [];

    // durum yazısı
    let status = "";
    if (M.over) status = M.winner === me ? "Maçı kazandın! 🏆" : `${name(M.winner)} maçı kazandı`;
    else if (st.phase?.startsWith("o-")) status = "Açılış zarları atılıyor…";
    else if (st.phase === "roll") status = st.side === me ? "Sıra sende: zar at 🎲" : `${name(st.side)} zar atıyor…`;
    else if (st.phase === "commit" || st.phase === "reveal") status = "Zar hazırlanıyor…";
    else if (st.phase === "move") status = st.side === me ? (info.total === 0 ? "Oynanacak hamle yok 😕" : done ? "Hamlen tamam, onayla" : `Oyna: ${info.total - local.pend.length} hamle kaldı`) : `${name(st.side)} oynuyor…`;

    // önceki oyunun sonucu (maç devam ediyorsa kısa süre göster)
    const prevGame = M.games.length > 1 ? M.games[M.games.length - 2] : null;
    const justEnded = prevGame && c.now() - prevGame.lastAt < BETWEEN_GAMES_MS + 1500;

    // zar gösterimi
    const showDice = st.phase === "move" ? st.dice : st.lastTurn?.dice;
    const diceKey = st.pre + (st.dice || "");
    const rolling = st.phase === "move" && local.diceKey !== diceKey;
    if (rolling) { local.diceKey = diceKey; try { navigator.vibrate?.(30); } catch { /* */ } }

    app.innerHTML = `
      <section class="card center tv-card">
        <div class="tv-head">
          <span class="tv-pl ${st.side === opp && !M.over ? "on" : ""}"><i style="background:${CLR[opp]}"></i>${name(opp)} <small>${R.pips(R.view(real, opp))}</small></span>
          <span class="tv-score">${M.score[opp]} – ${M.score[me]}<small>${g.target > 1 ? `${g.target} sayılık maç` : "tek oyun"}</small></span>
          <span class="tv-pl ${st.side === me && !M.over ? "on" : ""}"><i style="background:${CLR[me]}"></i>Sen <small>${R.pips(R.view(real, me))}</small></span>
        </div>
        ${justEnded ? `<p class="tv-banner">${prevGame.winner === me ? "Bu oyunu kazandın" : `${name(prevGame.winner)} bu oyunu kazandı`}${prevGame.pts === 2 ? " · MARS! (2 sayı)" : ""}</p>` : ""}
        ${boardSvg(v, me, sources, targets, local.sel, st.lastTurn && st.lastTurn.mover === opp ? st.lastTurn.moves : [])}
        <div class="tv-bar">
          <div class="tv-dice ${rolling ? "roll" : ""}">${showDice ? diceFaces(showDice, st.phase === "move" ? local.pend.map((m) => m.d) : null, st.dl) : ""}</div>
          <p class="tv-status">${status}</p>
        </div>
        <div class="cd"><i id="cdbar"></i></div>
        <div class="row" style="margin-top:.7rem">
          ${st.phase === "roll" && st.side === me && !M.over ? `<button class="btn primary grow tv-roll" id="roll" ${local.rolled === st.pre ? "disabled" : ""}>🎲 Zar at</button>` : ""}
          ${myMove && info.total > 0 ? `
            <button class="btn grow" id="undo" ${local.pend.length ? "" : "disabled"}>↶ Geri al</button>
            <button class="btn primary grow" id="send" ${done && local.sent !== st.pre ? "" : "disabled"}>Bitir ✓</button>` : ""}
        </div>
      </section>`;

    // etkileşim
    app.querySelectorAll("[data-pt]").forEach((el) => el.addEventListener("click", () => {
      if (!myMove || done) return;
      const pt = Number(el.dataset.pt);
      const tgt = targets.filter((s) => s.to === pt).sort((a, b) => a.d - b.d)[0];
      if (local.sel != null && tgt) { local.pend.push(tgt); local.sel = null; return this.render(c); }
      if (sources.has(pt)) {
        const opts = steps.filter((s) => s.from === pt);
        const tos = [...new Set(opts.map((s) => s.to))];
        if (tos.length === 1) { local.pend.push(opts.sort((a, b) => a.d - b.d)[0]); local.sel = null; } // tek gidiş varsa direkt oyna
        else local.sel = local.sel === pt ? null : pt;
        return this.render(c);
      }
      local.sel = null; this.render(c);
    }));
    const undo = document.getElementById("undo");
    if (undo) undo.onclick = () => { local.pend.pop(); local.sel = null; this.render(c); };
    const send = document.getElementById("send");
    if (send) send.onclick = () => { local.sent = st.pre; c.input(st.pre + "m", { mv: enc(local.pend), at: Math.round(c.now()) }); };
    const roll = document.getElementById("roll");
    if (roll) roll.onclick = () => { local.rolled = st.pre; c.input(st.pre + "r", { v: R.randomHex(8), at: Math.round(c.now()) }); roll.disabled = true; };

    // süre çubuğu
    const total = st.phase === "move" ? MOVE_MS : st.phase === "roll" ? ROLL_MS : AUTO_WAIT_MS;
    bar(c, st.pre + st.phase, st.lastAt + total, total);
  },

  hostTick(c) {
    const { g } = c;
    const M = replayMatch(c.room);
    if (M.over) {
      if (c.now() > (M.cur.lastAt || 0) + 4000) c.advance(() => c.finish());
      return;
    }
    const st = M.cur;
    const idle = c.now() - st.lastAt;
    const who = g.p[st.side];
    if (["o-commit", "o-reveal", "commit", "reveal", "o-roll"].includes(st.phase)) {
      if (idle > AUTO_WAIT_MS + BETWEEN_GAMES_MS) c.advance(() => c.setG({ forfeit: who }).then(() => c.finish()));
      return;
    }
    if (st.phase === "roll" && idle > ROLL_MS + 1000) {
      c.advance(() => c.inputAs(st.pre + "r", who, { v: R.randomHex(8), at: Math.round(c.now()), auto: true }));
      return;
    }
    if (st.phase === "move" && (idle > MOVE_MS + 1000 || (st.invalid && idle > 3000))) {
      const moves = R.randomTurn(st.v, st.dl);
      c.advance(() => c.inputAs(st.pre + "m", who, { mv: enc(moves), at: Math.round(c.now()), auto: true }));
    }
  },

  results(room) {
    const g = room.g;
    if (!g?.p) return [];
    const M = replayMatch(room);
    let winner = M.over ? M.winner : null;
    if (g.forfeit) winner = g.p.indexOf(g.forfeit) === 0 ? 1 : 0;
    return g.p.map((k, side) => ({
      k, score: side === winner ? 1000 + M.score[side] : M.score[side],
      label: `${M.score[side]} sayı${side === winner ? (g.forfeit ? " · hükmen" : "") : ""}${M.cur?.cheat === side ? " · hile şüphesi" : ""}`
    })).sort((a, b) => b.score - a.score);
  }
};

// ---------- otomatik adımlar (gizli sayı kilitle/aç, açılış zarı, hamlesiz tur) ----------
function autoActions(c, st, me, M) {
  const { local } = c;
  if (M.over || !st.phase) return;
  local.sentKeys = local.sentKeys || {};
  const once = (key, fn, delay = 0) => {
    if (local.sentKeys[key] || c.inputs[key]?.[c.me]) return;
    local.sentKeys[key] = true;
    c.timer(fn, delay);
  };
  const prevGame = M.games.length > 1 ? M.games[M.games.length - 2] : null;
  const pause = prevGame ? Math.max(0, prevGame.lastAt + BETWEEN_GAMES_MS - c.now()) : 0;
  const commit = (key) => {
    const secret = R.randomHex(16);
    try { localStorage.setItem(lsKey(c, key), secret); } catch { /* */ }
    c.input(key, { h: R.sha256(secret), at: Math.round(c.now()) });
  };
  const reveal = (ckey, skey) => {
    let secret = null;
    try { secret = localStorage.getItem(lsKey(c, ckey)); } catch { /* */ }
    if (secret) c.input(skey, { s: secret, at: Math.round(c.now()) });
  };
  if (st.side !== me) return;
  if (st.phase === "o-commit") once(st.pre + "c", () => commit(st.pre + "c"), pause);
  if (st.phase === "o-roll") once(st.pre + "r", () => c.input(st.pre + "r", { v: R.randomHex(8), at: Math.round(c.now()) }), 500);
  if (st.phase === "o-reveal") once(st.pre + "s", () => reveal(st.pre + "c", st.pre + "s"), 300);
  if (st.phase === "commit") once(st.pre + "c", () => commit(st.pre + "c"));
  if (st.phase === "reveal") once(st.pre + "s", () => reveal(st.pre + "c", st.pre + "s"));
  if (st.phase === "move" && R.turnInfo(st.v, st.dl).total === 0) {
    once(st.pre + "m", () => c.input(st.pre + "m", { mv: "-", at: Math.round(c.now()) }), 1800);
  }
}

// ---------- çizim ----------
const W = 360, H = 310, PW = 24, X0 = 6, BX = 150, BW = 22, RX = 172, TRAY = 316, TOP = 6, BOT = 304, PH = 122, CR = 11;

function colX(pt) {
  if (pt <= 6) return RX + (6 - pt) * PW;
  if (pt <= 12) return X0 + (12 - pt) * PW;
  if (pt <= 18) return X0 + (pt - 13) * PW;
  return RX + (pt - 19) * PW;
}

function boardSvg(v, me, sources, targets, sel, oppMoves) {
  const tset = new Set(targets.map((t) => t.to));
  const lastOpp = new Set(oppMoves.map((m) => m.to).filter((x) => x >= 1 && x <= 24).map((x) => 25 - x)); // rakibin son hamlesinin vardığı haneler
  let s = `<svg xmlns="http://www.w3.org/2000/svg" class="tv-board" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tavla tahtası">
    <defs><linearGradient id="wood" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#7a4a24"/><stop offset="1" stop-color="#5a3317"/></linearGradient>
    <radialGradient id="ck0" cx=".35" cy=".35"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${CLR[0]}"/></radialGradient>
    <radialGradient id="ck1" cx=".35" cy=".35"><stop offset="0" stop-color="#5a524a"/><stop offset="1" stop-color="${CLR[1]}"/></radialGradient></defs>
    <rect x="0" y="0" width="${W}" height="${H}" rx="10" fill="url(#wood)"/>
    <rect x="${X0}" y="${TOP}" width="${PW * 6}" height="${BOT - TOP}" fill="#d9c08f"/>
    <rect x="${RX}" y="${TOP}" width="${PW * 6}" height="${BOT - TOP}" fill="#d9c08f"/>
    <rect x="${BX}" y="${TOP}" width="${BW}" height="${BOT - TOP}" fill="#4a2a12"/>
    <rect x="${TRAY}" y="${TOP}" width="${W - TRAY - 6}" height="${BOT - TOP}" rx="4" fill="#4a2a12"/>`;
  // üçgenler
  for (let pt = 1; pt <= 24; pt++) {
    const x = colX(pt), top = pt >= 13;
    const y0 = top ? TOP : BOT, y1 = top ? TOP + PH : BOT - PH;
    const dark = pt % 2 === 0;
    s += `<polygon points="${x},${y0} ${x + PW},${y0} ${x + PW / 2},${y1}" fill="${dark ? "#8c2f1b" : "#f2e6c9"}" ${lastOpp.has(pt) ? 'stroke="#ffd166" stroke-width="2"' : ""}/>`;
  }
  // pullar
  const myClr = me, opClr = 1 - me;
  const disc = (cx, cy, clr, label, glow) => `<circle cx="${cx}" cy="${cy}" r="${CR}" fill="url(#ck${clr})" stroke="${clr ? "#000" : "#9b8f7c"}" stroke-width="1" ${glow ? 'class="tv-src"' : ""}/>` +
    (label ? `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="${clr ? "#fff" : "#222"}">${label}</text>` : "");
  for (let pt = 1; pt <= 24; pt++) {
    const n = Math.abs(v.p[pt]); if (!n) continue;
    const mine = v.p[pt] > 0, top = pt >= 13, cx = colX(pt) + PW / 2;
    const show = Math.min(n, 5);
    for (let i = 0; i < show; i++) {
      const cy = top ? TOP + CR + 1 + i * (CR * 2) : BOT - CR - 1 - i * (CR * 2);
      s += disc(cx, cy, mine ? myClr : opClr, i === show - 1 && n > 5 ? n : "", mine && i === show - 1 && sources.has(pt));
    }
    if (sel === pt) s += `<rect x="${colX(pt) + 1}" y="${top ? TOP : BOT - PH}" width="${PW - 2}" height="${PH}" fill="none" stroke="#ffd166" stroke-width="2.5" rx="3"/>`;
  }
  // bar
  const bx = BX + BW / 2;
  for (let i = 0; i < v.bar[0]; i++) s += disc(bx, H / 2 + 18 + i * 20, myClr, i === Math.min(v.bar[0], 4) - 1 && v.bar[0] > 4 ? v.bar[0] : "", i === 0 && sources.has(R.BAR));
  for (let i = 0; i < Math.min(v.bar[1], 4); i++) s += disc(bx, H / 2 - 18 - i * 20, opClr, "");
  // toplanan pullar
  const tw = W - TRAY - 12;
  for (let i = 0; i < v.off[0]; i++) s += `<rect x="${TRAY + 3}" y="${BOT - 6 - i * 7}" width="${tw}" height="5" rx="1.5" fill="${CLR[myClr]}"/>`;
  for (let i = 0; i < v.off[1]; i++) s += `<rect x="${TRAY + 3}" y="${TOP + 1 + i * 7}" width="${tw}" height="5" rx="1.5" fill="${CLR[opClr]}"/>`;
  // hedef işaretleri
  for (const t of tset) {
    if (t === R.OFF) { s += `<rect x="${TRAY + 1}" y="${H / 2}" width="${W - TRAY - 8}" height="${BOT - H / 2}" fill="rgba(255,209,102,.35)" stroke="#ffd166" stroke-width="2" rx="4"/>`; continue; }
    const top = t >= 13, n = Math.abs(v.p[t]);
    const cy = top ? TOP + CR + 1 + Math.min(n, 4) * CR * 2 : BOT - CR - 1 - Math.min(n, 4) * CR * 2;
    s += `<circle cx="${colX(t) + PW / 2}" cy="${cy}" r="${CR - 1}" fill="rgba(255,209,102,.55)" stroke="#ffd166" stroke-width="2"/>`;
  }
  // dokunma alanları
  for (let pt = 1; pt <= 24; pt++) {
    const top = pt >= 13;
    s += `<rect data-pt="${pt}" x="${colX(pt)}" y="${top ? TOP : H / 2}" width="${PW}" height="${H / 2 - TOP}" fill="transparent"/>`;
  }
  s += `<rect data-pt="${R.BAR}" x="${BX}" y="${H / 2}" width="${BW}" height="${H / 2 - TOP}" fill="transparent"/>`;
  s += `<rect data-pt="${R.OFF}" x="${TRAY}" y="${H / 2}" width="${W - TRAY}" height="${H / 2}" fill="transparent"/>`;
  return s + "</svg>";
}

const PIPS = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
function diceFaces(dice, used, dl) {
  const all = dl || R.diceList(dice[0], dice[1]);
  const usedLeft = used ? used.slice() : [];
  return all.map((d) => {
    const i = usedLeft.indexOf(d);
    const u = i >= 0; if (u) usedLeft.splice(i, 1);
    return `<span class="tv-die ${u ? "used" : ""}">${PIPS[d]}</span>`;
  }).join("");
}

function bar(c, id, endAt, total) {
  const set = () => { const b = document.getElementById("cdbar"); if (b) b.style.width = Math.max(0, Math.min(1, (endAt - c.now()) / total)) * 100 + "%"; };
  set();
  if (c.local.barId !== id) {
    c.local.barId = id;
    const tick = () => { if (c.local.barId !== id || c.room.state !== "play") return; set(); c.timer(tick, 250); };
    c.timer(tick, 250);
  }
}

export { replayMatch };
// test için: önbellekleri temizle
export function _clearCaches() { ckpt.clear(); doneGames.clear(); valCache.clear(); shaMemo.clear(); }
