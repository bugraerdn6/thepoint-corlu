// Hızlı parti oyunları (soru altyapısı üzerine)
import { makeQuiz, shuffle, sample, tierOf } from "./quiz.js";
import { YA_BU, MASADA_KIM, EMOJI_FILM, KELIMELER, YUKSEK_ALCAK, DUELLO } from "./banks.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 🤔 Ya Bu Ya Şu
export const yaBu = makeQuiz({
  id: "yabu", name: "Ya Bu Ya Şu", emoji: "🤔",
  desc: "2–20 kişi · İkilemde çoğunluğu tahmin et",
  rules: "Her turda bir ikilem çıkar, birini seç. <b>Çoğunluğun seçtiği tarafta</b> olan herkes puan alır. 8 tur.",
  minPlayers: 2, maxPlayers: 20, rounds: 8, timeMs: 12000, mode: "majority",
  pick: () => sample(YA_BU, 8).map(([a, b]) => ({ o: [a, b] })),
  prompt: () => `<span class="vs">Hangisi?</span>`
});

// 👉 Masada Kim?
export const masadaKim = makeQuiz({
  id: "masadakim", name: "Masada Kim?", emoji: "👉",
  desc: "3–10 kişi · Arkadaşını oyla",
  rules: "Her turda bir soru çıkar (\"En geç kim gelir?\" gibi). Odadaki birini oyla. Oylar isimsizdir. <b>En çok oyu alan kişiyi seçenler</b> puan alır. 8 tur.",
  minPlayers: 3, maxPlayers: 10, rounds: 8, timeMs: 15000, mode: "who", soloTest: false,
  pick: (c) => {
    const names = c.players.map((p) => p.name);
    return sample(MASADA_KIM, 8).map((s) => ({ p: s, o: names }));
  },
  reveal: (q, counts) => {
    const max = Math.max(0, ...Object.values(counts));
    if (!max) return "Kimse oy vermedi.";
    const top = q.o.filter((_, i) => (counts[i] || 0) === max);
    return `👑 <b>${top.map(esc).join(", ")}</b> (${max} oy)`;
  }
});

// Kademe ayarları: [kolay, orta, zor] — süre ve son turlarda 2× puan
const TM = (easy, mid, hard) => (t) => [easy, mid, hard][t];
const X = (t) => (t === 2 ? 2 : 1);
const pickTiered = (n, fn) => Array.from({ length: n }, (_, i) => tierOf(i, n)).map((t, i) => fn(t, i));
const fmt = (n) => Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
const show = (n, unit, kind) => (kind === "year" ? String(n) : fmt(n)) + (unit ? " " + unit : "");

// 🎬 Emoji Film
const emojiTime = TM(15000, 12000, 10000);
export const emojiFilm = makeQuiz({
  id: "emojifilm", name: "Emoji Film", emoji: "🎬",
  desc: "2–12 kişi · Emojilerden filmi bil",
  rules: "Emojilere bak, hangi film olduğunu şıklardan bul. Kolay başlar, zorlaşır: sonlara doğru şıklar birbirine benzer, süre kısalır. <b>Son 3 soru 2× puan.</b> 10 soru.",
  timeMs: 15000,
  pick: () => {
    const used = new Set();
    return pickTiered(10, (t) => {
      const pool = EMOJI_FILM.filter((f) => f[2] === t + 1 && !used.has(f[1]));
      const [e, title, , cat] = sample(pool.length ? pool : EMOJI_FILM.filter((f) => !used.has(f[1])), 1)[0];
      used.add(title);
      // orta/zor: yanlış şıklar aynı türden (benzer şıklar daha zor)
      const same = EMOJI_FILM.filter((f) => f[1] !== title && f[3] === cat);
      const others = (t > 0 && same.length >= 3 ? sample(same, 3) : sample(EMOJI_FILM.filter((f) => f[1] !== title), 3)).map((f) => f[1]);
      const o = shuffle([title, ...others]);
      return { e, o, a: o.indexOf(title), tm: emojiTime(t), x: X(t) };
    });
  },
  prompt: (q, esc) => `<div class="emoji-big">${esc(q.e)}</div>`
});

// 🔤 Kelime Düellosu
function scramble(w) {
  const letters = [...w];
  for (let i = 0; i < 30; i++) {
    const s = shuffle(letters).join("");
    if (s !== w) return s;
  }
  return letters.reverse().join("");
}
const len = (w) => [...w].length;
const up = (w) => w.toLocaleUpperCase("tr");
// ortak harf sayısı — benzer şık seçmek için
const overlap = (a, b) => { const bs = [...b]; return [...a].filter((ch) => { const i = bs.indexOf(ch); if (i < 0) return false; bs.splice(i, 1); return true; }).length; };

