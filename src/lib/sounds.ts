// "Sentence Sound Factory": tiny synthesised sound effects (no audio files to download).
let ctx: AudioContext | null = null;
const MUTE_KEY = 'sf360.muted';

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
export function setMuted(m: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function ac(): AudioContext | null {
  if (isMuted()) return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, slideTo?: number) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

const CAT_NOTES: Record<string, number> = { who: 523, what: 587, where: 659, when: 784 };

export const sfx = {
  /** A mechanical "clunk-ding" — a part dropping into the machine. */
  pick(cat: string) {
    tone(110, 0, 0.09, 'square', 0.06, 70);
    tone(CAT_NOTES[cat] ?? 600, 0.05, 0.22, 'triangle', 0.14);
  },
  tap() {
    tone(420, 0, 0.06, 'triangle', 0.08);
  },
  shuffle() {
    [0, 1, 2, 3, 4, 5].forEach((i) => tone(300 + i * 90, i * 0.045, 0.06, 'square', 0.04));
    tone(880, 0.3, 0.25, 'triangle', 0.12);
  },
  complete() {
    tone(523, 0, 0.14, 'triangle');
    tone(659, 0.1, 0.14, 'triangle');
    tone(784, 0.2, 0.3, 'triangle');
  },
  shutter() {
    tone(1800, 0, 0.04, 'square', 0.05);
    tone(600, 0.04, 0.08, 'square', 0.05, 200);
  },
  beep() {
    tone(660, 0, 0.12, 'sine', 0.12);
  },
  oops() {
    tone(330, 0, 0.12, 'triangle', 0.1, 250);
    tone(250, 0.12, 0.18, 'triangle', 0.1, 200);
  },
  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.25, 'triangle', 0.13));
    tone(1047, 0.5, 0.6, 'triangle', 0.12);
    tone(1319, 0.5, 0.6, 'sine', 0.06);
  },
};
