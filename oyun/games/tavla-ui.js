// Tavla ekranı — tam ekran yan tahta, 3B zarlar, akıllı dokunuş + sürükle-bırak, otomatik onay,
// canlı pul animasyonları, anlık yorumlar, ses. Kural/maç mantığı tavla.js ve tavla-rules.js'te.
import * as R from "./tavla-rules.js";
import { sfx, buzz, unlock, isMuted, setMuted } from "../sound.js";

// ---------- tema (The Point) ----------
const T = {
  frame1: "#3a4527", frame2: "#1f2516", field: "#efe5c8", ptA: "#5c6a3f", ptB: "#c1622f",
  bar: "#262c19", tray: "#262c19", gold: "#e8b04a",
  ck: [
    { a: "#fffdf6", b: "#e3d6b6", edge: "#b9a87d", ring: "#c9b98f", txt: "#3a3424" },
    { a: "#4d4436", b: "#1d1912", edge: "#0d0b08", ring: "#6b6250", txt: "#f2ead4" }
  ]
};
const AUTO_SEND_MS = 1500;   // son hamleden sonra otomatik onay süresi
const CALLOUT_MS = 1700;

// ---------- tahta geometrisi (SVG birimleri) ----------
const W = 380, H = 300, FR = 10, PW = 25, BW = 26;
const X0 = FR, BX = X0 + 6 * PW, RX = BX + BW, TRAY = RX + 6 * PW + 4;
const TOP = FR, BOT = H - FR, PH = 118, CR = 11.2, STEP = 22;

const colX = (pt) => (pt <= 6 ? RX + (6 - pt) * PW : pt <= 12 ? X0 + (12 - pt) * PW : pt <= 18 ? X0 + (pt - 13) * PW : RX + (pt - 19) * PW);
const isTop = (pt) => pt >= 13;

function posOf(mine, loc, i) {
  if (loc === "bar") return { x: BX + BW / 2, y: mine ? H / 2 + 20 + i * 21 : H / 2 - 20 - i * 21 };
  if (loc === "off") return { x: TRAY + (W - FR - TRAY) / 2, y: mine ? BOT - 6 - i * 7 : TOP + 6 + i * 7 };
  const top = isTop(loc), k = Math.min(i, 4);
  return { x: colX(loc) + PW / 2, y: top ? TOP + CR + 1 + k * STEP : BOT - CR - 1 - k * STEP };
}

function hitTest(x, y) {
  if (x >= TRAY - 2) return R.OFF;
  if (x >= BX && x < RX) return R.BAR;
  const top = y < H / 2;
  if (x >= X0 && x < BX) { const col = Math.floor((x - X0) / PW); return top ? 13 + col : 12 - col; }
  if (x >= RX && x < RX + 6 * PW) { const col = Math.floor((x - RX) / PW); return top ? 19 + col : 6 - col; }
  return null;
}

// ---------- doku (bir kez üretilir) ----------
let TEX = null;
function textures() {
  if (TEX) return TEX;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // ahşap damarları: çerçeve boyunca hafif dalgalı ince çizgiler
  let wood = "";
  for (let i = 0; i < 46; i++) {
    const y = rnd() * H, a = 1 + rnd() * 3, f = 0.01 + rnd() * 0.02, ph = rnd() * 6;
    let d = `M0 ${y.toFixed(1)}`;
    for (let x = 20; x <= W; x += 20) d += ` L${x} ${(y + Math.sin(x * f + ph) * a).toFixed(1)}`;
    wood += `<path d="${d}" fill="none" stroke="${rnd() < 0.5 ? "#000" : "#fff"}" stroke-opacity="${(0.03 + rnd() * 0.05).toFixed(3)}" stroke-width="${(0.5 + rnd() * 1.4).toFixed(2)}"/>`;
  }
  // keçe: küçük, seyrek noktacıklar (desen)
  let felt = "";
  for (let i = 0; i < 70; i++) felt += `<circle cx="${(rnd() * 24).toFixed(1)}" cy="${(rnd() * 24).toFixed(1)}" r="${(0.25 + rnd() * 0.45).toFixed(2)}" fill="${rnd() < 0.5 ? "#7a6a45" : "#fff"}" fill-opacity="${(0.08 + rnd() * 0.1).toFixed(2)}"/>`;
  TEX = { wood, felt };
  return TEX;
}

// ---------- SVG tahta ----------
function disc(x, y, clr, label, cls = "") {
  const c = T.ck[clr];
  return `<g class="tv-ck ${cls}" transform="translate(${x} ${y})">
    <circle cy="1.9" r="${CR}" fill="${c.edge}"/>
    <circle r="${CR}" fill="url(#ckg${clr})" stroke="${c.ring}" stroke-width=".8"/>
    <circle r="${CR * 0.62}" fill="none" stroke="${c.ring}" stroke-width="1" opacity=".75"/>
    <circle r="${CR * 0.3}" fill="${c.ring}" opacity=".18"/>
    ${label ? `<text y="4" text-anchor="middle" font-size="11" font-weight="700" fill="${c.txt}" font-family="Jost,sans-serif">${label}</text>` : ""}
  </g>`;
}
const discInner = (clr) => disc(0, 0, clr, "").replace(/^<g[^>]*>|<\/g>\s*$/g, "");

