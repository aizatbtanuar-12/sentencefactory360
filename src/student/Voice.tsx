import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type StudentConfig } from '../api';
import { Mascot } from '../components/Mascot';
import { ColourSentence } from '../components/ui';
import { formatSecs } from '../lib/hooks';
import { audioDuration, canRecord, micErrorMessage, pickAudioMime, stopStream } from '../lib/media';
import { buildSentence } from '../lib/sentence';
import { sfx } from '../lib/sounds';
import { canSpeak, speak, stopSpeaking } from '../lib/speech';
import type { Draft } from './StudentApp';

const MAX_MS = 30_000;
const MAX_UPLOAD = 6 * 1024 * 1024;

type Mode = 'ready' | 'recording' | 'recorded';

export function Voice({
  config,
  draft,
  update,
  onBack,
  onDone,
}: {
  config: StudentConfig;
  draft: Draft;
  update: (p: Partial<Draft>) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>(draft.audio ? 'recorded' : 'ready');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sendError, setSendError] = useState<ApiError | null>(null);
  const sendingRef = useRef(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const tick = useRef<number>(0);
  const raf = useRef<number>(0);
  const actx = useRef<AudioContext | null>(null);
  const audioEl = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sentence = buildSentence(draft.parts);

  const cleanup = useCallback(() => {
    window.clearInterval(tick.current);
    cancelAnimationFrame(raf.current);
    stopStream(streamRef.current);
    streamRef.current = null;
    void actx.current?.close().catch(() => undefined);
    actx.current = null;
  }, []);

  useEffect(() => () => {
    if (recRef.current?.state === 'recording') recRef.current.stop();
    cleanup();
    stopSpeaking();
  }, [cleanup]);

  const setAudio = (blob: Blob | null, ms: number) => {
    if (draft.audioUrl) URL.revokeObjectURL(draft.audioUrl);
    update({ audio: blob, audioUrl: blob ? URL.createObjectURL(blob) : null, audioMs: ms });
  };

  const stopRec = useCallback(() => {
    if (recRef.current?.state === 'recording') recRef.current.stop();
  }, []);

  const startRec = async () => {
    setError('');
    stopSpeaking();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;
      const mime = pickAudioMime();
      const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 48_000 });
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => {
        const ms = Date.now() - startedAt.current;
        const blob = new Blob(chunks.current, { type: (rec.mimeType || mime || 'audio/webm').split(';')[0] });
        cleanup();
        setLevel(0);
        if (blob.size < 500 || ms < 700) {
          setMode('ready');
          setError('That was very short! Tap the red button and read your whole sentence.');
          return;
        }
        setAudio(blob, ms);
        setMode('recorded');
        sfx.complete();
      };
      recRef.current = rec;

      // level meter
      try {
        const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const c = new C();
        actx.current = c;
        const an = c.createAnalyser();
        an.fftSize = 512;
        c.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const loop = () => {
          an.getByteTimeDomainData(buf);
          let peak = 0;
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
          setLevel(Math.min(1, peak / 64));
          raf.current = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        /* meter is optional */
      }

      rec.start(250);
      startedAt.current = Date.now();
      setElapsed(0);
      setMode('recording');
      tick.current = window.setInterval(() => {
        const e = Date.now() - startedAt.current;
        setElapsed(e);
        if (e >= MAX_MS) stopRec();
      }, 200);
    } catch (e) {
      cleanup();
      setError(micErrorMessage(e));
    }
  };

  const play = () => {
    const a = audioEl.current;
    if (!a) return;
    if (playing) {
      a.pause();
      a.currentTime = 0;
      setPlaying(false);
    } else {
      stopSpeaking();
      void a.play().then(() => setPlaying(true)).catch(() => setError('Could not play the recording.'));
    }
  };

  const retake = () => {
    audioEl.current?.pause();
    setPlaying(false);
    setAudio(null, 0);
    setMode('ready');
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('audio/')) return setError('Please choose a sound recording.');
    if (f.size > MAX_UPLOAD) return setError('That recording is too big. Please choose a shorter one.');
    setError('');
    setAudio(f, await audioDuration(f));
    setMode('recorded');
  };

  const send = async () => {
    if (sendingRef.current || !draft.audio) return; // stops accidental double taps
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    setProgress(0);
    try {
      await api.student.submit(
        {
          id: draft.id,
          pupil_name: draft.name,
          class_name: draft.className,
          access_code: draft.code,
          who: draft.parts.who!,
          what: draft.parts.what!,
          where: draft.parts.where!,
          when: draft.parts.when!,
          photo: draft.photo,
          audio: draft.audio,
          audio_duration_ms: draft.audioMs,
        },
        setProgress,
      );
      sfx.fanfare();
      onDone();
    } catch (e) {
      sfx.oops();
      setSendError(e instanceof ApiError ? e : new ApiError((e as Error).message));
      setSending(false);
    } finally {
      sendingRef.current = false;
    }
  };

  void config;

  return (
    <div className="panel voice-panel">
      <div className="speech-row">
        <Mascot size={88} mood={mode === 'recording' ? 'wow' : 'happy'} />
        <div className="bubble big">Read your sentence aloud! 🎤</div>
      </div>

      <div className="voice-sentence">
        <ColourSentence parts={draft.parts} placeholder={false} />
        {canSpeak && (
          <button className="btn btn-sky" onClick={() => speak(sentence)} disabled={mode === 'recording'}>
            👂 Listen first
          </button>
        )}
      </div>

      <div className="recorder">
        {mode === 'ready' && (
          <>
            <button className="rec-btn" onClick={startRec} disabled={!canRecord} aria-label="Start recording">
              <span className="rec-dot" />
            </button>
            <p className="rec-hint">{canRecord ? 'Tap the red button, then read!' : 'Recording is not available here.'}</p>
          </>
        )}
        {mode === 'recording' && (
          <>
            <button className="rec-btn recording" onClick={stopRec} aria-label="Stop recording">
              <span className="rec-square" />
            </button>
            <div className="level">
              <div className="level-fill" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
            <p className="rec-hint">
              Recording… {formatSecs(elapsed)} <span className="muted">/ {formatSecs(MAX_MS)}</span> — tap the square to stop
            </p>
          </>
        )}
        {mode === 'recorded' && draft.audioUrl && (
          <>
            <audio ref={audioEl} src={draft.audioUrl} onEnded={() => setPlaying(false)} preload="auto" />
            <div className="row gap center wrap">
              <button className="btn btn-primary btn-xl" onClick={play}>
                {playing ? '⏹ Stop' : '▶️ Play my voice'}
              </button>
              <button className="btn btn-ghost btn-lg" onClick={retake} disabled={sending}>
                🔁 Record again
              </button>
            </div>
            <p className="rec-hint">Great reading! {draft.audioMs ? `(${formatSecs(draft.audioMs)})` : ''}</p>
          </>
        )}
        {mode !== 'recording' && (
          <button className="link-btn" onClick={() => fileRef.current?.click()} disabled={sending}>
            ⬆️ Upload a recording instead
          </button>
        )}
        <input ref={fileRef} type="file" accept="audio/*" capture hidden onChange={onFile} />
        {error && <p className="error-msg center">{error}</p>}
      </div>

      {mode === 'recorded' && (
        <div className="summary">
          {draft.photoUrl ? <img src={draft.photoUrl} alt="" className="summary-photo" /> : <Mascot size={70} />}
          <div className="summary-text">
            <strong>{draft.name}</strong> · {draft.className}
            <div className="summary-sentence">{sentence}</div>
          </div>
        </div>
      )}

      {sending && (
        <div className="sending" role="status">
          <Mascot size={70} mood="think" className="bob" />
          <div>
            <p>Sending your sentence to the factory…</p>
            <div className="progressbar">
              <div style={{ width: `${Math.max(8, progress)}%` }} />
            </div>
          </div>
        </div>
      )}
      {sendError && (
        <div className="send-error" role="alert">
          <p>{sendError.offline ? '📡 ' : '⚠️ '}{sendError.message}</p>
          <button className="btn btn-orange btn-lg" onClick={send}>
            🔄 Try again
          </button>
        </div>
      )}

      <div className="nav-row">
        <button className="btn btn-ghost btn-lg" onClick={onBack} disabled={sending || mode === 'recording'}>
          ← Back
        </button>
        <button
          className={`btn btn-primary btn-xl ${mode === 'recorded' ? 'glow' : ''}`}
          disabled={mode !== 'recorded' || sending}
          onClick={send}
        >
          {sending ? 'Sending…' : '🚀 Send to my teacher'}
        </button>
      </div>
    </div>
  );
}
