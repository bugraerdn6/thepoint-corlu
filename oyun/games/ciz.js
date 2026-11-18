// 🎨 Çiz-Tahmin — sırası gelen 3 kelimeden birini seçip çizer, diğerleri tahmin yazar.
// Çizim, çizerin yazdığı küçük parçalar halinde (in/s{tur}_{i}) her telefona canlı akar; kural değişikliği gerekmez.
import { sample, shuffle } from "./quiz.js";
import { checkText } from "../filter.js";
import { sfx, buzz, unlock } from "../sound.js";
import { burst } from "./cards.js";

const PICK_MS = 12000;
const DRAW_MS = 70000;
const REVEAL_MS = 5000;
const W = 1000, H = 750; // çizim koordinatları (telefon boyutundan bağımsız)
const COLORS = ["#2b2718", "#c1622f", "#3b6a86", "#5c6a3f", "#e8b04a", "#8a4a8a"];

export const WORDS = ["elma", "ev", "güneş", "araba", "kedi", "köpek", "balık", "ağaç", "çiçek", "bisiklet", "gözlük", "şemsiye", "saat", "telefon", "pizza",
  "dondurma", "gitar", "kalp", "yıldız", "ay", "bulut", "yağmur", "kardan adam", "uçak", "gemi", "tren", "köprü", "kale", "taç", "kılıç", "anahtar", "kapı",
  "pencere", "lamba", "sandalye", "masa", "yatak", "ayakkabı", "şapka", "tişört", "hamburger", "patates", "kahve", "pasta", "mum", "hediye", "balon", "kamera",
  "kitap", "kalem", "makas", "top", "kupa", "diş fırçası", "robot", "uzaylı", "hayalet", "korsan", "ejderha", "dinozor", "zürafa", "fil", "penguen", "yılan",
  "örümcek", "arı", "kelebek", "salyangoz", "ahtapot", "köpekbalığı", "kaktüs", "palmiye", "yanardağ", "gökkuşağı", "şimşek", "dağ", "ada", "çadır", "piramit",
  "futbol topu", "satranç", "zar", "davul", "mikrofon", "kulaklık", "televizyon", "bilgisayar", "ampul", "mıknatıs", "roket", "paraşüt", "helikopter",
  "denizaltı", "traktör", "ambulans", "trafik lambası", "çapa", "pusula", "harita", "deniz feneri"];

