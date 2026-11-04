import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type ClassRow, type TeacherSettings } from '../api';
import { Confirm, Spinner } from '../components/ui';
import { CATEGORIES, type Category } from '../lib/sentence';
import { CAT_META } from '../student/Build';

function Section({ id, title, children, hint }: { id?: string; title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="card-section" id={id}>
      <h2>{title}</h2>
      {hint && <p className="muted">{hint}</p>}
      {children}
    </section>
  );
}

function useFlash() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const show = useCallback((text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }, []);
  const el = msg ? <p className={msg.ok ? 'ok-msg' : 'error-msg'}>{msg.text}</p> : null;
  return [el, show] as const;
}

const CHALLENGE_PRESETS = [
  { title: 'Build a sentence using the word “___”', required_word: '' },
  { title: 'Make a sentence about an animal', required_word: '' },
  { title: 'Describe something happening at school', required_word: '' },
  { title: 'Build a longer sentence (10 words or more)', required_word: '', min_words: 10 },
];

const TABS = [
  { key: 'classroom', label: '🏫 Classroom' },
  { key: 'classes', label: '🔑 Classes & codes' },
  { key: 'words', label: '🧩 Word bank' },
  { key: 'wod', label: '🌟 Word of the Day' },
  { key: 'challenge', label: '🏆 Challenge' },
  { key: 'pin', label: '🔒 Teacher PIN' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function Settings({ onPinChanged }: { onPinChanged: () => void }) {
  const [s, setS] = useState<TeacherSettings | null>(null);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const fromHash = window.location.hash.replace('#', '');
  const requested = (params.get('tab') || fromHash) as TabKey;
  const tab: TabKey = TABS.some((t) => t.key === requested) ? requested : 'classroom';

  const load = useCallback(async () => {
    try {
      setS(await api.teacher.getSettings());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const choose = (k: TabKey) => setParams({ tab: k }, { replace: true });

  if (error) return <p className="error-msg">{error}</p>;
  if (!s) return <Spinner />;

  return (
    <div className="settings">
      <h1 className="page-title">Settings</h1>
      <div className="sub-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? 'active' : ''}
            onClick={() => choose(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'classroom' && <ClassroomSection s={s} reload={load} />}
        {tab === 'classes' && <ClassesSection classes={s.classes} reload={load} />}
        {tab === 'words' && <WordBankSection s={s} reload={load} />}
        {tab === 'wod' && <WordOfDaySection s={s} reload={load} />}
        {tab === 'challenge' && <ChallengeSection s={s} reload={load} />}
        {tab === 'pin' && <PinSection onChanged={onPinChanged} />}
      </div>
    </div>
  );
}

function ClassroomSection({ s, reload }: { s: TeacherSettings; reload: () => void }) {
  const [name, setName] = useState(s.classroom_name);
  const [flash, show] = useFlash();
  const save = async (patch: Parameters<typeof api.teacher.updateSettings>[0]) => {
    try {
      await api.teacher.updateSettings(patch);
      show('Saved ✓');
      reload();
    } catch (e) {
      show((e as Error).message, false);
    }
  };
  return (
    <Section title="🏫 Classroom">
      <div className="form-row">
        <label className="grow">
          <span className="lbl">Classroom name (shown on the welcome screen and cards)</span>
          <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={() => save({ classroom_name: name })} disabled={!name.trim() || name === s.classroom_name}>
          Save
        </button>
      </div>
      <label className="toggle">
        <input type="checkbox" checked={s.photo_required} onChange={(e) => save({ photo_required: e.target.checked })} />
        <span>Photo is required (turn off to let pupils skip the selfie, e.g. without photo consent)</span>
      </label>
      {flash}
    </Section>
  );
}

function ClassesSection({ classes, reload }: { classes: ClassRow[]; reload: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [edit, setEdit] = useState<ClassRow | null>(null);
  const [del, setDel] = useState<ClassRow | null>(null);
  const [flash, show] = useFlash();
  const run = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      show(ok);
      reload();
      return true;
    } catch (e) {
      show((e as Error).message, false);
      return false;
    }
  };
  const genCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => chars[b % chars.length]).join('');
  };
  return (
    <Section title="🔑 Classes & access codes" hint="Pupils pick their class and type its code. Give the code to your pupils (or type it in for them).">
      <ul className="class-list">
        {classes.map((c) =>
          edit?.id === c.id ? (
            <li key={c.id} className="form-row">
              <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} aria-label="Class name" />
              <input
                className="input code"
                value={edit.access_code}
                onChange={(e) => setEdit({ ...edit, access_code: e.target.value.toUpperCase().replace(/\s/g, '') })}
                aria-label="Access code"
              />
              <button className="btn btn-primary" onClick={async () => (await run(() => api.teacher.classUpdate(c.id, edit.name, edit.access_code), 'Class saved ✓')) && setEdit(null)}>
                Save
              </button>
              <button className="btn btn-ghost" onClick={() => setEdit(null)}>
                Cancel
              </button>
            </li>
          ) : (
            <li key={c.id} className="class-item">
              <strong>{c.name}</strong>
              <code className="code-pill">{c.access_code}</code>
              <span className="grow" />
              <button className="btn btn-ghost" onClick={() => setEdit(c)}>
                ✏️ Edit
              </button>
              <button className="btn btn-ghost danger-text" onClick={() => setDel(c)}>
                🗑️
              </button>
            </li>
          ),
        )}
      </ul>
      <div className="form-row">
        <input className="input" placeholder="New class, e.g. 3 Cemerlang" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <input
          className="input code"
          placeholder="Code"
          value={code}
          maxLength={20}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))}
        />
        <button className="btn btn-ghost" onClick={() => setCode(genCode())} type="button">
          🎲 Make code
        </button>
        <button
          className="btn btn-primary"
          disabled={!name.trim() || code.length < 4}
          onClick={async () => (await run(() => api.teacher.classAdd(name, code), 'Class added ✓')) && (setName(''), setCode(''))}
        >
          + Add class
        </button>
      </div>
      {flash}
      {del && (
        <Confirm
          title={`Delete class “${del.name}”?`}
          message="Pupils won't be able to choose this class any more. Their existing submissions are kept."
          yes="Delete"
          danger
          onYes={() => {
            void run(() => api.teacher.classDelete(del.id), 'Class deleted');
            setDel(null);
          }}
          onNo={() => setDel(null)}
        />
      )}
    </Section>
  );
}

