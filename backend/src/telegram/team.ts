import { config } from '../config.js';
import { logger } from '../logger.js';
import { listAllDeals } from '../db/deals.js';
import { sendTelegramMessage, supportOperatorChatId } from './bot.js';

/// Team group greetings: a welcome when someone joins, and a daily good-morning.
///
/// Both post to the staff group. That chat already carries live support
/// transcripts, dispute alerts and business registrations, so it is a working
/// channel rather than a broadcast one, and the daily line is kept to one
/// message. Anything longer belongs in a doc, not in the channel people are
/// watching for a frozen escrow.

const DAY_MS = 24 * 60 * 60 * 1000;

function teamChatId(): number | null {
  return config.TEAM_TELEGRAM_CHAT_ID ?? supportOperatorChatId();
}

function siteBase(): string | null {
  return config.FRONTEND_BASE_URL?.replace(/\/$/, '') ?? null;
}

/// What a new teammate needs in their first minute: what the thing is, and
/// where to look. Not a pitch. They already work here.
export async function welcomeTeamMember(names: string[]): Promise<void> {
  if (!config.TEAM_WELCOME_ENABLED) return;
  const chatId = teamChatId();
  if (chatId === null) return;

  const who = names.length === 1 ? names[0] : names.join(', ');
  const base = siteBase();

  const body = [
    `Welcome ${who}.`,
    '',
    'Karwan is a settlement and credit layer for cross-border SME trade. Money sits in milestone escrow and releases against delivery, and every settled deal writes to a credit record that belongs to the business rather than to us.',
    '',
    'Two things worth knowing on day one. This channel carries real alerts: a disputed escrow is frozen until two arbiter owners sign, so a dispute here is someone waiting on us. And nothing auto-releases at the final milestone, ever. That is the buyer protection the whole product rests on.',
  ].join('\n');

  const buttons = base
    ? [
        { text: 'Product', url: base },
        { text: 'Docs', url: `${base}/docs` },
      ]
    : undefined;

  try {
    await sendTelegramMessage(chatId, body, buttons, { plain: true });
    logger.info({ names }, 'team: welcomed new group member(s)');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'team: welcome failed');
  }
}

/// Rotating daily lines. Deliberately about the work rather than generic
/// motivation: a team reads these every morning, and a bot that says nothing
/// specific gets muted within a week.
///
/// Picked by day number, not at random, so the group does not see the same line
/// twice running and everyone sees the same one.
const DAILY_LINES: readonly string[] = [
  'Escrow only means something if the release rules hold on the worst day, not the average one.',
  'A supplier who gets paid on time twice will take a worse price the third time. Reliability compounds.',
  'The credit record is the product. The escrow is how we earn the right to write it.',
  'Every claim on the site is a promise someone will check. Ship the claim and the code together.',
  'A frozen escrow is a person waiting. Disputes are not a queue, they are somebody stuck.',
  'Trust is expensive to build and cheap to spend. Price it that way.',
  'Cross-border trade fails on verification, not on payment rails. That is the part we are actually solving.',
  'If a rule cannot be explained to the person it costs money, it is the wrong rule.',
  'Reputation that is cheap to climb is a gate that is cheap to fake.',
  'Delivered means dispatched on goods. The container is still at sea. Build like it.',
  'The final milestone never releases on a timer. That line is not negotiable.',
  'Small deals teach us nothing about large ones. Size is its own risk.',
  'An agent that decides is worth something. An agent that automates a form is not.',
  'Nobody reads the terms until the money is stuck. Write them for that moment.',
];

function greeting(now: Date): string {
  const day = now.getUTCDay();
  if (day === 1) return 'gm. New week.';
  if (day === 5) return 'gm. Friday.';
  if (day === 0 || day === 6) return 'gm.';
  return 'gm.';
}

export function dailyMessage(now: Date = new Date()): string {
  const dayNumber = Math.floor(now.getTime() / DAY_MS);
  const line = DAILY_LINES[dayNumber % DAILY_LINES.length];
  return `${greeting(now)}\n\n${line}`;
}

