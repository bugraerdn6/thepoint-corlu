// 🤖 Test oyuncuları — sadece yöneticinin lobide eklediği botlar. Oda sahibinin telefonu her botun adımlarını yapar.
// Her fonksiyon (c, k) alır: c = oyun bağlamı, k = botun anahtarı ("__bot1" gibi). Tekrar çağrılabilir olmalı (her
// veri değişiminde ve 250 ms'de bir çalışır), bu yüzden her adım bir kez planlanır (b.done[...] bayrakları).
import * as TR from "./tavla-rules.js";
import { RANKS, rankOf } from "./cards.js";
import { replay as c4replay } from "./dortlu.js";
import { replay as bsReplay, randomFleet } from "./amiral.js";
import { bids as zarBids, alive as zarAlive } from "./zar.js";
import { resolveTurn } from "./yasak.js";
import { resolveTurn as ssResolve } from "./sessiz.js";
import { replay as dmReplay, chooseMove as dmChoose } from "./dama.js";
import { encMove as dmEnc } from "./dama-rules.js";
import { WORDS as CIZ_WORDS } from "./ciz.js";
import { alive as vkAlive } from "./vampir.js";

export const isBotKey = (k) => typeof k === "string" && k.startsWith("__bot");
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// bot başına küçük hafıza (oda sahibinin telefonunda)
function mem(c, k) {
  c.local.bots = c.local.bots || {};
  return (c.local.bots[k] = c.local.bots[k] || { done: {} });
}
// bir adımı bir kez, biraz gecikmeyle yap (insan gibi)
function once(c, k, key, ms, fn) {
  const b = mem(c, k);
  if (b.done[key]) return;
  b.done[key] = true;
  c.timer(() => { if (c.room.state === "play") fn(); }, ms);
}
const had = (c, key, k) => !!c.inputs[key]?.[k];
const at = (c) => Math.round(c.now());

// ---------- soru oyunları (Refleks hariç hepsi makeQuiz) ----------
function quizBot(c, k) {
  const { g } = c;
  if (g.phase !== "q") return;
  const r = g.round, q = g.qs[r], key = `q${r}`;
  if (had(c, key, k)) return;
  const tm = q.tm || 12000;
  const left = g.endAt - c.now();
  if (left <= 300) return;
  once(c, k, key, Math.min(left - 250, rnd(1200, Math.max(1500, tm * 0.6))), () => {
    const t = Math.max(0, Math.round(c.now() - (g.endAt - tm)));
    if (q.b) c.inputAs(key, k, { w: Math.random() < 0.55 ? q.ans : [...q.s].sort(() => Math.random() - 0.5).join(""), t });
    else if (q.a !== undefined) c.inputAs(key, k, { c: Math.random() < 0.6 ? q.a : Math.floor(Math.random() * q.o.length), t });
    else c.inputAs(key, k, { c: Math.floor(Math.random() * q.o.length), t });
  });
}

// ---------- Refleks ----------
function refleksBot(c, k) {
  const { g } = c;
  if (g.phase !== "wait") return;
  const key = `r${g.round}`;
  if (had(c, key, k)) return;
  const ms = Math.round(rnd(230, 480));
  once(c, k, key, Math.max(0, g.goAt - c.now()) + ms, () => c.inputAs(key, k, { ms }));
}

// ---------- İki Doğru Bir Yalan ----------
const TRUTHS = ["Hiç uçağa binmedim", "3 dil konuşurum", "Bir ünlüyle tanıştım", "Hiç kemik kırmadım", "Gitar çalabilirim", "Japonya'ya gittim", "Hiç kahve içmem", "Maratona katıldım", "Kedim var", "Denizde boğuluyordum"];
function ikiDogruBot(c, k) {
  const { g } = c;
  const b = mem(c, k);
  if (g.phase === "write" && !had(c, "w", k)) {
    once(c, k, "w", rnd(2000, 6000), () => {
      const s = [...TRUTHS].sort(() => Math.random() - 0.5).slice(0, 3);
      b.lie = Math.floor(Math.random() * 3);
      c.inputAs("w", k, { s });
    });
    return;
  }
  const r = g.round, author = g.authors?.[r];
  if (g.phase === "vote" && author !== k && !had(c, `v${r}`, k)) once(c, k, `v${r}`, rnd(2000, 7000), () => c.inputAs(`v${r}`, k, { c: Math.floor(Math.random() * 3) }));
  if (g.phase === "reveal" && author === k && !had(c, `l${r}`, k)) once(c, k, `l${r}`, 400, () => c.inputAs(`l${r}`, k, { l: b.lie ?? 0 }));
}

