'use client';
import { useEffect } from 'react';
import { reportRouteError } from '@/shared/observability/reportRouteError';

/// The last screen: the layout itself threw, so fonts, theme and providers are
/// gone. Plain styles only.
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[root] layout error', error);
    reportRouteError(error, 'root');
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f1115', color: '#f2f3f5', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 12px' }}>Karwan stopped</h1>
          <p style={{ fontSize: 15, lineHeight: 1.5, color: '#b4b8c0', margin: '0 0 20px' }}>Your account and money are safe. Reload to carry on.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 44, padding: '0 20px', borderRadius: 999, border: 0, background: '#f2f3f5', color: '#0f1115', fontSize: 15, fontWeight: 600 }}>Reload</button>
        </main>
      </body>
    </html>
  );
}