export const kelime = makeQuiz({
  id: "kelime", name: "Kelime Düellosu", emoji: "🔤",
  desc: "2–12 kişi · Karışık harflerden kelimeyi bul",
  rules: "Harfler karışık geliyor, doğru kelimeyi en hızlı bulan kazanır. Kısa kelimelerle başlar, uzar. <b>Son 3 turda şık yok:</b> harflere sırayla dokunarak kelimeyi kendin kurarsın (2× puan). 10 tur.",
  timeMs: 15000,
  pick: () => {
    const used = new Set();
    return pickTiered(10, (t) => {
      const fits = (w) => (t === 0 ? len(w) <= 5 : len(w) >= 6 && len(w) <= 7);
      const pool = KELIMELER.filter((w) => fits(w) && !used.has(w));
      const w = sample(pool.length ? pool : KELIMELER.filter((x) => !used.has(x)), 1)[0];
      used.add(w);
      if (t === 2) return { b: true, s: up(scramble(w)), ans: up(w), tm: 25000, x: 2 };
      let cands = KELIMELER.filter((x) => x !== w && Math.abs(len(x) - len(w)) <= 1);
      // orta: harfleri en çok benzeyen kelimeler şık olur
      cands = t === 1 ? cands.sort((a, b) => overlap(w, b) - overlap(w, a)).slice(0, 6) : cands;
      const o = shuffle([w, ...sample(cands, 3)]).map(up);
      return { s: up(scramble(w)), o, a: o.indexOf(up(w)), tm: t === 0 ? 15000 : 12000, x: 1 };
    });
  },
  prompt: (q, esc) => q.b
    ? `<p class="muted small">Harflere sırayla dokun</p>`
    : `<div class="tiles">${[...String(q.s)].map((ch) => `<span class="tile">${esc(ch)}</span>`).join("")}</div>`
});

// 📈 Yüksek mi Alçak mı — eşik her kademede gerçeğe yaklaşır
const niceRound = (v) => {
  if (Math.abs(v) < 100) return Math.round(v);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1); // 2 anlamlı basamak
  return Math.round(v / mag) * mag;
};
function threshold(real, kind, t) {
  const upSide = Math.random() < 0.5; // eşik gerçeğin üstünde mi altında mı
  let shown;
  if (kind === "year") {
    const d = [[40, 80], [10, 20], [2, 5]][t];
    shown = real + (upSide ? 1 : -1) * (d[0] + Math.floor(Math.random() * (d[1] - d[0] + 1)));
  } else if (kind === "count") {
    const d = [Math.max(3, Math.round(real * 0.4)), Math.max(2, Math.round(real * 0.2)), 1][t];
    shown = upSide ? real + d : Math.max(1, real - d);
    if (shown === real) shown = real + d;
  } else {
    const f = [0.45, 0.25, 0.1][t];
    shown = niceRound(real * (upSide ? 1 + f : 1 - f));
    if (shown === real) shown = niceRound(real * (upSide ? 1 + f * 2 : 1 - f * 2));
  }
  return shown;
}
export const yuksekAlcak = makeQuiz({
  id: "yuksekalcak", name: "Yüksek mi Alçak mı", emoji: "📈",
  desc: "2–12 kişi · Gerçek değer daha mı fazla, daha mı az?",
  rules: "Bir bilgi ve bir sayı çıkar. Gerçek değer <b>daha mı fazla, daha mı az?</b> Sayı her turda gerçeğe yaklaşır, süre kısalır. <b>Son 3 soru 2× puan.</b> 10 soru.",
  timeMs: 10000,
  pick: () => {
    const used = new Set();
    return pickTiered(10, (t) => {
      const minPrec = [1, 2, 3][t];
      const pool = YUKSEK_ALCAK.filter((f) => f[4] >= minPrec && !used.has(f[0]));
      const [topic, real, unit, kind] = sample(pool, 1)[0];
      used.add(topic);
      const shown = threshold(real, kind, t);
      return {
        tp: topic, sh: show(shown, unit, kind), r: show(real, unit, kind),
        o: ["⬆️ Daha fazla", "⬇️ Daha az"], a: real > shown ? 0 : 1,
        tm: [10000, 8000, 6000][t], x: X(t)
      };
    });
  },
  prompt: (q, esc) => `<div class="topic">${esc(q.tp)}</div><div class="shown">${esc(q.sh)}</div><div class="muted small">Gerçeği bundan…</div>`,
  reveal: (q) => `Gerçek değer: <b>${esc(q.r)}</b>`
});

// ⚔️ Masa Düellosu — takım takıma bilgi yarışması (kademeli)
export const duello = makeQuiz({
  id: "duello", name: "Masa Düellosu", emoji: "⚔️", teams: true,
  desc: "2–16 kişi · Takım takıma bilgi yarışması",
  rules: "İki takım: 🔵 Mavi ve 🟠 Turuncu. Herkes her soruyu kendi telefonundan cevaplar, <b>takım üyelerinin puanları toplanır</b>. Diğer masaya meydan okumak için lobide onları davet et! Sorular kolaydan zora gider, <b>son 3 soru 2× puan.</b> 10 soru.",
  minPlayers: 2, maxPlayers: 16, soloTest: false, timeMs: 15000,
  pick: () => {
    const used = new Set();
    return pickTiered(10, (t) => {
      const pool = DUELLO.filter((q) => q[5] === t + 1 && !used.has(q[0]));
      const [p, right, w1, w2, w3] = sample(pool, 1)[0];
      used.add(p);
      const o = shuffle([right, w1, w2, w3]);
      return { p, o, a: o.indexOf(right), tm: [15000, 13000, 11000][t], x: X(t) };
    });
  }
});