// ---------- Hikaye Zinciri ----------
const LINES = ["Ve tam o anda kapı çaldı.", "Herkes birbirine baktı ve kahkahayı bastı.", "Garson elinde bir ördekle geri döndü.", "Işıklar yandığında masada bir harita vardı.", "Sonra DJ en sevdiğimiz şarkıyı çaldı.", "Kimse ne olduğunu anlamadı ama çok eğlendik.", "O gece hiçbirimiz unutmadık."];
function hikayeBot(c, k) {
  const { g } = c;
  if (g.phase === "write") {
    const writer = g.order[g.n % g.order.length], key = `s${g.n}`;
    if (writer === k && !had(c, key, k)) once(c, k, key, rnd(2500, 5000), () => c.inputAs(key, k, { t: pick(LINES) }));
  }
  if (g.phase === "vote" && !had(c, "vote", k)) {
    const options = Array.from({ length: g.turns }, (_, i) => i).filter((i) => g.order[i % g.order.length] !== k);
    if (options.length) once(c, k, "vote", rnd(2000, 6000), () => c.inputAs("vote", k, { i: pick(options) }));
  }
}

// ---------- Yasak Kelime ----------
function yasakBot(c, k) {
  const { g } = c;
  if (g.phase !== "turn") return;
  const d = g.order[g.turn];
  const n = resolveTurn(c.room, g.turn).length;
  const key = `t${g.turn}c${n}`;
  if (had(c, key, k)) return;
  if (d.k === k) once(c, k, key, rnd(4000, 8000), () => c.inputAs(key, k, { r: Math.random() < 0.75 ? "ok" : "pas", at: at(c) }));
  else if (c.room.players?.[k]?.team && c.room.players[k].team !== d.team) {
    // rakip takım: her kart için bir kez karar ver (%8 "yasak!")
    const b = mem(c, k);
    if (b.done["dec" + key]) return;
    b.done["dec" + key] = true;
    if (Math.random() < 0.08) once(c, k, key, rnd(2500, 4000), () => { if (resolveTurn(c.room, c.g.turn).length === n) c.inputAs(key, k, { r: "tabu", at: at(c) }); });
  }
}

// ---------- Sessiz Sinema (bot anlatıcı: arada bir "bildiler") ----------
function sessizBot(c, k) {
  const { g } = c;
  if (g.phase !== "turn" || g.order[g.turn].k !== k) return;
  const n = ssResolve(c.room, g.turn).length, key = `t${g.turn}c${n}`;
  if (had(c, key, k)) return;
  once(c, k, key, rnd(5000, 11000), () => c.inputAs(key, k, { r: Math.random() < 0.7 ? "ok" : "pas", at: at(c) }));
}

// ---------- Hiç Yapmadım ----------
function hicBot(c, k) {
  const { g } = c;
  if (g.phase !== "q" || had(c, `h${g.round}`, k)) return;
  once(c, k, `h${g.round}`, rnd(1500, 6000), () => c.inputAs(`h${g.round}`, k, { y: Math.random() < 0.4 }));
}

// ---------- Dama ----------
function damaBot(c, k) {
  const st = dmReplay(c.room);
  if (st.winner || st.draw || st.turn !== k) return;
  const key = `m${st.n}`;
  if (had(c, key, k)) return;
  once(c, k, key, rnd(900, 1800), () => { const m = dmChoose(st.board, st.side, st.legal); if (m) c.inputAs(key, k, { path: dmEnc(m), at: at(c) }); });
}

