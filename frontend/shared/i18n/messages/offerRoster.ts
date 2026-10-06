/// The offers on a request, as the buyer sees them: one folded row of faces,
/// a ranked list, and a sheet for each offer. {n}, {name}, {amount}, {date} and
/// {min}/{max} are filled at render.
export interface OfferRosterCopy {
  soFarOne: string;
  soFarMany: string;
  othersOne: string;
  othersMany: string;
  countOne: string;
  countMany: string;
  range: string;
  show: string;
  hide: string;
  showMore: string;
  pick: string;
  rankNote: string;
  fit: { strong: string; good: string; partial: string };
  delivers: string;
  settled: string;
  disputes: string;
  deliverBy: string;
  newHere: string;
  record: string;
  choose: string;
  confirmTitle: string;
  confirmBody: string;
  noFunds: string;
  failed: string;
  closed: string;
  taken: string;
  gone: string;
  notYours: string;
  busy: string;
}

export const offerRosterCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', OfferRosterCopy> = {
  en: {
    soFarOne: '1 offer so far',
    soFarMany: '{n} offers so far',
    othersOne: '1 other offer',
    othersMany: '{n} other offers',
    countOne: '1 offer',
    countMany: '{n} offers',
    range: '{min} to {max} USDC',
    show: 'Show',
    hide: 'Hide',
    showMore: 'Show {n} more',
    pick: "Your agent's pick",
    rankNote: 'Ranked by how well each seller fits the request, then by record and price. Open any offer to see more or choose it yourself.',
    fit: { strong: 'Strong fit', good: 'Good fit', partial: 'Partial fit' },
    delivers: 'by {date}',
    settled: 'Deals settled',
    disputes: 'Disputes',
    deliverBy: 'Delivers by',
    newHere: 'New on Karwan',
    record: 'Full record',
    choose: 'Choose {name} for {amount} USDC',
    confirmTitle: 'Choose {name}',
    confirmBody: 'Your buying agent puts {amount} USDC in escrow now. {name} is paid only when you approve the work.',
    noFunds: 'Your buying agent needs more USDC to fund this offer. Add funds, then choose again.',
    failed: 'This offer could not be chosen. Try again.',
    closed: "This request has closed. Post it again to get new offers.",
    taken: "This request already has an agreed deal.",
    gone: "This seller withdrew the offer. Choose another.",
    notYours: "Only the account that posted this request can choose an offer. Sign in with it.",
    busy: "Your agent is busy with this request. Try again in a minute.",
  },
  fr: {
    soFarOne: "1 offre pour l'instant",
    soFarMany: "{n} offres pour l'instant",
    othersOne: '1 autre offre',
    othersMany: '{n} autres offres',
    countOne: '1 offre',
    countMany: '{n} offres',
    range: 'De {min} à {max} USDC',
    show: 'Afficher',
    hide: 'Masquer',
    showMore: 'Afficher {n} de plus',
    pick: 'Le choix de votre agent',
    rankNote: "Classées selon l'adéquation de chaque vendeur à la demande, puis selon son historique et son prix. Ouvrez une offre pour en voir plus ou la choisir vous-même.",
    fit: { strong: 'Très adapté', good: 'Adapté', partial: 'Partiellement adapté' },
    delivers: "d'ici le {date}",
    settled: 'Accords réglés',
    disputes: 'Litiges',
    deliverBy: "Livraison d'ici",
    newHere: 'Nouveau sur Karwan',
    record: 'Historique complet',
    choose: 'Choisir {name} pour {amount} USDC',
    confirmTitle: 'Choisir {name}',
    confirmBody: "Votre agent d'achat place {amount} USDC sous séquestre maintenant. {name} n'est payé que lorsque vous approuvez le travail.",
    noFunds: "Votre agent d'achat a besoin de plus d'USDC pour financer cette offre. Ajoutez des fonds, puis choisissez à nouveau.",
    failed: 'Impossible de choisir cette offre. Réessayez.',
    closed: "Cette demande est close. Publiez-la à nouveau pour recevoir des offres.",
    taken: "Cette demande a déjà un accord conclu.",
    gone: "Ce vendeur a retiré son offre. Choisissez-en une autre.",
    notYours: "Seul le compte qui a publié cette demande peut choisir une offre. Connectez-vous avec ce compte.",
    busy: "Votre agent traite déjà cette demande. Réessayez dans une minute.",
  },
  ar: {
    soFarOne: 'عرض واحد حتى الآن',
    soFarMany: '{n} عروض حتى الآن',
    othersOne: 'عرض آخر واحد',
    othersMany: '{n} عروض أخرى',
    countOne: 'عرض واحد',
    countMany: '{n} عروض',
    range: 'من {min} إلى {max} USDC',
    show: 'عرض',
    hide: 'إخفاء',
    showMore: 'عرض {n} أخرى',
    pick: 'اختيار وكيلك',
    rankNote: 'مرتبة حسب مدى ملاءمة كل بائع للطلب، ثم حسب سجله وسعره. افتح أي عرض لترى المزيد أو لتختاره بنفسك.',
    fit: { strong: 'ملاءمة عالية', good: 'ملاءمة جيدة', partial: 'ملاءمة جزئية' },
    delivers: 'بحلول {date}',
    settled: 'صفقات مكتملة',
    disputes: 'نزاعات',
    deliverBy: 'التسليم بحلول',
    newHere: 'جديد على Karwan',
    record: 'السجل الكامل',
    choose: 'اختر {name} مقابل {amount} USDC',
    confirmTitle: 'اختيار {name}',
    confirmBody: 'يضع وكيل الشراء {amount} USDC في الضمان الآن. لا يُدفع لـ {name} إلا عندما توافق على العمل.',
    noFunds: 'يحتاج وكيل الشراء إلى مزيد من USDC لتمويل هذا العرض. أضف أموالًا ثم اختر مجددًا.',
    failed: 'تعذّر اختيار هذا العرض. حاول مرة أخرى.',
    closed: "أُغلق هذا الطلب. انشره مجددًا لتلقي عروض جديدة.",
    taken: "لهذا الطلب صفقة متفق عليها بالفعل.",
    gone: "سحب هذا البائع عرضه. اختر عرضًا آخر.",
    notYours: "يمكن فقط للحساب الذي نشر هذا الطلب اختيار عرض. سجّل الدخول به.",
    busy: "وكيلك منشغل بهذا الطلب. حاول بعد دقيقة.",
  },
  hi: {
    soFarOne: 'अब तक 1 ऑफ़र',
    soFarMany: 'अब तक {n} ऑफ़र',
    othersOne: '1 और ऑफ़र',
    othersMany: '{n} और ऑफ़र',
    countOne: '1 ऑफ़र',
    countMany: '{n} ऑफ़र',
    range: '{min} से {max} USDC',
    show: 'दिखाएँ',
    hide: 'छिपाएँ',
    showMore: '{n} और दिखाएँ',
    pick: 'आपके एजेंट की पसंद',
    rankNote: 'क्रम इस आधार पर है कि हर विक्रेता अनुरोध के लिए कितना उपयुक्त है, फिर रिकॉर्ड और कीमत। कोई भी ऑफ़र खोलकर ज़्यादा देखें या खुद चुनें।',
    fit: { strong: 'बहुत उपयुक्त', good: 'उपयुक्त', partial: 'आंशिक रूप से उपयुक्त' },
    delivers: '{date} तक',
    settled: 'पूरे हुए सौदे',
    disputes: 'विवाद',
    deliverBy: 'डिलीवरी',
    newHere: 'Karwan पर नए',
    record: 'पूरा रिकॉर्ड',
    choose: '{name} को {amount} USDC में चुनें',
    confirmTitle: '{name} को चुनें',
    confirmBody: 'आपका ख़रीद एजेंट अभी {amount} USDC एस्क्रो में रखेगा। {name} को भुगतान तभी होगा जब आप काम मंज़ूर करेंगे।',
    noFunds: 'इस ऑफ़र के लिए आपके ख़रीद एजेंट को और USDC चाहिए। फ़ंड जोड़ें, फिर दोबारा चुनें।',
    failed: 'यह ऑफ़र चुना नहीं जा सका। फिर से कोशिश करें।',
    closed: "यह अनुरोध बंद हो गया है। नए ऑफ़र के लिए इसे फिर से पोस्ट करें।",
    taken: "इस अनुरोध पर पहले से एक सौदा तय है।",
    gone: "इस विक्रेता ने ऑफ़र वापस ले लिया। कोई और चुनें।",
    notYours: "केवल वही खाता ऑफ़र चुन सकता है जिसने यह अनुरोध पोस्ट किया। उसी से साइन इन करें।",
    busy: "आपका एजेंट इस अनुरोध पर काम कर रहा है। एक मिनट बाद फिर कोशिश करें।",
  },
  sw: {
    soFarOne: 'Ofa 1 hadi sasa',
    soFarMany: 'Ofa {n} hadi sasa',
    othersOne: 'Ofa 1 nyingine',
    othersMany: 'Ofa {n} nyingine',
    countOne: 'Ofa 1',
    countMany: 'Ofa {n}',
    range: '{min} hadi {max} USDC',
    show: 'Onyesha',
    hide: 'Ficha',
    showMore: 'Onyesha {n} zaidi',
    pick: 'Chaguo la wakala wako',
    rankNote: 'Zimepangwa kwa jinsi kila muuzaji anavyofaa ombi, kisha rekodi na bei. Fungua ofa yoyote kuona zaidi au kuichagua mwenyewe.',
    fit: { strong: 'Anafaa sana', good: 'Anafaa', partial: 'Anafaa kiasi' },
    delivers: 'kufikia {date}',
    settled: 'Mikataba iliyokamilika',
    disputes: 'Migogoro',
    deliverBy: 'Kuwasilisha kufikia',
    newHere: 'Mpya kwenye Karwan',
    record: 'Rekodi kamili',
    choose: 'Chagua {name} kwa USDC {amount}',
    confirmTitle: 'Chagua {name}',
    confirmBody: 'Wakala wako wa ununuzi anaweka USDC {amount} kwenye escrow sasa. {name} analipwa tu utakapoidhinisha kazi.',
    noFunds: 'Wakala wako wa ununuzi anahitaji USDC zaidi kufadhili ofa hii. Ongeza fedha, kisha uchague tena.',
    failed: 'Ofa hii haikuweza kuchaguliwa. Jaribu tena.',
    closed: "Ombi hili limefungwa. Lichapishe tena upate ofa mpya.",
    taken: "Ombi hili tayari lina makubaliano.",
    gone: "Muuzaji huyu ameondoa ofa. Chagua nyingine.",
    notYours: "Akaunti iliyochapisha ombi hili pekee ndiyo inaweza kuchagua ofa. Ingia nayo.",
    busy: "Wakala wako anashughulikia ombi hili. Jaribu tena baada ya dakika moja.",
  },
};
