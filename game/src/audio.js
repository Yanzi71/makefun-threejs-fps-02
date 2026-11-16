// Sound, synthesized: every effect is oscillators and filtered noise through one
// WebAudio graph, so the game ships no audio files and makes no network request.
// The context is created lazily on the first user gesture (the play button) and
// every call is guarded, so a browser with audio blocked still plays silently.
let context = null;
let master = null;

function ensure() {
  if (context) {
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  }
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = 0.5;
    master.connect(context.destination);
    return context;
  } catch {
    return null;
  }
}

function noiseBuffer(duration) {
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function burst({ duration, type = 'lowpass', frequency = 1200, gain = 0.5, when = 0 }) {
  if (!ensure()) return;
  const time = context.currentTime + when;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(duration);
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(gain, time);
  envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
  source.connect(filter).connect(envelope).connect(master);
  source.start(time);
  source.stop(time + duration + 0.02);
}

function tone({ frequency = 440, end = null, duration = 0.1, type = 'sine', gain = 0.3, when = 0 }) {
  if (!ensure()) return;
  const time = context.currentTime + when;
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, time);
  if (end !== null) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, end), time + duration);
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(gain, time);
  envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
  oscillator.connect(envelope).connect(master);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.02);
}

export const audio = {
  unlock() {
    ensure();
  },
  shoot(kind) {
    // A crack (noise) over a thump (sine drop); each weapon class has its own pitch.
    const pitch = kind === 'dmr' ? 500 : kind === 'smg' ? 1600 : kind === 'pistol' ? 1100 : 900;
    burst({ duration: 0.12, frequency: pitch, gain: 0.55 });
    tone({ frequency: 150, end: 55, duration: 0.12, type: 'sine', gain: 0.5 });
  },
  distantShoot(distance) {
    const gain = Math.max(0.03, 0.4 - distance * 0.008);
    burst({ duration: 0.09, frequency: 700, gain });
  },
  reload() {
    tone({ frequency: 900, duration: 0.05, type: 'square', gain: 0.12 });
    tone({ frequency: 620, duration: 0.06, type: 'square', gain: 0.12, when: 0.16 });
  },
  empty() {
    tone({ frequency: 1400, duration: 0.04, type: 'square', gain: 0.1 });
  },
  hit(killed) {
    tone({ frequency: killed ? 1180 : 880, duration: 0.07, type: 'sine', gain: 0.35 });
    if (killed) tone({ frequency: 1560, duration: 0.12, type: 'sine', gain: 0.3, when: 0.07 });
  },
  hurt() {
    tone({ frequency: 220, end: 90, duration: 0.18, type: 'sawtooth', gain: 0.25 });
  },
  explosion() {
    burst({ duration: 1.1, frequency: 320, gain: 0.9 });
    tone({ frequency: 90, end: 28, duration: 1.0, type: 'sine', gain: 0.8 });
  },
  beep(fast) {
    tone({ frequency: 1250, duration: fast ? 0.05 : 0.09, type: 'square', gain: 0.18 });
  },
  plant() {
    tone({ frequency: 520, duration: 0.1, type: 'square', gain: 0.2 });
    tone({ frequency: 780, duration: 0.14, type: 'square', gain: 0.2, when: 0.12 });
  },
  defuse() {
    tone({ frequency: 780, duration: 0.1, type: 'square', gain: 0.2 });
    tone({ frequency: 520, duration: 0.16, type: 'square', gain: 0.2, when: 0.12 });
  },
  buy() {
    tone({ frequency: 980, duration: 0.08, type: 'sine', gain: 0.25 });
    tone({ frequency: 1470, duration: 0.12, type: 'sine', gain: 0.25, when: 0.08 });
  },
  roundEnd(won) {
    const notes = won ? [523, 659, 784] : [392, 330, 262];
    notes.forEach((frequency, index) => tone({ frequency, duration: 0.22, type: 'triangle', gain: 0.3, when: index * 0.14 }));
  },
};
