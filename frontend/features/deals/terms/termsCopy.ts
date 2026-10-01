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
  items: string;
  itemPlaceholder: string;
  addItem: string;
  itemsHint: string;
  conditions: string;
  conditionPlaceholder: string;
  addCondition: string;
  conditionsHint: string;
  parts: string;
  payHalf: string;
  payThirty: string;
  payCustom: string;
  moreTerms: string;
  part: string;
  paysFor: string;
  start: string;
  all: string;
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
  noItems: string;
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
    items: 'What is delivered', itemPlaceholder: 'Logo in SVG and PNG', addItem: 'Add an item',
    itemsHint: 'One item per line.',
    conditions: 'It is accepted when', conditionPlaceholder: '2 rounds of changes included', addCondition: 'Add a condition',
    conditionsHint: 'What the buyer checks before money is released.',
    payHalf: 'Two equal parts', payThirty: '30% then 70%', payCustom: 'Custom', moreTerms: 'More terms',
    parts: 'Paid in', part: 'Part {n}', paysFor: 'Pays for', start: 'Starting the work', all: 'Everything listed',
    addPart: 'Add a part', removeLine: 'Remove', total: 'Adds up to {sum}%', needs100: 'Adds up to {sum}%, needs 100%',
    review: 'Time to check each delivery', day: '1 day', days: '{n} days', other: 'Other', otherDays: 'Days to check',
    reviewHint: 'If the buyer says nothing in this time, that part is released.',
    agreement: 'The agreement both sides sign', agreementNote: 'Read by the agent and the arbiter',
    ready: 'Ready. Every item has a proof and a payment, so an arbiter could decide on it.',
    noItems: 'Add at least one item that is delivered.',
    split: 'The parts add up to {sum}%. They need to make 100%.',
    vague: '"{item}" is very short. Say exactly what is delivered.',
    text: {
      due: 'Delivery: by {date}.', items: 'What is delivered:', conditions: 'Accepted when:',
      proofLink: 'Proof of delivery: a link to the work.', proofTracking: 'Proof of delivery: carrier and tracking number.',
      proofEither: 'Proof of delivery: a link or a tracking number.',
      payment: 'Payment: {amount} USDC held in escrow, released in {n} parts:', paymentNoPrice: 'Payment: held in escrow, released in {n} parts:',
      part: '• {name}, {pct}% ({amount} USDC), for {covers}.', partNoPrice: '• {name}, {pct}%, for {covers}.', partName: 'Part {n}',
      coversStart: 'starting the work', coversAll: 'everything listed',
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
    items: 'Ce qui est livré', itemPlaceholder: 'Logo en SVG et PNG', addItem: 'Ajouter un élément',
    itemsHint: 'Un élément par ligne.',
    conditions: 'C’est accepté quand', conditionPlaceholder: '2 séries de modifications incluses', addCondition: 'Ajouter une condition',
    conditionsHint: 'Ce que l’acheteur vérifie avant que l’argent soit libéré.',
    payHalf: 'Deux parts égales', payThirty: '30 % puis 70 %', payCustom: 'Personnalisé', moreTerms: 'Plus de conditions',
    parts: 'Payé en', part: 'Partie {n}', paysFor: 'Paie pour', start: 'Le début du travail', all: 'Tout ce qui est listé',
    addPart: 'Ajouter une partie', removeLine: 'Retirer', total: 'Total de {sum} %', needs100: 'Total de {sum} %, il faut 100 %',
    review: 'Temps pour vérifier chaque livraison', day: '1 jour', days: '{n} jours', other: 'Autre', otherDays: 'Jours pour vérifier',
    reviewHint: 'Sans réponse de l’acheteur dans ce délai, cette partie est libérée.',
    agreement: 'L’accord signé par les deux parties', agreementNote: 'Lu par l’agent et l’arbitre',
    ready: 'Prêt. Chaque élément a une preuve et un paiement, un arbitre pourrait donc trancher.',
    noItems: 'Ajoutez au moins un élément livré.',
    split: 'Les parties font {sum} %. Elles doivent faire 100 %.',
    vague: '« {item} » est très court. Précisez ce qui est livré.',
    text: {
      due: 'Livraison : avant le {date}.', items: 'Ce qui est livré :', conditions: 'Accepté quand :',
      proofLink: 'Preuve de livraison : un lien vers le travail.', proofTracking: 'Preuve de livraison : transporteur et numéro de suivi.',
      proofEither: 'Preuve de livraison : un lien ou un numéro de suivi.',
      payment: 'Paiement : {amount} USDC en séquestre, libérés en {n} parties :', paymentNoPrice: 'Paiement : en séquestre, libéré en {n} parties :',
      part: '• {name}, {pct} % ({amount} USDC), pour {covers}.', partNoPrice: '• {name}, {pct} %, pour {covers}.', partName: 'Partie {n}',
      coversStart: 'le début du travail', coversAll: 'tout ce qui est listé',
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
    items: 'ما يُسلَّم', itemPlaceholder: 'شعار بصيغتي SVG وPNG', addItem: 'أضف عنصرًا',
    itemsHint: 'عنصر واحد في كل سطر.',
    conditions: 'يُقبل عندما', conditionPlaceholder: 'جولتا تعديل مشمولتان', addCondition: 'أضف شرطًا',
    conditionsHint: 'ما يتحقق منه المشتري قبل تحرير المال.',
    payHalf: 'جزآن متساويان', payThirty: '30% ثم 70%', payCustom: 'مخصص', moreTerms: 'شروط إضافية',
    parts: 'يُدفع على', part: 'الجزء {n}', paysFor: 'مقابل', start: 'بدء العمل', all: 'كل ما سبق',
    addPart: 'أضف جزءًا', removeLine: 'إزالة', total: 'المجموع {sum}%', needs100: 'المجموع {sum}%، والمطلوب 100%',
    review: 'مدة فحص كل تسليم', day: 'يوم واحد', days: '{n} أيام', other: 'أخرى', otherDays: 'أيام الفحص',
    reviewHint: 'إن لم يردّ المشتري خلال هذه المدة، يُحرَّر ذلك الجزء.',
    agreement: 'الاتفاق الذي يوقّعه الطرفان', agreementNote: 'يقرؤه الوكيل والمحكّم',
    ready: 'جاهز. لكل عنصر إثبات ودفعة، فيمكن للمحكّم أن يحكم فيه.',
    noItems: 'أضف عنصرًا واحدًا على الأقل يُسلَّم.',
    split: 'مجموع الأجزاء {sum}%. يجب أن يكون 100%.',
    vague: '"{item}" قصير جدًا. حدّد ما يُسلَّم بالضبط.',
    text: {
      due: 'التسليم: قبل {date}.', items: 'ما يُسلَّم:', conditions: 'يُقبل عندما:',
      proofLink: 'إثبات التسليم: رابط إلى العمل.', proofTracking: 'إثبات التسليم: شركة الشحن ورقم التتبع.',
      proofEither: 'إثبات التسليم: رابط أو رقم تتبع.',
      payment: 'الدفع: {amount} USDC محتجزة في الضمان، تُحرَّر على {n} أجزاء:', paymentNoPrice: 'الدفع: محتجز في الضمان، يُحرَّر على {n} أجزاء:',
      part: '• {name}، {pct}% ({amount} USDC)، مقابل {covers}.', partNoPrice: '• {name}، {pct}%، مقابل {covers}.', partName: 'الجزء {n}',
      coversStart: 'بدء العمل', coversAll: 'كل ما سبق',
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
    items: 'क्या डिलीवर होगा', itemPlaceholder: 'SVG और PNG में लोगो', addItem: 'आइटम जोड़ें',
    itemsHint: 'हर पंक्ति में एक आइटम।',
    conditions: 'यह स्वीकार होगा जब', conditionPlaceholder: 'बदलाव के 2 दौर शामिल', addCondition: 'शर्त जोड़ें',
    conditionsHint: 'पैसा जारी होने से पहले खरीदार क्या जाँचता है।',
    payHalf: 'दो बराबर हिस्से', payThirty: 'पहले 30%, फिर 70%', payCustom: 'अपने हिसाब से', moreTerms: 'और शर्तें',
    parts: 'भुगतान', part: 'हिस्सा {n}', paysFor: 'किसके लिए', start: 'काम की शुरुआत', all: 'सूची में सब कुछ',
    addPart: 'हिस्सा जोड़ें', removeLine: 'हटाएँ', total: 'कुल {sum}%', needs100: 'कुल {sum}%, 100% चाहिए',
    review: 'हर डिलीवरी जाँचने का समय', day: '1 दिन', days: '{n} दिन', other: 'अन्य', otherDays: 'जाँच के दिन',
    reviewHint: 'अगर खरीदार इस समय में कुछ नहीं कहता, तो वह हिस्सा जारी हो जाता है।',
    agreement: 'दोनों पक्षों का समझौता', agreementNote: 'एजेंट और मध्यस्थ इसे पढ़ते हैं',
    ready: 'तैयार। हर आइटम का सबूत और भुगतान तय है, इसलिए मध्यस्थ फ़ैसला कर सकता है।',
    noItems: 'कम से कम एक डिलीवर होने वाला आइटम जोड़ें।',
    split: 'हिस्सों का कुल {sum}% है। इसे 100% होना चाहिए।',
    vague: '"{item}" बहुत छोटा है। साफ़ बताएँ कि क्या डिलीवर होगा।',
    text: {
      due: 'डिलीवरी: {date} तक।', items: 'क्या डिलीवर होगा:', conditions: 'स्वीकार होगा जब:',
      proofLink: 'डिलीवरी का सबूत: काम का लिंक।', proofTracking: 'डिलीवरी का सबूत: कूरियर और ट्रैकिंग नंबर।',
      proofEither: 'डिलीवरी का सबूत: लिंक या ट्रैकिंग नंबर।',
      payment: 'भुगतान: {amount} USDC एस्क्रो में, {n} हिस्सों में जारी:', paymentNoPrice: 'भुगतान: एस्क्रो में, {n} हिस्सों में जारी:',
      part: '• {name}, {pct}% ({amount} USDC), {covers} के लिए।', partNoPrice: '• {name}, {pct}%, {covers} के लिए।', partName: 'हिस्सा {n}',
      coversStart: 'काम की शुरुआत', coversAll: 'सूची में सब कुछ',
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
    items: 'Kinachowasilishwa', itemPlaceholder: 'Nembo kwa SVG na PNG', addItem: 'Ongeza kipengele',
    itemsHint: 'Kipengele kimoja kwa kila mstari.',
    conditions: 'Kinakubaliwa wakati', conditionPlaceholder: 'Mizunguko 2 ya marekebisho imejumuishwa', addCondition: 'Ongeza sharti',
    conditionsHint: 'Anachokagua mnunuzi kabla pesa kutolewa.',
    payHalf: 'Sehemu mbili sawa', payThirty: '30% kisha 70%', payCustom: 'Weka mwenyewe', moreTerms: 'Masharti zaidi',
    parts: 'Inalipwa kwa', part: 'Sehemu {n}', paysFor: 'Inalipia', start: 'Kuanza kazi', all: 'Vyote vilivyoorodheshwa',
    addPart: 'Ongeza sehemu', removeLine: 'Ondoa', total: 'Jumla {sum}%', needs100: 'Jumla {sum}%, inahitaji 100%',
    review: 'Muda wa kukagua kila uwasilishaji', day: 'Siku 1', days: 'Siku {n}', other: 'Nyingine', otherDays: 'Siku za kukagua',
    reviewHint: 'Mnunuzi asiposema chochote ndani ya muda huu, sehemu hiyo inatolewa.',
    agreement: 'Makubaliano wanayosaini pande zote', agreementNote: 'Yanasomwa na wakala na msuluhishi',
    ready: 'Tayari. Kila kipengele kina ushahidi na malipo, hivyo msuluhishi anaweza kuamua.',
    noItems: 'Ongeza angalau kipengele kimoja kinachowasilishwa.',
    split: 'Sehemu zinajumlisha {sum}%. Zinahitaji kufikia 100%.',
    vague: '"{item}" ni fupi sana. Eleza hasa kinachowasilishwa.',
    text: {
      due: 'Uwasilishaji: kabla ya {date}.', items: 'Kinachowasilishwa:', conditions: 'Kinakubaliwa wakati:',
      proofLink: 'Ushahidi wa kuwasilisha: kiungo cha kazi.', proofTracking: 'Ushahidi wa kuwasilisha: msafirishaji na namba ya ufuatiliaji.',
      proofEither: 'Ushahidi wa kuwasilisha: kiungo au namba ya ufuatiliaji.',
      payment: 'Malipo: USDC {amount} zimeshikiliwa kwenye escrow, zinatolewa kwa sehemu {n}:', paymentNoPrice: 'Malipo: yameshikiliwa kwenye escrow, yanatolewa kwa sehemu {n}:',
      part: '• {name}, {pct}% (USDC {amount}), kwa {covers}.', partNoPrice: '• {name}, {pct}%, kwa {covers}.', partName: 'Sehemu {n}',
      coversStart: 'kuanza kazi', coversAll: 'vyote vilivyoorodheshwa',
      review: 'Muda wa kukagua: siku {n} baada ya kila uwasilishaji. Kukosa jibu ndani ya muda huo kunatoa sehemu hiyo.',
      reviewOne: 'Muda wa kukagua: siku 1 baada ya kila uwasilishaji. Kukosa jibu ndani ya muda huo kunatoa sehemu hiyo.',
      late: 'Kuchelewa: kama hakuna kilichowasilishwa kabla ya tarehe ya mwisho, sehemu ambazo hazijalipwa zinarudi kwa mnunuzi.',
    },
  },
};
