import type { Locale } from '@/shared/i18n/locales';
import type { TermsCopy } from './composeTerms';

export interface TermsBuilderCopy {
  title: string;
  lead: string;
  parts: string;
  whatLabel: string;
  whatPlaceholder: string;
  splitEvenly: string;
  noWhat: string;
  part: string;
  addPart: string;
  removeLine: string;
  total: string;
  needs100: string;
  review: string;
  day: string;
  days: string;
  other: string;
  otherDays: string;
  reviewRule: string;
  agreement: string;
  agreementNote: string;
  ready: string;
  split: string;
  vague: string;
  text: TermsCopy;
}

export const TERMS_COPY: Record<Locale, TermsBuilderCopy> = {
  en: {
    title: 'What counts as done?',
    lead: 'Write what each part delivers, so it can be checked when the work arrives.',
    parts: "Milestones", whatLabel: "What this milestone delivers", whatPlaceholder: "First draft of the logo in two styles", splitEvenly: "Split evenly", noWhat: "Say what milestone {n} delivers.", part: 'Milestone {n}', 
    addPart: "Add a milestone", removeLine: 'Remove', total: 'Adds up to {sum}%', needs100: 'Adds up to {sum}%, needs 100%',
    review: 'Time to check each delivery', day: '1 day', days: '{n} days', other: 'Other', otherDays: 'Days to check',
    reviewRule: 'If the buyer does not reply in this time, that part is paid to the seller.',
    agreement: 'The agreement both sides sign', agreementNote: 'If the two sides disagree, this is what gets checked.',
    ready: "Ready. Every milestone says what it delivers, so it can be checked.",
    split: 'The parts add up to {sum}%. They need to make 100%.',
    vague: '"{item}" is very short. Say exactly what is delivered.',
    text: {
      due: 'Delivery: by {date}.', conditions: 'Accepted when:',
      proofLink: 'Proof of delivery: a link to the work.', proofTracking: 'Proof of delivery: carrier and tracking number.',
      proofEither: 'Proof of delivery: a link or a tracking number.',
      payment: 'Payment: {amount} USDC, locked when the deal is funded and released in {n} milestones:', paymentNoPrice: 'Payment: locked when the deal is funded and released in {n} milestones:', paymentOne: 'Payment: {amount} USDC, locked when the deal is funded and released in one milestone:', paymentOneNoPrice: 'Payment: locked when the deal is funded and released in one milestone:',
      part: "• {name}, {pct}% ({amount} USDC): {what}", partNoPrice: "• {name}, {pct}%: {what}", partName: 'Milestone {n}',
      review: 'Time to check: {n} days after each delivery. If the buyer does not reply in that time, that part is paid to the seller.',
      reviewOne: 'Time to check: 1 day after each delivery. If the buyer does not reply in that time, that part is paid to the seller.',
      moreTime: 'The buyer can ask once for more time to check.',
      late: 'Late: if nothing is delivered by the deadline, unpaid parts return to the buyer.',
    },
  },
  fr: {
    title: 'Qu’est-ce qui compte comme terminé ?',
    lead: 'Écrivez ce que livre chaque partie, pour qu’elle puisse être vérifiée à la réception.',
    parts: "Étapes", whatLabel: "Ce que cette étape livre", whatPlaceholder: "Première version du logo en deux styles", splitEvenly: "Répartir également", noWhat: "Dites ce que l’étape {n} livre.", part: 'Étape {n}', 
    addPart: "Ajouter une étape", removeLine: 'Retirer', total: 'Total de {sum} %', needs100: 'Total de {sum} %, il faut 100 %',
    review: 'Temps pour vérifier chaque livraison', day: '1 jour', days: '{n} jours', other: 'Autre', otherDays: 'Jours pour vérifier',
    reviewRule: 'Si l’acheteur ne répond pas dans ce délai, cette partie est payée au vendeur.',
    agreement: 'L’accord signé par les deux parties', agreementNote: 'En cas de désaccord, c’est ce texte qui est vérifié.',
    ready: "Prêt. Chaque étape dit ce qu’elle livre, elle peut donc être vérifiée.",
    split: 'Les parties font {sum} %. Elles doivent faire 100 %.',
    vague: '« {item} » est très court. Précisez ce qui est livré.',
    text: {
      due: 'Livraison : avant le {date}.', conditions: 'Accepté quand :',
      proofLink: 'Preuve de livraison : un lien vers le travail.', proofTracking: 'Preuve de livraison : transporteur et numéro de suivi.',
      proofEither: 'Preuve de livraison : un lien ou un numéro de suivi.',
      payment: 'Paiement : {amount} USDC, bloqués au financement de l’accord et versés en {n} étapes :', paymentNoPrice: 'Paiement : bloqué au financement de l’accord et versé en {n} étapes :', paymentOne: 'Paiement : {amount} USDC, bloqués au financement de l’accord et versés en une étape :', paymentOneNoPrice: 'Paiement : bloqué au financement de l’accord et versé en une étape :',
      part: "• {name}, {pct} % ({amount} USDC) : {what}", partNoPrice: "• {name}, {pct} % : {what}", partName: 'Étape {n}',
      review: 'Délai de vérification : {n} jours après chaque livraison. Si l’acheteur ne répond pas dans ce délai, cette partie est payée au vendeur.',
      reviewOne: 'Délai de vérification : 1 jour après chaque livraison. Si l’acheteur ne répond pas dans ce délai, cette partie est payée au vendeur.',
      moreTime: 'L’acheteur peut demander une fois plus de temps pour vérifier.',
      late: 'Retard : si rien n’est livré avant la date limite, les parties non payées reviennent à l’acheteur.',
    },
  },
  ar: {
    title: 'ما الذي يُعدّ إنجازًا؟',
    lead: 'اكتب ما يسلّمه كل جزء، ليمكن التحقق منه عند وصول العمل.',
    parts: "المراحل", whatLabel: "ما تسلّمه هذه المرحلة", whatPlaceholder: "المسودة الأولى للشعار بأسلوبين", splitEvenly: "قسّم بالتساوي", noWhat: "اذكر ما تسلّمه المرحلة {n}.", part: 'المرحلة {n}', 
    addPart: "أضف مرحلة", removeLine: 'إزالة', total: 'المجموع {sum}%', needs100: 'المجموع {sum}%، والمطلوب 100%',
    review: 'مدة فحص كل تسليم', day: 'يوم واحد', days: '{n} أيام', other: 'أخرى', otherDays: 'أيام الفحص',
    reviewRule: 'إن لم يردّ المشتري خلال هذه المدة، يُدفع ذلك الجزء للبائع.',
    agreement: 'الاتفاق الذي يوقّعه الطرفان', agreementNote: 'إذا اختلف الطرفان، فهذا ما يُراجَع.',
    ready: "جاهز. كل مرحلة تذكر ما تسلّمه، لذا يمكن التحقق منها.",
    split: 'مجموع الأجزاء {sum}%. يجب أن يكون 100%.',
    vague: '"{item}" قصير جدًا. حدّد ما يُسلَّم بالضبط.',
    text: {
      due: 'التسليم: قبل {date}.', conditions: 'يُقبل عندما:',
      proofLink: 'إثبات التسليم: رابط إلى العمل.', proofTracking: 'إثبات التسليم: شركة الشحن ورقم التتبع.',
      proofEither: 'إثبات التسليم: رابط أو رقم تتبع.',
      payment: 'الدفع: {amount} USDC، تُقفل عند تمويل الصفقة وتُدفع على {n} مراحل:', paymentNoPrice: 'الدفع: يُقفل عند تمويل الصفقة ويُدفع على {n} مراحل:', paymentOne: 'الدفع: {amount} USDC، تُقفل عند تمويل الصفقة وتُدفع في مرحلة واحدة:', paymentOneNoPrice: 'الدفع: يُقفل عند تمويل الصفقة ويُدفع في مرحلة واحدة:',
      part: "• {name}، {pct}% ({amount} USDC): {what}", partNoPrice: "• {name}، {pct}%: {what}", partName: 'المرحلة {n}',
      review: 'مدة الفحص: {n} أيام بعد كل تسليم. إن لم يردّ المشتري خلالها، يُدفع ذلك الجزء للبائع.',
      reviewOne: 'مدة الفحص: يوم واحد بعد كل تسليم. إن لم يردّ المشتري خلاله، يُدفع ذلك الجزء للبائع.',
      moreTime: 'يمكن للمشتري أن يطلب مرة واحدة وقتًا إضافيًا للفحص.',
      late: 'التأخير: إن لم يُسلَّم شيء قبل الموعد النهائي، تعود الأجزاء غير المدفوعة إلى المشتري.',
    },
  },
  hi: {
    title: 'काम पूरा कब माना जाएगा?',
    lead: 'लिखें कि हर हिस्सा क्या देता है, ताकि काम आने पर उसकी जाँच हो सके।',
    parts: "पड़ाव", whatLabel: "यह पड़ाव क्या देता है", whatPlaceholder: "दो शैलियों में लोगो का पहला ड्राफ़्ट", splitEvenly: "बराबर बाँटें", noWhat: "बताएँ कि पड़ाव {n} क्या देता है।", part: 'पड़ाव {n}', 
    addPart: "पड़ाव जोड़ें", removeLine: 'हटाएँ', total: 'कुल {sum}%', needs100: 'कुल {sum}%, 100% चाहिए',
    review: 'हर डिलीवरी जाँचने का समय', day: '1 दिन', days: '{n} दिन', other: 'अन्य', otherDays: 'जाँच के दिन',
    reviewRule: 'अगर खरीदार इस समय में जवाब नहीं देता, तो वह हिस्सा विक्रेता को मिल जाता है।',
    agreement: 'दोनों पक्षों का समझौता', agreementNote: 'अगर दोनों पक्षों में असहमति हो, तो इसी की जाँच होती है।',
    ready: "तैयार। हर पड़ाव बताता है कि वह क्या देता है, इसलिए उसकी जाँच हो सकती है।",
    split: 'हिस्सों का कुल {sum}% है। इसे 100% होना चाहिए।',
    vague: '"{item}" बहुत छोटा है। साफ़ बताएँ कि क्या डिलीवर होगा।',
    text: {
      due: 'डिलीवरी: {date} तक।', conditions: 'स्वीकार होगा जब:',
      proofLink: 'डिलीवरी का सबूत: काम का लिंक।', proofTracking: 'डिलीवरी का सबूत: कूरियर और ट्रैकिंग नंबर।',
      proofEither: 'डिलीवरी का सबूत: लिंक या ट्रैकिंग नंबर।',
      payment: 'भुगतान: {amount} USDC, सौदे में पैसा डालते ही लॉक, {n} पड़ावों में जारी:', paymentNoPrice: 'भुगतान: सौदे में पैसा डालते ही लॉक, {n} पड़ावों में जारी:', paymentOne: 'भुगतान: {amount} USDC, सौदे में पैसा डालते ही लॉक, एक पड़ाव में जारी:', paymentOneNoPrice: 'भुगतान: सौदे में पैसा डालते ही लॉक, एक पड़ाव में जारी:',
      part: "• {name}, {pct}% ({amount} USDC): {what}", partNoPrice: "• {name}, {pct}%: {what}", partName: 'पड़ाव {n}',
      review: 'जाँच का समय: हर डिलीवरी के बाद {n} दिन। अगर खरीदार इस समय में जवाब नहीं देता, तो वह हिस्सा विक्रेता को मिल जाता है।',
      reviewOne: 'जाँच का समय: हर डिलीवरी के बाद 1 दिन। अगर खरीदार इस समय में जवाब नहीं देता, तो वह हिस्सा विक्रेता को मिल जाता है।',
      moreTime: 'खरीदार जाँच के लिए एक बार और समय माँग सकता है।',
      late: 'देरी: अगर समय सीमा तक कुछ डिलीवर नहीं होता, तो बिना भुगतान वाले हिस्से खरीदार को लौटते हैं।',
    },
  },
  sw: {
    title: 'Nini kinahesabika kuwa kimekamilika?',
    lead: 'Andika kila sehemu inawasilisha nini, ili ikaguliwe kazi inapofika.',
    parts: "Hatua", whatLabel: "Hatua hii inawasilisha nini", whatPlaceholder: "Rasimu ya kwanza ya nembo kwa mitindo miwili", splitEvenly: "Gawanya sawa", noWhat: "Sema hatua ya {n} inawasilisha nini.", part: 'Hatua {n}', 
    addPart: "Ongeza hatua", removeLine: 'Ondoa', total: 'Jumla {sum}%', needs100: 'Jumla {sum}%, inahitaji 100%',
    review: 'Muda wa kukagua kila uwasilishaji', day: 'Siku 1', days: 'Siku {n}', other: 'Nyingine', otherDays: 'Siku za kukagua',
    reviewRule: 'Mnunuzi asipojibu ndani ya muda huu, sehemu hiyo inalipwa kwa muuzaji.',
    agreement: 'Makubaliano wanayosaini pande zote', agreementNote: 'Pande mbili zikitofautiana, hiki ndicho kinachokaguliwa.',
    ready: "Tayari. Kila hatua inaeleza inachowasilisha, hivyo inaweza kukaguliwa.",
    split: 'Sehemu zinajumlisha {sum}%. Zinahitaji kufikia 100%.',
    vague: '"{item}" ni fupi sana. Eleza hasa kinachowasilishwa.',
    text: {
      due: 'Uwasilishaji: kabla ya {date}.', conditions: 'Kinakubaliwa wakati:',
      proofLink: 'Ushahidi wa kuwasilisha: kiungo cha kazi.', proofTracking: 'Ushahidi wa kuwasilisha: msafirishaji na namba ya ufuatiliaji.',
      proofEither: 'Ushahidi wa kuwasilisha: kiungo au namba ya ufuatiliaji.',
      payment: 'Malipo: USDC {amount}, zinafungwa makubaliano yanapofadhiliwa na kutolewa kwa hatua {n}:', paymentNoPrice: 'Malipo: yanafungwa makubaliano yanapofadhiliwa na kutolewa kwa hatua {n}:', paymentOne: 'Malipo: USDC {amount}, zinafungwa makubaliano yanapofadhiliwa na kutolewa kwa hatua moja:', paymentOneNoPrice: 'Malipo: yanafungwa makubaliano yanapofadhiliwa na kutolewa kwa hatua moja:',
      part: "• {name}, {pct}% (USDC {amount}): {what}", partNoPrice: "• {name}, {pct}%: {what}", partName: 'Hatua {n}',
      review: 'Muda wa kukagua: siku {n} baada ya kila uwasilishaji. Mnunuzi asipojibu ndani ya muda huo, sehemu hiyo inalipwa kwa muuzaji.',
      reviewOne: 'Muda wa kukagua: siku 1 baada ya kila uwasilishaji. Mnunuzi asipojibu ndani ya muda huo, sehemu hiyo inalipwa kwa muuzaji.',
      moreTime: 'Mnunuzi anaweza kuomba mara moja muda zaidi wa kukagua.',
      late: 'Kuchelewa: kama hakuna kilichowasilishwa kabla ya tarehe ya mwisho, sehemu ambazo hazijalipwa zinarudi kwa mnunuzi.',
    },
  },
};
