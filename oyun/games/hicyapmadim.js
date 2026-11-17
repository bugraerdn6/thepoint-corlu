// 🙋 Hiç Yapmadım — "Hiç … yapmadım" cümlesi çıkar, herkes gizlice "yaptım / yapmadım" der, sonra açıklanır.
// İçki/ceza yok: her "yaptım" bir puan, en çok yapan masanın en maceracısı. (Ceza istenirse masa kendisi belirler.)
import { sample } from "./quiz.js";
import { sfx, buzz, unlock } from "../sound.js";

const ROUNDS = 10;
const ASK_MS = 12000;
const REVEAL_MS = 5000;

// Bar ortamına uygun, kimseyi zor durumda bırakmayan cümleler (içki, madde, cinsellik, kırıcı konu yok)
export const HIC = [
  "Hiç uçağa binmedim", "Hiç yurt dışına çıkmadım", "Hiç sahnede şarkı söylemedim", "Hiç bir ünlüyle fotoğraf çekilmedim", "Hiç bir yarışmada ödül kazanmadım",
  "Hiç kamp yapmadım", "Hiç gece denize girmedim", "Hiç telefonumu suya düşürmedim", "Hiç yanlış kişiye mesaj atmadım", "Hiç bir diziyi tek günde bitirmedim",
  "Hiç saçımı kendim kesmedim", "Hiç inmem gereken durağı kaçırmadım", "Hiç sınavda kopya çekmedim", "Hiç birine sürpriz doğum günü yapmadım", "Hiç bir sırrı ağzımdan kaçırmadım",
  "Hiç akşam yemeğinde kahvaltı yapmadım", "Hiç maratonda koşmadım", "Hiç tek başıma sinemaya gitmedim", "Hiç sokaktan bir hayvan sahiplenmedim", "Hiç ata binmedim",
  "Hiç yağmurda dans etmedim", "Hiç bir konserde en önde durmadım", "Hiç bir kitabı tek günde bitirmedim", "Hiç anahtarımı içeride unutmadım", "Hiç uykumda konuşmadım",
  "Hiç gece yarısı buzdolabına baskın yapmadım", "Hiç sinemada ağlamadım", "Hiç kar topu savaşı yapmadım", "Hiç stadyumda maç izlemedim", "Hiç paraşütle atlamadım",
  "Hiç bir şehri tek başıma gezmedim", "Hiç yanlış otobüse binmedim", "Hiç arkadaşımın doğum gününü unutmadım", "Hiç gitar çalmayı denemedim", "Hiç yemeği yakmadım",
  "Hiç tatilde kaybolmadım", "Hiç bir yarışma programına başvurmadım", "Hiç sabaha kadar oyun oynamadım", "Hiç bir mesajı görüp cevapsız bırakmadım", "Hiç karaoke yapmadım",
  "Hiç dans kursuna gitmedim", "Hiç bir saksı çiçeğini kurutmadım", "Hiç taksiye bir eşyamı unutmadım", "Hiç denizde yunus görmedim", "Hiç bir dağın zirvesine çıkmadım",
  "Hiç gün doğumunu izlemek için erken kalkmadım", "Hiç kendi doğum günüme geç kalmadım", "Hiç bir filmin sonunu söyleyip spoiler vermedim", "Hiç yolda tanımadığım biriyle sohbete dalmadım", "Hiç çekiliş kazanmadım"
];

const yesCount = (room) => {
  const t = {};
  (room.g?.qs || []).forEach((_, r) => { for (const [k, v] of Object.entries(room.in?.[`h${r}`] || {})) if (v.y) t[k] = (t[k] || 0) + 1; });
  return t;
};

