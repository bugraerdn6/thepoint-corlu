// Ana sayfa için oyun bilgileri: kategori, kişi sayısı, süre, kapak görseli (SVG, The Point renkleri).
export const CATS = [
  { id: "party", name: "Hızlı & Parti", emoji: "⚡" },
  { id: "team", name: "Takım Oyunları", emoji: "👥" },
  { id: "card", name: "Kart & Zar", emoji: "🃏" },
  { id: "board", name: "Masa & Strateji", emoji: "🎲" }
];

export const META = {
  refleks:     { cat: "party", people: "2–10 kişi", mins: "1 dk" },
  yabu:        { cat: "party", people: "2–20 kişi", mins: "3 dk" },
  masadakim:   { cat: "party", people: "3–10 kişi", mins: "3 dk" },
  emojifilm:   { cat: "party", people: "2–12 kişi", mins: "4 dk" },
  kelime:      { cat: "party", people: "2–12 kişi", mins: "4 dk" },
  yuksekalcak: { cat: "party", people: "2–12 kişi", mins: "3 dk" },
  ikidogru:    { cat: "party", people: "3–8 kişi",  mins: "6 dk" },
  hikaye:      { cat: "party", people: "3–8 kişi",  mins: "6 dk" },
  hicyapmadim: { cat: "party", people: "3–12 kişi", mins: "4 dk" },
  ciz:         { cat: "party", people: "3–8 kişi",  mins: "10 dk" },
  duello:      { cat: "team",  people: "2–16 kişi", mins: "5 dk" },
  yasak:       { cat: "team",  people: "4–12 kişi", mins: "6 dk" },
  sessiz:      { cat: "team",  people: "4–12 kişi", mins: "8 dk" },
  pisti:       { cat: "card",  people: "2–4 kişi",  mins: "10 dk" },
  blof:        { cat: "card",  people: "3–6 kişi",  mins: "8 dk" },
  zar:         { cat: "card",  people: "2–6 kişi",  mins: "8 dk" },
  tavla:       { cat: "board", people: "2 kişi",    mins: "15 dk" },
  dortlu:      { cat: "board", people: "2 kişi",    mins: "5 dk" },
  amiral:      { cat: "board", people: "2 kişi",    mins: "8 dk" },
  dama:        { cat: "board", people: "2 kişi",    mins: "10 dk" },
  // yakında
  vampir:      { cat: "team",  people: "5–12 kişi", mins: "15 dk" },
  
};

const P = { olive: "#5c6a3f", oliveD: "#333c22", deep: "#2a3019", terra: "#c1622f", terraL: "#d97a44", cream: "#f2ead4", paper: "#faf6ea", sage: "#b7c68f", gold: "#e8b04a" };
const BG = {
  party: [P.terra, "#8f3f1c"],
  team: [P.olive, P.deep],
  card: ["#3d5a4a", "#1f3329"],
  board: ["#6b4a2a", "#3a2614"]
};

