import type { Goal, UserLocale } from '../db/profiles.js';
import type { Pace, PriceRange } from './agentBriefParse.js';
import { usualOf } from './ways.js';

/// "Here's your Karwan" (view 19): what the setup answers set up, in plain
/// sentences. Built here so the website, Telegram and the assistant say the
/// same thing.

export interface BriefAnswers {
  goals: Goal[];
  what?: string;
  price?: string;
  buy?: string;
  business?: string;
  places?: string;
  clients?: 'own' | 'find' | 'both';
  own?: 'offers' | 'ask';
  reach?: 'telegram' | 'email' | 'both';
  where?: string;
  /// How clients usually pay: the selling way setup starts with (view 26).
  paid?: 'one_time' | 'milestones' | 'goods';
  /// True when the price question was asked a second time.
  retried?: boolean;
}

export interface BriefRead {
  price: PriceRange | null;
  pace: Pace | null;
  buyMax: number | null;
  business: { name: string; trades: string } | null;
  place: { country: string; city: string | null } | null;
}

interface Copy {
  offers: string;
  yourWork: string;
  yourProducts: string;
  price: string;
  priceOne: string;
  pace: string;
  paceRange: string;
  noPrice: string;
  buys: string;
  buysUpTo: string;
  business: string;
  record: string;
  ownClients: string;
  findClients: string;
  agentOffers: string;
  agentAsks: string;
  reach: Record<'telegram' | 'email' | 'both', string>;
  near: string;
  held: string;
  paid: Record<'one_time' | 'milestones' | 'goods', string>;
}

