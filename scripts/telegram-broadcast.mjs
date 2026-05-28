#!/usr/bin/env node
// Broadcasts a Markdown message to every Karwan user who has linked their
// Telegram account. Run from the VPS so it can reach both stores:
//
//   - Postgres (preferred if DATABASE_URL is set)
//   - data/telegram-links.json (flat-file fallback)
//
// Usage:
//   node scripts/telegram-broadcast.mjs --message "Your *Markdown* text"
//   node scripts/telegram-broadcast.mjs --file ./notice.md
//   node scripts/telegram-broadcast.mjs --message "..." --dry-run
//   node scripts/telegram-broadcast.mjs --message "..." --rate 20
//
// Env (read from ~/karwan/.env or the process env):
//   TELEGRAM_BOT_TOKEN   required
//   DATABASE_URL         optional (falls back to data/telegram-links.json)
//   KARWAN_HOME          path to ~/karwan (defaults to $HOME/karwan)
//
// Telegram limits bulk sends to roughly 30 messages/second across all chats.
// Default rate is 20/s with a small jitter to stay well under.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const args = parseArgs(process.argv.slice(2));

if (args.help || (!args.message && !args.file)) {
  console.log(`Usage:
  node scripts/telegram-broadcast.mjs --message "Your Markdown text"
  node scripts/telegram-broadcast.mjs --file notice.md
  node scripts/telegram-broadcast.mjs --message "..." --dry-run
  node scripts/telegram-broadcast.mjs --message "..." --rate 20
`);
  process.exit(args.help ? 0 : 1);
}

const message = args.file ? readFileSync(args.file, 'utf8') : String(args.message);
const dryRun = args['dry-run'] === true;
const rate = Number(args.rate ?? 20);
if (!Number.isFinite(rate) || rate < 1 || rate > 28) {
  console.error('--rate must be between 1 and 28 (Telegram caps bulk sends ~30/s)');
  process.exit(1);
}

// Load .env from the conventional VPS layout so DATABASE_URL +
// TELEGRAM_BOT_TOKEN are picked up without the operator exporting them.
const karwanHome = process.env.KARWAN_HOME || resolve(process.env.HOME || '.', 'karwan');
loadDotEnv(resolve(karwanHome, '.env'));

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN missing. Source ~/karwan/.env or export it.');
  process.exit(1);
}

const links = await loadLinks(karwanHome);
if (links.length === 0) {
  console.error('No Telegram links found in Postgres or data/telegram-links.json.');
  process.exit(1);
}

console.log(`[broadcast] ${dryRun ? 'DRY RUN — ' : ''}sending to ${links.length} chat(s) at ~${rate}/s`);
console.log('[broadcast] message preview:');
console.log('---');
console.log(message);
console.log('---');
if (!dryRun) await sleep(2000);

let sent = 0;
let failed = 0;
const failures = [];
const delayMs = Math.ceil(1000 / rate);

for (const link of links) {
  if (dryRun) {
    sent += 1;
    continue;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: link.chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });
    if (res.ok) {
      sent += 1;
    } else {
      const body = await res.text();
      failed += 1;
      failures.push({ chatId: link.chatId, address: link.address, status: res.status, body });
      // Telegram returns 429 with a retry_after seconds field when we hit
      // the per-chat-or-global flood limit. Back off and retry once.
      if (res.status === 429) {
        try {
          const parsed = JSON.parse(body);
          const wait = (parsed.parameters?.retry_after ?? 5) * 1000;
          console.log(`[broadcast] 429 received, sleeping ${wait}ms`);
          await sleep(wait);
        } catch {
          await sleep(5000);
        }
      }
    }
  } catch (err) {
    failed += 1;
    failures.push({ chatId: link.chatId, address: link.address, status: 'network', body: err.message });
  }
  await sleep(delayMs + Math.floor(Math.random() * 30));
}

console.log(`[broadcast] sent=${sent} failed=${failed} total=${links.length}`);
if (failures.length > 0) {
  console.log('[broadcast] first 10 failures:');
  for (const f of failures.slice(0, 10)) console.log(`  ${JSON.stringify(f)}`);
}
process.exit(failed > 0 ? 2 : 0);

// ----------------------------- helpers ---------------------------------

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i += 1;
      }
    }
  }
  return out;
}

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

async function loadLinks(karwanHome) {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const pg = await import('pg').catch(() => null);
      if (pg) {
        const { Client } = pg.default;
        const client = new Client({ connectionString: dbUrl });
        await client.connect();
        const r = await client.query('SELECT address, data FROM telegram_links');
        await client.end();
        const out = r.rows
          .map((row) => row.data)
          .filter((d) => d && typeof d.chatId === 'number');
        if (out.length > 0) return out;
        console.log('[broadcast] Postgres returned 0 links, falling back to flat-file');
      } else {
        console.log('[broadcast] node pg module not available, using flat-file');
      }
    } catch (err) {
      console.log(`[broadcast] Postgres read failed (${err.message}), falling back to flat-file`);
    }
  }
  const path = resolve(karwanHome, 'data', 'telegram-links.json');
  if (!existsSync(path)) return [];
  try {
    const obj = JSON.parse(readFileSync(path, 'utf8'));
    return Object.values(obj).filter((d) => d && typeof d.chatId === 'number');
  } catch {
    return [];
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
