/// The dispute on the deal page: each side's account, then the judge's proposed
/// ruling. {name}, {date}, {pct} are filled at render.
export interface DisputeJudgeCopy {
  title: string;
  intro: string;
  /// Said on every dispute: how to tell Karwan from someone pretending to be it.
  safety: string;
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
    title: "Tell Karwan your side",
    intro: "Karwan is checking this deal. Answer three questions. We read both sides, the delivery and the deal chat before anything is decided, and the money stays held until then.",
    safety: "Karwan support will never message you outside Karwan or ask you to send money.",
    closes: "Answer by {date}",
    closed: "Answers are closed",
    receivedBuyer: 'What did you receive?',
    receivedSeller: 'What did you deliver?',
    missing: 'Which agreed items are missing or wrong?',
    late: 'Did anything arrive late?',
    links: 'Links',
    linksHint: 'One per line, up to five',
    send: "Send my side",
    update: "Update my side",
    sending: 'Sending',
    failed: "Your side was not sent. Check the answers and try again.",
    yourAccount: "Your side",
    theirAccount: "{name}'s side",
    waitingFor: "Waiting for {name} to answer",
    theyGave: "{name} has answered. You see it once yours is in or answers close.",
    edit: 'Edit',
    proposalTitle: "Proposed decision",
    split: '{pct}% to {name}',
    reviewerNote: "Karwan confirms this before any money moves.",
    findings: { delivered: 'Delivered', 'partly-delivered': 'Partly delivered', missing: 'Missing', unclear: 'Unclear' },
    inconclusive: "The deal record does not settle this, so the Karwan team decides.",
    silentSeller: "The seller did not answer in time, so the proposal refunds the buyer.",
    silentBuyer: "The buyer did not answer in time, so the proposal pays the seller.",
    bothSilent: "Neither side answered, so the Karwan team decides.",
    unavailable: "Karwan could not settle this case on its own, so the Karwan team decides.",
    reviewing: "Both sides are in. Karwan is checking the case.",
    timeline: {
      statementBuyer: "The buyer gave their side.",
      statementSeller: "The seller gave their side.",
      proposed: "Karwan proposed a decision. It is confirmed before any money moves.",
    },
  },
  fr: {
    title: "Donnez votre version à Karwan",
    intro: "Karwan vérifie cet accord. Répondez à trois questions. Nous lisons les deux versions, la livraison et la discussion avant toute décision, et l'argent reste bloqué jusque-là.",
    safety: "Le support Karwan ne vous écrira jamais en dehors de Karwan et ne vous demandera jamais d'envoyer de l'argent.",
    closes: "Répondez avant le {date}",
    closed: "Les réponses sont closes",
    receivedBuyer: "Qu'avez-vous reçu ?",
    receivedSeller: "Qu'avez-vous livré ?",
    missing: 'Quels éléments convenus manquent ou sont incorrects ?',
    late: 'Quelque chose est-il arrivé en retard ?',
    links: 'Liens',
    linksHint: 'Un par ligne, cinq au plus',
    send: "Envoyer ma version",
    update: "Mettre à jour ma version",
    sending: 'Envoi',
    failed: "Votre version n'a pas été envoyée. Vérifiez les réponses et réessayez.",
    yourAccount: "Votre version",
    theirAccount: "Version de {name}",
    waitingFor: "En attente de la réponse de {name}",
    theyGave: "{name} a répondu. Vous la verrez une fois la vôtre envoyée ou les réponses closes.",
    edit: 'Modifier',
    proposalTitle: "Décision proposée",
    split: '{pct} % pour {name}',
    reviewerNote: "Karwan la confirme avant tout mouvement d'argent.",
    findings: { delivered: 'Livré', 'partly-delivered': 'Livré en partie', missing: 'Manquant', unclear: 'Incertain' },
    inconclusive: "Le dossier ne permet pas de trancher : l'équipe Karwan décide.",
    silentSeller: "Le vendeur n'a pas répondu à temps : la proposition rembourse l'acheteur.",
    silentBuyer: "L'acheteur n'a pas répondu à temps : la proposition paie le vendeur.",
    bothSilent: "Aucune des parties n'a répondu : l'équipe Karwan décide.",
    unavailable: "Karwan n'a pas pu trancher seul : l'équipe Karwan décide.",
    reviewing: "Les deux versions sont là. Karwan vérifie le dossier.",
    timeline: {
      statementBuyer: "L'acheteur a donné sa version.",
      statementSeller: "Le vendeur a donné sa version.",
      proposed: "Karwan a proposé une décision. Elle est confirmée avant tout mouvement d'argent.",
    },
  },
  ar: {
    title: "أخبر كاروان بروايتك",
    intro: "كاروان يراجع هذه الصفقة. أجب عن ثلاثة أسئلة. نقرأ الروايتين والتسليم ومحادثة الصفقة قبل أي قرار، ويبقى المال محجوزًا حتى ذلك الحين.",
    safety: "لن يراسلك دعم كاروان خارج كاروان أبدًا، ولن يطلب منك إرسال أي مال.",
    closes: "أجب قبل {date}",
    closed: "أُغلقت الإجابات",
    receivedBuyer: 'ماذا استلمت؟',
    receivedSeller: 'ماذا سلّمت؟',
    missing: 'ما البنود المتفق عليها الناقصة أو الخاطئة؟',
    late: 'هل وصل شيء متأخرًا؟',
    links: 'الروابط',
    linksHint: 'رابط في كل سطر، خمسة كحد أقصى',
    send: "أرسل روايتي",
    update: "حدّث روايتي",
    sending: 'جارٍ الإرسال',
    failed: "لم تُرسل روايتك. راجع الإجابات وحاول مرة أخرى.",
    yourAccount: "روايتك",
    theirAccount: "رواية {name}",
    waitingFor: "بانتظار إجابة {name}",
    theyGave: "أجاب {name}. ستراها بعد إرسال روايتك أو إغلاق الإجابات.",
    edit: 'تعديل',
    proposalTitle: "القرار المقترح",
    split: '{pct}% إلى {name}',
    reviewerNote: "يؤكد كاروان هذا قبل أن يتحرك أي مال.",
    findings: { delivered: 'سُلّم', 'partly-delivered': 'سُلّم جزئيًا', missing: 'ناقص', unclear: 'غير واضح' },
    inconclusive: "سجل الصفقة لا يحسم هذا، لذلك يقرر فريق كاروان.",
    silentSeller: "لم يُجب البائع في الوقت، لذلك يعيد الاقتراح المال إلى المشتري.",
    silentBuyer: "لم يُجب المشتري في الوقت، لذلك يدفع الاقتراح للبائع.",
    bothSilent: "لم يُجب أي طرف، لذلك يقرر فريق كاروان.",
    unavailable: "تعذّر على كاروان حسم هذه الحالة وحده، لذلك يقرر فريق كاروان.",
    reviewing: "وصلت الروايتان. كاروان يراجع الحالة.",
    timeline: {
      statementBuyer: "قدّم المشتري روايته.",
      statementSeller: "قدّم البائع روايته.",
      proposed: "اقترح كاروان قرارًا. يُؤكَّد قبل أن يتحرك أي مال.",
    },
  },
  hi: {
    title: "Karwan को अपना पक्ष बताएँ",
    intro: "Karwan इस डील की जाँच कर रहा है। तीन सवालों के जवाब दें। कोई फ़ैसला होने से पहले हम दोनों पक्ष, डिलीवरी और डील की चैट पढ़ते हैं, और तब तक पैसा रुका रहता है।",
    safety: "Karwan सपोर्ट आपको Karwan के बाहर कभी मैसेज नहीं करेगा और न ही पैसे भेजने को कहेगा।",
    closes: "{date} तक जवाब दें",
    closed: "जवाब बंद हो चुके हैं",
    receivedBuyer: 'आपको क्या मिला?',
    receivedSeller: 'आपने क्या डिलीवर किया?',
    missing: 'तय की गई कौन-सी चीज़ें गायब या गलत हैं?',
    late: 'क्या कुछ देर से आया?',
    links: 'लिंक',
    linksHint: 'हर लाइन में एक, अधिकतम पाँच',
    send: "मेरा पक्ष भेजें",
    update: "मेरा पक्ष अपडेट करें",
    sending: 'भेजा जा रहा है',
    failed: "आपका पक्ष नहीं भेजा गया। जवाब जाँचें और फिर से कोशिश करें।",
    yourAccount: "आपका पक्ष",
    theirAccount: "{name} का पक्ष",
    waitingFor: "{name} के जवाब का इंतज़ार",
    theyGave: "{name} ने जवाब दे दिया है। आपका पक्ष भेजने या जवाब बंद होने पर आप इसे देखेंगे।",
    edit: 'बदलें',
    proposalTitle: "प्रस्तावित फ़ैसला",
    split: '{name} को {pct}%',
    reviewerNote: "पैसा चलने से पहले Karwan इसकी पुष्टि करता है।",
    findings: { delivered: 'डिलीवर हुआ', 'partly-delivered': 'आंशिक रूप से डिलीवर', missing: 'गायब', unclear: 'अस्पष्ट' },
    inconclusive: "डील के रिकॉर्ड से यह तय नहीं होता, इसलिए Karwan टीम फ़ैसला करेगी।",
    silentSeller: "विक्रेता ने समय पर जवाब नहीं दिया, इसलिए प्रस्ताव खरीदार को पैसा लौटाता है।",
    silentBuyer: "खरीदार ने समय पर जवाब नहीं दिया, इसलिए प्रस्ताव विक्रेता को भुगतान करता है।",
    bothSilent: "किसी भी पक्ष ने जवाब नहीं दिया, इसलिए Karwan टीम फ़ैसला करेगी।",
    unavailable: "Karwan अपने आप यह मामला तय नहीं कर सका, इसलिए Karwan टीम फ़ैसला करेगी।",
    reviewing: "दोनों पक्ष आ गए हैं। Karwan मामले की जाँच कर रहा है।",
    timeline: {
      statementBuyer: "खरीदार ने अपना पक्ष दिया।",
      statementSeller: "विक्रेता ने अपना पक्ष दिया।",
      proposed: "Karwan ने फ़ैसला प्रस्तावित किया। पैसा चलने से पहले इसकी पुष्टि होती है।",
    },
  },
  sw: {
    title: "Mweleze Karwan upande wako",
    intro: "Karwan inakagua mpango huu. Jibu maswali matatu. Tunasoma pande zote, uwasilishaji na mazungumzo ya mpango kabla ya uamuzi wowote, na pesa zinashikiliwa hadi wakati huo.",
    safety: "Huduma ya Karwan haitakutumia ujumbe nje ya Karwan wala kukuomba utume pesa.",
    closes: "Jibu kabla ya {date}",
    closed: "Majibu yamefungwa",
    receivedBuyer: 'Ulipokea nini?',
    receivedSeller: 'Uliwasilisha nini?',
    missing: 'Ni vipengele vipi vilivyokubaliwa vinakosekana au si sahihi?',
    late: 'Kuna kitu kilichochelewa?',
    links: 'Viungo',
    linksHint: 'Kimoja kwa kila mstari, hadi vitano',
    send: "Tuma upande wangu",
    update: "Sasisha upande wangu",
    sending: 'Inatuma',
    failed: "Upande wako haukutumwa. Angalia majibu na ujaribu tena.",
    yourAccount: "Upande wako",
    theirAccount: "Upande wa {name}",
    waitingFor: "Inasubiri jibu la {name}",
    theyGave: "{name} amejibu. Utauona mara wako ukitumwa au majibu yakifungwa.",
    edit: 'Hariri',
    proposalTitle: "Uamuzi uliopendekezwa",
    split: '{pct}% kwa {name}',
    reviewerNote: "Karwan inathibitisha hili kabla pesa zozote hazijasonga.",
    findings: { delivered: 'Imewasilishwa', 'partly-delivered': 'Imewasilishwa sehemu', missing: 'Inakosekana', unclear: 'Haijulikani' },
    inconclusive: "Rekodi ya mpango haiamui hili, kwa hivyo timu ya Karwan itaamua.",
    silentSeller: "Muuzaji hakujibu kwa wakati, kwa hivyo pendekezo linamrejeshea mnunuzi pesa.",
    silentBuyer: "Mnunuzi hakujibu kwa wakati, kwa hivyo pendekezo linamlipa muuzaji.",
    bothSilent: "Hakuna upande uliojibu, kwa hivyo timu ya Karwan itaamua.",
    unavailable: "Karwan haikuweza kuamua kesi hii yenyewe, kwa hivyo timu ya Karwan itaamua.",
    reviewing: "Pande zote zimejibu. Karwan inakagua kesi.",
    timeline: {
      statementBuyer: "Mnunuzi ametoa upande wake.",
      statementSeller: "Muuzaji ametoa upande wake.",
      proposed: "Karwan imependekeza uamuzi. Unathibitishwa kabla pesa zozote hazijasonga.",
    },
  },
};
