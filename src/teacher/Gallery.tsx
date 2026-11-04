import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Submission } from '../api';
import { Mascot } from '../components/Mascot';
import { AudioPlayer, ColourSentence, Spinner } from '../components/ui';

export function Gallery() {
  const [cls, setCls] = useState('');
  const [classes, setClasses] = useState<string[]>([]);
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.teacher.getSettings().then((s) => setClasses(s.classes.map((c) => c.name))).catch(() => undefined);
  }, []);

  useEffect(() => {
    setRows(null);
    api.teacher
      .gallery(cls || undefined)
      .then((r) => {
        setRows(r);
        setError('');
      })
      .catch((e) => setError((e as Error).message));
  }, [cls]);

  return (
    <div>
      <h1 className="page-title">Digital Learning Gallery</h1>
      <div className="toolbar">
        <select value={cls} onChange={(e) => setCls(e.target.value)} className="select" aria-label="Class">
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {rows && rows.length > 0 && (
          <Link className="btn btn-orange" to={`/teacher/print${cls ? `?class=${encodeURIComponent(cls)}` : ''}`}>
            🖨️ Print all {rows.length} cards
          </Link>
        )}
      </div>
      <p className="muted">Only sentences you have approved appear here.</p>
      {error && <p className="error-msg">{error}</p>}
      {!rows && !error && <Spinner />}
      {rows && rows.length === 0 && (
        <div className="empty">
          <Mascot size={110} mood="think" />
          <p>No approved sentences yet. Approve some in Submissions.</p>
        </div>
      )}
      <div className="gallery-grid">
        {rows?.map((s) => (
          <article key={s.id} className="gallery-card">
            <div className="gallery-photo">{s.photo_url ? <img src={s.photo_url} alt={s.pupil_name} loading="lazy" /> : <Mascot size={90} />}</div>
            <div className="gallery-body">
              <div className="gallery-name">
                {s.pupil_name} <span className="muted">· {s.class_name}</span>
              </div>
              <p className="gallery-sentence">
                <ColourSentence parts={{ who: s.who, what: s.what_happens, where: s.where_text, when: s.when_text }} placeholder={false} />
              </p>
              {s.audio_url && <AudioPlayer src={s.audio_url} />}
              <Link to={`/teacher/card/${s.id}`} className="link-btn">
                🖨️ Card
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
