// 🤥 İki Doğru Bir Yalan — herkes kendisi hakkında 3 cümle yazar, diğerleri yalanı bulur.
// Yalanın hangisi olduğu cevap anına kadar sadece yazanın telefonunda tutulur.
import { checkText } from "../filter.js";
import { shuffle } from "./quiz.js";

const WRITE_MS = 120000;
const VOTE_MS = 25000;
const REVEAL_MS = 5000;
const LIE_WAIT_MS = 8000;
const MAXLEN = 80;

const lieKey = (c) => `tp_lie_${c.code}_${c.room.runId || c.room.startedAt}`;

function roundScore(room, r) {
  const g = room.g;
  const author = g.authors?.[r];
  const lie = room.in?.[`l${r}`]?.[author]?.l;
  const pts = {};
  if (author == null || lie == null) return pts;
  for (const [k, v] of Object.entries(room.in?.[`v${r}`] || {})) {
    if (k === author) continue;
    if (v.c === lie) pts[k] = (pts[k] || 0) + 100;
    else pts[author] = (pts[author] || 0) + 50; // kandırdığı her kişi için
  }
  return pts;
}

export default {
  id: "ikidogru", name: "İki Doğru Bir Yalan", emoji: "🤥",
  desc: "3–8 kişi · Kendini anlat, yalanı bul",
  rules: "Herkes kendisi hakkında 2 doğru, 1 yalan cümle yazar. Sonra sırayla herkesin cümleleri çıkar, <b>yalanı bulan</b> 100 puan alır. Yazan kişi, kandırdığı her kişi için 50 puan alır. İletişim bilgisi ve uygunsuz kelime yazılamaz.",
  minPlayers: 3, maxPlayers: 8, soloTest: false,

  start(c) {
    try { localStorage.removeItem(lieKey(c)); } catch { /* */ }
    return { phase: "write", endAt: Math.round(c.now() + WRITE_MS) };
  },

  render(c) {
    const { g, local } = c;
    const app = document.getElementById("app");
    c.hideArena();
    const written = c.inputs.w || {};

    if (g.phase === "write") {
      if (written[c.me] || local.sent) {
        app.innerHTML = `
          <section class="card center">
            <p class="eyebrow">🤥 İki Doğru Bir Yalan</p>
            <h2>Cümlelerin gönderildi ✓</h2>
            <p class="muted" style="margin-top:.5rem">Diğerleri yazıyor… ${Object.keys(written).length}/${c.players.length}</p>
          </section>`;
        return;
      }
      if (local.formOpen) return; // yazarken ekranı yenileme
      local.formOpen = true;
      app.innerHTML = `
        <form class="card stack" id="tdForm">
          <p class="eyebrow">🤥 İki Doğru Bir Yalan</p>
          <h2>Kendin hakkında 3 cümle</h2>
          <p class="muted small">İkisi doğru, biri yalan olsun. Yalan olanı işaretle. Kimse senin işaretini göremez.</p>
          ${[0, 1, 2].map((i) => `
            <div>
              <div class="field"><input type="text" id="s${i}" maxlength="${MAXLEN}" placeholder="${["Hiç uçağa binmedim", "3 dil konuşurum", "Bir ünlüyle tanıştım"][i]}" required></div>
              <label class="check" style="margin-top:.3rem"><input type="radio" name="lie" value="${i}" ${i === 2 ? "checked" : ""}> <span>Bu yalan</span></label>
            </div>`).join("")}
          <button class="btn primary block" type="submit">Gönder →</button>
          <p class="muted small center" id="tdMsg"></p>
        </form>`;
      document.getElementById("tdForm").onsubmit = (e) => {
        e.preventDefault();
        const s = [0, 1, 2].map((i) => document.getElementById(`s${i}`).value.trim().replace(/\s+/g, " "));
        const msg = document.getElementById("tdMsg");
        if (s.some((x) => x.length < 3)) { msg.textContent = "Üç cümleyi de yaz."; return; }
        for (const x of s) { const ch = checkText(x); if (!ch.ok) { msg.textContent = ch.reason; return; } }
        const lie = Number(document.querySelector('input[name="lie"]:checked').value);
        try { localStorage.setItem(lieKey(c), String(lie)); } catch { /* */ }
        local.sent = true; local.formOpen = false;
        c.input("w", { s });
        app.innerHTML = `<section class="card center"><h2>Gönderildi ✓</h2><p class="muted">Diğerleri bekleniyor…</p></section>`;
      };
      return;
    }

    local.formOpen = false;
    const r = g.round;
    const author = g.authors[r];
    const authorName = c.room.players?.[author]?.name || "Biri";
    const st = written[author]?.s || [];
    const votes = c.inputs[`v${r}`] || {};
    const myVote = votes[c.me]?.c ?? local[`v${r}`];
    const isAuthor = author === c.me;

    // yazar, cevap anında yalanını açıklar
    if (g.phase === "reveal" && isAuthor && !c.inputs[`l${r}`]?.[c.me] && !local[`l${r}`]) {
      const lie = Number(localStorage.getItem(lieKey(c)));
      if (!Number.isNaN(lie)) { local[`l${r}`] = true; c.input(`l${r}`, { l: lie }); }
    }

    if (g.phase === "vote") {
      app.innerHTML = `
        <section class="card center quiz">
          <p class="eyebrow">🤥 ${r + 1}/${g.authors.length}</p>
          <h2>${c.esc(authorName)}</h2>
          <p class="muted">${isAuthor ? "Bunlar senin cümlelerin! Bakalım kim kanacak 😏" : "Hangisi yalan?"}</p>
          <div class="cd"><i id="cdbar"></i></div>
          <div class="opts one">
            ${st.map((s, i) => `<button class="opt ${myVote === i ? "picked" : ""}" data-i="${i}" ${isAuthor || myVote !== undefined ? "disabled" : ""}>${c.esc(s)}</button>`).join("")}
          </div>
          <p class="muted small" style="margin-top:.8rem">${Object.keys(votes).length}/${c.players.length - 1} kişi oyladı</p>
        </section>`;
      app.querySelectorAll(".opt").forEach((b) => b.onclick = () => {
        if (isAuthor || local[`v${r}`] !== undefined) return;
        const i = Number(b.dataset.i);
        local[`v${r}`] = i;
        c.input(`v${r}`, { c: i });
        app.querySelectorAll(".opt").forEach((x) => { x.disabled = true; if (Number(x.dataset.i) === i) x.classList.add("picked"); });
      });
      if (local.cdRound !== r) {
        local.cdRound = r;
        const tick = () => {
          const bar = document.getElementById("cdbar");
          if (!bar) return;
          const left = Math.max(0, g.endAt - c.now());
          bar.style.width = (left / VOTE_MS) * 100 + "%";
          if (left > 0) c.timer(tick, 100);
        };
        tick();
      }
      return;
    }

    // reveal
    const lie = c.inputs[`l${r}`]?.[author]?.l;
    const counts = {};
    Object.entries(votes).forEach(([k, v]) => { if (k !== author) counts[v.c] = (counts[v.c] || 0) + 1; });
    const pts = roundScore(c.room, r)[c.me] || 0;
    app.innerHTML = `
      <section class="card center quiz">
        <p class="eyebrow">🤥 ${r + 1}/${g.authors.length}</p>
        <h2>${c.esc(authorName)}</h2>
        <div class="opts one">
          ${st.map((s, i) => `<div class="opt ${lie === i ? "wrong" : lie != null ? "right" : ""} ${myVote === i ? "picked" : ""}">
            ${lie === i ? "🤥 " : lie != null ? "✅ " : ""}${c.esc(s)}<span class="cnt">${counts[i] || 0}</span></div>`).join("")}
        </div>
        <p class="big-result">${lie == null ? "Yalan açıklanıyor…" : pts ? `+${pts} puan 🎉` : isAuthor ? "Kimseyi kandıramadın 😅" : "Kandırıldın 😅"}</p>
      </section>`;
  },

  hostTick(c) {
    const { g } = c;
    if (g.phase === "write") {
      const written = c.inputs.w || {};
      const allIn = c.players.every((p) => written[p.k]);
      if (!allIn && c.now() < g.endAt) return;
      const authors = shuffle(Object.keys(written).filter((k) => c.room.players?.[k]));
      c.advance(async () => {
        if (authors.length < 2) return c.finish();
        await c.setG({ phase: "vote", round: 0, authors, endAt: Math.round(c.now() + VOTE_MS) });
      });
      return;
    }
    if (g.phase === "vote") {
      const author = g.authors[g.round];
      const votes = c.inputs[`v${g.round}`] || {};
      const voters = c.players.filter((p) => p.k !== author);
      const allIn = voters.every((p) => votes[p.k]);
      if (!allIn && c.now() < g.endAt + 500) return;
      c.advance(() => c.setG({ phase: "reveal", revealAt: Math.round(c.now()) }));
      return;
    }
    if (g.phase === "reveal") {
      const author = g.authors[g.round];
      const hasLie = c.inputs[`l${g.round}`]?.[author];
      const t = c.now() - g.revealAt;
      if (!((hasLie && t > REVEAL_MS) || t > LIE_WAIT_MS + REVEAL_MS)) return;
      c.advance(async () => {
        if (g.round + 1 < g.authors.length) await c.setG({ phase: "vote", round: g.round + 1, endAt: Math.round(c.now() + VOTE_MS) });
        else await c.finish();
      });
    }
  },

  results(room) {
    const t = {};
    (room.g?.authors || []).forEach((_, r) => {
      for (const [k, v] of Object.entries(roundScore(room, r))) t[k] = (t[k] || 0) + v;
    });
    return Object.keys(room.players || {})
      .map((k) => ({ k, score: t[k] || 0, label: `${t[k] || 0} puan` }))
      .sort((a, b) => b.score - a.score);
  }
};
