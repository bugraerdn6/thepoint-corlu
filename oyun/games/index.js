// Oyun kayıt listesi — yeni oyun eklenince buraya import edilir.
import refleks from "./refleks.js";
import { yaBu, masadaKim, emojiFilm, kelime, yuksekAlcak, duello } from "./party.js";
import ikidogru from "./ikidogru.js";
import yasak from "./yasak.js";
import dortlu from "./dortlu.js";
import amiral from "./amiral.js";
import zar from "./zar.js";

export const GAMES = [refleks, duello, yaBu, masadaKim, emojiFilm, kelime, yuksekAlcak, ikidogru, yasak, dortlu, amiral, zar];

// Henüz yapılmamış oyunlar (ana sayfada "yakında" olarak görünür)
export const UPCOMING = [
  { emoji: "🎨", name: "Çiz-Tahmin", desc: "Biri çizer, diğerleri tahmin eder" },
  { emoji: "🐺", name: "Köylü ve Kurt", desc: "Gizli rol oyunu" },
  { emoji: "🃏", name: "Pişti", desc: "Klasik kart oyunu" }
];
