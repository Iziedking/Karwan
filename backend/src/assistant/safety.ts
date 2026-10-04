export type AssistantSafetyMessage = { role: 'user' | 'assistant'; content: string };

/**
 * Account, money, and workflow questions must be answered from the signed-in
 * read model. A provider fallback has no session tools, so allowing it to
 * answer these prompts would turn a temporary tool outage into a confident
 * guess. Static product questions may still use the provider chain.
 */
export function requiresLiveAccountState(messages: AssistantSafetyMessage[]): boolean {
  // Only the current turn decides. Joining history made one early balance
  // question turn every later product question stateful. Follow-ups such as
  // "what about now?" still fail closed because they are not generic help.
  const text = (messages.filter((m) => m.role === 'user').at(-1)?.content ?? '').toLowerCase();
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
  const personalContext = /\b(?:my|mine|our|ours|your)\b/.test(text)
    || /\b(?:mon|ma|mes|notre|nos|moi|mien|solde|salio|yangu|zetu)\b/.test(text)
    || /(?:رصيدي|حسابي|معاملتي|تحققي|मेरे|मेरा|मेरी|खाता|शेष)/u.test(text)
    || /\b(?:am i|have i|did i|can i still|is it still|what about it|what happened|verify me)\b/.test(text)
    || /0x[0-9a-f]{40,64}\b/i.test(text)
    || /\bkwn-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}\b/i.test(text)
    || /\b(?:verification|registration|ticket|world|cre|business)\s+(?:status|state|result|pending)\b/.test(text);
  // A narrow generic-help allowance, not an assumption that unrecognised
  // wording is public. Unknown intent stays on the authenticated tool path.
  const genericHelp = /(?:\b(?:how|what|where|why|does|can|is|are|explain|describe|comment|fonctionne|expliquer|nini|jinsi)\b|كيف|ما هو|कैसे|क्या)/u.test(text)
    && /(?:\b(?:karwan|platform|trade|trading|agent|matching|business|world|cre|settings|support|profile|market|roadmap)\b|كاروان|कारवान)/u.test(text);
  // Asking Karwan to find, browse or create something in its market is help
  // too. The agent still runs its tools; this only stops a missing account
  // read from blocking an answer that is not about the account.
  const marketAction = /\b(?:find|browse|search|look for|post|create|make|list|sell|buy|hire|get)\b/.test(text)
    && /\b(?:sellers?|buyers?|customers?|clients?|suppliers?|freelancers?|market|marketplace|offers?|requests?|listings?|services?|payment links?|pay links?)\b/.test(text);
  return moneyOrAccount || outcomeOrAttention || personalContext || !(genericHelp || marketAction);
}

/** Never forward previous assistant replies/account history to a fallback. */
export function staticFallbackMessages(messages: AssistantSafetyMessage[]): AssistantSafetyMessage[] | null {
  if (requiresLiveAccountState(messages)) return null;
  const latest = messages.filter((message) => message.role === 'user').at(-1);
  return latest ? [latest] : null;
}

export function privateAssistantProviders<T extends { name: string }>(providers: T[]): T[] {
  // All /chat requests are authenticated; a keyword miss must not disclose
  // their conversation to a proxy. Preserve the direct-provider boundary.
  // Bedrock runs in Karwan's own AWS account, so it is direct as well.
  return providers.filter((provider) => provider.name === 'anthropic' || provider.name === 'bedrock');
}

/** A proposal can be shown without pretending it is evidence of completion. */
export function proposalReply(actions: ReadonlyArray<{ kind: string }>): string | null {
  if (actions.some((action) => action.kind === 'confirm')) {
    return 'Review the proposed actions below. Nothing has been executed.';
  }
  return null;
}

/// A reply is held back only when it touches the account (balance, deals,
/// payments, transfers and the like) and no fresh read backs it. A question
/// with no account topic, such as a clarification about the market, is
/// answered: there is no account claim in it to check.
export function mayAnswer(input: { needsLiveState: boolean; grounded: boolean; subjects: number }): boolean {
  return !input.needsLiveState || input.grounded || input.subjects === 0;
}
