import type { ConfirmAction } from '../assistant/actions.js';
import type { OutMessage } from './render.js';

/// Steps that move money. On a chat channel these are never confirmed by a
/// chat button: the person opens Karwan, sees every figure, and confirms
/// there. Chat keeps everything else: terms, delivery, extensions, disputes.
export const MONEY_INTENTS: ReadonlySet<ConfirmAction['intent']> = new Set<ConfirmAction['intent']>([
  'fund_direct_deal',
  'release_milestone',
  'cancel_deal',
  'approve_match',
  'choose_offer',
  'withdraw_proceeds',
  'fund_agent',
  'cash_out',
  'top_up_to_arc',
  'guarantee_put_up',
  'claim_yield',
  'guarantee_collect',
  'legacy_step',
  'finance_accept',
  'finance_offer',
  'finance_pay_seller',
  'contest_post',
  'contest_award',
  'contest_cancel',
  'work_offer',
  'work_fund',
  'work_approve',
  'work_object',
  'work_cancel',
  'claim_payment',
  'take_back_deal',
  'accept_offer',
  'near_miss_proceed',
  'pay_payment_link',
  'add_research_credit',
]);

const JOB_ID = /^0x[0-9a-fA-F]{64}$/;

/// The Karwan page where this money step is confirmed, or null when the card
/// does not carry what the page needs.
export function moneyStepPath(action: ConfirmAction): string | null {
  const jobId = (action.payload as { jobId?: unknown }).jobId;
  const job = typeof jobId === 'string' && JOB_ID.test(jobId) ? jobId : null;
  switch (action.intent) {
    case 'fund_direct_deal':
    case 'release_milestone':
    case 'cancel_deal':
    case 'finance_accept':
    case 'claim_payment':
    case 'take_back_deal':
      return job ? `/deals/${job}` : null;
    case 'finance_offer':
    case 'finance_pay_seller':
      return '/financier';
    case 'contest_post': {
      const p = action.payload as { title?: string; brief?: string; prizeUsdc?: string; places?: number; entriesDays?: number; awardDays?: number };
      if (!p.title || !p.brief || !p.prizeUsdc || !p.places || !p.entriesDays) return null;
      const q = new URLSearchParams({ title: p.title, brief: p.brief, prize: p.prizeUsdc, places: String(p.places), days: String(p.entriesDays), ...(p.awardDays ? { pick: String(p.awardDays) } : {}) });
      return `/contests/new?${q.toString()}`;
    }
    case 'contest_award':
    case 'contest_cancel': {
      const id = (action.payload as { contestId?: unknown }).contestId;
      return typeof id === 'string' && /^c_[A-Za-z0-9_-]{1,40}$/.test(id) ? `/contests/${id}` : null;
    }
    case 'work_offer': {
      const p = action.payload as { worker?: string; kind?: string; rateUsdc?: string; maxHours?: number; periods?: number; startsInDays?: number; title?: string; brief?: string };
      if (!p.worker || !p.kind || !p.rateUsdc || !p.periods || !p.title) return null;
      const q = new URLSearchParams({
        to: p.worker, kind: p.kind, rate: p.rateUsdc, periods: String(p.periods), title: p.title,
        ...(p.maxHours ? { hours: String(p.maxHours) } : {}), ...(p.startsInDays ? { starts: String(p.startsInDays) } : {}), ...(p.brief ? { brief: p.brief } : {}),
      });
      return `/work/new?${q.toString()}`;
    }
    case 'work_fund':
    case 'work_approve':
    case 'work_object':
    case 'work_cancel': {
      const id = (action.payload as { workId?: unknown }).workId;
      return typeof id === 'string' && /^w_[A-Za-z0-9_-]{1,40}$/.test(id) ? `/work/${id}` : null;
    }
    case 'approve_match':
    case 'choose_offer':
    case 'accept_offer':
    case 'near_miss_proceed':
      return job ? `/jobs/${job}` : null;
    case 'withdraw_proceeds':
    case 'fund_agent':
      return '/account';
    case 'cash_out':
      return '/bridge?direction=out';
    case 'top_up_to_arc':
      return '/bridge?direction=in';
    case 'add_research_credit':
      return '/profile/agent-funds';
    case 'pay_payment_link': {
      const token = (action.payload as { token?: unknown }).token;
      return typeof token === 'string' && /^[0-9a-f-]{36}$/.test(token) ? `/deposit/request/${token}` : null;
    }
    case 'guarantee_put_up':
    case 'claim_yield':
    case 'guarantee_collect':
      return '/guarantee';
    case 'legacy_step':
      return '/legacy';
    default:
      return null;
  }
}

/// How every chat channel shows a money card: as a one-time link to the
/// Karwan page where the person sees every figure and confirms. A card shown
/// this way is never kept, so no chat tap can confirm it.
export function createMoneyStepPresenter(deps: {
  webBase: string;
  /// A one-time sign-in link for an account Karwan holds the keys of, or null.
  openLink: (address: string, path: string) => Promise<string | null>;
}) {
  return async function presentConfirm(address: string, action: ConfirmAction): Promise<OutMessage | null> {
    if (!MONEY_INTENTS.has(action.intent)) return null;
    const path = moneyStepPath(action);
    const details = [action.title, action.summary, ...action.fields.map((f) => `${f.label}: ${f.value}`), action.warning]
      .filter(Boolean)
      .join('\n');
    if (!path) return { kind: 'text', body: `${details}\n\nOpen Karwan to finish this step.` };
    const signedIn = await deps.openLink(address, path);
    const how = 'You confirm this on Karwan, where you see every figure before money moves.';
    return {
      kind: 'link',
      body: signedIn ? `${details}\n\n${how} The link works once, within 10 minutes.` : `${details}\n\n${how}`,
      label: 'Open in Karwan',
      url: signedIn ?? `${deps.webBase}${path}`,
    };
  };
}
