import type { UserLocale } from '../db/profiles.js';
import { getAcceptedOfferForInvoice, listOffersByFinancier, type FactoringOffer } from '../db/factoring.js';
import { getPOLineForInvoice, listLinesByFinancier, type POFinancingLine } from '../db/poFinancing.js';

/// A financier is never a party to the deal they financed, but their repayment
/// rides on it. These are the deal events that change when or whether they are
/// repaid (docs/architecture/18-trade-finance.md, "While the financed deal
/// runs"). The email, Telegram and bell notifiers and the activity feed all
/// read this one list.
export const FINANCIER_FOLLOWS: ReadonlySet<string> = new Set([
  'deal.delivered',
  'deal.delivered.onchain',
  'escrow.milestone.released',
  'escrow.settled',
  'deal.disputed',
  'deal.dispute.auto_resolved',
  'escrow.refunded',
  'escrow.reclaimed',
  'deal.cancelled',
  'deal.deadline.passed',
]);

/// Factoring offers whose advance went out. Offers still being decided never
/// put the financier's money on the deal.
const ADVANCED_OFFER = new Set<FactoringOffer['status']>(['pending_receipt', 'accepted', 'settled', 'defaulted']);
/// Purchase-order lines whose repayment is still owed. Every line is funded at
/// open, so finished ones are the only exclusion.
const OWED_LINE = new Set<POFinancingLine['state']>(['outstanding', 'funded', 'released']);

export interface DealFinancier {
  financier: string;
  /// The financier's own page for this position.
  href: string;
}

export function positionHref(kind: 'factoring' | 'po', id: string): string {
  return kind === 'factoring' ? `/financier/factoring/${id}` : `/financier/po/${id}`;
}

/// Who is waiting to be repaid from this deal, from the offer or line attached
/// to it. A deal carries at most one of each.
export function financiersFrom(offer: FactoringOffer | null, line: POFinancingLine | null): DealFinancier[] {
  const out: DealFinancier[] = [];
  if (offer && (offer.status === 'accepted' || offer.status === 'pending_receipt')) {
    out.push({ financier: offer.financier.toLowerCase(), href: positionHref('factoring', offer.id) });
  }
  if (line && OWED_LINE.has(line.state) && !out.some((f) => f.financier === line.financier.toLowerCase())) {
    out.push({ financier: line.financier.toLowerCase(), href: positionHref('po', line.id) });
  }
  return out;
}

export async function financiersOfDeal(jobId: string): Promise<DealFinancier[]> {
  const [offer, line] = await Promise.all([
    getAcceptedOfferForInvoice(jobId).catch(() => null),
    getPOLineForInvoice(jobId).catch(() => null),
  ]);
  return financiersFrom(offer, line);
}

/// Every deal this address has put money into as a financier, settled ones
/// included, so the history of a finished position still reads.
export function financedJobsFrom(offers: readonly FactoringOffer[], lines: readonly POFinancingLine[]): Set<string> {
  const jobs = new Set<string>();
  for (const offer of offers) if (ADVANCED_OFFER.has(offer.status)) jobs.add(offer.invoiceId.toLowerCase());
  for (const line of lines) jobs.add(line.invoiceId.toLowerCase());
  return jobs;
}

export async function financedJobIds(financier: string): Promise<Set<string>> {
  const key = financier.toLowerCase();
  const [offers, lines] = await Promise.all([
    listOffersByFinancier(key).catch(() => []),
    listLinesByFinancier(key).catch(() => []),
  ]);
  return financedJobsFrom(offers, lines);
}

type AlertKey =
  | 'delivered'
  | 'released'
  | 'settled'
  | 'disputed'
  | 'disputeClosed'
  | 'refunded'
  | 'deadline';

const KEY_FOR: Record<string, AlertKey> = {
  'deal.delivered': 'delivered',
  'deal.delivered.onchain': 'delivered',
  'escrow.milestone.released': 'released',
  'escrow.settled': 'settled',
  'deal.disputed': 'disputed',
  'deal.dispute.auto_resolved': 'disputeClosed',
  'escrow.refunded': 'refunded',
  'escrow.reclaimed': 'refunded',
  'deal.cancelled': 'refunded',
  'deal.deadline.passed': 'deadline',
};

