export type AssistantSafetyMessage = { role: 'user' | 'assistant'; content: string };

/**
 * Account, money, and workflow questions must be answered from the signed-in
 * read model. A provider fallback has no session tools, so allowing it to
 * answer these prompts would turn a temporary tool outage into a confident
 * guess. Static product questions may still use the provider chain.
 */
const SMALL_TALK =
  /^(?:(?:ok(?:ay)?|great|cool|nice|perfect|awesome|got it|alright|sure)[,!. ]*)?(?:thanks?(?: you)?(?: so much| a lot)?|thx|ty|cheers|ok(?:ay)?|got it|great|cool|nice|perfect|awesome|hello|hi|hey|good (?:morning|afternoon|evening)|bye|goodbye|see you|merci(?: beaucoup)?|bonjour|asante(?: sana)?|habari|shukran|شكرا|مرحبا|धन्यवाद|शुक्रिया|नमस्ते)[\s!.?🙏👍]*$/u;

const ACT_ON_IT =
  /^(?:(?:yes|yeah|yep|ok(?:ay)?|sure|great)[,!. ]*)?(?:(?:please|pls)\s+)?(?:(?:can|could|will|would)\s+you\s+(?:please\s+)?)?(?:go ahead|proceed|do it|do that|confirm|set (?:it|this|that) up|(?:post|create|make|set up|send|publish|list|open|start|book|submit)(?:\s+(?:it|this|that|them|one))?(?:\s+for me)?)(?:\s+(?:now|please))?[\s!.?]*$/i;

export function requiresLiveAccountState(messages: AssistantSafetyMessage[]): boolean {
  // Only the current turn decides. Joining history made one early balance
  // question turn every later product question stateful. Follow-ups such as
  // "what about now?" still fail closed because they are not generic help.
  const text = (messages.filter((m) => m.role === 'user').at(-1)?.content ?? '').toLowerCase();
  // Thanks, greetings and goodbyes on their own carry no account claim. Without
  // this a plain "thanks" after a send inherited the send's subjects and failed
  // closed as if the account could not be read.
  if (SMALL_TALK.test(text.trim())) return false;
  // "Post it", "go ahead", "can you set it up": an instruction to act on what
  // was just discussed. The agent prepares a card or asks for what is missing;
  // any money step still needs the person's confirmation, so there is no
  // account claim here to hold back.
  if (ACT_ON_IT.test(text.trim())) return false;
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
  const personal = (t: string) => /\b(?:my|mine|our|ours|your)\b/.test(t)
    || /\b(?:mon|ma|mes|notre|nos|moi|mien|solde|salio|yangu|zetu)\b/.test(t)
    || /(?:رصيدي|حسابي|معاملتي|تحققي|मेरे|मेरा|मेरी|खाता|शेष)/u.test(t)
    || /\b(?:am i|have i|did i|can i still|is it still|what about it|what happened|verify me)\b/.test(t)
    || /0x[0-9a-f]{40,64}\b/i.test(t)
    || /\bkwn-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}\b/i.test(t)
    || /\b(?:verification|registration|ticket|world|cre|business)\s+(?:status|state|result|pending)\b/.test(t);
  const personalContext = personal(text);
  // A narrow generic-help allowance, not an assumption that unrecognised
  // wording is public. Unknown intent stays on the authenticated tool path.
  const genericHelp = /(?:\b(?:how|what|where|why|does|can|is|are|explain|describe|comment|fonctionne|expliquer|nini|jinsi)\b|كيف|ما هو|कैसे|क्या)/u.test(text)
    && /(?:\b(?:karwan|platform|trade|trading|agent|matching|business|world|cre|settings|support|profile|market|roadmap)\b|كاروان|कारवान)/u.test(text);
  // Asking Karwan to find, browse or create something in its market is help
  // too. The agent still runs its tools; this only stops a missing account
  // read from blocking an answer that is not about the account.
  const marketAction = /\b(?:find|browse|search|look for|post|create|make|list|sell|buy|hire|get)\b/.test(text)
    && /\b(?:sellers?|buyers?|customers?|clients?|suppliers?|freelancers?|market|marketplace|offers?|requests?|listings?|services?|payment links?|pay links?)\b/.test(text);
  // A deal being built is answered (see startsDeal). The answers that follow
  // ("20 usdc", "next friday") belong to the same build while the assistant's
  // last reply asked for them.
  const users = messages.filter((m) => m.role === 'user');
  const lastReply = messages.filter((m) => m.role === 'assistant').at(-1)?.content.trim() ?? '';
  const replying = messages.at(-1)?.role === 'user' && messages.at(-2)?.role === 'assistant' && lastReply.endsWith('?');
  const building = replying && users.slice(0, -1).some((m) => startsDeal(m.content.toLowerCase()));
  // "My first deal" names a deal that does not exist yet, so it is not personal.
  const aboutNewDeal = text.replace(/\bmy\s+(?:first|new|next|own)\s+(?:deals?|agreements?|contracts?)\b/g, 'a deal');
  if ((startsDeal(text) || building) && !outcomeOrAttention && !personal(aboutNewDeal)) return false;
  return moneyOrAccount || outcomeOrAttention || personalContext || !(genericHelp || marketAction);
}

