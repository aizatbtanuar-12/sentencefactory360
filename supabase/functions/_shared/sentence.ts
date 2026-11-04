// Shared sentence logic (server copy).
// NOTE: an identical copy lives in src/lib/sentence.ts so the browser previews
// the same sentence the server saves. If you change one, copy it to the other.

export type Category = 'who' | 'what' | 'where' | 'when';

export const CATEGORIES: Category[] = ['who', 'what', 'where', 'when'];

export interface WordItem {
  id: string;
  category: Category;
  text: string;
  is_plural: boolean;
  sort_order: number;
}

export interface SentenceParts {
  who: string;
  what: string;
  where: string;
  when: string;
}

export interface Challenge {
  title: string;
  required_word?: string | null;
  min_words?: number | null;
}

export interface WordOfDay {
  word: string;
  meaning?: string | null;
  date?: string | null;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/, '');

/** Join the four parts into one sentence with a capital letter and a full stop. */
export function buildSentence(p: Partial<SentenceParts>): string {
  const words = [p.who, p.what, p.where, p.when].map((x) => clean(x ?? '')).filter(Boolean);
  if (!words.length) return '';
  let s = words.join(' ');
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s + '.';
}

export function countWords(s: string): number {
  return s.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length;
}

/** The helping verb at the start of a WHAT phrase, if any. */
function leadingVerb(what: string): 'is' | 'are' | 'was' | 'were' | null {
  const m = clean(what).toLowerCase().match(/^(is|are|was|were)\b/);
  return (m?.[1] as 'is' | 'are' | 'was' | 'were') ?? null;
}

/** Does WHO agree with the helping verb in WHAT? (null = nothing to check) */
export function agreementOk(what: string, whoIsPlural: boolean): boolean | null {
  const v = leadingVerb(what);
  if (!v) return null;
  const plural = v === 'are' || v === 'were';
  return plural === whoIsPlural;
}

/** Swap is↔are / was↔were so WHAT agrees with WHO. */
export function fixAgreement(what: string, whoIsPlural: boolean): string {
  const t = clean(what);
  const v = leadingVerb(t);
  if (!v) return t;
  const swap: Record<string, string> = whoIsPlural
    ? { is: 'are', was: 'were', are: 'are', were: 'were' }
    : { are: 'is', were: 'was', is: 'is', was: 'was' };
  return swap[v] + t.slice(v.length);
}

export function containsWord(sentence: string, word: string): boolean {
  const w = word.trim().toLowerCase();
  if (!w) return false;
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`, 'i').test(sentence);
}

export function challengeMet(sentence: string, c: Challenge | null | undefined): boolean {
  if (!c || !c.title) return false;
  if (c.required_word && !containsWord(sentence, c.required_word)) return false;
  if (c.min_words && countWords(sentence) < c.min_words) return false;
  // A challenge with no measurable rule (e.g. "Describe something at school") counts when the sentence is complete.
  return true;
}

export interface QualityCheck {
  id: string;
  label: string;
  ok: boolean;
  hint?: string;
}

/** The friendly "Sentence Quality Checker". */
export function checkQuality(p: Partial<SentenceParts>, whoIsPlural: boolean): QualityCheck[] {
  const s = buildSentence(p);
  const checks: QualityCheck[] = [
    { id: 'who', label: 'Who?', ok: !!p.who, hint: 'Pick WHO is in your sentence.' },
    { id: 'what', label: 'What happens?', ok: !!p.what, hint: 'Pick WHAT is happening.' },
    { id: 'where', label: 'Where?', ok: !!p.where, hint: 'Pick WHERE it happens.' },
    { id: 'when', label: 'When?', ok: !!p.when, hint: 'Pick WHEN it happens.' },
    { id: 'capital', label: 'Capital letter', ok: !!s && /^[A-Z]/.test(s), hint: 'Sentences start with a capital letter.' },
    { id: 'stop', label: 'Full stop', ok: !!s && s.endsWith('.'), hint: 'Sentences end with a full stop.' },
  ];
  if (p.who && p.what) {
    const agree = agreementOk(p.what, whoIsPlural);
    if (agree !== null) {
      checks.push({
        id: 'agree',
        label: whoIsPlural ? '"are" for many' : '"is" for one',
        ok: agree,
        hint: whoIsPlural
          ? `"${clean(p.who)}" means more than one, so we use "are".`
          : `"${clean(p.who)}" is just one, so we use "is".`,
      });
    }
  }
  return checks;
}

export function cleanName(s: string): string {
  return s.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}