const norm = (s) => String(s || "").toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();
function lev(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

// Bu turdaki tahminler (zaman sırasıyla) ve doğru bilenler
export function guesses(room, t) {
  const g = room.g, d = g.order[t];
  const list = [];
  for (const [key, byP] of Object.entries(room.in || {})) {
    if (!key.startsWith(`g${t}_`)) continue;
    for (const [k, v] of Object.entries(byP)) if (k !== d && v?.t) list.push({ k, t: v.t, at: v.at || 0 });
  }
  list.sort((a, b) => a.at - b.at);
  const word = norm((g.words || {})[t] ?? (t === g.turn ? g.word : ""));
  const right = [];
  const seen = new Set();
  for (const x of list) { x.ok = !!word && norm(x.t) === word; if (x.ok && !seen.has(x.k)) { seen.add(x.k); right.push(x); } }
  return { list, right };
}

function turnPoints(room, t) {
  const g = room.g;
  const pts = {};
  const { right } = guesses(room, t);
  const start = (g.turnStarts || {})[t] || 0;
  right.forEach((x, i) => {
    const left = Math.max(0, 1 - (x.at - start) / DRAW_MS);
    pts[x.k] = (pts[x.k] || 0) + Math.round(80 + 120 * left) - i * 10;
    pts[g.order[t]] = (pts[g.order[t]] || 0) + 50;
  });
  return pts;
}

export default {
  id: "ciz", name: "Çiz-Tahmin", emoji: "🎨",
  desc: "3–8 kişi · Biri çizer, diğerleri tahmin eder",
  rules: "Sırası gelen 3 kelimeden birini seçer ve çizer; çizim herkesin telefonunda canlı görünür. Diğerleri tahminini yazar. <b>Erken bilen daha çok puan</b> alır, çizer de bilen her kişi için puan kazanır. Harf sayısı görünür, süre ilerledikçe harfler açılır. Yazı ve rakam çizmek yasak 😉",
  minPlayers: 3, maxPlayers: 8, soloTest: false,

  start(c) {
    const order = shuffle(c.players.map((p) => p.k));
    const turns = order.length <= 4 ? order.length * 2 : order.length;
    return { phase: "pick", turn: 0, order: Array.from({ length: turns }, (_, i) => order[i % order.length]), opts: sample(WORDS, 3), endAt: Math.round(c.now() + PICK_MS) };
  },

  render(c) {
    const { g, local } = c;
    const app = document.getElementById("app");
    c.hideArena();
    const t = g.turn, drawer = g.order[t];
    const iDraw = drawer === c.me;
    const name = (k) => (k === c.me ? "Sen" : c.esc(c.room.players?.[k]?.name || "?"));
    const totals = {};
    for (let i = 0; i < (g.phase === "pick" ? t : t + 1); i++) for (const [k, v] of Object.entries(turnPoints(c.room, i))) totals[k] = (totals[k] || 0) + v;
    const board = `<ol class="list mini">${c.players.map((p) => ({ ...p, s: totals[p.k] || 0 })).sort((a, b) => b.s - a.s).slice(0, 4)
      .map((p, i) => `<li class="${p.k === c.me ? "me" : ""}"><span class="rank">${i + 1}</span><span class="name">${p.k === drawer ? "🎨 " : ""}${name(p.k)}</span><span class="val">${p.s}</span></li>`).join("")}</ol>`;

    if (g.phase === "pick") {
      local.drawTurn = null;
      app.innerHTML = `
        <section class="card center cz">
          <p class="eyebrow">🎨 Çiz-Tahmin · ${t + 1}/${g.order.length}</p>
          <div class="cd"><i id="cdbar"></i></div>
          ${iDraw ? `<h2 style="margin-top:.8rem">Ne çizeceksin?</h2>
            <div class="cz-opts">${g.opts.map((w, i) => `<button class="btn cz-opt" data-w="${i}">${c.esc(w)}</button>`).join("")}</div>
            <p class="muted small">Seçmezsen biri otomatik seçilir.</p>`
          : `<div class="ss-next"><span class="ss-mask">🎨</span><h2>${name(drawer)} kelime seçiyor…</h2></div>`}
          ${board}
        </section>`;
      app.querySelectorAll("[data-w]").forEach((b) => b.onclick = () => {
        unlock();
        if (local.picked === t) return;
        local.picked = t;
        c.input(`w${t}`, { i: Number(b.dataset.w) });
        app.querySelectorAll("[data-w]").forEach((x) => { x.disabled = true; });
      });
      bar(c, `p${t}`, g.endAt, PICK_MS);
      return;
    }

    const { list, right } = guesses(c.room, t);
    const iKnow = iDraw || right.some((x) => x.k === c.me) || g.phase === "reveal";
    const word = g.word || "";
    // ipucu: harf sayısı, zaman ilerledikçe harf aç
    const start = (g.turnStarts || {})[t] || 0;
    const frac = g.phase === "draw" ? Math.min(1, (c.now() - start) / DRAW_MS) : 1;
    const revealN = frac > 0.75 ? 2 : frac > 0.5 ? 1 : 0;
    const showIdx = new Set([...word].map((ch, i) => i).filter((i) => word[i] !== " ").sort((a, b) => ((a * 7919) % 13) - ((b * 7919) % 13)).slice(0, revealN));
    const hint = [...word].map((ch, i) => (ch === " " ? "&nbsp;&nbsp;" : iKnow || showIdx.has(i) ? c.esc(ch.toLocaleUpperCase("tr")) : "_")).join(" ");
    // yeni bilen → kutlama
    if ((local.rightN ?? right.length) < right.length) { const x = right[right.length - 1]; if (x.k === c.me) { burst(document.querySelector(".cz") || app, "BİLDİN! 🎉", "green"); sfx.win(); buzz([30, 40, 60]); } else sfx.turn(); }
    local.rightN = right.length;

    const feed = list.slice(-6).map((x) => x.ok ? `<li class="ok">✓ ${name(x.k)} bildi!</li>`
      : `<li><b>${name(x.k)}:</b> ${c.esc(x.t)}${!iKnow ? "" : ""}${lev(norm(x.t), norm(word)) === 1 ? ` <em>çok yakın!</em>` : ""}</li>`).join("");

    // tuval bir kez kurulur (her güncellemede yeniden çizilmesin)
    if (local.drawTurn !== t || !document.getElementById("czCanvas")) {
      local.drawTurn = t; local.drawnN = 0;
      app.innerHTML = `
        <section class="card center cz">
          <p class="eyebrow">🎨 ${name(drawer)} çiziyor · ${t + 1}/${g.order.length}</p>
          <div class="cd"><i id="cdbar"></i></div>
          <p class="cz-hint" id="czHint"></p>
          <div class="cz-wrap"><canvas id="czCanvas" width="${W}" height="${H}"></canvas><div class="cz-reveal" id="czReveal"></div></div>
          <div id="czTools"></div>
          <div id="czBottom"></div>
        </section>`;
      setupCanvas(c, iDraw && g.phase === "draw");
    }
    document.getElementById("czHint").innerHTML = iDraw ? `Çiz: <b>${c.esc(word.toLocaleUpperCase("tr"))}</b>` : hint;
    document.getElementById("czReveal").innerHTML = g.phase === "reveal" ? `<span>${c.esc(word.toLocaleUpperCase("tr"))}</span>` : "";
    document.getElementById("czReveal").classList.toggle("show", g.phase === "reveal");
    document.getElementById("czTools").innerHTML = iDraw && g.phase === "draw" ? `
      <div class="cz-tools">${COLORS.map((col, i) => `<button class="cz-col ${(local.col ?? 0) === i ? "on" : ""}" data-col="${i}" style="background:${col}"></button>`).join("")}
        <button class="cz-tool ${local.size === 18 ? "on" : ""}" data-size="18" title="Kalın">●</button><button class="cz-tool ${local.size !== 18 ? "on" : ""}" data-size="7" title="İnce">•</button>
        <button class="cz-tool ${local.col === -1 ? "on" : ""}" data-col="-1" title="Silgi">🧽</button><button class="cz-tool" id="czClear" title="Temizle">🗑</button></div>` : "";
    document.getElementById("czBottom").innerHTML = `
      ${!iKnow && g.phase === "draw" ? `<form class="row cz-guess" id="czForm"><div class="field grow"><input id="czIn" type="text" maxlength="30" autocomplete="off" placeholder="Tahminini yaz…"></div><button class="btn primary">Gönder</button></form><p class="muted small" id="czMsg"></p>` : ""}
      ${iKnow && !iDraw && g.phase === "draw" ? `<p class="big-result">Bildin! ✓ Diğerlerini bekle</p>` : ""}
      <ul class="cz-feed">${feed}</ul>${board}`;
    app.querySelectorAll("[data-col]").forEach((b) => b.onclick = () => { local.col = Number(b.dataset.col); this.render(c); });
    app.querySelectorAll("[data-size]").forEach((b) => b.onclick = () => { local.size = Number(b.dataset.size); this.render(c); });
    const clr = document.getElementById("czClear");
    if (clr) clr.onclick = () => { local.chunk = (local.chunk || 0) + 1; c.input(`s${t}_${local.chunk}`, { clear: true }); };
    const form = document.getElementById("czForm");
    if (form) {
      const input = document.getElementById("czIn");
      if (local.draft) input.value = local.draft;
      input.oninput = () => { local.draft = input.value; };
      form.onsubmit = (e) => {
        e.preventDefault();
        const txt = input.value.trim();
        if (!txt) return;
        const ch = checkText(txt);
        if (!ch.ok) { document.getElementById("czMsg").textContent = ch.reason; return; }
        local.gn = (local.gn || 0) + 1;
        c.input(`g${t}_${local.gn}`, { t: txt.slice(0, 30), at: Math.round(c.now()) });
        input.value = ""; local.draft = ""; sfx.tick();
      };
    }
    drawStrokes(c, t);
    bar(c, `d${t}${g.phase}`, g.endAt, g.phase === "draw" ? DRAW_MS : REVEAL_MS);
  },

  hostTick(c) {
    const { g } = c;
    const t = g.turn;
    if (g.phase === "pick") {
      const ch = c.inputs[`w${t}`]?.[g.order[t]];
      if (!ch && c.now() < g.endAt) return;
      const word = g.opts[ch && ch.i >= 0 && ch.i < 3 ? ch.i : Math.floor(Math.random() * 3)];
      // her turun kelimesi ayrı saklanır (puanlar geçmiş turlar için de doğru hesaplansın)
      c.advance(() => c.setG({ phase: "draw", word, words: { ...(g.words || {}), [t]: word }, endAt: Math.round(c.now() + DRAW_MS), turnStarts: { ...(g.turnStarts || {}), [t]: Math.round(c.now()) } }));
      return;
    }
    if (g.phase === "draw") {
      const { right } = guesses(c.room, t);
      const everyone = c.players.filter((p) => p.k !== g.order[t]).every((p) => right.some((x) => x.k === p.k));
      if (!everyone && c.now() < g.endAt) return;
      c.advance(() => c.setG({ phase: "reveal", endAt: Math.round(c.now() + REVEAL_MS) }));
      return;
    }
    if (c.now() < g.endAt) return;
    c.advance(() => (t + 1 < g.order.length ? c.setG({ phase: "pick", turn: t + 1, word: null, opts: sample(WORDS, 3), endAt: Math.round(c.now() + PICK_MS) }) : c.finish()));
  },

  results(room) {
    const t = {};
    (room.g?.order || []).forEach((_, i) => { for (const [k, v] of Object.entries(turnPoints(room, i))) t[k] = (t[k] || 0) + v; });
    return Object.keys(room.players || {}).map((k) => ({ k, score: t[k] || 0, label: `${t[k] || 0} puan` })).sort((a, b) => b.score - a.score);
  }
};

// ---------- çizim ----------
function setupCanvas(c, canDraw) {
  const cv = document.getElementById("czCanvas");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fffdf6"; ctx.fillRect(0, 0, W, H);
  if (!canDraw) return;
  const { local } = c;
  let pts = null, flushT = null;
  const toXY = (e) => { const r = cv.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)]; };
  const send = () => {
    if (!pts || pts.length < 1) return;
    local.chunk = (local.chunk || 0) + 1;
    const col = local.col ?? 0;
    c.input(`s${c.g.turn}_${local.chunk}`, { p: pts.map((p) => p.join(",")).join(";"), c: col, w: col === -1 ? 34 : local.size || 7 });
    pts = pts.slice(-1); // bir sonraki parça kesintisiz devam etsin
  };
  cv.onpointerdown = (e) => {
    e.preventDefault(); unlock();
    try { cv.setPointerCapture?.(e.pointerId); } catch { /* bazı tarayıcılar reddedebilir; çizim yine çalışır */ }
    pts = [toXY(e)];
    flushT = setInterval(send, 160);
  };
  cv.onpointermove = (e) => {
    if (!pts) return;
    const p = toXY(e), q = pts[pts.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 6) return;
    pts.push(p);
    // kendi ekranımda anında çiz
    const col = local.col ?? 0;
    ctx.strokeStyle = col === -1 ? "#fffdf6" : COLORS[col]; ctx.lineWidth = col === -1 ? 34 : local.size || 7; ctx.lineCap = ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
  };
  const up = () => { if (!pts) return; clearInterval(flushT); if (pts.length === 1) pts.push([pts[0][0] + 1, pts[0][1]]); send(); pts = null; };
  cv.onpointerup = up; cv.onpointercancel = up; cv.onpointerleave = up;
}