/// "Open a deal with @lawful for 3 logo designs", or just "I want to make my
/// first deal": building a deal is a conversation, and its replies are
/// questions (who with, how much, by when). Nothing is claimed about the
/// account and nothing moves until the person confirms the card. Asking about a
/// deal that already exists is personal or an outcome, and stays stateful.
function startsDeal(text: string): boolean {
  return /\b(?:open|start|create|make|set ?up|draft|begin|send)\b(?:\s+\S+){0,3}?\s+(?:deals?|agreements?|contracts?)\b/.test(text);
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

/// Whether a reply states something about this person's account: what they
/// hold, what moved, where a deal or request stands, what is pending. Questions
/// back to the person, explanations of how Karwan works and "found them" from
/// a tag check claim nothing about the account and need no read behind them.
export function claimsAccountState(reply: string): boolean {
  const statements = reply
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && !s.endsWith('?'));
  return statements.some((s) =>
    /\byour\s+(?:balance|wallet|account|deals?|requests?|offers?|payments?|transfers?|stake|reputation|tier|funds|money|agents?|links?)\b(?!\s+(?:here|on karwan)\b)/.test(s)
    || /\byou\s+(?:have|hold|own|received|got|sent|paid|owe|earned|are owed)\b/.test(s)
    || /\b(?:went through|was (?:sent|paid|received|released|refunded|funded|cancelled)|were (?:sent|paid|received)|is (?:funded|released|pending|live|settled|complete|completed|paid|stuck|on its way)|has (?:been )?(?:paid|sent|arrived|landed|settled|failed|cleared))\b/.test(s)
    || /\b(?:nothing|no(?:thing)?\s+\w+)\s+is\s+pending\b/.test(s)
    || /\b\d[\d,]*(?:\.\d+)?\s*(?:usdc|usd)\b.*\b(?:balance|available|received|sent|paid|pending|held|in escrow|on arc)\b/.test(s)
    || /\b(?:balance|available|received|sent|paid|held)\b.*\b\d[\d,]*(?:\.\d+)?\s*(?:usdc|usd)\b/.test(s));
}

/// A reply is held back only when it states something about the account
/// (see claimsAccountState) and no fresh read backs it. Questions, how-to and
/// a prepared card's wording are answered as they are.
export function mayAnswer(input: { needsLiveState: boolean; grounded: boolean; subjects: number; reply?: string }): boolean {
  if (!input.needsLiveState || input.grounded || input.subjects === 0) return true;
  return input.reply !== undefined && !claimsAccountState(input.reply);
}
