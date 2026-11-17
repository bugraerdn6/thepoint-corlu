// Ortak oda motoru — bütün oyunlar bunu kullanır.
// Oyun modülü şunları sağlar: id, name, emoji, desc, minPlayers, maxPlayers, rules,
//   start(ctx) → ilk oyun durumu (g), render(ctx), hostTick(ctx), results(room) → [{k, score, label}]
//   lowerIsBetter (sıralama yönü)
import {
  db, ref, get, set, update, remove, onValue, onChildAdded, query, limitToLast,
  push, serverTimestamp, onDisconnect, serverNow
} from "./firebase.js";
import { POINTS } from "./config.js";
import { state, app, esc, toast, clearSubs, renderHome, addPoints, displayName } from "./app.js";
import { GAMES } from "./games/index.js";

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// Her oyun başlangıcında sabit, rastgele kimlik. startedAt sunucu saatiyle sonradan değişebildiği için
// telefondaki gizli bilgiler ve oyun hafızası buna bağlanır.
const newRunId = () => [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
export const runOf = (room) => room?.runId || room?.startedAt;
export const REACTIONS = ["👏", "😂", "🔥", "😮", "🍸", "GG"];
let R = null; // aktif oda

const randCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
export const gameOf = (id) => GAMES.find((g) => g.id === id);

// ---------- oda açma ----------
export function chooseVisibility(gameId) {
  const game = gameOf(gameId);
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = `
    <div class="card center">
      <p class="eyebrow">${game.emoji} ${esc(game.name)}</p>
      <h2>Kimler katılsın?</h2>
      <div class="stack" style="margin-top:1rem">
        <button class="btn primary block" data-v="private">🔒 Sadece masamız</button>
        <p class="muted small">Oda listede görünmez, sadece kodu verdiğin kişiler katılır.</p>
        <button class="btn accent block" data-v="public">🌐 Diğer masalar da katılsın</button>
        <p class="muted small">Oda "Açık odalar" listesinde görünür, mekandaki herkes katılabilir.</p>
        <button class="btn block" data-v="">Vazgeç</button>
      </div>
    </div>`;
  m.onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b && e.target !== m) return;
    m.remove();
    if (b && b.dataset.v) {
      try { await createRoom(gameId, b.dataset.v); } catch (err) { console.error(err); toast("Oda açılamadı, tekrar dene."); }
    }
  };
  document.body.appendChild(m);
}

async function createRoom(gameId, visibility) {
  for (let i = 0; i < 6; i++) {
    const code = randCode();
    try {
      await set(ref(db, `rooms/${code}`), {
        game: gameId, visibility, state: "lobby",
        host: displayName(state.profile), hostHk: state.hk, hostUid: state.uid,
        createdAt: serverTimestamp(),
        players: { [state.hk]: { name: displayName(state.profile), at: serverTimestamp() } }
      });
      return joinRoom(code);
    } catch { /* kod doluysa yenisini dene */ }
  }
  throw new Error("oda kodu üretilemedi");
}

// ---------- katılma / ayrılma ----------
export async function joinRoom(code) {
  code = code.toUpperCase();
  const roomRef = ref(db, `rooms/${code}`);
  const snap = await get(roomRef).catch(() => null);
  if (!snap || !snap.exists()) return toast("Oda bulunamadı: " + code);
  const room = snap.val();
  const game = gameOf(room.game);
  const already = room.players?.[state.hk];
  if (!game) return toast("Bu oyun henüz desteklenmiyor.");
  if (room.state === "closed") return toast("Bu oda kapanmış.");
  if (room.kicked?.[state.hk]) return toast("Bu odaya giremezsin.");
  if (room.state !== "lobby" && !already) return toast("Bu oyun başlamış, bir sonrakini bekle.");
  if (!already && Object.keys(room.players || {}).length >= game.maxPlayers) return toast("Oda dolu.");

  const meRef = ref(db, `rooms/${code}/players/${state.hk}`);
  if (!already) {
    try { await set(meRef, { name: displayName(state.profile), at: serverTimestamp() }); }
    catch { return toast("Bu odaya giremezsin."); }
  }
  onDisconnect(meRef).remove();
  const isHost = room.hostUid === state.uid;
  if (isHost) onDisconnect(roomRef).update({ state: "closed" });

  clearSubs();
  R = {
    code, game, isHost, room, roomRef, meRef, joinedAt: serverNow(),
    timers: [], local: {}, localKey: null, arena: null, hostLoop: null, advancing: false, awardedKey: null
  };
  history.replaceState(null, "", `?oda=${code}`);
  state.unsubs.push(onValue(roomRef, (s) => { if (R && R.code === code) { R.room = s.val(); render(); } }));
  state.unsubs.push(onChildAdded(query(ref(db, `rooms/${code}/rx`), limitToLast(1)), (s) => {
    const r = s.val();
    if (R && r && r.at >= R.joinedAt - 2000) showReaction(r);
  }));
  if (isHost) R.hostLoop = setInterval(() => {
    if (R?.room?.state === "play" && !R.advancing) {
      try { R.game.hostTick(ctx()); } catch (e) { console.error(e); }
    }
  }, 250);
}

