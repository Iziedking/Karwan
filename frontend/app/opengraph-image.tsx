import { ImageResponse } from 'next/og';

// Branded link-preview card for karwan.site. Rendered at request time by next/og
// so we don't have to ship a static PNG. Twitter's summary_large_image card uses
// this og:image too. Kept font-free (default sans) so the build never depends on
// loading a custom typeface at the edge.
export const runtime = 'edge';
export const alt = 'Karwan · cross-border SME settlement on Arc';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const ACCENT = '#AFC95B';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0A0A0B',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 20, height: 20, background: ACCENT, borderRadius: 3 }} />
          <div
            style={{
              display: 'flex',
              color: '#9A9A95',
              fontSize: 26,
              letterSpacing: 6,
              textTransform: 'uppercase',
            }}
          >
            Cross-border SME settlement
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <div
              style={{
                display: 'flex',
                color: '#FFFFFF',
                fontSize: 168,
                fontWeight: 800,
                letterSpacing: -5,
                lineHeight: 1,
              }}
            >
              KARWAN
            </div>
            <div style={{ display: 'flex', color: ACCENT, fontSize: 168, fontWeight: 800, lineHeight: 1 }}>
              .
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              color: '#E6E6E3',
              fontSize: 38,
              marginTop: 30,
              maxWidth: 980,
              lineHeight: 1.3,
            }}
          >
            Agent-mediated, USDC-settled, milestone-escrowed deals on Arc.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#9A9A95', fontSize: 27 }}>
          <div style={{ display: 'flex', width: 12, height: 12, background: ACCENT, borderRadius: 6 }} />
          <div style={{ display: 'flex' }}>Built on Arc. Powered by Circle. For the MEASA corridor.</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
