import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, isDemo } from '../api';
import { Mascot } from '../components/Mascot';

export function PinLogin() {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const press = (d: string) => {
    setError('');
    setPin((p) => (p.length < 8 ? p + d : p));
  };

  const submit = async () => {
    if (pin.length < 4 || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.teacher.login(pin);
    } catch (e) {
      setError((e as Error).message);
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pin-page">
      <div className="pin-card">
        <Mascot size={90} mood="think" />
        <h1>Teacher Zone</h1>
        <p className="muted">Enter your teacher PIN</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
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
        {isDemo && <p className="muted small">Demo mode PIN: 1234</p>}
        <Link to="/" className="link-btn">
          ← Back to students
        </Link>
      </div>
    </div>
  );
}