export async function leave(silent) {
  if (!R) return;
  const r = R; R = null;
  r.timers.forEach(clearTimeout);
  clearInterval(r.hostLoop);
  r.arena?.remove();
  document.getElementById("rxbar")?.remove();
  try {
    await onDisconnect(r.meRef).cancel();
    if (r.isHost) {
      await onDisconnect(r.roomRef).cancel();
      await update(r.roomRef, { state: "closed" });
    } else if (!silent) {
      await remove(r.meRef);
    }
  } catch (e) { console.warn(e); }
  history.replaceState(null, "", location.pathname);
  renderHome();
}

// ---------- oyun modülüne verilen bağlam ----------
function ctx() {
  const room = R.room;
  // her yeni oyun başlangıcında yerel durumu sıfırla
  if (R.localKey !== runOf(room)) {
    R.timers.forEach(clearTimeout); R.timers = [];
    R.local = {}; R.localKey = runOf(room);
  }
  return {
    room, g: room.g || {}, inputs: room.in || {},
    me: state.hk, isHost: R.isHost, code: R.code,
    players: playerList(room),
    local: R.local,
    now: serverNow,
    // oyuncunun kendi girdisi (her anahtar için bir kez yazılabilir)
    input: (key, val) => set(ref(db, `rooms/${R.code}/in/${key}/${state.hk}`), val).catch((e) => console.warn(e)),
    // sadece oda sahibi: süresi dolan oyuncu adına otomatik hamle
    inputAs: (key, hk, val) => set(ref(db, `rooms/${R.code}/in/${key}/${hk}`), val).catch((e) => console.warn(e)),
    TEAMS,
    opt: (key) => { const o = (R.game.options || []).find((x) => x.key === key); return R.room.opt?.[key] ?? o?.default; },
    // sadece oda sahibi: oyun durumunu güncelle
    setG: (patch) => {
      const p = {};
      for (const [k, v] of Object.entries(patch)) p[`g/${k}`] = v;
      return update(R.roomRef, p);
    },
    // sadece oda sahibi: kilitli geçiş (aynı anda iki kez ilerlemesin)
    advance: async (fn, delay = 0) => {
      if (R.advancing) return;
      R.advancing = true;
      const done = () => { if (R) R.advancing = false; };
      const run = async () => { try { await fn(); } finally { done(); } };
      if (delay) R.timers.push(setTimeout(run, delay)); else await run();
    },
    finish: () => update(R.roomRef, { state: "done" }),
    timer: (fn, ms) => { const t = setTimeout(fn, ms); R.timers.push(t); return t; },
    clearTimers: () => { R.timers.forEach(clearTimeout); R.timers = []; },
    arena, hideArena, esc,
    leave: () => leave()
  };
}

export const playerList = (room) =>
  Object.entries(room.players || {}).map(([k, p]) => ({ k, name: p.name, team: p.team || null })).sort((a, b) => a.k.localeCompare(b.k));

export const TEAMS = { A: { name: "Mavi", emoji: "🔵" }, B: { name: "Turuncu", emoji: "🟠" } };

// Takımsız oyuncuları küçük takıma dağıt
function balanceTeams(players) {
  const patch = {};
  const count = { A: 0, B: 0 };
  players.forEach((p) => { if (p.team) count[p.team]++; });
  for (const p of players) {
    if (p.team) continue;
    const t = count.A <= count.B ? "A" : "B";
    count[t]++; p.team = t; patch[`players/${p.k}/team`] = t;
  }
  // bir takım boşsa en kalabalıktan birini aktar
  for (const [from, to] of [["A", "B"], ["B", "A"]]) {
    if (count[to] === 0 && count[from] > 1) {
      const p = players.find((x) => x.team === from);
      p.team = to; count[from]--; count[to]++; patch[`players/${p.k}/team`] = to;
    }
  }
  return { patch, count };
}

