import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// The link preview for karwan.site, also used for X (twitter-image re-exports
// it). Karwan ink, the real mark, General Sans, and a line sketch of a deal:
// a seller hands over the goods, a buyer pays from a phone, the money waits in
// the escrow pill with its lime line, and the record below gets its tick.
// Fonts are TTF copies of the self-hosted General Sans because the image
// renderer cannot read woff2.
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

/// Two people dealing, drawn as one sketch in the panel's 488 by 518 box.
const DEAL_SKETCH = `<svg xmlns="http://www.w3.org/2000/svg" width="488" height="518" viewBox="0 0 488 518" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <g stroke="${PAPER}" stroke-width="3" opacity="0.9">
    <circle cx="112" cy="176" r="30"/>
    <path d="M84 168 Q88 140 114 142 Q138 144 141 166"/>
    <path d="M112 206 V216"/>
    <path d="M80 226 Q112 212 144 226 L152 336 Q112 344 72 336 Z"/>
    <path d="M140 232 L176 268 L204 254"/>
    <path d="M84 232 L72 290 L80 326"/>
    <path d="M92 338 L88 436 M132 338 L136 436 M80 436 H98 M128 436 H146"/>
    <rect x="198" y="218" width="42" height="36" rx="4"/>
    <path d="M198 230 H240 M219 218 V230"/>
    <circle cx="376" cy="176" r="30"/>
    <circle cx="394" cy="144" r="11"/>
    <path d="M376 206 V216"/>
    <path d="M408 226 Q376 212 344 226 L336 336 Q376 344 416 336 Z"/>
    <path d="M348 232 L312 268 L286 256"/>
    <path d="M404 232 L416 290 L408 326"/>
    <path d="M396 338 L400 436 M356 338 L352 436 M408 436 H390 M360 436 H342"/>
    <rect x="266" y="222" width="24" height="40" rx="5"/>
    <path d="M274 255 H282"/>
  </g>
  <g stroke="${PAPER}" stroke-width="2.5" stroke-dasharray="2 9" opacity="0.6">
    <path d="M219 212 Q190 160 176 124"/>
    <path d="M278 216 Q300 160 312 124"/>
  </g>
  <rect x="172" y="88" width="144" height="56" rx="28" fill="${PAPER}"/>
  <path d="M196 116 H292" stroke="${LIME}" stroke-width="4"/>
  <rect x="186" y="368" width="116" height="88" rx="12" stroke="${PAPER}" stroke-width="3" opacity="0.9"/>
  <path d="M204 394 L212 402 L226 386" stroke="${LIME}" stroke-width="4"/>
  <path d="M238 394 H284 M204 418 H284 M204 438 H256" stroke="${PAPER}" stroke-width="3" opacity="0.6"/>
</svg>`;
const DEAL_SKETCH_SRC = `data:image/svg+xml;base64,${Buffer.from(DEAL_SKETCH).toString('base64')}`;

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

        <div style={{ display: 'flex', flex: 1, background: PANEL, borderRadius: 28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          <img src={DEAL_SKETCH_SRC} width={488} height={518} alt="" />
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
