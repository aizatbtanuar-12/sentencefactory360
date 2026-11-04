// Read-aloud with the browser's built-in text-to-speech.
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

let voice: SpeechSynthesisVoice | null = null;
function pickVoice() {
  if (!canSpeak) return;
  const vs = speechSynthesis.getVoices();
  voice =
    vs.find((v) => /en[-_]GB/i.test(v.lang) && /female|google/i.test(v.name)) ??
    vs.find((v) => /en[-_]GB/i.test(v.lang)) ??
    vs.find((v) => /en[-_](US|AU|IN|MY|SG)/i.test(v.lang)) ??
    vs.find((v) => v.lang.toLowerCase().startsWith('en')) ??
    null;
}
if (canSpeak) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

export function speak(text: string, opts: { rate?: number; onEnd?: () => void } = {}) {
  if (!canSpeak || !text) {
    opts.onEnd?.();
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'en-GB';
  u.rate = opts.rate ?? 0.85;
  u.pitch = 1.05;
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
}
