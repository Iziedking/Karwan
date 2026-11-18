/// The small deal drawn over each Updates photo (view 39, 18 Nov). Amounts are
/// placeholders, `{a} USDC`, filled in the reader's own currency; names and
/// tags stay as written.

export type DealSceneId = 'open-market' | 'direct' | 'contest' | 'hourly' | 'agent-match' | 'standing-order' | 'pay-link' | 'release';

export interface SceneRow {
  label: string;
  /// The figure on the right; may hold `{a} USDC`.
  value?: string;
  /// A small label on the right instead of a figure.
  pill?: string;
}

export interface SceneCopy {
  title: string;
  pill?: string;
  rows: SceneRow[];
  /// The line that lands last, with its green label.
  done: { label: string; pill: string };
}

type Lang = 'en' | 'fr' | 'ar' | 'hi' | 'sw';

export const dealScenes: Record<Lang, Record<DealSceneId, SceneCopy>> = {
  en: {
    'open-market': { title: 'Fresh tomatoes, 10 baskets', pill: 'Open', rows: [{ label: 'Halima · ★ 4.8', value: '{a} USDC' }, { label: 'Sani · ★ 4.9', value: '{b} USDC' }], done: { label: 'Every offer is public', pill: 'Chosen' } },
    direct: { title: '@bola · a phone, handed over', rows: [{ label: 'Held by Karwan', value: '{a} USDC' }], done: { label: 'Handed over and accepted', pill: 'Released' } },
    contest: { title: 'A logo for our bakery', pill: '14 entries', rows: [{ label: '1st place', value: '{a} USDC' }, { label: '2nd and 3rd', value: '{b} USDC · {c} USDC' }], done: { label: 'Prize put up from the start', pill: 'Winners paid' } },
    hourly: { title: 'Virtual assistant', pill: 'By the hour', rows: [{ label: 'This week', value: '14 of 20 hours' }], done: { label: '{a} USDC an hour, for 4 weeks', pill: 'Monthly too' } },
    'agent-match': { title: 'Shop website, 5 pages', pill: 'In negotiation', rows: [{ label: 'Musa · fits the brief', value: '{a} USDC' }, { label: 'Grace · fits the brief', value: '{b} USDC' }], done: { label: 'Your agent found them, you choose', pill: 'Accept' } },
    'standing-order': { title: 'Find: cassava, 50 kg', pill: 'Every day', rows: [{ label: 'Most for one', value: '{a} USDC' }, { label: 'Ask a day', value: '3 people' }], done: { label: 'Moves no money', pill: '2 answered' } },
    'pay-link': { title: 'Payment link', pill: '7 days', rows: [{ label: 'karwan.site/pay/…', pill: 'Copy' }], done: { label: '{a} USDC, no account needed', pill: 'Paid' } },
    release: { title: '40 shirts, in 2 parts', pill: 'Your move', rows: [{ label: 'Paid out', value: '{a} USDC of {b} USDC' }], done: { label: 'Part 2 delivered', pill: 'Release' } },
  },
  fr: {
    'open-market': { title: 'Tomates fraîches, 10 paniers', pill: 'Ouverte', rows: [{ label: 'Halima · ★ 4.8', value: '{a} USDC' }, { label: 'Sani · ★ 4.9', value: '{b} USDC' }], done: { label: 'Chaque offre est publique', pill: 'Choisie' } },
    direct: { title: '@bola · un téléphone, remis en main', rows: [{ label: 'Gardé par Karwan', value: '{a} USDC' }], done: { label: 'Remis et accepté', pill: 'Versé' } },
    contest: { title: 'Un logo pour notre boulangerie', pill: '14 participations', rows: [{ label: '1re place', value: '{a} USDC' }, { label: '2e et 3e', value: '{b} USDC · {c} USDC' }], done: { label: 'Prix déposé dès le départ', pill: 'Gagnants payés' } },
    hourly: { title: 'Assistante virtuelle', pill: 'À l’heure', rows: [{ label: 'Cette semaine', value: '14 h sur 20' }], done: { label: '{a} USDC de l’heure, pendant 4 semaines', pill: 'Au mois aussi' } },
    'agent-match': { title: 'Site de boutique, 5 pages', pill: 'En négociation', rows: [{ label: 'Musa · correspond', value: '{a} USDC' }, { label: 'Grace · correspond', value: '{b} USDC' }], done: { label: 'Votre agent les a trouvés, vous choisissez', pill: 'Accepter' } },
    'standing-order': { title: 'Trouver : manioc, 50 kg', pill: 'Chaque jour', rows: [{ label: 'Au plus par lot', value: '{a} USDC' }, { label: 'Par jour', value: '3 personnes' }], done: { label: 'Ne déplace aucun argent', pill: '2 réponses' } },
    'pay-link': { title: 'Lien de paiement', pill: '7 jours', rows: [{ label: 'karwan.site/pay/…', pill: 'Copier' }], done: { label: '{a} USDC, sans compte', pill: 'Payé' } },
    release: { title: '40 chemises, en 2 parties', pill: 'À vous', rows: [{ label: 'Versé', value: '{a} USDC sur {b} USDC' }], done: { label: 'Partie 2 livrée', pill: 'Verser' } },
  },
  ar: {
    'open-market': { title: 'طماطم طازجة، 10 سلال', pill: 'مفتوح', rows: [{ label: 'Halima · ★ 4.8', value: '{a} USDC' }, { label: 'Sani · ★ 4.9', value: '{b} USDC' }], done: { label: 'كل عرض علني', pill: 'تم اختياره' } },
    direct: { title: '@bola · هاتف، سُلّم يدًا بيد', rows: [{ label: 'يحتفظ به Karwan', value: '{a} USDC' }], done: { label: 'سُلّم وقُبل', pill: 'تم الإفراج' } },
    contest: { title: 'شعار لمخبزنا', pill: '14 مشاركة', rows: [{ label: 'المركز الأول', value: '{a} USDC' }, { label: 'الثاني والثالث', value: '{b} USDC · {c} USDC' }], done: { label: 'الجائزة مرصودة من البداية', pill: 'دُفع للفائزين' } },
    hourly: { title: 'مساعدة افتراضية', pill: 'بالساعة', rows: [{ label: 'هذا الأسبوع', value: '14 من 20 ساعة' }], done: { label: '{a} USDC للساعة، لمدة 4 أسابيع', pill: 'وشهريًا أيضًا' } },
    'agent-match': { title: 'موقع متجر، 5 صفحات', pill: 'قيد التفاوض', rows: [{ label: 'Musa · يناسب الطلب', value: '{a} USDC' }, { label: 'Grace · تناسب الطلب', value: '{b} USDC' }], done: { label: 'وجدهم وكيلك، والقرار لك', pill: 'قبول' } },
    'standing-order': { title: 'ابحث عن: كسافا، 50 كغ', pill: 'كل يوم', rows: [{ label: 'الحد الأقصى للواحدة', value: '{a} USDC' }, { label: 'يسأل يوميًا', value: '3 أشخاص' }], done: { label: 'لا ينقل أي مال', pill: 'ردّ 2' } },
    'pay-link': { title: 'رابط دفع', pill: '7 أيام', rows: [{ label: 'karwan.site/pay/…', pill: 'نسخ' }], done: { label: '{a} USDC، دون حساب', pill: 'مدفوع' } },
    release: { title: '40 قميصًا، على جزأين', pill: 'دورك', rows: [{ label: 'المدفوع', value: '{a} USDC من {b} USDC' }], done: { label: 'سُلّم الجزء 2', pill: 'إفراج' } },
  },
  hi: {
    'open-market': { title: 'ताज़े टमाटर, 10 टोकरी', pill: 'खुला', rows: [{ label: 'Halima · ★ 4.8', value: '{a} USDC' }, { label: 'Sani · ★ 4.9', value: '{b} USDC' }], done: { label: 'हर ऑफ़र सबके सामने है', pill: 'चुना गया' } },
    direct: { title: '@bola · एक फ़ोन, हाथ में सौंपा', rows: [{ label: 'Karwan के पास', value: '{a} USDC' }], done: { label: 'सौंपा गया और स्वीकार हुआ', pill: 'जारी' } },
    contest: { title: 'हमारी बेकरी के लिए लोगो', pill: '14 एंट्री', rows: [{ label: 'पहला स्थान', value: '{a} USDC' }, { label: 'दूसरा और तीसरा', value: '{b} USDC · {c} USDC' }], done: { label: 'इनाम शुरू से रखा गया', pill: 'विजेताओं को भुगतान' } },
    hourly: { title: 'वर्चुअल असिस्टेंट', pill: 'घंटे के हिसाब से', rows: [{ label: 'इस हफ़्ते', value: '20 में से 14 घंटे' }], done: { label: '{a} USDC प्रति घंटा, 4 हफ़्ते', pill: 'मासिक भी' } },
    'agent-match': { title: 'दुकान की वेबसाइट, 5 पेज', pill: 'बातचीत जारी', rows: [{ label: 'Musa · ब्रीफ़ से मेल', value: '{a} USDC' }, { label: 'Grace · ब्रीफ़ से मेल', value: '{b} USDC' }], done: { label: 'एजेंट ने खोजा, फ़ैसला आपका', pill: 'स्वीकार' } },
    'standing-order': { title: 'खोजें: कसावा, 50 किलो', pill: 'हर दिन', rows: [{ label: 'एक के लिए अधिकतम', value: '{a} USDC' }, { label: 'रोज़ पूछें', value: '3 लोग' }], done: { label: 'कोई पैसा नहीं हिलता', pill: '2 जवाब' } },
    'pay-link': { title: 'पेमेंट लिंक', pill: '7 दिन', rows: [{ label: 'karwan.site/pay/…', pill: 'कॉपी' }], done: { label: '{a} USDC, बिना खाते के', pill: 'भुगतान हुआ' } },
    release: { title: '40 शर्ट, 2 हिस्सों में', pill: 'आपकी बारी', rows: [{ label: 'भुगतान हुआ', value: '{b} USDC में से {a} USDC' }], done: { label: 'हिस्सा 2 पहुँचा', pill: 'जारी करें' } },
  },
  sw: {
    'open-market': { title: 'Nyanya mbichi, vikapu 10', pill: 'Wazi', rows: [{ label: 'Halima · ★ 4.8', value: '{a} USDC' }, { label: 'Sani · ★ 4.9', value: '{b} USDC' }], done: { label: 'Kila ofa iko wazi', pill: 'Imechaguliwa' } },
    direct: { title: '@bola · simu, imekabidhiwa mkononi', rows: [{ label: 'Imeshikiliwa na Karwan', value: '{a} USDC' }], done: { label: 'Imekabidhiwa na kukubaliwa', pill: 'Imetolewa' } },
    contest: { title: 'Nembo ya duka letu la mikate', pill: 'Kazi 14', rows: [{ label: 'Nafasi ya 1', value: '{a} USDC' }, { label: 'Ya 2 na ya 3', value: '{b} USDC · {c} USDC' }], done: { label: 'Zawadi imewekwa tangu mwanzo', pill: 'Washindi wamelipwa' } },
    hourly: { title: 'Msaidizi wa mtandaoni', pill: 'Kwa saa', rows: [{ label: 'Wiki hii', value: 'Saa 14 kati ya 20' }], done: { label: '{a} USDC kwa saa, kwa wiki 4', pill: 'Kwa mwezi pia' } },
    'agent-match': { title: 'Tovuti ya duka, kurasa 5', pill: 'Majadiliano', rows: [{ label: 'Musa · anafaa', value: '{a} USDC' }, { label: 'Grace · anafaa', value: '{b} USDC' }], done: { label: 'Wakala amewapata, wewe uamue', pill: 'Kubali' } },
    'standing-order': { title: 'Tafuta: muhogo, kilo 50', pill: 'Kila siku', rows: [{ label: 'Juu kabisa kwa moja', value: '{a} USDC' }, { label: 'Uliza kwa siku', value: 'Watu 3' }], done: { label: 'Hauhamishi pesa', pill: '2 wamejibu' } },
    'pay-link': { title: 'Kiungo cha malipo', pill: 'Siku 7', rows: [{ label: 'karwan.site/pay/…', pill: 'Nakili' }], done: { label: '{a} USDC, bila akaunti', pill: 'Imelipwa' } },
    release: { title: 'Mashati 40, kwa sehemu 2', pill: 'Zamu yako', rows: [{ label: 'Imelipwa', value: '{a} USDC kati ya {b} USDC' }], done: { label: 'Sehemu ya 2 imefika', pill: 'Toa' } },
  },
};

/// The money in each scene, in USDC. The reader sees it in their own currency.
export const SCENE_MONEY: Record<DealSceneId, Record<string, number>> = {
  'open-market': { a: 62, b: 60 },
  direct: { a: 310 },
  contest: { a: 110, b: 65, c: 45 },
  hourly: { a: 6 },
  'agent-match': { a: 210, b: 225 },
  'standing-order': { a: 33 },
  'pay-link': { a: 18.5 },
  release: { a: 150, b: 300 },
};

/// How full the bar under the first row is, for the scenes that have one.
export const SCENE_METER: Partial<Record<DealSceneId, number>> = { hourly: 0.7, release: 0.5 };
