// Tavla kural motoru — ekrandan bağımsız, saf fonksiyonlar.
// Gerçek tahta: p[1..24], pozitif = taraf 0'ın pulları, negatif = taraf 1'in pulları.
// Taraf 0, 24'ten 1'e doğru oynar (evi 1–6). Taraf 1, 1'den 24'e doğru oynar (evi 19–24).
// Hamleler her zaman oynayanın "bakış açısında" (view) üretilir: kendi pulları pozitif, 24 → 1 yönünde,
// bar = 25, toplama = 0.

export const BAR = 25, OFF = 0;

export function initialReal() {
  const p = new Array(26).fill(0);
  p[24] = 2; p[13] = 5; p[8] = 3; p[6] = 5;      // taraf 0
  p[1] = -2; p[12] = -5; p[17] = -3; p[19] = -5;  // taraf 1
  return { p, bar: [0, 0], off: [0, 0] };
}

// Gerçek tahtayı oynayanın bakış açısına çevir
export function view(real, side) {
  if (side === 0) return { p: real.p.slice(), bar: real.bar.slice(), off: real.off.slice() };
  const p = new Array(26).fill(0);
  for (let i = 1; i <= 24; i++) p[i] = -real.p[25 - i];
  return { p, bar: [real.bar[1], real.bar[0]], off: [real.off[1], real.off[0]] };
}
export function unview(v, side) {
  if (side === 0) return { p: v.p.slice(), bar: v.bar.slice(), off: v.off.slice() };
  const p = new Array(26).fill(0);
  for (let i = 1; i <= 24; i++) p[25 - i] = -v.p[i];
  return { p, bar: [v.bar[1], v.bar[0]], off: [v.off[1], v.off[0]] };
}

const allHome = (v) => v.bar[0] === 0 && v.p.slice(7, 25).every((x) => x <= 0);
const highest = (v) => { for (let i = 24; i >= 1; i--) if (v.p[i] > 0) return i; return 0; };

// Tek zarla yapılabilecek hamleler
export function singleMoves(v, d) {
  const out = [];
  if (v.bar[0] > 0) {
    const to = 25 - d;
    if (v.p[to] >= -1) out.push({ from: BAR, to, d });
    return out;
  }
  const home = allHome(v);
  const hi = home ? highest(v) : 0;
  for (let from = 1; from <= 24; from++) {
    if (v.p[from] <= 0) continue;
    const to = from - d;
    if (to >= 1) { if (v.p[to] >= -1) out.push({ from, to, d }); }
    else if (home && (to === 0 || from === hi)) out.push({ from, to: OFF, d }); // tam ya da en geridekini büyük zarla topla
  }
  return out;
}

export function applyMove(v, m) {
  const n = { p: v.p.slice(), bar: v.bar.slice(), off: v.off.slice() };
  if (m.from === BAR) n.bar[0]--; else n.p[m.from]--;
  if (m.to === OFF) { n.off[0]++; return n; }
  if (n.p[m.to] === -1) { n.p[m.to] = 0; n.bar[1]++; } // kırma
  n.p[m.to]++;
  return n;
}

const keyOf = (v) => v.p.join(",") + "|" + v.bar.join(",") + "|" + v.off.join(",");
const removeOne = (dice, d) => { const i = dice.indexOf(d); const r = dice.slice(); r.splice(i, 1); return r; };
const uniq = (a) => [...new Set(a)];

export const diceList = (d1, d2) => (d1 === d2 ? [d1, d1, d1, d1] : [d1, d2]);

// Kalan zarlarla en fazla kaç hamle yapılabilir (bellekli arama)
export function maxDepth(v, dice, memo = new Map()) {
  if (!dice.length || v.off[0] === 15) return 0;
  const k = keyOf(v) + "#" + dice.slice().sort().join("");
  if (memo.has(k)) return memo.get(k);
  let best = 0;
  for (const d of uniq(dice)) {
    for (const m of singleMoves(v, d)) {
      const r = 1 + maxDepth(applyMove(v, m), removeOne(dice, d), memo);
      if (r > best) best = r;
      if (best === dice.length) break;
    }
    if (best === dice.length) break;
  }
  memo.set(k, best);
  return best;
}

