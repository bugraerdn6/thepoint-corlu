// 🃏 Pişti — 2–4 kişi (bireysel). Oda sahibinin telefonu desteyi karıştırır ve kuralları uygular.
import { newDeck, rankOf, suitOf, cardHtml, fanHtml, backFan, turnBar, nextOf, rankName, fly, rectOf, burst } from "./cards.js";
import { sfx, buzz, unlock } from "../sound.js";

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
    return { order, deck, table, hands, cap, turn: order[0], seq: 0, dealN: 1, lastAt: Math.round(c.now()), msg: "Oyun başladı. Yerde 4 kart var, üstteki açık." };
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
    const deckN = (g.deck || []).length;
    // değişiklik: yeni hamle / yeni dağıtım → animasyon
    const act = g.act && g.act.seq === g.seq - 1 && local.animSeq !== g.seq ? g.act : null;
    const newDeal = local.dealN !== undefined && g.dealN !== local.dealN;
    const firstRender = local.dealN === undefined;
    local.animSeq = g.seq; local.dealN = g.dealN;

    app.innerHTML = `
      <section class="card center ptable">
        <p class="eyebrow">🃏 Pişti</p>
        <div class="opp-row">${g.order.filter((k) => k !== c.me).map((k) => `
          <div class="opp ${g.turn === k ? "on" : ""}" data-opp="${c.esc(k)}"><b>${name(k)}</b>${backFan((g.hands?.[k] || []).length)}<small>${g.cap[k].pts} puan · ${g.cap[k].n} kart${g.cap[k].pisti ? ` · ${g.cap[k].pisti}🎉` : ""}</small></div>`).join("")}</div>
        <div class="felt pfelt" id="pFelt">
          <div class="pdeck" id="pDeck">${deckN ? `${cardHtml(null)}<em>${deckN}</em>` : ""}</div>
          <div class="ppile">
            ${table.slice(-4, -1).map((_, i, arr) => `<span class="under" style="--r:${(i - arr.length) * 7 + 3}deg;--dx:${(i - arr.length) * 12 - 14}px">${cardHtml(null)}</span>`).join("")}
            ${top ? `<span class="ptop" id="pTop">${cardHtml(top, { cls: "big" })}</span>` : `<span class="pempty" id="pTop">Yer boş</span>`}
          </div>
          <div class="pcount">${table.length ? `${table.length} kart` : ""}</div>
        </div>
        <p class="small pmsg">${c.esc(g.msg || "")}</p>
        <div class="cd"><i id="cdbar"></i></div>
        <p class="big-result" style="margin:.3rem 0">${myTurn ? "Sıra sende, bir kart at" : `${name(g.turn)} oynuyor…`}</p>
        <div class="phand" id="pHand">${fanHtml(hand, { dataOf: (card) => `data-card="${c.esc(card)}"`, disabled: !myTurn, cls: myTurn ? "active" : "" })}</div>
        <p class="muted small" id="pMe" style="margin-top:.4rem">Sen: <b>${g.cap[c.me]?.pts || 0} puan</b> · ${g.cap[c.me]?.n || 0} kart${g.cap[c.me]?.pisti ? ` · ${g.cap[c.me].pisti} pişti 🎉` : ""}</p>
      </section>`;

    app.querySelectorAll("[data-card]").forEach((b) => b.onclick = () => {
      if (!myTurn) return;
      unlock();
      local.sent = g.seq;
      local.fromRect = rectOf(b); // kartın uçacağı başlangıç noktası
      c.input(`a${g.seq}`, { card: b.dataset.card });
      app.querySelectorAll("[data-card]").forEach((x) => { x.disabled = true; });
      b.classList.add("played");
      sfx.tick();
    });
    turnBar(c, `p${g.seq}`, g.lastAt + TURN_MS, TURN_MS);

    // ---- animasyonlar ----
    const boxOf = (k) => (k === c.me ? document.getElementById("pMe") : app.querySelector(`[data-opp="${CSS.escape(k)}"]`));
    if (act) {
      const topEl = document.getElementById("pTop");
      const from = act.k === c.me ? (local.fromRect || rectOf(document.getElementById("pHand"))) : rectOf(boxOf(act.k));
      local.fromRect = null;
      const target = rectOf(topEl?.firstElementChild || topEl);
      if (!act.took && topEl) topEl.style.visibility = "hidden";
      fly(cardHtml(act.card), from, target, { ms: 360, rotate: act.k === c.me ? -4 : 6 }).then(() => {
        if (topEl) topEl.style.visibility = "";
        sfx.checker();
        if (act.took) {
          // masa süpürülür: alan oyuncuya doğru kapalı kartlar uçar
          const felt = rectOf(document.getElementById("pFelt"));
          const dest = rectOf(boxOf(act.k));
          const cardBox = target ? { x: felt.x + felt.w / 2 - target.w / 2, y: felt.y + felt.h / 2 - target.h / 2, w: target.w, h: target.h } : null;
          if (act.pisti) { burst(document.getElementById("pFelt"), `PİŞTİ! +${act.pisti}`, "gold"); sfx.turn(); buzz([40, 40, 80]); }
          for (let i = 0; i < Math.min(act.took, 5); i++) fly(cardHtml(null), cardBox, dest, { ms: 420, delay: 120 + i * 60, scaleTo: 0.45, rotate: 20 });
          if (act.took >= 2) setTimeout(() => sfx.dice(260), 150);
        }
      });
    }
    // dağıtım: desteden ellere kartlar uçar
    if (newDeal || (firstRender && g.seq === 0)) {
      const deck = rectOf(document.getElementById("pDeck")?.querySelector(".pcard")) || rectOf(document.getElementById("pFelt"));
      let i = 0;
      for (const k of g.order) for (let j = 0; j < 4; j++) {
        const dest = k === c.me ? rectOf(app.querySelectorAll("#pHand .pcard")[j]) : rectOf(boxOf(k));
        fly(cardHtml(null), deck, dest, { ms: 300, delay: i++ * 70, scaleTo: k === c.me ? 1 : 0.4 });
      }
      setTimeout(() => sfx.dice(500), 60);
    }
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
  const act = { seq: g.seq, k, card, took: 0, pisti: 0 };
  const top = table[table.length - 1];

  if (top && (rankOf(card) === rankOf(top) || rankOf(card) === "J")) {
    const pisti = table.length === 1 && rankOf(card) === rankOf(top);
    const bonus = pisti ? (rankOf(card) === "J" ? 20 : 10) : 0;
    const won = [...table, card];
    cap[k].n += won.length;
    cap[k].pts += won.reduce((a, x) => a + cardPts(x), 0) + bonus;
    if (pisti) cap[k].pisti++;
    msg = pisti ? `🎉 ${name} PİŞTİ yaptı! +${bonus}` : `${name} ${rankName(rankOf(card))}${suitOf(card)} ile ${won.length} kart aldı`;
    act.took = won.length; act.pisti = bonus;
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
      act.deal = true;
    } else {
      // el bitti: yerdekiler son alana, en çok karta +3
      if (table.length && last) { cap[last].n += table.length; cap[last].pts += table.reduce((a, x) => a + cardPts(x), 0); table = []; }
      const max = Math.max(...g.order.map((p) => cap[p].n));
      const most = g.order.filter((p) => cap[p].n === max);
      if (most.length === 1) cap[most[0]].pts += 3;
      await c.setG({ hands, table, deck, cap, last, act, msg: msg + " · Oyun bitti", seq: g.seq + 1 });
      await new Promise((r) => setTimeout(r, 2500));
      return c.finish();
    }
  }
  await c.setG({ hands, table, deck, cap, last, act, msg, turn, seq: g.seq + 1, lastAt: Math.round(c.now()), dealN: (g.dealN || 1) + (act.deal ? 1 : 0) });
}