// Gelen çizim parçalarını sırayla çiz (sadece yenileri)
function drawStrokes(c, t) {
  const cv = document.getElementById("czCanvas");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const drawer = c.g.order[t];
  const chunks = [];
  for (const [key, byP] of Object.entries(c.inputs)) {
    const m = key.match(/^s(\d+)_(\d+)$/);
    if (m && Number(m[1]) === t && byP[drawer]) chunks.push([Number(m[2]), byP[drawer]]);
  }
  chunks.sort((a, b) => a[0] - b[0]);
  const isMe = drawer === c.me;
  let from = c.local.drawnN || 0;
  // temizleme geldiyse baştan çiz
  if (chunks.slice(from).some(([, v]) => v.clear)) from = 0;
  if (from === 0) { ctx.fillStyle = "#fffdf6"; ctx.fillRect(0, 0, W, H); }
  let start = 0;
  chunks.forEach(([, v], i) => { if (v.clear) start = i + 1; });
  for (let i = Math.max(from, start); i < chunks.length; i++) {
    const v = chunks[i][1];
    if (v.clear || !v.p) continue;
    if (isMe && from !== 0) continue; // kendi çizgilerimi zaten anında çizdim
    const pts = v.p.split(";").map((s) => s.split(",").map(Number));
    ctx.strokeStyle = v.c === -1 ? "#fffdf6" : COLORS[v.c] || COLORS[0]; ctx.lineWidth = v.w || 7; ctx.lineCap = ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
    ctx.stroke();
  }
  c.local.drawnN = chunks.length;
}

function bar(c, id, endAt, total) {
  const set = () => { const b = document.getElementById("cdbar"); if (b) { const left = Math.max(0, endAt - c.now()); b.style.width = (left / total) * 100 + "%"; b.parentElement.classList.toggle("hurry", left < 10000 && total > 20000); } };
  set();
  if (c.local.barId !== id) {
    c.local.barId = id;
    const tick = () => { if (c.local.barId !== id || c.room.state !== "play") return; set(); c.timer(tick, 300); };
    c.timer(tick, 300);
  }
}
