// The Point · Oyun + Müdavim Ağı — ayarlar
// Seviyeler, puanlar ve mekan bilgisi buradan değiştirilir.

export const firebaseConfig = {
  apiKey: "AIzaSyAKGBIlZER2aUhzooAYw8pnXINyrAbNE4k",
  authDomain: "thepointoyun.firebaseapp.com",
  databaseURL: "https://thepointoyun-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "thepointoyun",
  storageBucket: "thepointoyun.firebasestorage.app",
  messagingSenderId: "954554119718",
  appId: "1:954554119718:web:14b11fefed8a829e9118e7"
};

// Check-in konum kontrolü. lat/lng null ise konum kontrolü yapılmaz.
// Google Maps'te mekana sağ tıkla → çıkan koordinatları buraya yaz.
export const VENUE = {
  name: "The Point",
  lat: 41.15495790137146,
  lng: 27.844085398847728,
  radiusM: 150
};

// İki check-in arasında en az kaç saat olmalı (veritabanı kuralıyla aynı: 12 saat)
export const CHECKIN_COOLDOWN_H = 12;

// Müdavim seviyeleri — TASLAK, sonra birlikte değiştireceğiz.
export const LEVELS = [
  { id: "yeni",    name: "Yeni Yüz",       emoji: "🟤", minVisits: 0,  reward: null },
  { id: "tanidik", name: "Tanıdık",        emoji: "⚪", minVisits: 3,  reward: "Küçük ikram" },
  { id: "mudavim", name: "Müdavim",        emoji: "🟡", minVisits: 10, reward: "İndirim" },
  { id: "efsane",  name: "Point Efsanesi", emoji: "🔴", minVisits: 25, reward: "Özel ayrıcalık" }
];

// Oyun puanları (tek seferde en fazla 50 — veritabanı kuralı)
export const POINTS = {
  win: 30,   // kazanan
  play: 10   // katılan herkes
};

// Lobideki odalar kaç dakika listede kalsın
export const ROOM_TTL_MIN = 30;
