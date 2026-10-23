/// Talking to someone by their Karwan tag before a deal. {tag} is filled at
/// render.
export interface DirectMessagesCopy {
  gateTag: string;
  gateBody: string;
  you: string;
  empty: string;
  placeholder: string;
  send: string;
  sending: string;
  sendFailed: string;
  warning: string;
  /// Opens the deal form with this person already filled in.
  startDeal: string;
  notFound: string;
  unavailable: string;
  retry: string;
  label: string;
  /// {hours} and {tag} are filled at render.
  refused: { paused: string; wait_reply: string; no_tag: string; link_blocked: string; self: string };
}

export const directMessagesCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', DirectMessagesCopy> = {
  en: {
    gateTag: 'Messages',
    gateBody: 'Sign in to message someone by their Karwan tag.',
    you: 'You',
    empty: 'No messages yet. Say what you need.',
    placeholder: 'Write to {tag}',
    send: 'Send',
    sending: 'Sending',
    sendFailed: 'Not sent. Try again.',
    warning: 'Keep payment in Karwan escrow. Never pay outside it.',
    startDeal: 'Start a protected deal',
    notFound: 'No one on Karwan has that tag.',
    unavailable: 'Messages are not available right now.',
    retry: 'Try again',
    label: 'Message',
    refused: { paused: "You can write to someone new in about {hours} hours.", wait_reply: "Wait for {tag} to reply before you write again.", no_tag: "Pick a Karwan tag first so they can answer you.", link_blocked: "Karwan flagged a link in this message and will not send it.", self: "That is your own tag." },
  },
  fr: {
    gateTag: 'Messages',
    gateBody: 'Connectez-vous pour écrire à quelqu’un par son tag Karwan.',
    you: 'Vous',
    empty: 'Aucun message pour l’instant. Dites ce dont vous avez besoin.',
    placeholder: 'Écrire à {tag}',
    send: 'Envoyer',
    sending: 'Envoi',
    sendFailed: 'Non envoyé. Réessayez.',
    warning: 'Gardez le paiement dans l’escrow Karwan. Ne payez jamais en dehors.',
    startDeal: 'Lancer un accord protégé',
    notFound: 'Personne sur Karwan n’a ce tag.',
    unavailable: 'Les messages ne sont pas disponibles pour le moment.',
    retry: 'Réessayer',
    label: 'Message',
    refused: { paused: "Vous pourrez écrire à quelqu’un de nouveau dans environ {hours} heures.", wait_reply: "Attendez la réponse de {tag} avant d’écrire à nouveau.", no_tag: "Choisissez d’abord un tag Karwan pour qu’on puisse vous répondre.", link_blocked: "Karwan a signalé un lien dans ce message et ne l’enverra pas.", self: "C’est votre propre tag." },
  },
  ar: {
    gateTag: 'الرسائل',
    gateBody: 'سجّل الدخول لمراسلة شخص عبر وسم Karwan الخاص به.',
    you: 'أنت',
    empty: 'لا توجد رسائل بعد. اكتب ما تحتاجه.',
    placeholder: 'اكتب إلى {tag}',
    send: 'إرسال',
    sending: 'جارٍ الإرسال',
    sendFailed: 'لم تُرسل. حاول مرة أخرى.',
    warning: 'أبقِ الدفع داخل ضمان Karwan. لا تدفع خارجه أبدًا.',
    startDeal: 'ابدأ صفقة محمية',
    notFound: 'لا يوجد أحد على Karwan بهذا الوسم.',
    unavailable: 'الرسائل غير متاحة الآن.',
    retry: 'حاول مرة أخرى',
    label: 'رسالة',
    refused: { paused: "يمكنك مراسلة شخص جديد بعد نحو {hours} ساعات.", wait_reply: "انتظر رد {tag} قبل أن تكتب مرة أخرى.", no_tag: "اختر وسم Karwan أولًا ليتمكنوا من الرد عليك.", link_blocked: "رصد Karwan رابطًا في هذه الرسالة ولن يرسلها.", self: "هذا وسمك أنت." },
  },
  hi: {
    gateTag: 'संदेश',
    gateBody: 'किसी को उसके Karwan टैग से संदेश भेजने के लिए साइन इन करें।',
    you: 'आप',
    empty: 'अभी कोई संदेश नहीं। बताइए आपको क्या चाहिए।',
    placeholder: '{tag} को लिखें',
    send: 'भेजें',
    sending: 'भेजा जा रहा है',
    sendFailed: 'नहीं भेजा गया। फिर से कोशिश करें।',
    warning: 'भुगतान Karwan एस्क्रो में ही रखें। इसके बाहर कभी भुगतान न करें।',
    startDeal: 'सुरक्षित डील शुरू करें',
    notFound: 'Karwan पर इस टैग वाला कोई नहीं है।',
    unavailable: 'संदेश अभी उपलब्ध नहीं हैं।',
    retry: 'फिर से कोशिश करें',
    label: 'संदेश',
    refused: { paused: "आप लगभग {hours} घंटे में किसी नए व्यक्ति को लिख सकेंगे।", wait_reply: "फिर से लिखने से पहले {tag} के जवाब का इंतज़ार करें।", no_tag: "पहले एक Karwan टैग चुनें ताकि वे आपको जवाब दे सकें।", link_blocked: "Karwan ने इस संदेश में एक लिंक को चिह्नित किया है और इसे नहीं भेजेगा।", self: "यह आपका अपना टैग है।" },
  },
  sw: {
    gateTag: 'Ujumbe',
    gateBody: 'Ingia ili kumtumia mtu ujumbe kwa lebo yake ya Karwan.',
    you: 'Wewe',
    empty: 'Bado hakuna ujumbe. Sema unachohitaji.',
    placeholder: 'Mwandikie {tag}',
    send: 'Tuma',
    sending: 'Inatuma',
    sendFailed: 'Haukutumwa. Jaribu tena.',
    warning: 'Weka malipo ndani ya escrow ya Karwan. Usilipe nje yake kamwe.',
    startDeal: 'Anzisha mpango uliolindwa',
    notFound: 'Hakuna mtu kwenye Karwan mwenye lebo hiyo.',
    unavailable: 'Ujumbe haupatikani kwa sasa.',
    retry: 'Jaribu tena',
    label: 'Ujumbe',
    refused: { paused: "Utaweza kumwandikia mtu mpya baada ya takriban saa {hours}.", wait_reply: "Subiri {tag} ajibu kabla ya kuandika tena.", no_tag: "Chagua lebo ya Karwan kwanza ili wakujibu.", link_blocked: "Karwan imeona kiungo katika ujumbe huu na haitautuma.", self: "Hiyo ni lebo yako mwenyewe." },
  },
};
