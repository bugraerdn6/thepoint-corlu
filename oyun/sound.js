// Ses efektleri — dosya yok, hepsi tarayıcıda üretilir (telif derdi yok, yüklenmesi anında).
let ctx = null;
const MUTE_KEY = "tp_mute";

export const isMuted = () => { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; } };
export const setMuted = (m) => { try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch { /* */ } };

// Tarayıcılar sesi ancak kullanıcı bir yere dokunduktan sonra açar
export function unlock() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch { ctx = null; }
}

function noiseBurst(at, dur, freq, gain, q = 3) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(at);
}

function thump(at, freq, dur, gain) {
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(freq, at); o.frequency.exponentialRampToValueAtTime(freq * 0.55, at + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + dur + 0.02);
}

export const sfx = {
  // zarların tahtaya çarpıp yuvarlanması
  dice(ms = 900) {
    if (isMuted() || !ctx) return;
    const t0 = ctx.currentTime;
    let t = 0;
    let gap = 0.05;
    while (t < ms / 1000) {
      noiseBurst(t0 + t, 0.03, 1800 + Math.random() * 1600, 0.5 * (1 - t / (ms / 1000)) + 0.08, 4);
      if (Math.random() < 0.35) thump(t0 + t, 260 + Math.random() * 80, 0.05, 0.15);
      t += gap; gap *= 1.18 + Math.random() * 0.15; // sekmeler giderek seyrekleşir
    }
  },
  // pul koyma "tak"
  checker() {
    if (isMuted() || !ctx) return;
    const t = ctx.currentTime;
    thump(t, 210, 0.07, 0.35);
    noiseBurst(t, 0.025, 2600, 0.25, 5);
  },
  // pul kırma: biraz daha sert
  hit() {
    if (isMuted() || !ctx) return;
    const t = ctx.currentTime;
    thump(t, 150, 0.12, 0.45); noiseBurst(t, 0.05, 1400, 0.4, 2);
  },
  tick() { if (!isMuted() && ctx) noiseBurst(ctx.currentTime, 0.015, 3500, 0.12, 6); },
  // patlama (Amiral Battı isabet)
  boom() {
    if (isMuted() || !ctx) return;
    const t = ctx.currentTime;
    thump(t, 90, 0.4, 0.6); noiseBurst(t, 0.35, 600, 0.55, 0.8); noiseBurst(t + 0.05, 0.2, 2200, 0.2, 1.5);
  },
  // su sıçraması (ıska)
  splash() {
    if (isMuted() || !ctx) return;
    const t = ctx.currentTime;
    noiseBurst(t, 0.28, 1800, 0.3, 0.7); noiseBurst(t + 0.08, 0.2, 3600, 0.12, 1.2);
  },
  // "sıra sende": iki tonlu kısa zil
  turn() {
    if (isMuted() || !ctx) return;
    const t = ctx.currentTime;
    [[660, 0], [880, 0.13]].forEach(([f, d]) => {
      const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.22, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.28);
      o.connect(g).connect(ctx.destination); o.start(t + d); o.stop(t + d + 0.3);
    });
  }
};

export const buzz = (p) => { try { navigator.vibrate?.(p); } catch { /* */ } };
