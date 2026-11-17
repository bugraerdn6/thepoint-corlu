// 🤥 Blöf — bütün deste dağıtılır. Sıradaki sayı As'tan başlayıp her hamlede bir artar.
// Oyuncu 1–4 kartı kapalı koyup "n tane X" der; herkes "Blöf!" diyebilir. Elini ilk bitiren kazanır.
import { newDeck, RANKS, rankOf, cardHtml, backs, turnBar, nextOf, rankName } from "./cards.js";

const TURN_MS = 30000;
const LAST_CARD_WAIT_MS = 7000; // son kartını koyana blöf demek için süre
const REVEAL_SHOW_MS = 5000;

export default {
  id: "blof", name: "Blöf", emoji: "🤥",
  desc: "3–6 kişi · Kartlarını blöfle bitir",
  rules: "Bütün kartlar dağıtılır. Sıradaki sayı As'tan başlar, her hamlede bir artar (As, 2, 3 … Papaz, As…). Sıran gelince <b>1–4 kartı kapalı koy</b> ve \"şu kadar tane şu sayı\" de; yalan da olabilir. Başkası koyduğunda inanmıyorsan <b>🤥 Blöf!</b> de: yalansa yerdeki bütün kartları koyan alır, doğruysa sen alırsın. <b>Elini ilk bitiren kazanır.</b>",
  minPlayers: 3, maxPlayers: 6, soloTest: false,

  start(c) {
    const order = c.players.map((p) => p.k).sort(() => Math.random() - 0.5);
    const deck = newDeck();
    const hands = Object.fromEntries(order.map((k) => [k, []]));
    deck.forEach((card, i) => hands[order[i % order.length]].push(card));
    return { order, hands, pile: null, rank: 0, turn: order[0], seq: 0, lastPlay: null, reveal: null, pendingWin: null, lastAt: Math.round(c.now()) };
  },

  render(c) {
    const { g, local } = c;
    const app = document.getElementById("app");
    c.hideArena();
    const name = (k) => c.esc(c.room.players?.[k]?.name || "?");
    const hand = sortHand(g.hands?.[c.me] || []);
    const claim = RANKS[g.rank % 13];
    const myTurn = g.turn === c.me && local.sent !== g.seq && !g.pendingWin;
    local.sel = (local.sel || []).filter((x) => hand.includes(x));
    if (local.selSeq !== g.seq) { local.selSeq = g.seq; local.sel = []; }
    const lp = g.lastPlay;
    const canCall = lp && lp.k !== c.me && local.called !== lp.no && !c.inputs[`x${lp.no}`]?.[c.me];
    const rv = g.reveal;

    app.innerHTML = `
      <section class="card center">
        <p class="eyebrow">🤥 Blöf · Yerde ${(g.pile || []).length} kart</p>
        <div class="opp-row">${g.order.filter((k) => k !== c.me).map((k) => `
          <div class="opp ${g.turn === k ? "on" : ""}"><b>${name(k)}</b>${backs((g.hands?.[k] || []).length)}</div>`).join("")}</div>
        ${rv ? `
          <div class="reveal ${rv.lie ? "lie" : "truth"}">
            <p><b>${name(rv.caller)}</b> "Blöf!" dedi → ${name(rv.k)} ${rv.n} tane ${rankName(rv.claim)} demişti:</p>
            <div class="hand small">${rv.cards.map((x) => cardHtml(x, { cls: rankOf(x) === rv.claim ? "" : "wrongc" })).join("")}</div>
            <p class="big-result" style="margin:.3rem 0">${rv.lie ? "YALANMIŞ! 🤥" : "DOĞRUYMUŞ! 😇"} ${name(rv.loser)} ${rv.taken} kartı aldı</p>
          </div>` : ""}
        ${lp ? `<p class="big-result">${name(lp.k)}: "${lp.n} tane <b>${rankName(lp.claim)}</b>"</p>` : `<p class="muted">İlk hamle bekleniyor</p>`}
        ${g.pendingWin ? `<p class="small" style="color:var(--terracotta)">⚠️ ${name(g.pendingWin.k)} son kartını koydu! İnanmıyorsan hemen Blöf de.</p>` : ""}
        ${canCall ? `<button class="btn accent block buzz" id="call" style="margin-top:.4rem">🤥 Blöf!</button>` : ""}
        <div class="cd" style="margin-top:.6rem"><i id="cdbar"></i></div>
        <p style="margin:.5rem 0">${myTurn ? `Sıra sende: <b>${rankName(claim)}</b> koy (1–4 kart seç)` : g.pendingWin ? "Bekleniyor…" : `${name(g.turn)} sırada · istenen: <b>${rankName(claim)}</b>`}</p>
        <div class="hand">${hand.map((card) => cardHtml(card, { data: `data-card="${c.esc(card)}"`, cls: local.sel.includes(card) ? "sel" : "", disabled: !myTurn })).join("")}</div>
        ${myTurn ? `<button class="btn primary block" id="play" style="margin-top:.8rem" ${local.sel.length ? "" : "disabled"}>${local.sel.length ? `${local.sel.length} tane ${rankName(claim)} koy →` : "Kart seç"}</button>` : ""}
        <p class="muted small" style="margin-top:.5rem">Elinde ${hand.length} kart</p>
      </section>`;

    app.querySelectorAll("[data-card]").forEach((b) => b.onclick = () => {
      if (!myTurn) return;
      const card = b.dataset.card;
      if (local.sel.includes(card)) local.sel = local.sel.filter((x) => x !== card);
      else if (local.sel.length < 4) local.sel.push(card);
      this.render(c);
    });
    const play = document.getElementById("play");
    if (play) play.onclick = () => {
      if (!local.sel.length) return;
      local.sent = g.seq;
      c.input(`a${g.seq}`, { cards: local.sel });
      local.sel = [];
    };
    const call = document.getElementById("call");
    if (call) call.onclick = () => {
      local.called = lp.no;
      c.input(`x${lp.no}`, { at: Math.round(c.now()) });
      call.disabled = true;
    };
    if (g.pendingWin) turnBar(c, `w${g.seq}`, g.pendingWin.until, LAST_CARD_WAIT_MS);
    else turnBar(c, `b${g.seq}`, g.lastAt + TURN_MS, TURN_MS);
  },

  hostTick(c) {
    const { g } = c;
    const lp = g.lastPlay;
    // 1) Blöf çağrısı var mı? (en erken basan)
    if (lp) {
      const calls = Object.entries(c.inputs[`x${lp.no}`] || {}).filter(([k]) => k !== lp.k && g.order.includes(k));
      if (calls.length) {
        calls.sort((a, b) => a[1].at - b[1].at);
        return c.advance(() => resolveCall(c, calls[0][0]));
      }
    }
    // 2) Son kartını koyan için bekleme süresi bitti mi?
    if (g.pendingWin) {
      if (c.now() > g.pendingWin.until) c.advance(() => c.finish());
      return;
    }
    // 3) Sıradaki oyuncunun hamlesi
    const hand = g.hands?.[g.turn] || [];
    const act = c.inputs[`a${g.seq}`]?.[g.turn];
    let cards = act && Array.isArray(act.cards) && act.cards.length >= 1 && act.cards.length <= 4 &&
      new Set(act.cards).size === act.cards.length && act.cards.every((x) => hand.includes(x)) ? act.cards : null;
    if (!cards && c.now() - g.lastAt > TURN_MS + 1000 && hand.length) cards = [hand[Math.floor(Math.random() * hand.length)]];
    if (!cards) return;
    c.advance(() => applyPlay(c, cards));
  },

  results(room) {
    const g = room.g;
    const winner = g?.pendingWin?.k || g?.order?.find((k) => !(g.hands?.[k] || []).length);
    return Object.keys(room.players || {}).map((k) => {
      const left = (g?.hands?.[k] || []).length;
      return { k, score: k === winner ? 100 : 52 - left, label: k === winner ? "Elini bitirdi 🏆" : `${left} kart kaldı` };
    }).sort((a, b) => b.score - a.score);
  }
};