// ---------- ekranlar ----------
function render() {
  const room = R.room;
  if (!room || room.state === "closed") {
    if (!R.isHost) toast("Oda kapandı.");
    return leave(true);
  }
  if (room.kicked?.[state.hk] || (!room.players?.[state.hk] && room.state !== "closed")) {
    toast("Odadan çıkarıldın.");
    return leave(true);
  }
  ensureRxBar();
  if (room.state === "lobby") { R.awardedKey = null; return renderLobby(room); }
  if (room.state === "play") {
    try { return R.game.render(ctx()); } catch (e) { console.error(e); }
  }
  if (room.state === "done") return renderDone(room);
}

function renderLobby(room) {
  hideArena();
  const game = R.game;
  const players = playerList(room);
  const link = `${location.origin}${location.pathname}?oda=${R.code}`;
  const enough = players.length >= game.minPlayers;
  const myTeam = room.players?.[state.hk]?.team;
  app.innerHTML = `
    <section class="card center">
      <p class="eyebrow">${game.emoji} ${esc(game.name)}</p>
      <p class="muted">Oda kodu</p>
      <div class="code-big">${esc(R.code)}</div>
      <p style="margin-top:.6rem"><span class="level-chip">${room.visibility === "public" ? "🌐 Diğer masalar katılabilir" : "🔒 Sadece kodu bilenler"}</span></p>
      <div class="row" style="justify-content:center;margin-top:.8rem;flex-wrap:wrap">
        <button class="btn" id="share">🔗 Davet et</button>
        ${R.isHost ? `<button class="btn" id="vis">${room.visibility === "public" ? "🔒 Gizle" : "🌐 Herkese aç"}</button>` : ""}
      </div>
    </section>
    <section class="card">
      <h3>Oyuncular (${players.length}/${game.maxPlayers})</h3>
      <ul class="list" style="margin-top:.4rem">
        ${players.map((p) => `
          <li class="${p.k === state.hk ? "me" : ""}">
            <span class="name">${game.teams && p.team ? TEAMS[p.team].emoji + " " : ""}${esc(p.name)}${room.hostHk === p.k ? " 👑" : ""}</span>
            ${p.k !== state.hk ? `<button class="btn" style="min-height:36px;padding:.2rem .8rem" data-menu="${esc(p.k)}" aria-label="Seçenekler">⋯</button>` : ""}
          </li>`).join("")}
      </ul>
      ${game.teams ? `
        <div class="row" style="margin-top:.8rem">
          ${Object.entries(TEAMS).map(([t, v]) => `<button class="btn grow ${myTeam === t ? "primary" : ""}" data-team="${t}">${v.emoji} ${v.name}</button>`).join("")}
        </div>
        <p class="muted small center" style="margin-top:.3rem">Takımını seç. Seçmeyenler başlarken otomatik dağıtılır.</p>` : ""}
      ${(game.options || []).map((o) => {
        const cur = room.opt?.[o.key] ?? o.default;
        return `<div style="margin-top:.8rem"><p class="muted small">${esc(o.label)}</p>
          <div class="seg">${o.values.map((v) => `<button class="${cur === v.v ? "on" : ""}" data-opt="${esc(o.key)}" data-v="${v.v}" ${R.isHost ? "" : "disabled"}>${esc(v.label)}</button>`).join("")}</div></div>`;
      }).join("")}
      ${R.isHost ? `<div id="inviteBox"></div>` : ""}
      <hr>
      <p class="muted small"><b>Nasıl oynanır:</b> ${game.rules}</p>
      <p class="muted small" style="margin-top:.4rem">Kazanan +${POINTS.win} puan, katılan herkes +${POINTS.play} puan. En az ${game.minPlayers} kişi gerekli.</p>
      <div class="stack" style="margin-top:1rem">
        ${R.isHost
          ? `<button class="btn primary block" id="start" ${enough || game.soloTest ? "" : "disabled"}>${enough ? "Başlat →" : game.soloTest ? "Tek başına dene (puan yok)" : `${game.minPlayers - players.length} kişi daha bekleniyor`}</button>`
          : `<p class="center muted">Oda sahibinin başlatması bekleniyor…</p>`}
        ${R.isHost && game.bot && players.length === 1 ? `<button class="btn accent block" id="startBot">🤖 Bilgisayara karşı oyna <small>(deneme, puan yok)</small></button>` : ""}
        <button class="btn block" id="leave">← Odadan çık</button>
      </div>
    </section>`;

  document.getElementById("leave").onclick = () => leave();
  document.getElementById("share").onclick = async () => {
    try {
      if (navigator.share) await navigator.share({ title: `The Point · ${game.name}`, text: `Oda kodu: ${R.code}`, url: link });
      else { await navigator.clipboard.writeText(link); toast("Link kopyalandı"); }
    } catch { /* iptal */ }
  };
  const vis = document.getElementById("vis");
  if (vis) vis.onclick = () => update(R.roomRef, { visibility: room.visibility === "public" ? "private" : "public" });
  app.querySelectorAll("[data-menu]").forEach((b) => b.onclick = () => playerMenu(b.dataset.menu));
  app.querySelectorAll("[data-opt]").forEach((b) => b.onclick = () => {
    if (!R.isHost) return;
    const o = game.options.find((x) => x.key === b.dataset.opt);
    const v = o.values.find((x) => String(x.v) === b.dataset.v);
    if (v) update(R.roomRef, { [`opt/${o.key}`]: v.v });
  });
  app.querySelectorAll("[data-team]").forEach((b) => b.onclick = () => set(ref(db, `rooms/${R.code}/players/${state.hk}/team`), b.dataset.team));
  if (R.isHost) renderInviteBox(room);
  const start = document.getElementById("start");
  const startBot = document.getElementById("startBot");
  if (startBot) startBot.onclick = async () => {
    startBot.disabled = true;
    try {
      const g = await game.start({ ...ctx(), players, vsBot: true });
      await update(R.roomRef, { state: "play", g, in: null, rx: null, startedAt: serverTimestamp(), runId: newRunId() });
    } catch (e) { console.error(e); toast("Başlatılamadı."); startBot.disabled = false; }
  };
  if (start) start.onclick = async () => {
    start.disabled = true;
    try {
      let patch = {};
      if (game.teams) {
        const b = balanceTeams(players);
        patch = b.patch;
        if (players.length >= 2 && (!b.count.A || !b.count.B)) { toast("İki takımda da en az 1 kişi olmalı."); start.disabled = false; return; }
      }
      const g = await game.start({ ...ctx(), players });
      await update(R.roomRef, { ...patch, state: "play", g, in: null, rx: null, startedAt: serverTimestamp(), runId: newRunId() });
    } catch (e) { console.error(e); toast("Başlatılamadı."); start.disabled = false; }
  };
}

