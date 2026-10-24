/// The deal page's live parts: the current step of the timeline, the latest
/// activity, the message button and the finished state. {name} and {date} are
/// filled at render.
export interface DealLiveCopy {
  working: string;
  deliver: string;
  due: string;
  checking: string;
  checkingDetail: string;
  latest: string;
  openMessages: string;
  message: string;
  you: string;
  completeTitle: string;
  completeBody: string;
  /// Escrow-family deals: once the record holds both sides' outcomes, and before.
  onBothRecords: string;
  recordPending: string;
  /// The seller's agree sheet when their Karwan record is set up first.
  recordFirst: string;
  /// Escrow family: nothing releases on review time alone (view 27 decision 7).
  askPayment: string;
  askPaymentConsequence: string;
  reviewEndsYou: string;
  reviewEnds: string;
  silencePayoutYou: string;
  silencePayout: string;
  again: string;
  autoReleaseYou: string;
  reclaimYou: string;
}

export const dealLiveCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', DealLiveCopy> = {
  en: {
    working: '{name} is working on it',
    deliver: 'Your turn to deliver',
    due: 'Due {date}',
    checking: 'Checking the delivery',
    checkingDetail: 'Comparing it with the request.',
    latest: 'Latest',
    openMessages: 'Open messages',
    message: 'Message {name}',
    you: 'You',
    completeTitle: 'Deal complete',
    completeBody: 'It now counts on both of your records.',
    onBothRecords: 'Paid. On both your records.',
    recordPending: 'Your records update once the network confirms.',
    recordFirst: 'Your Karwan record is set up first, so this deal counts on it. Your buying agent can then pay up to 1,005 USDC at a time and 10,000 USDC in total for one year.',
    askPayment: 'Ask for payment',
    askPaymentConsequence: 'The buyer gets 72 hours to answer. If they do not, {amount} USDC is paid to you.',
    reviewEndsYou: 'Release or raise a problem by {date}. After that the seller can ask for payment, and you have 72 hours to answer.',
    reviewEnds: 'If the buyer has not released by {date}, you can ask for payment.',
    silencePayoutYou: 'The payment goes to the seller on {date} unless you answer with what is wrong.',
    silencePayout: 'If the buyer does not answer by {date}, the payment is yours.',
    again: 'Start another deal with {name}',
    autoReleaseYou: "Releases automatically on {date} unless you raise a problem.",
    reclaimYou: "If nothing is delivered, you can take your money back from {date}.",
  },
  fr: {
    working: '{name} travaille dessus',
    deliver: 'À vous de livrer',
    due: 'Échéance le {date}',
    checking: 'Vérification de la livraison',
    checkingDetail: 'Comparaison avec la demande.',
    latest: 'Dernières nouvelles',
    openMessages: 'Ouvrir les messages',
    message: 'Écrire à {name}',
    you: 'Vous',
    completeTitle: 'Accord terminé',
    completeBody: 'Il compte désormais dans vos deux historiques.',
    onBothRecords: 'Payé. Inscrit dans vos deux historiques.',
    recordPending: 'Vos historiques se mettent à jour dès que le réseau confirme.',
    recordFirst: 'Votre historique Karwan est d’abord créé, pour que cet accord y compte. Votre agent d’achat pourra ensuite payer jusqu’à 1 005 USDC par paiement et 10 000 USDC au total pendant un an.',
    askPayment: 'Demander le paiement',
    askPaymentConsequence: 'L’acheteur a 72 heures pour répondre. Sans réponse, {amount} USDC vous sont versés.',
    reviewEndsYou: 'Libérez le paiement ou signalez un problème avant le {date}. Ensuite, le vendeur peut demander le paiement et vous aurez 72 heures pour répondre.',
    reviewEnds: 'Si l’acheteur n’a pas libéré le paiement le {date}, vous pourrez le demander.',
    silencePayoutYou: 'Le paiement ira au vendeur le {date}, sauf si vous expliquez ce qui ne va pas.',
    silencePayout: 'Si l’acheteur ne répond pas avant le {date}, le paiement vous revient.',
    again: 'Nouvel accord avec {name}',
    autoReleaseYou: "Libération automatique le {date}, sauf si vous signalez un problème.",
    reclaimYou: "Sans livraison, vous pouvez reprendre votre argent à partir du {date}.",
  },
  ar: {
    working: '{name} يعمل عليه',
    deliver: 'دورك في التسليم',
    due: 'الموعد {date}',
    checking: 'جارٍ فحص التسليم',
    checkingDetail: 'تتم مقارنته بالطلب.',
    latest: 'الأحدث',
    openMessages: 'فتح الرسائل',
    message: 'مراسلة {name}',
    you: 'أنت',
    completeTitle: 'اكتملت الصفقة',
    completeBody: 'أصبحت تُحتسب الآن في سجلّيكما.',
    onBothRecords: 'تم الدفع. مُسجّل في سجلّيكما.',
    recordPending: 'يُحدَّث سجلّاكما حين تؤكد الشبكة.',
    recordFirst: 'يُنشأ سجلّك في كاروان أولاً، لتُحتسب هذه الصفقة فيه. بعدها يستطيع وكيل الشراء الدفع حتى 1,005 USDC في كل مرة و10,000 USDC إجمالاً لمدة سنة.',
    askPayment: 'اطلب الدفع',
    askPaymentConsequence: 'أمام المشتري 72 ساعة للرد. إن لم يرد، تُدفع لك {amount} USDC.',
    reviewEndsYou: 'اصرف الدفعة أو أبلغ عن مشكلة قبل {date}. بعد ذلك يمكن للبائع طلب الدفع، ويكون أمامك 72 ساعة للرد.',
    reviewEnds: 'إن لم يصرف المشتري الدفعة بحلول {date}، يمكنك طلب الدفع.',
    silencePayoutYou: 'تذهب الدفعة إلى البائع في {date} ما لم ترد بما هو خطأ.',
    silencePayout: 'إن لم يرد المشتري بحلول {date}، تكون الدفعة لك.',
    again: 'صفقة جديدة مع {name}',
    autoReleaseYou: "تُصرف تلقائيًا في {date} ما لم تُبلغ عن مشكلة.",
    reclaimYou: "إن لم يُسلَّم شيء، يمكنك استرداد مالك اعتبارًا من {date}.",
  },
  hi: {
    working: '{name} इस पर काम कर रहे हैं',
    deliver: 'डिलीवर करने की आपकी बारी',
    due: '{date} तक',
    checking: 'डिलीवरी की जाँच हो रही है',
    checkingDetail: 'इसे अनुरोध से मिलाया जा रहा है।',
    latest: 'ताज़ा',
    openMessages: 'संदेश खोलें',
    message: '{name} को संदेश भेजें',
    you: 'आप',
    completeTitle: 'सौदा पूरा हुआ',
    completeBody: 'अब यह आप दोनों के रिकॉर्ड में गिना जाता है।',
    onBothRecords: 'भुगतान हुआ। आप दोनों के रिकॉर्ड में दर्ज।',
    recordPending: 'नेटवर्क की पुष्टि होते ही आपके रिकॉर्ड अपडेट होंगे।',
    recordFirst: 'पहले आपका Karwan रिकॉर्ड बनता है, ताकि यह सौदा उसमें गिना जाए। फिर आपका ख़रीद एजेंट एक बार में 1,005 USDC तक और एक साल में कुल 10,000 USDC तक भुगतान कर सकता है।',
    askPayment: 'भुगतान माँगें',
    askPaymentConsequence: 'ख़रीदार के पास जवाब देने के लिए 72 घंटे हैं। जवाब न आए तो {amount} USDC आपको मिलेंगे।',
    reviewEndsYou: '{date} तक भुगतान जारी करें या समस्या बताएँ। उसके बाद विक्रेता भुगतान माँग सकता है, और आपके पास जवाब के लिए 72 घंटे होंगे।',
    reviewEnds: 'अगर ख़रीदार {date} तक भुगतान जारी नहीं करता, तो आप भुगतान माँग सकते हैं।',
    silencePayoutYou: '{date} को भुगतान विक्रेता को जाएगा, जब तक आप यह न बताएँ कि क्या ग़लत है।',
    silencePayout: 'अगर ख़रीदार {date} तक जवाब नहीं देता, तो भुगतान आपका है।',
    again: '{name} के साथ नया सौदा',
    autoReleaseYou: "{date} को अपने आप जारी होगा, जब तक आप कोई समस्या न बताएँ।",
    reclaimYou: "अगर कुछ डिलीवर नहीं हुआ, तो आप {date} से अपना पैसा वापस ले सकते हैं।",
  },
  sw: {
    working: '{name} anaifanyia kazi',
    deliver: 'Zamu yako kuwasilisha',
    due: 'Mwisho {date}',
    checking: 'Kukagua uwasilishaji',
    checkingDetail: 'Inalinganishwa na ombi.',
    latest: 'Karibuni',
    openMessages: 'Fungua ujumbe',
    message: 'Mtumie {name} ujumbe',
    you: 'Wewe',
    completeTitle: 'Mkataba umekamilika',
    completeBody: 'Sasa unahesabiwa kwenye rekodi zenu zote mbili.',
    onBothRecords: 'Imelipwa. Imo kwenye rekodi zenu zote mbili.',
    recordPending: 'Rekodi zenu zitasasishwa mtandao ukithibitisha.',
    recordFirst: 'Rekodi yako ya Karwan inaundwa kwanza, ili mkataba huu uhesabiwe humo. Kisha wakala wako wa ununuzi anaweza kulipa hadi USDC 1,005 kwa mara moja na USDC 10,000 kwa jumla kwa mwaka mmoja.',
    askPayment: 'Omba malipo',
    askPaymentConsequence: 'Mnunuzi ana saa 72 kujibu. Asipojibu, USDC {amount} zitalipwa kwako.',
    reviewEndsYou: 'Toa malipo au ripoti tatizo kufikia {date}. Baada ya hapo muuzaji anaweza kuomba malipo, nawe utakuwa na saa 72 kujibu.',
    reviewEnds: 'Mnunuzi asipotoa malipo kufikia {date}, unaweza kuomba malipo.',
    silencePayoutYou: 'Malipo yataenda kwa muuzaji tarehe {date} usipojibu kwa kueleza kilichoharibika.',
    silencePayout: 'Mnunuzi asipojibu kufikia {date}, malipo ni yako.',
    again: 'Mkataba mpya na {name}',
    autoReleaseYou: "Inatolewa yenyewe tarehe {date} usipoibua tatizo.",
    reclaimYou: "Kama hakuna kilichowasilishwa, unaweza kurudisha pesa zako kuanzia {date}.",
  },
};
