export function PeerNetwork() {
  // A ring of nodes laid around the page periphery, with chords across the ring
  // suggesting peer-to-peer connections around the globe. A radial mask softens
  // the centre so the network never competes with the hero copy.
  const NODE_COUNT = 14;
  const cx = 500;
  const cy = 360;
  const rx = 470;
  const ry = 300;

  const nodes = Array.from({ length: NODE_COUNT }).map((_, i) => {
    const t = (i / NODE_COUNT) * Math.PI * 2;
    return {
      id: `n${i}`,
      x: cx + Math.cos(t) * rx,
      y: cy + Math.sin(t) * ry,
    };
  });

  // Chords: each node connects to a few non-adjacent nodes, suggesting a mesh
  // that spans the ring without filling it in.
  const chordOffsets = [3, 5, 8];
  const edges: Array<{ a: number; b: number; delay: number }> = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    for (const off of chordOffsets) {
      const j = (i + off) % NODE_COUNT;
      if (i < j) {
        edges.push({ a: i, b: j, delay: (edges.length * 0.7) % 8 });
      }
    }
  }

  // Animate a small fraction of edges with a traveling pulse so it stays ambient.
  const animatedEdges = edges.filter((_, i) => i % 4 === 0);

  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      <svg
        viewBox="0 0 1000 720"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid slice"
        style={{
          opacity: 0.5,
          maskImage:
            'radial-gradient(ellipse 38% 45% at 50% 48%, transparent 35%, rgba(0,0,0,0.6) 65%, black 90%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 38% 45% at 50% 48%, transparent 35%, rgba(0,0,0,0.6) 65%, black 90%)',
        }}
      >
        <defs>
          <radialGradient id="nodeGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.45" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.06" />
            <stop offset="0.5" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {/* ambient dot grid */}
        <g>
          {Array.from({ length: 28 }).map((_, row) =>
            Array.from({ length: 40 }).map((_, col) => (
              <circle
                key={`g-${row}-${col}`}
                cx={col * 25 + 12}
                cy={row * 25 + 12}
                r="0.6"
                fill="currentColor"
                opacity="0.05"
              />
            )),
          )}
        </g>

        {/* the ring itself — a faint outline tying the nodes together */}
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 6"
          opacity="0.12"
        />

        {/* chords across the ring */}
        <g style={{ color: 'var(--color-ink)' }}>
          {edges.map((e, i) => {
            const A = nodes[e.a];
            const B = nodes[e.b];
            return (
              <line
                key={`chord-${i}`}
                x1={A.x}
                y1={A.y}
                x2={B.x}
                y2={B.y}
                stroke="url(#edgeGrad)"
                strokeWidth="0.9"
              />
            );
          })}
        </g>

        {/* traveling pulses on a subset of chords */}
        <g style={{ color: 'var(--color-accent)' }}>
          {animatedEdges.map((e, i) => {
            const A = nodes[e.a];
            const B = nodes[e.b];
            const d = `M ${A.x} ${A.y} L ${B.x} ${B.y}`;
            return (
              <circle key={`pulse-${i}`} r="1.8" fill="currentColor">
                <animateMotion dur="9s" repeatCount="indefinite" begin={`${e.delay}s`} path={d} />
                <animate
                  attributeName="opacity"
                  values="0;0.85;0.85;0"
                  keyTimes="0;0.1;0.9;1"
                  dur="9s"
                  repeatCount="indefinite"
                  begin={`${e.delay}s`}
                />
              </circle>
            );
          })}
        </g>

        {/* nodes around the ring */}
        <g style={{ color: 'var(--color-ink)' }}>
          {nodes.map((n, i) => (
            <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
              <circle r="14" fill="url(#nodeGlow)" />
              <circle r="1.8" fill="currentColor" opacity="0.7" />
              <circle r="1.8" fill="currentColor" opacity="0.2">
                <animate
                  attributeName="r"
                  values="1.8;7;1.8"
                  dur="4s"
                  begin={`${i * 0.35}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.3;0;0.3"
                  dur="4s"
                  begin={`${i * 0.35}s`}
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
