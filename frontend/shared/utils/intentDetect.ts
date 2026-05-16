// Heuristic post-intent classifier. Returns whether free-form copy reads as
// an OFFER ("I sell X", "X for sale", "available") or a REQUEST ("I need X",
// "looking for X"). Used to catch posts that landed on the wrong surface. a
// "Need a backend engineer" written into the seller-listing form is a quiet
// data-quality trap because the cross-match LLM may still match it to an
// open brief and produce a fake bid.
//
// Rule-based on purpose so it runs instantly with zero deps. Backend layers a
// stricter LLM check on top during matching; this exists to surface the
// mistake to the user BEFORE post.

export type PostIntent = 'offer' | 'request' | 'ambiguous';

const REQUEST_PATTERNS: RegExp[] = [
  /\bneed(?:s|ed|ing)?\s+(?:a|an|some|to)\b/i,
  /\b(?:i'm|i\s+am)\s+looking\s+for\b/i,
  /\blooking\s+for\b/i,
  /\bwant(?:s|ed)?\s+(?:a|an|to\s+hire|someone\s+to)\b/i,
  /\bseek(?:ing|s)?\s+(?:a|an)\b/i,
  /\bhir(?:e|ing)\s+(?:a|an)\b/i,
  /\bhelp\s+me\s+(?:to|with)\b/i,
  /\bcan\s+(?:anyone|someone)\b/i,
  /\bany\s+(?:dev|engineer|designer|writer)s?\s+(?:available|who)\b/i,
  /\b(?:please|pls)\s+(?:build|design|do)\b/i,
];

const OFFER_PATTERNS: RegExp[] = [
  /\bi\s+(?:sell|build|design|do|offer|provide|create|write)\b/i,
  /\b(?:for\s+sale|available\s+for|open\s+for|taking\s+orders)\b/i,
  /\bi\s+have\s+(?:a|an|some)\s+\w+\s+(?:account|nft|license|asset)/i,
  /\b(?:my|our)\s+(?:service|offer|listing|asking)\b/i,
  /\b(?:experienced|certified|professional)\s+\w+\s+(?:developer|designer|engineer|writer|translator)/i,
  /\b(?:turnaround|delivery)\s+(?:in|within)\b/i,
];

function countMatches(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const p of patterns) {
    if (p.test(text)) n += 1;
  }
  return n;
}

/// Classify a post by stitching together the user-provided title + body and
/// running the regex sets. Confidence is intentionally coarse. the goal is
/// to flag obvious mismatches, not micro-grade ambiguous prose.
export function classifyIntent(title: string, body: string): {
  intent: PostIntent;
  confidence: number;
} {
  const text = `${title}\n${body}`.trim();
  if (text.length < 4) return { intent: 'ambiguous', confidence: 0 };

  const req = countMatches(text, REQUEST_PATTERNS);
  const off = countMatches(text, OFFER_PATTERNS);

  if (req === 0 && off === 0) return { intent: 'ambiguous', confidence: 0 };
  if (req > off) {
    return { intent: 'request', confidence: Math.min(1, req / 2) };
  }
  if (off > req) {
    return { intent: 'offer', confidence: Math.min(1, off / 2) };
  }
  return { intent: 'ambiguous', confidence: 0.3 };
}

/// True when a free-form post is likely landing on the wrong surface for
/// what the user wrote. Used to gate submit on PostListingForm (expects
/// offer) and PostJobForm (expects request).
export function looksLikeWrongSide(
  title: string,
  body: string,
  expected: 'offer' | 'request',
): { wrong: boolean; intent: PostIntent; confidence: number } {
  const cls = classifyIntent(title, body);
  if (cls.intent === 'ambiguous') return { wrong: false, ...cls };
  const wrong = cls.intent !== expected && cls.confidence >= 0.4;
  return { wrong, ...cls };
}
