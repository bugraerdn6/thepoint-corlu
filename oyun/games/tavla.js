// 🎲 Tavla — 2 kişi, tam kurallar, 1/3/5 sayılık maç, mars = 2 sayı.
// Zar iki telefonun birlikte ürettiği sayılardan çıkar (kimse önceden bilemez/değiştiremez):
//   hamle yapmayan taraf gizli bir sayının hash'ini kilitler → oynayan "Zar at" der (kendi sayısı) → gizli sayı açılır → zar = f(ikisi).
// Oyun durumu tamamen girdilerden her telefonda yeniden kurulur; yasadışı hamle sayılmaz.
import * as R from "./tavla-rules.js";
import { renderTavla } from "./tavla-ui.js";
import { chooseTurn } from "./tavla-bot.js";

export const BOT = "__bot";

const ROLL_MS = 25000;
const MOVE_MS = 60000;
const AUTO_WAIT_MS = 20000;   // otomatik adımları yapmayan (bağlantısı kopan) taraf hükmen kaybeder
const BETWEEN_GAMES_MS = 3500;

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
  minPlayers: 2, maxPlayers: 2, soloTest: false, bot: true,
  options: [{ key: "target", label: "Maç uzunluğu", default: 3, values: [{ v: 1, label: "Tek oyun" }, { v: 3, label: "3 sayı" }, { v: 5, label: "5 sayı" }] }],

  start(c) {
    const p = c.vsBot ? [c.me, BOT] : c.players.map((x) => x.k);
    if (Math.random() < 0.5) p.reverse();
    return { p, target: Number(c.opt("target")) || 3, startAt: Math.round(c.now()), ...(c.vsBot ? { bot: BOT } : {}) };
  },

  render(c) {
    const me = c.g.p.indexOf(c.me);
    const M = replayMatch(c.room);
    autoActions(c, M.cur, me, M);
    renderTavla(c, M, { replay: () => replayMatch(c.room), enc, BETWEEN_GAMES_MS, ROLL_MS, MOVE_MS, AUTO_WAIT_MS });
  },

  hostTick(c) {
    const { g } = c;
    const M = replayMatch(c.room);
    if (M.over) {
      if (c.now() > (M.cur.lastAt || 0) + 4000) c.advance(() => c.finish());
      return;
    }
    const st = M.cur;
    if (g.bot && g.p[st.side] === BOT) return botTick(c, st, M);
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

// ---------- bot: oda sahibinin telefonu botun adımlarını yapar ----------
function botTick(c, st, M) {
  const { local } = c;
  local.botDone = local.botDone || {};
  const key = st.pre + ":" + st.phase;
  if (local.botDone[key]) return;
  local.botDone[key] = true;
  const at = () => Math.round(c.now());
  const sKey = (k) => lsKey(c, "bot_" + k);
  const prevGame = M.games.length > 1 ? M.games[M.games.length - 2] : null;
  const pause = prevGame ? Math.max(0, prevGame.lastAt + BETWEEN_GAMES_MS - c.now()) : 0;
  const act = (fn, ms) => c.timer(() => { if (c.room.state === "play") fn(); }, ms);
  if (st.phase === "o-commit" || st.phase === "commit") {
    const secret = R.randomHex(16);
    try { localStorage.setItem(sKey(st.pre + "c"), secret); } catch { /* */ }
    act(() => c.inputAs(st.pre + "c", BOT, { h: R.sha256(secret), at: at() }), st.phase === "o-commit" ? pause + 200 : 150);
  } else if (st.phase === "o-reveal" || st.phase === "reveal") {
    let secret = null;
    try { secret = localStorage.getItem(sKey(st.pre + "c")); } catch { /* */ }
    if (secret) act(() => c.inputAs(st.pre + "s", BOT, { s: secret, at: at() }), 150);
  } else if (st.phase === "o-roll" || st.phase === "roll") {
    act(() => c.inputAs(st.pre + "r", BOT, { v: R.randomHex(8), at: at() }), st.phase === "roll" ? 900 : 400);
  } else if (st.phase === "move") {
    const moves = chooseTurn(st.v, st.dl);
    act(() => c.inputAs(st.pre + "m", BOT, { mv: enc(moves), at: at() }), 1500 + moves.length * 350); // düşünüyormuş gibi
  }
}

export { replayMatch };
// test için: önbellekleri temizle
export function _clearCaches() { ckpt.clear(); doneGames.clear(); valCache.clear(); shaMemo.clear(); }