function playerMenu(k) {
  const p = R.room.players?.[k];
  if (!p) return;
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = `
    <div class="card center">
      <h3>${esc(p.name)}</h3>
      <div class="stack" style="margin-top:1rem">
        ${R.isHost ? `<button class="btn block" data-a="kick">🚪 Odadan çıkar</button>` : ""}
        <button class="btn block" data-a="block">🚫 Engelle</button>
        <button class="btn block" data-a="report">⚠️ Bildir</button>
        <button class="btn block" data-a="">Vazgeç</button>
      </div>
      <p class="muted small" style="margin-top:.8rem">Engellediğin kişi seni davet edemez, odalarına giremez, onun odalarını görmezsin.</p>
    </div>`;
  m.onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b && e.target !== m) return;
    m.remove();
    const a = b?.dataset.a;
    if (a === "kick") await kick(k);
    if (a === "block") await blockPlayer(k);
    if (a === "report") await reportPlayer(k);
  };
  document.body.appendChild(m);
}

async function kick(k) {
  await update(R.roomRef, { [`kicked/${k}`]: true, [`players/${k}`]: null });
  toast("Oyuncu odadan çıkarıldı.");
}

export async function blockPlayer(k) {
  await set(ref(db, `blocks/${state.hk}/${k}`), true);
  if (R?.isHost && R.room.players?.[k]) await kick(k);
  toast("Engellendi.");
}

export async function reportPlayer(k) {
  const reason = (prompt("Kısaca ne oldu? (isteğe bağlı)") || "").slice(0, 200);
  await push(ref(db, "reports"), { by: state.hk, target: k, room: R?.code || "", reason, at: serverTimestamp() });
  toast("Bildirimin mekana iletildi. Teşekkürler 🙏");
}

