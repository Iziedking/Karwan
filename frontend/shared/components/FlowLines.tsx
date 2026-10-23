'use client';

import { useEffect, useRef } from 'react';

/// Dotted lines that run in from both edges and meet behind the sign-in card,
/// with a point travelling along each one: every route ends in one account.
/// Colours come from the theme (--flow-line, --flow-dot). Reduced motion
/// draws the lines once and leaves them still. Sign-in only (owner, 23 Oct).
export function FlowLines({ focusY = 0.5 }: { focusY?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let w = 0;
    let h = 0;
    let colours = { line: 'rgba(175,201,91,0.16)', dot: '198, 219, 122' };
    let paths: Array<{ left: boolean; y: number; t: number; speed: number }> = [];

    const readColours = () => {
      const css = getComputedStyle(document.documentElement);
      colours = {
        line: css.getPropertyValue('--flow-line').trim() || colours.line,
        dot: css.getPropertyValue('--flow-dot').trim() || colours.dot,
      };
    };

    const layout = () => {
      const dpr = window.devicePixelRatio || 1;
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(56, Math.max(24, w / 26)));
      paths = Array.from({ length: count }, (_, i) => ({
        left: i % 2 === 0,
        y: (i / count) * h * 1.4 - h * 0.2,
        t: Math.random(),
        speed: 0.0012 + Math.random() * 0.0016,
      }));
    };

    const point = (t: number, a: number[], b: number[], c: number[], d: number[]) => {
      const u = 1 - t;
      return [
        u * u * u * a[0]! + 3 * u * u * t * b[0]! + 3 * u * t * t * c[0]! + t * t * t * d[0]!,
        u * u * u * a[1]! + 3 * u * u * t * b[1]! + 3 * u * t * t * c[1]! + t * t * t * d[1]!,
      ];
    };

    const draw = (move: boolean) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h * focusY;
      for (const p of paths) {
        const a = [p.left ? 0 : w, p.y];
        const b = [p.left ? cx * 0.5 : w - cx * 0.5, p.y];
        const c = [p.left ? cx * 0.8 : w - cx * 0.8, cy];
        const d = [cx, cy];
        ctx.beginPath();
        ctx.moveTo(a[0]!, a[1]!);
        ctx.bezierCurveTo(b[0]!, b[1]!, c[0]!, c[1]!, d[0]!, d[1]!);
        ctx.strokeStyle = colours.line;
        ctx.lineWidth = 1.1;
        ctx.setLineDash([1, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (move) {
          p.t += p.speed;
          if (p.t > 1) p.t = 0;
        }
        const [x, y] = point(p.t, a, b, c, d);
        ctx.fillStyle = `rgba(${colours.dot}, ${(0.25 + 0.6 * p.t).toFixed(2)})`;
        ctx.fillRect(x! - 1.5, y! - 1.5, 3, 3);
      }
    };

    const loop = () => {
      draw(true);
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      if (still.matches || document.hidden) draw(false);
      else frame = requestAnimationFrame(loop);
    };

    readColours();
    layout();
    start();

    const resize = new ResizeObserver(() => {
      layout();
      if (still.matches || document.hidden) draw(false);
    });
    resize.observe(canvas);
    const theme = new MutationObserver(() => {
      readColours();
      if (still.matches) draw(false);
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', start);
    still.addEventListener('change', start);

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      theme.disconnect();
      document.removeEventListener('visibilitychange', start);
      still.removeEventListener('change', start);
    };
  }, [focusY]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}
