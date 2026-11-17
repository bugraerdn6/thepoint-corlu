import { sfx, buzz, unlock } from "../sound.js";
// ⚡ Refleks Yarışı — ekran yeşile dönünce ilk basan kazanır. Toplam süre en düşük olan kazanır.
const ROUNDS = 3;
const FALSE_START_MS = 1000;
const TIMEOUT_MS = 2000;
// Kademeli zorluk: 1. tur düz, 2. turda sahte renkler, 3. turda daha çok sahte + daha belirsiz bekleme
const DELAY = [[2000, 5000], [2500, 5500], [1500, 7000]];
const DECOYS = [0, 1, 2]; // + rastgele 0–1 ekstra (1. tur hariç)
const DECOY_MS = 450;

function roundPlan(now, r) {
  const t = Math.min(r, 3) - 1;
  const [lo, hi] = DELAY[t];
  const goAt = Math.round(now + lo + Math.random() * (hi - lo));
  const n = DECOYS[t] + (t > 0 && Math.random() < 0.5 ? 1 : 0);
  const decoys = [];
  for (let i = 0; i < n; i++) {
    const at = Math.round(now + 900 + Math.random() * (goAt - now - 900 - DECOY_MS - 300));
    if (at > now + 600) decoys.push({ at, col: Math.random() < 0.5 ? "y" : "b" });
  }
  decoys.sort((a, b) => a.at - b.at);
  return decoys.length ? { goAt, decoys } : { goAt, decoys: null };
}

export default {
  id: "refleks",
  name: "Refleks Yarışı",
  emoji: "⚡",
  desc: "2–10 kişi · Yeşil yanınca ilk basan kazanır",
  minPlayers: 2,
  maxPlayers: 10,
  soloTest: true,
  rules: `${ROUNDS} tur. Ekran kırmızıyken bekle, <b>sadece yeşile döndüğü an</b> ekrana bas. 2. turdan itibaren araya <b>sahte renkler</b> (sarı, mavi) girer, onlara basma! Erken basarsan +${FALSE_START_MS / 1000} sn ceza. Toplam süresi en düşük olan kazanır.`,

  start(c) {
    return { phase: "wait", round: 1, ...roundPlan(c.now(), 1) };
  },

  render(c) {
    const { g, local } = c;
    const r = g.round;
    const key = `r${r}`;

    if (g.phase === "result") return roundResult(c, r);

    const myTap = c.inputs[key]?.[c.me];
    if (local.scheduled === r) {
      if (myTap) showMyTap(c, r, myTap);
      return;
    }
    // yeni tur
    local.scheduled = r;
    c.clearTimers();
    const goAt = g.goAt;
    const delay = Math.max(0, goAt - c.now());
    if (myTap) return showMyTap(c, r, myTap);

    screen(c, "wait", r, "Bekle…", r === 1 ? "Yeşil olunca ekrana bas!" : "Sadece yeşilde bas! Sahte renklere dikkat 👀");
    const a = c.arena();
    a.onpointerdown = (e) => {
      e.preventDefault();
      unlock();
      if (local.tapped === r) return;
      if (c.now() < goAt) { sfx.hit(); buzz([80, 40, 80]); } else sfx.tick();
      const now = c.now();
      if (now < goAt) write(c, r, { ms: FALSE_START_MS, fs: true });
      else write(c, r, { ms: Math.min(Math.round(now - goAt), TIMEOUT_MS) });
    };
    // sahte renkler
    for (const d of g.decoys || []) {
      const wait = d.at - c.now();
      if (wait < 0) continue;
      c.timer(() => { if (local.tapped !== r && c.now() < goAt) screen(c, "decoy-" + d.col, r, "●", ""); }, wait);
      c.timer(() => { if (local.tapped !== r && c.now() < goAt) screen(c, "wait", r, "Bekle…", "Sadece yeşilde bas!"); }, wait + DECOY_MS);
    }
    c.timer(() => { if (local.tapped !== r) { screen(c, "go", r, "BAS!", ""); sfx.turn(); buzz(60); } }, delay);
    c.timer(() => { if (local.tapped !== r) write(c, r, { ms: TIMEOUT_MS, to: true }); }, delay + TIMEOUT_MS);
  },

  hostTick(c) {
    const { g } = c;
    if (g.phase !== "wait") return;
    const taps = c.inputs[`r${g.round}`] || {};
    const allIn = c.players.length > 0 && c.players.every((p) => taps[p.k]);
    if (!allIn && c.now() < g.goAt + TIMEOUT_MS + 1200) return;
    c.advance(async () => {
      await c.setG({ phase: "result" });
      await new Promise((res) => setTimeout(res, 2800));
      if (g.round < ROUNDS) await c.setG({ phase: "wait", round: g.round + 1, ...roundPlan(c.now(), g.round + 1) });
      else await c.finish();
    });
  },

  results(room) {
    const players = Object.keys(room.players || {});
    return players.map((k) => {
      let sum = 0;
      for (let r = 1; r <= ROUNDS; r++) sum += room.in?.[`r${r}`]?.[k]?.ms ?? TIMEOUT_MS;
      return { k, score: sum, label: `${sum} ms` };
    }).sort((a, b) => a.score - b.score);
  }
};

function write(c, r, val) {
  c.local.tapped = r;
  showMyTap(c, r, val);
  c.input(`r${r}`, val);
}

function screen(c, cls, r, big, sub) {
  const a = c.arena(cls);
  a.innerHTML = `<div class="round">Tur ${r} / ${ROUNDS}</div><div class="big">${big}</div><div class="sub">${sub}</div>`;
}

function showMyTap(c, r, t) {
  const wait = "<br><small>Diğerleri bekleniyor…</small>";
  if (t.fs) screen(c, "wait", r, "Erken!", `+${FALSE_START_MS / 1000} sn ceza 😅${wait}`);
  else if (t.to) screen(c, "idle", r, "Kaçtı!", `Basmadın, +${TIMEOUT_MS / 1000} sn${wait}`);
  else screen(c, "idle", r, `${t.ms} ms`, `${t.ms < 250 ? "Şimşek gibi ⚡" : t.ms < 400 ? "İyi refleks 👌" : "Biraz uykulu 🥱"}${wait}`);
}

function roundResult(c, r) {
  const taps = c.inputs[`r${r}`] || {};
  const rows = c.players
    .map((p) => ({ ...p, t: taps[p.k] || { ms: TIMEOUT_MS, to: true } }))
    .sort((a, b) => a.t.ms - b.t.ms);
  const a = c.arena("idle");
  a.onpointerdown = null;
  a.innerHTML = `
    <div class="round">Tur ${r} / ${ROUNDS} sonucu</div>
    <ol class="list arena-list">
      ${rows.map((x, i) => `<li><span class="rank">${i + 1}</span><span class="name">${c.esc(x.name)}</span>
        <span class="val">${x.t.fs ? "erken" : x.t.to ? "kaçtı" : x.t.ms + " ms"}</span></li>`).join("")}
    </ol>
    <div class="sub">${r < ROUNDS ? "Sonraki tur geliyor…" : "Sonuçlar hesaplanıyor…"}</div>`;
}
