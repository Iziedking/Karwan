/// The finance desk's apply screen and purchase-order lines (view 48, batch 9h).
export interface FinanceDeskCopy {
  apply: {
    title: string;
    intro: string;
    tenure: string;
    tenureNeed: string;
    days: string;
    stake: string;
    stakeNeed: string;
    stakeFix: string;
    reputation: string;
    reputationNeed: string;
    reputationFix: string;
    met: string;
    notMet: string;
    allMet: string;
    meetAll: string;
    apply: string;
    applying: string;
    notEligible: string;
    pending: string;
    error: string;
  };
  poLines: {
    title: string;
    one: string;
    many: string;
    intro: string;
    youFunded: string;
    financedToYou: string;
    states: {
      outstanding: string;
      repaid: string;
      defaulted: string;
      funded: string;
      released: string;
      reclaimed: string;
    };
    retired: string;
    retiredBody: string;
    dismiss: string;
    dismissing: string;
    seller: string;
    financier: string;
    advance: string;
    outAndBack: string;
    proof: { repay: string; release: string; reclaim: string; fund: string };
    details: string;
  };
}

type Locale = 'en' | 'fr' | 'ar' | 'hi' | 'sw';

export const financeDeskCopy: Record<Locale, FinanceDeskCopy> = {
  en: {
    apply: {
      title: 'Fund trade, earn the spread',
      intro: 'Pay a seller early on an accepted deal and get repaid with your discount when it settles. Your desk opens once you meet these three.',
      tenure: 'Time on Karwan',
      tenureNeed: 'Your account needs a little more history.',
      days: '{days} days',
      stake: 'Deal guarantee',
      stakeNeed: 'Add to your deal guarantee first.',
      stakeFix: 'Add to your deal guarantee',
      reputation: 'Reputation',
      reputationNeed: 'Finish a few deals to reach Early record.',
      reputationFix: 'Trade to build it',
      met: 'Met',
      notMet: 'Not yet',
      allMet: 'All three are met.',
      meetAll: 'Meet all three to apply.',
      apply: 'Apply to fund trade',
      applying: 'Applying',
      notEligible: 'Not eligible yet',
      pending: 'Application received. We will open your desk shortly.',
      error: 'Could not apply. Try again.',
    },
    poLines: {
      title: 'Your purchase order lines',
      one: '1 line',
      many: '{count} lines',
      intro: 'The advance reaches the seller in the payment that funds the line, and the escrow repays you before the seller when the deal settles. Each step links to its payment on Arc.',
      youFunded: 'You funded',
      financedToYou: 'Financed to you',
      states: {
        outstanding: 'Advanced, waiting to settle',
        repaid: 'Repaid',
        defaulted: 'Not repaid',
        funded: 'Funded, waiting for delivery',
        released: 'Delivered, advance sent',
        reclaimed: 'Taken back',
      },
      retired: 'Retired',
      retiredBody: 'This line is on the retired contract. It holds no money and cannot move, so it will not settle on its own.',
      dismiss: 'Dismiss',
      dismissing: 'Dismissing',
      seller: 'Seller {who}',
      financier: 'Financier {who}',
      advance: '{amount} USDC advance',
      outAndBack: '{principal} USDC out, {repay} USDC back',
      proof: { repay: 'Repayment on Arc', release: 'Release on Arc', reclaim: 'Return on Arc', fund: 'Funding on Arc' },
      details: 'Position details',
    },
  },
  fr: {
    apply: {
      title: 'Financez le commerce, gagnez l’écart',
      intro: 'Payez un vendeur en avance sur un accord accepté et soyez remboursé avec votre remise à la clôture. Votre espace s’ouvre dès que vous remplissez ces trois conditions.',
      tenure: 'Ancienneté sur Karwan',
      tenureNeed: 'Votre compte a besoin d’un peu plus d’historique.',
      days: '{days} jours',
      stake: 'Garantie d’accord',
      stakeNeed: 'Alimentez d’abord votre garantie d’accord.',
      stakeFix: 'Alimenter votre garantie d’accord',
      reputation: 'Réputation',
      reputationNeed: 'Terminez quelques accords pour atteindre Premier historique.',
      reputationFix: 'Échangez pour la construire',
      met: 'Rempli',
      notMet: 'Pas encore',
      allMet: 'Les trois sont remplies.',
      meetAll: 'Remplissez les trois pour postuler.',
      apply: 'Postuler pour financer',
      applying: 'Envoi',
      notEligible: 'Pas encore éligible',
      pending: 'Candidature reçue. Nous ouvrirons votre espace sous peu.',
      error: 'Impossible de postuler. Réessayez.',
    },
    poLines: {
      title: 'Vos lignes de bons de commande',
      one: '1 ligne',
      many: '{count} lignes',
      intro: 'L’avance arrive au vendeur dans le paiement qui finance la ligne, et l’escrow vous rembourse avant le vendeur à la clôture de l’accord. Chaque étape renvoie à son paiement sur Arc.',
      youFunded: 'Vous avez financé',
      financedToYou: 'Financé pour vous',
      states: {
        outstanding: 'Avancé, en attente de clôture',
        repaid: 'Remboursé',
        defaulted: 'Non remboursé',
        funded: 'Financé, en attente de livraison',
        released: 'Livré, avance envoyée',
        reclaimed: 'Repris',
      },
      retired: 'Retiré',
      retiredBody: 'Cette ligne est sur l’ancien contrat. Elle ne contient pas d’argent et ne peut pas bouger, elle ne se clôturera donc pas seule.',
      dismiss: 'Masquer',
      dismissing: 'Masquage',
      seller: 'Vendeur {who}',
      financier: 'Financeur {who}',
      advance: 'Avance de {amount} USDC',
      outAndBack: '{principal} USDC versés, {repay} USDC en retour',
      proof: { repay: 'Remboursement sur Arc', release: 'Libération sur Arc', reclaim: 'Retour sur Arc', fund: 'Financement sur Arc' },
      details: 'Détails de la position',
    },
  },
  ar: {
    apply: {
      title: 'موّل التجارة واربح الفارق',
      intro: 'ادفع للبائع مبكرًا على صفقة مقبولة واسترد مالك مع خصمك عند إتمامها. يفتح مكتبك عندما تستوفي هذه الشروط الثلاثة.',
      tenure: 'المدة على Karwan',
      tenureNeed: 'يحتاج حسابك إلى سجل أطول قليلًا.',
      days: '{days} يومًا',
      stake: 'ضمان الصفقة',
      stakeNeed: 'أضف إلى ضمان صفقتك أولًا.',
      stakeFix: 'أضف إلى ضمان صفقتك',
      reputation: 'السمعة',
      reputationNeed: 'أتمم بعض الصفقات لتصل إلى سجل مبكر.',
      reputationFix: 'تاجر لتبنيها',
      met: 'مستوفى',
      notMet: 'ليس بعد',
      allMet: 'الشروط الثلاثة مستوفاة.',
      meetAll: 'استوفِ الشروط الثلاثة لتتقدم.',
      apply: 'تقدّم لتمويل التجارة',
      applying: 'جارٍ التقديم',
      notEligible: 'غير مؤهل بعد',
      pending: 'استلمنا طلبك. سنفتح مكتبك قريبًا.',
      error: 'تعذّر التقديم. حاول مرة أخرى.',
    },
    poLines: {
      title: 'خطوط أوامر الشراء لديك',
      one: 'خط واحد',
      many: '{count} خطوط',
      intro: 'تصل الدفعة المقدمة إلى البائع في الدفعة التي تموّل الخط، ويعيد الضمان لك المال قبل البائع عند إتمام الصفقة. كل خطوة ترتبط بدفعتها على Arc.',
      youFunded: 'موّلتَ',
      financedToYou: 'مموّل لك',
      states: {
        outstanding: 'مدفوع مقدمًا، بانتظار الإتمام',
        repaid: 'مسترد',
        defaulted: 'غير مسترد',
        funded: 'مموّل، بانتظار التسليم',
        released: 'تم التسليم، أُرسلت الدفعة المقدمة',
        reclaimed: 'مُستعاد',
      },
      retired: 'متوقف',
      retiredBody: 'هذا الخط على العقد المتوقف. لا يحمل مالًا ولا يمكنه التحرك، لذلك لن يكتمل من تلقاء نفسه.',
      dismiss: 'إخفاء',
      dismissing: 'جارٍ الإخفاء',
      seller: 'البائع {who}',
      financier: 'المموّل {who}',
      advance: 'دفعة مقدمة {amount} USDC',
      outAndBack: '{principal} USDC خارج، {repay} USDC عائد',
      proof: { repay: 'الاسترداد على Arc', release: 'الإفراج على Arc', reclaim: 'الإرجاع على Arc', fund: 'التمويل على Arc' },
      details: 'تفاصيل المركز',
    },
  },
  hi: {
    apply: {
      title: 'व्यापार को फंड करें, अंतर कमाएँ',
      intro: 'स्वीकृत डील पर विक्रेता को जल्दी भुगतान करें और डील पूरी होने पर अपनी छूट के साथ वापस पाएँ। ये तीनों पूरे होते ही आपका डेस्क खुल जाता है।',
      tenure: 'Karwan पर समय',
      tenureNeed: 'आपके खाते को थोड़ा और इतिहास चाहिए।',
      days: '{days} दिन',
      stake: 'डील गारंटी',
      stakeNeed: 'पहले अपनी डील गारंटी में जोड़ें।',
      stakeFix: 'अपनी डील गारंटी में जोड़ें',
      reputation: 'प्रतिष्ठा',
      reputationNeed: 'शुरुआती रिकॉर्ड तक पहुँचने के लिए कुछ डील पूरी करें।',
      reputationFix: 'व्यापार करके बनाएँ',
      met: 'पूरा',
      notMet: 'अभी नहीं',
      allMet: 'तीनों पूरे हैं।',
      meetAll: 'आवेदन के लिए तीनों पूरे करें।',
      apply: 'व्यापार फंड करने के लिए आवेदन करें',
      applying: 'आवेदन हो रहा है',
      notEligible: 'अभी पात्र नहीं',
      pending: 'आवेदन मिल गया। हम जल्द ही आपका डेस्क खोलेंगे।',
      error: 'आवेदन नहीं हो सका। फिर से कोशिश करें।',
    },
    poLines: {
      title: 'आपकी खरीद ऑर्डर लाइनें',
      one: '1 लाइन',
      many: '{count} लाइनें',
      intro: 'अग्रिम राशि उसी भुगतान में विक्रेता तक पहुँचती है जो लाइन को फंड करता है, और डील पूरी होने पर एस्क्रो विक्रेता से पहले आपको लौटाता है। हर चरण Arc पर अपने भुगतान से जुड़ा है।',
      youFunded: 'आपने फंड किया',
      financedToYou: 'आपके लिए फंड किया गया',
      states: {
        outstanding: 'अग्रिम दिया, पूरा होने का इंतज़ार',
        repaid: 'लौटाया गया',
        defaulted: 'नहीं लौटाया गया',
        funded: 'फंड किया, डिलीवरी का इंतज़ार',
        released: 'डिलीवर हुआ, अग्रिम भेजा गया',
        reclaimed: 'वापस लिया गया',
      },
      retired: 'बंद',
      retiredBody: 'यह लाइन बंद किए गए कॉन्ट्रैक्ट पर है। इसमें पैसा नहीं है और यह आगे नहीं बढ़ सकती, इसलिए यह अपने आप पूरी नहीं होगी।',
      dismiss: 'हटाएँ',
      dismissing: 'हटाया जा रहा है',
      seller: 'विक्रेता {who}',
      financier: 'फाइनेंसर {who}',
      advance: '{amount} USDC अग्रिम',
      outAndBack: '{principal} USDC दिए, {repay} USDC वापस',
      proof: { repay: 'Arc पर वापसी भुगतान', release: 'Arc पर रिलीज़', reclaim: 'Arc पर वापसी', fund: 'Arc पर फंडिंग' },
      details: 'पोज़िशन का विवरण',
    },
  },
  sw: {
    apply: {
      title: 'Fadhili biashara, pata tofauti',
      intro: 'Mlipe muuzaji mapema kwenye mpango uliokubaliwa na urudishiwe pamoja na punguzo lako unapokamilika. Dawati lako hufunguka ukitimiza haya matatu.',
      tenure: 'Muda kwenye Karwan',
      tenureNeed: 'Akaunti yako inahitaji historia kidogo zaidi.',
      days: 'Siku {days}',
      stake: 'Dhamana ya mpango',
      stakeNeed: 'Ongeza kwenye dhamana yako ya mpango kwanza.',
      stakeFix: 'Ongeza kwenye dhamana yako ya mpango',
      reputation: 'Sifa',
      reputationNeed: 'Kamilisha mipango michache kufikia Rekodi ya mwanzo.',
      reputationFix: 'Fanya biashara uijenge',
      met: 'Imetimizwa',
      notMet: 'Bado',
      allMet: 'Yote matatu yametimizwa.',
      meetAll: 'Timiza yote matatu ili kuomba.',
      apply: 'Omba kufadhili biashara',
      applying: 'Inaomba',
      notEligible: 'Bado hustahili',
      pending: 'Ombi limepokelewa. Tutafungua dawati lako hivi karibuni.',
      error: 'Imeshindwa kuomba. Jaribu tena.',
    },
    poLines: {
      title: 'Mistari yako ya oda za ununuzi',
      one: 'Mstari 1',
      many: 'Mistari {count}',
      intro: 'Malipo ya awali humfikia muuzaji katika malipo yanayofadhili mstari, na escrow hukulipa kabla ya muuzaji mpango unapokamilika. Kila hatua inaunganishwa na malipo yake kwenye Arc.',
      youFunded: 'Ulifadhili',
      financedToYou: 'Umefadhiliwa',
      states: {
        outstanding: 'Imelipwa mapema, inasubiri kukamilika',
        repaid: 'Imerudishwa',
        defaulted: 'Haijarudishwa',
        funded: 'Imefadhiliwa, inasubiri uwasilishaji',
        released: 'Imewasilishwa, malipo ya awali yametumwa',
        reclaimed: 'Imerudishwa nyuma',
      },
      retired: 'Imestaafu',
      retiredBody: 'Mstari huu uko kwenye mkataba uliostaafu. Hauna pesa na hauwezi kusonga, kwa hivyo hautakamilika wenyewe.',
      dismiss: 'Ondoa',
      dismissing: 'Inaondoa',
      seller: 'Muuzaji {who}',
      financier: 'Mfadhili {who}',
      advance: 'Malipo ya awali USDC {amount}',
      outAndBack: 'USDC {principal} zimetoka, USDC {repay} zinarudi',
      proof: { repay: 'Malipo ya kurudisha kwenye Arc', release: 'Kutolewa kwenye Arc', reclaim: 'Kurudishwa kwenye Arc', fund: 'Ufadhili kwenye Arc' },
      details: 'Maelezo ya nafasi',
    },
  },
};
