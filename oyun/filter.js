// Küfür + iletişim bilgisi filtresi. Takma adlarda ve yazı yazılan oyunlarda kullanılır.
// Liste kasıtlı olarak kısa; panelden genişletilebilir hale getirilecek.

const TR_MAP = { ı: "i", İ: "i", ş: "s", ç: "c", ğ: "g", ö: "o", ü: "u", â: "a", î: "i", û: "u" };
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", "@": "a", $: "s", "!": "i" };

function norm(s, keepDotless = false) {
  return String(s)
    .toLocaleLowerCase("tr")
    .replace(keepDotless ? /[şçğöüâîû]/g : /[ıİşçğöüâîû]/g, (c) => TR_MAP[c] || c)
    .replace(/[013457@$!]/g, (c) => LEET[c] || c)
    .replace(/(.)\1{2,}/g, "$1$1"); // "siiiiik" → "siik"
}

// Uzun kökler: kelimenin herhangi bir yerinde geçerse engellenir
const ROOTS = [
  "orospu", "yarrak", "yarak", "amcik", "amina", "aminak", "pezevenk", "siktir", "sikerim", "sikeyim",
  "kahpe", "yavsak", "serefsiz", "surtuk", "kaltak", "dalyarak", "gavat", "ibne", "pust", "kerhane",
  "fuck", "shit", "bitch", "whore", "porn", "pussy", "cunt"
];
// Kısa kökler: sadece kelime başında (eksik, sıkıcı gibi masum kelimeler takılmasın)
const SHORT = ["amk", "aq", "sik", "sikis", "oc", "pic", "got", "meme", "dick", "sex", "seks", "anan"];
const PREFIX = ["sik", "amk"]; // bunlarla başlayan kelimeler de engellenir

const CONTACT = [
  /\d[\d\s\-().]{6,}\d/,                       // telefon numarası (8+ rakam)
  /@\w/,                                       // @kullanıcı
  /(https?:|www\.|\.com\b|\.net\b|\.tr\b|t\.me)/i,
  /\b(insta(gram)?|snap(chat)?|whats?app|wp|telegram|tiktok|numara(m|n)?|dm)\b/i
];

export function checkText(s) {
  const raw = String(s || "");
  if (CONTACT.some((re) => re.test(raw))) return { ok: false, reason: "İletişim bilgisi (numara, @, link) yazılamaz." };
  const n = norm(raw);
  const squashed = n.replace(/[^a-z]/g, "");
  if (ROOTS.some((r) => squashed.includes(r))) return { ok: false, reason: "Uygunsuz kelime içeriyor." };
  // kelime kontrolünde "ı" ayrı tutulur: "sıkıcı" masum, "sik" değil
  const words = norm(raw, true).split(/[^a-zı]+/).filter(Boolean);
  if (words.some((w) => SHORT.includes(w) || PREFIX.some((r) => w.startsWith(r)))) return { ok: false, reason: "Uygunsuz kelime içeriyor." };
  return { ok: true };
}

// Takma ad kuralları: 2–20 karakter, harf/rakam/boşluk/._- ve en az bir harf
export function checkNick(s) {
  const nick = String(s || "").trim().replace(/\s+/g, " ");
  if (nick.length < 2 || nick.length > 20) return { ok: false, reason: "Takma ad 2–20 karakter olmalı." };
  if (!/^[\p{L}\p{N} ._-]+$/u.test(nick)) return { ok: false, reason: "Sadece harf, rakam, boşluk, nokta, tire ve alt çizgi kullanılabilir." };
  if (!/\p{L}/u.test(nick)) return { ok: false, reason: "Takma ad en az bir harf içermeli." };
  const c = checkText(nick);
  return c.ok ? { ok: true, nick } : c;
}

const ADJ = ["Gece", "Gizemli", "Hızlı", "Neşeli", "Sakin", "Cesur", "Yıldız", "Mor", "Altın", "Gümüş", "Uykusuz", "Şanslı", "Kurnaz", "Efsane", "Sessiz"];
const NOUN = ["Kuşu", "Kedi", "Tilki", "Baykuş", "Kaplan", "Kartal", "Yunus", "Panda", "Kurt", "Ayı", "Şahin", "Sincap", "Penguen", "Kirpi", "Martı"];

export function randomNick() {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const b = NOUN[Math.floor(Math.random() * NOUN.length)];
  return `${a} ${b} ${Math.floor(Math.random() * 90) + 10}`;
}