const COPY: Record<UserLocale, Copy> = {
  en: {
    offers: 'Your agent offers {what}', yourWork: 'your work', yourProducts: 'your products',
    price: 'Usually {usual} USDC, lowest {min}', priceOne: 'Asks {min} USDC', pace: ', delivers in about {days} days', paceRange: ', delivers in {min} to {max} days',
    noPrice: 'Price not set yet. Your agent asks you each time.',
    buys: 'Your buying agent looks for {buy}', buysUpTo: 'Your buying agent looks for {buy}, up to {max} USDC',
    business: 'Business profile ready to finish for {name}', record: 'Connect {places} to build your record',
    ownClients: 'Home puts payment requests for your clients first', findClients: 'Your agent looks for matching requests on the market',
    agentOffers: 'Your agent makes offers within your price, and asks before any deal', agentAsks: 'Your agent suggests, and asks you every time',
    reach: { telegram: 'We tell you on Telegram', email: 'We tell you by email', both: 'We tell you on Telegram, with email as backup' },
    near: 'Looks for people near {place} first', held: "Every client's payment is held until you deliver",
    paid: { one_time: 'Paid all at once when the work is done', milestones: 'Paid in stages, as each one is approved', goods: 'Paid when the buyer has the goods' },
  },
  fr: {
    offers: 'Votre agent propose {what}', yourWork: 'votre travail', yourProducts: 'vos produits',
    price: 'Habituellement {usual} USDC, minimum {min}', priceOne: 'Demande {min} USDC', pace: ', livre en environ {days} jours', paceRange: ', livre en {min} à {max} jours',
    noPrice: 'Prix pas encore fixé. Votre agent vous demande à chaque fois.',
    buys: 'Votre agent d’achat cherche {buy}', buysUpTo: 'Votre agent d’achat cherche {buy}, jusqu’à {max} USDC',
    business: 'Profil d’entreprise prêt à finaliser pour {name}', record: 'Connectez {places} pour bâtir votre historique',
    ownClients: 'L’accueil met d’abord les demandes de paiement pour vos clients', findClients: 'Votre agent cherche des demandes qui vous correspondent sur le marché',
    agentOffers: 'Votre agent fait des offres dans votre prix et vous demande avant tout accord', agentAsks: 'Votre agent suggère et vous demande à chaque fois',
    reach: { telegram: 'Nous vous prévenons sur Telegram', email: 'Nous vous prévenons par e-mail', both: 'Nous vous prévenons sur Telegram, avec l’e-mail en secours' },
    near: 'Cherche d’abord des personnes près de {place}', held: 'Chaque paiement client est retenu jusqu’à votre livraison',
    paid: { one_time: 'Payé en une fois quand le travail est fait', milestones: 'Payé par étapes, à chaque étape approuvée', goods: 'Payé quand l’acheteur a la marchandise' },
  },
  ar: {
    offers: 'وكيلك يعرض {what}', yourWork: 'عملك', yourProducts: 'منتجاتك',
    price: 'عادةً {usual} USDC، والحد الأدنى {min}', priceOne: 'يطلب {min} USDC', pace: '، ويسلّم في نحو {days} أيام', paceRange: '، ويسلّم في {min} إلى {max} أيام',
    noPrice: 'لم يُحدَّد السعر بعد. وكيلك يسألك في كل مرة.',
    buys: 'وكيل الشراء يبحث عن {buy}', buysUpTo: 'وكيل الشراء يبحث عن {buy}، حتى {max} USDC',
    business: 'ملف عملك جاهز للإكمال باسم {name}', record: 'اربط {places} لتبني سجلك',
    ownClients: 'الصفحة الرئيسية تضع طلبات الدفع لعملائك أولًا', findClients: 'وكيلك يبحث في السوق عن طلبات تناسبك',
    agentOffers: 'وكيلك يقدّم عروضًا ضمن سعرك، ويسألك قبل أي صفقة', agentAsks: 'وكيلك يقترح، ويسألك في كل مرة',
    reach: { telegram: 'نخبرك عبر Telegram', email: 'نخبرك بالبريد الإلكتروني', both: 'نخبرك عبر Telegram، والبريد الإلكتروني احتياطًا' },
    near: 'يبحث أولًا عن أشخاص قرب {place}', held: 'كل دفعة من عميل تُحجز حتى تسلّم',
    paid: { one_time: 'يُدفع لك دفعة واحدة عند إنجاز العمل', milestones: 'يُدفع لك على مراحل، مع اعتماد كل مرحلة', goods: 'يُدفع لك حين يستلم المشتري البضاعة' },
  },
  hi: {
    offers: 'आपका एजेंट {what} पेश करता है', yourWork: 'आपका काम', yourProducts: 'आपके उत्पाद',
    price: 'आम तौर पर {usual} USDC, न्यूनतम {min}', priceOne: '{min} USDC माँगता है', pace: ', लगभग {days} दिनों में डिलीवर करता है', paceRange: ', {min} से {max} दिनों में डिलीवर करता है',
    noPrice: 'कीमत अभी तय नहीं। आपका एजेंट हर बार आपसे पूछता है।',
    buys: 'आपका खरीद एजेंट {buy} ढूँढता है', buysUpTo: 'आपका खरीद एजेंट {buy} ढूँढता है, {max} USDC तक',
    business: '{name} के लिए व्यवसाय प्रोफ़ाइल पूरा करने को तैयार', record: 'अपना रिकॉर्ड बनाने के लिए {places} जोड़ें',
    ownClients: 'होम पर आपके ग्राहकों के भुगतान अनुरोध सबसे पहले', findClients: 'आपका एजेंट बाज़ार में मेल खाते अनुरोध ढूँढता है',
    agentOffers: 'आपका एजेंट आपकी कीमत में ऑफ़र देता है, और किसी भी सौदे से पहले पूछता है', agentAsks: 'आपका एजेंट सुझाव देता है, और हर बार आपसे पूछता है',
    reach: { telegram: 'हम आपको Telegram पर बताते हैं', email: 'हम आपको ईमेल से बताते हैं', both: 'हम आपको Telegram पर बताते हैं, ईमेल बैकअप के रूप में' },
    near: 'पहले {place} के पास लोगों को ढूँढता है', held: 'हर ग्राहक का भुगतान आपकी डिलीवरी तक रोका जाता है',
    paid: { one_time: 'काम पूरा होने पर एक बार में भुगतान', milestones: 'चरणों में भुगतान, हर चरण मंज़ूर होने पर', goods: 'खरीदार के पास सामान पहुँचने पर भुगतान' },
  },
  sw: {
    offers: 'Wakala wako anatoa {what}', yourWork: 'kazi yako', yourProducts: 'bidhaa zako',
    price: 'Kawaida USDC {usual}, chini kabisa {min}', priceOne: 'Anaomba USDC {min}', pace: ', anawasilisha kwa takriban siku {days}', paceRange: ', anawasilisha kwa siku {min} hadi {max}',
    noPrice: 'Bei bado haijawekwa. Wakala wako anakuuliza kila mara.',
    buys: 'Wakala wako wa kununua anatafuta {buy}', buysUpTo: 'Wakala wako wa kununua anatafuta {buy}, hadi USDC {max}',
    business: 'Wasifu wa biashara uko tayari kukamilishwa kwa {name}', record: 'Unganisha {places} ili kujenga rekodi yako',
    ownClients: 'Mwanzo unaweka maombi ya malipo kwa wateja wako kwanza', findClients: 'Wakala wako anatafuta maombi yanayofaa sokoni',
    agentOffers: 'Wakala wako anatoa ofa ndani ya bei yako, na anakuuliza kabla ya makubaliano yoyote', agentAsks: 'Wakala wako anapendekeza, na anakuuliza kila mara',
    reach: { telegram: 'Tunakujulisha kwenye Telegram', email: 'Tunakujulisha kwa barua pepe', both: 'Tunakujulisha kwenye Telegram, barua pepe kama akiba' },
    near: 'Anatafuta watu karibu na {place} kwanza', held: 'Kila malipo ya mteja yanashikiliwa hadi uwasilishe',
    paid: { one_time: 'Unalipwa mara moja kazi ikikamilika', milestones: 'Unalipwa kwa hatua, kila hatua ikikubaliwa', goods: 'Unalipwa mnunuzi akipata bidhaa' },
  },
};

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));

