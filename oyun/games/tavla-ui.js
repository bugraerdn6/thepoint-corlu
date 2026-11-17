// Tavla ekranı — tam ekran yan tahta, 3B zarlar, sürükle-bırak, canlı pul animasyonları, ses.
// Kural ve maç mantığı tavla.js / tavla-rules.js'te; burası sadece gösterim ve etkileşim.
import * as R from "./tavla-rules.js";
import { sfx, buzz, unlock, isMuted, setMuted } from "../sound.js";

// ---------- tema (The Point) ----------
const T = {
  frame1: "#333c22", frame2: "#22281a", field: "#efe5c8", ptA: "#5c6a3f", ptB: "#c1622f",
  bar: "#2a3019", tray: "#2a3019", gold: "#e8b04a",
  ck: [{ a: "#fffdf6", b: "#e7dcc0", ring: "#c9b98f", txt: "#3a3424" }, { a: "#4a4234", b: "#1f1b14", ring: "#6b6250", txt: "#f2ead4" }]
};

// ---------- tahta geometrisi (SVG birimleri) ----------
const W = 380, H = 300, FR = 10, PW = 25, BW = 26, TRW = 34;
const X0 = FR, BX = X0 + 6 * PW, RX = BX + BW, TRAY = RX + 6 * PW + 4;
const TOP = FR, BOT = H - FR, PH = 118, CR = 11.2, STEP = 22;

const colX = (pt) => (pt <= 6 ? RX + (6 - pt) * PW : pt <= 12 ? X0 + (12 - pt) * PW : pt <= 18 ? X0 + (pt - 13) * PW : RX + (pt - 19) * PW);
const isTop = (pt) => pt >= 13;

// Bir pulun (sahibi, yer, yığındaki sırası) ekrandaki merkezi
function posOf(mine, loc, i) {
  if (loc === "bar") return { x: BX + BW / 2, y: mine ? H / 2 + 20 + i * 21 : H / 2 - 20 - i * 21 };
  if (loc === "off") return { x: TRAY + (W - FR - TRAY) / 2, y: mine ? BOT - 6 - i * 7 : TOP + 6 + i * 7 };
  const top = isTop(loc), k = Math.min(i, 4);
  return { x: colX(loc) + PW / 2, y: top ? TOP + CR + 1 + k * STEP : BOT - CR - 1 - k * STEP };
}

// Ekrandaki noktaya karşılık gelen hane (sürükle-bırak için)
function hitTest(x, y) {
  if (x >= TRAY - 2) return R.OFF;
  if (x >= BX && x < RX) return R.BAR;
  const top = y < H / 2;
  if (x >= X0 && x < BX) { const col = Math.floor((x - X0) / PW); return top ? 13 + col : 12 - col; }
  if (x >= RX && x < RX + 6 * PW) { const col = Math.floor((x - RX) / PW); return top ? 19 + col : 6 - col; }
  return null;
}

// ---------- SVG tahta ----------
function disc(x, y, clr, label, cls = "") {
  const c = T.ck[clr];
  return `<g class="tv-ck ${cls}" transform="translate(${x} ${y})">
    <circle r="${CR}" fill="url(#ckg${clr})" stroke="${c.ring}" stroke-width="1"/>
    <circle r="${CR * 0.62}" fill="none" stroke="${c.ring}" stroke-width="1" opacity=".8"/>
    ${label ? `<text y="4" text-anchor="middle" font-size="11" font-weight="700" fill="${c.txt}" font-family="Jost,sans-serif">${label}</text>` : ""}
  </g>`;
}

