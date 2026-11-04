import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, type Submission } from '../api';
import { SentenceCard } from '../components/SentenceCard';
import { Spinner } from '../components/ui';
import { cardsToPdf } from '../lib/pdf';
import { qrDataUrl, shareUrl } from '../lib/qr';

export function CardPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const cls = params.get('class') ?? '';
  const [cards, setCards] = useState<Submission[] | null>(null);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [classroom, setClassroom] = useState('');
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [imagesReady, setImagesReady] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [list, settings] = await Promise.all([
          api.teacher.cards(id ? { ids: [id] } : { class_name: cls }),
          api.teacher.getSettings(),
        ]);
        setClassroom(settings.classroom_name);
        if (id && list.length === 0) throw new Error('This submission is not approved yet, so it cannot be printed.');
        const q: Record<string, string> = {};
        await Promise.all(list.map(async (s) => s.share_token && (q[s.id] = await qrDataUrl(shareUrl(s.share_token)))));
        setQrs(q);
        setCards(list);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [id, cls]);

  // Wait for photos to finish loading so the print/PDF isn't missing pictures.
  useEffect(() => {
    if (!cards || !sheet.current) return;
    const imgs = Array.from(sheet.current.querySelectorAll('img'));
    let n = imgs.filter((i) => !i.complete).length;
    if (n === 0) return setImagesReady(true);
    const done = () => --n <= 0 && setImagesReady(true);
    imgs.forEach((i) => !i.complete && (i.addEventListener('load', done, { once: true }), i.addEventListener('error', done, { once: true })));
  }, [cards]);

  const pdf = async () => {
    if (!sheet.current || !cards?.length) return;
    setPdfBusy(true);
    try {
      const els = Array.from(sheet.current.querySelectorAll<HTMLElement>('.a6-card'));
      const name = cards.length === 1 ? `sentence-card-${cards[0].pupil_name.replace(/\W+/g, '-')}` : `sentence-cards${cls ? '-' + cls.replace(/\W+/g, '-') : ''}`;
      await cardsToPdf(els, `${name}.pdf`);
    } catch (e) {
      setError('Could not make the PDF: ' + (e as Error).message + '. You can use Print → Save as PDF instead.');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="card-page">
      <div className="toolbar no-print">
        <Link to={id ? '/teacher/submissions' : '/teacher/gallery'} className="btn btn-ghost">
          ← Back
        </Link>
        <h1 className="page-title inline">{id ? 'Printable sentence card' : `Print cards${cls ? ` · ${cls}` : ''}`}</h1>
        <div className="row gap">
          <button className="btn btn-primary" onClick={() => window.print()} disabled={!cards?.length || !imagesReady}>
            🖨️ Print
          </button>
          <button className="btn btn-orange" onClick={pdf} disabled={!cards?.length || pdfBusy || !imagesReady}>
            {pdfBusy ? 'Making PDF…' : '⬇️ Download PDF'}
          </button>
        </div>
      </div>
      <p className="muted no-print">
        Cards are A6 portrait (105 × 148 mm). In the print window choose paper size <strong>A6</strong> (or A4 and “fit to page”), margins
        <strong> None</strong>, and turn on <strong>Background graphics</strong>.
      </p>
      {error && <p className="error-msg no-print">{error}</p>}
      {!cards && !error && <Spinner label="Preparing cards…" />}
      {cards && cards.length === 0 && <p className="muted">No approved sentences to print yet.</p>}
      <div className="card-sheet" ref={sheet}>
        {cards?.map((s) => <SentenceCard key={s.id} s={s} qr={qrs[s.id] ?? null} classroomName={classroom} />)}
      </div>
    </div>
  );
}
