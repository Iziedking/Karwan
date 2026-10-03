/// Trades Karwan does not support. One list, used wherever work enters the
/// market (offers, requests, direct deals) and by the assistant, so the answer
/// is the same everywhere. Patterns name the trade itself, not words that also
/// describe honest work: "code review", "accounting", "phone flipping" and
/// "exam prep" pass.

import { isAccountResale } from './accountResale.js';

export type ProhibitedCategory =
  | 'account-resale'
  | 'fake-engagement'
  | 'forged-documents'
  | 'payment-fraud'
  | 'money-laundering'
  | 'exam-impersonation'
  | 'hacking'
  | 'weapons-drugs'
  | 'counterfeit'
  | 'market-manipulation'
  | 'betting-fixing'
  | 'adult-services'
  | 'prescription-drugs'
  | 'advance-fee'
  | 'academic-fraud';

export const PROHIBITED_MESSAGES: Record<ProhibitedCategory, string> = {
  'account-resale': 'Karwan does not support buying, selling or renting accounts, logins or credentials.',
  'fake-engagement': 'Karwan does not support buying or selling reviews, followers, likes or other fake engagement.',
  'forged-documents': 'Karwan does not support fake, forged or edited documents, IDs or certificates.',
  'payment-fraud': 'Karwan does not support stolen cards, bank logs, carding or money-flipping schemes.',
  'money-laundering': 'Karwan does not support moving or receiving money for others to hide where it came from.',
  'exam-impersonation': 'Karwan does not support taking exams or tests in someone else\'s place.',
  'hacking': 'Karwan does not support hacking into accounts or systems, phishing or malware.',
  'weapons-drugs': 'Karwan does not support trading weapons or illegal drugs.',
  'counterfeit': 'Karwan does not support counterfeit or replica branded goods.',
  'market-manipulation': 'Karwan does not support pump-and-dumps, rug pulls or multi-account farming.',
  'betting-fixing': 'Karwan does not support betting tips, fixed matches or sure odds.',
  'adult-services': 'Karwan does not support escort or adult services, or selling intimate content.',
  'prescription-drugs': 'Karwan does not support selling prescription medicines without a prescription.',
  'advance-fee': 'Karwan does not support loans or grants that ask for a fee upfront.',
  'academic-fraud': 'Karwan does not support writing essays, theses or assignments for someone to submit as their own.',
};

