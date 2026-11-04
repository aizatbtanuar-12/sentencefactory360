import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Stats, type Submission } from '../api';
import { Spinner, StatusBadge } from '../components/ui';
import { formatDate } from '../lib/hooks';
import { ReviewModal } from './ReviewModal';

export function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [pending, setPending] = useState<Submission[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([api.teacher.stats(), api.teacher.list({ status: 'pending' })]);
      setStats(s);
      setPending(p);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 20_000); // new pupils keep arriving during the lesson
    return () => clearInterval(t);
  }, [load]);

  const cards: [keyof Stats, string, string][] = [
    ['total', 'Total submissions', '📦'],
    ['pending', 'Waiting for review', '⏳'],
    ['approved', 'Approved', '✅'],
    ['rejected', 'Rejected', '↩️'],
  ];

  return (
    <div>
      <h1 className="page-title">Overview</h1>
      {error && <p className="error-msg">{error}</p>}
      {!stats && !error ? (
        <Spinner />
      ) : (
        stats && (
          <div className="stat-grid">
            {cards.map(([k, label, icon]) => (
              <Link key={k} to={k === 'total' ? '/teacher/submissions' : `/teacher/submissions?status=${k}`} className={`stat-card stat-${k}`}>
                <span className="stat-icon">{icon}</span>
                <span className="stat-num">{stats[k]}</span>
                <span className="stat-label">{label}</span>
              </Link>
            ))}
          </div>
        )
      )}

      <section className="card-section">
        <div className="row between">
          <h2>⏳ Waiting for you</h2>
          <Link to="/teacher/submissions?status=pending" className="link-btn">
            See all →
          </Link>
        </div>
        {stats && pending.length === 0 && <p className="muted">Nothing to review right now. 🎉</p>}
        <ul className="sub-list">
          {pending.slice(0, 8).map((s) => (
            <li key={s.id}>
              <button className="sub-row" onClick={() => setOpen(s.id)}>
                <span className="sub-name">
                  {s.pupil_name} <span className="muted">· {s.class_name}</span>
                </span>
                <span className="sub-sentence">{s.sentence}</span>
                <span className="sub-meta">
                  {formatDate(s.created_at)} <StatusBadge status={s.status} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {open && (
        <ReviewModal
          id={open}
          queue={pending.map((p) => p.id)}
          onOpen={setOpen}
          onClose={() => setOpen(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
