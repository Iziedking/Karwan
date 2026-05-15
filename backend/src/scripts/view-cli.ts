// Read-only CLI to inspect the running Karwan marketplace.
// Usage:  npm run view -- agents | proposals | jobs | watch [jobId]
//
// Talks to the running backend over HTTP, so it works whether you're using
// Postgres or the flat-file fallback. Output is ANSI-colored plain text.

const BASE = process.env.BACKEND_URL ?? 'http://localhost:8787';

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const c = (color: keyof typeof C, s: string | number) => `${C[color]}${s}${C.reset}`;

function short(addr: string | null | undefined, head = 6, tail = 4): string {
  if (!addr) return '—';
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

function rel(ts: number | undefined | null): string {
  if (!ts) return '—';
  const dt = (Date.now() - ts) / 1000;
  if (dt < 60) return `${Math.round(dt)}s ago`;
  if (dt < 3600) return `${Math.round(dt / 60)}m ago`;
  if (dt < 86400) return `${Math.round(dt / 3600)}h ago`;
  return `${Math.round(dt / 86400)}d ago`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    throw new Error(`${path} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

interface AdminUser {
  userAddress: string;
  displayName: string | null;
  role: 'buyer' | 'seller' | 'both' | null;
  buyerAgent: string;
  sellerAgent: string;
  seller: {
    skills: string[];
    bio: string;
    minBudgetUsdc: number;
    maxBudgetUsdc: number;
    minDeadlineDays: number;
    maxDeadlineDays: number;
    keywords?: string[];
  } | null;
  buyer: {
    maxBudgetUsdc: number;
    minDeadlineDays: number;
    maxDeadlineDays: number;
    bidCollectionSeconds: number;
    milestonePcts: number[];
  } | null;
  activatedAt: number;
}

interface AdminProposal {
  jobId: string;
  buyerUser: string;
  sellerUser: string;
  agreedPriceUsdc: string;
  deadlineUnix: number;
  proposedAt: number;
  approvedAt?: number;
  declinedAt?: number;
}

interface BuyerJob {
  jobId: string;
  buyer: string;
  budgetUsdc: string;
  deadlineUnix: number;
  finalized: boolean;
  escrowFunded: boolean;
  bids: Array<{ seller: string; priceUsdc: string; score: number | null }>;
}

async function cmdAgents() {
  const { users } = await fetchJson<{ users: AdminUser[] }>('/api/admin/agents');
  if (users.length === 0) {
    console.log(c('dim', 'no activated users yet'));
    return;
  }
  console.log(c('bold', `\n${users.length} activated user${users.length === 1 ? '' : 's'}\n`));
  for (const u of users) {
    const name = u.displayName ?? c('dim', '(no name)');
    const role = u.role ?? c('dim', 'unset');
    console.log(`${c('bold', name)}  ${c('dim', short(u.userAddress, 8, 6))}  ${c('cyan', `[${role}]`)}  ${c('dim', `activated ${rel(u.activatedAt)}`)}`);
    console.log(`  ${c('dim', 'buyer agent ')}${short(u.buyerAgent, 8, 6)}    ${c('dim', 'seller agent ')}${short(u.sellerAgent, 8, 6)}`);
    if (u.seller) {
      console.log(
        `  ${c('green', 'seller')}  skills: ${c('bold', u.seller.skills.join(', '))}  budget ${u.seller.minBudgetUsdc}-${u.seller.maxBudgetUsdc} USDC  deadlines ${u.seller.minDeadlineDays}-${u.seller.maxDeadlineDays}d`,
      );
      if (u.seller.bio) console.log(`          ${c('dim', `"${u.seller.bio.slice(0, 120)}"`)}`);
      if (u.seller.keywords && u.seller.keywords.length > 0) {
        console.log(`          ${c('dim', 'keywords:')} ${c('magenta', u.seller.keywords.join(' · '))}`);
      }
    }
    if (u.buyer) {
      console.log(
        `  ${c('blue', 'buyer ')}  max budget ${u.buyer.maxBudgetUsdc} USDC  deadlines ${u.buyer.minDeadlineDays}-${u.buyer.maxDeadlineDays}d  milestones ${u.buyer.milestonePcts.join('/')}%`,
      );
    }
    console.log();
  }
}

async function cmdProposals() {
  const { proposals } = await fetchJson<{ proposals: AdminProposal[] }>('/api/admin/proposals');
  if (proposals.length === 0) {
    console.log(c('dim', 'no match proposals in memory'));
    return;
  }
  console.log(c('bold', `\n${proposals.length} match proposal${proposals.length === 1 ? '' : 's'}\n`));
  for (const p of proposals) {
    const state = p.approvedAt
      ? c('green', '✓ approved')
      : p.declinedAt
        ? c('red', '✗ declined')
        : c('yellow', '⏳ pending');
    console.log(`${state}  ${c('bold', `${p.agreedPriceUsdc} USDC`)}  ${c('dim', short(p.jobId, 10, 6))}`);
    console.log(`         buyer ${short(p.buyerUser, 8, 6)}  →  seller ${short(p.sellerUser, 8, 6)}`);
    console.log(`         ${c('dim', `proposed ${rel(p.proposedAt)}`)}`);
    console.log();
  }
}

async function cmdJobs() {
  const { jobs } = await fetchJson<{ jobs: BuyerJob[] }>('/api/admin/jobs');
  if (jobs.length === 0) {
    console.log(c('dim', 'no tracked jobs in memory'));
    return;
  }
  console.log(c('bold', `\n${jobs.length} tracked job${jobs.length === 1 ? '' : 's'}\n`));
  for (const j of jobs) {
    const state = j.escrowFunded
      ? c('green', '● funded')
      : j.finalized
        ? c('yellow', '● matched')
        : c('cyan', '● bidding');
    console.log(`${state}  ${c('bold', `${j.budgetUsdc} USDC`)}  ${c('dim', short(j.jobId, 10, 6))}  buyer ${short(j.buyer, 8, 6)}`);
    if (j.bids.length === 0) {
      console.log(`         ${c('dim', 'no bids')}`);
    } else {
      for (const b of j.bids) {
        const score = b.score == null ? '—' : `${b.score}/100`;
        console.log(`         ${c('magenta', '↳')} ${short(b.seller, 8, 6)}  ${b.priceUsdc} USDC  ${c('dim', `score ${score}`)}`);
      }
    }
    console.log();
  }
}

async function cmdWatch(jobIdFilter?: string) {
  const url = `${BASE}/api/events`;
  console.log(c('dim', `watching ${url}${jobIdFilter ? `  (filter: ${jobIdFilter})` : ''}`));
  console.log(c('dim', 'ctrl+c to exit\n'));

  const res = await fetch(url, { headers: { Accept: 'text/event-stream' } });
  if (!res.body) {
    console.error(c('red', 'no response body'));
    process.exit(1);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw.startsWith('"ok"')) continue;
      try {
        const event = JSON.parse(raw) as {
          type: string;
          jobId?: string;
          actor?: string;
          ts?: number;
          payload?: Record<string, unknown>;
        };
        if (typeof event === 'object' && event !== null && 'type' in event) {
          if (jobIdFilter && event.jobId && !event.jobId.toLowerCase().startsWith(jobIdFilter.toLowerCase())) continue;
          renderEvent(event);
        }
      } catch {
        // ignore pings (non-JSON timestamps)
      }
    }
  }
}

function renderEvent(e: {
  type: string;
  jobId?: string;
  actor?: string;
  ts?: number;
  payload?: Record<string, unknown>;
}) {
  const ts = e.ts ? new Date(e.ts).toISOString().slice(11, 19) : '--:--:--';
  const typeColor: keyof typeof C =
    e.type.startsWith('bid.') ? 'cyan'
      : e.type.startsWith('counter.') ? 'yellow'
        : e.type.startsWith('agent.skipped') ? 'dim'
          : e.type.startsWith('agent.declined') ? 'red'
            : e.type.startsWith('deal.matched') || e.type.startsWith('deal.match.') ? 'magenta'
              : e.type.startsWith('escrow.') ? 'green'
                : e.type.startsWith('deal.') ? 'green'
                  : 'reset';
  const jobShort = e.jobId ? c('dim', short(e.jobId, 10, 4)) : '';
  const actor = e.actor ? c('dim', `[${e.actor}]`) : '';
  console.log(`${c('dim', ts)}  ${c(typeColor, e.type.padEnd(28))}  ${jobShort}  ${actor}`);
  if (e.payload && Object.keys(e.payload).length > 0) {
    const filtered = Object.entries(e.payload)
      .filter(([k]) => k !== 'txHash')
      .map(([k, v]) => `${k}=${shortValue(v)}`)
      .join('  ');
    if (filtered) console.log(`             ${c('dim', filtered)}`);
  }
}

function shortValue(v: unknown): string {
  if (typeof v === 'string' && v.startsWith('0x') && v.length > 12) return short(v, 6, 4);
  if (typeof v === 'object' && v !== null) return JSON.stringify(v).slice(0, 80);
  return String(v);
}

function usage() {
  console.log(`
${c('bold', 'karwan view')}  — read-only marketplace inspector

  ${c('cyan', 'agents')}        list every activated user with their profile and agent addresses
  ${c('cyan', 'proposals')}     list pending and resolved match proposals
  ${c('cyan', 'jobs')}          list tracked agent jobs with their bids
  ${c('cyan', 'watch')} [jobId] tail live SSE events (optionally filtered by jobId prefix)

env BACKEND_URL (default ${BASE})
`);
}

async function main() {
  const cmd = process.argv[2];
  try {
    switch (cmd) {
      case 'agents':
        await cmdAgents();
        break;
      case 'proposals':
        await cmdProposals();
        break;
      case 'jobs':
        await cmdJobs();
        break;
      case 'watch':
        await cmdWatch(process.argv[3]);
        break;
      default:
        usage();
        process.exit(cmd ? 1 : 0);
    }
  } catch (err) {
    console.error(c('red', (err as Error).message));
    process.exit(1);
  }
}

main();
