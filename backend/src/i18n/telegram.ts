import type { UserLocale } from '../db/profiles.js';

/// Tiny translation table for the highest-traffic Telegram event copy. Falls
/// back to English when the user has no locale set or when a key is missing
/// from the chosen locale. This is intentionally a thin slice; the full Phase
/// 2 i18n pass extends every notifier branch to read from this table.
///
/// To add a key: extend the English block with the new copy, then add the
/// translated string to each non-English locale.

type TgKey =
  | 'cancelProposedFromOther.mutual'
  | 'cancelProposedFromOther.platform'
  | 'cancelProposedFromSelf'
  | 'cancelDeclinedToProposer'
  | 'cancelDeclinedBySelf'
  | 'milestoneReleasedToSeller.first'
  | 'milestoneReleasedToSeller.final'
  | 'milestoneReleasedToBuyer.first'
  | 'milestoneReleasedToBuyer.final'
  | 'bidAcceptedToSeller'
  | 'bidAcceptedToBuyer'
  | 'reputationRecordedSuccessSeller'
  | 'reputationRecordedSuccessBuyer'
  | 'dealCancelled'
  | 'dealDeliveredToBuyer'
  | 'dealDeliveredToSeller'
  | 'openInKarwan'
  | 'researchFailed'
  | 'researchFailedPaid'
  | 'insight.testnetBudget'
  | 'insight.missedByPrice'
  | 'insight.budgetBelowBand'
  | 'insight.cheaperBetterSellers'
  | 'insight.slowRequest'
  | 'insight.heading'
  | 'insight.questions';

const en: Record<TgKey, string> = {
  'cancelProposedFromOther.mutual':
    '*The {role} is proposing to cancel this deal* (mutual). Open the deal to accept or decline.',
  'cancelProposedFromOther.platform':
    '*The {role} flagged this deal as a platform misroute*. Open the deal to accept or decline.',
  'cancelProposedFromSelf':
    '*Cancellation proposed*. Waiting on the other party to accept or decline.',
  'cancelDeclinedToProposer':
    '*Your cancellation proposal was declined*. The deal continues as normal.',
  'cancelDeclinedBySelf':
    '*You declined the cancellation proposal*. The deal continues as normal.',
  'milestoneReleasedToSeller.first':
    '*First milestone released*. Funds are on their way to your agent wallet.',
  'milestoneReleasedToSeller.final':
    '*Final milestone released*. Funds are on their way to your agent wallet.',
  'milestoneReleasedToBuyer.first': '*First milestone released* to the seller.',
  'milestoneReleasedToBuyer.final': '*Final milestone released* to the seller.',
  'bidAcceptedToSeller':
    "*Your bid was accepted*. Escrow funds next; you'll get another note when it lands.",
  'bidAcceptedToBuyer': '*Bid accepted*. Escrow is being funded.',
  'reputationRecordedSuccessSeller':
    '*Reputation updated on chain* for a successful settlement. View your passport for the new score.',
  'reputationRecordedSuccessBuyer':
    '*Reputation recorded on chain* for a successful settlement.',
  'dealCancelled': '*Deal cancelled*.',
  'dealDeliveredToBuyer':
    '*Seller marked the work delivered*. Open the deal to verify and release.',
  'dealDeliveredToSeller':
    '*You marked the deal delivered*. The buyer review window is open.',
  'openInKarwan': 'Open in Karwan',
  'insight.questions': "Your agent asked you {asked} questions: you answered {answered}, and {byDefault} went its stated way with no answer.",
  'insight.testnetBudget': "*{title}*: this is the test network, where deals settled at {low} to {high} USDC. Lower your budget from {budget} to {suggested} USDC to land a deal faster.",
  'insight.missedByPrice': "You missed {count} requests this week because your lowest price, {lowest} USDC, was above what buyers offered. They offered around {median} USDC.",
  'insight.budgetBelowBand': "*{title}*: deals like this settled at {low} to {high} USDC. Your budget is {budget} USDC; {low} USDC would reach more sellers.",
  'insight.cheaperBetterSellers': "*{title}*: {count} sellers with a record as good as this one charge less than {price} USDC, from {lowest} USDC.",
  'insight.slowRequest': "*{title}* has had no offer for a day. Sellers on similar requests asked for about {usualDays} days; yours allows {days}.",
  'insight.heading': "*What your agent sees:*",
  'researchFailed': "*Research for {title} didn't finish.* Your agent carried on with Karwan's own prices.",
  'researchFailedPaid': "*Research for {title} didn't finish*, and {amount} USDC was spent on it. Your agent carried on with Karwan's own prices.",
};

