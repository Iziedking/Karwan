import type { Locale } from '@/shared/i18n/locales';
import type { TermsCopy } from './composeTerms';

export interface TermsBuilderCopy {
  title: string;
  lead: string;
  kind: string;
  service: string;
  serviceHint: string;
  goods: string;
  goodsHint: string;
  both: string;
  bothHint: string;
  soon: string;
  parts: string;
  whatLabel: string;
  whatPlaceholder: string;
  splitEvenly: string;
  noWhat: string;
  payHalf: string;
  payThirty: string;
  payCustom: string;
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
  reviewHint: string;
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
    lead: 'Be specific. Each line is checked on its own when the work is delivered.',
    kind: 'It is',
    service: 'A service', serviceHint: 'Proof is a link',
    goods: 'Goods', goodsHint: 'Proof is a tracking number',
    both: 'Both', bothHint: 'Either proof works',
    soon: 'Soon',
    payHalf: 'Two equal parts', payThirty: '30% then 70%', payCustom: 'Custom',
    parts: "Milestones", whatLabel: "What this milestone delivers", whatPlaceholder: "First draft of the logo in two styles", splitEvenly: "Split evenly", noWhat: "Say what milestone {n} delivers.", part: 'Milestone {n}', 
    addPart: "Add a milestone", removeLine: 'Remove', total: 'Adds up to {sum}%', needs100: 'Adds up to {sum}%, needs 100%',
    review: 'Time to check each delivery', day: '1 day', days: '{n} days', other: 'Other', otherDays: 'Days to check',
    reviewHint: 'If the buyer says nothing in this time, that part is released.',
    agreement: 'The agreement both sides sign', agreementNote: 'Read by the agent and the arbiter',
    ready: "Ready. Every milestone says what it delivers, so it can be checked.",
    split: 'The parts add up to {sum}%. They need to make 100%.',
    vague: '"{item}" is very short. Say exactly what is delivered.',
    text: {
      due: 'Delivery: by {date}.', conditions: 'Accepted when:',
      proofLink: 'Proof of delivery: a link to the work.', proofTracking: 'Proof of delivery: carrier and tracking number.',
      proofEither: 'Proof of delivery: a link or a tracking number.',
      payment: 'Payment: {amount} USDC held in escrow, released in {n} milestones:', paymentNoPrice: 'Payment: held in escrow, released in {n} milestones:', paymentOne: 'Payment: {amount} USDC held in escrow, released in one milestone:', paymentOneNoPrice: 'Payment: held in escrow, released in one milestone:',
      part: "• {name}, {pct}% ({amount} USDC): {what}", partNoPrice: "• {name}, {pct}%: {what}", partName: 'Milestone {n}',
      review: 'Check window: {n} days after each delivery. No reply in that time releases that part.',
      reviewOne: 'Check window: 1 day after each delivery. No reply in that time releases that part.',
      late: 'Late: if nothing is delivered by the deadline, unpaid parts return to the buyer.',
    },
  },
  fr: {
    title: 'Qu’est-ce qui compte comme terminé ?',
    lead: 'Soyez précis. Chaque ligne est vérifiée séparément à la livraison.',
    kind: 'C’est',
    service: 'Un service', serviceHint: 'La preuve est un lien',
    goods: 'Des biens', goodsHint: 'La preuve est un numéro de suivi',
    both: 'Les deux', bothHint: 'L’une ou l’autre preuve',
    soon: 'Bientôt',
    payHalf: 'Deux parts égales', payThirty: '30 % puis 70 %', payCustom: 'Personnalisé',
    parts: "Étapes", whatLabel: "Ce que cette étape livre", whatPlaceholder: "Première version du logo en deux styles", splitEvenly: "Répartir également", noWhat: "Dites ce que l’étape {n} livre.", part: 'Étape {n}', 
    addPart: "Ajouter une étape", removeLine: 'Retirer', total: 'Total de {sum} %', needs100: 'Total de {sum} %, il faut 100 %',
    review: 'Temps pour vérifier chaque livraison', day: '1 jour', days: '{n} jours', other: 'Autre', otherDays: 'Jours pour vérifier',
    reviewHint: 'Sans réponse de l’acheteur dans ce délai, cette partie est libérée.',
    agreement: 'L’accord signé par les deux parties', agreementNote: 'Lu par l’agent et l’arbitre',
    ready: "Prêt. Chaque étape dit ce qu’elle livre, elle peut donc être vérifiée.",
    split: 'Les parties font {sum} %. Elles doivent faire 100 %.',
    vague: '« {item} » est très court. Précisez ce qui est livré.',
    text: {
      due: 'Livraison : avant le {date}.', conditions: 'Accepté quand :',
      proofLink: 'Preuve de livraison : un lien vers le travail.', proofTracking: 'Preuve de livraison : transporteur et numéro de suivi.',
      proofEither: 'Preuve de livraison : un lien ou un numéro de suivi.',
      payment: 'Paiement : {amount} USDC en séquestre, libérés en {n} étapes :', paymentNoPrice: 'Paiement : en séquestre, libéré en {n} étapes :', paymentOne: 'Paiement : {amount} USDC en séquestre, libérés en une étape :', paymentOneNoPrice: 'Paiement : en séquestre, libéré en une étape :',
      part: "• {name}, {pct} % ({amount} USDC) : {what}", partNoPrice: "• {name}, {pct} % : {what}", partName: 'Étape {n}',
      review: 'Délai de vérification : {n} jours après chaque livraison. Sans réponse dans ce délai, cette partie est libérée.',
      reviewOne: 'Délai de vérification : 1 jour après chaque livraison. Sans réponse dans ce délai, cette partie est libérée.',
      late: 'Retard : si rien n’est livré avant la date limite, les parties non payées reviennent à l’acheteur.',
    },
  },
  ar: {
    title: 'ما الذي يُعدّ إنجازًا؟',
    lead: 'كن محددًا. يُتحقق من كل سطر على حدة عند التسليم.',
    kind: 'إنه',
    service: 'خدمة', serviceHint: 'الإثبات رابط',
    goods: 'بضائع', goodsHint: 'الإثبات رقم تتبع',
    both: 'كلاهما', bothHint: 'يصلح أي إثبات',
    soon: 'قريبًا',
    payHalf: 'جزآن متساويان', payThirty: '30% ثم 70%', payCustom: 'مخصص',
    parts: "المراحل", whatLabel: "ما تسلّمه هذه المرحلة", whatPlaceholder: "المسودة الأولى للشعار بأسلوبين", splitEvenly: "قسّم بالتساوي", noWhat: "اذكر ما تسلّمه المرحلة {n}.", part: 'المرحلة {n}', 
    addPart: "أضف مرحلة", removeLine: 'إزالة', total: 'المجموع {sum}%', needs100: 'المجموع {sum}%، والمطلوب 100%',
    review: 'مدة فحص كل تسليم', day: 'يوم واحد', days: '{n} أيام', other: 'أخرى', otherDays: 'أيام الفحص',
    reviewHint: 'إن لم يردّ المشتري خلال هذه المدة، يُحرَّر ذلك الجزء.',
    agreement: 'الاتفاق الذي يوقّعه الطرفان', agreementNote: 'يقرؤه الوكيل والمحكّم',
    ready: "جاهز. كل مرحلة تذكر ما تسلّمه، لذا يمكن التحقق منها.",
    split: 'مجموع الأجزاء {sum}%. يجب أن يكون 100%.',
    vague: '"{item}" قصير جدًا. حدّد ما يُسلَّم بالضبط.',
    text: {
      due: 'التسليم: قبل {date}.', conditions: 'يُقبل عندما:',
      proofLink: 'إثبات التسليم: رابط إلى العمل.', proofTracking: 'إثبات التسليم: شركة الشحن ورقم التتبع.',
      proofEither: 'إثبات التسليم: رابط أو رقم تتبع.',
      payment: 'الدفع: {amount} USDC محتجزة في الضمان، تُحرَّر على {n} مراحل:', paymentNoPrice: 'الدفع: محتجز في الضمان، يُحرَّر على {n} مراحل:', paymentOne: 'الدفع: {amount} USDC محتجزة في الضمان، تُحرَّر في مرحلة واحدة:', paymentOneNoPrice: 'الدفع: محتجز في الضمان، يُحرَّر في مرحلة واحدة:',
      part: "• {name}، {pct}% ({amount} USDC): {what}", partNoPrice: "• {name}، {pct}%: {what}", partName: 'المرحلة {n}',
      review: 'مدة الفحص: {n} أيام بعد كل تسليم. عدم الرد خلالها يحرر ذلك الجزء.',
      reviewOne: 'مدة الفحص: يوم واحد بعد كل تسليم. عدم الرد خلاله يحرر ذلك الجزء.',
      late: 'التأخير: إن لم يُسلَّم شيء قبل الموعد النهائي، تعود الأجزاء غير المدفوعة إلى المشتري.',
    },
  },
  hi: {
    title: 'काम पूरा कब माना जाएगा?',
    lead: 'साफ़ लिखें। डिलीवरी पर हर पंक्ति अलग से जाँची जाती है।',
    kind: 'यह है',
    service: 'एक सेवा', serviceHint: 'सबूत एक लिंक है',
    goods: 'सामान', goodsHint: 'सबूत ट्रैकिंग नंबर है',
    both: 'दोनों', bothHint: 'कोई भी सबूत चलेगा',
    soon: 'जल्द',
    payHalf: 'दो बराबर हिस्से', payThirty: 'पहले 30%, फिर 70%', payCustom: 'अपने हिसाब से',
    parts: "पड़ाव", whatLabel: "यह पड़ाव क्या देता है", whatPlaceholder: "दो शैलियों में लोगो का पहला ड्राफ़्ट", splitEvenly: "बराबर बाँटें", noWhat: "बताएँ कि पड़ाव {n} क्या देता है।", part: 'पड़ाव {n}', 
    addPart: "पड़ाव जोड़ें", removeLine: 'हटाएँ', total: 'कुल {sum}%', needs100: 'कुल {sum}%, 100% चाहिए',
    review: 'हर डिलीवरी जाँचने का समय', day: '1 दिन', days: '{n} दिन', other: 'अन्य', otherDays: 'जाँच के दिन',
    reviewHint: 'अगर खरीदार इस समय में कुछ नहीं कहता, तो वह हिस्सा जारी हो जाता है।',
    agreement: 'दोनों पक्षों का समझौता', agreementNote: 'एजेंट और मध्यस्थ इसे पढ़ते हैं',
    ready: "तैयार। हर पड़ाव बताता है कि वह क्या देता है, इसलिए उसकी जाँच हो सकती है।",
    split: 'हिस्सों का कुल {sum}% है। इसे 100% होना चाहिए।',
    vague: '"{item}" बहुत छोटा है। साफ़ बताएँ कि क्या डिलीवर होगा।',
    text: {
      due: 'डिलीवरी: {date} तक।', conditions: 'स्वीकार होगा जब:',
      proofLink: 'डिलीवरी का सबूत: काम का लिंक।', proofTracking: 'डिलीवरी का सबूत: कूरियर और ट्रैकिंग नंबर।',
      proofEither: 'डिलीवरी का सबूत: लिंक या ट्रैकिंग नंबर।',
      payment: 'भुगतान: {amount} USDC एस्क्रो में, {n} पड़ावों में जारी:', paymentNoPrice: 'भुगतान: एस्क्रो में, {n} पड़ावों में जारी:', paymentOne: 'भुगतान: {amount} USDC एस्क्रो में, एक पड़ाव में जारी:', paymentOneNoPrice: 'भुगतान: एस्क्रो में, एक पड़ाव में जारी:',
      part: "• {name}, {pct}% ({amount} USDC): {what}", partNoPrice: "• {name}, {pct}%: {what}", partName: 'पड़ाव {n}',
      review: 'जाँच का समय: हर डिलीवरी के बाद {n} दिन। इस समय में जवाब न मिलने पर वह हिस्सा जारी होता है।',
      reviewOne: 'जाँच का समय: हर डिलीवरी के बाद 1 दिन। इस समय में जवाब न मिलने पर वह हिस्सा जारी होता है।',
      late: 'देरी: अगर समय सीमा तक कुछ डिलीवर नहीं होता, तो बिना भुगतान वाले हिस्से खरीदार को लौटते हैं।',
    },
  },
  sw: {
    title: 'Nini kinahesabika kuwa kimekamilika?',
    lead: 'Kuwa mahususi. Kila mstari unakaguliwa peke yake kazi inapowasilishwa.',
    kind: 'Ni',
    service: 'Huduma', serviceHint: 'Ushahidi ni kiungo',
    goods: 'Bidhaa', goodsHint: 'Ushahidi ni namba ya ufuatiliaji',
    both: 'Vyote viwili', bothHint: 'Ushahidi wowote unafaa',
    soon: 'Hivi karibuni',
    payHalf: 'Sehemu mbili sawa', payThirty: '30% kisha 70%', payCustom: 'Weka mwenyewe',
    parts: "Hatua", whatLabel: "Hatua hii inawasilisha nini", whatPlaceholder: "Rasimu ya kwanza ya nembo kwa mitindo miwili", splitEvenly: "Gawanya sawa", noWhat: "Sema hatua ya {n} inawasilisha nini.", part: 'Hatua {n}', 
    addPart: "Ongeza hatua", removeLine: 'Ondoa', total: 'Jumla {sum}%', needs100: 'Jumla {sum}%, inahitaji 100%',
    review: 'Muda wa kukagua kila uwasilishaji', day: 'Siku 1', days: 'Siku {n}', other: 'Nyingine', otherDays: 'Siku za kukagua',
    reviewHint: 'Mnunuzi asiposema chochote ndani ya muda huu, sehemu hiyo inatolewa.',
    agreement: 'Makubaliano wanayosaini pande zote', agreementNote: 'Yanasomwa na wakala na msuluhishi',
    ready: "Tayari. Kila hatua inaeleza inachowasilisha, hivyo inaweza kukaguliwa.",
    split: 'Sehemu zinajumlisha {sum}%. Zinahitaji kufikia 100%.',
    vague: '"{item}" ni fupi sana. Eleza hasa kinachowasilishwa.',
    text: {
      due: 'Uwasilishaji: kabla ya {date}.', conditions: 'Kinakubaliwa wakati:',
      proofLink: 'Ushahidi wa kuwasilisha: kiungo cha kazi.', proofTracking: 'Ushahidi wa kuwasilisha: msafirishaji na namba ya ufuatiliaji.',
      proofEither: 'Ushahidi wa kuwasilisha: kiungo au namba ya ufuatiliaji.',
      payment: 'Malipo: USDC {amount} zimeshikiliwa kwenye escrow, zinatolewa kwa hatua {n}:', paymentNoPrice: 'Malipo: yameshikiliwa kwenye escrow, yanatolewa kwa hatua {n}:', paymentOne: 'Malipo: USDC {amount} zimeshikiliwa kwenye escrow, zinatolewa kwa hatua moja:', paymentOneNoPrice: 'Malipo: yameshikiliwa kwenye escrow, yanatolewa kwa hatua moja:',
      part: "• {name}, {pct}% (USDC {amount}): {what}", partNoPrice: "• {name}, {pct}%: {what}", partName: 'Hatua {n}',
      review: 'Muda wa kukagua: siku {n} baada ya kila uwasilishaji. Kukosa jibu ndani ya muda huo kunatoa sehemu hiyo.',
      reviewOne: 'Muda wa kukagua: siku 1 baada ya kila uwasilishaji. Kukosa jibu ndani ya muda huo kunatoa sehemu hiyo.',
      late: 'Kuchelewa: kama hakuna kilichowasilishwa kabla ya tarehe ya mwisho, sehemu ambazo hazijalipwa zinarudi kwa mnunuzi.',
    },
  },
};
