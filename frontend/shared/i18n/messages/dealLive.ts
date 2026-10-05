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
    again: 'Mkataba mpya na {name}',
    autoReleaseYou: "Inatolewa yenyewe tarehe {date} usipoibua tatizo.",
    reclaimYou: "Kama hakuna kilichowasilishwa, unaweza kurudisha pesa zako kuanzia {date}.",
  },
};
