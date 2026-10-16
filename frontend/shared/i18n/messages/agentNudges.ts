/// Short notes that pop up while agents work: on a request page as the agents
/// bid, and on the seller desk as the seller's agent moves. {amount}, {count},
/// {checked} and {title} are filled at render.
export interface AgentNudgesCopy {
  label: string;
  dismiss: string;
  sellerOffered: string;
  sellerOfferedChecked: string;
  sellerAnswered: string;
  sellerAccepted: string;
  sellerPassed: string;
  scored: string;
  countered: string;
  shortlist: string;
  matched: string;
  scanned: string;
  aRequest: string;
  desk: {
    bid: string;
    checked: string;
    negotiating: string;
    passed: string;
    chosen: string;
    won: string;
    lost: string;
  };
}

export const agentNudgesCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', AgentNudgesCopy> = {
  en: {
    label: 'Agent activity',
    dismiss: 'Dismiss',
    sellerOffered: "A seller's agent offered {amount} USDC",
    sellerOfferedChecked: "A seller's agent paid to check your record, then offered {amount} USDC",
    sellerAnswered: "A seller's agent answered at {amount} USDC",
    sellerAccepted: "A seller's agent took your agent's price",
    sellerPassed: "A seller's agent passed on this request",
    scored: 'Your agent weighed an offer at {amount} USDC',
    countered: 'Your agent countered at {amount} USDC',
    shortlist: 'Your agent paid to check {checked} records and listed {count} sellers',
    matched: 'Your agent found a match',
    scanned: 'Your agent searched the market for sellers',
    aRequest: 'a request',
    desk: {
      bid: 'Your agent offered {amount} USDC on {title}',
      checked: 'Your agent paid {amount} USDC to check the buyer on {title}',
      negotiating: 'Your agent is negotiating {title}',
      passed: 'Your agent passed on {title}',
      chosen: 'A match on {title} needs you',
      won: 'You won {title}',
      lost: 'Another seller won {title}',
    },
  },
  fr: {
    label: 'Activité des agents',
    dismiss: 'Fermer',
    sellerOffered: "L'agent d'un vendeur a proposé {amount} USDC",
    sellerOfferedChecked: "L'agent d'un vendeur a payé pour vérifier votre historique, puis a proposé {amount} USDC",
    sellerAnswered: "L'agent d'un vendeur a répondu à {amount} USDC",
    sellerAccepted: "L'agent d'un vendeur a accepté le prix de votre agent",
    sellerPassed: "L'agent d'un vendeur a passé son tour sur cette demande",
    scored: 'Votre agent a évalué une offre à {amount} USDC',
    countered: 'Votre agent a contre-proposé {amount} USDC',
    shortlist: 'Votre agent a payé pour vérifier {checked} historiques et a retenu {count} vendeurs',
    matched: 'Votre agent a trouvé une correspondance',
    scanned: 'Votre agent a cherché des vendeurs sur le marché',
    aRequest: 'une demande',
    desk: {
      bid: 'Votre agent a proposé {amount} USDC sur {title}',
      checked: "Votre agent a payé {amount} USDC pour vérifier l'acheteur de {title}",
      negotiating: 'Votre agent négocie {title}',
      passed: 'Votre agent a passé son tour sur {title}',
      chosen: 'Une correspondance sur {title} vous attend',
      won: 'Vous avez remporté {title}',
      lost: 'Un autre vendeur a remporté {title}',
    },
  },
  ar: {
    label: 'نشاط الوكلاء',
    dismiss: 'إغلاق',
    sellerOffered: 'عرض وكيل بائع {amount} USDC',
    sellerOfferedChecked: 'دفع وكيل بائع للتحقق من سجلك، ثم عرض {amount} USDC',
    sellerAnswered: 'ردّ وكيل بائع بسعر {amount} USDC',
    sellerAccepted: 'قبل وكيل بائع سعر وكيلك',
    sellerPassed: 'تجاوز وكيل بائع هذا الطلب',
    scored: 'قيّم وكيلك عرضًا بسعر {amount} USDC',
    countered: 'قدّم وكيلك عرضًا مضادًا بسعر {amount} USDC',
    shortlist: 'دفع وكيلك للتحقق من {checked} سجلات وأدرج {count} بائعين',
    matched: 'وجد وكيلك تطابقًا',
    scanned: 'بحث وكيلك في السوق عن بائعين',
    aRequest: 'طلب',
    desk: {
      bid: 'عرض وكيلك {amount} USDC على {title}',
      checked: 'دفع وكيلك {amount} USDC للتحقق من المشتري في {title}',
      negotiating: 'وكيلك يتفاوض على {title}',
      passed: 'تجاوز وكيلك {title}',
      chosen: 'تطابق على {title} بانتظارك',
      won: 'فزت بـ {title}',
      lost: 'فاز بائع آخر بـ {title}',
    },
  },
  hi: {
    label: 'एजेंट गतिविधि',
    dismiss: 'बंद करें',
    sellerOffered: 'एक विक्रेता के एजेंट ने {amount} USDC की पेशकश की',
    sellerOfferedChecked: 'एक विक्रेता के एजेंट ने आपका रिकॉर्ड जांचने के लिए भुगतान किया, फिर {amount} USDC की पेशकश की',
    sellerAnswered: 'एक विक्रेता के एजेंट ने {amount} USDC पर जवाब दिया',
    sellerAccepted: 'एक विक्रेता के एजेंट ने आपके एजेंट की कीमत मान ली',
    sellerPassed: 'एक विक्रेता के एजेंट ने यह अनुरोध छोड़ दिया',
    scored: 'आपके एजेंट ने {amount} USDC के ऑफ़र को परखा',
    countered: 'आपके एजेंट ने {amount} USDC का काउंटर दिया',
    shortlist: 'आपके एजेंट ने {checked} रिकॉर्ड जांचने के लिए भुगतान किया और {count} विक्रेता चुने',
    matched: 'आपके एजेंट को मैच मिल गया',
    scanned: 'आपके एजेंट ने बाज़ार में विक्रेता खोजे',
    aRequest: 'एक अनुरोध',
    desk: {
      bid: 'आपके एजेंट ने {title} पर {amount} USDC की पेशकश की',
      checked: 'आपके एजेंट ने {title} के खरीदार की जांच के लिए {amount} USDC चुकाए',
      negotiating: 'आपका एजेंट {title} पर मोलभाव कर रहा है',
      passed: 'आपके एजेंट ने {title} छोड़ दिया',
      chosen: '{title} पर एक मैच आपका इंतज़ार कर रहा है',
      won: 'आपने {title} जीता',
      lost: 'किसी और विक्रेता ने {title} जीता',
    },
  },
  sw: {
    label: 'Shughuli za mawakala',
    dismiss: 'Funga',
    sellerOffered: 'Wakala wa muuzaji alitoa ofa ya USDC {amount}',
    sellerOfferedChecked: 'Wakala wa muuzaji alilipa kukagua rekodi yako, kisha akatoa ofa ya USDC {amount}',
    sellerAnswered: 'Wakala wa muuzaji alijibu kwa USDC {amount}',
    sellerAccepted: 'Wakala wa muuzaji alikubali bei ya wakala wako',
    sellerPassed: 'Wakala wa muuzaji aliacha ombi hili',
    scored: 'Wakala wako alipima ofa ya USDC {amount}',
    countered: 'Wakala wako alitoa bei mbadala ya USDC {amount}',
    shortlist: 'Wakala wako alilipa kukagua rekodi {checked} na akaorodhesha wauzaji {count}',
    matched: 'Wakala wako amepata mechi',
    scanned: 'Wakala wako alitafuta wauzaji sokoni',
    aRequest: 'ombi',
    desk: {
      bid: 'Wakala wako alitoa ofa ya USDC {amount} kwa {title}',
      checked: 'Wakala wako alilipa USDC {amount} kumkagua mnunuzi wa {title}',
      negotiating: 'Wakala wako anajadiliana kuhusu {title}',
      passed: 'Wakala wako aliacha {title}',
      chosen: 'Mechi ya {title} inakusubiri',
      won: 'Umeshinda {title}',
      lost: 'Muuzaji mwingine ameshinda {title}',
    },
  },
};