// ---------- Çiz-Tahmin ----------
function cizBot(c, k) {
  const { g } = c;
  const t = g.turn, drawer = g.order[t];
  if (g.phase === "pick" && drawer === k && !had(c, `w${t}`, k)) { once(c, k, `w${t}`, rnd(1500, 3500), () => c.inputAs(`w${t}`, k, { i: Math.floor(Math.random() * 3) })); return; }
  if (g.phase !== "draw") return;
  if (drawer === k) {
    // birkaç karalama çizgisi
    for (let n = 1; n <= 8; n++) once(c, k, `s${t}_${n}`, n * rnd(1200, 2200), () => {
      let x = rnd(150, 850), y = rnd(120, 630);
      const pts = [[x, y]];
      for (let i = 0; i < 12; i++) { x = Math.max(20, Math.min(980, x + rnd(-80, 80))); y = Math.max(20, Math.min(730, y + rnd(-60, 60))); pts.push([Math.round(x), Math.round(y)]); }
      c.inputAs(`s${t}_${n}`, k, { p: pts.map((p) => p.join(",")).join(";"), c: Math.floor(Math.random() * 4), w: 7 });
    });
    return;
  }
  // tahmin eden bot: birkaç yanlış tahmin, bazen doğrusu
  for (let n = 1; n <= 4; n++) once(c, k, `g${t}_${n}`, rnd(4000, 16000) + n * 6000, () => {
    if (c.g.phase !== "draw" || c.g.turn !== t) return;
    const right = n === 4 && Math.random() < 0.6;
    c.inputAs(`g${t}_${n}`, k, { t: right ? c.g.word : pick(CIZ_WORDS), at: at(c) });
  });
}

// ---------- Dörtlü Bağla ----------
function c4Wins(board, col, v) {
  let row = -1;
  for (let r = 5; r >= 0; r--) if (board[r][col] === null) { row = r; break; }
  if (row < 0) return false;
  const b = board.map((x) => x.slice()); b[row][col] = v;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let cnt = 1;
    for (const s of [1, -1]) { let rr = row + dr * s, cc = col + dc * s; while (rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && b[rr][cc] === v) { cnt++; rr += dr * s; cc += dc * s; } }
    if (cnt >= 4) return true;
  }
  return false;
}
function dortluBot(c, k) {
  const st = c4replay(c.room);
  if (st.winner || st.draw || st.turn !== k) return;
  const key = `m${st.n}`;
  if (had(c, key, k)) return;
  once(c, k, key, rnd(700, 1600), () => {
    const me = c.g.p.indexOf(k), opp = 1 - me;
    const cols = [0, 1, 2, 3, 4, 5, 6].filter((x) => st.board[0][x] === null);
    const col = cols.find((x) => c4Wins(st.board, x, me)) ?? cols.find((x) => c4Wins(st.board, x, opp))
      ?? cols.sort((a, b) => Math.abs(3 - a) - Math.abs(3 - b) + rnd(-1.5, 1.5))[0];
    c.inputAs(key, k, { col, at: at(c) });
  });
}