function boardSvg(v, me, o = {}) {
  const myC = me, opC = 1 - me;
  const tset = new Set((o.targets || []).map((t) => t.to));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" class="tv-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="fr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.frame1}"/><stop offset="1" stop-color="${T.frame2}"/></linearGradient>
    <linearGradient id="fld" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4ecd4"/><stop offset=".5" stop-color="${T.field}"/><stop offset="1" stop-color="#f4ecd4"/></linearGradient>
    <radialGradient id="ckg0" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="${T.ck[0].a}"/><stop offset="1" stop-color="${T.ck[0].b}"/></radialGradient>
    <radialGradient id="ckg1" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="${T.ck[1].a}"/><stop offset="1" stop-color="${T.ck[1].b}"/></radialGradient>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.2" flood-opacity=".35"/></filter>
    <clipPath id="logoClip"><circle cx="${BX + BW / 2}" cy="${H / 2}" r="${BW / 2 - 2}"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" rx="12" fill="url(#fr)"/>
  ${[0.18, 0.37, 0.61, 0.83].map((f) => `<line x1="0" y1="${H * f}" x2="${W}" y2="${H * f + 6}" stroke="#ffffff" stroke-opacity=".035" stroke-width="3"/>`).join("")}
  <rect x="${X0}" y="${TOP}" width="${6 * PW}" height="${BOT - TOP}" fill="url(#fld)"/>
  <rect x="${RX}" y="${TOP}" width="${6 * PW}" height="${BOT - TOP}" fill="url(#fld)"/>
  <rect x="${BX}" y="${TOP}" width="${BW}" height="${BOT - TOP}" fill="${T.bar}"/>
  <rect x="${TRAY}" y="${TOP}" width="${W - FR - TRAY}" height="${BOT - TOP}" rx="5" fill="${T.tray}" stroke="#000" stroke-opacity=".25"/>
  <image href="../images/favicon-180.jpg" x="${BX + 2}" y="${H / 2 - BW / 2 + 2}" width="${BW - 4}" height="${BW - 4}" clip-path="url(#logoClip)" opacity=".9"/>
  <circle cx="${BX + BW / 2}" cy="${H / 2}" r="${BW / 2 - 2}" fill="none" stroke="${T.gold}" stroke-opacity=".6"/>`;

  for (let pt = 1; pt <= 24; pt++) {
    const x = colX(pt), top = isTop(pt);
    const y0 = top ? TOP : BOT, y1 = top ? TOP + PH : BOT - PH;
    const clr = pt % 2 === 0 ? T.ptA : T.ptB;
    const hl = (o.oppTo || new Set()).has(pt);
    s += `<polygon points="${x + 1},${y0} ${x + PW - 1},${y0} ${x + PW / 2},${y1}" fill="${clr}" opacity=".92" ${hl ? `stroke="${T.gold}" stroke-width="2"` : ""}/>`;
  }
  // yer işaretleri: hedef haneler, seçili hane
  if (o.sel != null && o.sel >= 1 && o.sel <= 24) {
    const top = isTop(o.sel);
    s += `<rect x="${colX(o.sel) + 1}" y="${top ? TOP : BOT - PH}" width="${PW - 2}" height="${PH}" rx="4" fill="${T.gold}" opacity=".18"/>`;
  }

  // pullar
  const hide = o.hide || new Set();
  for (let pt = 1; pt <= 24; pt++) {
    const n = Math.abs(v.p[pt]); if (!n) continue;
    const mine = v.p[pt] > 0, show = Math.min(n, 5);
    for (let i = 0; i < show; i++) {
      if (hide.has(`${pt}:${i}`)) continue;
      const p = posOf(mine, pt, i);
      const last = i === show - 1;
      const src = mine && last && o.sources?.has(pt);
      s += disc(p.x, p.y, mine ? myC : opC, last && n > 5 ? n : "", (src ? "src " : "") + (o.drag === pt && last ? "dragging" : ""));
    }
  }
  for (let i = 0; i < Math.min(v.bar[0], 4); i++) { if (hide.has(`bar:${i}`)) continue; const p = posOf(true, "bar", i); s += disc(p.x, p.y, myC, i === Math.min(v.bar[0], 4) - 1 && v.bar[0] > 4 ? v.bar[0] : "", i === 0 && o.sources?.has(R.BAR) ? "src" : ""); }
  for (let i = 0; i < Math.min(v.bar[1], 4); i++) { const p = posOf(false, "bar", i); s += disc(p.x, p.y, opC, i === Math.min(v.bar[1], 4) - 1 && v.bar[1] > 4 ? v.bar[1] : ""); }
  const tw = W - FR - TRAY - 6;
  for (let i = 0; i < v.off[0]; i++) { const p = posOf(true, "off", i); s += `<rect x="${p.x - tw / 2}" y="${p.y - 2.5}" width="${tw}" height="5" rx="2" fill="url(#ckg${myC})" stroke="${T.ck[myC].ring}" stroke-width=".6"/>`; }
  for (let i = 0; i < v.off[1]; i++) { const p = posOf(false, "off", i); s += `<rect x="${p.x - tw / 2}" y="${p.y - 2.5}" width="${tw}" height="5" rx="2" fill="url(#ckg${opC})" stroke="${T.ck[opC].ring}" stroke-width=".6"/>`; }

  // hedefler
  for (const t of tset) {
    if (t === R.OFF) { s += `<rect class="tv-tgt" x="${TRAY + 1}" y="${H / 2}" width="${W - FR - TRAY - 2}" height="${BOT - H / 2 - 1}" rx="5" fill="${T.gold}" fill-opacity=".3" stroke="${T.gold}" stroke-width="2"/>`; continue; }
    const n = Math.max(0, v.p[t]); // rakip tek pulsa (kırılacak) onun üstüne işaret
    const p = posOf(true, t, Math.min(n, 4));
    s += `<circle class="tv-tgt" cx="${p.x}" cy="${p.y}" r="${CR - 1.5}" fill="${T.gold}" fill-opacity=".45" stroke="${T.gold}" stroke-width="2"/>`;
  }
  s += `<g id="tvFx"></g></svg>`;
  return s;
}

// ---------- 3B zar ----------
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const FACE_ROT = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 2: [-90, 0], 5: [90, 0] };
const faceHtml = (n, cls) => `<div class="f ${cls}">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<i class="${PIPS[n].includes(i) ? "on" : ""}"></i>`).join("")}</div>`;
const dieHtml = (id) => `<div class="die-pos" id="${id}"><div class="die3d">${faceHtml(1, "fr")}${faceHtml(6, "bk")}${faceHtml(3, "rt")}${faceHtml(4, "lf")}${faceHtml(2, "tp")}${faceHtml(5, "bt")}</div></div>`;
const rotFor = (f, spinsX = 0, spinsY = 0) => `rotateX(${FACE_ROT[f][0] + 360 * spinsX}deg) rotateY(${FACE_ROT[f][1] + 360 * spinsY}deg)`;

function diceTumble(local, mineThrow) {
  const layer = document.getElementById("tvDice");
  if (!layer) return;
  layer.classList.add("show");
  const dies = [document.getElementById("tvD0"), document.getElementById("tvD1")];
  const fromX = mineThrow ? 105 : -5;
  const land = mineThrow ? [[62, 44], [76, 56]] : [[22, 44], [36, 56]];
  local.diceLand = land;
  dies.forEach((d, i) => {
    if (!d) return;
    d.classList.remove("dim");
    d.getAnimations?.().forEach((a) => a.cancel());
    const cube = d.firstElementChild;
    cube.getAnimations?.().forEach((a) => a.cancel());
    d.animate([
      { left: fromX + "%", top: 40 + i * 18 + "%", transform: "translate(-50%,-50%) scale(1.25)" },
      { left: (fromX + land[i][0]) / 2 + "%", top: land[i][1] - 14 + "%", transform: "translate(-50%,-50%) scale(1.1)", offset: 0.45 },
      { left: land[i][0] + "%", top: land[i][1] + "%", transform: "translate(-50%,-50%) scale(1)" }
    ], { duration: 650, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" });
    local["spin" + i] = cube.animate([
      { transform: "rotateX(0deg) rotateY(0deg) rotateZ(0deg)" },
      { transform: `rotateX(${i ? 360 : -360}deg) rotateY(${i ? -540 : 540}deg) rotateZ(180deg)` }
    ], { duration: 520, iterations: Infinity });
  });
  local.tumbleAt = performance.now();
  sfx.dice(900); buzz([18, 40, 14, 40, 10]);
}

function diceSettle(local, faces, instant) {
  const layer = document.getElementById("tvDice");
  if (!layer) return;
  layer.classList.add("show");
  const land = local.diceLand || [[62, 44], [76, 56]];
  [0, 1].forEach((i) => {
    const d = document.getElementById("tvD" + i);
    if (!d) return;
    const cube = d.firstElementChild;
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
  buzz(12);
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
  const gameKey = `${c.room.startedAt}:${st.gm}`;
  if (local.gameKey !== gameKey) { local.gameKey = gameKey; local.prevReal = null; local.animKey = null; }

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
  if (local.pendKey !== st.pre) { local.pendKey = st.pre; local.pend = []; local.sel = null; }
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
  const oppTo = new Set(st.lastTurn && st.lastTurn.mover === opp ? st.lastTurn.moves.map((m) => m.to).filter((x) => x >= 1 && x <= 24).map((x) => 25 - x) : []);

  // tahta
  const boardEl = arena.querySelector("#tvBoard");
  boardEl.innerHTML = boardSvg(v, me, { sources, targets, sel: local.sel, oppTo });
  wireBoard(c, boardEl, { myMove, done, steps, sources, v, me, st, rerender: () => renderTavla(c, H2.replay(), H2) });

  // zar durumu
  updateDice(c, st, M, me);

  // panel
  renderPanel(c, arena.querySelector("#tvPanel"), { M, st, me, opp, real, info, done, myMove, H2 });
}

function buildSkeleton(c, arena) {
  arena.innerHTML = `
    <div class="tv-root">
      <div class="tv-stage"><div class="tv-boardbox"><div id="tvBoard"></div><div class="tv-dice" id="tvDice">${dieHtml("tvD0")}${dieHtml("tvD1")}</div></div></div>
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
  // ilk dokunuşta sesi aç
  arena.addEventListener("pointerdown", unlock, { once: true });
}

function updateDice(c, st, M, me) {
  const { local } = c;
  if (M.over || !st.phase) return;
  const pre = st.pre;
  // zar atıldı, sonuç bekleniyor → yuvarlanıyor
  if ((st.phase === "reveal" || (st.phase === "roll" && local.thrown === pre)) && local.tumbleKey !== pre) {
    local.tumbleKey = pre;
    diceTumble(local, st.mover === me);
  }
  if (st.phase === "move" && st.dice && local.settledKey !== pre) {
    const fresh = local.tumbleKey === pre;
    const isOpening = st.n === 0 && local.tumbleKey !== pre;
    if (!fresh && !isOpening && local.settledKey === undefined) {
      // sayfa yeni açıldı: zarı direkt göster
      local.settledKey = pre; diceSettle(local, st.dice, true);
    } else if (!fresh) {
      // yuvarlanma hiç başlamadıysa (çok hızlı geldi / açılış) önce kısa bir yuvarlama
      local.tumbleKey = pre;
      diceTumble(local, st.mover === me);
      local.settledKey = pre;
      c.timer(() => diceSettle(local, st.dice, false), 600);
    } else {
      local.settledKey = pre;
      const wait = Math.max(0, 600 - (performance.now() - (local.tumbleAt || 0)));
      c.timer(() => diceSettle(local, st.dice, false), wait);
    }
  }
  // kullanılan zarlar soluk
  const used = st.phase === "move" && st.side === me ? (local.pend || []).map((m) => m.d) : [];
  const dl = st.dl || [];
  const isDouble = dl.length === 4;
  [0, 1].forEach((i) => {
    const d = document.getElementById("tvD" + i);
    if (!d) return;
    let dim;
    if (st.phase === "move") dim = local.settledKey === pre && (isDouble ? used.length >= (i === 0 ? 2 : 4) : !!st.dice && used.includes(st.dice[i]));
    else dim = local.tumbleKey !== pre; // yeni zar bekleniyor: eski zarlar soluk, yuvarlananlar parlak
    d.classList.toggle("dim", dim);
  });
}

// ---------- tahta etkileşimi: dokun-dokun + sürükle-bırak ----------
function wireBoard(c, boardEl, o) {
  const { local } = c;
  const svg = boardEl.querySelector("svg");
  if (!svg) return;
  const toSvg = (ev) => { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  const apply = (step, animate) => {
    if (animate) { local.rerenderAfterAnim = o.rerender; animateLocal(c, o.v, step, o.me); }
    else { sfx.checker(); }
    local.pend.push(step); local.sel = null;
    o.rerender(); // animasyon sürerken bekletilir, bitince çizilir
  };
  let drag = null;

  svg.addEventListener("pointerdown", (ev) => {
    unlock();
    if (!o.myMove || o.done) {
      // zar atma sırasıysa tahtaya dokunmak da zarı atar
      document.getElementById("tvThrow")?.click();
      return;
    }
    const p = toSvg(ev);
    const pt = hitTest(p.x, p.y);
    if (pt == null) return;
    if (local.sel != null) {
      const tgt = o.steps.filter((s) => s.from === local.sel && s.to === pt).sort((a, b) => a.d - b.d)[0];
      if (tgt) { apply(tgt, true); return; }
    }
    if (!o.sources.has(pt)) { local.sel = null; o.rerender(); return; }
    drag = { from: pt, x0: ev.clientX, y0: ev.clientY, moved: false, ghost: null };
    svg.setPointerCapture?.(ev.pointerId);
  });
  svg.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 8) return;
    const p = toSvg(ev);
    if (!drag.moved) {
      drag.moved = true;
      local.sel = drag.from;
      // tutulan pulu gizle, parmağı takip eden hayalet pul oluştur
      const fromPos = drag.from === R.BAR ? posOf(true, "bar", 0) : posOf(true, drag.from, Math.max(0, Math.min(o.v.p[drag.from] - 1, 4)));
      const held = findDisc(svg, fromPos);
      if (held) held.style.opacity = "0.35";
      drag.ghost = document.createElementNS("http://www.w3.org/2000/svg", "g");
      drag.ghost.innerHTML = disc(0, 0, o.me, "").replace(/^<g[^>]*>|<\/g>$/g, "");
      drag.ghost.setAttribute("class", "tv-ghost");
      svg.querySelector("#tvFx").appendChild(drag.ghost);
      // hedefleri göster
      showTargets(svg, o.steps.filter((s) => s.from === drag.from), o.v);
    }
    drag.ghost.setAttribute("transform", `translate(${p.x} ${p.y - 6}) scale(1.15)`);
  });
  const end = (ev) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) { // dokunma
      const opts = o.steps.filter((s) => s.from === d.from);
      const tos = [...new Set(opts.map((s) => s.to))];
      if (tos.length === 1) { apply(opts.sort((a, b) => a.d - b.d)[0], true); return; }
      local.sel = local.sel === d.from ? null : d.from;
      o.rerender(); return;
    }
    const p = toSvg(ev);
    const pt = hitTest(p.x, p.y);
    const tgt = o.steps.filter((s) => s.from === d.from && s.to === pt).sort((a, b) => a.d - b.d)[0];
    if (tgt) apply(tgt, false);
    else { local.sel = null; o.rerender(); }
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", () => { drag = null; o.rerender(); });
}

function showTargets(svg, steps, v) {
  const fx = svg.querySelector("#tvFx");
  for (const s of steps) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", s.to === R.OFF ? "rect" : "circle");
    if (s.to === R.OFF) { el.setAttribute("x", TRAY + 1); el.setAttribute("y", H / 2); el.setAttribute("width", W - FR - TRAY - 2); el.setAttribute("height", BOT - H / 2 - 1); el.setAttribute("rx", 5); }
    else { const p = posOf(true, s.to, Math.min(Math.max(0, v.p[s.to]), 4)); el.setAttribute("cx", p.x); el.setAttribute("cy", p.y); el.setAttribute("r", CR - 1.5); }
    el.setAttribute("class", "tv-tgt"); el.setAttribute("fill", T.gold); el.setAttribute("fill-opacity", ".45"); el.setAttribute("stroke", T.gold); el.setAttribute("stroke-width", "2");
    fx.insertBefore(el, fx.firstChild);
  }
}

// Bir hamle için başlangıç ve bitiş koordinatı (oynayanın bakışında)
function moveCoords(v, m, mineView) {
  const from = m.from === R.BAR ? posOf(mineView, "bar", 0)
    : posOf(mineView, m.from, Math.max(0, Math.min(Math.abs(v.p[m.from]) - 1, 4)));
  let to;
  if (m.to === R.OFF) to = posOf(mineView, "off", v.off[mineView ? 0 : 1]);
  else {
    const destOwn = mineView ? Math.max(0, v.p[m.to]) : Math.max(0, -v.p[m.to]);
    to = posOf(mineView, m.to, Math.min(destOwn, 4));
  }
  return { from, to };
}

function flyGhost(svg, clr, from, to, ms) {
  const fx = svg?.querySelector("#tvFx");
  if (!fx) return Promise.resolve();
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.innerHTML = disc(0, 0, clr, "").replace(/^<g[^>]*>|<\/g>$/g, "");
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
    // güvence: sekme arka plana alınırsa ya da kare zamanlayıcı durursa animasyon yine de biter, tahta kilitlenmez
    setTimeout(finish, ms + 120);
  });
}

// Verilen merkezdeki pul elemanını bul
function findDisc(svg, at) {
  return [...(svg?.querySelectorAll(".tv-ck") || [])].find((el) => {
    const t = el.getAttribute("transform").match(/translate\(([\d.]+) ([\d.]+)\)/);
    return t && Math.abs(+t[1] - at.x) < 0.6 && Math.abs(+t[2] - at.y) < 0.6;
  });
}

// Kendi hamlem: tıklayınca pul kayarak gider
function animateLocal(c, vBefore, m, me) {
  const svg = document.querySelector("#tvBoard svg");
  const { from, to } = moveCoords(vBefore, m, true);
  const hit = m.to !== R.OFF && vBefore.p[m.to] === -1;
  // kaynaktaki pulu gizle, hayalet pul uçsun
  const src = findDisc(svg, from);
  if (src) src.style.opacity = "0";
  c.local.animating = true;
  flyGhost(svg, me, from, to, 220).then(() => {
    c.local.animating = false;
    c.local.dirty = false;
    (hit ? sfx.hit : sfx.checker)();
    c.local.rerenderAfterAnim?.();
  });
}

// Rakibin turu: önceki durumdan başlayıp her hamleyi sırayla uçur
function playOppTurn(c, prevReal, turn, me, done) {
  const { local } = c;
  local.animating = true;
  const opp = 1 - me;
  let vOpp = R.view(prevReal, opp); // rakibin bakışında hamleleri uygula
  const board = document.getElementById("tvBoard");
  const draw = (vo, hide) => { board.innerHTML = boardSvg(R.view(R.unview(vo, opp), me), me, { hide }); return board.querySelector("svg"); };
  let i = 0;
  const next = () => {
    if (i >= turn.moves.length) { local.animating = false; local.dirty = false; return done(); }
    const m = turn.moves[i++];
    const svg = draw(vOpp);
    // rakibin hamlesini benim bakışıma çevir
    const vMe = R.view(R.unview(vOpp, opp), me);
    const mm = { from: m.from === R.BAR ? R.BAR : 25 - m.from, to: m.to === R.OFF ? R.OFF : 25 - m.to };
    const from = mm.from === R.BAR ? posOf(false, "bar", 0) : posOf(false, mm.from, Math.max(0, Math.min(-vMe.p[mm.from] - 1, 4)));
    const to = mm.to === R.OFF ? posOf(false, "off", vMe.off[1]) : posOf(false, mm.to, Math.min(Math.max(0, -vMe.p[mm.to]), 4));
    const hit = mm.to !== R.OFF && vMe.p[mm.to] === 1;
    // kaynak pulu soluklaştır
    const srcEl = findDisc(svg, from);
    if (srcEl) srcEl.style.opacity = "0";
    flyGhost(svg, opp, from, to, 300).then(() => {
      (hit ? sfx.hit : sfx.checker)();
      vOpp = R.applyMove(vOpp, m);
      c.timer(next, 90);
    });
  };
  c.timer(next, 250); // önce zar otursun
}

// ---------- yan panel ----------
function renderPanel(c, el, o) {
  const { g, local } = c;
  const { M, st, me, opp, real, info, done, myMove, H2 } = o;
  const name = (side) => (g.p[side] === "__bot" ? "🤖 Bilgisayar" : c.esc(c.room.players?.[g.p[side]]?.name || "?"));
  const vMe = R.view(real, me), vOp = R.view(real, opp);
  let status = "";
  if (M.over) status = M.winner === me ? "Maçı kazandın! 🏆" : `${name(M.winner)} kazandı`;
  else if (st.phase?.startsWith("o-")) status = "Açılış zarları…";
  else if (st.phase === "roll") status = st.side === me ? "Sıra sende" : `${name(st.side)} zar atıyor`;
  else if (st.phase === "commit" || st.phase === "reveal") status = st.mover === me ? "Zarlar yuvarlanıyor…" : `${name(opp)} attı…`;
  else if (st.phase === "move") status = st.side === me ? (info.total === 0 ? "Oynanacak hamle yok" : done ? "Hamleni onayla" : `${info.total - local.pend.length} hamle kaldı`) : `${name(st.side)} oynuyor`;
  const prevGame = M.games.length > 1 ? M.games[M.games.length - 2] : null;
  const banner = prevGame && c.now() - prevGame.lastAt < H2.BETWEEN_GAMES_MS + 1500
    ? `<div class="tvp-banner">${prevGame.winner === me ? "Oyunu kazandın" : `${name(prevGame.winner)} kazandı`}${prevGame.pts === 2 ? " · MARS!" : ""}</div>` : "";
  const myRoll = st.phase === "roll" && st.side === me && !M.over && local.thrown !== st.pre;
  const canFs = !!document.documentElement.requestFullscreen && !document.fullscreenElement;

  el.innerHTML = `
    <div class="tvp-pl ${st.side === opp && !M.over ? "on" : ""}">
      <i class="dot" style="background:${T.ck[opp].b}"></i><span class="nm">${name(opp)}</span>
      <small>${R.pips(vOp)} pip · ${vOp.off[0]}/15</small>
    </div>
    <div class="tvp-score"><b>${M.score[opp]}</b><span>–</span><b>${M.score[me]}</b><small>${g.target > 1 ? `${g.target} sayılık maç` : "tek oyun"}</small></div>
    ${banner}
    <div class="tvp-mid">
      <p class="tvp-status">${status}</p>
      ${myRoll ? `<button class="tvp-throw" id="tvThrow"><span class="mini-dice">⚄⚂</span><b>Zarı at</b><small>dokun ya da tahtaya fırlat</small></button>` : ""}
      ${myMove && info.total > 0 ? `
        <div class="tvp-btns">
          <button class="btn" id="tvUndo" ${local.pend.length ? "" : "disabled"}>↶ Geri al</button>
          <button class="btn primary" id="tvSend" ${done && local.sent !== st.pre ? "" : "disabled"}>Bitir ✓</button>
        </div>` : ""}
    </div>
    <div class="cd"><i id="cdbar"></i></div>
    <div class="tvp-pl ${st.side === me && !M.over ? "on" : ""}">
      <i class="dot" style="background:${T.ck[me].a};border-color:${T.ck[me].ring}"></i><span class="nm">Sen</span>
      <small>${R.pips(vMe)} pip · ${vMe.off[0]}/15</small>
    </div>
    <div class="tvp-tools">
      <button id="tvMute" title="Ses">${isMuted() ? "🔇" : "🔊"}</button>
      ${canFs ? `<button id="tvFs" title="Tam ekran">⛶</button>` : ""}
      <button id="tvExit" title="Çık">✕</button>
    </div>`;

  const throwBtn = el.querySelector("#tvThrow");
  if (throwBtn) {
    // dokun ya da sürükleyip fırlat
    let start = null;
    const fire = () => {
      if (local.thrown === st.pre) return;
      unlock();
      local.thrown = st.pre;
      c.input(st.pre + "r", { v: R.randomHex(8), at: Math.round(c.now()) });
      local.tumbleKey = st.pre;
      diceTumble(local, true);
      throwBtn.disabled = true;
    };
    throwBtn.addEventListener("pointerdown", (e) => { start = { x: e.clientX, y: e.clientY }; throwBtn.classList.add("grab"); });
    throwBtn.addEventListener("pointerup", () => { throwBtn.classList.remove("grab"); fire(); });
    throwBtn.addEventListener("click", fire);
  }
  const undo = el.querySelector("#tvUndo");
  if (undo) undo.onclick = () => { local.pend.pop(); local.sel = null; sfx.tick(); renderTavla(c, H2.replay(), H2); };
  const send = el.querySelector("#tvSend");
  if (send) send.onclick = () => { local.sent = st.pre; c.input(st.pre + "m", { mv: H2.enc(local.pend), at: Math.round(c.now()) }); send.disabled = true; };
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

  // süre çubuğu
  const total = st.phase === "move" ? H2.MOVE_MS : st.phase === "roll" ? H2.ROLL_MS : H2.AUTO_WAIT_MS;
  const endAt = (st.lastAt || 0) + total;
  const setBar = () => { const b = document.getElementById("cdbar"); if (b) b.style.width = Math.max(0, Math.min(1, (endAt - c.now()) / total)) * 100 + "%"; };
  setBar();
  const id = st.pre + st.phase;
  if (local.barId !== id) {
    local.barId = id;
    const tick = () => { if (local.barId !== id || c.room.state !== "play") return; setBar(); c.timer(tick, 250); };
    c.timer(tick, 250);
  }
}

export { boardSvg };
