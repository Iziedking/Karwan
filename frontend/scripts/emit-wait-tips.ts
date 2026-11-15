/// Writes the English deal and safety tips for the backend, which sends one
/// on a slow Telegram turn (view 84). The page's copy file is the one source.
/// `npm run emit:wait-tips`  ·  `npm run check:wait-tips` fails when stale.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assistantTipsCopy } from '../shared/i18n/messages/assistantTips';

const DEST = resolve(process.cwd(), '..', 'backend', 'src', 'channels', 'waitTips.json');
const body = `${JSON.stringify({ deal: assistantTipsCopy.en.deal, safety: assistantTipsCopy.en.safety }, null, 2)}\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(DEST, 'utf8');
  } catch {
    // missing counts as stale
  }
  if (current.replace(/\r\n/g, '\n') !== body) {
    console.error('backend/src/channels/waitTips.json is out of date. Run: npm run emit:wait-tips');
    process.exit(1);
  }
  console.log('wait tips ok');
} else {
  writeFileSync(DEST, body);
  console.log(`wrote ${DEST}`);
}