// Tur başı analizi: kaç hamle zorunlu, büyük zar kuralı geçerli mi
export function turnInfo(v, dice) {
  const memo = new Map();
  const total = maxDepth(v, dice, memo);
  let mustDie = null;
  if (total === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const big = Math.max(...dice);
    if (singleMoves(v, big).length) mustDie = big; // sadece biri oynanabiliyorsa büyük zar zorunlu
  }
  return { total, mustDie, memo };
}

// Önek (bu turda yapılmış hamleler) sonrası yasal bir sonraki adımlar
export function nextSteps(v0, dice, prefix, info = turnInfo(v0, dice)) {
  let v = v0, rem = dice.slice();
  for (const m of prefix) { v = applyMove(v, m); rem = removeOne(rem, m.d); }
  const need = info.total - prefix.length;
  if (need <= 0) return [];
  const out = [];
  for (const d of uniq(rem)) {
    if (info.mustDie && d !== info.mustDie) continue;
    for (const m of singleMoves(v, d)) {
      if (maxDepth(applyMove(v, m), removeOne(rem, d), info.memo) === need - 1) out.push(m);
    }
  }
  return out;
}

// Bir turun hamle listesi yasal mı? Yasalsa son durumu döndür.
export function validateTurn(v0, dice, moves) {
  const info = turnInfo(v0, dice);
  if (!Array.isArray(moves) || moves.length !== info.total) return null;
  let v = v0;
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const ok = nextSteps(v0, dice, moves.slice(0, i), info).some((s) => s.from === m.from && s.to === m.to && s.d === m.d);
    if (!ok) return null;
    v = applyMove(v, m);
  }
  return v;
}

// Rastgele ama yasal tam bir tur (süre dolunca otomatik oynamak için)
export function randomTurn(v0, dice, rnd = Math.random) {
  const info = turnInfo(v0, dice);
  const moves = [];
  for (let i = 0; i < info.total; i++) {
    const opts = nextSteps(v0, dice, moves, info);
    moves.push(opts[Math.floor(rnd() * opts.length)]);
  }
  return moves;
}

export const pips = (v) => { let s = v.bar[0] * 25; for (let i = 1; i <= 24; i++) if (v.p[i] > 0) s += i * v.p[i]; return s; };
export const oppPips = (v) => { let s = v.bar[1] * 25; for (let i = 1; i <= 24; i++) if (v.p[i] < 0) s += (25 - i) * -v.p[i]; return s; };

// ---------- senkron SHA-256 (adil zar için; tarayıcıda ve testte aynı sonuç) ----------
const PRIMES = []; for (let n = 2; PRIMES.length < 64; n++) if (PRIMES.every((q) => n % q)) PRIMES.push(n);
const frac32 = (x) => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
const K = PRIMES.map((q) => frac32(Math.cbrt(q)));
const H0 = PRIMES.slice(0, 8).map((q) => frac32(Math.sqrt(q)));
const ror = (x, n) => (x >>> n) | (x << (32 - n));

export function sha256(str) {
  const bytes = new TextEncoder().encode(str);
  const len = bytes.length;
  const buf = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  buf.set(bytes); buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(buf.length - 4, (len * 8) >>> 0);
  dv.setUint32(buf.length - 8, Math.floor((len * 8) / 4294967296));
  const h = H0.slice();
  const w = new Uint32Array(64);
  for (let i = 0; i < buf.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15], y = w[t - 2];
      w[t] = (w[t - 16] + (ror(x, 7) ^ ror(x, 18) ^ (x >>> 3)) + w[t - 7] + (ror(y, 17) ^ ror(y, 19) ^ (y >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (hh + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) >>> 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}

// İki tarafın gizli sayısından iki zar (6'nın katı olmayan baytlar atılır → eşit olasılık)
export function deriveDice(secret, rollVal, tag) {
  let hex = sha256(`${secret}|${rollVal}|${tag}`);
  const dice = [];
  for (let round = 0; dice.length < 2; round++) {
    for (let i = 0; i < hex.length && dice.length < 2; i += 2) {
      const b = parseInt(hex.slice(i, i + 2), 16);
      if (b < 252) dice.push((b % 6) + 1);
    }
    hex = sha256(hex + round);
  }
  return dice;
}

export const randomHex = (n = 16) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