const ORDER = Object.fromEntries(RANKS.map((r, i) => [r, i]));
const sortHand = (h) => [...h].sort((a, b) => ORDER[rankOf(a)] - ORDER[rankOf(b)] || a.localeCompare(b));

async function applyPlay(c, cards) {
  const g = c.g;
  const k = g.turn;
  const hands = Object.fromEntries(g.order.map((p) => [p, [...(g.hands?.[p] || [])]]));
  hands[k] = hands[k].filter((x) => !cards.includes(x));
  const pile = [...(g.pile || []), ...cards];
  const claim = RANKS[g.rank % 13];
  const lastPlay = { no: g.seq, k, n: cards.length, claim, cards };
  const now = Math.round(c.now());
  const patch = { hands, pile, lastPlay, rank: g.rank + 1, seq: g.seq + 1, lastAt: now, reveal: null };
  if (!hands[k].length) patch.pendingWin = { k, until: now + LAST_CARD_WAIT_MS };
  else patch.turn = nextOf(g.order, k, (p) => !(hands[p] || []).length);
  await c.setG(patch);
}

async function resolveCall(c, caller) {
  const g = c.g;
  const lp = g.lastPlay;
  const lie = lp.cards.some((x) => rankOf(x) !== lp.claim);
  const loser = lie ? lp.k : caller;
  const hands = Object.fromEntries(g.order.map((p) => [p, [...(g.hands?.[p] || [])]]));
  const pile = g.pile || [];
  hands[loser] = [...hands[loser], ...pile];
  const reveal = { caller, k: lp.k, n: lp.n, claim: lp.claim, cards: lp.cards, lie, loser, taken: pile.length };
  const patch = { hands, pile: null, lastPlay: null, reveal, lastAt: Math.round(c.now()) + REVEAL_SHOW_MS };
  if (g.pendingWin) {
    if (!lie) { await c.setG({ ...patch, pendingWin: { k: lp.k, until: Math.round(c.now()) + REVEAL_SHOW_MS } }); return; } // doğruymuş → kazandı
    patch.pendingWin = null;
    patch.turn = nextOf(g.order, lp.k, (p) => !(hands[p] || []).length);
  }
  await c.setG(patch);
}