export function briefLines(a: BriefAnswers, r: BriefRead, locale: UserLocale): string[] {
  const c = COPY[locale] ?? COPY.en;
  const has = (g: Goal) => a.goals.includes(g);
  const selling = has('work') || has('sell');
  const lines: string[] = [];
  if (selling) {
    lines.push(fill(c.offers, { what: a.what?.trim() || (has('work') ? c.yourWork : c.yourProducts) }));
    if (r.price) {
      const base = r.price.min === r.price.max ? fill(c.priceOne, { min: r.price.min }) : fill(c.price, { min: r.price.min, usual: usualOf(r.price.min, r.price.max) });
      const pace = !r.pace ? '' : r.pace.minDays === r.pace.maxDays ? fill(c.pace, { days: r.pace.minDays }) : fill(c.paceRange, { min: r.pace.minDays, max: r.pace.maxDays });
      lines.push(base + pace);
      if (a.paid) lines.push(c.paid[a.paid]);
    } else {
      lines.push(c.noPrice);
    }
  }
  if (has('buy')) {
    const buy = a.buy?.trim() || '';
    lines.push(r.buyMax != null ? fill(c.buysUpTo, { buy: buy.replace(/,?\s*up to.*$/i, ''), max: r.buyMax }) : fill(c.buys, { buy }));
  }
  if (has('business') && r.business) lines.push(fill(c.business, { name: r.business.name }));
  if (has('record') && a.places?.trim()) lines.push(fill(c.record, { places: a.places.trim() }));
  if (a.clients === 'own') lines.push(c.ownClients);
  if (a.clients === 'find' || a.clients === 'both') lines.push(c.findClients);
  const asks = a.own === 'ask' || (selling && !r.price);
  lines.push(asks ? c.agentAsks : c.agentOffers);
  lines.push(c.reach[a.reach ?? 'both']);
  if (r.place) lines.push(fill(c.near, { place: r.place.city || r.place.country }));
  lines.push(c.held);
  return lines;
}
