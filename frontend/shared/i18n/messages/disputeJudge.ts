/// The dispute on the deal page: each side's account, then the judge's proposed
/// ruling. {name}, {date}, {pct} are filled at render.
export interface DisputeJudgeCopy {
  title: string;
  intro: string;
  closes: string;
  closed: string;
  receivedBuyer: string;
  receivedSeller: string;
  missing: string;
  late: string;
  links: string;
  linksHint: string;
  send: string;
  update: string;
  sending: string;
  failed: string;
  yourAccount: string;
  theirAccount: string;
  waitingFor: string;
  theyGave: string;
  edit: string;
  proposalTitle: string;
  split: string;
  reviewerNote: string;
  findings: { delivered: string; 'partly-delivered': string; missing: string; unclear: string };
  inconclusive: string;
  silentSeller: string;
  silentBuyer: string;
  bothSilent: string;
  unavailable: string;
  reviewing: string;
  timeline: { statementBuyer: string; statementSeller: string; proposed: string };
}

export const disputeJudgeCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', DisputeJudgeCopy> = {
  en: {
    title: 'Your account of the dispute',
    intro: 'Answer three questions. The judge reads both accounts, the delivery check and the deal chat, then proposes a split. A reviewer confirms it before any money moves.',
    closes: 'Accounts close {date}',
    closed: 'Accounts are closed',
    receivedBuyer: 'What did you receive?',
    receivedSeller: 'What did you deliver?',
    missing: 'Which agreed items are missing or wrong?',
    late: 'Did anything arrive late?',
    links: 'Links',
    linksHint: 'One per line, up to five',
    send: 'Send my account',
    update: 'Update my account',
    sending: 'Sending',
    failed: 'Your account was not sent. Check the answers and try again.',
    yourAccount: 'Your account',
    theirAccount: "{name}'s account",
    waitingFor: 'Waiting for {name}',
    theyGave: '{name} gave their account. You see it once yours is in or accounts close.',
    edit: 'Edit',
    proposalTitle: 'Proposed ruling',
    split: '{pct}% to {name}',
    reviewerNote: 'A reviewer confirms this before any money moves.',
    findings: { delivered: 'Delivered', 'partly-delivered': 'Partly delivered', missing: 'Missing', unclear: 'Unclear' },
    inconclusive: 'The record does not settle this, so a reviewer decides.',
    silentSeller: 'The seller gave no account in time, so the proposal refunds the buyer.',
    silentBuyer: 'The buyer gave no account in time, so the proposal pays the seller.',
    bothSilent: 'Neither side gave an account, so a reviewer decides.',
    unavailable: 'The judge could not read this case, so a reviewer decides.',
    reviewing: 'Both accounts are in. The judge is reading the case.',
    timeline: {
      statementBuyer: 'The buyer gave their account of the dispute.',
      statementSeller: 'The seller gave their account of the dispute.',
      proposed: 'The judge proposed a ruling. A reviewer confirms it before any money moves.',
    },
  },
  fr: {
    title: 'Votre version du litige',
    intro: "Répondez à trois questions. Le juge lit les deux versions, la vérification de la livraison et la discussion, puis propose un partage. Un examinateur le confirme avant tout mouvement d'argent.",
    closes: 'Clôture des versions le {date}',
    closed: 'Les versions sont closes',
    receivedBuyer: "Qu'avez-vous reçu ?",
    receivedSeller: "Qu'avez-vous livré ?",
    missing: 'Quels éléments convenus manquent ou sont incorrects ?',
    late: 'Quelque chose est-il arrivé en retard ?',
    links: 'Liens',
    linksHint: 'Un par ligne, cinq au plus',
    send: 'Envoyer ma version',
    update: 'Mettre à jour ma version',
    sending: 'Envoi',
    failed: "Votre version n'a pas été envoyée. Vérifiez les réponses et réessayez.",
    yourAccount: 'Votre version',
    theirAccount: 'Version de {name}',
    waitingFor: 'En attente de {name}',
    theyGave: '{name} a donné sa version. Vous la verrez une fois la vôtre envoyée ou les versions closes.',
    edit: 'Modifier',
    proposalTitle: 'Décision proposée',
    split: '{pct} % pour {name}',
    reviewerNote: "Un examinateur la confirme avant tout mouvement d'argent.",
    findings: { delivered: 'Livré', 'partly-delivered': 'Livré en partie', missing: 'Manquant', unclear: 'Incertain' },
    inconclusive: 'Le dossier ne permet pas de trancher : un examinateur décide.',
    silentSeller: "Le vendeur n'a pas donné sa version à temps : la proposition rembourse l'acheteur.",
    silentBuyer: "L'acheteur n'a pas donné sa version à temps : la proposition paie le vendeur.",
    bothSilent: "Aucune des parties n'a donné sa version : un examinateur décide.",
    unavailable: "Le juge n'a pas pu lire ce dossier : un examinateur décide.",
    reviewing: 'Les deux versions sont là. Le juge examine le dossier.',
    timeline: {
      statementBuyer: "L'acheteur a donné sa version du litige.",
      statementSeller: 'Le vendeur a donné sa version du litige.',
      proposed: "Le juge a proposé une décision. Un examinateur la confirme avant tout mouvement d'argent.",
    },
  },
  ar: {
    title: 'روايتك للنزاع',
    intro: 'أجب عن ثلاثة أسئلة. يقرأ الحَكَم الروايتين وفحص التسليم ومحادثة الصفقة، ثم يقترح تقسيمًا. يؤكده مراجع قبل أن يتحرك أي مال.',
    closes: 'تُغلق الروايات في {date}',
    closed: 'أُغلقت الروايات',
    receivedBuyer: 'ماذا استلمت؟',
    receivedSeller: 'ماذا سلّمت؟',
    missing: 'ما البنود المتفق عليها الناقصة أو الخاطئة؟',
    late: 'هل وصل شيء متأخرًا؟',
    links: 'الروابط',
    linksHint: 'رابط في كل سطر، خمسة كحد أقصى',
    send: 'أرسل روايتي',
    update: 'حدّث روايتي',
    sending: 'جارٍ الإرسال',
    failed: 'لم تُرسل روايتك. راجع الإجابات وحاول مرة أخرى.',
    yourAccount: 'روايتك',
    theirAccount: 'رواية {name}',
    waitingFor: 'بانتظار {name}',
    theyGave: 'قدّم {name} روايته. ستراها بعد إرسال روايتك أو إغلاق الروايات.',
    edit: 'تعديل',
    proposalTitle: 'الحكم المقترح',
    split: '{pct}% إلى {name}',
    reviewerNote: 'يؤكد مراجع هذا قبل أن يتحرك أي مال.',
    findings: { delivered: 'سُلّم', 'partly-delivered': 'سُلّم جزئيًا', missing: 'ناقص', unclear: 'غير واضح' },
    inconclusive: 'السجل لا يحسم هذا، لذلك يقرر مراجع.',
    silentSeller: 'لم يقدّم البائع روايته في الوقت، لذلك يعيد الاقتراح المال إلى المشتري.',
    silentBuyer: 'لم يقدّم المشتري روايته في الوقت، لذلك يدفع الاقتراح للبائع.',
    bothSilent: 'لم يقدّم أي طرف روايته، لذلك يقرر مراجع.',
    unavailable: 'تعذّر على الحَكَم قراءة هذه الحالة، لذلك يقرر مراجع.',
    reviewing: 'وصلت الروايتان. الحَكَم يقرأ الحالة.',
    timeline: {
      statementBuyer: 'قدّم المشتري روايته للنزاع.',
      statementSeller: 'قدّم البائع روايته للنزاع.',
      proposed: 'اقترح الحَكَم حكمًا. يؤكده مراجع قبل أن يتحرك أي مال.',
    },
  },
  hi: {
    title: 'विवाद पर आपका पक्ष',
    intro: 'तीन सवालों के जवाब दें। जज दोनों पक्ष, डिलीवरी की जाँच और डील की चैट पढ़कर बँटवारा प्रस्तावित करता है। पैसा चलने से पहले एक समीक्षक इसकी पुष्टि करता है।',
    closes: 'पक्ष {date} को बंद होंगे',
    closed: 'पक्ष बंद हो चुके हैं',
    receivedBuyer: 'आपको क्या मिला?',
    receivedSeller: 'आपने क्या डिलीवर किया?',
    missing: 'तय की गई कौन-सी चीज़ें गायब या गलत हैं?',
    late: 'क्या कुछ देर से आया?',
    links: 'लिंक',
    linksHint: 'हर लाइन में एक, अधिकतम पाँच',
    send: 'मेरा पक्ष भेजें',
    update: 'मेरा पक्ष अपडेट करें',
    sending: 'भेजा जा रहा है',
    failed: 'आपका पक्ष नहीं भेजा गया। जवाब जाँचें और फिर से कोशिश करें।',
    yourAccount: 'आपका पक्ष',
    theirAccount: '{name} का पक्ष',
    waitingFor: '{name} का इंतज़ार',
    theyGave: '{name} ने अपना पक्ष दे दिया है। आपका पक्ष भेजने या पक्ष बंद होने पर आप इसे देखेंगे।',
    edit: 'बदलें',
    proposalTitle: 'प्रस्तावित फ़ैसला',
    split: '{name} को {pct}%',
    reviewerNote: 'पैसा चलने से पहले एक समीक्षक इसकी पुष्टि करता है।',
    findings: { delivered: 'डिलीवर हुआ', 'partly-delivered': 'आंशिक रूप से डिलीवर', missing: 'गायब', unclear: 'अस्पष्ट' },
    inconclusive: 'रिकॉर्ड से यह तय नहीं होता, इसलिए समीक्षक फ़ैसला करेगा।',
    silentSeller: 'विक्रेता ने समय पर अपना पक्ष नहीं दिया, इसलिए प्रस्ताव खरीदार को पैसा लौटाता है।',
    silentBuyer: 'खरीदार ने समय पर अपना पक्ष नहीं दिया, इसलिए प्रस्ताव विक्रेता को भुगतान करता है।',
    bothSilent: 'किसी भी पक्ष ने जवाब नहीं दिया, इसलिए समीक्षक फ़ैसला करेगा।',
    unavailable: 'जज यह मामला नहीं पढ़ सका, इसलिए समीक्षक फ़ैसला करेगा।',
    reviewing: 'दोनों पक्ष आ गए हैं। जज मामला पढ़ रहा है।',
    timeline: {
      statementBuyer: 'खरीदार ने विवाद पर अपना पक्ष दिया।',
      statementSeller: 'विक्रेता ने विवाद पर अपना पक्ष दिया।',
      proposed: 'जज ने फ़ैसला प्रस्तावित किया। पैसा चलने से पहले एक समीक्षक इसकी पुष्टि करता है।',
    },
  },
  sw: {
    title: 'Maelezo yako ya mgogoro',
    intro: 'Jibu maswali matatu. Mwamuzi husoma maelezo ya pande zote, ukaguzi wa uwasilishaji na mazungumzo ya mkataba, kisha anapendekeza mgawanyo. Mkaguzi huthibitisha kabla pesa zozote hazijasonga.',
    closes: 'Maelezo yanafungwa {date}',
    closed: 'Maelezo yamefungwa',
    receivedBuyer: 'Ulipokea nini?',
    receivedSeller: 'Uliwasilisha nini?',
    missing: 'Ni vipengele vipi vilivyokubaliwa vinakosekana au si sahihi?',
    late: 'Kuna kitu kilichochelewa?',
    links: 'Viungo',
    linksHint: 'Kimoja kwa kila mstari, hadi vitano',
    send: 'Tuma maelezo yangu',
    update: 'Sasisha maelezo yangu',
    sending: 'Inatuma',
    failed: 'Maelezo yako hayakutumwa. Angalia majibu na ujaribu tena.',
    yourAccount: 'Maelezo yako',
    theirAccount: 'Maelezo ya {name}',
    waitingFor: 'Inamsubiri {name}',
    theyGave: '{name} ametoa maelezo yake. Utayaona mara yako ikitumwa au maelezo yakifungwa.',
    edit: 'Hariri',
    proposalTitle: 'Uamuzi uliopendekezwa',
    split: '{pct}% kwa {name}',
    reviewerNote: 'Mkaguzi huthibitisha hili kabla pesa zozote hazijasonga.',
    findings: { delivered: 'Imewasilishwa', 'partly-delivered': 'Imewasilishwa sehemu', missing: 'Inakosekana', unclear: 'Haijulikani' },
    inconclusive: 'Rekodi haiamui hili, kwa hivyo mkaguzi ataamua.',
    silentSeller: 'Muuzaji hakutoa maelezo kwa wakati, kwa hivyo pendekezo linamrejeshea mnunuzi pesa.',
    silentBuyer: 'Mnunuzi hakutoa maelezo kwa wakati, kwa hivyo pendekezo linamlipa muuzaji.',
    bothSilent: 'Hakuna upande uliotoa maelezo, kwa hivyo mkaguzi ataamua.',
    unavailable: 'Mwamuzi hakuweza kusoma kesi hii, kwa hivyo mkaguzi ataamua.',
    reviewing: 'Maelezo ya pande zote yamefika. Mwamuzi anasoma kesi.',
    timeline: {
      statementBuyer: 'Mnunuzi ametoa maelezo yake ya mgogoro.',
      statementSeller: 'Muuzaji ametoa maelezo yake ya mgogoro.',
      proposed: 'Mwamuzi amependekeza uamuzi. Mkaguzi huthibitisha kabla pesa zozote hazijasonga.',
    },
  },
};
