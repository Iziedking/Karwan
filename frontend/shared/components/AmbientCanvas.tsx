export function AmbientCanvas() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{
        maskImage:
          'radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 80%)',
        WebkitMaskImage:
          'radial-gradient(ellipse 80% 60% at 50% 30%, black 30%, transparent 80%)',
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1200 600"
        preserveAspectRatio="xMidYMid slice"
        style={{ opacity: 0.5 }}
      >
        <defs>
          <pattern id="dot-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#d4d1c5" opacity="0.55" />
          </pattern>
          <linearGradient id="route" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#e6e4dc" stopOpacity="0" />
            <stop offset="0.5" stopColor="#1b3a5b" stopOpacity="0.25" />
            <stop offset="1" stopColor="#e6e4dc" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid)" />
        <g className="drift">
          <path d="M-100 220 Q 300 160 600 200 T 1300 180" stroke="url(#route)" strokeWidth="1" fill="none" />
          <path d="M-100 320 Q 350 280 650 320 T 1300 290" stroke="url(#route)" strokeWidth="1" fill="none" />
          <path d="M-100 440 Q 280 420 580 440 T 1300 420" stroke="url(#route)" strokeWidth="1" fill="none" />
        </g>
      </svg>
      <style>{`
        .drift { animation: drift 18s ease-in-out infinite alternate; }
        @keyframes drift {
          0%   { transform: translateX(-12px); }
          100% { transform: translateX(12px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .drift { animation: none; }
        }
      `}</style>
    </div>
  );
}
