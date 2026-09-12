/** A successful scoped read is evidence, not a tool call or an action card.
 * This checks evidence coverage, not whether every generated sentence is true.
 */
type Message = { role: string; content: string };
type Step = { toolCalls?: unknown[]; toolResults?: ReadonlyArray<{ toolName: string; output: unknown; input?: unknown }> };

const accountTools = new Set([
  'get_my_balance', 'list_bridge_sources', 'list_my_deals', 'get_deal_status',
  'recall_activity', 'get_my_stake', 'get_my_reputation', 'get_my_market_activity',
  'whats_pending', 'get_my_financing', 'get_my_profile', 'get_my_skills',
  'check_top_up_sources', 'get_my_workspaces',
]);
const subjects: Array<[RegExp, string[]]> = [
  [/(?:\b(?:balance|solde|salio)\b|رصيد|शेष)/iu, ['get_my_balance', 'list_bridge_sources', 'check_top_up_sources']],
  [/\b(?:stake|staking|yield)\b/i, ['get_my_stake']],
  [/\b(?:business|workspace|registration)\b/i, ['get_my_workspaces']],
  [/\b(?:reputation|score|tier)\b/i, ['get_my_reputation']],
  [/\b(?:skills?|certificate)\b/i, ['get_my_skills']],
  [/\b(?:financing|factoring|invoice|loan)\b/i, ['get_my_financing']],
  [/\b(?:bridge|transfer|transaction|receipt|cash[ -]?out)\b/i, ['recall_activity', 'get_deal_status']],
  [/\b(?:deals?|escrow)\b/i, ['get_deal_status', 'list_my_deals']],
  [/\b(?:delivery|refund|reclaim|world|cre)\b/i, ['get_deal_status']],
  [/\b(?:offers?|requests?|matches|matching|bids?)\b/i, ['get_my_market_activity', 'whats_pending']],
  [/\bprofile\b/i, ['get_my_profile']],
  [/\b(?:anything pending|everything|attention)\b/i, ['whats_pending']],
];

function successful(output: unknown): boolean {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return false;
  const value = output as Record<string, unknown>;
  return Object.keys(value).length > 0 && !('error' in value) && value.ok !== false
    && value.partial !== true && value.available !== false;
}

export function assessGrounding(messages: Message[], steps: readonly Step[]) {
  // Earlier chat is untrusted context, never evidence. A follow-up without a
  // subject still requires a fresh successful account read on this turn.
  const questions = messages.filter((m) => m.role === 'user').map((m) => m.content);
  const latest = questions.at(-1) ?? '';
  const question = subjects.some(([pattern]) => pattern.test(latest))
    ? latest
    : questions.slice(0, -1).reverse().find((q) => subjects.some(([pattern]) => pattern.test(q))) ?? latest;
  const reads = steps.flatMap((s) => s.toolResults ?? [])
    .filter((r) => accountTools.has(r.toolName) && successful(r.output));
  const used = new Set(reads.map((r) => r.toolName));
  const missing = subjects.filter(([pattern, tools]) => pattern.test(question) && !tools.some((name) => used.has(name)))
    .map(([, tools]) => tools.join(' or '));
  const dealIds = [...new Set(question.match(/0x[0-9a-f]{64}\b/gi)?.map((id) => id.toLowerCase()) ?? [])];
  for (const id of dealIds) {
    if (!reads.some((r) => r.toolName === 'get_deal_status'
      && (r.output as Record<string, unknown>).jobId?.toString().toLowerCase() === id)) {
      missing.push('get_deal_status for the requested deal');
    }
  }
  return { grounded: reads.length > 0 && missing.length === 0, tools: [...used], missing };
}
