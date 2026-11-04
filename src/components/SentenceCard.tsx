import { useState } from 'react';
import type { Submission } from '../api';
import { ColourSentence } from './ui';
import { Mascot } from './Mascot';

/** A6 portrait learning card (105 × 148 mm). Sized in mm so print matches exactly. */
export function SentenceCard({ s, qr, classroomName }: { s: Submission; qr: string | null; classroomName?: string }) {
  const len = s.sentence.length;
  const size = len <= 45 ? 17 : len <= 60 ? 15.5 : len <= 75 ? 14 : 12.5;
  return (
    <article className="a6-card" data-card-id={s.id}>
      <header className="a6-top">
        <div className="a6-brand">
          <div className="a6-title">SENTENCE FACTORY 360°</div>
          <div className="a6-tag">BUILD IT. SNAP IT. READ IT.</div>
        </div>
        <Mascot size={34} mood="cheer" />
      </header>

      <div className="a6-who">
        <div className="a6-photo">
          {s.photo_url ? <CardPhoto src={s.photo_url} /> : <Mascot size={70} />}
        </div>
        <div className="a6-name-block">
          <div className="a6-name">{s.pupil_name}</div>
          <div className="a6-class">{s.class_name}</div>
        </div>
      </div>

      <div className="a6-sentence-box">
        <div className="a6-label">MY SENTENCE</div>
        <p className="a6-sentence" style={{ fontSize: `${size}pt` }}>
          <ColourSentence parts={{ who: s.who, what: s.what_happens, where: s.where_text, when: s.when_text }} placeholder={false} />
        </p>
      </div>

      <footer className="a6-bottom">
        <div className="a6-qr">{qr ? <img src={qr} alt="QR code to hear the recording" /> : <div className="a6-qr-missing">QR</div>}</div>
        <div className="a6-bottom-text">
          <div className="a6-scan">📱 SCAN TO HEAR ME READ</div>
          <div className="a6-growing">“My English is growing every day!” 🌱</div>
          {classroomName && <div className="a6-classroom">{classroomName}</div>}
        </div>
      </footer>
    </article>
  );
}

/** Loads the photo with CORS (so the PDF export can read it); falls back to a plain load if the server refuses. */
function CardPhoto({ src }: { src: string }) {
  const [cors, setCors] = useState(true);
  return <img key={String(cors)} src={src} alt="" crossOrigin={cors ? 'anonymous' : undefined} onError={() => cors && setCors(false)} />;
}
