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

// The ways to deal (view 39, 18 Nov). English must match backend/src/updates/store.ts.
Object.assign(SEEDS, {
  'upd_deal_open-market': {
    en: { tag: 'Market', title: 'Every offer is in the open', body: 'Anyone can read a request and every offer on it: the price, the date and who made it.', ctaLabel: 'See the market' },
    fr: { tag: 'Marché', title: 'Chaque offre est publique', body: 'Tout le monde peut lire une demande et chaque offre faite dessus : le prix, la date et qui l’a faite.', ctaLabel: 'Voir le marché' },
    ar: { tag: 'السوق', title: 'كل عرض علني', body: 'يمكن لأي شخص قراءة الطلب وكل عرض عليه: السعر والموعد ومن قدّمه.', ctaLabel: 'تصفّح السوق' },
    hi: { tag: 'मार्केट', title: 'हर ऑफ़र सबके सामने', body: 'कोई भी माँग और उस पर हर ऑफ़र पढ़ सकता है: क़ीमत, तारीख़ और किसने दिया.', ctaLabel: 'मार्केट देखें' },
    sw: { tag: 'Soko', title: 'Kila ofa iko wazi', body: 'Yeyote anaweza kusoma ombi na kila ofa juu yake: bei, tarehe na aliyeitoa.', ctaLabel: 'Tazama soko' },
  },
  upd_deal_direct: {
    en: { tag: 'Ways to deal', title: 'Trade with someone you know', body: 'Name their Karwan tag and what will be delivered. The money is held until it arrives.', ctaLabel: 'Start a deal' },
    fr: { tag: 'Façons de traiter', title: 'Traitez avec quelqu’un que vous connaissez', body: 'Indiquez son tag Karwan et ce qui sera livré. L’argent est gardé jusqu’à l’arrivée.', ctaLabel: 'Lancer un accord' },
    ar: { tag: 'طرق التعامل', title: 'تعامل مع شخص تعرفه', body: 'اذكر وسم Karwan الخاص به وما سيُسلَّم. يُحتفظ بالمال حتى يصل.', ctaLabel: 'ابدأ صفقة' },
    hi: { tag: 'डील के तरीक़े', title: 'किसी जानने वाले के साथ डील', body: 'उनका Karwan टैग और क्या डिलीवर होगा, बताइए. पैसा पहुँचने तक रखा रहता है.', ctaLabel: 'डील शुरू करें' },
    sw: { tag: 'Njia za kufanya biashara', title: 'Fanya biashara na unayemjua', body: 'Taja tagi yake ya Karwan na kitakachoaletwa. Pesa hushikiliwa hadi kifike.', ctaLabel: 'Anza mpango' },
  },
  upd_deal_contest: {
    en: { tag: 'Ways to deal', title: 'Run a contest', body: 'Put up the prize from the start, choose up to eight winners, and each place is paid what you set.', ctaLabel: 'Start a contest' },
    fr: { tag: 'Façons de traiter', title: 'Lancez un concours', body: 'Déposez le prix dès le départ, choisissez jusqu’à huit gagnants, et chaque place reçoit ce que vous avez fixé.', ctaLabel: 'Lancer un concours' },
    ar: { tag: 'طرق التعامل', title: 'أطلق مسابقة', body: 'ارصد الجائزة من البداية، واختر حتى ثمانية فائزين، ويُدفع لكل مركز ما حددته.', ctaLabel: 'ابدأ مسابقة' },
    hi: { tag: 'डील के तरीक़े', title: 'प्रतियोगिता चलाएँ', body: 'इनाम शुरू में रखें, आठ तक विजेता चुनें, और हर स्थान को आपकी तय रक़म मिलती है.', ctaLabel: 'प्रतियोगिता शुरू करें' },
    sw: { tag: 'Njia za kufanya biashara', title: 'Endesha shindano', body: 'Weka zawadi tangu mwanzo, chagua hadi washindi wanane, na kila nafasi hulipwa ulichoweka.', ctaLabel: 'Anza shindano' },
  },
  upd_deal_hourly: {
    en: { tag: 'Ways to deal', title: 'Hire by the hour or monthly', body: 'Set a rate and the most hours a week, for someone you know or posted on the market.', ctaLabel: 'Hire someone' },
    fr: { tag: 'Façons de traiter', title: 'Embauchez à l’heure ou au mois', body: 'Fixez un taux et le maximum d’heures par semaine, pour quelqu’un que vous connaissez ou publié sur le marché.', ctaLabel: 'Embaucher' },
    ar: { tag: 'طرق التعامل', title: 'وظّف بالساعة أو شهريًا', body: 'حدد السعر وأقصى عدد ساعات في الأسبوع، لشخص تعرفه أو عبر نشره في السوق.', ctaLabel: 'وظّف شخصًا' },
    hi: { tag: 'डील के तरीक़े', title: 'घंटे या महीने के हिसाब से रखें', body: 'रेट और हफ़्ते के अधिकतम घंटे तय करें, किसी जानने वाले के लिए या मार्केट पर डालकर.', ctaLabel: 'किसी को रखें' },
    sw: { tag: 'Njia za kufanya biashara', title: 'Ajiri kwa saa au kwa mwezi', body: 'Weka kiwango na saa nyingi zaidi kwa wiki, kwa unayemjua au kwa kuweka sokoni.', ctaLabel: 'Ajiri mtu' },
  },
  'upd_deal_agent-match': {
    en: { tag: 'Agents', title: 'Let an agent find the match', body: 'Say what you need, your budget and your deadline. Agents bring offers that fit, and you choose.', ctaLabel: 'Ask an agent' },
    fr: { tag: 'Agents', title: 'Laissez un agent trouver', body: 'Dites ce qu’il vous faut, votre budget et votre délai. Les agents apportent des offres qui correspondent, vous choisissez.', ctaLabel: 'Demander à un agent' },
    ar: { tag: 'الوكلاء', title: 'دع وكيلًا يجد المطابقة', body: 'قل ما تحتاجه وميزانيتك وموعدك. يأتي الوكلاء بعروض مناسبة، وأنت تختار.', ctaLabel: 'اسأل وكيلًا' },
    hi: { tag: 'एजेंट', title: 'एजेंट को मेल ढूँढने दें', body: 'बताइए क्या चाहिए, बजट और समय-सीमा. एजेंट सही ऑफ़र लाते हैं, चुनते आप हैं.', ctaLabel: 'एजेंट से पूछें' },
    sw: { tag: 'Mawakala', title: 'Acha wakala akutafutie', body: 'Sema unachohitaji, bajeti na muda wako. Mawakala huleta ofa zinazofaa, wewe unachagua.', ctaLabel: 'Muulize wakala' },
  },
  'upd_deal_standing-order': {
    en: { tag: 'Agents', title: 'Standing orders', body: 'Tell your agent once what to find or sell. It asks the right people every day and moves no money.', ctaLabel: 'Set one up' },
    fr: { tag: 'Agents', title: 'Ordres permanents', body: 'Dites une fois à votre agent quoi trouver ou vendre. Il demande aux bonnes personnes chaque jour et ne déplace aucun argent.', ctaLabel: 'En créer un' },
    ar: { tag: 'الوكلاء', title: 'الأوامر الدائمة', body: 'أخبر وكيلك مرة واحدة بما يبحث عنه أو يبيعه. يسأل الأشخاص المناسبين كل يوم ولا ينقل أي مال.', ctaLabel: 'أنشئ أمرًا' },
    hi: { tag: 'एजेंट', title: 'स्टैंडिंग ऑर्डर', body: 'एजेंट को एक बार बताइए क्या खोजना या बेचना है. वह रोज़ सही लोगों से पूछता है और कोई पैसा नहीं हिलाता.', ctaLabel: 'एक बनाएँ' },
    sw: { tag: 'Mawakala', title: 'Maagizo ya kudumu', body: 'Mwambie wakala wako mara moja cha kutafuta au kuuza. Huuliza watu sahihi kila siku na hahamishi pesa.', ctaLabel: 'Weka moja' },
  },
  'upd_deal_pay-link': {
    en: { tag: 'Money', title: 'Ask for money with a link', body: 'Anyone with the link can pay, with or without a Karwan account.', ctaLabel: 'Make a link' },
    fr: { tag: 'Argent', title: 'Demandez de l’argent avec un lien', body: 'Toute personne ayant le lien peut payer, avec ou sans compte Karwan.', ctaLabel: 'Créer un lien' },
    ar: { tag: 'المال', title: 'اطلب المال برابط', body: 'يمكن لأي شخص لديه الرابط أن يدفع، بحساب Karwan أو بدونه.', ctaLabel: 'أنشئ رابطًا' },
    hi: { tag: 'पैसा', title: 'लिंक से पैसा माँगें', body: 'लिंक वाला कोई भी भुगतान कर सकता है, Karwan खाते के साथ या बिना.', ctaLabel: 'लिंक बनाएँ' },
    sw: { tag: 'Pesa', title: 'Omba pesa kwa kiungo', body: 'Yeyote mwenye kiungo anaweza kulipa, akiwa na akaunti ya Karwan au bila.', ctaLabel: 'Tengeneza kiungo' },
  },
  upd_deal_release: {
    en: { tag: 'Protection', title: 'Paid when it arrives', body: 'Karwan holds the money and releases it when the buyer accepts delivery, at once or part by part.', ctaLabel: 'How release works' },
    fr: { tag: 'Protection', title: 'Payé à l’arrivée', body: 'Karwan garde l’argent et le verse quand l’acheteur accepte la livraison, en une fois ou partie par partie.', ctaLabel: 'Comment le versement marche' },
    ar: { tag: 'الحماية', title: 'يُدفع عند الوصول', body: 'يحتفظ Karwan بالمال ويفرج عنه عندما يقبل المشتري التسليم، دفعة واحدة أو جزءًا بعد جزء.', ctaLabel: 'كيف يتم الإفراج' },
    hi: { tag: 'सुरक्षा', title: 'पहुँचने पर भुगतान', body: 'Karwan पैसा रखता है और ख़रीदार के डिलीवरी स्वीकारने पर जारी करता है, एक बार में या हिस्सों में.', ctaLabel: 'रिलीज़ कैसे होता है' },
    sw: { tag: 'Ulinzi', title: 'Hulipwa kinapofika', body: 'Karwan hushikilia pesa na kuzitoa mnunuzi anapokubali kilicholetwa, kwa mara moja au sehemu kwa sehemu.', ctaLabel: 'Jinsi utoaji unavyofanya kazi' },
  },
} satisfies Record<string, Record<Locale, Words>>);

export function localizeSeedCard(card: UpdateCard, locale: string): UpdateCard {
  const seed = SEEDS[card.id];
  if (!seed || locale === 'en') return card;
  const words = seed[locale as Locale];
  // Rewritten by an admin: theirs, as written.
  if (!words || card.title !== seed.en.title || card.body !== seed.en.body) return card;
  return { ...card, ...words };
}