async function renderDone(room) {
  hideArena();
  const game = R.game;
  const players = playerList(room);
  const res = game.results(room)
    .map((r) => ({ ...r, name: room.players?.[r.k]?.name || "?" }))
    .filter((r) => room.players?.[r.k]);
  const best = res[0]?.score;
  const winners = res.filter((r) => r.score === best).map((r) => r.k);
  const multi = players.length >= game.minPlayers && players.length >= 2;
  const iWon = multi && winners.includes(state.hk);

  app.innerHTML = `
    <section class="card center">
      <p class="eyebrow">${game.emoji} ${esc(game.name)}</p>
      <h1>${multi ? (iWon ? "Kazandın! 🏆" : `Kazanan: ${esc(res[0]?.name || "")}`) : "Deneme bitti"}</h1>
      <p class="muted" id="award" style="margin-top:.5rem">${multi ? "Puanın yazılıyor…" : "Puan için yeterli oyuncu yoktu."}</p>
    </section>
    <section class="card">
      <h3>Sonuçlar</h3>
      <ol class="list" style="margin-top:.4rem">
        ${res.map((x, i) => `<li class="${x.k === state.hk ? "me" : ""}"><span class="rank">${i + 1}</span><span class="name">${esc(x.name)}</span><span class="val">${esc(x.label)}</span></li>`).join("")}
      </ol>
      ${game.summary ? `<div style="margin-top:1rem">${game.summary(room)}</div>` : ""}
      <div class="stack" style="margin-top:1rem">
        ${R.isHost && game.rematch ? `<button class="btn accent block" id="rematch">Rövanş ↻</button>` : ""}
        ${R.isHost ? `<button class="btn ${game.rematch ? "" : "primary"} block" id="again">${game.rematch ? "Lobiye dön" : "Tekrar oyna ↻"}</button>` : `<p class="center muted small">Oda sahibi ${game.rematch ? "rövanş" : "yeni oyun"} başlatabilir.</p>`}
        <button class="btn block" id="leave">← Ana sayfa</button>
      </div>
    </section>`;
  document.getElementById("leave").onclick = () => leave();
  const again = document.getElementById("again");
  if (again) again.onclick = () => update(R.roomRef, { state: "lobby", g: null, in: null });
  const rematch = document.getElementById("rematch");
  if (rematch) rematch.onclick = async () => {
    const vsBot = !!R.room.g?.bot;
    if (!vsBot && playerList(R.room).length < game.minPlayers) { toast("Rakip odadan çıkmış."); return; }
    rematch.disabled = true;
    try {
      const g = await game.start({ ...ctx(), players: playerList(R.room), vsBot });
      await update(R.roomRef, { state: "play", g, in: null, rx: null, startedAt: serverTimestamp(), runId: newRunId() });
    } catch (e) { console.error(e); toast("Başlatılamadı."); rematch.disabled = false; }
  };

  if (!multi) return;
  const key = `tp_award_${R.code}_${runOf(room)}`;
  if (R.awardedKey === key) return;
  R.awardedKey = key;
  const el = () => document.getElementById("award");
  if (localStorage.getItem(key)) { el() && (el().textContent = "Puanın yazıldı ✓"); return; }
  const pts = iWon ? POINTS.win : POINTS.play;
  const ok = await addPoints(pts);
  if (ok) { localStorage.setItem(key, "1"); el() && (el().textContent = `+${pts} puan kazandın ✓`); }
  else if (el()) el().textContent = "Puan yazılamadı (çok sık oynandı olabilir, biraz bekle).";
}

// ---------- meydan okuma davetleri ----------
async function renderInviteBox(room) {
  const box = document.getElementById("inviteBox");
  if (!box) return;
  const snap = await get(ref(db, "online")).catch(() => null);
  const box2 = document.getElementById("inviteBox");
  if (!box2 || !R) return;
  const cutoff = serverNow() - 15 * 60000;
  const list = Object.entries(snap?.val() || {})
    .filter(([k, v]) => k !== state.hk && !room.players?.[k] && v.at > cutoff && !state.blocks[k])
    .slice(0, 12);
  box2.innerHTML = list.length ? `
    <hr>
    <p class="muted small"><b>🎯 Diğer masalara meydan oku</b> · Davet almaya açık olanlar</p>
    <div class="chips">${list.map(([k, v]) => `<button class="chip" data-inv="${esc(k)}">${esc(v.name)}</button>`).join("")}</div>` : "";
  box2.querySelectorAll("[data-inv]").forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try {
      await set(ref(db, `invites/${b.dataset.inv}/${state.hk}`), { room: R.code, game: R.game.id, name: displayName(state.profile), at: serverTimestamp() });
      b.textContent = "✓ " + b.textContent; toast("Davet gönderildi.");
    } catch { toast("Bu kişiye şu an davet gönderilemiyor."); }
  });
}

