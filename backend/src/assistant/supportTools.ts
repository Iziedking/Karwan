import { tool } from 'ai';
import { z } from 'zod';
import type { CaseKind, CaseRecord, CaseState } from '../support/caseRules.js';
import type { OpenedCase } from '../support/openCase.js';

/// A person asks for someone from the Karwan team, on any channel (view 78).
/// The assistant asks the facts first, opens or joins a case and gives back
/// the line with its reference. It never fixes, retries or moves anything.

export interface SupportToolDeps {
  open: (address: string, input: { text: string; records: CaseRecord[] }) => Promise<OpenedCase>;
  mine: (address: string) => Promise<Array<{ ref: string; kind: CaseKind; state: CaseState; lastLine: string; updatedAt: number }>>;
  /// False when the case is not this person's.
  add: (address: string, ref: string, text: string) => Promise<boolean>;
}

const KIND: Record<CaseKind, string> = {
  money_in_deal: 'Money held in a deal',
  transfer_missing: 'Transfer did not arrive',
  account: 'Account and sign-in',
  using_karwan: 'Using Karwan',
  other: 'Something else',
};
const STATE: Record<CaseState, string> = { new: 'Waiting on us', waiting_us: 'Waiting on us', waiting_person: 'Answered, waiting on them', solved: 'Solved' };

/// What the Help bot may use: reading the person's own account, the product
/// guide, a button to a page, and cases. Nothing that moves money or changes
/// a setting.
export const HELP_TOOL_NAMES: readonly string[] = [
  'whats_pending',
  'get_product_facts',
  'get_first_trade_steps',
  'get_my_balance',
  'get_my_profile',
  'get_my_market_activity',
  'get_deal_status',
  'list_my_deals',
  'get_money_out_status',
  'get_money_owed',
  'list_stuck_money_moves',
  'find_transaction',
  'explain_error',
  'get_my_agent',
  'what_did_my_agent_do',
  'propose_navigation',
  'open_support_case',
  'my_support_cases',
  'add_to_support_case',
];

const recordSchema = z.object({ kind: z.enum(['deal', 'transfer']), id: z.string().min(4).max(100) });

export function supportTools(address: string, deps: SupportToolDeps) {
  return {
    open_support_case: tool({
      description:
        "Bring in a person from the Karwan team: open a case, or add to the open case about the same deal or transfer. Only when the person asks for someone, or you cannot do or answer it from their account. Ask first what they expected and what happened, and for money which deal or transfer (offer their recent ones from list_my_deals or list_stuck_money_moves). Then give back the line this returns, with the case reference, in your own words. Never promise a fix, a refund or a time other than the one returned.",
      inputSchema: z.object({
        summary: z.string().min(3).max(1000),
        expected: z.string().max(500).optional(),
        happened: z.string().max(500).optional(),
        records: z.array(recordSchema).max(3).optional(),
      }),
      execute: async ({ summary, expected, happened, records }) => {
        const text = [summary, expected ? `Expected: ${expected}` : '', happened ? `What happened: ${happened}` : ''].filter(Boolean).join('\n');
        const r = await deps.open(address, { text, records: records ?? [] });
        if (!r.ok) return { opened: false, note: 'That deal or transfer is not one of theirs. Ask which of their own it is.' };
        return { opened: true, ref: r.ref, joined: r.joined, line: r.line };
      },
    }),

    my_support_cases: tool({
      description: "List the person's cases with the Karwan team: reference, what it is about, where it stands and the last line. For 'any news on my case?', 'what did support say?'.",
      inputSchema: z.object({}),
      execute: async () => ({
        cases: (await deps.mine(address)).map((c) => ({
          ref: c.ref,
          about: KIND[c.kind],
          state: STATE[c.state],
          last: c.lastLine,
          updated: new Date(c.updatedAt).toISOString().slice(0, 10),
        })),
      }),
    }),

    add_to_support_case: tool({
      description: 'Add what the person says to one of their open cases, by reference (KS-1042 or KT-1042), when they want the team to see it.',
      inputSchema: z.object({ ref: z.string().regex(/^K[ST]-\d{4,}$/i), text: z.string().min(1).max(2000) }),
      execute: async ({ ref, text }) =>
        (await deps.add(address, ref.toUpperCase(), text))
          ? { added: true }
          : { added: false, note: 'No case with that reference on this account. my_support_cases lists theirs.' },
    }),
  };
}

/// Help keeps only HELP_TOOL_NAMES; the assistant keeps every tool.
export function toolsForMode<T extends Record<string, unknown>>(tools: T, mode: 'help' | 'assistant' | undefined): T {
  if (mode !== 'help') return tools;
  return Object.fromEntries(Object.entries(tools).filter(([name]) => HELP_TOOL_NAMES.includes(name))) as T;
}