export default {
  id: "hicyapmadim", name: "Hiç Yapmadım", emoji: "🙋",
  desc: "3–12 kişi · Kim neyi yaptı, ortaya çıksın",
  rules: `Her turda "Hiç … yapmadım" diye bir cümle çıkar. Herkes <b>gizlice</b> 🙋 Yaptım ya da 🙅 Yapmadım seçer, süre bitince <b>kimlerin yaptığı açıklanır</b>. Her "yaptım" 1 puan: en çok yapan masanın en maceracısı! ${ROUNDS} tur. Ceza isterseniz masada siz belirleyin 😉`,
  minPlayers: 3, maxPlayers: 12, soloTest: false,

  start(c) {
    return { phase: "q", round: 0, qs: sample(HIC, ROUNDS), endAt: Math.round(c.now() + ASK_MS + 800) };
  },

  render(c) {
    const { g, local } = c;
    const app = document.getElementById("app");
    c.hideArena();
    const r = g.round;
    const ans = c.inputs[`h${r}`] || {};
    const mine = ans[c.me]?.y ?? local[`a${r}`];
    const name = (k) => (k === c.me ? "Sen" : c.esc(c.room.players?.[k]?.name || "?"));
    const totals = yesCount(c.room);
    const enter = local.enter !== `${g.phase}${r}`;
    local.enter = `${g.phase}${r}`;

    if (g.phase === "q") {
      app.innerHTML = `
        <section class="card center quiz hy ${enter ? "qin" : ""}">
          <p class="eyebrow">🙋 Hiç Yapmadım · ${r + 1}/${g.qs.length}</p>
          <div class="cd"><i id="cdbar"></i></div>
          <p class="hy-q">“${c.esc(g.qs[r])}”</p>
          <div class="hy-btns">
            <button class="hy-b yes ${mine === true ? "on" : ""}" data-y="1" ${mine !== undefined ? "disabled" : ""}><span>🙋</span>Yaptım</button>
            <button class="hy-b no ${mine === false ? "on" : ""}" data-y="0" ${mine !== undefined ? "disabled" : ""}><span>🙅</span>Yapmadım</button>
          </div>
          <p class="muted small" style="margin-top:.8rem">${mine !== undefined ? "Cevabın gizli kaydedildi 🤫 · " : ""}${Object.keys(ans).length}/${c.players.length} kişi cevapladı</p>
        </section>`;
      app.querySelectorAll("[data-y]").forEach((b) => b.onclick = () => {
        if (local[`a${r}`] !== undefined) return;
        unlock(); sfx.tick(); buzz(10);
        local[`a${r}`] = b.dataset.y === "1";
        c.input(`h${r}`, { y: local[`a${r}`] });
        this.render(c);
      });
      const setBar = () => { const bar = document.getElementById("cdbar"); const left = Math.max(0, g.endAt - c.now()); if (bar) { bar.style.width = (left / ASK_MS) * 100 + "%"; bar.parentElement.classList.toggle("hurry", left < 3000); } };
      setBar();
      if (local.cd !== r) { local.cd = r; const tick = () => { if (c.room.g?.round !== r || c.room.g?.phase !== "q") return; setBar(); c.timer(tick, 200); }; tick(); }
      return;
    }

    // açıklama
    const did = c.players.filter((p) => ans[p.k]?.y === true);
    const didnt = c.players.filter((p) => ans[p.k]?.y === false);
    if (enter) { did.length ? sfx.turn() : sfx.tick(); }
    app.innerHTML = `
      <section class="card center hy ${enter ? "rvin" : ""}">
        <p class="eyebrow">🙋 Hiç Yapmadım · ${r + 1}/${g.qs.length}</p>
        <p class="hy-q small">“${c.esc(g.qs[r])}”</p>
        <h2 style="margin-top:.6rem">${did.length ? `${did.length} kişi yapmış! 🙋` : "Kimse yapmamış 😇"}</h2>
        <div class="hy-who">${did.map((p, i) => `<span class="hy-chip yes" style="--k:${i}">🙋 ${name(p.k)}</span>`).join("")}</div>
        ${didnt.length ? `<div class="hy-who dim">${didnt.map((p, i) => `<span class="hy-chip" style="--k:${i + did.length}">🙅 ${name(p.k)}</span>`).join("")}</div>` : ""}
        <ol class="list mini">${c.players.map((p) => ({ ...p, s: totals[p.k] || 0 })).sort((a, b) => b.s - a.s).slice(0, 3)
          .map((p, i) => `<li class="${p.k === c.me ? "me" : ""}"><span class="rank">${i + 1}</span><span class="name">${name(p.k)}</span><span class="val">${p.s} 🙋</span></li>`).join("")}</ol>
      </section>`;
  },

  hostTick(c) {
    const { g } = c;
    if (g.phase === "q") {
      const ans = c.inputs[`h${g.round}`] || {};
      const allIn = c.players.every((p) => ans[p.k]);
      if (!allIn && c.now() < g.endAt + 400) return;
      c.advance(() => c.setG({ phase: "reveal", endAt: Math.round(c.now() + REVEAL_MS) }));
      return;
    }
    if (c.now() < g.endAt) return;
    c.advance(() => (g.round + 1 < g.qs.length ? c.setG({ phase: "q", round: g.round + 1, endAt: Math.round(c.now() + ASK_MS + 600) }) : c.finish()));
  },

  results(room) {
    const t = yesCount(room);
    return Object.keys(room.players || {}).map((k) => ({ k, score: t[k] || 0, label: `${t[k] || 0} kez 🙋` })).sort((a, b) => b.score - a.score);
  }
};
