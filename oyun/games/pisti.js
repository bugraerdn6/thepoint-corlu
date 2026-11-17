// 🃏 Pişti — 2–4 kişi (bireysel). Oda sahibinin telefonu desteyi karıştırır ve kuralları uygular.
import { newDeck, rankOf, suitOf, cardHtml, backs, turnBar, nextOf, rankName } from "./cards.js";

const TURN_MS = 30000;
const cardPts = (c) => (rankOf(c) === "A" || rankOf(c) === "J" ? 1 : 0) + (c === "♣2" ? 2 : 0) + (c === "♦10" ? 3 : 0);

export default {
  id: "pisti", name: "Pişti", emoji: "🃏",
  desc: "2–4 kişi · Klasik Türk kart oyunu",
  rules: "Sırayla bir kart at. Attığın kart yerdeki üst kartla <b>aynıysa</b> ya da <b>Vale</b> ise yerdeki bütün kartları alırsın. Yerde tek kart varken aynısını atarsan <b>Pişti (+10)</b>, Vale'ye Vale atarsan +20. Her As ve Vale 1, ♣2 2, ♦10 3 puan. En çok kartı alan +3. Hamle süresi 30 sn.",
  minPlayers: 2, maxPlayers: 4, soloTest: false,

  start(c) {
    const order = c.players.map((p) => p.k).sort(() => Math.random() - 0.5);
    const deck = newDeck();
    const table = deck.splice(0, 4);
    const hands = {};
    for (const k of order) hands[k] = deck.splice(0, 4);
    const cap = Object.fromEntries(order.map((k) => [k, { n: 0, pts: 0, pisti: 0 }]));
    return { order, deck, table, hands, cap, turn: order[0], seq: 0, lastAt: Math.round(c.now()), msg: "Oyun başladı. Yerde 4 kart var, üstteki açık." };
  },

  render(c) {
    const { g, local } = c;
    const app = document.getElementById("app");
    c.hideArena();
    const name = (k) => c.esc(c.room.players?.[k]?.name || "?");
    const table = g.table || [];
    const top = table[table.length - 1];
    const hand = g.hands?.[c.me] || [];
    const myTurn = g.turn === c.me && local.sent !== g.seq;

    app.innerHTML = `
      <section class="card center">
        <p class="eyebrow">🃏 Pişti · Destede ${(g.deck || []).length} kart</p>
        <div class="opp-row">${g.order.filter((k) => k !== c.me).map((k) => `
          <div class="opp ${g.turn === k ? "on" : ""}"><b>${name(k)}</b>${backs((g.hands?.[k] || []).length)}<small>${g.cap[k].pts} puan · ${g.cap[k].n} kart</small></div>`).join("")}</div>
        <div class="felt">
          ${table.length > 1 ? `<span class="pile-under">${backs(table.length - 1)}</span>` : ""}
          ${top ? cardHtml(top, { cls: "big" }) : `<span class="muted small">Yer boş</span>`}
        </div>
        <p class="small" style="min-height:1.4em">${c.esc(g.msg || "")}</p>
        <div class="cd"><i id="cdbar"></i></div>
        <p class="big-result" style="margin:.4rem 0">${myTurn ? "Sıra sende, bir kart seç" : `${name(g.turn)} oynuyor…`}</p>
        <div class="hand">${hand.map((card) => cardHtml(card, { data: `data-card="${c.esc(card)}"`, disabled: !myTurn })).join("")}</div>
        <p class="muted small" style="margin-top:.6rem">Sen: <b>${g.cap[c.me]?.pts || 0} puan</b> · ${g.cap[c.me]?.n || 0} kart${g.cap[c.me]?.pisti ? ` · ${g.cap[c.me].pisti} pişti 🎉` : ""}</p>
      </section>`;
    app.querySelectorAll("[data-card]").forEach((b) => b.onclick = () => {
      if (!myTurn) return;
      local.sent = g.seq;
      c.input(`a${g.seq}`, { card: b.dataset.card });
      app.querySelectorAll("[data-card]").forEach((x) => { x.disabled = true; });
      b.classList.add("played");
    });
    turnBar(c, `p${g.seq}`, g.lastAt + TURN_MS, TURN_MS);
  },

  hostTick(c) {
    const { g } = c;
    const hand = g.hands?.[g.turn] || [];
    const act = c.inputs[`a${g.seq}`]?.[g.turn];
    let card = act && hand.includes(act.card) ? act.card : null;
    if (!card && c.now() - g.lastAt > TURN_MS + 1000 && hand.length) card = hand[Math.floor(Math.random() * hand.length)];
    if (!card) return;
    c.advance(() => apply(c, card));
  },

  results(room) {
    const g = room.g;
    return Object.keys(room.players || {}).map((k) => {
      const cp = g?.cap?.[k] || { pts: 0, n: 0, pisti: 0 };
      return { k, score: cp.pts, label: `${cp.pts} puan · ${cp.n} kart${cp.pisti ? ` · ${cp.pisti} pişti` : ""}` };
    }).sort((a, b) => b.score - a.score);
  }
};

async function apply(c, card) {
  const g = c.g;
  const k = g.turn;
  const name = c.room.players?.[k]?.name || "?";
  const hands = Object.fromEntries(g.order.map((p) => [p, [...(g.hands?.[p] || [])]]));
  hands[k].splice(hands[k].indexOf(card), 1);
  let table = [...(g.table || [])];
  let deck = [...(g.deck || [])];
  const cap = JSON.parse(JSON.stringify(g.cap));
  let last = g.last || null;
  let msg;
  const top = table[table.length - 1];

  if (top && (rankOf(card) === rankOf(top) || rankOf(card) === "J")) {
    const pisti = table.length === 1 && rankOf(card) === rankOf(top);
    const bonus = pisti ? (rankOf(card) === "J" ? 20 : 10) : 0;
    const won = [...table, card];
    cap[k].n += won.length;
    cap[k].pts += won.reduce((a, x) => a + cardPts(x), 0) + bonus;
    if (pisti) cap[k].pisti++;
    msg = pisti ? `🎉 ${name} PİŞTİ yaptı! +${bonus}` : `${name} ${rankName(rankOf(card))}${suitOf(card)} ile ${won.length} kart aldı`;
    table = [];
    last = k;
  } else {
    table.push(card);
    msg = `${name} ${rankName(rankOf(card))}${suitOf(card)} attı`;
  }

  let turn = nextOf(g.order, k);
  const allEmpty = g.order.every((p) => hands[p].length === 0);
  if (allEmpty) {
    if (deck.length) {
      for (const p of g.order) hands[p] = deck.splice(0, 4);
      msg += " · Yeni kartlar dağıtıldı";
    } else {
      // el bitti: yerdekiler son alana, en çok karta +3
      if (table.length && last) { cap[last].n += table.length; cap[last].pts += table.reduce((a, x) => a + cardPts(x), 0); table = []; }
      const max = Math.max(...g.order.map((p) => cap[p].n));
      const most = g.order.filter((p) => cap[p].n === max);
      if (most.length === 1) cap[most[0]].pts += 3;
      await c.setG({ hands, table, deck, cap, last, msg: msg + " · Oyun bitti", seq: g.seq + 1 });
      await new Promise((r) => setTimeout(r, 2500));
      return c.finish();
    }
  }
  await c.setG({ hands, table, deck, cap, last, msg, turn, seq: g.seq + 1, lastAt: Math.round(c.now()) });
}