function WordBankSection({ s, reload }: { s: TeacherSettings; reload: () => void }) {
  const [text, setText] = useState<Record<Category, string>>({ who: '', what: '', where: '', when: '' });
  const [plural, setPlural] = useState(false);
  const [flash, show] = useFlash();
  const add = async (cat: Category) => {
    try {
      await api.teacher.wordAdd(cat, text[cat], cat === 'who' && plural);
      setText({ ...text, [cat]: '' });
      setPlural(false);
      show('Word added ✓');
      reload();
    } catch (e) {
      show((e as Error).message, false);
    }
  };
  const remove = async (id: string) => {
    try {
      await api.teacher.wordDelete(id);
      reload();
    } catch (e) {
      show((e as Error).message, false);
    }
  };
  const placeholders: Record<Category, string> = {
    who: 'e.g. The cat',
    what: 'e.g. is eating rice',
    where: 'e.g. at the beach',
    when: 'e.g. on Monday',
  };
  return (
    <Section
      title="🧩 Word bank"
      hint="Tip: WHAT HAPPENS phrases should start with “is” or “are”. Mark WHO words that mean more than one (like “My friends”) so the checker can help with is/are."
    >
      <div className="wb-grid">
        {CATEGORIES.map((cat) => (
          <div key={cat} className={`wb-col col-${cat}`}>
            <h3>
              {CAT_META[cat].icon} {CAT_META[cat].label}
            </h3>
            <ul>
              {s.words
                .filter((w) => w.category === cat)
                .map((w) => (
                  <li key={w.id} className={`wb-chip chip-${cat}`}>
                    <span>
                      {w.text}
                      {w.is_plural && <em className="plural-tag"> (many)</em>}
                    </span>
                    <button onClick={() => remove(w.id)} aria-label={`Remove ${w.text}`}>
                      ✕
                    </button>
                  </li>
                ))}
            </ul>
            <form
              className="wb-add"
              onSubmit={(e) => {
                e.preventDefault();
                if (text[cat].trim()) void add(cat);
              }}
            >
              <input className="input" placeholder={placeholders[cat]} value={text[cat]} maxLength={60} onChange={(e) => setText({ ...text, [cat]: e.target.value })} />
              {cat === 'who' && (
                <label className="toggle small">
                  <input type="checkbox" checked={plural} onChange={(e) => setPlural(e.target.checked)} /> more than one (uses “are”)
                </label>
              )}
              <button className="btn btn-primary" disabled={!text[cat].trim()}>
                + Add
              </button>
            </form>
          </div>
        ))}
      </div>
      {flash}
    </Section>
  );
}

