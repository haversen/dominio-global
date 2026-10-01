// Efectos de sonido sintetizados con Web Audio: no hace falta descargar ningún archivo.

const MUTE_KEY = 'dg.muted';
let ctx = null;
let master = null;
let muted = false;
try {
  muted = localStorage.getItem(MUTE_KEY) === '1';
} catch { /* almacenamiento no disponible */ }

// Los navegadores solo permiten sonido después de una interacción del usuario.
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
for (const ev of ['pointerdown', 'keydown']) {
  window.addEventListener(ev, () => audio(), { once: true, capture: true });
}

function tone(freq, { at = 0, dur = 0.15, type = 'square', gain = 0.3, slideTo = null } = {}) {
  const ac = audio();
  if (!ac || muted) return;
  const t = ac.currentTime + at;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise({ at = 0, dur = 0.4, gain = 0.5, cutoff = 900 } = {}) {
  const ac = audio();
  if (!ac || muted) return;
  const t = ac.currentTime + at;
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(master);
  src.start(t);
}

const SOUNDS = {
  click: () => tone(880, { dur: 0.05, type: 'triangle', gain: 0.12 }),
  recruit: () => {
    tone(330, { dur: 0.08, type: 'square', gain: 0.15 });
    tone(495, { at: 0.08, dur: 0.1, type: 'square', gain: 0.15 });
  },
  march: () => {
    for (let i = 0; i < 4; i++) noise({ at: i * 0.11, dur: 0.07, gain: 0.35, cutoff: 500 });
  },
  battle: () => {
    noise({ dur: 0.7, gain: 0.8, cutoff: 700 });
    tone(90, { dur: 0.5, type: 'sine', gain: 0.5, slideTo: 40 });
  },
  conquest: () => {
    SOUNDS.battle();
    [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: 0.35 + i * 0.1, dur: 0.18, type: 'triangle', gain: 0.25 }));
  },
  lost: () => {
    SOUNDS.battle();
    [392, 330, 262].forEach((f, i) => tone(f, { at: 0.35 + i * 0.16, dur: 0.25, type: 'sawtooth', gain: 0.15 }));
  },
  alarm: () => {
    for (let i = 0; i < 3; i++) tone(740, { at: i * 0.22, dur: 0.16, type: 'square', gain: 0.18, slideTo: 520 });
  },
  notify: () => {
    tone(988, { dur: 0.12, type: 'sine', gain: 0.25 });
    tone(1319, { at: 0.12, dur: 0.22, type: 'sine', gain: 0.25 });
  },
  start: () => {
    [392, 523, 659, 784].forEach((f, i) => tone(f, { at: i * 0.14, dur: i === 3 ? 0.5 : 0.16, type: 'sawtooth', gain: 0.15 }));
  },
  victory: () => {
    [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, {
      at: [0, 0.15, 0.3, 0.45, 0.75, 0.95, 1.1, 1.3][i], dur: i === 7 ? 0.8 : 0.17, type: 'sawtooth', gain: 0.18,
    }));
  },
  defeat: () => {
    [392, 370, 349, 262].forEach((f, i) => tone(f, { at: i * 0.35, dur: 0.45, type: 'sawtooth', gain: 0.15 }));
  },
};

export function play(name) {
  try {
    SOUNDS[name]?.();
  } catch { /* el sonido nunca debe romper el juego */ }
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch { /* sin almacenamiento */ }
}
