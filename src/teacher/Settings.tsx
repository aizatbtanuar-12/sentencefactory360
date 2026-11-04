import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type AdminTeacherRow, type ClassRow, type TeacherSettings } from '../api';
import { Confirm, Modal, Spinner } from '../components/ui';
import { CATEGORIES, type Category } from '../lib/sentence';
import { CAT_META } from '../student/Build';
import { Avatar, TITLES } from './PinLogin';

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
  { key: 'profile', label: '👤 My profile' },
  { key: 'classes', label: '🔑 My classes' },
  { key: 'words', label: '🧩 Word bank' },
  { key: 'wod', label: '🌟 Word of the Day' },
  { key: 'challenge', label: '🏆 Challenge' },
  { key: 'pin', label: '🔒 My PIN' },
  { key: 'school', label: '🏫 School (admin)', admin: true },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function Settings({ onChanged }: { onChanged: () => void }) {
  const [s, setS] = useState<TeacherSettings | null>(null);
  const [error, setError] = useState('');
  const [params, setParams] = useSearchParams();
  const fromHash = window.location.hash.replace('#', '');
  const requested = (params.get('tab') || fromHash) as TabKey;
  const visible = TABS.filter((t) => !('admin' in t) || !!s?.admin);
  const tab: TabKey = visible.some((t) => t.key === requested) ? requested : 'profile';

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
        {visible.map((t) => (
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
        {tab === 'profile' && <ProfileSection s={s} reload={() => { void load(); onChanged(); }} />}
        {tab === 'classes' && <ClassesSection s={s} reload={load} />}
        {tab === 'words' && <WordBankSection s={s} reload={load} />}
        {tab === 'wod' && <WordOfDaySection s={s} reload={load} />}
        {tab === 'challenge' && <ChallengeSection s={s} reload={load} />}
        {tab === 'pin' && <PinSection onChanged={onChanged} />}
        {tab === 'school' && s.admin && <SchoolSection s={s} reload={load} />}
      </div>
    </div>
  );
}

function ProfileSection({ s, reload }: { s: TeacherSettings; reload: () => void }) {
  const p = s.profile;
  const [f, setF] = useState({
    title: p.title,
    name: p.name,
    school: p.school ?? '',
    subject: p.subject ?? '',
    welcome_message: p.welcome_message ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [flash, show] = useFlash();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    try {
      await api.teacher.updateProfile(f);
      show('Profile saved ✓');
      reload();
    } catch (e) {
      show((e as Error).message, false);
    } finally {
      setBusy(false);
    }
  };
  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      await api.teacher.setPhoto(await squarePhotoDataUrl(file, 400));
      show('Photo updated ✓');
      reload();
    } catch (err) {
      show((err as Error).message, false);
    } finally {
      setBusy(false);
    }
  };
  const removePhoto = async () => {
    await api.teacher.removePhoto();
    reload();
  };
  const preview = `${f.title} ${f.name}`.trim();

  return (
    <Section title="👤 My profile" hint="Pupils see your name and photo when they choose their class. Your name, school and subject are printed on your pupils’ cards.">
      <div className="profile-layout">
        <div className="profile-photo-col">
          <Avatar url={p.photo_url} name={p.display_name} size={140} />
          <button className="btn btn-sky" onClick={() => fileRef.current?.click()} disabled={busy}>
            📷 {p.photo_url ? 'Change photo' : 'Add photo'}
          </button>
          {p.photo_url && (
            <button className="btn btn-ghost" onClick={removePhoto} disabled={busy}>
              Remove
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="user" hidden onChange={onPhoto} />
          {p.is_admin && <span className="badge badge-soft">⭐ School admin</span>}
        </div>
        <div className="profile-form">
          <div className="form-grid-2">
            <label>
              <span className="lbl">Title</span>
              <input className="input" list="titles-p" value={f.title} onChange={set('title')} maxLength={20} />
              <datalist id="titles-p">
                {TITLES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            <label>
              <span className="lbl">Name</span>
              <input className="input" value={f.name} onChange={set('name')} maxLength={40} />
            </label>
            <label>
              <span className="lbl">School</span>
              <input className="input" value={f.school} onChange={set('school')} maxLength={80} placeholder="e.g. SK Taman Permata" />
            </label>
            <label>
              <span className="lbl">Subject</span>
              <input className="input" value={f.subject} onChange={set('subject')} maxLength={40} placeholder="e.g. English" />
            </label>
          </div>
          <label>
            <span className="lbl">Welcome message for my pupils (shown on the build screen)</span>
            <textarea
              className="input textarea"
              value={f.welcome_message}
              onChange={set('welcome_message')}
              maxLength={140}
              rows={2}
              placeholder="e.g. Hello 3 Bestari! Let’s build great sentences!"
            />
          </label>
          <p className="muted small">Pupils will see: <strong>{preview || '—'}</strong></p>
          <button className="btn btn-primary" onClick={save} disabled={busy || !f.name.trim()}>
            Save profile
          </button>
          {flash}
        </div>
      </div>
    </Section>
  );
}

/** Centre-crop an image file to a square JPEG data URL. */
async function squarePhotoDataUrl(file: File, size: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('That file is not a photo.'));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = Math.min(size, side);
    c.getContext('2d')!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ClassesSection({ s, reload }: { s: TeacherSettings; reload: () => void }) {
  const classes: ClassRow[] = s.classes;
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
    <Section title="🔑 My classes & access codes" hint="Pupils pick your class (they see your name next to it) and type its code. Only you can see these classes and their pupils’ work.">
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
      <label className="toggle">
        <input
          type="checkbox"
          checked={s.photo_required}
          onChange={async (e) => {
            await run(() => api.teacher.updateSettings({ photo_required: e.target.checked }), 'Saved ✓');
          }}
        />
        <span>Photo is required for my pupils (turn off to let them skip the selfie, e.g. without photo consent)</span>
      </label>
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
    <Section id="pin" title="🔒 Change my PIN" hint="4 to 8 digits. The PIN is checked on the server and stored only as a secure hash.">
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

function SchoolSection({ s, reload }: { s: TeacherSettings; reload: () => void }) {
  const a = s.admin!;
  const [name, setName] = useState(s.school_name);
  const [code, setCode] = useState(a.registration_code ?? '');
  const [resetFor, setResetFor] = useState<AdminTeacherRow | null>(null);
  const [newPin, setNewPin] = useState('');
  const [removeFor, setRemoveFor] = useState<AdminTeacherRow | null>(null);
  const [flash, show] = useFlash();
  const run = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      show(ok);
      reload();
    } catch (e) {
      show((e as Error).message, false);
    }
  };
  const gen = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => chars[b % chars.length]).join('');
  };
  return (
    <>
      <Section title="🏫 School" hint="Only school admins see this tab.">
        <div className="form-row">
          <label className="grow">
            <span className="lbl">School / site name (shown on the welcome screen)</span>
            <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={!name.trim() || name === s.school_name} onClick={() => run(() => api.teacher.schoolUpdate({ school_name: name }), 'Saved ✓')}>
            Save
          </button>
        </div>
        <div className="form-row">
          <label className="grow">
            <span className="lbl">School code — teachers need this to sign up</span>
            <input className="input code" value={code} maxLength={30} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="at least 6 letters/numbers" />
          </label>
          <button className="btn btn-ghost" onClick={() => setCode(gen())}>
            🎲 Make code
          </button>
          <button
            className="btn btn-primary"
            disabled={code.length < 6 || code === (a.registration_code ?? '')}
            onClick={() => run(() => api.teacher.schoolUpdate({ registration_code: code }), 'School code saved ✓')}
          >
            Save code
          </button>
        </div>
        {!a.registration_code && (
          <p className="warn-text">No school code set yet — new teachers currently sign up with the setup code (INITIAL_TEACHER_PIN). Set your own code above.</p>
        )}
        {flash}
      </Section>
      <Section title={`🧑‍🏫 Teachers (${a.teachers.length})`} hint="Each teacher has their own classes, pupils, word bank and cards. Removing a teacher permanently deletes all of their pupils’ work.">
        <div className="table-wrap">
          <table className="sub-table">
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Subject</th>
                <th>Classes</th>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {a.teachers.map((t) => (
                <tr key={t.id} style={{ cursor: 'default' }}>
                  <td className="strong">
                    {t.display_name}
                    {t.id === s.profile.id && <span className="muted"> (you)</span>}
                  </td>
                  <td>{t.subject ?? '—'}</td>
                  <td>{t.class_count}</td>
                  <td>{t.is_admin ? <span className="badge badge-soft">Admin</span> : 'Teacher'}</td>
                  <td>
                    <div className="row gap wrap">
                      <button className="btn btn-ghost btn-sm" onClick={() => { setResetFor(t); setNewPin(''); }}>
                        🔑 Reset PIN
                      </button>
                      {t.id !== s.profile.id && (
                        <button className="btn btn-ghost btn-sm" onClick={() => run(() => api.teacher.setAdmin(t.id, !t.is_admin), t.is_admin ? 'Admin removed' : 'Made admin ✓')}>
                          {t.is_admin ? 'Remove admin' : '⭐ Make admin'}
                        </button>
                      )}
                      {t.id !== s.profile.id && (
                        <button className="btn btn-ghost btn-sm danger-text" onClick={() => setRemoveFor(t)}>
                          🗑️ Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      {resetFor && (
        <Modal onClose={() => setResetFor(null)}>
          <h2 className="modal-title">Reset PIN for {resetFor.display_name}</h2>
          <p className="modal-text">Tell them the new PIN; they can change it in Settings → My PIN.</p>
          <input
            className="pin-display"
            type="password"
            inputMode="numeric"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="New PIN"
            aria-label="New PIN"
            autoFocus
          />
          <div className="row gap center">
            <button className="btn btn-ghost" onClick={() => setResetFor(null)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!/^\d{4,8}$/.test(newPin)}
              onClick={() => {
                const t = resetFor;
                setResetFor(null);
                void run(() => api.teacher.resetTeacherPin(t.id, newPin), `PIN reset for ${t.display_name} ✓`);
              }}
            >
              Reset PIN
            </button>
          </div>
        </Modal>
      )}
      {removeFor && (
        <Confirm
          title={`Remove ${removeFor.display_name}?`}
          message="This permanently deletes their account, classes, word bank and ALL their pupils’ photos and recordings. Printed QR codes for their pupils will stop working."
          yes="Remove teacher"
          danger
          onYes={() => {
            const t = removeFor;
            setRemoveFor(null);
            void run(() => api.teacher.removeTeacher(t.id), `${t.display_name} removed`);
          }}
          onNo={() => setRemoveFor(null)}
        />
      )}
    </>
  );
}
