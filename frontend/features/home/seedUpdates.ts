import type { UpdateCard } from '@/core/api';

/// The three cards Home starts with are written once, in English, on the server
/// (backend/src/updates/store.ts). Until an admin rewrites one, it is shown in
/// the reader's language. A card an admin has rewritten shows as written.

type Words = Pick<UpdateCard, 'tag' | 'title' | 'body' | 'ctaLabel'>;
type Locale = 'en' | 'fr' | 'ar' | 'hi' | 'sw';

const SEEDS: Record<string, Record<Locale, Words>> = {
  upd_built_on_arc: {
    en: { tag: 'Tech', title: 'Built on Arc', body: 'A chain made for stablecoins. Fees in USDC, settles in under a second.', ctaLabel: 'How it works' },
    fr: { tag: 'Tech', title: 'Construit sur Arc', body: 'Une chaîne faite pour les stablecoins. Frais en USDC, règlement en moins d’une seconde.', ctaLabel: 'Comment ça marche' },
    ar: { tag: 'تقنية', title: 'مبني على Arc', body: 'شبكة صُممت للعملات المستقرة. الرسوم بعملة USDC، والتسوية في أقل من ثانية.', ctaLabel: 'كيف يعمل' },
    hi: { tag: 'टेक', title: 'Arc पर बना', body: 'स्टेबलकॉइन के लिए बनी चेन. फ़ीस USDC में, एक सेकंड से कम में सेटलमेंट.', ctaLabel: 'यह कैसे काम करता है' },
    sw: { tag: 'Teknolojia', title: 'Imejengwa juu ya Arc', body: 'Mtandao uliotengenezwa kwa stablecoin. Ada kwa USDC, malipo hukamilika chini ya sekunde moja.', ctaLabel: 'Jinsi inavyofanya kazi' },
  },
  upd_paid_in_usdc: {
    en: { tag: 'Tech', title: 'Paid in USDC', body: 'Every deal settles in USDC issued by Circle, held in escrow until release.', ctaLabel: 'Read more' },
    fr: { tag: 'Tech', title: 'Payé en USDC', body: 'Chaque accord se règle en USDC émis par Circle, conservé sous séquestre jusqu’à la libération.', ctaLabel: 'En savoir plus' },
    ar: { tag: 'تقنية', title: 'الدفع بعملة USDC', body: 'كل صفقة تُسوّى بعملة USDC الصادرة عن Circle، وتبقى محفوظة في الضمان حتى الإفراج.', ctaLabel: 'اقرأ المزيد' },
    hi: { tag: 'टेक', title: 'USDC में भुगतान', body: 'हर डील Circle के जारी किए USDC में सेटल होती है, और रिलीज़ तक एस्क्रो में रहती है.', ctaLabel: 'और पढ़ें' },
    sw: { tag: 'Teknolojia', title: 'Malipo kwa USDC', body: 'Kila mpango hulipwa kwa USDC iliyotolewa na Circle, ikishikiliwa kwenye escrow hadi itolewe.', ctaLabel: 'Soma zaidi' },
  },
  upd_trending: {
    en: { tag: 'Trending on Karwan', title: 'Most requested this week', body: '', ctaLabel: 'See the market' },
    fr: { tag: 'Tendances sur Karwan', title: 'Les plus demandés cette semaine', body: '', ctaLabel: 'Voir le marché' },
    ar: { tag: 'الرائج على Karwan', title: 'الأكثر طلبًا هذا الأسبوع', body: '', ctaLabel: 'تصفّح السوق' },
    hi: { tag: 'Karwan पर ट्रेंडिंग', title: 'इस हफ़्ते सबसे ज़्यादा माँगा गया', body: '', ctaLabel: 'मार्केट देखें' },
    sw: { tag: 'Maarufu kwenye Karwan', title: 'Vinavyoombwa zaidi wiki hii', body: '', ctaLabel: 'Tazama soko' },
  },
};

export function localizeSeedCard(card: UpdateCard, locale: string): UpdateCard {
  const seed = SEEDS[card.id];
  if (!seed || locale === 'en') return card;
  const words = seed[locale as Locale];
  // Rewritten by an admin: theirs, as written.
  if (!words || card.title !== seed.en.title || card.body !== seed.en.body) return card;
  return { ...card, ...words };
}
