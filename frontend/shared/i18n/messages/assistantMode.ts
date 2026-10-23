/// Assistant mode (/assistant) and the switch that opens it (view 19).

export interface AssistantModeCopy {
  use: string;
  on: string;
  /// The switch's label on a phone.
  short: string;
  conversations: string;
  newConversation: string;
  today: string;
  yesterday: string;
  earlier: string;
  noConversations: string;
  morning: string;
  afternoon: string;
  evening: string;
  greetingBody: string;
  placeholder: string;
  chips: [string, string, string, string];
  confirmNote: string;
  pastDone: string;
  pastClosed: string;
  loadError: string;
  askHome: string;
  /// Why a reply did not come. Slow or failed: try again; offline or the
  /// account unreadable: a person is joining.
  errNoAccount: string;
  errSlow: string;
  errOffline: string;
  errSnag: string;
  remove: string;
  /// The round button that jumps to the newest message.
  jumpLatest: string;
  /// Accessible name of a history row's delete button: {title}.
  removeNamed: string;
  removeTitle: string;
  removeBody: string;
  removeKeep: string;
  removeFailed: string;
  attach: string;
  /// The line shown as your message when a file is added: {name}.
  attached: string;
  attachWrongType: string;
  attachTooBig: string;
  attachTooMany: string;
}

