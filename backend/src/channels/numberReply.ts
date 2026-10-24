/// A numbered list Karwan sent into the chat outside a conversation (the
/// shortlist of a request), kept so a bare number in reply means that list,
/// whatever else is waiting. Without it a "5" an hour later reads as anything,
/// a rating included.

export const CHOICES_TTL_MS = 24 * 60 * 60 * 1000;

export interface ChatChoices {
  kind: 'shortlist';
  jobId: string;
  at: number;
  options: { n: number; seller: string; name: string; priceUsdc: number }[];
}

/// The person's words as the assistant should read them: a bare number that
/// matches the last list becomes the choice it stands for. Anything else, an
/// old list or a number not on it, is left as typed.
export function expandNumberReply(said: string, choices: ChatChoices | null | undefined, now: number): string | null {
  const m = /^\s*#?\s*(\d{1,2})\s*[.)]?\s*$/.exec(said);
  if (!m || !choices || now - choices.at > CHOICES_TTL_MS) return null;
  const pick = choices.options.find((o) => o.n === Number(m[1]));
  if (!pick) return null;
  return `I choose number ${pick.n} on my shortlist for request ${choices.jobId}: ${pick.name} at ${pick.priceUsdc} USDC (seller ${pick.seller}). Prepare the choose card for that offer.`;
}

/// The note written into the chat history with the list, so the assistant can
/// also tell what "the second one" or a name refers to.
export function choicesNote(c: ChatChoices): string {
  return `I sent the shortlist for request ${c.jobId}. A reply with a number chooses that offer: ${c.options
    .map((o) => `${o.n} = ${o.name} at ${o.priceUsdc} USDC (seller ${o.seller})`)
    .join('; ')}.`;
}
