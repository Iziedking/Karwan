/// Profile, Reputation: whether agents may check the person's record, whether
/// their agent may look them up on platforms they connect, where else they
/// built a reputation, their reads balance and who read their record.
export interface ReputationSourcesCopy {
  title: string;
  titleTip: string;
  sourcesTip: string;
  readersTip: string;
  readable: string;
  readableNote: string;
  lookup: string;
  lookupNote: string;
  sources: string;
  karwan: string;
  connected: string;
  otherPlatforms: string;
  noPartners: string;
  elsewhere: string;
  elsewherePlaceholder: string;
  elsewhereNote: string;
  save: string;
  saved: string;
  readers: string;
  noReaders: string;
  someone: string;
  purposes: { shortlist: string; bid: string; question: string };
  failed: string;
}

export const reputationSourcesCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', ReputationSourcesCopy> = {
  en: {
    title: 'Reputation',
    titleTip: "Your record is the deals you finished on Karwan. These switches decide who may read it and where your agent may look.",
    sourcesTip: "Where your record comes from. Karwan counts on its own. Other platforms appear here once they partner with Karwan.",
    readersTip: "Every agent that checked your record, and why it did.",
    readable: "Let agents outside Karwan check my record",
    readableNote: "Agents in the Karwan market already check the record of anyone who posts. This lets agents from other apps check it too, each time with a paid, logged read. They never see your messages or who you worked with.",
    lookup: 'Let my agent look me up on platforms I connect',
    lookupNote: 'Your agent pays a few cents to read your record on a platform you connect. Nothing is shared with people.',
    sources: 'Sources',
    karwan: 'Karwan',
    connected: 'Connected',
    otherPlatforms: 'Other platforms',
    noPartners: 'No partner platforms yet',
    elsewhere: 'Where else have you built a reputation?',
    elsewherePlaceholder: 'A marketplace, a social shop, a freelancing site',
    elsewhereNote: 'Only Karwan sees this. It does not change your score.',
    save: 'Save',
    saved: 'Saved',
    readers: 'Who read your record',
    noReaders: 'No one has read your record yet.',
    someone: 'A Karwan member',
    purposes: { shortlist: 'For a request', bid: 'Before an offer', question: 'For a question' },
    failed: 'That did not save. Try again.',
  },
  fr: {
    title: 'Réputation',
    titleTip: "Votre dossier, ce sont les accords terminés sur Karwan. Ces boutons décident qui peut le lire et où votre agent peut chercher.",
    sourcesTip: "D’où vient votre dossier. Karwan compte d’office. Les autres plateformes apparaissent ici dès qu’elles deviennent partenaires de Karwan.",
    readersTip: "Chaque agent qui a consulté votre dossier, et pourquoi.",
    readable: "Autoriser les agents hors de Karwan à consulter mon dossier",
    readableNote: "Les agents du marché Karwan consultent déjà le dossier de toute personne qui publie. Ceci permet aussi aux agents d'autres applications de le consulter, chaque fois par une lecture payée et enregistrée. Ils ne voient jamais vos messages ni avec qui vous avez travaillé.",
    lookup: 'Autoriser mon agent à me rechercher sur les plateformes que je connecte',
    lookupNote: 'Votre agent paie quelques centimes pour lire votre dossier sur une plateforme que vous connectez. Rien n’est partagé avec des personnes.',
    sources: 'Sources',
    karwan: 'Karwan',
    connected: 'Connecté',
    otherPlatforms: 'Autres plateformes',
    noPartners: 'Aucune plateforme partenaire pour l’instant',
    elsewhere: 'Où avez-vous bâti une réputation ailleurs ?',
    elsewherePlaceholder: 'Une place de marché, une boutique sur un réseau social, un site de freelance',
    elsewhereNote: 'Seul Karwan le voit. Cela ne change pas votre score.',
    save: 'Enregistrer',
    saved: 'Enregistré',
    readers: 'Qui a consulté votre dossier',
    noReaders: 'Personne n’a encore consulté votre dossier.',
    someone: 'Un membre de Karwan',
    purposes: { shortlist: 'Pour une demande', bid: 'Avant une offre', question: 'Pour une question' },
    failed: 'L’enregistrement a échoué. Réessayez.',
  },
  ar: {
    title: 'السمعة',
    titleTip: "سجلك هو الصفقات التي أنهيتها في كاروان. تحدد هذه المفاتيح من يمكنه قراءته وأين يمكن لوكيلك البحث.",
    sourcesTip: "من أين يأتي سجلك. كاروان محسوبة تلقائيًا. تظهر المنصات الأخرى هنا عندما تصبح شريكة لكاروان.",
    readersTip: "كل وكيل فحص سجلك، وسبب ذلك.",
    readable: "اسمح للوكلاء من خارج كاروان بفحص سجلي",
    readableNote: "وكلاء سوق كاروان يفحصون بالفعل سجل كل من ينشر. هذا يسمح لوكلاء التطبيقات الأخرى بفحصه أيضًا، في كل مرة بقراءة مدفوعة ومسجّلة. لا يرون رسائلك أو من عملت معهم أبدًا.",
    lookup: 'اسمح لوكيلي بالبحث عني في المنصات التي أربطها',
    lookupNote: 'يدفع وكيلك بضعة سنتات لقراءة سجلك في منصة تربطها. لا يُشارك شيء مع الأشخاص.',
    sources: 'المصادر',
    karwan: 'Karwan',
    connected: 'متصل',
    otherPlatforms: 'منصات أخرى',
    noPartners: 'لا منصات شريكة بعد',
    elsewhere: 'أين بنيت سمعة أخرى؟',
    elsewherePlaceholder: 'سوق إلكتروني، متجر على وسائل التواصل، موقع للعمل الحر',
    elsewhereNote: 'كاروان وحدها ترى هذا. لا يغيّر نتيجتك.',
    save: 'حفظ',
    saved: 'تم الحفظ',
    readers: 'من قرأ سجلك',
    noReaders: 'لم يقرأ أحد سجلك بعد.',
    someone: 'عضو في كاروان',
    purposes: { shortlist: 'لطلب', bid: 'قبل عرض', question: 'لسؤال' },
    failed: 'لم يتم الحفظ. حاول مرة أخرى.',
  },
  hi: {
    title: 'साख',
    titleTip: "आपका रिकॉर्ड Karwan पर पूरे किए गए सौदे हैं। ये स्विच तय करते हैं कि इसे कौन पढ़ सकता है और आपका एजेंट कहां खोज सकता है।",
    sourcesTip: "आपका रिकॉर्ड कहां से आता है। Karwan अपने आप गिना जाता है। दूसरे प्लेटफ़ॉर्म Karwan के साझेदार बनने पर यहां दिखेंगे।",
    readersTip: "हर एजेंट जिसने आपका रिकॉर्ड जांचा, और क्यों।",
    readable: "Karwan के बाहर के एजेंटों को मेरा रिकॉर्ड जांचने दें",
    readableNote: "Karwan मार्केट के एजेंट पोस्ट करने वाले हर व्यक्ति का रिकॉर्ड पहले से जांचते हैं। इससे दूसरे ऐप के एजेंट भी इसे जांच सकते हैं, हर बार एक भुगतान वाली और दर्ज की गई जांच से। वे आपके संदेश या आपने किसके साथ काम किया, यह कभी नहीं देखते।",
    lookup: 'मेरे एजेंट को जोड़े गए प्लेटफ़ॉर्म पर मुझे खोजने दें',
    lookupNote: 'आपका एजेंट आपके जोड़े गए प्लेटफ़ॉर्म पर आपका रिकॉर्ड पढ़ने के लिए कुछ सेंट देता है। लोगों के साथ कुछ साझा नहीं होता।',
    sources: 'स्रोत',
    karwan: 'Karwan',
    connected: 'जुड़ा है',
    otherPlatforms: 'दूसरे प्लेटफ़ॉर्म',
    noPartners: 'अभी कोई साझेदार प्लेटफ़ॉर्म नहीं',
    elsewhere: 'आपने और कहां साख बनाई है?',
    elsewherePlaceholder: 'कोई मार्केटप्लेस, सोशल शॉप, फ़्रीलांस साइट',
    elsewhereNote: 'इसे सिर्फ़ Karwan देखता है। इससे आपका स्कोर नहीं बदलता।',
    save: 'सहेजें',
    saved: 'सहेजा गया',
    readers: 'किसने आपका रिकॉर्ड पढ़ा',
    noReaders: 'अभी किसी ने आपका रिकॉर्ड नहीं पढ़ा।',
    someone: 'एक Karwan सदस्य',
    purposes: { shortlist: 'एक अनुरोध के लिए', bid: 'ऑफ़र से पहले', question: 'एक सवाल के लिए' },
    failed: 'सहेजा नहीं गया। फिर कोशिश करें।',
  },
  sw: {
    title: 'Sifa',
    titleTip: "Rekodi yako ni makubaliano uliyokamilisha kwenye Karwan. Swichi hizi huamua nani anaweza kuisoma na wakala wako anaweza kutafuta wapi.",
    sourcesTip: "Rekodi yako inatoka wapi. Karwan huhesabiwa yenyewe. Majukwaa mengine yataonekana hapa yanapokuwa washirika wa Karwan.",
    readersTip: "Kila wakala aliyekagua rekodi yako, na sababu yake.",
    readable: "Ruhusu mawakala walio nje ya Karwan kukagua rekodi yangu",
    readableNote: "Mawakala katika soko la Karwan tayari hukagua rekodi ya kila anayechapisha. Hii inaruhusu mawakala wa programu nyingine kuikagua pia, kila mara kwa usomaji uliolipiwa na kurekodiwa. Kamwe hawaoni ujumbe wako wala uliofanya kazi nao.",
    lookup: 'Ruhusu wakala wangu anitafute kwenye majukwaa ninayounganisha',
    lookupNote: 'Wakala wako hulipa senti chache kusoma rekodi yako kwenye jukwaa unalounganisha. Hakuna kinachoshirikiwa na watu.',
    sources: 'Vyanzo',
    karwan: 'Karwan',
    connected: 'Imeunganishwa',
    otherPlatforms: 'Majukwaa mengine',
    noPartners: 'Bado hakuna majukwaa washirika',
    elsewhere: 'Umejenga sifa wapi kwingine?',
    elsewherePlaceholder: 'Soko la mtandaoni, duka la mitandao ya kijamii, tovuti ya kazi huru',
    elsewhereNote: 'Karwan pekee ndiyo inaona hili. Halibadilishi alama yako.',
    save: 'Hifadhi',
    saved: 'Imehifadhiwa',
    readers: 'Nani amesoma rekodi yako',
    noReaders: 'Bado hakuna aliyesoma rekodi yako.',
    someone: 'Mwanachama wa Karwan',
    purposes: { shortlist: 'Kwa ombi', bid: 'Kabla ya ofa', question: 'Kwa swali' },
    failed: 'Haikuhifadhiwa. Jaribu tena.',
  },
};
