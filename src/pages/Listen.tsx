import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type ListenData } from '../api';
import { Mascot } from '../components/Mascot';
import { Spinner } from '../components/ui';

/** Public page opened by the QR code on a printed card. Shows no photo, only the name, sentence and voice. */
export default function Listen() {
  const { token = '' } = useParams();
  const [data, setData] = useState<ListenData | null>(null);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    api
      .listen(token)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [token]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (playing) {
      a.pause();
      a.currentTime = 0;
      setPlaying(false);
    } else
      void a
        .play()
        .then(() => setPlaying(true))
        .catch(() => setError('This device could not play the recording.'));
  };

  return (
    <div className="listen-page">
      <div className="listen-card">
        <div className="listen-brand">SENTENCE FACTORY 360°</div>
        {!data && !error && <Spinner label="Finding the recording…" />}
        {error && (
          <>
            <Mascot size={120} mood="think" />
            <h1>Oops!</h1>
            <p>{error}</p>
            <p className="muted small">The card may have been removed from the gallery. Please ask the teacher.</p>
          </>
        )}
        {data && (
          <>
            <Mascot size={130} mood={playing ? 'wow' : 'cheer'} className={playing ? 'bob' : ''} />
            <h1>Listen to {data.pupil_name} read!</h1>
            <p className="muted">
              {data.class_name} · {data.classroom_name}
            </p>
            {data.teacher_name && (
              <p className="listen-teacher">
                {data.teacher_photo_url && <img src={data.teacher_photo_url} alt="" />}
                <span>with {data.teacher_name}</span>
              </p>
            )}
            <p className="listen-sentence">“{data.sentence}”</p>
            <audio ref={audio} src={data.audio_url} preload="auto" onEnded={() => setPlaying(false)} />
            <button className={`play-big ${playing ? 'on' : ''}`} onClick={toggle} aria-label={playing ? 'Stop' : 'Play recording'}>
              {playing ? '■' : '▶'}
            </button>
            <p className="listen-growing">“My English is growing every day!” 🌱</p>
          </>
        )}
      </div>
    </div>
  );
}