function boardSvg(v, me, o = {}) {
  const tex = textures();
  const myC = me, opC = 1 - me;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" class="tv-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="fr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.frame1}"/><stop offset="1" stop-color="${T.frame2}"/></linearGradient>
    <linearGradient id="fld" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6eed8"/><stop offset=".5" stop-color="${T.field}"/><stop offset="1" stop-color="#f6eed8"/></linearGradient>
    <pattern id="felt" width="24" height="24" patternUnits="userSpaceOnUse">${tex.felt}</pattern>
    <radialGradient id="ckg0" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="${T.ck[0].a}"/><stop offset="1" stop-color="${T.ck[0].b}"/></radialGradient>
    <radialGradient id="ckg1" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="${T.ck[1].a}"/><stop offset="1" stop-color="${T.ck[1].b}"/></radialGradient>
    <linearGradient id="inShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".06" stop-color="#000" stop-opacity="0"/><stop offset=".94" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>
    <clipPath id="logoClip"><circle cx="${BX + BW / 2}" cy="${H / 2}" r="${BW / 2 - 2}"/></clipPath>
    <marker id="arw" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${T.gold}"/></marker>
  </defs>
  <rect width="${W}" height="${H}" rx="12" fill="url(#fr)"/>
  ${tex.wood}
  <rect x="${X0}" y="${TOP}" width="${6 * PW}" height="${BOT - TOP}" fill="url(#fld)"/>
  <rect x="${RX}" y="${TOP}" width="${6 * PW}" height="${BOT - TOP}" fill="url(#fld)"/>
  <rect x="${X0}" y="${TOP}" width="${6 * PW}" height="${BOT - TOP}" fill="url(#felt)"/>
  <rect x="${RX}" y="${TOP}" width="${6 * PW}" height="${BOT - TOP}" fill="url(#felt)"/>
  <rect x="${BX}" y="${TOP}" width="${BW}" height="${BOT - TOP}" fill="${T.bar}"/>
  <rect x="${TRAY}" y="${TOP}" width="${W - FR - TRAY}" height="${BOT - TOP}" rx="5" fill="${T.tray}" stroke="#000" stroke-opacity=".3"/>
  <image href="../images/favicon-180.jpg" x="${BX + 2}" y="${H / 2 - BW / 2 + 2}" width="${BW - 4}" height="${BW - 4}" clip-path="url(#logoClip)" opacity=".9"/>
  <circle cx="${BX + BW / 2}" cy="${H / 2}" r="${BW / 2 - 2}" fill="none" stroke="${T.gold}" stroke-opacity=".6"/>`;

  for (let pt = 1; pt <= 24; pt++) {
    const x = colX(pt), top = isTop(pt);
    const y0 = top ? TOP : BOT, y1 = top ? TOP + PH : BOT - PH;
    s += `<polygon points="${x + 1},${y0} ${x + PW - 1},${y0} ${x + PW / 2},${y1}" fill="${pt % 2 === 0 ? T.ptA : T.ptB}" opacity=".93"/>`;
  }
  // iç kenar gölgesi (alan çerçevenin içine gömülü görünsün)
  s += `<rect x="${X0}" y="${TOP}" width="${6 * PW}" height="${BOT - TOP}" fill="url(#inShade)"/><rect x="${RX}" y="${TOP}" width="${6 * PW}" height="${BOT - TOP}" fill="url(#inShade)"/>`;

  // pullar
  const hide = o.hide || new Set();
  for (let pt = 1; pt <= 24; pt++) {
    const n = Math.abs(v.p[pt]); if (!n) continue;
    const mine = v.p[pt] > 0, show = Math.min(n, 5);
    for (let i = 0; i < show; i++) {
      if (hide.has(`${pt}:${i}`)) continue;
      const p = posOf(mine, pt, i);
      const last = i === show - 1;
      s += disc(p.x, p.y, mine ? myC : opC, last && n > 5 ? n : "", mine && last && o.sources?.has(pt) ? "src" : "");
    }
  }
  for (let i = 0; i < Math.min(v.bar[0], 4); i++) { const p = posOf(true, "bar", i); s += disc(p.x, p.y, myC, i === Math.min(v.bar[0], 4) - 1 && v.bar[0] > 4 ? v.bar[0] : "", i === 0 && o.sources?.has(R.BAR) ? "src" : ""); }
  for (let i = 0; i < Math.min(v.bar[1], 4); i++) { const p = posOf(false, "bar", i); s += disc(p.x, p.y, opC, i === Math.min(v.bar[1], 4) - 1 && v.bar[1] > 4 ? v.bar[1] : ""); }
  const tw = W - FR - TRAY - 6;
  for (let i = 0; i < v.off[0]; i++) { const p = posOf(true, "off", i); s += `<rect x="${p.x - tw / 2}" y="${p.y - 2.5}" width="${tw}" height="5" rx="2" fill="url(#ckg${myC})" stroke="${T.ck[myC].ring}" stroke-width=".6"/>`; }
  for (let i = 0; i < v.off[1]; i++) { const p = posOf(false, "off", i); s += `<rect x="${p.x - tw / 2}" y="${p.y - 2.5}" width="${tw}" height="5" rx="2" fill="url(#ckg${opC})" stroke="${T.ck[opC].ring}" stroke-width=".6"/>`; }

  // rakibin son hamlesi: yol okları
  for (const a of o.oppPaths || []) {
    const mx = (a.from.x + a.to.x) / 2, my = (a.from.y + a.to.y) / 2;
    const bend = Math.max(-40, Math.min(40, (a.to.x - a.from.x) * 0.25 + 18 * (a.from.y < H / 2 ? 1 : -1)));
    s += `<path d="M${a.from.x} ${a.from.y} Q${mx} ${my + bend} ${a.to.x} ${a.to.y}" fill="none" stroke="${T.gold}" stroke-width="2" stroke-opacity=".8" stroke-dasharray="4 3" marker-end="url(#arw)"/>`;
  }
  s += targetsSvg(o.targets || [], v);
  s += `<g id="tvFx"></g></svg>`;
  return s;
}

// Hedef işaretleri (üstünde zar sayısı)
function targetsSvg(steps, v) {
  const byTo = new Map();
  for (const t of steps) { if (!byTo.has(t.to)) byTo.set(t.to, []); byTo.get(t.to).push(t.d); }
  let s = "";
  for (const [to, ds] of byTo) {
    const label = [...new Set(ds)].sort().join("/");
    if (to === R.OFF) {
      s += `<rect class="tv-tgt" x="${TRAY + 1}" y="${H / 2}" width="${W - FR - TRAY - 2}" height="${BOT - H / 2 - 1}" rx="5" fill="${T.gold}" fill-opacity=".3" stroke="${T.gold}" stroke-width="2"/>
            <text x="${TRAY + (W - FR - TRAY) / 2}" y="${H / 2 + 22}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="Jost,sans-serif">${label}</text>`;
      continue;
    }
    const p = posOf(true, to, Math.min(Math.max(0, v.p[to]), 4));
    s += `<g class="tv-tgt" transform="translate(${p.x} ${p.y})"><circle r="${CR - 1}" fill="${T.gold}" fill-opacity=".5" stroke="${T.gold}" stroke-width="2"/>
          <text y="4" text-anchor="middle" font-size="${label.length > 1 ? 8.5 : 11}" font-weight="700" fill="#3a2a10" font-family="Jost,sans-serif">${label}</text></g>`;
  }
  return s;
}