const ar: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    '*{role} يقترح إلغاء هذه الصفقة* (بالتراضي). افتح الصفقة للقبول أو الرفض.',
  'cancelProposedFromOther.platform':
    '*{role} أبلغ عن هذه الصفقة كخطأ توجيه من المنصة*. افتح الصفقة للقبول أو الرفض.',
  'cancelProposedFromSelf':
    '*تم اقتراح الإلغاء*. في انتظار الطرف الآخر للقبول أو الرفض.',
  'cancelDeclinedToProposer':
    '*تم رفض اقتراح الإلغاء*. تستمر الصفقة كالمعتاد.',
  'cancelDeclinedBySelf':
    '*لقد رفضت اقتراح الإلغاء*. تستمر الصفقة كالمعتاد.',
  'milestoneReleasedToSeller.first':
    '*تم الإفراج عن المرحلة الأولى*. الأموال في طريقها إلى محفظة وكيلك.',
  'milestoneReleasedToSeller.final':
    '*تم الإفراج عن المرحلة النهائية*. الأموال في طريقها إلى محفظة وكيلك.',
  'milestoneReleasedToBuyer.first': '*تم الإفراج عن المرحلة الأولى* إلى البائع.',
  'milestoneReleasedToBuyer.final': '*تم الإفراج عن المرحلة النهائية* إلى البائع.',
  'bidAcceptedToSeller':
    '*تم قبول عرضك*. تمويل الضمان قادم؛ ستصلك ملاحظة أخرى عند اكتماله.',
  'bidAcceptedToBuyer': '*تم قبول العرض*. يتم تمويل الضمان الآن.',
  'reputationRecordedSuccessSeller':
    '*تم تحديث السمعة على السلسلة* لتسوية ناجحة. اطّلع على جواز السمعة للنتيجة الجديدة.',
  'reputationRecordedSuccessBuyer':
    '*تم تسجيل السمعة على السلسلة* لتسوية ناجحة.',
  'dealCancelled': '*تم إلغاء الصفقة*.',
  'dealDeliveredToBuyer':
    '*وضع البائع علامة تم التسليم*. افتح الصفقة للتحقق والإفراج.',
  'dealDeliveredToSeller':
    '*لقد علّمت الصفقة كتم التسليم*. نافذة مراجعة المشتري مفتوحة.',
  'openInKarwan': 'افتح في كروان',
  'insight.questions': "طرح عليك وكيلك {asked} أسئلة: أجبت عن {answered}، و{byDefault} مضت كما أُعلن دون إجابة.",
  'insight.testnetBudget': "*{title}*: هذه شبكة الاختبار، وقد أُبرمت الصفقات فيها بين {low} و{high} USDC. خفّض ميزانيتك من {budget} إلى {suggested} USDC لتُبرم صفقة أسرع.",
  'insight.missedByPrice': "فاتتك {count} طلبات هذا الأسبوع لأن أدنى سعر لديك، {lowest} USDC، كان أعلى مما عرضه المشترون. عرضوا نحو {median} USDC.",
  'insight.budgetBelowBand': "*{title}*: أُبرمت صفقات مثل هذه بين {low} و{high} USDC. ميزانيتك {budget} USDC؛ و{low} USDC ستصل إلى بائعين أكثر.",
  'insight.cheaperBetterSellers': "*{title}*: {count} بائعين بسجل لا يقل عن هذا يطلبون أقل من {price} USDC، بدءًا من {lowest} USDC.",
  'insight.slowRequest': "*{title}* لم يتلقَّ أي عرض منذ يوم. طلب البائعون في طلبات مشابهة نحو {usualDays} أيام؛ وطلبك يسمح بـ{days}.",
  'insight.heading': "*ما يراه وكيلك:*",
  'researchFailed': "*لم يكتمل البحث عن {title}.* واصل وكيلك بأسعار كروان نفسها.",
  'researchFailedPaid': "*لم يكتمل البحث عن {title}*، وأُنفق عليه {amount} USDC. واصل وكيلك بأسعار كروان نفسها.",
};

