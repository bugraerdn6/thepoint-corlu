// Kart oyunları için ortak yardımcılar: deste, kart gösterimi, sıra zamanlayıcı.
export const SUITS = ["♠", "♥", "♦", "♣"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const RANK_TR = { A: "As", J: "Vale", Q: "Kız", K: "Papaz" };

export const rankOf = (card) => card.slice(1);
export const suitOf = (card) => card[0];
export const rankName = (r) => RANK_TR[r] || r;

export function newDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(s + r);
  // Fisher–Yates, kriptografik rastgele
  const rnd = crypto.getRandomValues(new Uint32Array(d.length));
  for (let i = d.length - 1; i > 0; i--) { const j = rnd[i] % (i + 1); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

const red = (card) => suitOf(card) === "♥" || suitOf(card) === "♦";

export function cardHtml(card, { cls = "", data = "", disabled = false } = {}) {
  if (!card) return `<span class="pcard back ${cls}"></span>`;
  const r = rankOf(card), s = suitOf(card);
  const tag = data ? "button" : "span";
  return `<${tag} class="pcard ${red(card) ? "red" : ""} ${cls}" ${data} ${disabled ? "disabled" : ""}><b>${r}</b><i>${s}</i></${tag}>`;
}

export const backs = (n) => `<span class="pback-stack">${n > 0 ? `<span class="pcard back"></span><em>${n}</em>` : ""}</span>`;

export function turnBar(c, id, endAt, total) {
  const set = () => { const b = document.getElementById("cdbar"); if (b) b.style.width = Math.max(0, (endAt - c.now()) / total) * 100 + "%"; };
  set();
  if (c.local.barId !== id) {
    c.local.barId = id;
    const tick = () => { if (c.local.barId !== id || c.room.state !== "play") return; set(); c.timer(tick, 250); };
    c.timer(tick, 250);
  }
}

export const nextOf = (order, k, skip = () => false) => {
  const i = order.indexOf(k);
  for (let j = 1; j <= order.length; j++) { const n = order[(i + j) % order.length]; if (!skip(n)) return n; }
  return k;
};
