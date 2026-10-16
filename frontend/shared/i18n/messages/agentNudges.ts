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
  world: {
    needed: string;
    why: string;
    waiting: string;
    sellerTitle: string;
    sellerLine: string;
    reasons: { first_deal: string; large_deal: string; fast_new_account: string; flagged_link_before: string };
  };
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
    world: {
      needed: 'Confirm with World ID before your agent funds this deal.',
      why: 'Why: {reason}',
      waiting: 'Waiting for {name} to confirm with World ID. Escrow funds as soon as they do.',
      sellerTitle: 'Confirm with World ID to start',
      sellerLine: 'A buyer chose your offer on {title} at {amount} USDC. Escrow funds as soon as you confirm.',
      reasons: {
        first_deal: 'first deal on Karwan',
        large_deal: 'a deal of 1,000 USDC or more',
        fast_new_account: 'many deals from a new account in one day',
        flagged_link_before: 'a link sent earlier was judged malicious',
      },
    },
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
    world: {
      needed: 'Confirmez avec World ID avant que votre agent ne finance cet accord.',
      why: 'Pourquoi : {reason}',
      waiting: 'En attente de la confirmation World ID de {name}. Le séquestre est financé dès que c’est fait.',
      sellerTitle: 'Confirmez avec World ID pour commencer',
      sellerLine: 'Un acheteur a choisi votre offre sur {title} à {amount} USDC. Le séquestre est financé dès votre confirmation.',
      reasons: {
        first_deal: 'premier accord sur Karwan',
        large_deal: 'un accord de 1 000 USDC ou plus',
        fast_new_account: 'beaucoup d’accords en un jour depuis un nouveau compte',
        flagged_link_before: 'un lien envoyé plus tôt a été jugé malveillant',
      },
    },
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
    world: {
      needed: 'أكّد عبر World ID قبل أن يموّل وكيلك هذه الصفقة.',
      why: 'السبب: {reason}',
      waiting: 'بانتظار تأكيد {name} عبر World ID. يُموَّل الضمان فور التأكيد.',
      sellerTitle: 'أكّد عبر World ID للبدء',
      sellerLine: 'اختار مشترٍ عرضك على {title} مقابل {amount} USDC. يُموَّل الضمان فور تأكيدك.',
      reasons: {
        first_deal: 'أول صفقة على Karwan',
        large_deal: 'صفقة بقيمة 1,000 USDC أو أكثر',
        fast_new_account: 'صفقات كثيرة من حساب جديد في يوم واحد',
        flagged_link_before: 'رابط أُرسل سابقًا صُنّف ضارًا',
      },
    },
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
    world: {
      needed: 'आपका एजेंट इस सौदे को फ़ंड करे, उससे पहले World ID से पुष्टि करें।',
      why: 'कारण: {reason}',
      waiting: '{name} की World ID पुष्टि का इंतज़ार है। पुष्टि होते ही एस्क्रो फ़ंड हो जाएगा।',
      sellerTitle: 'शुरू करने के लिए World ID से पुष्टि करें',
      sellerLine: 'एक खरीदार ने {title} पर आपका ऑफ़र {amount} USDC में चुना। आपकी पुष्टि होते ही एस्क्रो फ़ंड हो जाएगा।',
      reasons: {
        first_deal: 'Karwan पर पहला सौदा',
        large_deal: '1,000 USDC या उससे ज़्यादा का सौदा',
        fast_new_account: 'नए खाते से एक दिन में कई सौदे',
        flagged_link_before: 'पहले भेजा गया एक लिंक हानिकारक पाया गया',
      },
    },
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
    world: {
      needed: 'Thibitisha kwa World ID kabla wakala wako hajafadhili mkataba huu.',
      why: 'Sababu: {reason}',
      waiting: 'Inasubiri {name} athibitishe kwa World ID. Escrow inafadhiliwa mara tu atakapothibitisha.',
      sellerTitle: 'Thibitisha kwa World ID ili kuanza',
      sellerLine: 'Mnunuzi amechagua ofa yako kwa {title} kwa USDC {amount}. Escrow inafadhiliwa mara tu utakapothibitisha.',
      reasons: {
        first_deal: 'mkataba wa kwanza kwenye Karwan',
        large_deal: 'mkataba wa USDC 1,000 au zaidi',
        fast_new_account: 'mikataba mingi kutoka akaunti mpya kwa siku moja',
        flagged_link_before: 'kiungo kilichotumwa awali kilionekana kuwa hatari',
      },
    },
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
