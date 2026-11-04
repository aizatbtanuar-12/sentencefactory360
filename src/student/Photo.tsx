import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudentConfig } from '../api';
import { Mascot } from '../components/Mascot';
import { cameraErrorMessage, canUseCamera, fileToJpeg, stopStream } from '../lib/media';
import { sfx } from '../lib/sounds';
import type { Draft } from './StudentApp';

type Mode = 'starting' | 'live' | 'countdown' | 'captured' | 'nocam';

export function Photo({
  config,
  draft,
  update,
  onBack,
  onNext,
}: {
  config: StudentConfig;
  draft: Draft;
  update: (p: Partial<Draft>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>(draft.photo ? 'captured' : 'starting');
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(false);

  const stop = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError('');
    if (!canUseCamera) {
      setMode('nocam');
      setError('This device cannot use the camera here. You can upload a photo instead.');
      return;
    }
    setMode('starting');
    try {
      stop();
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => undefined);
      }
      setMode('live');
    } catch (e) {
      setMode('nocam');
      setError(cameraErrorMessage(e));
    }
  }, [stop]);

  useEffect(() => {
    if (!draft.photo) void start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPhoto = (blob: Blob | null) => {
    if (draft.photoUrl) URL.revokeObjectURL(draft.photoUrl);
    update({ photo: blob, photoUrl: blob ? URL.createObjectURL(blob) : null });
  };

  const snap = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    // square crop from the centre, mirrored like the preview, max 720px
    const side = Math.min(v.videoWidth, v.videoHeight);
    const out = Math.min(720, side);
    const c = document.createElement('canvas');
    c.width = out;
    c.height = out;
    const g = c.getContext('2d')!;
    g.translate(out, 0);
    g.scale(-1, 1);
    g.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, out, out);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.82));
    if (!blob) return;
    sfx.shutter();
    setFlash(true);
    setTimeout(() => setFlash(false), 350);
    setPhoto(blob);
    setMode('captured');
    stop();
  };

  const countdown = () => {
    if (mode !== 'live') return;
    setMode('countdown');
    let n = 3;
    setCount(n);
    sfx.beep();
    const t = setInterval(() => {
      n -= 1;
      if (n === 0) {
        clearInterval(t);
        setCount(0);
        void snap();
      } else {
        setCount(n);
        sfx.beep();
      }
    }, 800);
  };

  const retake = () => {
    setPhoto(null);
    void start();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const blob = await fileToJpeg(f);
      stop();
      setPhoto(blob);
      setMode('captured');
      setError('');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const canGo = !!draft.photo || !config.photo_required;

  return (
    <div className="panel photo-panel">
      <div className="speech-row">
        <Mascot size={88} mood="wow" />
        <div className="bubble big">Smile for your sentence card! 😁</div>
      </div>

      <div className={`camera-frame ${flash ? 'flash' : ''}`}>
        {mode === 'captured' && draft.photoUrl ? (
          <img src={draft.photoUrl} alt="Your photo" className="camera-img" />
        ) : (
          <>
            <video ref={videoRef} className="camera-video" playsInline muted autoPlay />
            {mode === 'starting' && <div className="camera-overlay">Starting camera…</div>}
            {mode === 'nocam' && (
              <div className="camera-overlay">
                <span style={{ fontSize: 56 }}>📷</span>
                <span>{error}</span>
              </div>
            )}
            {mode === 'countdown' && count > 0 && (
              <div className="countdown" key={count}>
                {count}
              </div>
            )}
          </>
        )}
      </div>

      <div className="row gap center wrap">
        {mode === 'live' && (
          <button className="btn btn-orange btn-xl" onClick={countdown}>
            📸 Take my photo
          </button>
        )}
        {mode === 'captured' && (
          <>
            <button className="btn btn-sky btn-lg" onClick={retake}>
              🔁 Retake
            </button>
            <button className="btn btn-ghost btn-lg" onClick={() => { setPhoto(null); void start(); }}>
              🗑️ Remove
            </button>
          </>
        )}
        {mode === 'nocam' && canUseCamera && (
          <button className="btn btn-sky btn-lg" onClick={() => void start()}>
            🔄 Try the camera again
          </button>
        )}
        <button className="btn btn-ghost btn-lg" onClick={() => fileRef.current?.click()}>
          ⬆️ Upload a photo
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="user" hidden onChange={onFile} />
      </div>
      {error && mode !== 'nocam' && <p className="error-msg center">{error}</p>}

      <div className="nav-row">
        <button className="btn btn-ghost btn-lg" onClick={() => { stop(); onBack(); }}>
          ← Back
        </button>
        <div className="row gap">
          {!config.photo_required && !draft.photo && (
            <button className="btn btn-ghost btn-lg" onClick={() => { stop(); onNext(); }}>
              Skip photo
            </button>
          )}
          <button className={`btn btn-primary btn-xl ${canGo ? 'glow' : ''}`} disabled={!canGo} onClick={() => { stop(); onNext(); }}>
            Next: Read 🎤
          </button>
        </div>
      </div>
    </div>
  );
}
