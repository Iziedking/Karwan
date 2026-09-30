import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// The link preview for karwan.site, also used for X (twitter-image re-exports
// it). Karwan ink, the real mark, General Sans, and the same deal art as the
// sign-in panel: two parties, the escrow pill with its lime line, the payment,
// and the record writing itself. Fonts are TTF copies of the self-hosted
// General Sans because the image renderer cannot read woff2.
export const runtime = 'nodejs';
export const alt = 'Karwan · one reputation, starting with an open market';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#16202A';
const PANEL = '#1E2A35';
const PAPER = '#EEF2F7';
const MUTED = '#A0A6AD';
const LIME = '#AFC95B';

const asset = (...parts: string[]) => readFile(join(process.cwd(), 'public', ...parts));

export default async function OpengraphImage() {
  const [medium, semibold, mark] = await Promise.all([
    asset('og', 'GeneralSans-Medium.ttf'),
    asset('og', 'GeneralSans-Semibold.ttf'),
    asset('icon-512.png'),
  ]);
  const markSrc = `data:image/png;base64,${mark.toString('base64')}`;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: INK, padding: 56, fontFamily: 'General Sans' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 600, paddingRight: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={markSrc} width={52} height={52} style={{ borderRadius: 12 }} alt="" />
            <div style={{ display: 'flex', marginLeft: 16, fontSize: 34, fontWeight: 600, color: PAPER, letterSpacing: -0.5 }}>Karwan</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: 66, fontWeight: 600, lineHeight: 1.04, letterSpacing: -2, color: PAPER }}>
              <div style={{ display: 'flex' }}>Your reputation</div>
              <div style={{ display: 'flex' }}>should travel</div>
              <div style={{ display: 'flex' }}>
                with you<span style={{ color: LIME }}>.</span>
              </div>
            </div>
            <div style={{ display: 'flex', marginTop: 24, fontSize: 27, fontWeight: 500, lineHeight: 1.35, color: MUTED }}>
              One reputation for the internet. It starts with an open market where every completed trade counts.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', fontSize: 22, fontWeight: 500, color: MUTED }}>
            <div style={{ display: 'flex', width: 10, height: 10, borderRadius: 5, background: LIME, marginRight: 12 }} />
            karwan.site
          </div>
        </div>

        <div style={{ display: 'flex', position: 'relative', flex: 1, background: PANEL, borderRadius: 28, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 58, top: 62, width: 150, height: 100, borderRadius: 16, background: PAPER, opacity: 0.35, transform: 'rotate(-8deg)' }} />
          <div style={{ position: 'absolute', left: 250, top: 88, width: 150, height: 100, borderRadius: 16, background: PAPER, opacity: 0.25, transform: 'rotate(6deg)' }} />
          <div style={{ position: 'absolute', left: 50, top: 222, width: 250, height: 132, borderRadius: 66, background: PAPER, opacity: 0.95, display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', width: '100%', height: 4, background: LIME }} />
          </div>
          <div style={{ position: 'absolute', left: 328, top: 300, width: 88, height: 88, borderRadius: 44, background: PAPER, opacity: 0.85 }} />
          {[0.2, 0.3, 0.4, 0.5, 0.6].map((opacity, i) => (
            <div key={i} style={{ position: 'absolute', left: 258, top: 404 + i * 22, width: 150, height: 16, borderRadius: 8, background: PAPER, opacity }} />
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'General Sans', data: medium, weight: 500, style: 'normal' },
        { name: 'General Sans', data: semibold, weight: 600, style: 'normal' },
      ],
    },
  );
}
