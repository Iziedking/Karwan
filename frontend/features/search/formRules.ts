/// The same limits the backend enforces (routes/jobs.ts postJobSchema and
/// routes/listings.ts createSchema), checked before anything moves, so a
/// request can never fund an agent and then be refused.
export const BRIEF_MIN = 5;
export const BRIEF_MAX = 500;
export const TITLE_MIN = 3;
export const TITLE_MAX = 120;
export const DETAILS_MIN = 5;
export const DETAILS_MAX = 500;
const AMOUNT_MAX = 5_000_000;

/// A USDC amount the backend can take: plain digits, at most six decimals,
/// at least one micro, at most the backend cap.
function validUsdc(text: string): boolean {
  const t = text.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(t)) return false;
  const n = Number(t);
  return n > 0 && n <= AMOUNT_MAX;
}

function wholeIn(text: string, min: number, max: number): boolean {
  const n = Number(text.trim());
  return text.trim() !== '' && Number.isInteger(n) && n >= min && n <= max;
}

function roomOk(text: string): boolean {
  if (text.trim() === '') return true;
  const n = Number(text.trim());
  return Number.isFinite(n) && n >= 0 && n <= 50;
}

/// "30, 70" into whole-number parts: 2 to 5 of them, each 1 to 99, summing to
/// 100. The escrow refuses anything else.
export function parseSplit(text: string): number[] | null {
  const parts = text.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  if (parts.length < 2 || parts.length > 5) return null;
  if (parts.some((n) => !Number.isInteger(n) || n < 1 || n > 99)) return null;
  return parts.reduce((a, b) => a + b, 0) === 100 ? parts : null;
}

export type RequestField = 'need' | 'budget' | 'when' | 'room' | 'split';
export type OfferField = 'what' | 'details' | 'price' | 'room' | 'ttl';

export function requestErrors(f: { need: string; budget: string; days: string; room: string; split: string }): RequestField[] {
  const out: RequestField[] = [];
  const need = f.need.trim().length;
  if (need < BRIEF_MIN || need > BRIEF_MAX) out.push('need');
  if (!validUsdc(f.budget)) out.push('budget');
  if (!wholeIn(f.days, 1, 90)) out.push('when');
  if (!roomOk(f.room)) out.push('room');
  if (f.split.trim() !== '' && !parseSplit(f.split)) out.push('split');
  return out;
}

export function offerErrors(f: { what: string; details: string; price: string; room: string; ttl: string }): OfferField[] {
  const out: OfferField[] = [];
  const what = f.what.trim().length;
  if (what < TITLE_MIN || what > TITLE_MAX) out.push('what');
  const details = f.details.trim().length;
  if (details < DETAILS_MIN || details > DETAILS_MAX) out.push('details');
  if (!validUsdc(f.price)) out.push('price');
  if (!roomOk(f.room)) out.push('room');
  if (!wholeIn(f.ttl, 1, 90)) out.push('ttl');
  return out;
}