const fr: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    "*Le/la {role} propose d'annuler cette transaction* (mutuel). Ouvrez la transaction pour accepter ou refuser.",
  'cancelProposedFromOther.platform':
    "*Le/la {role} a signalé cette transaction comme une erreur de la plateforme*. Ouvrez la transaction pour accepter ou refuser.",
  'cancelProposedFromSelf':
    "*Annulation proposée*. En attente de la décision de l'autre partie.",
  'cancelDeclinedToProposer':
    "*Votre proposition d'annulation a été refusée*. La transaction se poursuit normalement.",
  'cancelDeclinedBySelf':
    "*Vous avez refusé la proposition d'annulation*. La transaction se poursuit normalement.",
  'milestoneReleasedToSeller.first':
    '*Première étape libérée*. Les fonds arrivent vers votre portefeuille agent.',
  'milestoneReleasedToSeller.final':
    '*Étape finale libérée*. Les fonds arrivent vers votre portefeuille agent.',
  'milestoneReleasedToBuyer.first': '*Première étape libérée* au vendeur.',
  'milestoneReleasedToBuyer.final': '*Étape finale libérée* au vendeur.',
  'bidAcceptedToSeller':
    "*Votre offre a été acceptée*. Le séquestre se finance ensuite; vous recevrez un autre message.",
  'bidAcceptedToBuyer': "*Offre acceptée*. Le séquestre est en cours de financement.",
  'reputationRecordedSuccessSeller':
    '*Réputation mise à jour on-chain* pour un règlement réussi. Consultez votre passeport.',
  'reputationRecordedSuccessBuyer':
    '*Réputation enregistrée on-chain* pour un règlement réussi.',
  'dealCancelled': '*Transaction annulée*.',
  'dealDeliveredToBuyer':
    "*Le vendeur a marqué le travail comme livré*. Ouvrez la transaction pour vérifier et libérer.",
  'dealDeliveredToSeller':
    "*Vous avez marqué la transaction comme livrée*. La fenêtre d'examen acheteur est ouverte.",
  'openInKarwan': 'Ouvrir dans Karwan',
  'insight.questions': "Votre agent vous a posé {asked} questions : vous avez répondu à {answered}, et {byDefault} ont suivi la réponse annoncée faute de réponse.",
  'insight.testnetBudget': "*{title}* : c'est le réseau de test, où les transactions se sont conclues entre {low} et {high} USDC. Baissez votre budget de {budget} à {suggested} USDC pour conclure plus vite.",
  'insight.missedByPrice': "Vous avez manqué {count} demandes cette semaine car votre prix le plus bas, {lowest} USDC, dépassait ce que les acheteurs proposaient. Ils proposaient environ {median} USDC.",
  'insight.budgetBelowBand': "*{title}* : les transactions de ce type se sont conclues entre {low} et {high} USDC. Votre budget est de {budget} USDC ; {low} USDC toucherait plus de vendeurs.",
  'insight.cheaperBetterSellers': "*{title}* : {count} vendeurs avec un historique aussi bon demandent moins de {price} USDC, à partir de {lowest} USDC.",
  'insight.slowRequest': "*{title}* n'a reçu aucune offre depuis un jour. Pour des demandes similaires, les vendeurs ont demandé environ {usualDays} jours ; la vôtre en laisse {days}.",
  'insight.heading': "*Ce que voit votre agent :*",
  'researchFailed': "*La recherche pour {title} n'a pas abouti.* Votre agent a continué avec les prix de Karwan.",
  'researchFailedPaid': "*La recherche pour {title} n'a pas abouti*, et {amount} USDC y ont été dépensés. Votre agent a continué avec les prix de Karwan.",
};