export const assistantModeCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', AssistantModeCopy> = {
  en: {
    use: 'Use assistant',
    on: 'Assistant on',
    short: 'Assistant',
    conversations: 'Conversations',
    newConversation: 'New conversation',
    today: 'Today',
    yesterday: 'Yesterday',
    earlier: 'Earlier',
    noConversations: 'Your conversations will show here.',
    morning: 'Good morning, {name}.',
    afternoon: 'Good afternoon, {name}.',
    evening: 'Good evening, {name}.',
    greetingBody: "Tell me what you want to do. I'll prepare it, and nothing moves until you confirm.",
    placeholder: 'Ask or tell Karwan anything',
    chips: ['Sell something', 'Get paid for an order', 'How are my deals?', 'Find a supplier'],
    confirmNote: 'Money moves only after you confirm a card.',
    pastDone: 'Done',
    pastClosed: 'Shown earlier. Check Activity to see whether it went through.',
    loadError: "That conversation didn't open. Try again in a moment.",
    askHome: 'What do you want to do? Ask your assistant',
    errNoAccount: "I could not check your account just now, so I have not said anything happened. A person from the team is joining.",
    errSlow: "That took too long. Try again.",
    errOffline: "The assistant is offline right now. A person from the team is joining.",
    errSnag: "Something went wrong on our side. Try again.",
    remove: "Delete conversation",
    jumpLatest: "Go to latest message",
    removeNamed: "Delete conversation: {title}",
    removeTitle: "Delete this conversation?",
    removeBody: "It is removed from your account and cannot be brought back. Nothing you confirmed in it is undone.",
    removeKeep: "Keep it",
    removeFailed: "That didn't delete. Try again in a moment.",
    attach: "Add an invoice photo or PDF",
    attached: "Added {name}",
    attachWrongType: "Send a photo or a PDF.",
    attachTooBig: "That file is over 10 MB.",
    attachTooMany: "Too many files for now. Try again in a few minutes.",
  },
  fr: {
    use: "Utiliser l'assistant",
    on: 'Assistant activé',
    short: 'Assistant',
    conversations: 'Conversations',
    newConversation: 'Nouvelle conversation',
    today: "Aujourd'hui",
    yesterday: 'Hier',
    earlier: 'Plus tôt',
    noConversations: 'Vos conversations apparaîtront ici.',
    morning: 'Bonjour, {name}.',
    afternoon: 'Bon après-midi, {name}.',
    evening: 'Bonsoir, {name}.',
    greetingBody: "Dites-moi ce que vous voulez faire. Je le prépare, et rien ne bouge avant votre confirmation.",
    placeholder: 'Demandez ou dites tout à Karwan',
    chips: ['Vendre quelque chose', 'Être payé pour une commande', 'Où en sont mes affaires ?', 'Trouver un fournisseur'],
    confirmNote: "L'argent ne bouge qu'après votre confirmation d'une carte.",
    pastDone: 'Fait',
    pastClosed: 'Proposé plus tôt. Vérifiez dans Activité si c’est passé.',
    loadError: "Cette conversation ne s'est pas ouverte. Réessayez dans un instant.",
    askHome: 'Que voulez-vous faire ? Demandez à votre assistant',
    errNoAccount: "Je n’ai pas pu vérifier votre compte à l’instant, donc je n’ai rien affirmé. Une personne de l’équipe arrive.",
    errSlow: "Cela a pris trop de temps. Réessayez.",
    errOffline: "L’assistant est hors ligne pour le moment. Une personne de l’équipe arrive.",
    errSnag: "Un problème est survenu de notre côté. Réessayez.",
    remove: "Supprimer la conversation",
    jumpLatest: "Aller au dernier message",
    removeNamed: "Supprimer la conversation : {title}",
    removeTitle: "Supprimer cette conversation ?",
    removeBody: "Elle est retirée de votre compte et ne peut pas être récupérée. Rien de ce que vous y avez confirmé n’est annulé.",
    removeKeep: "La garder",
    removeFailed: "La suppression a échoué. Réessayez dans un instant.",
    attach: "Ajouter une photo ou un PDF de facture",
    attached: "Ajouté : {name}",
    attachWrongType: "Envoyez une photo ou un PDF.",
    attachTooBig: "Ce fichier dépasse 10 Mo.",
    attachTooMany: "Trop de fichiers pour le moment. Réessayez dans quelques minutes.",
  },
  ar: {
    use: 'استخدم المساعد',
    on: 'المساعد يعمل',
    short: 'المساعد',
    conversations: 'المحادثات',
    newConversation: 'محادثة جديدة',
    today: 'اليوم',
    yesterday: 'أمس',
    earlier: 'سابقًا',
    noConversations: 'ستظهر محادثاتك هنا.',
    morning: 'صباح الخير، {name}.',
    afternoon: 'طاب يومك، {name}.',
    evening: 'مساء الخير، {name}.',
    greetingBody: 'أخبرني بما تريد فعله. سأجهزه، ولا يتحرك شيء حتى تؤكد.',
    placeholder: 'اسأل Karwan أو أخبره بأي شيء',
    chips: ['بيع شيء', 'استلام ثمن طلب', 'كيف حال صفقاتي؟', 'ابحث عن مورد'],
    confirmNote: 'لا يتحرك المال إلا بعد تأكيدك لبطاقة.',
    pastDone: 'تم',
    pastClosed: 'عُرض سابقًا. راجع النشاط لترى إن تم.',
    loadError: 'لم تُفتح تلك المحادثة. حاول بعد قليل.',
    askHome: 'ماذا تريد أن تفعل؟ اسأل مساعدك',
    errNoAccount: "لم أتمكن من التحقق من حسابك الآن، لذلك لم أقل إن شيئًا حدث. شخص من الفريق ينضم إليك.",
    errSlow: "استغرق ذلك وقتًا طويلًا. حاول مرة أخرى.",
    errOffline: "المساعد غير متصل الآن. شخص من الفريق ينضم إليك.",
    errSnag: "حدث خطأ من جهتنا. حاول مرة أخرى.",
    remove: "احذف المحادثة",
    jumpLatest: "انتقل إلى آخر رسالة",
    removeNamed: "احذف المحادثة: {title}",
    removeTitle: "هل تحذف هذه المحادثة؟",
    removeBody: "تُزال من حسابك ولا يمكن استعادتها. لا يُلغى أي شيء أكدته فيها.",
    removeKeep: "أبقها",
    removeFailed: "لم يتم الحذف. حاول بعد قليل.",
    attach: "أضف صورة فاتورة أو ملف PDF",
    attached: "أُضيف {name}",
    attachWrongType: "أرسل صورة أو ملف PDF.",
    attachTooBig: "هذا الملف أكبر من 10 ميغابايت.",
    attachTooMany: "ملفات كثيرة الآن. حاول بعد بضع دقائق.",
  },
  hi: {
    use: 'सहायक का उपयोग करें',
    on: 'सहायक चालू',
    short: 'सहायक',
    conversations: 'बातचीत',
    newConversation: 'नई बातचीत',
    today: 'आज',
    yesterday: 'कल',
    earlier: 'पहले',
    noConversations: 'आपकी बातचीत यहाँ दिखेगी।',
    morning: 'सुप्रभात, {name}।',
    afternoon: 'नमस्ते, {name}।',
    evening: 'शुभ संध्या, {name}।',
    greetingBody: 'बताइए आप क्या करना चाहते हैं। मैं उसे तैयार करूँगा, और आपकी पुष्टि तक कुछ नहीं होगा।',
    placeholder: 'Karwan से कुछ भी पूछें या कहें',
    chips: ['कुछ बेचें', 'ऑर्डर का भुगतान पाएँ', 'मेरे सौदे कैसे हैं?', 'सप्लायर खोजें'],
    confirmNote: 'पैसा तभी चलता है जब आप कार्ड की पुष्टि करते हैं।',
    pastDone: 'हो गया',
    pastClosed: 'पहले दिखाया गया था। गतिविधि में देखें कि यह पूरा हुआ या नहीं।',
    loadError: 'वह बातचीत नहीं खुली। थोड़ी देर में फिर कोशिश करें।',
    askHome: 'आप क्या करना चाहते हैं? अपने सहायक से पूछें',
    errNoAccount: "मैं अभी आपका खाता नहीं देख सका, इसलिए मैंने कुछ होने की बात नहीं कही। टीम का एक व्यक्ति जुड़ रहा है।",
    errSlow: "इसमें बहुत समय लगा। फिर से कोशिश करें।",
    errOffline: "सहायक अभी ऑफ़लाइन है। टीम का एक व्यक्ति जुड़ रहा है।",
    errSnag: "हमारी ओर से कुछ गलत हुआ। फिर से कोशिश करें।",
    remove: "बातचीत हटाएँ",
    jumpLatest: "नवीनतम संदेश पर जाएँ",
    removeNamed: "बातचीत हटाएँ: {title}",
    removeTitle: "यह बातचीत हटाएँ?",
    removeBody: "यह आपके खाते से हट जाएगी और वापस नहीं लाई जा सकती। इसमें जो आपने पुष्टि की, वह रद्द नहीं होता।",
    removeKeep: "रहने दें",
    removeFailed: "हटाया नहीं जा सका। थोड़ी देर में फिर कोशिश करें।",
    attach: "इनवॉइस की फ़ोटो या PDF जोड़ें",
    attached: "{name} जोड़ा गया",
    attachWrongType: "फ़ोटो या PDF भेजें।",
    attachTooBig: "यह फ़ाइल 10 MB से बड़ी है।",
    attachTooMany: "अभी बहुत सारी फ़ाइलें। कुछ मिनट में फिर कोशिश करें।",
  },
  sw: {
    use: 'Tumia msaidizi',
    on: 'Msaidizi umewashwa',
    short: 'Msaidizi',
    conversations: 'Mazungumzo',
    newConversation: 'Mazungumzo mapya',
    today: 'Leo',
    yesterday: 'Jana',
    earlier: 'Awali',
    noConversations: 'Mazungumzo yako yataonekana hapa.',
    morning: 'Habari za asubuhi, {name}.',
    afternoon: 'Habari za mchana, {name}.',
    evening: 'Habari za jioni, {name}.',
    greetingBody: 'Niambie unachotaka kufanya. Nitakiandaa, na hakuna kinachosonga hadi uthibitishe.',
    placeholder: 'Uliza au mwambie Karwan chochote',
    chips: ['Uza kitu', 'Lipwa kwa oda', 'Mikataba yangu iko vipi?', 'Tafuta msambazaji'],
    confirmNote: 'Pesa husonga tu baada ya kuthibitisha kadi.',
    pastDone: 'Imekamilika',
    pastClosed: 'Ilionyeshwa awali. Angalia Shughuli kuona kama ilikamilika.',
    loadError: 'Mazungumzo hayo hayakufunguka. Jaribu tena baada ya muda mfupi.',
    askHome: 'Unataka kufanya nini? Muulize msaidizi wako',
    errNoAccount: "Sikuweza kuangalia akaunti yako sasa hivi, kwa hiyo sijasema kwamba kuna kilichotokea. Mtu wa timu anajiunga.",
    errSlow: "Hilo limechukua muda mrefu. Jaribu tena.",
    errOffline: "Msaidizi hayupo mtandaoni sasa. Mtu wa timu anajiunga.",
    errSnag: "Kuna hitilafu upande wetu. Jaribu tena.",
    remove: "Futa mazungumzo",
    jumpLatest: "Nenda kwenye ujumbe wa mwisho",
    removeNamed: "Futa mazungumzo: {title}",
    removeTitle: "Ufute mazungumzo haya?",
    removeBody: "Yanaondolewa kwenye akaunti yako na hayawezi kurudishwa. Chochote ulichothibitisha ndani yake hakibatilishwi.",
    removeKeep: "Yabaki",
    removeFailed: "Hayakufutwa. Jaribu tena baada ya muda mfupi.",
    attach: "Ongeza picha au PDF ya ankara",
    attached: "Imeongezwa: {name}",
    attachWrongType: "Tuma picha au PDF.",
    attachTooBig: "Faili hilo linazidi MB 10.",
    attachTooMany: "Faili nyingi kwa sasa. Jaribu tena baada ya dakika chache.",
  },
};
