// 🧛 Vampir Köylü — gizli roller: vampirler gece kurban seçer, köy gündüz şüpheliyi oylar.
// Roller: vampir, doktor (gece birini korur), gözcü (gece birini sorgular), köylü.
import { shuffle } from "./quiz.js";
import { sfx, buzz, unlock } from "../sound.js";
import { burst } from "./cards.js";

const ROLES_MS = 9000, NIGHT_MS = 30000, DAWN_MS = 7000, DAY_MS = 90000, VERDICT_MS = 7000;
export const ROLE = {
  vamp: { name: "Vampir", emoji: "🧛", team: "vamp", desc: "Gece diğer vampirlerle birlikte bir kurban seç. Gündüz köylü gibi davran, yakalanma!" },
  doc: { name: "Doktor", emoji: "💉", team: "village", desc: "Her gece birini koru (kendini de). Vampirler onu seçerse kurtulur." },
  seer: { name: "Gözcü", emoji: "👁", team: "village", desc: "Her gece birini sorgula: vampir mi değil mi, sadece sen öğrenirsin." },
  vill: { name: "Köylü", emoji: "🧑‍🌾", team: "village", desc: "Gündüz konuşmaları dinle, vampirleri bulup oyla." }
};

const vampCount = (n) => (n <= 6 ? 1 : n <= 9 ? 2 : 3);
export const alive = (g) => g.order.filter((k) => !g.dead?.[k]);
const tally = (votes) => { const t = {}; for (const v of Object.values(votes || {})) if (v?.t) t[v.t] = (t[v.t] || 0) + 1; return t; };
function winnerOf(g) {
  const al = alive(g);
  const v = al.filter((k) => g.roles[k] === "vamp").length;
  if (v === 0) return "village";
  if (v >= al.length - v) return "vamp";
  return null;
}