// Kategoriye göre arka plan deseni
function motif(cat) {
  if (cat === "party") return [12, 40, 70, 100, 130, 150].map((x, i) => `<circle cx="${x}" cy="${(i * 37) % 100 + 8}" r="${3 + (i % 3) * 2}" fill="#fff" opacity=".12"/>`).join("");
  if (cat === "team") return [0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${i * 28 - 20}" y="-10" width="10" height="140" fill="#fff" opacity=".06" transform="rotate(25 80 55)"/>`).join("");
  if (cat === "card") return `<g opacity=".14" fill="#fff"><text x="14" y="30" font-size="22">♠</text><text x="128" y="96" font-size="22">♥</text><text x="130" y="28" font-size="18">♦</text><text x="18" y="98" font-size="18">♣</text></g>`;
  return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<polygon points="${i * 22},0 ${i * 22 + 18},0 ${i * 22 + 9},34" fill="${i % 2 ? P.cream : P.terra}" opacity=".18"/>`).join("");
}

// Özel çizimler
const SPECIAL = {
  tavla: () => `
    <rect x="22" y="14" width="116" height="82" rx="6" fill="${P.oliveD}"/><rect x="28" y="19" width="50" height="72" fill="${P.cream}"/><rect x="82" y="19" width="50" height="72" fill="${P.cream}"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<polygon points="${28 + i * 8.3},19 ${36 + i * 8.3},19 ${32 + i * 8.3},46" fill="${i % 2 ? P.olive : P.terra}"/><polygon points="${82 + i * 8.3},91 ${90 + i * 8.3},91 ${86 + i * 8.3},64" fill="${i % 2 ? P.terra : P.olive}"/>`).join("")}
    <circle cx="44" cy="80" r="5.5" fill="${P.paper}" stroke="#b9a87d"/><circle cx="44" cy="69" r="5.5" fill="${P.paper}" stroke="#b9a87d"/><circle cx="111" cy="27" r="5.5" fill="#2b2718" stroke="#6b6250"/>
    <g transform="rotate(-14 104 66)"><rect x="96" y="58" width="16" height="16" rx="3.5" fill="${P.paper}" stroke="#0002"/><circle cx="100" cy="62" r="1.6" fill="#3a1a0a"/><circle cx="108" cy="70" r="1.6" fill="#3a1a0a"/><circle cx="104" cy="66" r="1.6" fill="#3a1a0a"/></g>
    <g transform="rotate(12 122 74)"><rect x="115" y="67" width="15" height="15" rx="3.5" fill="${P.paper}" stroke="#0002"/><circle cx="119" cy="71" r="1.5" fill="#3a1a0a"/><circle cx="126" cy="78" r="1.5" fill="#3a1a0a"/></g>`,
  pisti: () => [-18, -6, 6, 18].map((r, i) => `<g transform="rotate(${r} 80 110)"><rect x="62" y="22" width="36" height="52" rx="4" fill="${P.paper}" stroke="#0003"/><text x="69" y="38" font-size="12" font-weight="700" fill="${i % 2 ? "#c0392b" : "#1d1d1d"}">${["J", "A", "7", "10"][i]}</text><text x="80" y="60" text-anchor="middle" font-size="16" fill="${i % 2 ? "#c0392b" : "#1d1d1d"}">${["♣", "♥", "♠", "♦"][i]}</text></g>`).join(""),
  blof: () => `${[-10, 4].map((r, i) => `<g transform="rotate(${r} 80 100)"><rect x="56" y="24" width="36" height="52" rx="4" fill="url(#bk)" stroke="#0004"/></g>`).join("")}<text x="104" y="52" font-size="26">🤥</text>`,
  dortlu: () => `<rect x="40" y="16" width="80" height="78" rx="8" fill="#2f5aa0"/>${[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((cl) => `<circle cx="${52 + cl * 18.5}" cy="${28 + r * 18}" r="7" fill="${(r === 3 && cl < 3) || (r === 2 && cl === 1) ? "#d23b2a" : (r === 3 && cl === 3) || (r === 2 && cl === 2) ? "#f2c230" : P.paper}"/>`).join("")).join("")}`,
  amiral: () => `<path d="M0 78 Q20 72 40 78 T80 78 T120 78 T160 78 V110 H0Z" fill="#2f5aa0" opacity=".85"/><path d="M38 70 L122 70 L110 82 L50 82Z" fill="#6b7a86"/><rect x="64" y="52" width="26" height="18" rx="2" fill="#8a96a0"/><rect x="74" y="38" width="5" height="14" fill="#6b7a86"/><circle cx="118" cy="40" r="10" fill="${P.gold}" opacity=".9"/><text x="112" y="45" font-size="12">💥</text>`,
  dama: () => `<rect x="40" y="14" width="80" height="80" rx="4" fill="#efe5c8"/>${[0,1,2,3,4,5,6,7].map((r) => [0,1,2,3,4,5,6,7].map((cl) => (r + cl) % 2 ? `<rect x="${40 + cl * 10}" y="${14 + r * 10}" width="10" height="10" fill="#d8c79c"/>` : "").join("")).join("")}
    ${[[1,2],[1,4],[2,3],[2,5]].map(([r, cl]) => `<circle cx="${45 + cl * 10}" cy="${19 + r * 10}" r="4" fill="#2b2718"/>`).join("")}${[[5,2],[5,3],[6,4],[4,5]].map(([r, cl]) => `<circle cx="${45 + cl * 10}" cy="${19 + r * 10}" r="4" fill="#fffdf6" stroke="#b9a87d"/>`).join("")}`,
  zar: () => [[48, 30, -12, 5], [84, 46, 10, 3], [62, 64, 4, 6]].map(([x, y, r, n]) => `<g transform="rotate(${r} ${x + 13} ${y + 13})"><rect x="${x}" y="${y}" width="26" height="26" rx="5" fill="${P.paper}" stroke="#0003"/>${({ 3: [[7, 7], [13, 13], [19, 19]], 5: [[7, 7], [19, 7], [13, 13], [7, 19], [19, 19]], 6: [[7, 7], [19, 7], [7, 13], [19, 13], [7, 19], [19, 19]] })[n].map(([a, b]) => `<circle cx="${x + a}" cy="${y + b}" r="2.2" fill="#3a1a0a"/>`).join("")}</g>`).join("")
};

// Her oyuna paletten kendi rengi (aynı kategoride kartlar birbirinden ayrışsın)
const TONES = {
  refleks: ["#d97a44", "#9c4220"], yabu: ["#c99a3a", "#7d5a18"], masadakim: ["#7b8a52", "#3f4a26"], emojifilm: ["#8a4a5a", "#4a2230"],
  kelime: ["#4f7a72", "#24443e"], yuksekalcak: ["#b5653a", "#6a3015"], ikidogru: ["#9a7a3a", "#56401a"], hikaye: ["#6b5a8a", "#382c50"],
  duello: ["#5c6a3f", "#2a3019"], yasak: ["#a8452a", "#5a1f10"], pisti: ["#3d5a4a", "#1f3329"], blof: ["#2f4a5a", "#162630"], zar: ["#6a5a3a", "#352a14"],
  tavla: ["#6b4a2a", "#3a2614"], sessiz: ["#5a3a6a", "#2c1a38"], hicyapmadim: ["#c1622f", "#6b2a12"], dama: ["#4a3a2a", "#221a12"], ciz: ["#3b6a86", "#1f3a4a"], vampir: ["#6a1f2a", "#240a10"], dortlu: ["#3a4f78", "#1c2840"], amiral: ["#3b6a86", "#1a3446"]
};

export function coverSvg(rawId, emoji, cat) {
  const id = String(rawId).toLowerCase().replace(/[^a-z0-9]/g, ""); // SVG kimliği için güvenli
  const c = cat || META[rawId]?.cat || "party";
  const [a, b] = TONES[rawId] || BG[c];
  const art = SPECIAL[rawId] ? SPECIAL[rawId]() : `<text x="80" y="70" text-anchor="middle" font-size="44" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,.35))">${emoji}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="cg-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <pattern id="bk" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="${P.olive}"/><path d="M0 6 L6 0" stroke="${P.oliveD}" stroke-width="2"/></pattern></defs>
    <rect width="160" height="110" fill="url(#cg-${id})"/>${motif(c)}${art}</svg>`;
}
