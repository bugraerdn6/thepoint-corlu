// Oyun kayıt listesi — yeni oyun eklenince buraya import edilir.
import refleks from "./refleks.js";
import { yaBu, masadaKim, emojiFilm, kelime, yuksekAlcak, duello } from "./party.js";
import ikidogru from "./ikidogru.js";
import yasak from "./yasak.js";
import dortlu from "./dortlu.js";
import amiral from "./amiral.js";
import zar from "./zar.js";
import pisti from "./pisti.js";
import blof from "./blof.js";
import hikaye from "./hikaye.js";

export const GAMES = [refleks, duello, yaBu, masadaKim, emojiFilm, kelime, yuksekAlcak, ikidogru, yasak, dortlu, amiral, zar, pisti, blof, hikaye];

// Henüz yapılmamış oyunlar (ana sayfada "yakında" olarak görünür)
export const UPCOMING = [
  { emoji: "🎨", name: "Çiz-Tahmin", desc: "Biri çizer, diğerleri tahmin eder" },
  { emoji: "🐺", name: "Köylü ve Kurt", desc: "Gizli rol oyunu" },
  { emoji: "🎭", name: "Sessiz Sinema", desc: "Takımlar, anlatmak yok, sadece hareket" },
  { emoji: "🙋", name: "Hiç Yapmadım", desc: "Kim neyi yaptı, ortaya çıksın" },
  { emoji: "⚫", name: "Dama", desc: "Türk daması, 2 kişi" },
  { emoji: "🎲", name: "Tavla", desc: "Klasik tavla, 2 kişi" }
];
