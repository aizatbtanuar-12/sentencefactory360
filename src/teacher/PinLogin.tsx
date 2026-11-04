import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, isDemo, type LoginTeacher } from '../api';
import { Mascot } from '../components/Mascot';
import { Spinner } from '../components/ui';

export const TITLES = ['Teacher', 'Cikgu', 'Puan', 'Encik', 'Mrs', 'Ms', 'Mr', 'Miss', 'Dr'];

export function Avatar({ url, name, size = 64 }: { url: string | null | undefined; name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {url ? <img src={url} alt="" /> : initials || '🧑‍🏫'}
    </span>
  );
}

type Mode = 'pick' | 'pin' | 'register';

export function PinLogin() {
  const [teachers, setTeachers] = useState<LoginTeacher[] | null>(null);
  const [mode, setMode] = useState<Mode>('pick');
  const [who, setWho] = useState<LoginTeacher | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const t = await api.teacher.teachers();
      setTeachers(t);
      if (t.length === 0) setMode('register');
    } catch (e) {
      setError((e as Error).message);
      setTeachers([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const press = (d: string) => {
    setError('');
    setPin((p) => (p.length < 8 ? p + d : p));
  };

  const login = async () => {
    if (!who || pin.length < 4 || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.teacher.login(who.id, pin);
    } catch (e) {
      setError((e as Error).message);
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pin-page">
      <div className={`pin-card ${mode === 'pick' ? 'pin-card-wide' : ''} ${mode === 'register' ? 'pin-card-form' : ''}`}>
        {!teachers ? (
          <Spinner />
        ) : mode === 'pick' ? (
          <>
            <Mascot size={80} mood="happy" />
            <h1>Teacher Zone</h1>
            <p className="muted">Tap your name</p>
            <div className="teacher-pick-grid">
              {teachers.map((t) => (
                <button
                  key={t.id}
                  className="teacher-tile"
                  onClick={() => {
                    setWho(t);
                    setPin('');
                    setError('');
                    setMode('pin');
                  }}
                >
                  <Avatar url={t.photo_url} name={t.display_name} size={72} />
                  <span className="teacher-tile-name">{t.display_name}</span>
                  {t.subject && <span className="muted small">{t.subject}</span>}
                </button>
              ))}
              <button className="teacher-tile teacher-tile-new" onClick={() => { setError(''); setMode('register'); }}>
                <span className="avatar avatar-new" style={{ width: 72, height: 72 }}>
                  ＋
                </span>
                <span className="teacher-tile-name">New teacher?</span>
                <span className="muted small">Sign up</span>
              </button>
            </div>
            {error && <p className="error-msg">{error}</p>}
            {isDemo && <p className="muted small">Demo: Teacher Rina’s PIN is 1234 · school code SCHOOL1</p>}
            <Link to="/" className="link-btn">
              ← Back to students
            </Link>
          </>
        ) : mode === 'pin' && who ? (
          <>
            <Avatar url={who.photo_url} name={who.display_name} size={84} />
            <h1>{who.display_name}</h1>
            <p className="muted">Enter your PIN</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void login();
              }}
            >
              <input
                className="pin-display"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                aria-label="Teacher PIN"
                placeholder="••••"
                autoFocus
              />
              <div className="keypad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button type="button" key={d} onClick={() => press(d)}>
                    {d}
                  </button>
                ))}
                <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete">
                  ⌫
                </button>
                <button type="button" onClick={() => press('0')}>
                  0
                </button>
                <button type="submit" className="key-go" disabled={pin.length < 4 || busy} aria-label="Unlock">
                  {busy ? '…' : '✓'}
                </button>
              </div>
            </form>
            {error && <p className="error-msg">{error}</p>}
            <p className="muted small">Forgot your PIN? Ask your school admin to reset it.</p>
            <button className="link-btn" onClick={() => setMode('pick')}>
              ← Not you?
            </button>
          </>
        ) : (
          <Register
            first={teachers.length === 0}
            onBack={teachers.length ? () => setMode('pick') : undefined}
          />
        )}
      </div>
    </div>
  );
}

function Register({ first, onBack }: { first: boolean; onBack?: () => void }) {
  const [f, setF] = useState({ school_code: '', title: 'Teacher', name: '', school: '', subject: 'English', pin: '', pin2: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const pinOk = /^\d{4,8}$/.test(f.pin) && f.pin === f.pin2;
  const ready = f.school_code.trim() && f.name.trim() && pinOk;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.teacher.register({
        school_code: f.school_code.trim(),
        title: f.title,
        name: f.name.trim(),
        school: f.school.trim() || null,
        subject: f.subject.trim() || null,
        pin: f.pin,
      });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="register" onSubmit={submit}>
      <Mascot size={70} mood="cheer" />
      <h1>{first ? 'Set up the first teacher' : 'New teacher sign-up'}</h1>
      <p className="muted small">
        {first
          ? 'You will be the school admin. Use the setup code (the INITIAL_TEACHER_PIN secret) as the school code.'
          : 'Ask your school admin for the school code.'}
      </p>
      <label>
        <span className="lbl">School code</span>
        <input className="input" value={f.school_code} onChange={set('school_code')} autoCapitalize="characters" autoComplete="off" autoFocus />
      </label>
      <div className="form-grid-2">
        <label>
          <span className="lbl">Title</span>
          <input className="input" list="titles" value={f.title} onChange={set('title')} maxLength={20} />
          <datalist id="titles">
            {TITLES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label>
          <span className="lbl">Name (as pupils call you)</span>
          <input className="input" value={f.name} onChange={set('name')} maxLength={40} placeholder="e.g. Rina" />
        </label>
      </div>
      <div className="form-grid-2">
        <label>
          <span className="lbl">School</span>
          <input className="input" value={f.school} onChange={set('school')} maxLength={80} placeholder="e.g. SK Taman Permata" />
        </label>
        <label>
          <span className="lbl">Subject</span>
          <input className="input" value={f.subject} onChange={set('subject')} maxLength={40} />
        </label>
      </div>
      <div className="form-grid-2">
        <label>
          <span className="lbl">Choose a PIN (4–8 digits)</span>
          <input className="input" type="password" inputMode="numeric" autoComplete="new-password" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 8) })} />
        </label>
        <label>
          <span className="lbl">PIN again</span>
          <input className="input" type="password" inputMode="numeric" autoComplete="new-password" value={f.pin2} onChange={(e) => setF({ ...f, pin2: e.target.value.replace(/\D/g, '').slice(0, 8) })} />
        </label>
      </div>
      {f.pin && f.pin2 && f.pin !== f.pin2 && <p className="warn-text">The PINs don’t match.</p>}
      {error && <p className="error-msg">{error}</p>}
      <button className="btn btn-primary btn-lg" disabled={!ready || busy}>
        {busy ? 'Creating…' : first ? 'Create admin account' : 'Sign up'}
      </button>
      {onBack ? (
        <button type="button" className="link-btn" onClick={onBack}>
          ← Back to sign in
        </button>
      ) : (
        <Link to="/" className="link-btn">
          ← Back to students
        </Link>
      )}
    </form>
  );
}
