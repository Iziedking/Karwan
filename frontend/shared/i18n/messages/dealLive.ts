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
  again: string;
  autoReleaseYou: string;
  reclaimYou: string;
  reclaimWaitsYou: string;
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
    again: 'Start another deal with {name}',
    autoReleaseYou: "Releases automatically on {date} unless you raise a problem.",
    reclaimYou: "If nothing is delivered, you can take your money back from {date}.",
    reclaimWaitsYou: "The seller asked for more time. Your money stays in the deal until you answer.",
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
    again: 'Nouvel accord avec {name}',
    autoReleaseYou: "Libération automatique le {date}, sauf si vous signalez un problème.",
    reclaimYou: "Sans livraison, vous pouvez reprendre votre argent à partir du {date}.",
    reclaimWaitsYou: "Le vendeur a demandé plus de temps. Votre argent reste dans l’accord jusqu’à votre réponse.",
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
    again: 'صفقة جديدة مع {name}',
    autoReleaseYou: "تُصرف تلقائيًا في {date} ما لم تُبلغ عن مشكلة.",
    reclaimYou: "إن لم يُسلَّم شيء، يمكنك استرداد مالك اعتبارًا من {date}.",
    reclaimWaitsYou: "طلب البائع مزيدًا من الوقت. يبقى مالك في الصفقة حتى تردّ.",
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
    again: '{name} के साथ नया सौदा',
    autoReleaseYou: "{date} को अपने आप जारी होगा, जब तक आप कोई समस्या न बताएँ।",
    reclaimYou: "अगर कुछ डिलीवर नहीं हुआ, तो आप {date} से अपना पैसा वापस ले सकते हैं।",
    reclaimWaitsYou: "विक्रेता ने और समय माँगा है। जब तक आप जवाब नहीं देते, आपका पैसा सौदे में रहता है।",
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
    again: 'Mkataba mpya na {name}',
    autoReleaseYou: "Inatolewa yenyewe tarehe {date} usipoibua tatizo.",
    reclaimYou: "Kama hakuna kilichowasilishwa, unaweza kurudisha pesa zako kuanzia {date}.",
    reclaimWaitsYou: "Muuzaji ameomba muda zaidi. Pesa zako zinabaki kwenye mkataba hadi ujibu.",
  },
};
