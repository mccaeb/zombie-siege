// Synthesised sound. Every gun shot is layered (transient crack + body thump + noise tail through a
// generated reverb) with random pitch/filter variation so no two shots sound identical.

let ac = null, master = null, wet = null, noiseBuf = null, muted = false;
const R = (a, b) => a + Math.random() * (b - a);

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.55;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // generated impulse response: a short, dark outdoor slap-back
    const len = Math.floor(ac.sampleRate * 1.4), ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < ac.sampleRate * 0.012 ? 0 : 1);
    }
    const conv = ac.createConvolver(); conv.buffer = ir;
    wet = ac.createGain(); wet.gain.value = 0.32;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    wet.connect(lp); lp.connect(conv); conv.connect(master);
  } catch (e) { ac = null; }
}
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.55; }
export const isMuted = () => muted;

function noise(dur, freq, q, vol, { type = 'bandpass', delay = 0, rev = 0, attack = 0.002 } = {}) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  if (rev) { const r = ac.createGain(); r.gain.value = rev; g.connect(r); r.connect(wet); }
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function tone(f0, f1, dur, vol, { type = 'sine', delay = 0, rev = 0 } = {}) {
  if (!ac || muted) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  o.connect(g); g.connect(master);
  if (rev) { const r = ac.createGain(); r.gain.value = rev; g.connect(r); r.connect(wet); }
  o.start(t); o.stop(t + dur + 0.05);
}

function gun({ crack, body, bodyVol, tail, tailVol, sub, rev }) {
  const v = R(0.9, 1.1);
  noise(0.035, crack * v, 0.8, 0.55, { type: 'highpass' });                 // transient crack
  tone(body * v, body * 0.28, 0.11 * v, bodyVol, { type: 'triangle' });       // body thump
  if (sub) tone(sub, 32, 0.22, bodyVol * 0.9, { type: 'sine' });             // chest punch
  noise(tail * v, 900 * v, 0.6, tailVol, { type: 'lowpass', rev });          // muzzle blast + tail
}

let hitT = 0, groanT = 0;
export const sfx = {
  pistol() { gun({ crack: 3200, body: 190, bodyVol: 0.35, tail: 0.22, tailVol: 0.5, sub: 70, rev: 0.9 }); casing(0.35); },
  dual() { gun({ crack: 3600, body: 210, bodyVol: 0.3, tail: 0.18, tailVol: 0.42, sub: 75, rev: 0.7 }); casing(0.3); },
  smg() { gun({ crack: 4200, body: 240, bodyVol: 0.22, tail: 0.1, tailVol: 0.32, rev: 0.45 }); casing(0.18); },
  shotgun() {
    gun({ crack: 2200, body: 120, bodyVol: 0.6, tail: 0.5, tailVol: 0.85, sub: 55, rev: 1.3 });
    noise(0.05, 2600, 3, 0.18, { delay: 0.3 }); noise(0.07, 1500, 3, 0.25, { delay: 0.42 });   // pump
    noise(0.06, 5200, 6, 0.06, { delay: 0.6 });                                               // shell lands
  },
  hit() { if (hitT > performance.now()) return; hitT = performance.now() + 45; noise(0.09, R(320, 460), 1.4, 0.32); tone(R(90, 120), 50, 0.06, 0.12); },
  kill() { tone(R(130, 170), 50, 0.35, 0.14, { type: 'sawtooth' }); noise(0.25, 260, 0.9, 0.3); },
  hurt() { tone(120, 60, 0.22, 0.32, { type: 'square' }); noise(0.15, 500, 1, 0.2); },
  heal() { [523, 659, 784].forEach((f, i) => tone(f, f * 1.01, 0.2, 0.12, { delay: i * 0.07, rev: 0.4 })); },
  weapon() {
    [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.16, 0.12, { type: 'square', delay: i * 0.055, rev: 0.5 }));
    noise(0.05, 3000, 4, 0.3, { delay: 0.32 }); noise(0.07, 1600, 3, 0.35, { delay: 0.42 });
  },
  mag() { [440, 660, 880].forEach((f, i) => tone(f, f * 1.5, 0.12, 0.12, { type: 'triangle', delay: i * 0.06, rev: 0.4 })); noise(0.06, 2500, 4, 0.3, { delay: 0.22 }); },
  reload() { noise(0.04, 3200, 3, 0.22); noise(0.06, 2000, 3, 0.28, { delay: 0.55 }); noise(0.03, 4200, 5, 0.18, { delay: 0.7 }); },
  dry() { noise(0.03, 4000, 5, 0.18); },
  swap() { noise(0.04, 2800, 4, 0.22); noise(0.05, 1700, 4, 0.22, { delay: 0.08 }); },
  drop() { tone(880, 1760, 0.25, 0.08, { rev: 0.6 }); tone(1320, 2640, 0.3, 0.06, { delay: 0.1, rev: 0.6 }); noise(0.4, 120, 0.7, 0.4, { type: 'lowpass', delay: 0.25 }); },
  wave() { tone(75, 42, 1.4, 0.3, { type: 'sawtooth', rev: 0.5 }); noise(0.9, 160, 0.8, 0.2, { type: 'lowpass' }); },
  dead() { tone(200, 30, 1.6, 0.35, { type: 'sawtooth', rev: 0.8 }); },
  ricochet() { if (Math.random() < 0.5) tone(R(2400, 3400), R(900, 1300), 0.12, 0.05, { type: 'sine', rev: 0.4 }); noise(0.04, 3500, 3, 0.12); }
};
function casing(chance) {
  if (Math.random() > chance) return;
  const d = R(0.28, 0.45);
  tone(R(4200, 5200), R(3800, 4600), 0.05, 0.035, { delay: d });
  tone(R(4800, 6000), R(4300, 5400), 0.04, 0.025, { delay: d + R(0.07, 0.12) });
}

export function groan() {
  if (!ac || muted || performance.now() < groanT) return;
  groanT = performance.now() + 400;
  const t = ac.currentTime, o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), f = ac.createBiquadFilter(), g = ac.createGain();
  o.type = 'sawtooth'; o.frequency.value = R(65, 105); lfo.frequency.value = R(4, 7); lg.gain.value = R(6, 12);
  lfo.connect(lg); lg.connect(o.frequency);
  f.type = 'lowpass'; f.frequency.value = R(300, 520); f.Q.value = 4;
  const dur = R(0.9, 1.5);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.frequency.exponentialRampToValueAtTime(o.frequency.value * 0.7, t + dur);
  o.connect(f); f.connect(g); g.connect(master);
  const r = ac.createGain(); r.gain.value = 0.5; g.connect(r); r.connect(wet);
  o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
}
