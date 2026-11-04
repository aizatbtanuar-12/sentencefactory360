import { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { api, isDemo, type TeacherProfile } from '../api';
import { clearToken, getToken, onSessionChange } from '../api/session';
import { Mascot } from '../components/Mascot';
import { OfflineBanner } from '../components/ui';
import { useIdle } from '../lib/hooks';
import { CardPage } from './CardPage';
import { Gallery } from './Gallery';
import { Overview } from './Overview';
import { Avatar, PinLogin } from './PinLogin';
import { Settings } from './Settings';
import { Submissions } from './Submissions';

const IDLE_LOCK_MS = 15 * 60_000;

export default function TeacherApp() {
  const [signedIn, setSignedIn] = useState(!!getToken());
  const [me, setMe] = useState<TeacherProfile | null>(null);
  const nav = useNavigate();

  useEffect(() => onSessionChange(setSignedIn), []);

  const refreshMe = useCallback(() => {
    api.teacher
      .session()
      .then((r) => setMe(r.teacher))
      .catch(() => undefined); // a 401 clears the token automatically
  }, []);

  useEffect(() => {
    if (signedIn) refreshMe();
    else setMe(null);
  }, [signedIn, refreshMe]);

  // Lock the Teacher Zone automatically if the tablet is left alone.
  useIdle(IDLE_LOCK_MS, clearToken, signedIn);

  if (!signedIn) return <PinLogin />;

  const lock = () => {
    clearToken();
    nav('/');
  };

  return (
    <div className="teacher-shell">
      <OfflineBanner />
      <header className="teacher-header no-print">
        <div className="brand-mini">
          {me ? <Avatar url={me.photo_url} name={me.display_name} size={44} /> : <Mascot size={42} />}
          <div>
            <div className="brand-mini-title">{me?.display_name ?? 'Sentence Factory 360°'}</div>
            <div className="brand-mini-sub">
              Teacher Zone{me?.is_admin ? ' · Admin' : ''}
              {isDemo ? ' · Demo' : ''}
            </div>
          </div>
        </div>
        <nav className="teacher-nav">
          <NavLink to="/teacher" end>
            📊 Overview
          </NavLink>
          <NavLink to="/teacher/submissions">📥 Submissions</NavLink>
          <NavLink to="/teacher/gallery">🖼️ Gallery</NavLink>
          <NavLink to="/teacher/settings">⚙️ Settings</NavLink>
        </nav>
        <button className="btn btn-ghost" onClick={lock}>
          🔒 Lock & exit
        </button>
      </header>
      {me?.using_initial_pin && (
        <div className="warn-banner no-print">
          ⚠️ You are still using the first-time PIN. Please <NavLink to="/teacher/settings?tab=pin">set your own PIN</NavLink>.
        </div>
      )}
      <main className="teacher-main">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="submissions" element={<Submissions />} />
          <Route path="gallery" element={<Gallery />} />
          <Route path="settings" element={<Settings onChanged={refreshMe} />} />
          <Route path="card/:id" element={<CardPage />} />
          <Route path="print" element={<CardPage />} />
          <Route path="*" element={<Overview />} />
        </Routes>
      </main>
    </div>
  );
}
