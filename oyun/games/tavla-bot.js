// 🤖 Tavla botu — her turda yasal bütün hamle dizilerini dener, sonuç pozisyonları puanlar, en iyisini seçer.
// Bakış açısı: botun kendi pulları pozitif, 24 → 1 yönünde (rakip 1 → 24 yönünde ilerler).
import * as R from "./tavla-rules.js";

// Yasal tam tur dizilerini üret (aynı sonuca varan diziler tek sayılır)
export function allTurns(v0, dl, cap = 2500) {
  const info = R.turnInfo(v0, dl);
  if (info.total === 0) return [{ moves: [], v: v0 }];
  const out = new Map();
  const dfs = (prefix, v) => {
    if (out.size >= cap) return;
    if (prefix.length === info.total) {
      const k = JSON.stringify([v.p, v.bar, v.off]);
      if (!out.has(k)) out.set(k, { moves: prefix.slice(), v });
      return;
    }
    for (const s of R.nextSteps(v0, dl, prefix, info)) {
      prefix.push(s); dfs(prefix, R.applyMove(v, s)); prefix.pop();
    }
  };
  dfs([], v0);
  return [...out.values()];
}

// Rakibin bir pulu bu haneyi ne kadar tehdit ediyor (doğrudan atış ağırlıklı kaba tahmin)
function threat(v, p) {
  let t = 0;
  const shooters = [];
  for (let q = 1; q < p; q++) if (v.p[q] < 0) shooters.push(q);
  if (v.bar[1] > 0) shooters.push(0); // bardaki rakip pul 1–6'ya girer
  for (const q of shooters) {
    const d = p - q;
    if (d >= 1 && d <= 6) t += 3;
    else if (d <= 12) t += 1;
  }
  return t;
}

export function evaluate(v, before) {
  let s = 0;
  const contact = (() => { let myBack = 0, oppFront = 25; for (let i = 24; i >= 1; i--) if (v.p[i] > 0) { myBack = i; break; } for (let i = 1; i <= 24; i++) if (v.p[i] < 0) { oppFront = i; break; } return v.bar[1] > 0 || v.bar[0] > 0 || myBack > oppFront; })();

  // kırma: rakip bara gittiyse büyük ödül
  s += (v.bar[1] - before.bar[1]) * 22;
  // toplama ilerlemesi
  s += v.off[0] * 9;
  // yarış: kendi pip'imi azalt
  s -= R.pips(v) * (contact ? 0.08 : 0.35);

  if (contact) {
    let run = 0;
    for (let p = 1; p <= 24; p++) {
      const n = v.p[p];
      if (n >= 2) {
        // kapı: ev ve bar kapısı (7) daha değerli
        s += p <= 6 ? 7 : p === 7 ? 6 : p <= 11 ? 4 : 2;
        run++;
        if (run >= 3) s += run * 1.5; // ardışık kapılar (blok)
      } else run = 0;
      if (n === 1) {
        // açık pul: tehdit altındaysa ceza, evdeyse daha pahalı (kırılırsa uzun yol)
        const t = threat(v, p);
        s -= t * (p >= 13 ? 2.4 : 1.6) + (t ? 2 : 0);
      }
    }
    // rakibin evinde kapattığım kapılar onu bardan girmekte zorlar
    if (v.bar[1] > 0) { let closed = 0; for (let p = 1; p <= 6; p++) if (v.p[p] >= 2) closed++; s += closed * 4; }
    // geride kalan pullarım (rakip evinde) tehlikeli
    for (let p = 19; p <= 24; p++) if (v.p[p] > 0) s -= v.p[p] * 0.8;
  } else {
    // temassız: eve hızlı gir, dağınık toplama
    for (let p = 7; p <= 24; p++) if (v.p[p] > 0) s -= v.p[p] * (p - 6) * 0.15;
  }
  return s;
}

export function chooseTurn(v0, dl, rnd = Math.random) {
  const turns = allTurns(v0, dl);
  if (turns.length === 1) return turns[0].moves;
  let best = null, bestS = -Infinity;
  for (const t of turns) {
    const sc = evaluate(t.v, v0) + rnd() * 0.6; // biraz çeşitlilik
    if (sc > bestS) { bestS = sc; best = t; }
  }
  return best.moves;
}