// Profilinde davet açık olanlar "mekanda" listesine yazılır
let presenceRef = null;
export async function updatePresence() {
  const p = state.profile;
  if (!state.hk || !p) return;
  const r = ref(db, `online/${state.hk}`);
  try {
    if (p.invites) {
      await set(r, { name: displayName(p), at: serverTimestamp() });
      onDisconnect(r).remove();
      presenceRef = r;
    } else {
      await remove(r); presenceRef = null;
    }
  } catch (e) { console.warn(e); }
}

// Gelen davetler
let invitesUnsub = null;
export function watchInvites() {
  invitesUnsub?.();
  if (!state.hk) return;
  invitesUnsub = onValue(ref(db, `invites/${state.hk}`), (s) => {
    const all = s.val() || {};
    const seenKey = (f, v) => `tp_inv_${f}_${v.at}`;
    const seen = (f, v) => { try { return !!localStorage.getItem(seenKey(f, v)); } catch { return false; } };
    const markSeen = (f, v) => { try { localStorage.setItem(seenKey(f, v), "1"); } catch { /* */ } };
    // 10 dk'dan eski davetleri temizle (gönderen ancak o zaman tekrar davet edebilir)
    for (const [from, v] of Object.entries(all)) if (!(v.at > serverNow() - 10 * 60000)) remove(ref(db, `invites/${state.hk}/${from}`)).catch(() => {});
    const fresh = Object.entries(all).filter(([f, v]) => v.at > serverNow() - 10 * 60000 && !seen(f, v));
    if (!fresh.length || R || document.querySelector(".modal.invite")) return;
    const [from, inv] = fresh[0];
    if (state.blocks[from]) { markSeen(from, inv); return; }
    const game = gameOf(inv.game);
    const m = document.createElement("div");
    m.className = "modal invite";
    m.innerHTML = `
      <div class="card center">
        <p class="eyebrow">🎯 Meydan okuma</p>
        <h2>${esc(inv.name)}</h2>
        <p class="muted">seni ${game ? game.emoji + " " + esc(game.name) : "bir oyuna"} davet ediyor</p>
        <div class="stack" style="margin-top:1rem">
          <button class="btn primary block" data-a="join">Katıl →</button>
          <button class="btn block" data-a="no">Şimdi değil</button>
          <button class="btn block" data-a="block" style="font-size:.85rem">🚫 Bu kişiyi engelle</button>
        </div>
      </div>`;
    m.onclick = async (e) => {
      const a = e.target.closest("button")?.dataset.a;
      if (!a) return;
      m.remove();
      markSeen(from, inv); // silmiyoruz: 10 dk sınırı sürsün, reddetmek sessiz kalsın
      if (a === "join") joinRoom(inv.room);
      if (a === "block") { await set(ref(db, `blocks/${state.hk}/${from}`), true).catch(() => {}); toast("Engellendi."); }
    };
    document.body.appendChild(m);
  });
}

// ---------- tam ekran oyun alanı ----------
function arena(cls = "idle") {
  if (!R.arena) {
    R.arena = document.createElement("div");
    document.body.appendChild(R.arena);
  }
  R.arena.className = "arena " + cls;
  return R.arena;
}
function hideArena() { R?.arena?.remove(); if (R) R.arena = null; }

// ---------- hazır tepkiler ----------
let lastRx = 0;
function ensureRxBar() {
  if (document.getElementById("rxbar")) return;
  const bar = document.createElement("div");
  bar.id = "rxbar";
  bar.className = "rxbar";
  bar.innerHTML = REACTIONS.map((e) => `<button data-e="${e}">${e}</button>`).join("");
  bar.onclick = (ev) => {
    const b = ev.target.closest("button");
    if (!b || !R) return;
    if (Date.now() - lastRx < 2000) return;
    lastRx = Date.now();
    push(ref(db, `rooms/${R.code}/rx`), { hk: state.hk, e: b.dataset.e, at: serverTimestamp() }).catch(() => {});
  };
  document.body.appendChild(bar);
}

function showReaction(r) {
  if (!REACTIONS.includes(r.e)) return;
  const name = R?.room?.players?.[r.hk]?.name || "";
  const el = document.createElement("div");
  el.className = "rx-bubble";
  el.style.left = 10 + Math.random() * 70 + "%";
  el.innerHTML = `<b>${esc(r.e)}</b><small>${esc(name)}</small>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
