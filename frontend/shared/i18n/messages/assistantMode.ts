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
  },
};
