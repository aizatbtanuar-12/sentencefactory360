import { useState } from 'react';
import { api, type StudentConfig } from '../api';
import { Mascot } from '../components/Mascot';
import { cleanName } from '../lib/sentence';
import { sfx } from '../lib/sounds';
import type { Draft } from './StudentApp';

export function Identify({
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const classes = config.classes;
  const className = draft.className || (classes.length === 1 ? classes[0] : '');

  const ready = cleanName(draft.name).length > 0 && !!className && draft.code.trim().length >= 4;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.student.verify(className, draft.code);
      update({ name: cleanName(draft.name), className: r.class_name });
      sfx.complete();
      onNext();
    } catch (err) {
      sfx.oops();
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel id-panel" onSubmit={submit}>
      <div className="speech-row">
        <Mascot size={96} mood="happy" />
        <div className="bubble">Hello! Tell me about you.</div>
      </div>

      <label className="field">
        <span className="field-label">✏️ My name</span>
        <input
          className="input-xl"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value.slice(0, 40) })}
          placeholder="Type your name"
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          maxLength={40}
          autoFocus
        />
      </label>

      <div className="field">
        <span className="field-label">🏫 My class</span>
        {classes.length === 0 ? (
          <p className="hint">Your teacher has not added a class yet.</p>
        ) : (
          <div className="class-grid">
            {classes.map((c) => (
              <button
                type="button"
                key={c}
                className={`chip chip-class ${className === c ? 'selected' : ''}`}
                onClick={() => {
                  sfx.tap();
                  update({ className: c });
                }}
                aria-pressed={className === c}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="field">
        <span className="field-label">🔑 Classroom code</span>
        <input
          className="input-xl input-code"
          value={draft.code}
          onChange={(e) => update({ code: e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 20) })}
          placeholder="Ask your teacher"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
        />
      </label>

      {error && (
        <p className="error-msg" role="alert">
          {error}
        </p>
      )}

      <div className="nav-row">
        <button type="button" className="btn btn-ghost btn-lg" onClick={onBack}>
          ← Back
        </button>
        <button type="submit" className="btn btn-primary btn-xl" disabled={!ready || busy}>
          {busy ? 'Checking…' : "Let's build! →"}
        </button>
      </div>
    </form>
  );
}