type AlertCopy = Record<AlertKey, { title: string; body: string }> & { open: string };

const COPY: Record<UserLocale, AlertCopy> = {
  en: {
    delivered: { title: 'Delivered on a deal you financed', body: 'The seller delivered. The buyer is reviewing, and your repayment comes from their release.' },
    released: { title: 'Payment released on a deal you financed', body: 'The buyer released a payment. You are paid first, up to what you are owed.' },
    settled: { title: 'A deal you financed is complete', body: 'The deal settled. Your repayment is paid from it.' },
    disputed: { title: 'A deal you financed is in dispute', body: 'The money in escrow is frozen until the dispute is decided. Your repayment may come later or be smaller.' },
    disputeClosed: { title: 'The dispute on a deal you financed closed', body: 'Open your position to see what it paid and what is still owed to you.' },
    refunded: { title: 'A deal you financed was refunded', body: 'The buyer got their money back, so this deal will not repay you on its own. Open your position to see what is owed to you.' },
    deadline: { title: 'A deal you financed missed its deadline', body: 'The seller has not delivered and the buyer can take their money back. Your repayment is at risk.' },
    open: 'Open your position',
  },
  fr: {
    delivered: { title: 'Livraison sur un accord que vous financez', body: 'Le vendeur a livré. L’acheteur vérifie, et votre remboursement vient de son versement.' },
    released: { title: 'Paiement versé sur un accord que vous financez', body: 'L’acheteur a versé un paiement. Vous êtes payé en premier, jusqu’à ce qui vous est dû.' },
    settled: { title: 'Un accord que vous financez est terminé', body: 'L’accord est réglé. Votre remboursement en est payé.' },
    disputed: { title: 'Un accord que vous financez est en litige', body: 'L’argent en séquestre est gelé jusqu’à la décision. Votre remboursement peut arriver plus tard ou être plus faible.' },
    disputeClosed: { title: 'Le litige sur un accord que vous financez est clos', body: 'Ouvrez votre position pour voir ce qui a été payé et ce qui vous est encore dû.' },
    refunded: { title: 'Un accord que vous financez a été remboursé', body: 'L’acheteur a récupéré son argent, cet accord ne vous remboursera donc pas seul. Ouvrez votre position pour voir ce qui vous est dû.' },
    deadline: { title: 'Un accord que vous financez a dépassé son délai', body: 'Le vendeur n’a pas livré et l’acheteur peut récupérer son argent. Votre remboursement est menacé.' },
    open: 'Ouvrir votre position',
  },
  ar: {
    delivered: { title: 'تم التسليم في صفقة موّلتها', body: 'سلّم البائع. المشتري يراجع، وسدادك يأتي من دفعته.' },
    released: { title: 'صُرفت دفعة في صفقة موّلتها', body: 'صرف المشتري دفعة. تُدفع لك أولًا، حتى المبلغ المستحق لك.' },
    settled: { title: 'اكتملت صفقة موّلتها', body: 'تمت تسوية الصفقة. يُدفع سدادك منها.' },
    disputed: { title: 'صفقة موّلتها في نزاع', body: 'المال في الضمان مجمّد حتى يُحسم النزاع. قد يتأخر سدادك أو يقل.' },
    disputeClosed: { title: 'أُغلق النزاع في صفقة موّلتها', body: 'افتح مركزك لترى ما دُفع وما زال مستحقًا لك.' },
    refunded: { title: 'أُعيد المال في صفقة موّلتها', body: 'استرد المشتري ماله، فلن تسدّدك هذه الصفقة وحدها. افتح مركزك لترى ما هو مستحق لك.' },
    deadline: { title: 'فاتت صفقة موّلتها موعدها', body: 'لم يسلّم البائع ويمكن للمشتري استرداد ماله. سدادك في خطر.' },
    open: 'افتح مركزك',
  },
  hi: {
    delivered: { title: 'आपके फ़ाइनेंस किए सौदे में डिलीवरी हुई', body: 'विक्रेता ने डिलीवर किया। खरीदार जाँच रहा है, और आपकी वापसी उसके भुगतान से आएगी।' },
    released: { title: 'आपके फ़ाइनेंस किए सौदे में भुगतान जारी हुआ', body: 'खरीदार ने भुगतान जारी किया। आपको पहले भुगतान मिलता है, आपकी बकाया रकम तक।' },
    settled: { title: 'आपका फ़ाइनेंस किया सौदा पूरा हुआ', body: 'सौदा निपट गया। आपकी वापसी उसी से होती है।' },
    disputed: { title: 'आपके फ़ाइनेंस किए सौदे में विवाद है', body: 'फ़ैसला होने तक एस्क्रो का पैसा रुका है। आपकी वापसी देर से या कम हो सकती है।' },
    disputeClosed: { title: 'आपके फ़ाइनेंस किए सौदे का विवाद बंद हुआ', body: 'अपनी पोज़िशन खोलकर देखें कि क्या मिला और क्या अभी बकाया है।' },
    refunded: { title: 'आपके फ़ाइनेंस किए सौदे में पैसा लौटाया गया', body: 'खरीदार को पैसा वापस मिल गया, इसलिए यह सौदा अपने आप आपको नहीं लौटाएगा। अपनी पोज़िशन खोलकर बकाया देखें।' },
    deadline: { title: 'आपके फ़ाइनेंस किए सौदे की समय सीमा निकल गई', body: 'विक्रेता ने डिलीवर नहीं किया और खरीदार पैसा वापस ले सकता है। आपकी वापसी जोखिम में है।' },
    open: 'अपनी पोज़िशन खोलें',
  },
  sw: {
    delivered: { title: 'Imewasilishwa kwenye makubaliano uliyofadhili', body: 'Muuzaji amewasilisha. Mnunuzi anakagua, na malipo yako yanatoka kwenye malipo yake.' },
    released: { title: 'Malipo yametolewa kwenye makubaliano uliyofadhili', body: 'Mnunuzi ametoa malipo. Unalipwa kwanza, hadi kiasi unachodai.' },
    settled: { title: 'Makubaliano uliyofadhili yamekamilika', body: 'Makubaliano yamelipwa. Malipo yako yanatoka humo.' },
    disputed: { title: 'Makubaliano uliyofadhili yana mzozo', body: 'Pesa za escrow zimesimamishwa hadi mzozo uamuliwe. Malipo yako yanaweza kuchelewa au kupungua.' },
    disputeClosed: { title: 'Mzozo kwenye makubaliano uliyofadhili umefungwa', body: 'Fungua nafasi yako uone kilicholipwa na unachodai bado.' },
    refunded: { title: 'Makubaliano uliyofadhili yamerejeshwa', body: 'Mnunuzi amerudishiwa pesa zake, kwa hiyo makubaliano haya hayatakulipa yenyewe. Fungua nafasi yako uone unachodai.' },
    deadline: { title: 'Makubaliano uliyofadhili yamepita tarehe', body: 'Muuzaji hajawasilisha na mnunuzi anaweza kuchukua pesa zake. Malipo yako yako hatarini.' },
    open: 'Fungua nafasi yako',
  },
};

/// What the financier is told about a deal event, in their language. Null for
/// any event they do not follow.
export function financierAlert(type: string, locale: UserLocale = 'en'): { title: string; body: string; open: string } | null {
  const key = KEY_FOR[type];
  if (!key || !FINANCIER_FOLLOWS.has(type)) return null;
  const copy = COPY[locale] ?? COPY.en;
  return { ...copy[key], open: copy.open };
}

/// The financed deal's stage as the financier reads it, in the same words as
/// their Open deals list (frontend features/notifications/openDealsModel.ts).
export type FinancedStage = 'delivering' | 'overdue' | 'reviewing' | 'disputed' | 'complete' | 'refunded';

export function financedStage(stage: string, deadlineUnix: number | undefined, now = Date.now()): FinancedStage {
  switch (stage) {
    case 'awaiting-first-release':
    case 'awaiting-final-release':
      return 'reviewing';
    case 'disputed':
      return 'disputed';
    case 'settled':
      return 'complete';
    case 'cancelled':
      return 'refunded';
    default:
      return deadlineUnix && deadlineUnix * 1000 < now ? 'overdue' : 'delivering';
  }
}