function WordOfDaySection({ s, reload }: { s: TeacherSettings; reload: () => void }) {
  const [word, setWord] = useState(s.word_of_day?.word ?? '');
  const [meaning, setMeaning] = useState(s.word_of_day?.meaning ?? '');
  const [flash, show] = useFlash();
  const save = async (clear = false) => {
    try {
      await api.teacher.updateSettings({ word_of_day: clear ? null : { word: word.trim(), meaning: meaning.trim() || null } });
      if (clear) {
        setWord('');
        setMeaning('');
      }
      show(clear ? 'Cleared' : 'Word of the Day saved ✓');
      reload();
    } catch (e) {
      show((e as Error).message, false);
    }
  };
  const inBank = s.words.some((w) => w.text.toLowerCase().split(/\s+/).includes(word.trim().toLowerCase()));
  return (
    <Section title="🌟 Word of the Day" hint="Shown on the build screen. Pupils earn “Creative Word Builder!” when their sentence uses it.">
      <div className="form-row">
        <input className="input" placeholder="Word, e.g. garden" value={word} maxLength={30} onChange={(e) => setWord(e.target.value)} />
        <input className="input grow" placeholder="Meaning (optional), e.g. a place where plants grow" value={meaning} maxLength={120} onChange={(e) => setMeaning(e.target.value)} />
        <button className="btn btn-primary" disabled={!word.trim()} onClick={() => save()}>
          Save
        </button>
        {s.word_of_day && (
          <button className="btn btn-ghost" onClick={() => save(true)}>
            Clear
          </button>
        )}
      </div>
      {word.trim() && !inBank && <p className="warn-text">Heads up: no word-bank phrase contains “{word.trim()}” yet — add one so pupils can use it.</p>}
      {flash}
    </Section>
  );
}

function ChallengeSection({ s, reload }: { s: TeacherSettings; reload: () => void }) {
  const [title, setTitle] = useState(s.challenge?.title ?? '');
  const [req, setReq] = useState(s.challenge?.required_word ?? '');
  const [min, setMin] = useState(s.challenge?.min_words ? String(s.challenge.min_words) : '');
  const [flash, show] = useFlash();
  const save = async (clear = false) => {
    try {
      await api.teacher.updateSettings({
        challenge: clear ? null : { title: title.trim(), required_word: req.trim() || null, min_words: min ? Number(min) : null },
      });
      if (clear) {
        setTitle('');
        setReq('');
        setMin('');
      }
      show(clear ? 'Challenge turned off' : 'Challenge saved ✓');
      reload();
    } catch (e) {
      show((e as Error).message, false);
    }
  };
  return (
    <Section title="🏆 Sentence Challenge (optional)" hint="Pupils who meet the challenge earn “Sentence Superstar!”. Leave the rules empty for a free-choice challenge.">
      <div className="preset-row">
        {CHALLENGE_PRESETS.map((p) => (
          <button
            key={p.title}
            className="chip chip-mini"
            onClick={() => {
              setTitle(p.title);
              setReq(p.required_word);
              setMin(p.min_words ? String(p.min_words) : '');
            }}
          >
            {p.title}
          </button>
        ))}
      </div>
      <div className="form-row">
        <input className="input grow" placeholder="Challenge text pupils will see" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
        <input className="input" placeholder="Must use word (optional)" value={req} maxLength={30} onChange={(e) => setReq(e.target.value)} />
        <input className="input small-input" type="number" min={1} max={30} placeholder="Min words" value={min} onChange={(e) => setMin(e.target.value)} />
      </div>
      {title.includes('___') && <p className="warn-text">Replace “___” with the word you want, and type it in “Must use word”.</p>}
      <div className="row gap">
        <button className="btn btn-primary" disabled={!title.trim()} onClick={() => save()}>
          Save challenge
        </button>
        {s.challenge && (
          <button className="btn btn-ghost" onClick={() => save(true)}>
            Turn off
          </button>
        )}
      </div>
      {flash}
    </Section>
  );
}

function PinSection({ onChanged }: { onChanged: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [flash, show] = useFlash();
  const valid = /^\d{4,8}$/.test(next) && next === again && cur.length >= 4;
  const save = async () => {
    try {
      await api.teacher.changePin(cur, next);
      setCur('');
      setNext('');
      setAgain('');
      show('PIN changed ✓ Other devices have been signed out.');
      onChanged();
    } catch (e) {
      show((e as Error).message, false);
    }
  };
  const pinInput = (v: string, set: (s: string) => void, label: string) => (
    <label>
      <span className="lbl">{label}</span>
      <input
        className="input"
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        value={v}
        maxLength={8}
        onChange={(e) => set(e.target.value.replace(/\D/g, ''))}
      />
    </label>
  );
  return (
    <Section id="pin" title="🔒 Change teacher PIN" hint="4 to 8 digits. The PIN is checked on the server and stored only as a secure hash.">
      <div className="form-row">
        {pinInput(cur, setCur, 'Current PIN')}
        {pinInput(next, setNext, 'New PIN')}
        {pinInput(again, setAgain, 'New PIN again')}
        <button className="btn btn-primary" disabled={!valid} onClick={save}>
          Change PIN
        </button>
      </div>
      {next && again && next !== again && <p className="warn-text">The new PINs don't match.</p>}
      {flash}
    </Section>
  );
}
