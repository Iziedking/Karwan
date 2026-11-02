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
    title: "Trade record settings",
    titleTip: "Manage permission for agent reads. Public profile and blockchain information remain visible separately.",
    sourcesTip: "Karwan is the only connected source here. Other platform integrations are not available yet.",
    readersTip: "Logged agent reads and their purpose. This is not a log of every public page view or blockchain lookup.",
    readable: "Let agents outside Karwan check my record",
    readableNote: "Posting a request or offer authorizes record checks within the Karwan market. This preference permits paid, logged reads by outside agents when available. It does not control public pages or blockchain data.",
    lookup: "Allow future lookups on connected platforms",
    lookupNote: "This saves your preference only. No partner platform is connected here, and enabling it does not start a lookup or payment.",
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
    title: "Paramètres du dossier",
    titleTip: "Gérez les autorisations de lecture des agents. Les informations publiques du profil et de la blockchain restent visibles séparément.",
    sourcesTip: "Karwan est la seule source connectée ici. Les intégrations avec d’autres plateformes ne sont pas encore disponibles.",
    readersTip: "Lectures d’agents enregistrées et leur motif. Ce journal ne couvre pas toutes les visites publiques ni les recherches sur la blockchain.",
    readable: "Autoriser les agents hors de Karwan à consulter mon dossier",
    readableNote: "Publier une demande ou une offre autorise les contrôles dans le marché Karwan. Cette préférence autorise les lectures payantes et enregistrées par des agents externes lorsqu’elles sont disponibles. Elle ne contrôle ni les pages publiques ni les données de la blockchain.",
    lookup: "Autoriser de futures recherches sur les plateformes connectées",
    lookupNote: "Seule votre préférence est enregistrée. Aucune plateforme partenaire n’est connectée ici. L’activation ne lance ni recherche ni paiement.",
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
    title: "إعدادات سجل التداول",
    titleTip: "إدارة إذن قراءة الوكلاء. تظل معلومات الملف العامة وبيانات البلوكشين مرئية بشكل مستقل.",
    sourcesTip: "Karwan هو المصدر الوحيد المتصل هنا. التكامل مع المنصات الأخرى غير متاح بعد.",
    readersTip: "قراءات الوكلاء المسجلة وأسبابها. لا يشمل السجل كل زيارة للصفحات العامة أو بحث في البلوكشين.",
    readable: "اسمح للوكلاء من خارج كاروان بفحص سجلي",
    readableNote: "يسمح نشر طلب أو عرض بفحص السجل داخل سوق Karwan. يتيح هذا التفضيل قراءات مدفوعة ومسجلة لوكلاء خارجيين عند توفرها. ولا يتحكم في الصفحات العامة أو بيانات البلوكشين.",
    lookup: "السماح بعمليات بحث مستقبلية على المنصات المتصلة",
    lookupNote: "يحفظ هذا تفضيلك فقط. لا توجد منصة شريكة متصلة هنا، ولا يؤدي تفعيله إلى بحث أو دفع.",
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
    title: "व्यापार रिकॉर्ड की सेटिंग",
    titleTip: "एजेंट द्वारा रिकॉर्ड पढ़ने की अनुमति नियंत्रित करें। सार्वजनिक प्रोफ़ाइल और ब्लॉकचेन की जानकारी अलग से दिखाई देती रहेगी।",
    sourcesTip: "यहाँ केवल Karwan जुड़ा हुआ स्रोत है। अन्य प्लेटफ़ॉर्म के एकीकरण अभी उपलब्ध नहीं हैं।",
    readersTip: "दर्ज की गई एजेंट रीड और उनका उद्देश्य। यह हर सार्वजनिक पेज विज़िट या ब्लॉकचेन खोज का रिकॉर्ड नहीं है।",
    readable: "Karwan के बाहर के एजेंटों को मेरा रिकॉर्ड जांचने दें",
    readableNote: "अनुरोध या ऑफ़र प्रकाशित करने पर Karwan बाज़ार में रिकॉर्ड की जाँच की अनुमति मिलती है। यह पसंद उपलब्ध होने पर बाहरी एजेंटों को भुगतान वाली, दर्ज की गई रीड की अनुमति देती है। यह सार्वजनिक पेज या ब्लॉकचेन डेटा नियंत्रित नहीं करती।",
    lookup: "जुड़े प्लेटफ़ॉर्म पर भविष्य में खोज की अनुमति दें",
    lookupNote: "यह केवल आपकी पसंद सहेजता है। यहाँ कोई भागीदार प्लेटफ़ॉर्म जुड़ा नहीं है। इसे चालू करने से खोज या भुगतान शुरू नहीं होता।",
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
    title: "Mipangilio ya rekodi ya biashara",
    titleTip: "Dhibiti ruhusa ya mawakala kusoma rekodi. Wasifu wa umma na taarifa za blockchain huendelea kuonekana kando.",
    sourcesTip: "Karwan ndiyo chanzo pekee kilichounganishwa hapa. Miunganisho ya majukwaa mengine bado haipatikani.",
    readersTip: "Usomaji wa mawakala uliorekodiwa na sababu zake. Hii si orodha ya kila ziara ya ukurasa wa umma au utafutaji wa blockchain.",
    readable: "Ruhusu mawakala walio nje ya Karwan kukagua rekodi yangu",
    readableNote: "Kuchapisha ombi au ofa huruhusu ukaguzi wa rekodi ndani ya soko la Karwan. Chaguo hili huruhusu mawakala wa nje kufanya usomaji unaolipiwa na kurekodiwa unapopatikana. Halidhibiti kurasa za umma au data ya blockchain.",
    lookup: "Ruhusu utafutaji wa baadaye kwenye majukwaa yaliyounganishwa",
    lookupNote: "Hii huhifadhi chaguo lako tu. Hakuna jukwaa mshirika lililounganishwa hapa. Kuwasha hakuanzishi utafutaji au malipo.",
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
