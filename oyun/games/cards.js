// Kart oyunları için ortak yardımcılar: deste, kart görünümü (yüz/arka/yelpaze), uçuş animasyonları, sıra zamanlayıcı.
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
const COURT = { J: "V", Q: "K", K: "P" }; // Türkçe: Vale, Kız, Papaz

// Kartın yüzü: köşelerde sayı + renk, ortada büyük simge; resimli kartlarda çerçeveli harf
function faceInner(card) {
  const r = rankOf(card), s = suitOf(card);
  const label = COURT[r] || r;
  let center;
  if (COURT[r]) center = `<span class="court"><b>${label}</b><i>${s}</i></span>`;
  else if (r === "A") center = `<span class="ace">${s}</span>`;
  else center = `<span class="pip">${s}</span>`;
  return `<span class="ci tl"><b>${label}</b><i>${s}</i></span>${center}<span class="ci br"><b>${label}</b><i>${s}</i></span>`;
}

export function cardHtml(card, { cls = "", data = "", disabled = false, style = "" } = {}) {
  const tag = data ? "button" : "span";
  if (!card) return `<${tag} class="pcard back ${cls}" ${data} ${style ? `style="${style}"` : ""}><span class="bk"></span></${tag}>`;
  return `<${tag} class="pcard ${red(card) ? "red" : ""} ${cls}" ${data} ${disabled ? "disabled" : ""} ${style ? `style="${style}"` : ""}>${faceInner(card)}</${tag}>`;
}

// Elde yelpaze: kartlar hafif kavisle açılır
export function fanHtml(cards, opts = {}) {
  const n = cards.length;
  // kart sayısına göre aralık: el her zaman ekrana sığsın (varsayılan en fazla ~310 px)
  const cardW = opts.cardW || 58, maxW = opts.maxW || 310;
  const step = n > 1 ? Math.min(cardW - 8, (maxW - cardW) / (n - 1)) : 0;
  const spread = n > 8 ? 20 : Math.min(28, n * 4);
  return `<div class="fan ${opts.cls || ""}" style="--n:${n}">${cards.map((card, i) => {
    const t = n > 1 ? i / (n - 1) - 0.5 : 0; // -0.5 … 0.5
    const style = `--rot:${(t * spread).toFixed(1)}deg;--lift:${(Math.abs(t) * Math.min(14, n * 2)).toFixed(1)}px;z-index:${i + 1};margin-left:${i ? (step - cardW).toFixed(1) : 0}px`;
    return cardHtml(card, { cls: (opts.clsOf?.(card) || ""), data: opts.dataOf ? opts.dataOf(card) : "", disabled: opts.disabled, style });
  }).join("")}</div>`;
}

// Rakibin eli: küçük kapalı kartlar yelpazesi
export const backFan = (n, max = 7) => `<span class="bfan" style="--n:${Math.min(n, max)}">${Array.from({ length: Math.min(n, max) }, (_, i) => `<span class="pcard back mini" style="--i:${i}"><span class="bk"></span></span>`).join("")}${n ? `<em>${n}</em>` : ""}</span>`;
export const backs = (n) => `<span class="pback-stack">${n > 0 ? `<span class="pcard back"><span class="bk"></span></span><em>${n}</em>` : ""}</span>`;

// ---------- uçuş animasyonları ----------
export const rectOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

// Bir kartı (ya da kapalı kartı) ekranın bir noktasından diğerine uçurur. Animasyon durursa bile en geç sürede biter.
export function fly(html, from, to, { ms = 380, delay = 0, rotate = 0, scaleTo = 1, flipTo = null } = {}) {
  if (!from || !to) return Promise.resolve();
  return new Promise((res) => {
    const el = document.createElement("div");
    el.className = "card-fly";
    el.innerHTML = html;
    el.style.cssText = `left:${from.x}px;top:${from.y}px;width:${from.w}px;height:${from.h}px;`;
    document.body.appendChild(el);
    const dx = to.x + to.w / 2 - (from.x + from.w / 2), dy = to.y + to.h / 2 - (from.y + from.h / 2);
    const sc = (to.w / from.w) * scaleTo;
    let done = false;
    const finish = () => { if (done) return; done = true; el.remove(); res(); };
    try {
      const a = el.animate([
        { transform: "translate(0,0) rotate(0deg) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.55}px,${dy * 0.55 - 30}px) rotate(${rotate * 0.6}deg) scale(${(1 + sc) / 2 + 0.08})`, offset: 0.55 },
        { transform: `translate(${dx}px,${dy}px) rotate(${rotate}deg) scale(${sc})`, opacity: 1 }
      ], { duration: ms, delay, easing: "cubic-bezier(.3,.7,.3,1)", fill: "forwards" });
      a.onfinish = finish;
    } catch { finish(); }
    setTimeout(finish, ms + delay + 150);
  });
}

// Masanın üstünde büyük kısa yazı (PİŞTİ!, BLÖF! gibi)
export function burst(anchor, text, kind = "") {
  const r = rectOf(anchor);
  if (!r) return;
  const el = document.createElement("div");
  el.className = "card-burst " + kind;
  el.textContent = text;
  el.style.left = r.x + r.w / 2 + "px";
  el.style.top = r.y + r.h / 2 + "px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

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
