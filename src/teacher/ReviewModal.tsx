import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Status, type Submission } from '../api';
import { Mascot } from '../components/Mascot';
import { AudioPlayer, ColourSentence, Confirm, Modal, Spinner, StatusBadge } from '../components/ui';
import { formatDate, formatSecs } from '../lib/hooks';

export function ReviewModal({
  id,
  queue,
  onClose,
  onChanged,
  onOpen,
}: {
  id: string;
  queue?: string[]; // ids in list order, for "approve & next"
  onClose: () => void;
  onChanged: () => void;
  onOpen: (id: string) => void;
}) {
  const nav = useNavigate();
  const [s, setS] = useState<Submission | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setS(null);
    setError('');
    api.teacher.get(id).then(setS).catch((e) => setError((e as Error).message));
  }, [id]);

  const nextId = queue ? queue[queue.indexOf(id) + 1] : undefined;

  const setStatus = async (status: Status, goNext = false) => {
    if (busy || !s) return;
    setBusy(true);
    try {
      await api.teacher.setStatus(s.id, status);
      onChanged();
      if (goNext && nextId) onOpen(nextId);
      else setS(await api.teacher.get(s.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!s) return;
    setBusy(true);
    try {
      await api.teacher.remove(s.id);
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} wide>
      <button className="modal-close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      {!s && !error && <Spinner label="Loading…" />}
      {error && <p className="error-msg">{error}</p>}
      {s && (
        <div className="review">
          <div className="review-media">
            {s.photo_url ? (
              <img src={s.photo_url} alt={`Photo of ${s.pupil_name}`} className="review-photo" />
            ) : (
              <div className="review-photo placeholder">
                <Mascot size={120} />
                <span>No photo</span>
              </div>
            )}
            {s.audio_url ? (
              <AudioPlayer src={s.audio_url} className="review-audio" />
            ) : (
              <p className="muted">No recording</p>
            )}
            <span className="muted small">Recording length: {formatSecs(s.audio_duration_ms)}</span>
          </div>
          <div className="review-info">
            <div className="row gap wrap">
              <StatusBadge status={s.status} />
              {s.challenge_done && <span className="badge badge-soft">🏆 Challenge</span>}
              {s.used_word_of_day && <span className="badge badge-soft">🌟 Word of the Day</span>}
            </div>
            <h2 className="review-name">{s.pupil_name}</h2>
            <p className="muted">
              {s.class_name} · {formatDate(s.created_at)}
            </p>
            <p className="review-sentence">
              <ColourSentence parts={{ who: s.who, what: s.what_happens, where: s.where_text, when: s.when_text }} />
            </p>
            <div className="review-actions">
              <button className="btn btn-approve btn-lg" disabled={busy || s.status === 'approved'} onClick={() => setStatus('approved')}>
                ✓ Approve
              </button>
              <button className="btn btn-reject btn-lg" disabled={busy || s.status === 'rejected'} onClick={() => setStatus('rejected')}>
                ✕ Reject
              </button>
              {nextId && s.status === 'pending' && (
                <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => setStatus('approved', true)}>
                  ✓ Approve & next →
                </button>
              )}
            </div>
            <div className="review-actions">
              <button
                className="btn btn-orange"
                disabled={s.status !== 'approved'}
                title={s.status !== 'approved' ? 'Approve the submission first' : ''}
                onClick={() => nav(`/teacher/card/${s.id}`)}
              >
                🖨️ Printable card
              </button>
              {s.status !== 'pending' && (
                <button className="btn btn-ghost" disabled={busy} onClick={() => setStatus('pending')}>
                  ↺ Back to pending
                </button>
              )}
              {nextId && (
                <button className="btn btn-ghost" onClick={() => onOpen(nextId)}>
                  Skip →
                </button>
              )}
              <button className="btn btn-ghost danger-text" disabled={busy} onClick={() => setConfirmDelete(true)}>
                🗑️ Delete
              </button>
            </div>
            {s.status !== 'approved' && <p className="muted small">Only approved sentences can become printable cards.</p>}
          </div>
        </div>
      )}
      {confirmDelete && (
        <Confirm
          title="Delete this submission?"
          message="The photo and recording will be permanently deleted. A printed QR code for it will stop working."
          yes="Delete"
          danger
          onYes={() => {
            setConfirmDelete(false);
            void remove();
          }}
          onNo={() => setConfirmDelete(false)}
        />
      )}
    </Modal>
  );
}
