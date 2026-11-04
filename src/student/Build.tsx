import { useEffect, useMemo, useRef, useState } from 'react';
import type { StudentConfig } from '../api';
import { ColourSentence } from '../components/ui';
import {
  agreementOk,
  buildSentence,
  CATEGORIES,
  challengeMet,
  checkQuality,
  containsWord,
  fixAgreement,
  type Category,
  type SentenceParts,
  type WordItem,
} from '../lib/sentence';
import { isMuted, sfx } from '../lib/sounds';
import { canSpeak, speak } from '../lib/speech';
import type { Draft } from './StudentApp';

export const CAT_META: Record<Category, { label: string; icon: string; ask: string }> = {
  who: { label: 'WHO?', icon: '🧒', ask: 'Who is it?' },
  what: { label: 'WHAT HAPPENS?', icon: '⚡', ask: 'What is happening?' },
  where: { label: 'WHERE?', icon: '📍', ask: 'Where is it?' },
  when: { label: 'WHEN?', icon: '⏰', ask: 'When is it?' },
};

const rand = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

export function Build({
  config,
  draft,
  update,
  onBack,
  onNext,
}: {
  config: StudentConfig;
  draft: Draft;
  update: (p: Partial<Draft>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const byCat = useMemo(() => {
    const m: Record<Category, WordItem[]> = { who: [], what: [], where: [], when: [] };
    for (const w of config.words) m[w.category]?.push(w);
    return m;
  }, [config.words]);

  const { parts, whoPlural } = draft;
  const sentence = buildSentence(parts);
  const checks = checkQuality(parts, whoPlural);
  const allOk = checks.every((c) => c.ok);
  const agreeCheck = checks.find((c) => c.id === 'agree');
  const complete = CATEGORIES.every((c) => !!parts[c]);
  const [flash, setFlash] = useState<string | null>(null);
  const [pop, setPop] = useState(false);
  const [message, setMessage] = useState('');
  const wasComplete = useRef(complete);

  useEffect(() => {
    if (complete && !wasComplete.current) {
      sfx.complete();
      setPop(true);
      const t = setTimeout(() => setPop(false), 900);
      wasComplete.current = complete;
      return () => clearTimeout(t);
    }
    wasComplete.current = complete;
  }, [complete]);

  const say = (t: string) => {
    if (!isMuted()) speak(t);
  };

  const pick = (w: WordItem) => {
    sfx.pick(w.category);
    setMessage('');
    const next: Partial<SentenceParts> = { ...parts, [w.category]: w.text };
    const p: Partial<Draft> = { parts: next };
    if (w.category === 'who') p.whoPlural = w.is_plural;
    update(p);
    say(w.text);
  };

  const fix = () => {
    if (!parts.what) return;
    sfx.pick('what');
    const what = fixAgreement(parts.what, whoPlural);
    update({ parts: { ...parts, what } });
    say(buildSentence({ ...parts, what }));
  };

  const shuffle = () => {
    if (CATEGORIES.some((c) => byCat[c].length === 0)) return;
    sfx.shuffle();
    setMessage('');
    const who = rand(byCat.who);
    const agreeing = byCat.what.filter((w) => agreementOk(w.text, who.is_plural) !== false);
    const what = fixAgreement(rand(agreeing.length ? agreeing : byCat.what).text, who.is_plural);
    const next = { who: who.text, what, where: rand(byCat.where).text, when: rand(byCat.when).text };
    update({ parts: next, whoPlural: who.is_plural, usedShuffle: true });
    setTimeout(() => say(buildSentence(next)), 450);
  };

  const next = () => {
    const missing = checks.find((c) => !c.ok);
    if (missing) {
      sfx.oops();
      setMessage(missing.hint ?? 'Something is missing.');
      setFlash(missing.id);
      setTimeout(() => setFlash(null), 1200);
      say(missing.hint ?? '');
      return;
    }
    onNext();
  };

  const wod = config.word_of_day?.word ? config.word_of_day : null;
  const challenge = config.challenge?.title ? config.challenge : null;
  const challengeDone = complete && challengeMet(sentence, challenge);
  const wodUsed = !!wod && containsWord(sentence, wod.word);

  return (
    <div className="build">
      {(wod || challenge) && (
        <div className="extras-row">
          {wod && (
            <button className={`extra-card wod ${wodUsed ? 'met' : ''}`} onClick={() => say(`${wod.word}. ${wod.meaning ?? ''}`)}>
              <span className="extra-kicker">🌟 Word of the Day</span>
              <span className="extra-main">{wod.word}</span>
              {wod.meaning && <span className="extra-sub">{wod.meaning}</span>}
              {wodUsed && <span className="extra-tick">You used it! ✓</span>}
            </button>
          )}
          {challenge && (
            <button className={`extra-card challenge ${challengeDone ? 'met' : ''}`} onClick={() => say(challenge.title)}>
              <span className="extra-kicker">🏆 Sentence Challenge</span>
              <span className="extra-main small">{challenge.title}</span>
              {challengeDone && <span className="extra-tick">Challenge complete! ✓</span>}
            </button>
          )}
        </div>
      )}

      <section className={`preview ${pop ? 'pop' : ''} ${complete ? 'complete' : ''}`} aria-live="polite">
        <div className="preview-head">
          <span className="preview-label">🏭 My sentence</span>
          <div className="row gap">
            {canSpeak && (
              <button className="btn btn-sky" onClick={() => speak(sentence || 'Pick some words to build your sentence!')}>
                🔊 Read it to me
              </button>
            )}
            <button className="btn btn-orange" onClick={shuffle}>
              🎲 Surprise me!
            </button>
          </div>
        </div>
        <p className="preview-sentence">
          <ColourSentence parts={parts} />
        </p>
        <ul className="checker" aria-label="Sentence checker">
          {checks.map((c) => (
            <li key={c.id} className={`${c.ok ? 'ok' : 'no'} ${flash === c.id ? 'flash' : ''}`}>
              <span className="tick">{c.ok ? '✓' : '○'}</span> {c.label}
            </li>
          ))}
        </ul>
        {agreeCheck && !agreeCheck.ok && (
          <div className="agree-help" role="alert">
            <span>🤔 {agreeCheck.hint}</span>
            <button className="btn btn-primary" onClick={fix}>
              🔧 Fix it for me
            </button>
          </div>
        )}
      </section>

      <div className="word-columns">
        {CATEGORIES.map((cat) => (
          <section key={cat} className={`word-col col-${cat} ${flash === cat ? 'flash' : ''}`} aria-label={CAT_META[cat].label}>
            <h2 className="word-col-head">
              <span className="word-col-icon">{CAT_META[cat].icon}</span>
              {CAT_META[cat].label}
            </h2>
            <div className="chips">
              {byCat[cat].length === 0 && <p className="hint">No words yet.</p>}
              {byCat[cat].map((w) => {
                const selected =
                  parts[cat] === w.text || (cat === 'what' && !!parts.what && fixAgreement(w.text, whoPlural) === parts.what && parts.what !== w.text && !byCat.what.some((x) => x.text === parts.what));
                return (
                  <button
                    key={w.id}
                    className={`chip chip-${cat} ${selected ? 'selected' : ''}`}
                    onClick={() => pick(w)}
                    aria-pressed={selected}
                  >
                    {w.text}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {message && (
        <p className="error-msg center" role="alert">
          {message}
        </p>
      )}
      <div className="nav-row">
        <button className="btn btn-ghost btn-lg" onClick={onBack}>
          ← Back
        </button>
        <button className={`btn btn-primary btn-xl ${allOk ? 'glow' : 'btn-soft-disabled'}`} onClick={next}>
          Next: Photo 📸
        </button>
      </div>
    </div>
  );
}