// ---------- Amiral Battı ----------
function amiralBot(c, k) {
  const { g } = c;
  const b = mem(c, k);
  if (!b.fleet) { b.fleet = randomFleet(); b.salt = TR.randomHex(8); }
  if (g.phase === "place") {
    if (!had(c, "ready", k)) once(c, k, "ready", rnd(1500, 3500), () => c.inputAs("ready", k, { h: TR.sha256(JSON.stringify(b.fleet) + "|" + b.salt) }));
    return;
  }
  if (g.phase === "end") {
    if (!had(c, "rev", k)) once(c, k, "rev", 300, () => c.inputAs("rev", k, { ships: JSON.stringify(b.fleet), salt: b.salt }));
    return;
  }
  const st = bsReplay(c.room);
  if (st.winner) return;
  // bana ateş edildiyse cevap ver
  if (st.pending && st.pending.target === k && !had(c, `r${st.pending.n}`, k)) {
    once(c, k, `r${st.pending.n}`, 250, () => {
      const { x, y } = st.pending;
      const idx = b.fleet.findIndex((s) => s.some(([sx, sy]) => sx === x && sy === y));
      let sunk = 0;
      if (idx >= 0) {
        const ship = b.fleet[idx];
        const prev = st.shots.filter((s) => s.target === k && s.hit && ship.some(([sx, sy]) => sx === s.x && sy === s.y)).length;
        if (prev + 1 === ship.length) sunk = ship.length;
      }
      c.inputAs(`r${st.pending.n}`, k, { hit: idx >= 0, sunk, at: at(c) });
    });
    return;
  }
  // sıra bende: av modu (batmamış isabetlerin yanı), yoksa dama deseninde rastgele
  if (!st.pending && st.turn === k && !had(c, `s${st.n}`, k)) {
    once(c, k, `s${st.n}`, rnd(900, 1800), () => {
      const mine = st.shots.filter((s) => s.shooter === k);
      const tried = new Set(mine.map((s) => `${s.x},${s.y}`));
      const free = (x, y) => x >= 0 && y >= 0 && x < 8 && y < 8 && !tried.has(`${x},${y}`);
      const hunt = [];
      for (const s of mine.filter((s) => s.hit && !s.sunk)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (free(s.x + dx, s.y + dy)) hunt.push([s.x + dx, s.y + dy]);
      let target = hunt.length ? pick(hunt) : null;
      if (!target) { const opts = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (free(x, y) && (x + y) % 2 === 0) opts.push([x, y]); target = opts.length ? pick(opts) : null; }
      if (!target) { for (let y = 0; y < 8 && !target; y++) for (let x = 0; x < 8; x++) if (free(x, y)) { target = [x, y]; break; } }
      if (target) c.inputAs(`s${st.n}`, k, { x: target[0], y: target[1], at: at(c) });
    });
  }
}

// ---------- Yalancı Zar ----------
function zarBot(c, k) {
  const { g } = c;
  const b = mem(c, k);
  const r = g.round;
  if (!(g.dice?.[k] > 0)) return;
  if (!b.hands) b.hands = {};
  if (!b.hands[r]) b.hands[r] = { d: Array.from({ length: g.dice[k] }, () => 1 + Math.floor(Math.random() * 6)), salt: TR.randomHex(8) };
  const hand = b.hands[r];
  if (g.phase === "roll" && !had(c, `c${r}`, k)) once(c, k, `c${r}`, 300, () => c.inputAs(`c${r}`, k, { h: TR.sha256(JSON.stringify(hand.d) + "|" + hand.salt) }));
  if (g.phase === "reveal" && !had(c, `v${r}`, k)) once(c, k, `v${r}`, 300, () => c.inputAs(`v${r}`, k, { d: hand.d, salt: hand.salt }));
  if (g.phase !== "bid") return;
  const bd = zarBids(c.room);
  if (bd.turn !== k || bd.called) return;
  const key = `b${r}_${bd.n}`;
  if (had(c, key, k)) return;
  once(c, k, key, rnd(1200, 2600), () => {
    const total = zarAlive(g).reduce((a, x) => a + g.dice[x], 0);
    const others = total - hand.d.length;
    const count = (f) => hand.d.filter((x) => x === f).length;
    const prev = bd.list.filter((x) => !x.call).pop();
    if (prev) {
      const expected = count(prev.f) + others / 6;
      if (prev.q > expected + 1.2) { c.inputAs(key, k, { call: true, at: at(c) }); return; }
    }
    // en çok olan yüzle, mümkün olan en küçük yükseltme
    const faces = [1, 2, 3, 4, 5, 6].sort((a, z) => count(z) - count(a));
    for (const f of faces) {
      const q = !prev ? Math.max(1, count(f)) : f > prev.f ? prev.q : prev.q + 1;
      if (q <= total && (!prev || q > prev.q || (q === prev.q && f > prev.f))) { c.inputAs(key, k, { q, f, at: at(c) }); return; }
    }
    c.inputAs(key, k, { call: true, at: at(c) });
  });
}

// ---------- Pişti ----------
const cardPts = (x) => (rankOf(x) === "A" || rankOf(x) === "J" ? 1 : 0) + (x === "♣2" ? 2 : 0) + (x === "♦10" ? 3 : 0);
function pistiBot(c, k) {
  const { g } = c;
  if (g.turn !== k) return;
  const key = `a${g.seq}`;
  if (had(c, key, k)) return;
  once(c, k, key, rnd(900, 1700), () => {
    const hand = g.hands?.[k] || [];
    if (!hand.length) return;
    const table = g.table || [], top = table[table.length - 1];
    let card = top && hand.find((x) => rankOf(x) === rankOf(top)); // aynı sayı (tek kartsa pişti)
    if (!card && top && table.length > 1) card = hand.find((x) => rankOf(x) === "J"); // kalabalık masayı vale ile al
    if (!card) card = hand.filter((x) => rankOf(x) !== "J").sort((a, z) => cardPts(a) - cardPts(z))[0] || hand[0];
    c.inputAs(key, k, { card });
  });
}

// ---------- Blöf ----------
function blofBot(c, k) {
  const { g } = c;
  const lp = g.lastPlay;
  const hand = g.hands?.[k] || [];
  // blöf de
  if (lp && lp.k !== k && !had(c, `x${lp.no}`, k)) {
    const mineOfClaim = hand.filter((x) => rankOf(x) === lp.claim).length;
    const impossible = mineOfClaim + lp.n > 4;
    const p = impossible ? 1 : g.pendingWin ? 0.55 : 0.12;
    const b = mem(c, k);
    if (!b.done[`dec${lp.no}`]) {
      b.done[`dec${lp.no}`] = true;
      if (Math.random() < p) once(c, k, `x${lp.no}`, rnd(700, 1800), () => { if (c.g.lastPlay?.no === lp.no) c.inputAs(`x${lp.no}`, k, { at: at(c) }); });
    }
  }
  if (g.turn !== k || g.pendingWin) return;
  const key = `a${g.seq}`;
  if (had(c, key, k) || !hand.length) return;
  once(c, k, key, rnd(1400, 2600), () => {
    const claim = RANKS[g.rank % 13];
    const real = hand.filter((x) => rankOf(x) === claim).slice(0, 4);
    const cards = real.length ? real : [...hand].sort(() => Math.random() - 0.5).slice(0, Math.random() < 0.7 ? 1 : Math.min(2, hand.length));
    c.inputAs(key, k, { cards });
  });
}

// ---------- Vampir Köylü ----------
function vampirBot(c, k) {
  const { g } = c;
  const r = g.round, al = vkAlive(g);
  if (g.dead?.[k] || !al.includes(k)) return;
  const role = g.roles[k];
  const others = al.filter((x) => x !== k);
  if (g.phase === "night") {
    if (role === "vamp" && !had(c, `na${r}`, k)) once(c, k, `na${r}`, rnd(2000, 6000), () => {
      const prey = al.filter((x) => c.g.roles[x] !== "vamp");
      const mate = Object.values(c.inputs[`na${r}`] || {})[0]?.t; // diğer vampirle aynı kişiyi seç
      if (prey.length) c.inputAs(`na${r}`, k, { t: prey.includes(mate) ? mate : pick(prey) });
    });
    if (role === "doc" && !had(c, `nd${r}`, k)) once(c, k, `nd${r}`, rnd(2000, 6000), () => c.inputAs(`nd${r}`, k, { t: pick(al) }));
    if (role === "seer" && !had(c, `ns${r}`, k) && others.length) once(c, k, `ns${r}`, rnd(2000, 6000), () => c.inputAs(`ns${r}`, k, { t: pick(others) }));
    return;
  }
  if (g.phase === "day" && !had(c, `dv${r}`, k)) once(c, k, `dv${r}`, rnd(5000, 20000), () => {
    const pool = role === "vamp" ? others.filter((x) => c.g.roles[x] !== "vamp") : others;
    c.inputAs(`dv${r}`, k, { t: Math.random() < 0.12 || !pool.length ? "skip" : pick(pool) });
  });
}

export const BOTS = {
  refleks: refleksBot,
  yabu: quizBot, masadakim: quizBot, emojifilm: quizBot, kelime: quizBot, yuksekalcak: quizBot, duello: quizBot,
  ikidogru: ikiDogruBot, hikaye: hikayeBot, yasak: yasakBot, sessiz: sessizBot, hicyapmadim: hicBot, dama: damaBot, ciz: cizBot, vampir: vampirBot,
  dortlu: dortluBot, amiral: amiralBot, zar: zarBot, pisti: pistiBot, blof: blofBot
  // tavla: botlarını tavla.js kendi yönetir
};