/// Yesterday's activity plus anything sitting unresolved.
///
/// Two halves on purpose. The first is what happened, which is context. The
/// second is what is stuck, which is work: a disputed escrow is frozen until two
/// arbiter owners sign, so an open dispute is a person waiting on us and it
/// belongs in the morning message rather than in a dashboard nobody opens.
///
/// Read from the deal store, NOT from getNetworkStats(). That helper does a
/// multi-contract event scan when its cache is cold, which on a rate-limited RPC
/// means a wall of 429s. A greeting is not worth a rescan, and the store already
/// holds every timestamp this needs. It is the off-chain mirror rather than
/// chain truth, which is the right register for a team note anyway: it reports
/// what the product recorded.
///
/// A quiet day says so rather than printing rows of zeroes. Nobody reads a
/// message that looks the same whether anything moved or not.
async function liveDigest(now: Date): Promise<string | null> {
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startOfYesterday = startOfToday - DAY_MS;
  const inWindow = (t?: number) => !!t && t >= startOfYesterday && t < startOfToday;

  try {
    const deals = await listAllDeals();

    const accepted = deals.filter((d) => inWindow(d.acceptedAt)).length;
    const settled = deals.filter((d) => inWindow(d.settledAt)).length;
    const disputed = deals.filter((d) => inWindow(d.disputedAt)).length;
    const settledUsdc = deals
      .filter((d) => inWindow(d.settledAt))
      .reduce((sum, d) => sum + (Number(d.dealAmountUsdc) || 0), 0);

    const parts: string[] = [];
    if (accepted) parts.push(`${accepted} accepted`);
    if (settled) {
      parts.push(`${settled} settled${settledUsdc > 0 ? ` (${settledUsdc.toFixed(0)} USDC)` : ''}`);
    }
    if (disputed) parts.push(`${disputed} disputed`);
    const activity = parts.length ? `Yesterday: ${parts.join(', ')}.` : 'Yesterday: quiet.';

    const open = deals.filter((d) => d.disputed && !d.settledAt && !d.cancelledAt);
    let waiting: string | null = null;
    if (open.length > 0) {
      const oldest = Math.min(...open.map((d) => d.disputedAt ?? Date.now()));
      const days = Math.floor((Date.now() - oldest) / DAY_MS);
      const age = days >= 1 ? `, oldest ${days}d` : '';
      waiting = `${open.length} dispute${open.length === 1 ? '' : 's'} open${age}. Two owners have to sign.`;
    }

    return [activity, waiting].filter(Boolean).join('\n');
  } catch (err) {
    // Not worth failing the greeting over. Drop the digest and still say gm.
    logger.warn({ err: (err as Error).message }, 'team daily: digest read failed');
    return null;
  }
}

async function postDaily(): Promise<void> {
  const chatId = teamChatId();
  if (chatId === null) return;
  const now = new Date();
  try {
    const digest = await liveDigest(now);
    const base = dailyMessage(now);
    const body = digest ? `${base}\n\n${digest}` : base;
    const site = siteBase();
    const buttons =
      digest?.includes('dispute') && site
        ? [{ text: 'Open disputes', url: `${site}/admin/disputes` }]
        : undefined;
    await sendTelegramMessage(chatId, body, buttons, { plain: true });
    logger.info({ hadDigest: !!digest }, 'team: posted the daily greeting');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'team: daily greeting failed');
  }
}

/// Milliseconds until the next occurrence of the configured UTC hour. Computed
/// each time rather than assuming 24h, so a restart lands on the right slot and
/// the post does not walk forward across days.
export function msUntilNextRun(hourUtc: number, now: Date = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(hourUtc, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

/// Starts the daily greeting. Returns a stop function. No-ops cleanly when
/// disabled or when no chat is configured.
export function startTeamDaily(): () => void {
  if (!config.TEAM_DAILY_ENABLED) return () => {};
  const chatId = teamChatId();
  if (chatId === null) {
    logger.info('team daily: no chat configured; dormant');
    return () => {};
  }

  let timer: NodeJS.Timeout;
  let stopped = false;

  const schedule = () => {
    if (stopped) return;
    const wait = msUntilNextRun(config.TEAM_DAILY_HOUR_UTC);
    timer = setTimeout(() => {
      void postDaily().finally(schedule);
    }, wait);
    // Do not hold the process open for a message that can wait for the next
    // boot.
    timer.unref?.();
  };

  schedule();
  logger.info({ hourUtc: config.TEAM_DAILY_HOUR_UTC, chatId }, 'team daily greeting scheduled');
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
