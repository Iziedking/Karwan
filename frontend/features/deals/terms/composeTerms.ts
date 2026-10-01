/// The parts of an agreement that make a deal checkable: what is delivered,
/// when it is accepted, how delivery is proven, what each payment is for and
/// how long the buyer has to check. composeTerms writes them into the single
/// agreement text deals carry, in a fixed order, so the delivery check and an
/// arbiter always read the same shape.

export type ProofKind = 'link' | 'tracking' | 'either';

/// What a milestone pays for: starting the work, everything listed, or one
/// delivered item by its exact text.
export type Covers = { kind: 'start' } | { kind: 'all' } | { kind: 'item'; item: string };

export interface TermsPart {
  pct: number;
  covers: Covers;
}

export interface TermsDraft {
  items: string[];
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
  items: string;
  conditions: string;
  proofLink: string;
  proofTracking: string;
  proofEither: string;
  payment: string;
  paymentNoPrice: string;
  part: string;
  partNoPrice: string;
  partName: string;
  coversStart: string;
  coversAll: string;
  review: string;
  reviewOne: string;
  late: string;
}

export type TermsIssue =
  | { code: 'no-items' }
  | { code: 'no-conditions' }
  | { code: 'split'; total: number }
  | { code: 'vague'; item: string };

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));

const money = (value: number) => (Math.round(value * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function cleanLines(lines: string[]): string[] {
  return lines.map((line) => line.trim()).filter(Boolean);
}

export function composeTerms(draft: TermsDraft, context: TermsContext, copy: TermsCopy): string {
  const items = cleanLines(draft.items);
  const conditions = cleanLines(draft.conditions);
  const lines: string[] = [];
  if (context.dueLabel) lines.push(fill(copy.due, { date: context.dueLabel }));
  if (items.length) lines.push(copy.items, ...items.map((item) => `• ${item}`));
  if (conditions.length) lines.push(copy.conditions, ...conditions.map((condition) => `• ${condition}`));
  lines.push(draft.proof === 'tracking' ? copy.proofTracking : draft.proof === 'either' ? copy.proofEither : copy.proofLink);
  const price = context.priceUsdc && context.priceUsdc > 0 ? context.priceUsdc : null;
  lines.push(price ? fill(copy.payment, { amount: money(price), n: draft.parts.length }) : fill(copy.paymentNoPrice, { n: draft.parts.length }));
  draft.parts.forEach((part, index) => {
    const covers =
      part.covers.kind === 'start' ? copy.coversStart : part.covers.kind === 'all' ? copy.coversAll : part.covers.item.trim();
    const name = fill(copy.partName, { n: index + 1 });
    lines.push(
      price
        ? fill(copy.part, { name, pct: part.pct, amount: money((price * part.pct) / 100), covers })
        : fill(copy.partNoPrice, { name, pct: part.pct, covers }),
    );
  });
  lines.push(draft.reviewWindowDays === 1 ? copy.reviewOne : fill(copy.review, { n: draft.reviewWindowDays }));
  // Unpaid parts only come back for lateness when there is a deadline to miss.
  if (context.dueLabel) lines.push(copy.late);
  return lines.join('\n');
}

/// What would stop an arbiter from deciding on these terms. Empty means ready.
export function termsIssues(draft: TermsDraft): TermsIssue[] {
  const issues: TermsIssue[] = [];
  const items = cleanLines(draft.items);
  if (!items.length) issues.push({ code: 'no-items' });
  if (!cleanLines(draft.conditions).length) issues.push({ code: 'no-conditions' });
  const total = draft.parts.reduce((sum, part) => sum + (Number.isFinite(part.pct) ? part.pct : 0), 0);
  if (total !== 100) issues.push({ code: 'split', total });
  const vague = items.find((item) => item.split(/\s+/).length < 2);
  if (vague) issues.push({ code: 'vague', item: vague });
  return issues;
}
