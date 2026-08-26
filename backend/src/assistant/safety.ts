export type AssistantSafetyMessage = { role: 'user' | 'assistant'; content: string };

/**
 * Account, money, and workflow questions must be answered from the signed-in
 * read model. A provider fallback has no session tools, so allowing it to
 * answer these prompts would turn a temporary tool outage into a confident
 * guess. Static product questions may still use the provider chain.
 */
export function requiresLiveAccountState(messages: AssistantSafetyMessage[]): boolean {
  const text = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ')
    .toLowerCase();
  // Keep the classifier conservative. A generic product question such as
  // “how does agent matching work?” is static knowledge and may use the
  // provider fallback. Account-specific wording, money verbs, and outcome
  // language must consult the signed-in read model or fail closed.
  const moneyOrAccount =
    /\b(balance|wallet|transaction|transfer|bridge|cash[ -]?out|fund(?:ing)?|withdraw(?:al)?|stake(?:d|ing)?|yield|escrow|settlement|repay(?:ment)?)\b/.test(text) ||
    /\b(my|your)\s+(?:account|agent|wallet|balance|money|funds|trade|deal|match|transaction|transfer|bridge|stake|yield)\b/.test(text) ||
    /\b(?:account|agent|wallet|balance|money|funds|trade|deal|match(?:es)?|transaction|transfer|bridge|stake|yield)\s+(?:status|state|balance|history|record|result)\b/.test(text);
  const outcomeOrAttention =
    /\b(?:failed|failure|in flight|pending|not enough|didn'?t|hasn'?t|went through|go through|succeed(?:ed)?|complete(?:d)?|what needs my attention|anything pending|what(?:'s| is) the status)\b/.test(text);
  return moneyOrAccount || outcomeOrAttention;
}