// ---------- 3B zar ----------
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const FACE_ROT = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };
const faceHtml = (n, cls) => `<div class="f ${cls}">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<i class="${PIPS[n].includes(i) ? "on" : ""}"></i>`).join("")}</div>`;
const dieHtml = (id) => `<div class="die-pos" id="${id}"><span class="die-shadow"></span><div class="die3d">${faceHtml(1, "fr")}${faceHtml(6, "bk")}${faceHtml(3, "rt")}${faceHtml(4, "lf")}${faceHtml(2, "tp")}${faceHtml(5, "bt")}</div></div>`;
const rotFor = (f, sx = 0, sy = 0) => `rotateX(${FACE_ROT[f][0] + 360 * sx}deg) rotateY(${FACE_ROT[f][1] + 360 * sy}deg)`;
const LAND = { me: [[62, 44], [76, 57]], opp: [[22, 44], [36, 57]], open: [[30, 50], [70, 50]] };

function diceTumble(local, mode) {
  const layer = document.getElementById("tvDice");
  if (!layer) return;
  layer.classList.add("show");
  const land = LAND[mode];
  local.diceLand = land;
  [0, 1].forEach((i) => {
    const d = document.getElementById("tvD" + i);
    if (!d) return;
    d.classList.remove("dim");
    d.getAnimations?.().forEach((a) => a.cancel());
    const cube = d.querySelector(".die3d");
    cube.getAnimations?.().forEach((a) => a.cancel());
    const fromX = mode === "me" ? 106 : mode === "opp" ? -6 : (i ? 106 : -6);
    const [lx, ly] = land[i];
    // fırlatma → yükselip inme → küçük bir sekme → durma
    d.animate([
      { left: fromX + "%", top: 38 + i * 20 + "%", transform: "translate(-50%,-50%) scale(1.3)" },
      { left: (fromX + lx) / 2 + "%", top: ly - 16 + "%", transform: "translate(-50%,-50%) scale(1.18)", offset: 0.42 },
      { left: lx + (i ? 2 : -2) + "%", top: ly + "%", transform: "translate(-50%,-50%) scale(1)", offset: 0.72 },
      { left: lx + (i ? 1 : -1) + "%", top: ly - 3 + "%", transform: "translate(-50%,-50%) scale(1.05)", offset: 0.86 },
      { left: lx + "%", top: ly + "%", transform: "translate(-50%,-50%) scale(1)" }
    ], { duration: 720, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" });
    local["spin" + i] = cube.animate([
      { transform: "rotateX(0deg) rotateY(0deg) rotateZ(0deg)" },
      { transform: `rotateX(${i ? 360 : -360}deg) rotateY(${i ? -540 : 540}deg) rotateZ(180deg)` }
    ], { duration: 500, iterations: Infinity });
  });
  local.tumbleAt = performance.now();
  sfx.dice(950); buzz([18, 40, 14, 40, 10]);
}

function diceSettle(local, faces, instant) {
  const layer = document.getElementById("tvDice");
  if (!layer) return;
  layer.classList.add("show");
  const land = local.diceLand || LAND.me;
  [0, 1].forEach((i) => {
    const d = document.getElementById("tvD" + i);
    if (!d) return;
    const cube = d.querySelector(".die3d");
    local["spin" + i]?.cancel(); local["spin" + i] = null;
    if (instant) {
      d.getAnimations?.().forEach((a) => a.cancel());
      d.style.left = land[i][0] + "%"; d.style.top = land[i][1] + "%";
      cube.style.transform = rotFor(faces[i]);
      return;
    }
    cube.animate([
      { transform: `rotateX(${i ? 200 : -200}deg) rotateY(${i ? -300 : 300}deg)` },
      { transform: rotFor(faces[i], i ? 1 : -1, i ? -1 : 1) }
    ], { duration: 420, easing: "cubic-bezier(.15,.8,.3,1.15)", fill: "forwards" });
    cube.style.transform = rotFor(faces[i]);
  });
  // zarlar oturunca tahta hafifçe sarsılır
  document.querySelector(".tv-boardbox")?.animate([
    { transform: "translate(0,0)" }, { transform: "translate(1.5px,-1px)" }, { transform: "translate(-1.2px,1px)" }, { transform: "translate(0,0)" }
  ], { duration: 220 });
  buzz(14);
}

// ---------- anlık yorum / bant ----------
function callout(text, kind = "") {
  const el = document.getElementById("tvCallout");
  if (!el) return;
  el.textContent = text;
  el.className = "tv-callout show " + kind;
  clearTimeout(callout._t);
  callout._t = setTimeout(() => { el.className = "tv-callout " + kind; }, CALLOUT_MS);
}

// ---------- ana çizim ----------
export function renderTavla(c, M, H2) {
  const { g, local } = c;
  const me = g.p.indexOf(c.me), opp = 1 - me;
  const arena = c.arena("tv-arena");
  if (!arena.querySelector(".tv-root")) buildSkeleton(c, arena);
  const root = arena.querySelector(".tv-root");
  try { root.classList.toggle("portrait-ok", localStorage.getItem("tp_tv_portrait") === "1"); } catch { /* */ }

  const st = M.cur;
  const real = st.real || R.initialReal();
  const gameKey = `${c.room.runId || c.room.startedAt}:${st.gm}`;
  if (local.gameKey !== gameKey) { local.gameKey = gameKey; local.prevReal = null; local.animKey = null; local.flags = {}; }
  local.flags = local.flags || {};

  // rakibin son hamlesini canlı oynat
  const turnKey = st.lastTurn ? `${st.gm}:${st.lastTurn.n}` : null;
  if (local.animating) { local.dirty = true; return; }
  if (turnKey && turnKey !== local.animKey) {
    const prev = local.prevReal;
    local.animKey = turnKey;
    if (prev && st.lastTurn.mover === opp && st.lastTurn.moves.length) {
      local.prevReal = real;
      return playOppTurn(c, prev, st.lastTurn, me, () => renderTavla(c, H2.replay(), H2));
    }
  }
  local.prevReal = real;

  const myMove = st.phase === "move" && st.side === me && !M.over;
  if (local.pendKey !== st.pre) { local.pendKey = st.pre; local.pend = []; local.sel = null; local.preferDie = null; }
  let v = R.view(real, me), info = null, steps = [];
  if (myMove) {
    if (local.info?.key !== st.pre) local.info = { key: st.pre, val: R.turnInfo(st.v, st.dl) };
    info = local.info.val;
    for (const m of local.pend) v = R.applyMove(v, m);
    steps = R.nextSteps(st.v, st.dl, local.pend, info);
  }
  const done = myMove && local.pend.length === info.total;
  const sources = new Set(done ? [] : steps.map((s) => s.from));
  const targets = local.sel != null ? steps.filter((s) => s.from === local.sel) : [];

  // rakibin son hamlesinin yol okları (benim bakışımda)
  let oppPaths = [];
  if (st.lastTurn && st.lastTurn.mover === opp && !myMove) oppPaths = oppArrows(st.lastTurn.moves, v);

  // tahta
  const boardBox = arena.querySelector(".tv-boardbox");
  const turnSide = st.mover ?? st.side; // zar hazırlanırken de sıra, oynayacak olanındır
  boardBox.classList.toggle("opp-turn", !M.over && turnSide === opp && !!st.phase && !st.phase.startsWith("o-"));
  const boardEl = arena.querySelector("#tvBoard");
  boardEl.innerHTML = boardSvg(v, me, { sources, targets, oppPaths });
  wireBoard(c, boardEl, { myMove, done, steps, sources, v, me, st, rerender: () => renderTavla(c, H2.replay(), H2) });

  updateDice(c, st, M, me);
  events(c, st, M, me, opp, real);
  renderPanel(c, arena.querySelector("#tvPanel"), { M, st, me, opp, real, info, done, myMove, steps, H2 });
  autoSend(c, st, info, done, H2);
}

function buildSkeleton(c, arena) {
  arena.innerHTML = `
    <div class="tv-root">
      <div class="tv-stage"><div class="tv-boardbox"><div id="tvBoard"></div><div class="tv-dice" id="tvDice">${dieHtml("tvD0")}${dieHtml("tvD1")}</div><div class="tv-callout" id="tvCallout"></div></div></div>
      <aside class="tv-panel" id="tvPanel"></aside>
      <div class="tv-rotate">
        <div class="tv-phone">📱</div>
        <p><b>Telefonu yan çevir</b><br>Tahta tam ekran olsun</p>
        <button class="btn" id="tvPortrait">Dik devam et</button>
      </div>
    </div>`;
  arena.querySelector("#tvPortrait").onclick = () => {
    try { localStorage.setItem("tp_tv_portrait", "1"); } catch { /* */ }
    arena.querySelector(".tv-root").classList.add("portrait-ok");
  };
  arena.addEventListener("pointerdown", unlock, { once: true });
}

function oppArrows(moves, vMine) {
  // vMine = son durum. Rakip pulları hamle sırasına göre: varış = yığının üstü, çıkış = (kalkınca boşalan) üst nokta
  return moves.map((m) => {
    const from = m.from === R.BAR ? posOf(false, "bar", 0) : posOf(false, 25 - m.from, Math.min(Math.max(0, -vMine.p[25 - m.from]), 4));
    const to = m.to === R.OFF ? posOf(false, "off", Math.max(0, vMine.off[1] - 1)) : posOf(false, 25 - m.to, Math.max(0, Math.min(-vMine.p[25 - m.to] - 1, 4)));
    return { from, to };
  });
}

// ---------- olaylar: açılış, sıra bandı, mars uyarısı ----------
function events(c, st, M, me, opp, real) {
  const { local } = c;
  const F = local.flags;
  const name = (side) => (c.g.p[side] === "__bot" ? "Bilgisayar" : c.room.players?.[c.g.p[side]]?.name || "Rakip");
  if (M.over) return;
  // açılış zarı sonucu
  if (st.n === 0 && st.phase === "move" && st.open && !F.open) {
    F.open = true;
    const mine = st.open[me], theirs = st.open[opp];
    c.timer(() => callout(`Sen ${mine} · ${name(opp)} ${theirs} → ${st.side === me ? "Sen başlıyorsun" : "Rakip başlıyor"}`, "big"), 900);
    return;
  }
  // senin sıran
  if (st.phase === "roll" && st.side === me && F.turnBanner !== st.pre) {
    F.turnBanner = st.pre;
    callout("Senin sıran", "turn");
  }
  // mars uyarıları (oyun başına bir kez)
  const vMe = R.view(real, me);
  const outsideMe = vMe.bar[0] > 0 || vMe.p.slice(7, 25).some((x) => x > 0);
  if (!F.marsMe && vMe.off[0] === 0 && vMe.off[1] >= 9 && outsideMe) { F.marsMe = true; c.timer(() => callout("⚠️ Mars tehlikesi!", "warn"), 400); }
  if (!F.marsOpp && vMe.off[1] === 0 && vMe.off[0] >= 9) { F.marsOpp = true; c.timer(() => callout("🔥 Rakibi mars edebilirsin!", "good"), 400); }
}

function updateDice(c, st, M, me) {
  const { local } = c;
  if (M.over || !st.phase) return;
  const pre = st.pre;
  const opp = 1 - me;
  const mode = st.n === 0 ? "open" : st.mover === me ? "me" : "opp";
  // açılışta zarlar: soldaki rakibin, sağdaki benim
  const faces = st.dice ? (st.n === 0 ? [st.open[opp], st.open[me]] : st.dice) : null;
  if ((st.phase === "reveal" || (st.phase === "roll" && local.thrown === pre)) && local.tumbleKey !== pre) {
    local.tumbleKey = pre;
    diceTumble(local, mode);
  }
  if (st.phase === "move" && faces && local.settledKey !== pre) {
    const fresh = local.tumbleKey === pre;
    if (!fresh && st.n !== 0 && local.settledKey === undefined) {
      local.diceLand = LAND[mode];
      local.settledKey = pre; diceSettle(local, faces, true); // sayfa yeni açıldı
    } else if (!fresh) {
      local.tumbleKey = pre;
      diceTumble(local, mode);
      local.settledKey = pre;
      c.timer(() => diceSettle(local, faces, false), 650);
    } else {
      local.settledKey = pre;
      c.timer(() => diceSettle(local, faces, false), Math.max(0, 650 - (performance.now() - (local.tumbleAt || 0))));
    }
  }
  const used = st.phase === "move" && st.side === me ? (local.pend || []).map((m) => m.d) : [];
  const isDouble = (st.dl || []).length === 4;
  [0, 1].forEach((i) => {
    const d = document.getElementById("tvD" + i);
    if (!d) return;
    let dim;
    if (st.phase === "move") dim = local.settledKey === pre && (isDouble ? used.length >= (i === 0 ? 2 : 4) : !!faces && used.includes(faces[i]));
    else dim = local.tumbleKey !== pre;
    d.classList.toggle("dim", dim);
  });
}

// ---------- otomatik onay ----------
function autoSend(c, st, info, done, H2) {
  const { local } = c;
  if (!done || local.sent === st.pre || info.total === 0) { local.autoKey = null; return; }
  const key = st.pre + "|" + JSON.stringify(local.pend);
  if (local.autoKey === key) return;
  local.autoKey = key;
  c.timer(() => {
    if (local.autoKey === key && local.sent !== st.pre && local.pendKey === st.pre) sendMoves(c, st, H2);
  }, AUTO_SEND_MS);
}
function sendMoves(c, st, H2) {
  const { local } = c;
  if (local.sent === st.pre) return;
  local.sent = st.pre;
  local.autoKey = null;
  c.input(st.pre + "m", { mv: H2.enc(local.pend), at: Math.round(c.now()) });
  const b = document.getElementById("tvSend"); if (b) { b.disabled = true; b.classList.remove("auto"); }
}

// ---------- tahta etkileşimi: akıllı dokunuş + sürükle-bırak ----------
function pickStep(local, opts) {
  // tercih edilen zar varsa onu, yoksa en büyük zarı kullan
  const pref = local.preferDie != null ? opts.find((s) => s.d === local.preferDie) : null;
  return pref || opts.slice().sort((a, b) => b.d - a.d)[0];
}

function wireBoard(c, boardEl, o) {
  const { local } = c;
  const svg = boardEl.querySelector("svg");
  if (!svg) return;
  const toSvg = (ev) => { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  const apply = (step, animate) => {
    reactToStep(o.v, step);
    if (animate) { local.rerenderAfterAnim = o.rerender; animateLocal(c, o.v, step, o.me); }
    else sfx.checker();
    local.pend.push(step); local.sel = null;
    o.rerender();
  };
  let drag = null;

  svg.addEventListener("pointerdown", (ev) => {
    unlock();
    if (!o.myMove || o.done) { document.getElementById("tvThrow")?.click(); return; }
    const p = toSvg(ev);
    const pt = hitTest(p.x, p.y);
    if (pt == null) return;
    if (local.sel != null) {
      const tgt = o.steps.filter((s) => s.from === local.sel && s.to === pt);
      if (tgt.length) { apply(pickStep(local, tgt), true); return; }
    }
    if (!o.sources.has(pt)) { if (local.sel != null) { local.sel = null; o.rerender(); } return; }
    drag = { from: pt, x0: ev.clientX, y0: ev.clientY, moved: false, ghost: null };
    svg.setPointerCapture?.(ev.pointerId);
  });
  svg.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 8) return;
    const p = toSvg(ev);
    if (!drag.moved) {
      drag.moved = true;
      const fromPos = drag.from === R.BAR ? posOf(true, "bar", 0) : posOf(true, drag.from, Math.max(0, Math.min(o.v.p[drag.from] - 1, 4)));
      const held = findDisc(svg, fromPos);
      if (held) held.style.opacity = "0.3";
      drag.ghost = document.createElementNS("http://www.w3.org/2000/svg", "g");
      drag.ghost.innerHTML = discInner(o.me);
      drag.ghost.setAttribute("class", "tv-ghost");
      const fx = svg.querySelector("#tvFx");
      fx.insertAdjacentHTML("beforeend", targetsSvg(o.steps.filter((s) => s.from === drag.from), o.v));
      fx.appendChild(drag.ghost);
    }
    drag.ghost.setAttribute("transform", `translate(${p.x} ${p.y - 8}) scale(1.18)`);
  });
  const end = (ev) => {
    if (!drag) return;
    const d = drag; drag = null;
    const opts = o.steps.filter((s) => s.from === d.from);
    if (!d.moved) { apply(pickStep(local, opts), true); return; } // akıllı tek dokunuş
    const p = toSvg(ev);
    const pt = hitTest(p.x, p.y);
    const tgt = opts.filter((s) => s.to === pt);
    if (tgt.length) apply(pickStep(local, tgt), false);
    else o.rerender();
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", () => { drag = null; o.rerender(); });
}

// Kendi hamlemde anlık yorum
function reactToStep(v, step) {
  if (step.to !== R.OFF && v.p[step.to] === -1) callout("💥 Kırdın!", "good");
  else if (step.to !== R.OFF && step.to <= 6 && v.p[step.to] === 1) callout("🧱 Kapı!", "good");
  else if (step.to === R.OFF && v.off[0] === 0) callout("Toplamaya başladın");
}

function findDisc(svg, at) {
  return [...(svg?.querySelectorAll(".tv-ck") || [])].find((el) => {
    const t = el.getAttribute("transform").match(/translate\(([\d.]+) ([\d.]+)\)/);
    return t && Math.abs(+t[1] - at.x) < 0.6 && Math.abs(+t[2] - at.y) < 0.6;
  });
}

function moveCoords(v, m) {
  const from = m.from === R.BAR ? posOf(true, "bar", 0) : posOf(true, m.from, Math.max(0, Math.min(v.p[m.from] - 1, 4)));
  const to = m.to === R.OFF ? posOf(true, "off", v.off[0]) : posOf(true, m.to, Math.min(Math.max(0, v.p[m.to]), 4));
  return { from, to };
}

function flyGhost(svg, clr, from, to, ms) {
  const fx = svg?.querySelector("#tvFx");
  if (!fx) return Promise.resolve();
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.innerHTML = discInner(clr);
  g.setAttribute("class", "tv-ghost");
  fx.appendChild(g);
  const lift = Math.min(40, Math.hypot(to.x - from.x, to.y - from.y) * 0.25);
  return new Promise((res) => {
    const t0 = performance.now();
    let finished = false;
    const finish = () => { if (finished) return; finished = true; g.remove(); res(); };
    const step = (t) => {
      if (finished) return;
      const k = Math.min(1, (t - t0) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e - Math.sin(Math.PI * e) * lift;
      g.setAttribute("transform", `translate(${x} ${y}) scale(${1 + Math.sin(Math.PI * e) * 0.18})`);
      if (k < 1) requestAnimationFrame(step); else finish();
    };
    g.setAttribute("transform", `translate(${from.x} ${from.y})`);
    requestAnimationFrame(step);
    setTimeout(finish, ms + 120); // sekme arka plana alınsa da animasyon biter, tahta kilitlenmez
  });
}

function animateLocal(c, vBefore, m, me) {
  const svg = document.querySelector("#tvBoard svg");
  const { from, to } = moveCoords(vBefore, m);
  const hit = m.to !== R.OFF && vBefore.p[m.to] === -1;
  const src = findDisc(svg, from);
  if (src) src.style.opacity = "0";
  c.local.animating = true;
  flyGhost(svg, me, from, to, 220).then(() => {
    c.local.animating = false;
    c.local.dirty = false;
    (hit ? sfx.hit : sfx.checker)();
    buzz(hit ? [20, 30, 20] : 8);
    c.local.rerenderAfterAnim?.();
  });
}

function playOppTurn(c, prevReal, turn, me, done) {
  const { local } = c;
  local.animating = true;
  const opp = 1 - me;
  let vOpp = R.view(prevReal, opp);
  const board = document.getElementById("tvBoard");
  const draw = (vo) => { board.innerHTML = boardSvg(R.view(R.unview(vo, opp), me), me, {}); return board.querySelector("svg"); };
  let i = 0, gotHit = false;
  const next = () => {
    if (i >= turn.moves.length) {
      local.animating = false; local.dirty = false;
      if (gotHit) callout("😬 Kırıldın", "warn");
      return done();
    }
    const m = turn.moves[i++];
    const svg = draw(vOpp);
    const vMe = R.view(R.unview(vOpp, opp), me);
    const mm = { from: m.from === R.BAR ? R.BAR : 25 - m.from, to: m.to === R.OFF ? R.OFF : 25 - m.to };
    const from = mm.from === R.BAR ? posOf(false, "bar", 0) : posOf(false, mm.from, Math.max(0, Math.min(-vMe.p[mm.from] - 1, 4)));
    const to = mm.to === R.OFF ? posOf(false, "off", vMe.off[1]) : posOf(false, mm.to, Math.min(Math.max(0, -vMe.p[mm.to]), 4));
    const hit = mm.to !== R.OFF && vMe.p[mm.to] === 1;
    if (hit) gotHit = true;
    const srcEl = findDisc(svg, from);
    if (srcEl) srcEl.style.opacity = "0";
    flyGhost(svg, opp, from, to, 300).then(() => {
      (hit ? sfx.hit : sfx.checker)();
      if (hit) buzz([30, 40, 30]);
      vOpp = R.applyMove(vOpp, m);
      c.timer(next, 90);
    });
  };
  c.timer(next, 250);
}

// ---------- yan panel ----------
const RING_R = 13, RING_C = 2 * Math.PI * RING_R;

function renderPanel(c, el, o) {
  const { g, local } = c;
  const { M, st, me, opp, real, info, done, myMove, steps, H2 } = o;
  const name = (side) => (g.p[side] === "__bot" ? "🤖 Bilgisayar" : c.esc(c.room.players?.[g.p[side]]?.name || "?"));
  const vMe = R.view(real, me), vOp = R.view(real, opp);
  let status = "";
  if (M.over) status = M.winner === me ? "Maçı kazandın! 🏆" : `${name(M.winner)} kazandı`;
  else if (st.phase?.startsWith("o-")) status = "Açılış zarları…";
  else if (st.phase === "roll") status = st.side === me ? "Zar at" : `${name(st.side)} zar atıyor`;
  else if (st.phase === "commit") status = st.mover === me ? "Zar hazırlanıyor…" : `${name(opp)} zar atacak`;
  else if (st.phase === "reveal") status = st.mover === me ? "Zarlar yuvarlanıyor…" : `${name(opp)} attı…`;
  else if (st.phase === "move") status = st.side === me ? (info.total === 0 ? "Oynanacak hamle yok" : done ? "Gönderiliyor…" : `${info.total - local.pend.length} hamle kaldı`) : `${name(st.side)} oynuyor`;
  const prevGame = M.games.length > 1 ? M.games[M.games.length - 2] : null;
  const banner = prevGame && c.now() - prevGame.lastAt < H2.BETWEEN_GAMES_MS + 1500
    ? `<div class="tvp-banner">${prevGame.winner === me ? "Oyunu kazandın" : `${name(prevGame.winner)} kazandı`}${prevGame.pts === 2 ? " · MARS!" : ""}</div>` : "";
  const myRoll = st.phase === "roll" && st.side === me && !M.over && local.thrown !== st.pre;
  const canFs = !!document.documentElement.requestFullscreen && !document.fullscreenElement;

  // kalan zarlar (çip): birden fazla farklı zar oynanabiliyorsa dokunuşta hangisinin kullanılacağını seç
  let chips = "";
  if (myMove && !done && info.total > 0) {
    const usable = [...new Set(steps.map((s) => s.d))].sort((a, b) => b - a);
    if (usable.length > 1) {
      const cur = local.preferDie != null && usable.includes(local.preferDie) ? local.preferDie : usable[0];
      chips = `<div class="tvp-chips"><small>Dokununca:</small>${usable.map((d) => `<button class="chip-die ${d === cur ? "on" : ""}" data-die="${d}">${d}</button>`).join("")}</div>`;
    }
  }
  const ring = (on) => `<svg class="ring" viewBox="0 0 32 32"><circle cx="16" cy="16" r="${RING_R}" class="rbg"/>${on ? `<circle cx="16" cy="16" r="${RING_R}" class="rfg" stroke-dasharray="${RING_C}" stroke-dashoffset="0"/>` : ""}</svg>`;
  const turnSide = st.phase?.startsWith("o-") ? null : (st.mover ?? st.side);
  const activeOpp = turnSide === opp && !M.over, activeMe = turnSide === me && !M.over;

  el.innerHTML = `
    <div class="tvp-pl ${activeOpp ? "on" : ""}">
      <span class="av">${ring(activeOpp)}<i class="dot" style="background:${T.ck[opp].b}"></i></span><span class="nm">${name(opp)}</span>
      <small>${R.pips(vOp)} pip · ${vOp.off[0]}/15</small>
    </div>
    <div class="tvp-score"><b>${M.score[opp]}</b><span>–</span><b>${M.score[me]}</b><small>${g.target > 1 ? `${g.target} sayılık maç` : "tek oyun"}</small></div>
    ${banner}
    <div class="tvp-mid">
      <p class="tvp-status">${status}</p>
      ${myRoll ? `<button class="tvp-throw" id="tvThrow"><span class="mini-dice">⚄⚂</span><b>Zarı at</b><small>dokun ya da tahtaya dokun</small></button>` : ""}
      ${chips}
      ${myMove && info.total > 0 ? `
        <div class="tvp-btns">
          <button class="btn" id="tvUndo" ${local.pend.length && local.sent !== st.pre ? "" : "disabled"}>↶ Geri al</button>
          <button class="btn primary ${done && local.sent !== st.pre ? "auto" : ""}" id="tvSend" ${done && local.sent !== st.pre ? "" : "disabled"} style="--auto:${AUTO_SEND_MS}ms">Bitir ✓</button>
        </div>` : ""}
    </div>
    <div class="tvp-pl ${activeMe ? "on" : ""}">
      <span class="av">${ring(activeMe)}<i class="dot" style="background:${T.ck[me].a};border-color:${T.ck[me].ring}"></i></span><span class="nm">Sen</span>
      <small>${R.pips(vMe)} pip · ${vMe.off[0]}/15</small>
    </div>
    <div class="tvp-tools">
      <button id="tvMute" title="Ses">${isMuted() ? "🔇" : "🔊"}</button>
      ${canFs ? `<button id="tvFs" title="Tam ekran">⛶</button>` : ""}
      <button id="tvExit" title="Çık">✕</button>
    </div>`;

  const throwBtn = el.querySelector("#tvThrow");
  if (throwBtn) {
    const fire = () => {
      if (local.thrown === st.pre) return;
      unlock();
      local.thrown = st.pre;
      c.input(st.pre + "r", { v: R.randomHex(8), at: Math.round(c.now()) });
      local.tumbleKey = st.pre;
      diceTumble(local, "me");
      throwBtn.disabled = true;
    };
    throwBtn.addEventListener("pointerdown", () => throwBtn.classList.add("grab"));
    throwBtn.addEventListener("pointerup", () => { throwBtn.classList.remove("grab"); fire(); });
    throwBtn.addEventListener("click", fire);
  }
  el.querySelectorAll("[data-die]").forEach((b) => b.onclick = () => { local.preferDie = Number(b.dataset.die); sfx.tick(); renderTavla(c, H2.replay(), H2); });
  const undo = el.querySelector("#tvUndo");
  if (undo) undo.onclick = () => { if (local.sent === st.pre) return; local.pend.pop(); local.sel = null; local.autoKey = null; sfx.tick(); renderTavla(c, H2.replay(), H2); };
  const send = el.querySelector("#tvSend");
  if (send) send.onclick = () => sendMoves(c, st, H2);
  el.querySelector("#tvMute").onclick = (e) => { setMuted(!isMuted()); unlock(); e.target.textContent = isMuted() ? "🔇" : "🔊"; };
  const fs = el.querySelector("#tvFs");
  if (fs) fs.onclick = async () => {
    try { await document.documentElement.requestFullscreen({ navigationUI: "hide" }); await screen.orientation?.lock?.("landscape"); } catch { /* desteklenmiyor */ }
    renderTavla(c, H2.replay(), H2);
  };
  el.querySelector("#tvExit").onclick = () => {
    if (confirm("Maçtan çıkmak istiyor musun? Çıkarsan hükmen kaybedebilirsin.")) {
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* */ }
      c.leave();
    }
  };

  // süre halkası (sırası gelen oyuncunun etrafında)
  const total = st.phase === "move" ? H2.MOVE_MS : st.phase === "roll" ? H2.ROLL_MS : H2.AUTO_WAIT_MS;
  const endAt = (st.lastAt || 0) + total;
  const setRing = () => {
    const f = Math.max(0, Math.min(1, (endAt - c.now()) / total));
    const r = document.querySelector(".tvp-pl.on .rfg");
    if (r) { r.style.strokeDashoffset = String(RING_C * (1 - f)); r.classList.toggle("low", f < 0.25); }
  };
  setRing();
  const id = st.pre + st.phase;
  if (local.barId !== id) {
    local.barId = id;
    const tick = () => { if (local.barId !== id || c.room.state !== "play") return; setRing(); c.timer(tick, 250); };
    c.timer(tick, 250);
  }
}

export { boardSvg };
