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
import tavla from "./tavla.js";
import sessiz from "./sessiz.js";
import hicyapmadim from "./hicyapmadim.js";
import dama from "./dama.js";

export const GAMES = [refleks, duello, yaBu, masadaKim, emojiFilm, kelime, yuksekAlcak, ikidogru, yasak, dortlu, amiral, zar, pisti, blof, hikaye, tavla, sessiz, hicyapmadim, dama];

// Henüz yapılmamış oyunlar (ana sayfada "yakında" olarak görünür)
export const UPCOMING = [
  { emoji: "🎨", name: "Çiz-Tahmin", desc: "Biri çizer, diğerleri tahmin eder" },
  { emoji: "🧛", name: "Vampir Köylü", desc: "Gizli roller: vampirleri bul" }
];
