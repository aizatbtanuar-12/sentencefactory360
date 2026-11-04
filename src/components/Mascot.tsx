// "Gizmo" — the friendly Sentence Factory robot (original artwork).
export type Mood = 'happy' | 'wow' | 'cheer' | 'think';

export function Mascot({ mood = 'happy', size = 140, className = '' }: { mood?: Mood; size?: number; className?: string }) {
  const armsUp = mood === 'cheer';
  return (
    <svg
      className={`mascot ${className}`}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="Gizmo the factory robot"
    >
      {/* shadow */}
      <ellipse cx="100" cy="190" rx="48" ry="7" fill="#315B91" opacity="0.12" />
      {/* antenna */}
      <rect x="96" y="14" width="8" height="26" rx="4" fill="#315B91" />
      <circle className="mascot-bulb" cx="100" cy="14" r="11" fill="#ED8A62" />
      <circle cx="96" cy="10" r="3.5" fill="#fff" opacity="0.7" />
      {/* arms */}
      <g className="mascot-arm-l" style={{ transformOrigin: '42px 120px' }}>
        <path
          d={armsUp ? 'M44 118 Q22 92 26 66' : 'M44 118 Q20 128 24 152'}
          stroke="#315B91"
          strokeWidth="11"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx={armsUp ? 26 : 24} cy={armsUp ? 62 : 156} r="11" fill="#ED8A62" />
      </g>
      <g className="mascot-arm-r" style={{ transformOrigin: '158px 120px' }}>
        <path
          d={armsUp ? 'M156 118 Q178 92 174 66' : 'M156 118 Q182 112 182 88'}
          stroke="#315B91"
          strokeWidth="11"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx={armsUp ? 174 : 182} cy={armsUp ? 62 : 84} r="11" fill="#ED8A62" />
      </g>
      {/* body */}
      <rect x="40" y="38" width="120" height="142" rx="34" fill="#70B6ED" />
      <rect x="40" y="38" width="120" height="142" rx="34" fill="url(#gz-shine)" />
      {/* face screen */}
      <rect x="54" y="52" width="92" height="68" rx="22" fill="#FFFFFF" />
      {mood === 'think' ? (
        <>
          <path d="M72 82 h14" stroke="#315B91" strokeWidth="6" strokeLinecap="round" />
          <circle cx="121" cy="80" r="8" fill="#315B91" />
        </>
      ) : (
        <>
          <circle className="mascot-eye" cx="79" cy="80" r="9" fill="#315B91" />
          <circle className="mascot-eye" cx="121" cy="80" r="9" fill="#315B91" />
          <circle cx="82" cy="77" r="3" fill="#fff" />
          <circle cx="124" cy="77" r="3" fill="#fff" />
        </>
      )}
      {/* cheeks */}
      <circle cx="66" cy="98" r="6" fill="#ED8A62" opacity="0.45" />
      <circle cx="134" cy="98" r="6" fill="#ED8A62" opacity="0.45" />
      {/* mouth */}
      {mood === 'wow' ? (
        <ellipse cx="100" cy="102" rx="8" ry="9" fill="#315B91" />
      ) : mood === 'think' ? (
        <path d="M90 104 q10 -4 20 0" stroke="#315B91" strokeWidth="5" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M84 98 q16 16 32 0" stroke="#315B91" strokeWidth="6" fill="#ED8A62" strokeLinecap="round" />
      )}
      {/* chest gear */}
      <g className="mascot-gear" style={{ transformOrigin: '100px 148px' }}>
        <circle cx="100" cy="148" r="17" fill="#FFF6E4" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <rect key={a} x="96" y="126" width="8" height="9" rx="2" fill="#FFF6E4" transform={`rotate(${a} 100 148)`} />
        ))}
        <circle cx="100" cy="148" r="7" fill="#315B91" />
      </g>
      {/* feet */}
      <rect x="62" y="174" width="28" height="12" rx="6" fill="#315B91" />
      <rect x="110" y="174" width="28" height="12" rx="6" fill="#315B91" />
      <defs>
        <linearGradient id="gz-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