const hi: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    '*{role} इस सौदे को रद्द करने का प्रस्ताव दे रहा है* (आपसी)। स्वीकार या अस्वीकार करने के लिए सौदा खोलें।',
  'cancelProposedFromOther.platform':
    '*{role} ने इस सौदे को प्लेटफ़ॉर्म त्रुटि के रूप में चिह्नित किया*। स्वीकार या अस्वीकार करने के लिए खोलें।',
  'cancelProposedFromSelf':
    '*रद्दीकरण प्रस्तावित*। दूसरे पक्ष की स्वीकृति या अस्वीकृति का इंतज़ार है।',
  'cancelDeclinedToProposer':
    '*आपका रद्दीकरण प्रस्ताव अस्वीकृत हुआ*। सौदा सामान्य रूप से जारी रहेगा।',
  'cancelDeclinedBySelf':
    '*आपने रद्दीकरण प्रस्ताव अस्वीकार किया*। सौदा सामान्य रूप से जारी रहेगा।',
  'milestoneReleasedToSeller.first':
    '*पहली मील का पत्थर जारी*। राशि आपके एजेंट वॉलेट में आ रही है।',
  'milestoneReleasedToSeller.final':
    '*अंतिम मील का पत्थर जारी*। राशि आपके एजेंट वॉलेट में आ रही है।',
  'milestoneReleasedToBuyer.first': '*पहली मील का पत्थर जारी* विक्रेता को।',
  'milestoneReleasedToBuyer.final': '*अंतिम मील का पत्थर जारी* विक्रेता को।',
  'bidAcceptedToSeller':
    '*आपकी बोली स्वीकृत*। एस्क्रो आगे फंड होगा; उसकी सूचना अलग से मिलेगी।',
  'bidAcceptedToBuyer': '*बोली स्वीकृत*। एस्क्रो फंड हो रहा है।',
  'reputationRecordedSuccessSeller':
    '*प्रतिष्ठा ऑन-चेन अपडेट* सफल निपटान के लिए। पासपोर्ट पर नई स्कोर देखें।',
  'reputationRecordedSuccessBuyer':
    '*प्रतिष्ठा ऑन-चेन दर्ज* सफल निपटान के लिए।',
  'dealCancelled': '*सौदा रद्द*।',
  'dealDeliveredToBuyer':
    '*विक्रेता ने डिलीवरी चिह्नित की*। सत्यापन और रिलीज़ के लिए सौदा खोलें।',
  'dealDeliveredToSeller':
    '*आपने सौदा डिलीवर चिह्नित किया*। खरीदार समीक्षा विंडो खुली है।',
  'openInKarwan': 'Karwan में खोलें',
  'insight.questions': "आपके एजेंट ने आपसे {asked} सवाल पूछे: आपने {answered} का जवाब दिया, और {byDefault} बिना जवाब के बताए गए तरीके से तय हुए।",
  'insight.testnetBudget': "*{title}*: यह टेस्ट नेटवर्क है, जहाँ सौदे {low} से {high} USDC में हुए। जल्दी सौदा पाने के लिए अपना बजट {budget} से घटाकर {suggested} USDC करें।",
  'insight.missedByPrice': "इस हफ़्ते आपसे {count} अनुरोध छूट गए क्योंकि आपकी सबसे कम कीमत, {lowest} USDC, खरीदारों की पेशकश से ज़्यादा थी। उन्होंने लगभग {median} USDC की पेशकश की।",
  'insight.budgetBelowBand': "*{title}*: ऐसे सौदे {low} से {high} USDC में हुए। आपका बजट {budget} USDC है; {low} USDC से ज़्यादा विक्रेता मिलेंगे।",
  'insight.cheaperBetterSellers': "*{title}*: इतने ही अच्छे रिकॉर्ड वाले {count} विक्रेता {price} USDC से कम लेते हैं, {lowest} USDC से शुरू।",
  'insight.slowRequest': "*{title}* पर एक दिन से कोई पेशकश नहीं आई। मिलते-जुलते अनुरोधों पर विक्रेताओं ने लगभग {usualDays} दिन माँगे; आपका अनुरोध {days} दिन देता है।",
  'insight.heading': "*आपका एजेंट क्या देख रहा है:*",
  'researchFailed': "*{title} के लिए खोज पूरी नहीं हुई।* आपका एजेंट Karwan की अपनी कीमतों के साथ आगे बढ़ा।",
  'researchFailedPaid': "*{title} के लिए खोज पूरी नहीं हुई*, और इस पर {amount} USDC खर्च हुए। आपका एजेंट Karwan की अपनी कीमतों के साथ आगे बढ़ा।",
};