const RULES: Array<[ProhibitedCategory, RegExp]> = [
  ['fake-engagement', /\b(?:buy|buying|sell|selling|get|order|purchase|cheap|instant)\s+(?:\d[\d,k+]*\s+)?(?:[\w-]+\s+){0,2}(?:followers|likes|subscribers|views|upvotes|retweets|reviews|5[- ]?star reviews|ratings)\b|\bfake\s+(?:reviews|followers|likes|ratings|testimonials)\b|\breview\s+(?:farm|exchange)\b|\b\d+\s+(?:5[- ]?star|positive|google|amazon|trustpilot|app\s+store)\s+reviews\b/i],
  ['forged-documents', /\b(?:fake|forged|forge|novelty|counterfeit|edited|photoshopped|scannable)\s+(?:\w+\s+){0,2}(?:ids?|passports?|driver'?s?\s+licen[cs]es?|bank\s+statements?|pay\s?slips?|payslips?|diplomas?|degrees?|certificates?|transcripts?|utility\s+bills?|documents?|invoices?|receipts?)\b/i],
  ['payment-fraud', /\b(?:cvv|cvvs|fullz|dumps?\s+with\s+pin|carding|cc\s+dumps|bank\s+logs?|stolen\s+cards?|cloned\s+cards?|cashout\s+(?:cards?|logs?|method)|money\s+flipp?(?:ing)?|flip\s+your\s+money|double\s+your\s+(?:money|crypto|investment))\b/i],
  ['money-laundering', /\b(?:launder(?:ing)?|money\s+mules?|clean\s+(?:dirty\s+)?money|receive\s+(?:funds|money|payments)\s+(?:on\s+my\s+behalf|for\s+me\s+and\s+send)|use\s+your\s+bank\s+account\s+to\s+receive)\b/i],
  ['exam-impersonation', /\b(?:take|sit|write|do|pass)\s+(?:my|our|the)\s+(?:(?:online|proctored|final|remote)\s+){0,2}(?:exams?|tests?|quiz(?:zes)?|certification\s+exams?)\s+for\s+me\b|\bproxy\s+(?:exam|test)\s+taker\b|\bexam\s+impersonation\b/i],
  ['hacking', /\b(?:hack|hacking|crack)\s+(?:into\s+)?(?:[\w'.-]+\s+){0,3}(?:accounts?|emails?|phones?|whatsapp|instagram|facebook|wallets?|websites?|servers?|databases?|systems?)\b|\b(?:phishing\s+(?:page|kit|site|link)|keyloggers?|ransomware|ddos\s+(?:attack|service)|sms\s+bomber|rats?\s+malware|spyware\s+install)\b/i],
  ['weapons-drugs', /\b(?:guns?|pistols?|rifles?|firearms?|ammunition|ammo|ghost\s+guns?)\s+(?:for\s+sale|to\s+sell|delivery|plug)\b|\b(?:buy|sell|selling|supply|plug\s+for)\s+(?:\w+\s+){0,2}(?:guns?|firearms?|ammunition|cocaine|heroin|meth(?:amphetamine)?|fentanyl|mdma|ecstasy|ketamine|tramadol|codeine)\b/i],
  ['counterfeit', /\b(?:replica|counterfeit|fake|knock-?off|first\s+copy|1:1)\s+(?:\w+\s+){0,1}(?:designer|branded|gucci|louis\s+vuitton|lv|rolex|nike|adidas|jordans?|chanel|prada|dior|iphones?|airpods|bags?|watches|sneakers|shoes|perfumes?)\b/i],
  ['betting-fixing', /\b(?:sure|fixed|guaranteed|100%)\s+(?:odds|games?|match(?:es)?|wins?|tips|bets?|predictions?)\b|\b(?:betting|bet)\s+(?:tips|predictions|booking\s+codes?)\b|\bbooking\s+codes?\s+(?:for\s+sale|available)\b|\bbet\s*slips?\s+for\s+sale\b/i],
  ['adult-services', /\bescorts?\s+(?:service|services|girls?|agency|available|booking)\b|\bescorting\b|\bhook-?up\s+(?:service|girls?)\b|\b(?:nudes?|onlyfans\s+(?:leaks?|content)|intimate\s+(?:photos|videos))\s+(?:for\s+sale|available|to\s+sell)\b|\bsugar\s+(?:daddy|mummy|mommy)\s+(?:connect|plug|hookup)\b/i],
  ['prescription-drugs', /\b(?:no|without\s+(?:a\s+)?)\s*prescription\s+(?:needed|required)?\b|\b(?:buy|sell|selling|supply|plug\s+for)\s+(?:\w+\s+){0,2}(?:xanax|alprazolam|oxycodone|oxycontin|percocet|adderall|ritalin|valium|diazepam|lean|promethazine|codeine|tramadol)\b/i],
  ['advance-fee', /\b(?:loans?|grants?|funding|payouts?)\b[^.!?\n]{0,60}\b(?:upfront|processing|registration|activation|clearance)\s+fee\b|\b(?:pay|send)\s+(?:a\s+)?(?:small\s+)?(?:upfront|processing|registration|activation|clearance)\s+fee\b[^.!?\n]{0,40}\b(?:loan|grant|funds?|payout)\b|\binstant\s+loans?\s+(?:with\s+)?no\s+(?:credit|bvn|id)\s+check\b/i],
  ['academic-fraud', /\b(?:write|do|complete|finish)\s+my\s+(?:\w+\s+){0,2}(?:essay|assignment|thesis|dissertation|coursework|homework|term\s+paper|project\s+report)s?\b(?!\s+(?:outline|structure|plan))|\bghost-?writ(?:e|ing|ten|er)\s+(?:for\s+)?(?:my\s+)?(?:\w+\s+){0,1}(?:thesis|dissertation|essay|assignment)s?\b|\b(?:essays?|assignments?|theses|dissertations?)\s+(?:written\s+)?for\s+(?:you\s+to\s+)?submi(?:t|ssion)\b/i],
  ['market-manipulation', /\b(?:pump\s+and\s+dump|pump\s*&\s*dump|rug\s?pull|wash\s+trad(?:e|ing)|sybil\s+(?:farm|accounts?)|(?:multiple|multi|100s? of|bulk|\d{2,})\s+(?:wallets?|accounts?)\s+for\s+(?:airdrops?|farming)|airdrop\s+farming\s+(?:with|using)\s+(?:multiple|many|bulk))\b/i],
];

export interface ProhibitedMatch {
  category: ProhibitedCategory;
  message: string;
}

export function prohibitedReason(...texts: Array<string | undefined | null>): ProhibitedMatch | null {
  const text = texts.filter(Boolean).join('\n');
  if (!text.trim()) return null;
  if (isAccountResale(text)) return { category: 'account-resale', message: PROHIBITED_MESSAGES['account-resale'] };
  for (const [category, pattern] of RULES) {
    if (pattern.test(text)) return { category, message: PROHIBITED_MESSAGES[category] };
  }
  return null;
}

/// Every text value in a request body, nested ones included, so a gate reads
/// titles, briefs, terms and term drafts alike without naming each field.
export function textFields(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6) return out;
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) textFields(v, out, depth + 1);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) textFields(v, out, depth + 1);
  return out;
}

/// The refusal a write route returns, or null when the body is allowed.
export function prohibitedBody(body: unknown): { error: string; code: 'PROHIBITED_TRADE'; category: ProhibitedCategory } | null {
  const match = prohibitedReason(...textFields(body));
  return match ? { error: match.message, code: 'PROHIBITED_TRADE', category: match.category } : null;
}
