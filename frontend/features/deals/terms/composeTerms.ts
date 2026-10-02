/// The parts of an agreement that make a deal checkable: what each milestone
/// delivers, when it is accepted, how delivery is proven, what each payment
/// is for and how long the buyer has to check. composeTerms writes them into
/// the single agreement text deals carry, in a fixed order, so the delivery
/// check and an arbiter always read the same shape.

export type ProofKind = 'link' | 'tracking' | 'either';

/// One milestone: its share of the price and, in plain words, what it delivers.
export interface TermsPart {
  pct: number;
  what: string;
}

export interface TermsDraft {
  conditions: string[];
  proof: ProofKind;
  parts: TermsPart[];
  reviewWindowDays: number;
}

export interface TermsContext {
  priceUsdc: number | null;
  /// Delivery deadline as the reader sees it ("14 Oct"); null when the deal has none.
  dueLabel: string | null;
}

export interface TermsCopy {
  due: string;
  conditions: string;
  proofLink: string;
  proofTracking: string;
  proofEither: string;
  payment: string;
  paymentNoPrice: string;
  paymentOne: string;
  paymentOneNoPrice: string;
  part: string;
  partNoPrice: string;
  partName: string;
  review: string;
  reviewOne: string;
  late: string;
}

export type TermsIssue =
  | { code: 'no-what'; part: number }
  | { code: 'split'; total: number }
  | { code: 'vague'; item: string };

export const MAX_PARTS = 5;

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));

const money = (value: number) => (Math.round(value * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function cleanLines(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean);
}

/// Shares that add up to 100, as even as whole numbers allow; the last part
/// takes the remainder.
export function evenSplit(count: number): number[] {
  const base = Math.floor(100 / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? 100 - base * (count - 1) : base));
}

export function composeTerms(draft: TermsDraft, context: TermsContext, copy: TermsCopy): string {
  const conditions = cleanLines(draft.conditions);
  const lines: string[] = [];
  if (context.dueLabel) lines.push(fill(copy.due, { date: context.dueLabel }));
  const price = context.priceUsdc && context.priceUsdc > 0 ? context.priceUsdc : null;
  const one = draft.parts.length === 1;
  const paying = price ? (one ? copy.paymentOne : copy.payment) : one ? copy.paymentOneNoPrice : copy.paymentNoPrice;
  lines.push(fill(paying, { amount: price ? money(price) : '', n: draft.parts.length }));
  draft.parts.forEach((part, index) => {
    const name = fill(copy.partName, { n: index + 1 });
    const what = part.what.trim();
    lines.push(
      price
        ? fill(copy.part, { name, pct: part.pct, amount: money((price * part.pct) / 100), what })
        : fill(copy.partNoPrice, { name, pct: part.pct, what }),
    );
  });
  if (conditions.length) lines.push(copy.conditions, ...conditions.map((condition) => `• ${condition}`));
  lines.push(draft.proof === 'tracking' ? copy.proofTracking : draft.proof === 'either' ? copy.proofEither : copy.proofLink);
  lines.push(draft.reviewWindowDays === 1 ? copy.reviewOne : fill(copy.review, { n: draft.reviewWindowDays }));
  // Unpaid parts only come back for lateness when there is a deadline to miss.
  if (context.dueLabel) lines.push(copy.late);
  return lines.join('\n');
}

/// What would stop the delivery check or an arbiter from deciding on these
/// terms. Empty means ready.
export function termsIssues(draft: TermsDraft): TermsIssue[] {
  const issues: TermsIssue[] = [];
  draft.parts.forEach((part, index) => {
    if (!part.what.trim()) issues.push({ code: 'no-what', part: index + 1 });
  });
  const total = draft.parts.reduce((sum, part) => sum + (Number.isFinite(part.pct) ? part.pct : 0), 0);
  if (total !== 100) issues.push({ code: 'split', total });
  const vague = draft.parts.map((part) => part.what.trim()).find((what) => what && what.split(/\s+/).length < 2);
  if (vague) issues.push({ code: 'vague', item: vague });
  return issues;
}
