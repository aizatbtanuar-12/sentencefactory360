import { useEffect, useMemo, useState } from 'react';
import type { StudentConfig } from '../api';
import { Mascot } from '../components/Mascot';
import { buildSentence, challengeMet, containsWord } from '../lib/sentence';
import { isMuted } from '../lib/sounds';
import { speak } from '../lib/speech';
import type { Draft } from './StudentApp';

const AUTO_RESET_S = 60;
const CHEERS = ['Fantastic reading!', 'You are a sentence star!', 'Super speaking!', 'Brilliant building!', 'Wonderful work!'];

export function Success({ config, draft, onNext }: { config: StudentConfig; draft: Draft; onNext: () => void }) {
  const [left, setLeft] = useState(AUTO_RESET_S);
  const sentence = buildSentence(draft.parts);
  const first = draft.name.split(' ')[0] || 'friend';
  const cheer = useMemo(() => CHEERS[Math.floor(Math.random() * CHEERS.length)], []);

  // Achievements celebrate effort — they never rank or compare children.
  const badges = useMemo(() => {
    const b = [{ icon: '🧩', title: 'First Sentence Built!', text: 'You built a complete sentence.' }];
    if (draft.audioMs >= 2500) b.push({ icon: '🎤', title: 'Confident Speaker!', text: 'You read your sentence aloud.' });
    if (config.challenge?.title && challengeMet(sentence, config.challenge))
      b.push({ icon: '🏆', title: 'Sentence Superstar!', text: 'You finished the challenge.' });
    const wod = config.word_of_day?.word;
    if ((wod && containsWord(sentence, wod)) || !draft.usedShuffle)
      b.push({ icon: '🌈', title: 'Creative Word Builder!', text: wod && containsWord(sentence, wod) ? `You used “${wod}”.` : 'You chose every word yourself.' });
    return b;
  }, [config, draft, sentence]);

  useEffect(() => {
    if (!isMuted()) speak(`Well done, ${first}! ${cheer}`);
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [first, cheer]);

  useEffect(() => {
    if (left <= 0) onNext();
  }, [left, onNext]);

  return (
    <div className="success">
      <div className="confetti" aria-hidden>
        {Array.from({ length: 28 }).map((_, i) => (
          <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 0.25}s`, animationDuration: `${2.6 + (i % 5) * 0.4}s` }}>
            {['⭐', '🌟', '✨', '🎉', '💫'][i % 5]}
          </span>
        ))}
      </div>
      <Mascot size={170} mood="cheer" className="bounce" />
      <h1 className="success-title">WELL DONE, {first.toUpperCase()}!</h1>
      <p className="success-sub">Your sentence has been sent to {config.teacher.display_name}! 📬</p>
      <div className="success-sentence">“{sentence}”</div>
      <div className="badges">
        {badges.map((b, i) => (
          <div className="badge-card" key={b.title} style={{ animationDelay: `${0.3 + i * 0.25}s` }}>
            <span className="badge-icon">{b.icon}</span>
            <strong>{b.title}</strong>
            <span>{b.text}</span>
          </div>
        ))}
      </div>
      <p className="success-sub small">{cheer} When your teacher approves it, your card will go on the Learning Gallery wall.</p>
      <button className="btn btn-student" onClick={onNext}>
        👉 Next student
      </button>
      <p className="muted small">Getting ready for the next student in {left}s…</p>
    </div>
  );
}
