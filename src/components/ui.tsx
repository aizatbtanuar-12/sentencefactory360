import { Fragment, useEffect, type ReactNode } from 'react';
import { useOnline } from '../lib/hooks';
import { buildSentence, type SentenceParts } from '../lib/sentence';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline-banner" role="alert">
      📡 No internet connection. Your work is safe here — we'll send it when the Wi-Fi is back.
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <div className="spinner" />
      {label && <p>{label}</p>}
    </div>
  );
}

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Confirm({
  title,
  message,
  yes = 'Yes',
  no = 'Cancel',
  danger,
  onYes,
  onNo,
}: {
  title: string;
  message?: string;
  yes?: string;
  no?: string;
  danger?: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <Modal onClose={onNo}>
      <h2 className="modal-title">{title}</h2>
      {message && <p className="modal-text">{message}</p>}
      <div className="row gap center mt">
        <button className="btn btn-ghost" onClick={onNo}>
          {no}
        </button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onYes} autoFocus>
          {yes}
        </button>
      </div>
    </Modal>
  );
}

/** The sentence with each part in its factory colour. */
export function ColourSentence({ parts, placeholder = true }: { parts: Partial<SentenceParts>; placeholder?: boolean }) {
  const full = buildSentence(parts);
  const segs: [keyof SentenceParts, string | undefined, string][] = [
    ['who', parts.who, 'Who?'],
    ['what', parts.what, 'What happens?'],
    ['where', parts.where, 'Where?'],
    ['when', parts.when, 'When?'],
  ];
  let first = true;
  return (
    <span className="colour-sentence" aria-label={full}>
      {segs.map(([k, v, ph], i) => {
        if (!v && !placeholder) return null;
        let text = v ?? '';
        if (v && first) {
          text = text.charAt(0).toUpperCase() + text.slice(1);
          first = false;
        }
        const last = i === 3;
        return (
          <Fragment key={k}>
            {i > 0 && ' '}
            <span className={`seg seg-${k} ${v ? '' : 'seg-empty'}`}>
              {v ? text : ph}
              {last && v ? '.' : ''}
            </span>
          </Fragment>
        );
      })}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const label = status === 'approved' ? '✓ Approved' : status === 'rejected' ? '✕ Rejected' : '● Pending';
  return <span className={`badge badge-${status}`}>{label}</span>;
}

/** <audio controls> that works around Chrome recordings reporting an "Infinity" duration. */
export function AudioPlayer(props: React.AudioHTMLAttributes<HTMLAudioElement>) {
  const onMeta = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const a = e.currentTarget;
    if (a.duration === Infinity) {
      const reset = () => {
        a.removeEventListener('timeupdate', reset);
        a.currentTime = 0;
      };
      a.addEventListener('timeupdate', reset);
      a.currentTime = 1e101;
    }
  };
  return <audio controls preload="metadata" {...props} onLoadedMetadata={onMeta} />;
}
