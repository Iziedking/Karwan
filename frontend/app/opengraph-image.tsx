import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// The link preview for every Karwan page, also used for X (twitter-image
// re-exports it), drawn in the landing's look (view 49). One frame tells the
// story: a chat from any platform becomes a deal both sides agreed, on a phone
// held at a slight angle over a soft green glow. General Sans is the poster
// face; the image renderer reads TTF copies because it cannot read woff2.
export const runtime = 'nodejs';
export const alt = 'Karwan · Meet anywhere. Make it a deal.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BG = '#0F1012';
const RAISED = '#1D2024';
const LINE = '#25282C';
const INK = '#F4F4F1';
const MUTE = '#A3A8AE';
const QUIET = '#81878E';
const GREEN = '#AFC95B';
const ON_GREEN = '#16202A';

const asset = (...parts: string[]) => readFile(join(process.cwd(), 'public', ...parts));
const svg = (body: string) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">${body}</svg>`).toString('base64')}`;

const TIKTOK_NOTE = 'M13.5 3.5h2.6c.3 2 1.7 3.5 3.9 3.8v2.7c-1.5 0-2.8-.4-3.9-1.2v6a5 5 0 1 1-5-5h.6v2.8h-.6a2.2 2.2 0 1 0 2.4 2.2V3.5Z';
/// The same marks as the landing's platform row, in their own colours.
const PLATFORMS = [
  svg(`<path d="${TIKTOK_NOTE}" fill="#25F4EE" transform="translate(-0.9 -0.7)"/><path d="${TIKTOK_NOTE}" fill="#FE2C55" transform="translate(0.9 0.7)"/><path d="${TIKTOK_NOTE}" fill="#FFFFFF"/>`),
  svg('<defs><linearGradient id="g" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FEDA75"/><stop offset="0.3" stop-color="#FA7E1E"/><stop offset="0.6" stop-color="#D62976"/><stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs><rect x="3.5" y="3.5" width="17" height="17" rx="5" stroke="url(#g)" stroke-width="2"/><circle cx="12" cy="12" r="3.8" stroke="url(#g)" stroke-width="2"/><circle cx="17" cy="7" r="1.2" fill="url(#g)"/>'),
  svg('<circle cx="12" cy="12" r="9.5" fill="#1877F2"/><path d="M13.1 21.4v-6.7h2.3l.4-2.7h-2.7v-1.7c0-.8.4-1.5 1.6-1.5h1.2V6.5s-1.1-.2-2.1-.2c-2.2 0-3.6 1.3-3.6 3.7V12H7.9v2.7h2.3v6.7" fill="#FFFFFF"/>'),
  svg('<path d="M17.6 3.5h2.9l-6.3 7.2 7.4 9.8h-5.8l-4.5-5.9-5.2 5.9H3.2l6.7-7.7L2.8 3.5h5.9l4.1 5.4 4.8-5.4Zm-1 15.3h1.6L7.5 5.1H5.8l10.8 13.7Z" fill="#FFFFFF"/>'),
  svg('<rect x="3" y="3" width="18" height="18" rx="3.5" fill="#0A66C2"/><path d="M7 10h2.4v7H7v-7Zm1.2-3.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8ZM11 10h2.3v1c.4-.7 1.2-1.2 2.4-1.2 2.3 0 2.7 1.5 2.7 3.5V17H16v-3.3c0-.9 0-1.9-1.2-1.9s-1.4.9-1.4 1.8V17H11v-7Z" fill="#FFFFFF"/>'),
];

function Row({ k, v, green }: { k: string; v: string; green?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: `1px solid ${LINE}`, fontSize: 16, color: MUTE }}>
      <span>{k}</span>
      <span style={{ color: green ? GREEN : INK, fontWeight: 600 }}>{v}</span>
    </div>
  );
}

