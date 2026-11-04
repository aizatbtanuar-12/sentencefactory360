import { Mascot } from '../components/Mascot';

export function Welcome({
  classroomName,
  onStudent,
  onTeacher,
  disabled,
  notice,
  onRetry,
}: {
  classroomName?: string;
  onStudent: () => void;
  onTeacher: () => void;
  disabled?: boolean;
  notice?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="welcome">
      <div className="welcome-bg" aria-hidden>
        <span className="cog cog-1">⚙️</span>
        <span className="cog cog-2">⚙️</span>
        <span className="floaty f1">🔤</span>
        <span className="floaty f2">⭐</span>
        <span className="floaty f3">✏️</span>
        <span className="floaty f4">📚</span>
      </div>
      <div className="welcome-card">
        {classroomName && <div className="welcome-classroom">{classroomName}</div>}
        <Mascot size={170} mood="cheer" className="bob" />
        <h1 className="welcome-title">
          SENTENCE FACTORY <span className="deg">360°</span>
        </h1>
        <div className="tagline">
          <span className="tag tag-who">BUILD IT.</span>
          <span className="tag tag-what">SNAP IT.</span>
          <span className="tag tag-where">READ IT.</span>
        </div>
        <p className="welcome-sub">“Let’s make great sentences!”</p>
        <button className="btn btn-student" onClick={onStudent} disabled={disabled}>
          <span className="btn-emoji">🧒</span> I’M A STUDENT
        </button>
        <button className="btn btn-teacher" onClick={onTeacher}>
          🔒 TEACHER ZONE
        </button>
        {notice && (
          <p className="welcome-notice">
            {notice}{' '}
            {onRetry && (
              <button className="link-btn" onClick={onRetry}>
                Try again
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