const sw: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    '*{role} anapendekeza kufuta mkataba huu* (kwa makubaliano). Fungua mkataba kukubali au kukataa.',
  'cancelProposedFromOther.platform':
    '*{role} ameashiria mkataba kama hitilafu ya jukwaa*. Fungua kukubali au kukataa.',
  'cancelProposedFromSelf':
    '*Pendekezo la kufuta limewasilishwa*. Tunasubiri upande mwingine kukubali au kukataa.',
  'cancelDeclinedToProposer':
    '*Pendekezo lako la kufuta limekataliwa*. Mkataba unaendelea kawaida.',
  'cancelDeclinedBySelf':
    '*Umekataa pendekezo la kufuta*. Mkataba unaendelea kawaida.',
  'milestoneReleasedToSeller.first':
    '*Hatua ya kwanza imeachiliwa*. Fedha zinakuja kwenye pochi yako ya wakala.',
  'milestoneReleasedToSeller.final':
    '*Hatua ya mwisho imeachiliwa*. Fedha zinakuja kwenye pochi yako ya wakala.',
  'milestoneReleasedToBuyer.first': '*Hatua ya kwanza imeachiliwa* kwa muuzaji.',
  'milestoneReleasedToBuyer.final': '*Hatua ya mwisho imeachiliwa* kwa muuzaji.',
  'bidAcceptedToSeller':
    '*Toleo lako limekubaliwa*. Eskrowi inafuata; utapokea ujumbe mwingine.',
  'bidAcceptedToBuyer': '*Toleo limekubaliwa*. Eskrowi inafadhiliwa.',
  'reputationRecordedSuccessSeller':
    '*Sifa imesasishwa kwenye mnyororo* kwa malipo yenye mafanikio. Tazama pasi yako.',
  'reputationRecordedSuccessBuyer':
    '*Sifa imerekodiwa kwenye mnyororo* kwa malipo yenye mafanikio.',
  'dealCancelled': '*Mkataba umefutwa*.',
  'dealDeliveredToBuyer':
    '*Muuzaji ameashiria kazi imewasilishwa*. Fungua kuthibitisha na kuachilia.',
  'dealDeliveredToSeller':
    '*Umeashiria mkataba kuwa umewasilishwa*. Dirisha la mapitio la mnunuzi limefunguliwa.',
  'openInKarwan': 'Fungua katika Karwan',
  'insight.questions': "Wakala wako alikuuliza maswali {asked}: ulijibu {answered}, na {byDefault} yalienda kama ilivyosemwa bila jibu.",
  'insight.testnetBudget': "*{title}*: huu ni mtandao wa majaribio, ambapo mikataba ilifungwa kwa {low} hadi {high} USDC. Punguza bajeti yako kutoka {budget} hadi {suggested} USDC ili kupata mkataba haraka.",
  'insight.missedByPrice': "Ulikosa maombi {count} wiki hii kwa sababu bei yako ya chini kabisa, {lowest} USDC, ilikuwa juu ya walichotoa wanunuzi. Walitoa karibu {median} USDC.",
  'insight.budgetBelowBand': "*{title}*: mikataba kama huu ilifungwa kwa {low} hadi {high} USDC. Bajeti yako ni {budget} USDC; {low} USDC ingewafikia wauzaji wengi zaidi.",
  'insight.cheaperBetterSellers': "*{title}*: wauzaji {count} wenye rekodi nzuri kama hii wanatoza chini ya {price} USDC, kuanzia {lowest} USDC.",
  'insight.slowRequest': "*{title}* haijapata ofa kwa siku moja. Wauzaji kwenye maombi yanayofanana waliomba karibu siku {usualDays}; lako linaruhusu {days}.",
  'insight.heading': "*Anachoona wakala wako:*",
  'researchFailed': "*Utafiti wa {title} haukukamilika.* Wakala wako aliendelea kwa bei za Karwan zenyewe.",
  'researchFailedPaid': "*Utafiti wa {title} haukukamilika*, na {amount} USDC zilitumika. Wakala wako aliendelea kwa bei za Karwan zenyewe.",
};

const TABLES: Record<UserLocale, Partial<Record<TgKey, string>>> = {
  en,
  ar,
  fr,
  hi,
  sw,
};

export function tg(
  key: TgKey,
  locale: UserLocale | undefined,
  vars?: Record<string, string>,
): string {
  const table = TABLES[locale ?? 'en'];
  const raw = table[key] ?? en[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`);
}
