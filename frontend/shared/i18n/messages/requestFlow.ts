/// Requests and offers, and how a deal is paid (view 44, Batch 6).
export interface RequestFlowCopy {
  reference: string;
  upTo: string;
  neededBy: string;
  bestFit: string;
  accept: string;
  acceptTitle: string;
  confirmFor: string;
  confirmTo: string;
  confirmPrice: string;
  confirmDelivers: string;
  heldBy: string;
  heldValue: string;
  notNow: string;
  deliversIn: string;
  deliversInOne: string;
  looking: string;
  nothingPaid: string;
  agentLine: string;
  kindTitle: string;
  forWork: string;
  forGoods: string;
  kinds: {
    one: string;
    stages: string;
    hourly: string;
    monthly: string;
    contest: string;
    shipped: string;
    in_person: string;
  };
  kindLines: {
    one: string;
    stages: string;
    hourly: string;
    monthly: string;
    contest: string;
    shipped: string;
    in_person: string;
  };
}

export const requestFlowCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', RequestFlowCopy> = {
  en: {
    reference: 'Request {reference}',
    upTo: 'Up to {amount} USDC',
    neededBy: 'Needed by {date}',
    bestFit: 'Best fit, picked by your agent',
    accept: 'Accept',
    acceptTitle: 'Accept the offer from {name}?',
    confirmFor: 'For',
    confirmTo: 'To',
    confirmPrice: 'Price',
    confirmDelivers: 'Delivers in',
    heldBy: "Payment",
    heldValue: "Held in escrow under the agreed release rules",
    notNow: 'Not now',
    deliversIn: '{n} days',
    deliversInOne: '1 day',
    looking: 'Your agent is looking. Offers show here as they come.',
    nothingPaid: 'Nothing is paid until you accept an offer.',
    agentLine: 'Your agent looks for sellers and brings you offers.',
    kindTitle: 'How do you want to pay?',
    forWork: 'For work',
    forGoods: 'For goods',
    kinds: { one: 'One payment', stages: 'In stages', hourly: 'By the hour or week', monthly: 'Monthly', contest: 'A contest', shipped: 'Shipped', in_person: 'Handed over in person' },
    kindLines: {
      one: 'Pay once when it is delivered',
      stages: 'Pay part by part as each stage is delivered',
      hourly: 'Pay for the hours sent each week',
      monthly: 'Pay each month for the work sent',
      contest: 'Many people send work, you pay the best',
      shipped: 'The seller sends it with tracking',
      in_person: 'You meet and get it with a code',
    },
  },
  fr: {
    reference: 'Demande {reference}',
    upTo: 'Jusqu’à {amount} USDC',
    neededBy: 'Pour le {date}',
    bestFit: 'Meilleur choix, sélectionné par votre agent',
    accept: 'Accepter',
    acceptTitle: 'Accepter l’offre de {name} ?',
    confirmFor: 'Pour',
    confirmTo: 'À',
    confirmPrice: 'Prix',
    confirmDelivers: 'Livré en',
    heldBy: "Paiement",
    heldValue: "Sous séquestre selon les règles de versement convenues",
    notNow: 'Pas maintenant',
    deliversIn: '{n} jours',
    deliversInOne: '1 jour',
    looking: 'Votre agent cherche. Les offres apparaissent ici dès qu’elles arrivent.',
    nothingPaid: 'Rien n’est payé tant que vous n’acceptez pas une offre.',
    agentLine: 'Votre agent cherche des vendeurs et vous apporte des offres.',
    kindTitle: 'Comment voulez-vous payer ?',
    forWork: 'Pour un travail',
    forGoods: 'Pour des biens',
    kinds: { one: 'Un seul paiement', stages: 'Par étapes', hourly: 'À l’heure ou à la semaine', monthly: 'Au mois', contest: 'Un concours', shipped: 'Expédié', in_person: 'Remis en main propre' },
    kindLines: {
      one: 'Payez une fois à la livraison',
      stages: 'Payez au fur et à mesure de chaque étape livrée',
      hourly: 'Payez les heures envoyées chaque semaine',
      monthly: 'Payez chaque mois le travail envoyé',
      contest: 'Plusieurs personnes envoient leur travail, vous payez le meilleur',
      shipped: 'Le vendeur l’envoie avec un suivi',
      in_person: 'Vous vous rencontrez et le récupérez avec un code',
    },
  },
  ar: {
    reference: 'الطلب {reference}',
    upTo: 'حتى {amount} USDC',
    neededBy: 'مطلوب بحلول {date}',
    bestFit: 'الأنسب، اختاره وكيلك',
    accept: 'قبول',
    acceptTitle: 'قبول عرض {name}؟',
    confirmFor: 'مقابل',
    confirmTo: 'إلى',
    confirmPrice: 'السعر',
    confirmDelivers: 'التسليم خلال',
    heldBy: "الدفع",
    heldValue: "محفوظ في الضمان وفق قواعد الصرف المتفق عليها",
    notNow: 'ليس الآن',
    deliversIn: '{n} أيام',
    deliversInOne: 'يوم واحد',
    looking: 'وكيلك يبحث. تظهر العروض هنا فور وصولها.',
    nothingPaid: 'لا يُدفع شيء حتى تقبل عرضًا.',
    agentLine: 'يبحث وكيلك عن بائعين ويأتيك بالعروض.',
    kindTitle: 'كيف تريد أن تدفع؟',
    forWork: 'لعمل',
    forGoods: 'لبضائع',
    kinds: { one: 'دفعة واحدة', stages: 'على مراحل', hourly: 'بالساعة أو بالأسبوع', monthly: 'شهريًا', contest: 'مسابقة', shipped: 'شحن', in_person: 'تسليم يدًا بيد' },
    kindLines: {
      one: 'ادفع مرة واحدة عند التسليم',
      stages: 'ادفع جزءًا بعد جزء مع تسليم كل مرحلة',
      hourly: 'ادفع مقابل الساعات المرسلة كل أسبوع',
      monthly: 'ادفع كل شهر مقابل العمل المرسل',
      contest: 'يرسل كثيرون أعمالهم، وتدفع للأفضل',
      shipped: 'يرسله البائع مع رقم تتبع',
      in_person: 'تلتقيان وتستلمه برمز',
    },
  },
  hi: {
    reference: 'अनुरोध {reference}',
    upTo: '{amount} USDC तक',
    neededBy: '{date} तक चाहिए',
    bestFit: 'सबसे सही, आपके एजेंट ने चुना',
    accept: 'स्वीकार करें',
    acceptTitle: '{name} का ऑफ़र स्वीकार करें?',
    confirmFor: 'किसके लिए',
    confirmTo: 'किसे',
    confirmPrice: 'कीमत',
    confirmDelivers: 'डिलीवरी',
    heldBy: "भुगतान",
    heldValue: "तय भुगतान नियमों के अनुसार एस्क्रो में सुरक्षित",
    notNow: 'अभी नहीं',
    deliversIn: '{n} दिन में',
    deliversInOne: '1 दिन में',
    looking: 'आपका एजेंट खोज रहा है। ऑफ़र आते ही यहाँ दिखेंगे।',
    nothingPaid: 'जब तक आप कोई ऑफ़र स्वीकार नहीं करते, कुछ भी भुगतान नहीं होता।',
    agentLine: 'आपका एजेंट विक्रेता ढूँढता है और आपके लिए ऑफ़र लाता है।',
    kindTitle: 'आप कैसे भुगतान करना चाहते हैं?',
    forWork: 'काम के लिए',
    forGoods: 'सामान के लिए',
    kinds: { one: 'एक बार में भुगतान', stages: 'चरणों में', hourly: 'घंटे या हफ़्ते के हिसाब से', monthly: 'मासिक', contest: 'प्रतियोगिता', shipped: 'शिप किया गया', in_person: 'हाथ में सौंपा गया' },
    kindLines: {
      one: 'डिलीवरी पर एक बार भुगतान करें',
      stages: 'हर चरण डिलीवर होने पर हिस्सों में भुगतान करें',
      hourly: 'हर हफ़्ते भेजे गए घंटों का भुगतान करें',
      monthly: 'हर महीने भेजे गए काम का भुगतान करें',
      contest: 'कई लोग काम भेजते हैं, आप सबसे अच्छे को भुगतान करते हैं',
      shipped: 'विक्रेता इसे ट्रैकिंग के साथ भेजता है',
      in_person: 'आप मिलते हैं और कोड से इसे लेते हैं',
    },
  },
  sw: {
    reference: 'Ombi {reference}',
    upTo: 'Hadi USDC {amount}',
    neededBy: 'Linahitajika kufikia {date}',
    bestFit: 'Linafaa zaidi, limechaguliwa na wakala wako',
    accept: 'Kubali',
    acceptTitle: 'Ukubali ofa ya {name}?',
    confirmFor: 'Kwa ajili ya',
    confirmTo: 'Kwa',
    confirmPrice: 'Bei',
    confirmDelivers: 'Uwasilishaji',
    heldBy: "Malipo",
    heldValue: "Zimeshikiliwa kwenye escrow kwa masharti ya malipo yaliyokubaliwa",
    notNow: 'Si sasa',
    deliversIn: 'Siku {n}',
    deliversInOne: 'Siku 1',
    looking: 'Wakala wako anatafuta. Ofa zitaonekana hapa zikifika.',
    nothingPaid: 'Hakuna kinacholipwa hadi ukubali ofa.',
    agentLine: 'Wakala wako anatafuta wauzaji na kukuletea ofa.',
    kindTitle: 'Unataka kulipa vipi?',
    forWork: 'Kwa kazi',
    forGoods: 'Kwa bidhaa',
    kinds: { one: 'Malipo mara moja', stages: 'Kwa hatua', hourly: 'Kwa saa au wiki', monthly: 'Kila mwezi', contest: 'Shindano', shipped: 'Imesafirishwa', in_person: 'Imekabidhiwa ana kwa ana' },
    kindLines: {
      one: 'Lipa mara moja ikiwasilishwa',
      stages: 'Lipa sehemu kwa sehemu kila hatua ikiwasilishwa',
      hourly: 'Lipa saa zilizotumwa kila wiki',
      monthly: 'Lipa kila mwezi kwa kazi iliyotumwa',
      contest: 'Watu wengi wanatuma kazi, unamlipa bora zaidi',
      shipped: 'Muuzaji anaituma na namba ya ufuatiliaji',
      in_person: 'Mnakutana na unaipokea kwa msimbo',
    },
  },
};