export default async function OpengraphImage() {
  const [medium, semibold, mark] = await Promise.all([
    asset('og', 'GeneralSans-Medium.ttf'),
    asset('og', 'GeneralSans-Semibold.ttf'),
    asset('brand', 'karwan-mark-lime.png'),
  ]);
  const markSrc = `data:image/png;base64,${mark.toString('base64')}`;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: BG, fontFamily: 'General Sans', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 640, top: -40, width: 700, height: 700, display: 'flex', backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(175,201,91,0.24), rgba(175,201,91,0.08) 36%, rgba(15,16,18,0) 66%)' }} />

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 660, padding: '64px 0 60px 76px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={markSrc} width={34} height={34} alt="" />
            <div style={{ display: 'flex', marginLeft: 12, fontSize: 28, fontWeight: 600, color: INK, letterSpacing: -0.6 }}>Karwan</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: 80, fontWeight: 600, lineHeight: 1, letterSpacing: -3, color: INK }}>
              <div style={{ display: 'flex' }}>Meet anywhere.</div>
              <div style={{ display: 'flex', marginTop: 6 }}>
                Make it a deal<span style={{ color: GREEN }}>.</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 40 }}>
              {PLATFORMS.map((src, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 24, background: RAISED, marginLeft: i === 0 ? 0 : -8, border: `3px solid ${BG}` }}>
                  <img src={src} width={24} height={24} alt="" />
                </div>
              ))}
              <div style={{ display: 'flex', width: 54, height: 2, marginLeft: 18, background: `linear-gradient(to right, ${QUIET}, ${GREEN})` }} />
              <div style={{ display: 'flex', alignItems: 'center', marginLeft: 12, padding: '10px 18px', borderRadius: 999, background: GREEN, color: ON_GREEN, fontSize: 19, fontWeight: 600 }}>Deal agreed</div>
            </div>
          </div>

          <div style={{ display: 'flex', fontSize: 20, fontWeight: 500, color: QUIET }}>karwan.site</div>
        </div>

        <div style={{ position: 'absolute', left: 790, top: 70, display: 'flex', transform: 'rotate(-7deg)' }}>
          <div style={{ position: 'absolute', left: 12, top: 14, width: 312, height: 600, borderRadius: 52, display: 'flex', background: 'linear-gradient(to right, #1B1D20, #4A4F56 50%, #1B1D20)' }} />
          <div style={{ position: 'relative', display: 'flex', width: 312, height: 600, borderRadius: 52, padding: 2, background: 'linear-gradient(150deg, #6B7179, #2A2D32 40%, #4A4F56)', boxShadow: '0 40px 90px rgba(0,0,0,0.7)' }}>
            <div style={{ display: 'flex', width: '100%', height: '100%', borderRadius: 50, padding: 10, background: '#08080A' }}>
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', borderRadius: 40, background: BG, padding: '16px 22px', color: INK }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <div style={{ display: 'flex', width: 86, height: 24, borderRadius: 12, background: '#000' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', fontSize: 15, color: QUIET }}>
                  <img src={PLATFORMS[0]} width={16} height={16} alt="" />
                  <span style={{ marginLeft: 8 }}>From your TikTok chat</span>
                </div>
                <div style={{ display: 'flex', marginTop: 10, padding: '10px 14px', borderRadius: 14, background: RAISED, fontSize: 16, lineHeight: 1.4 }}>Can you make 200 tote bags with our artwork?</div>
                <div style={{ display: 'flex', marginTop: 20, fontSize: 15, color: QUIET }}>Agreed terms</div>
                <div style={{ display: 'flex', marginTop: 4, fontSize: 22, fontWeight: 600 }}>200 custom tote bags</div>
                <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 42, fontWeight: 600, letterSpacing: -1 }}>1,240</span>
                  <span style={{ marginLeft: 8, fontSize: 16, color: MUTE, fontWeight: 600 }}>USDC</span>
                </div>
                <Row k="Delivery" v="14 days" />
                <Row k="Tunde · buyer" v="Agreed" green />
                <Row k="Ada · seller" v="Agreed" green />
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 16, height: 46, borderRadius: 23, background: GREEN, color: ON_GREEN, fontSize: 16, fontWeight: 600 }}>Pay into escrow</div>
              </div>
            </div>
          </div>
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