export default {
  id: "vampir", name: "Vampir Köylü", emoji: "🧛",
  desc: "5–12 kişi · Gizli roller: vampirleri bul",
  rules: "Herkese gizli bir rol gelir: 🧛 Vampir, 💉 Doktor, 👁 Gözcü ya da 🧑‍🌾 Köylü. <b>Gece</b> vampirler kurban seçer, doktor birini korur, gözcü birini sorgular. <b>Sabah</b> olanlar açıklanır, <b>gündüz</b> masada tartışıp şüpheliyi oylarsınız. Bütün vampirler yakalanırsa köy, vampirler köylülere eşitlenirse vampirler kazanır. Ölenler izlemeye devam eder.",
  minPlayers: 5, maxPlayers: 12, soloTest: false,

  start(c) {
    const order = shuffle(c.players.map((p) => p.k));
    const nV = vampCount(order.length);
    const pool = shuffle([...Array(nV).fill("vamp"), "doc", "seer", ...Array(order.length - nV - 2).fill("vill")]);
    const roles = Object.fromEntries(order.map((k, i) => [k, pool[i]]));
    return { phase: "roles", round: 0, order, roles, dead: null, log: null, seen: null, endAt: Math.round(c.now() + ROLES_MS) };
  },

  render(c) {
    const { g, local } = c;
    const app = document.getElementById("app");
    c.hideArena();
    const me = c.me, myRole = g.roles[me], R = ROLE[myRole];
    const amDead = !!g.dead?.[me];
    const al = alive(g);
    const name = (k) => (k === me ? "Sen" : c.esc(c.room.players?.[k]?.name || "?"));
    const vamps = g.order.filter((k) => g.roles[k] === "vamp");
    const r = g.round;
    const enter = local.enter !== `${g.phase}${r}`;
    local.enter = `${g.phase}${r}`;
    if (enter) { if (g.phase === "night") { sfx.lose(); buzz(20); } else if (g.phase === "dawn" || g.phase === "verdict") { sfx.hit(); buzz([30, 40, 30]); } else if (g.phase === "day") sfx.turn(); }
    const roleChip = `<span class="vk-role">${R.emoji} ${R.name}${amDead ? " · 💀 elendin" : ""}</span>`;
    const night = g.phase === "night" || g.phase === "roles";
    const picker = (key, list, label) => {
      const mine = c.inputs[key]?.[me]?.t ?? local[key];
      return `<p class="vk-ask">${label}</p><div class="vk-grid">${list.map((k) => `<button class="vk-p ${mine === k ? "on" : ""}" data-pick="${c.esc(k)}" data-key="${key}" ${mine !== undefined ? "disabled" : ""}>${name(k)}</button>`).join("")}</div>`;
    };
    let body = "";

    if (g.phase === "roles") {
      body = `<div class="vk-card ${myRole}"><span class="vk-big">${R.emoji}</span><b>${R.name}</b><p>${R.desc}</p>
        ${myRole === "vamp" && vamps.length > 1 ? `<p class="vk-mates">Diğer vampir${vamps.length > 2 ? "ler" : ""}: <b>${vamps.filter((k) => k !== me).map(name).join(", ")}</b></p>` : ""}</div>
        <p class="muted small">Rolünü kimseye gösterme 🤫</p>`;
    } else if (g.phase === "night") {
      if (amDead) body = `<h2>🌙 Gece</h2><p class="muted">Köy uyuyor… Sen elendin, sessizce izle.</p>`;
      else if (myRole === "vamp") {
        const votes = c.inputs[`na${r}`] || {};
        body = `<h2>🌙 Gece · Avlanma vakti</h2>${picker(`na${r}`, al.filter((k) => g.roles[k] !== "vamp"), "Kimi seçiyorsunuz?")}
          ${vamps.length > 1 ? `<p class="muted small">Vampir oyları: ${Object.entries(votes).map(([k, v]) => `${name(k)} → ${name(v.t)}`).join(" · ") || "henüz yok"}</p>` : ""}`;
      } else if (myRole === "doc") body = `<h2>🌙 Gece</h2>${picker(`nd${r}`, al, "Bu gece kimi koruyorsun?")}`;
      else if (myRole === "seer") body = `<h2>🌙 Gece</h2>${picker(`ns${r}`, al.filter((k) => k !== me), "Kimi sorguluyorsun?")}`;
      else body = `<h2>🌙 Gece</h2><p class="muted">Köy uyuyor… Gözlerini kapat 😴</p><p class="muted small">(Herkes aynı ekranı görüyor ki kimin özel rolü olduğu anlaşılmasın.)</p>`;
    } else if (g.phase === "dawn") {
      const ev = g.log?.[r];
      const seen = g.seen?.[me]?.[r];
      body = `<h2>🌅 Sabah oldu</h2>
        <p class="vk-news">${ev?.killed ? `💀 <b>${name(ev.killed)}</b> bu gece vampirlerin kurbanı oldu. (${ROLE[g.roles[ev.killed]].emoji} ${ROLE[g.roles[ev.killed]].name})` : ev?.saved ? "💉 Vampirler saldırdı ama doktor kurtardı! Kimse ölmedi." : "Sakin bir gece, kimse ölmedi."}</p>
        ${myRole === "seer" && !amDead && seen ? `<p class="vk-secret">👁 Sorgun: <b>${name(seen.t)}</b> ${seen.v ? "bir <b>VAMPİR</b> 🧛" : "vampir <b>değil</b>"}</p>` : ""}`;
    } else if (g.phase === "day") {
      const votes = c.inputs[`dv${r}`] || {};
      const t = tally(votes);
      const mine = votes[me]?.t ?? local[`dv${r}`];
      body = `<h2>☀️ Gündüz · Tartışma</h2><p class="muted small">Masada konuşun, sonra şüphelendiğiniz kişiyi oylayın.</p>
        ${amDead ? `<p class="muted">Elendin, oy veremezsin. Konuşmaya katılabilirsin 😉</p>` : ""}
        <div class="vk-grid">${al.map((k) => `<button class="vk-p ${mine === k ? "on" : ""}" data-vote="${c.esc(k)}" ${amDead || mine !== undefined || k === me ? "disabled" : ""}>${name(k)}${t[k] ? `<em>${t[k]}</em>` : ""}</button>`).join("")}
          <button class="vk-p skip ${mine === "skip" ? "on" : ""}" data-vote="skip" ${amDead || mine !== undefined ? "disabled" : ""}>Kimseyi asma${t.skip ? `<em>${t.skip}</em>` : ""}</button></div>
        <p class="muted small">${Object.keys(votes).length}/${al.length} kişi oyladı</p>`;
    } else if (g.phase === "verdict") {
      const ev = g.log?.[`d${r}`];
      body = `<h2>⚖️ Karar</h2><p class="vk-news">${ev?.hanged ? `Köy <b>${name(ev.hanged)}</b> adlı kişiyi astı… ${ROLE[g.roles[ev.hanged]].emoji} <b>${ROLE[g.roles[ev.hanged]].name}</b> çıktı!` : "Köy karar veremedi, kimse asılmadı."}</p>`;
      if (enter && ev?.hanged) c.timer(() => burst(document.querySelector(".vk") || app, g.roles[ev.hanged] === "vamp" ? "VAMPİR YAKALANDI! 🧛" : "MASUM ÇIKTI 😢", g.roles[ev.hanged] === "vamp" ? "green" : "red"), 300);
    }

    app.innerHTML = `
      <section class="card center vk ${night ? "night" : "dayl"} ${enter ? "qin" : ""}">
        <p class="eyebrow">🧛 Vampir Köylü · ${g.phase === "roles" ? "Roller" : `${r + 1}. gün`}</p>
        ${roleChip}
        <div class="cd"><i id="cdbar"></i></div>
        ${body}
        <div class="vk-alive">${g.order.map((k) => `<span class="${g.dead?.[k] ? "dead" : ""}">${g.dead?.[k] ? "💀" : "🙂"} ${name(k)}</span>`).join("")}</div>
      </section>`;
    app.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => {
      const key = b.dataset.key;
      if (local[key] !== undefined) return;
      unlock(); sfx.tick(); buzz(10);
      local[key] = b.dataset.pick;
      c.input(key, { t: b.dataset.pick });
      this.render(c);
    });
    app.querySelectorAll("[data-vote]").forEach((b) => b.onclick = () => {
      const key = `dv${r}`;
      if (local[key] !== undefined) return;
      unlock(); sfx.tick(); buzz(10);
      local[key] = b.dataset.vote;
      c.input(key, { t: b.dataset.vote });
      this.render(c);
    });
    const total = { roles: ROLES_MS, night: NIGHT_MS, dawn: DAWN_MS, day: DAY_MS, verdict: VERDICT_MS }[g.phase];
    const set = () => { const b = document.getElementById("cdbar"); if (b) b.style.width = Math.max(0, (g.endAt - c.now()) / total) * 100 + "%"; };
    set();
    if (local.barId !== local.enter) { local.barId = local.enter; const id = local.enter; const tick = () => { if (local.barId !== id || c.room.state !== "play") return; set(); c.timer(tick, 300); }; c.timer(tick, 300); }
  },

  hostTick(c) {
    const { g } = c;
    const r = g.round, al = alive(g);
    const now = Math.round(c.now());
    const doneNight = () => {
      const needV = al.filter((k) => g.roles[k] === "vamp").every((k) => c.inputs[`na${r}`]?.[k]);
      const needD = al.filter((k) => g.roles[k] === "doc").every((k) => c.inputs[`nd${r}`]?.[k]);
      const needS = al.filter((k) => g.roles[k] === "seer").every((k) => c.inputs[`ns${r}`]?.[k]);
      return needV && needD && needS;
    };
    if (g.phase === "roles") { if (c.now() >= g.endAt) c.advance(() => c.setG({ phase: "night", endAt: now + NIGHT_MS })); return; }
    if (g.phase === "night") {
      if (!doneNight() && c.now() < g.endAt) return;
      c.advance(async () => {
        const vt = tally(c.inputs[`na${r}`]);
        const top = Object.entries(vt).sort((a, b) => b[1] - a[1]);
        let target = top.length ? top.filter((x) => x[1] === top[0][1])[Math.floor(Math.random() * top.filter((x) => x[1] === top[0][1]).length)][0] : null;
        if (target && (!al.includes(target) || g.roles[target] === "vamp")) target = null;
        const doc = al.find((k) => g.roles[k] === "doc");
        const saved = doc && c.inputs[`nd${r}`]?.[doc]?.t === target;
        const seer = al.find((k) => g.roles[k] === "seer");
        const sq = seer && c.inputs[`ns${r}`]?.[seer]?.t;
        const dead = { ...(g.dead || {}) };
        if (target && !saved) dead[target] = true;
        const log = { ...(g.log || {}), [r]: { killed: target && !saved ? target : null, saved: !!(target && saved) } };
        const seen = { ...(g.seen || {}) };
        if (seer && sq) seen[seer] = { ...(seen[seer] || {}), [r]: { t: sq, v: g.roles[sq] === "vamp" } };
        await c.setG({ phase: "dawn", dead, log, seen, endAt: now + DAWN_MS });
      });
      return;
    }
    if (g.phase === "dawn") {
      if (c.now() < g.endAt) return;
      c.advance(() => (winnerOf(g) ? c.finish() : c.setG({ phase: "day", endAt: now + DAY_MS })));
      return;
    }
    if (g.phase === "day") {
      const votes = c.inputs[`dv${r}`] || {};
      const allIn = al.every((k) => votes[k]);
      if (!allIn && c.now() < g.endAt) return;
      c.advance(async () => {
        const t = tally(votes);
        const top = Object.entries(t).sort((a, b) => b[1] - a[1]);
        // en çok oy alan tekse ve "kimseyi asma"dan fazlaysa asılır
        const hanged = top.length && top[0][0] !== "skip" && (top.length === 1 || top[0][1] > top[1][1]) ? top[0][0] : null;
        const dead = { ...(g.dead || {}) };
        if (hanged) dead[hanged] = true;
        await c.setG({ phase: "verdict", dead, log: { ...(g.log || {}), [`d${r}`]: { hanged } }, endAt: now + VERDICT_MS });
      });
      return;
    }
    if (g.phase === "verdict") {
      if (c.now() < g.endAt) return;
      c.advance(() => (winnerOf(g) ? c.finish() : c.setG({ phase: "night", round: r + 1, endAt: now + NIGHT_MS })));
    }
  },

  results(room) {
    const g = room.g;
    const w = g?.roles ? winnerOf(g) : null;
    return Object.keys(room.players || {}).map((k) => {
      const role = ROLE[g?.roles?.[k]] || ROLE.vill;
      const won = w && role.team === w;
      return { k, score: won ? 1 : 0, label: `${role.emoji} ${role.name}${won ? " · kazandı" : ""}` };
    }).sort((a, b) => b.score - a.score);
  }
};
