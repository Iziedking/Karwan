#!/usr/bin/env node
/// Renders Home Updates images from a cards file:
///   node scripts/update-art/render.mjs <cards.json> [--out <dir>] [--guides]
/// Each card becomes <name>.webp (1600x900, for /admin/updates) and
/// previews/<name>-crops.png (how the home strip crops it on phone, tablet and
/// desktop; never published).
/// Logo and screen paths are relative to the cards file.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCards, sharpnessWarning } from './spec.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const { chromium } = createRequire(path.join(repo, 'frontend/package.json'))('@playwright/test');

const args = process.argv.slice(2);
const specPath = args.find((a) => !a.startsWith('--'));
const outArg = args.indexOf('--out');
const outDir = path.resolve(outArg >= 0 ? args[outArg + 1] : path.join(repo, 'frontend/public/media/updates'));
const guides = args.includes('--guides');
if (!specPath) {
  console.error('usage: node scripts/update-art/render.mjs <cards.json> [--out <dir>] [--guides]');
  process.exit(2);
}

const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf' };
async function dataUrl(file) {
  const type = MIME[path.extname(file).toLowerCase()];
  if (!type) throw new Error(`${file}: use svg, png, jpg or webp`);
  return `data:${type};base64,${(await readFile(file)).toString('base64')}`;
}

/// The tile slot's sizes in UpdatesCarousel: phone, two-up tablet, three-up desktop.
const CROPS = [[320, 180], [342, 212], [317, 212]];

const specDir = path.dirname(path.resolve(specPath));
const { cards, errors } = checkCards(JSON.parse(await readFile(specPath, 'utf8')));
if (errors.length) {
  for (const e of errors) console.error(e);
  process.exit(1);
}

const font = async (file, weight) =>
  `@font-face { font-family: 'General Sans'; font-weight: ${weight}; src: url(${await dataUrl(path.join(repo, 'frontend/public/og', file))}) format('truetype'); }`;
const fontCss = (await font('GeneralSans-Medium.ttf', 500)) + (await font('GeneralSans-Semibold.ttf', 600));
const mark = await dataUrl(path.join(repo, 'frontend/public/brand/karwan-mark-lime.svg'));
const template = await readFile(path.join(here, 'art.html'), 'utf8');

const previewDir = path.join(here, 'previews');
await mkdir(outDir, { recursive: true });
await mkdir(previewDir, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  for (const card of cards) {
    const art = { ...card, mark, fontCss, guides };
    if (card.logo) art.logo = await dataUrl(path.resolve(specDir, card.logo));
    if (card.screen) art.screen = await dataUrl(path.resolve(specDir, card.screen));

    // The screen layout needs the source's shape before it lays out.
    for (const kind of ['logo', 'screen']) {
      if (!art[kind]) continue;
      const size = await page.evaluate(async (src) => {
        const i = new Image();
        i.src = src;
        await i.decode();
        return [i.naturalWidth, i.naturalHeight];
      }, art[kind]);
      if (kind === 'screen') art.screenRatio = size[0] / size[1];
      const warning = sharpnessWarning(card, kind, size[0], size[1], art[kind].startsWith('data:image/svg'));
      if (warning) console.warn(`warning: ${warning}`);
    }

    // A fresh document per card: the template's globals would clash otherwise.
    await page.goto('about:blank');
    await page.setContent(template.replace('<script>', `<script>window.ART = ${JSON.stringify(art)};</script><script>`));
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.fit?.();
      await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    });
    const png = await page.screenshot({ type: 'png' });

    const webp = await page.evaluate(async (src) => {
      const i = new Image();
      i.src = src;
      await i.decode();
      const c = document.createElement('canvas');
      c.width = 1600;
      c.height = 900;
      c.getContext('2d').drawImage(i, 0, 0);
      return c.toDataURL('image/webp', 0.9);
    }, `data:image/png;base64,${png.toString('base64')}`);
    if (!webp.startsWith('data:image/webp')) throw new Error('this browser cannot write WebP');
    const file = path.join(outDir, `${card.name}.webp`);
    const bytes = Buffer.from(webp.split(',')[1], 'base64');
    await writeFile(file, bytes);

    const crops = await browser.newPage({ viewport: { width: 1060, height: 260 }, deviceScaleFactor: 2 });
    await crops.setContent(`<body style="margin:0;padding:24px;display:flex;gap:24px;align-items:flex-start;background:#F7F7F4">${CROPS.map(
      ([w, h]) => `<img src="${webp}" style="width:${w}px;height:${h}px;object-fit:cover;border-radius:20px 20px 0 0;display:block">`,
    ).join('')}</body>`);
    await crops.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    await crops.screenshot({ path: path.join(previewDir, `${card.name}-crops.png`) });
    await crops.close();

    console.log(`${path.relative(repo, file)}  ${Math.round(bytes.length / 1024)} KB`);
  }
} finally {
  await browser.close();
}
