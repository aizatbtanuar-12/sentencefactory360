import { useState } from 'react';
import { api, type StudentConfig, type StudentHome } from '../api';
import { Mascot } from '../components/Mascot';
import { cleanName } from '../lib/sentence';
import { sfx } from '../lib/sounds';
import type { Draft } from './StudentApp';

export function Identify({
  home,
  draft,
  update,
  onBack,
  onVerified,
}: {
  home: StudentHome;
  draft: Draft;
  update: (p: Partial<Draft>) => void;
  onBack: () => void;
  onVerified: (cfg: StudentConfig) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const classes = home.classes;
  const classId = draft.classId || (classes.length === 1 ? classes[0].id : '');

  const ready = cleanName(draft.name).length > 0 && !!classId && draft.code.trim().length >= 4;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const cfg = await api.student.verify(classId, draft.code);
      update({ name: cleanName(draft.name), classId: cfg.class_id, className: cfg.class_name });
      sfx.complete();
      onVerified(cfg);
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
          <p className="hint">No classes yet. Ask your teacher to add your class in the Teacher Zone.</p>
        ) : (
          <div className="class-grid">
            {classes.map((c) => (
              <button
                type="button"
                key={c.id}
                className={`chip chip-class class-card ${classId === c.id ? 'selected' : ''}`}
                onClick={() => {
                  sfx.tap();
                  update({ classId: c.id, className: c.name });
                }}
                aria-pressed={classId === c.id}
              >
                <span className="class-teacher-photo">
                  {c.teacher_photo_url ? <img src={c.teacher_photo_url} alt="" /> : <Mascot size={40} />}
                </span>
                <span className="class-card-text">
                  <span className="class-card-name">{c.name}</span>
                  <span className="class-card-teacher">{c.teacher_name}</span>
                </span>
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
