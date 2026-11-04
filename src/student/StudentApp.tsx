import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, backendReady, isDemo, type StudentConfig, type StudentHome } from '../api';
import { Mascot } from '../components/Mascot';
import { Confirm, Modal, OfflineBanner, Spinner } from '../components/ui';
import { useIdle } from '../lib/hooks';
import type { SentenceParts } from '../lib/sentence';
import { isMuted, setMuted, sfx } from '../lib/sounds';
import { stopSpeaking } from '../lib/speech';
import { Build } from './Build';
import { Identify } from './Identify';
import { Photo } from './Photo';
import { Success } from './Success';
import { Voice } from './Voice';
import { Welcome } from './Welcome';

export type Step = 'welcome' | 'id' | 'build' | 'photo' | 'voice' | 'done';

export interface Draft {
  id: string;
  name: string;
  classId: string;
  className: string;
  code: string;
  parts: Partial<SentenceParts>;
  whoPlural: boolean;
  usedShuffle: boolean;
  photo: Blob | null;
  photoUrl: string | null;
  audio: Blob | null;
  audioUrl: string | null;
  audioMs: number;
}

export const emptyDraft = (): Draft => ({
  id: crypto.randomUUID(),
  name: '',
  classId: '',
  className: '',
  code: '',
  parts: {},
  whoPlural: false,
  usedShuffle: false,
  photo: null,
  photoUrl: null,
  audio: null,
  audioUrl: null,
  audioMs: 0,
});

const STEPS: { key: Step; label: string; icon: string }[] = [
  { key: 'id', label: 'Me', icon: '🙋' },
  { key: 'build', label: 'Build', icon: '🧩' },
  { key: 'photo', label: 'Snap', icon: '📸' },
  { key: 'voice', label: 'Read', icon: '🎤' },
  { key: 'done', label: 'Done', icon: '⭐' },
];

const IDLE_MS = 4 * 60_000;

export default function StudentApp() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>('welcome');
  const [home, setHome] = useState<StudentHome | null>(null);
  const [config, setConfig] = useState<StudentConfig | null>(null);
  const [configError, setConfigError] = useState('');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [muted, setMutedState] = useState(isMuted());
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [idleWarn, setIdleWarn] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const loadConfig = useCallback(async () => {
    setConfigError('');
    try {
      setHome(await api.student.home());
    } catch (e) {
      setConfigError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const update = useCallback((p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p })), []);

  /** Wipe everything about the current pupil (photo, voice, name) before the next one. */
  const resetAll = useCallback(() => {
    const d = draftRef.current;
    if (d.photoUrl) URL.revokeObjectURL(d.photoUrl);
    if (d.audioUrl) URL.revokeObjectURL(d.audioUrl);
    stopSpeaking();
    setDraft(emptyDraft());
    setConfig(null);
    setIdleWarn(false);
    setConfirmQuit(false);
    setStep('welcome');
    void loadConfig(); // pick up any new classes
  }, [loadConfig]);

  useIdle(IDLE_MS, () => setIdleWarn(true), step !== 'welcome' && step !== 'done' && !idleWarn);

  useEffect(() => {
    if (!idleWarn) return;
    const t = setTimeout(resetAll, 30_000);
    return () => clearTimeout(t);
  }, [idleWarn, resetAll]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const go = (s: Step) => {
    sfx.tap();
    setStep(s);
  };

  const toggleMute = () => {
    setMuted(!muted);
    setMutedState(!muted);
  };

  if (step === 'welcome') {
    return (
      <>
        <OfflineBanner />
        <Welcome
          classroomName={home?.school_name}
          onStudent={() => go('id')}
          onTeacher={() => nav('/teacher')}
          disabled={!home}
          notice={
            !backendReady
              ? 'Setup needed: add your Supabase details (see README).'
              : configError
                ? configError
                : isDemo
                  ? 'Demo mode — data stays on this device. Teacher Rina’s PIN: 1234 · Class code: FACTORY1 · New-teacher school code: SCHOOL1'
                  : ''
          }
          onRetry={configError ? loadConfig : undefined}
        />
      </>
    );
  }

  const idx = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="student-shell">
      <OfflineBanner />
      <header className="student-header">
        <div className="brand-mini">
          <Mascot size={46} mood={step === 'done' ? 'cheer' : 'happy'} />
          <div>
            <div className="brand-mini-title">Sentence Factory 360°</div>
            <div className="brand-mini-sub">Build it. Snap it. Read it.</div>
          </div>
        </div>
        <ol className="progress" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.key} className={i < idx ? 'done' : i === idx ? 'current' : ''}>
              <span className="progress-icon">{i < idx ? '✓' : s.icon}</span>
              <span className="progress-label">{s.label}</span>
            </li>
          ))}
        </ol>
        <div className="header-actions">
          <button className="icon-btn" onClick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Turn sound off'}>
            {muted ? '🔇' : '🔊'}
          </button>
          {step !== 'done' && (
            <button className="icon-btn" onClick={() => setConfirmQuit(true)} aria-label="Start again">
              ✕
            </button>
          )}
        </div>
      </header>

      <main className="student-main">
        {!home ? (
          <Spinner label="Starting the factory machines…" />
        ) : step === 'id' ? (
          <Identify
            home={home}
            draft={draft}
            update={update}
            onBack={() => go('welcome')}
            onVerified={(cfg) => {
              setConfig(cfg);
              go('build');
            }}
          />
        ) : !config ? (
          <Spinner />
        ) : step === 'build' ? (
          <Build
            config={config}
            draft={draft}
            update={update}
            onBack={() => go('id')}
            onNext={() => go('photo')}
          />
        ) : step === 'photo' ? (
          <Photo config={config} draft={draft} update={update} onBack={() => go('build')} onNext={() => go('voice')} />
        ) : step === 'voice' ? (
          <Voice config={config} draft={draft} update={update} onBack={() => go('photo')} onDone={() => setStep('done')} />
        ) : (
          <Success config={config} draft={draft} onNext={resetAll} />
        )}
      </main>

      {confirmQuit && (
        <Confirm
          title="Start again?"
          message="Your sentence, photo and recording will be cleared."
          yes="Yes, start again"
          no="Keep going"
          danger
          onYes={resetAll}
          onNo={() => setConfirmQuit(false)}
        />
      )}
      {idleWarn && (
        <Modal onClose={() => setIdleWarn(false)}>
          <div className="center-col">
            <Mascot mood="think" size={110} />
            <h2 className="modal-title">Are you still building?</h2>
            <p className="modal-text">If nobody taps, the factory will get ready for the next student.</p>
            <button className="btn btn-primary btn-xl" onClick={() => setIdleWarn(false)}>
              Yes, I'm here!
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
