/// The shortlist a buyer chooses from: who the agents found, verified or not,
/// each person's tier and reasons, and the one the agent recommends. {n},
/// {amount} and {name} are filled at render.
export interface ShortlistCopy {
  title: string;
  note: string;
  /// The ranking starts folded under the count (owner, 3 Nov 2026).
  show: string;
  hide: string;
  countOne: string;
  countMany: string;
  /// The agent's order: {n} is the place, the first choosable offer inside the request is its pick.
  pick: string;
  rank: string;
  close: string;
  /// The offer sheet's fact rows and why the agent placed it (view 48).
  recordLabel: string;
  numbersLabel: string;
  whyPlace: string;
  recommended: string;
  verified: string;
  notVerified: string;
  days: string;
  dayOne: string;
  asked: string;
  completedOne: string;
  completedMany: string;
  onTime: string;
  disputesLostOne: string;
  disputesLostMany: string;
  noDeals: string;
  recordChecked: string;
  checkedCost: string;
  checkedCostOne: string;
  viewProfile: string;
  choose: string;
  unavailable: string;
  isNew: string;
  negotiating: string;
  noneYet: string;
  noneVerified: string;
  noneInBudget: string;
  unverifiedWarning: string;
  outsideRequest: string;
  mustLink: string;
  longerOne: string;
  longerMany: string;
  reasons: { best_fit: string; verified: string; within_budget: string; lower_price: string; on_time_record: string; nearby: string };
  tiers: { NEW: string; COLD: string; ESTABLISHED: string; STRONG: string; ELITE: string };
}

export const shortlistCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', ShortlistCopy> = {
  en: {
    title: 'Your shortlist',
    note: 'Ranked by your agent. Tap one to see more.',
    show: 'Show your shortlist',
    hide: 'Hide',
    countOne: '1 seller offered',
    countMany: '{n} sellers offered',
    pick: 'Agent’s pick',
    rank: '#{n}',
    close: 'Close',
    recordLabel: 'Record',
    numbersLabel: 'Deals',
    whyPlace: 'Why your agent placed {name} here',
    recommended: 'Recommended',
    verified: 'Verified',
    notVerified: 'Not verified',
    days: '{n} days',
    dayOne: '1 day',
    asked: 'asked {amount}',
    completedOne: '1 completed deal',
    completedMany: '{n} completed deals',
    onTime: '{n}% on time',
    disputesLostOne: '1 dispute lost',
    disputesLostMany: '{n} disputes lost',
    noDeals: 'No completed deals yet',
    recordChecked: 'Record checked',
    checkedCost: 'Your agent checked {count} records · {amount} USDC',
    checkedCostOne: 'Your agent checked 1 record · {amount} USDC',
    viewProfile: 'View profile',
    choose: 'Choose',
    unavailable: 'No longer available',
    isNew: 'New',
    negotiating: 'Your agent is agreeing the price',
    noneYet: 'No one has offered yet. Your agent keeps looking until the request closes.',
    noneVerified: 'None of these sellers is verified yet.',
    noneInBudget: 'No verified seller is within your budget yet.',
    unverifiedWarning: "{name} is not verified. Review the available record before accepting. Payment follows the agreed release rules.",
    outsideRequest: 'Above your budget, outside your request',
    mustLink: 'Not linked to their account yet. You can choose them once they link it.',
    longerOne: 'Needs 1 day longer than your request',
    longerMany: 'Needs {n} days longer than your request',
    reasons: {
      best_fit: 'Best skill match',
      verified: 'Verified',
      within_budget: 'Within budget',
      lower_price: 'Lower price',
      on_time_record: 'Delivers on time',
      nearby: 'Near you',
    },
    tiers: { NEW: 'New', COLD: 'Building', ESTABLISHED: 'Established', STRONG: 'Strong', ELITE: 'Elite' },
  },
  fr: {
    title: 'Votre sélection',
    note: 'Classées par votre agent. Touchez-en une pour en voir plus.',
    show: 'Voir votre sélection',
    hide: 'Masquer',
    countOne: '1 vendeur a fait une offre',
    countMany: '{n} vendeurs ont fait une offre',
    pick: 'Choix de votre agent',
    rank: '#{n}',
    close: 'Fermer',
    recordLabel: 'Historique',
    numbersLabel: 'Accords',
    whyPlace: 'Pourquoi votre agent a placé {name} ici',
    recommended: 'Recommandé',
    verified: 'Vérifié',
    notVerified: 'Non vérifié',
    days: '{n} jours',
    dayOne: '1 jour',
    asked: 'demandé {amount}',
    completedOne: '1 affaire terminée',
    completedMany: '{n} affaires terminées',
    onTime: '{n} % dans les délais',
    disputesLostOne: '1 litige perdu',
    disputesLostMany: '{n} litiges perdus',
    noDeals: 'Aucune affaire terminée pour l’instant',
    recordChecked: 'Dossier vérifié',
    checkedCost: 'Votre agent a vérifié {count} dossiers · {amount} USDC',
    checkedCostOne: 'Votre agent a vérifié 1 dossier · {amount} USDC',
    viewProfile: 'Voir le profil',
    choose: 'Choisir',
    unavailable: 'Plus disponible',
    isNew: 'Nouveau',
    negotiating: 'Votre agent fixe le prix',
    noneYet: 'Personne n’a encore fait d’offre. Votre agent continue jusqu’à la clôture de la demande.',
    noneVerified: 'Aucun de ces vendeurs n’est encore vérifié.',
    noneInBudget: 'Aucun vendeur vérifié ne tient encore dans votre budget.',
    unverifiedWarning: "{name} n’est pas vérifié. Consultez son historique disponible avant d’accepter. Les règles de versement convenues s’appliquent.",
    outsideRequest: 'Au-dessus de votre budget, hors de votre demande',
    mustLink: 'Pas encore relié à son compte. Vous pourrez le choisir une fois relié.',
    longerOne: 'Demande 1 jour de plus que votre demande',
    longerMany: 'Demande {n} jours de plus que votre demande',
    reasons: {
      best_fit: 'Meilleure correspondance',
      verified: 'Vérifié',
      within_budget: 'Dans le budget',
      lower_price: 'Prix plus bas',
      on_time_record: 'Livre dans les délais',
      nearby: 'Près de chez vous',
    },
    tiers: { NEW: 'Nouveau', COLD: 'En progression', ESTABLISHED: 'Établi', STRONG: 'Solide', ELITE: 'Élite' },
  },
  ar: {
    title: 'قائمتك المختصرة',
    note: 'رتّبها وكيلك. اضغط على أي عرض لترى المزيد.',
    show: 'اعرض قائمتك المختصرة',
    hide: 'إخفاء',
    countOne: 'بائع واحد قدّم عرضًا',
    countMany: '{n} بائعين قدّموا عروضًا',
    pick: 'اختيار وكيلك',
    rank: '#{n}',
    close: 'إغلاق',
    recordLabel: 'السجل',
    numbersLabel: 'الصفقات',
    whyPlace: 'لماذا وضع وكيلك {name} هنا',
    recommended: 'موصى به',
    verified: 'موثّق',
    notVerified: 'غير موثّق',
    days: '{n} أيام',
    dayOne: 'يوم واحد',
    asked: 'الطلب الأول {amount}',
    completedOne: 'صفقة مكتملة واحدة',
    completedMany: '{n} صفقات مكتملة',
    onTime: '{n}% في الموعد',
    disputesLostOne: 'نزاع واحد خاسر',
    disputesLostMany: '{n} نزاعات خاسرة',
    noDeals: 'لا صفقات مكتملة بعد',
    recordChecked: 'تم فحص السجل',
    checkedCost: 'فحص وكيلك {count} سجلات · {amount} USDC',
    checkedCostOne: 'فحص وكيلك سجلاً واحداً · {amount} USDC',
    viewProfile: 'عرض الملف',
    choose: 'اختيار',
    unavailable: 'لم يعد متاحًا',
    isNew: 'جديد',
    negotiating: 'وكيلك يتفق على السعر',
    noneYet: 'لم يقدّم أحد عرضًا بعد. يواصل وكيلك البحث حتى يُغلق الطلب.',
    noneVerified: 'لا أحد من هؤلاء البائعين موثّق بعد.',
    noneInBudget: 'لا يوجد بائع موثّق ضمن ميزانيتك بعد.',
    unverifiedWarning: "لم يتم التحقق من {name}. راجع السجل المتاح قبل القبول. تسري قواعد الصرف المتفق عليها.",
    outsideRequest: 'أعلى من ميزانيتك، خارج طلبك',
    mustLink: 'لم يربط وكيله بحسابه بعد. يمكنك اختياره بعد أن يربطه.',
    longerOne: 'يحتاج يومًا واحدًا أكثر من طلبك',
    longerMany: 'يحتاج {n} أيام أكثر من طلبك',
    reasons: {
      best_fit: 'أفضل تطابق في المهارة',
      verified: 'موثّق',
      within_budget: 'ضمن الميزانية',
      lower_price: 'سعر أقل',
      on_time_record: 'يسلّم في الموعد',
      nearby: 'قريب منك',
    },
    tiers: { NEW: 'جديد', COLD: 'في البداية', ESTABLISHED: 'راسخ', STRONG: 'قوي', ELITE: 'نخبة' },
  },
  hi: {
    title: 'आपकी शॉर्टलिस्ट',
    note: 'आपके एजेंट ने इन्हें क्रम में रखा है। ज़्यादा देखने के लिए किसी पर टैप करें।',
    show: 'अपनी शॉर्टलिस्ट देखें',
    hide: 'छिपाएँ',
    countOne: '1 विक्रेता ने ऑफ़र दिया',
    countMany: '{n} विक्रेताओं ने ऑफ़र दिया',
    pick: 'एजेंट की पसंद',
    rank: '#{n}',
    close: 'बंद करें',
    recordLabel: 'रिकॉर्ड',
    numbersLabel: 'सौदे',
    whyPlace: 'आपके एजेंट ने {name} को यहाँ क्यों रखा',
    recommended: 'सुझाया गया',
    verified: 'सत्यापित',
    notVerified: 'सत्यापित नहीं',
    days: '{n} दिन',
    dayOne: '1 दिन',
    asked: 'पहली मांग {amount}',
    completedOne: '1 पूरा सौदा',
    completedMany: '{n} पूरे सौदे',
    onTime: '{n}% समय पर',
    disputesLostOne: '1 विवाद हारा',
    disputesLostMany: '{n} विवाद हारे',
    noDeals: 'अभी कोई पूरा सौदा नहीं',
    recordChecked: 'रिकॉर्ड जांचा गया',
    checkedCost: 'आपके एजेंट ने {count} रिकॉर्ड जांचे · {amount} USDC',
    checkedCostOne: 'आपके एजेंट ने 1 रिकॉर्ड जांचा · {amount} USDC',
    viewProfile: 'प्रोफ़ाइल देखें',
    choose: 'चुनें',
    unavailable: 'अब उपलब्ध नहीं',
    isNew: 'नया',
    negotiating: 'आपका एजेंट कीमत तय कर रहा है',
    noneYet: 'अभी किसी ने ऑफ़र नहीं दिया। अनुरोध बंद होने तक आपका एजेंट खोजता रहेगा।',
    noneVerified: 'इनमें से कोई विक्रेता अभी सत्यापित नहीं है।',
    noneInBudget: 'अभी कोई सत्यापित विक्रेता आपके बजट में नहीं है।',
    unverifiedWarning: "{name} सत्यापित नहीं हैं। स्वीकार करने से पहले उपलब्ध रिकॉर्ड देखें। भुगतान के सहमत नियम लागू होते हैं।",
    outsideRequest: 'आपके बजट से ऊपर, आपके अनुरोध से बाहर',
    mustLink: 'अभी तक उनके खाते से जुड़ा नहीं है। जुड़ने के बाद आप उन्हें चुन सकते हैं।',
    longerOne: 'आपके अनुरोध से 1 दिन ज़्यादा चाहिए',
    longerMany: 'आपके अनुरोध से {n} दिन ज़्यादा चाहिए',
    reasons: {
      best_fit: 'सबसे अच्छा कौशल मेल',
      verified: 'सत्यापित',
      within_budget: 'बजट में',
      lower_price: 'कम कीमत',
      on_time_record: 'समय पर डिलीवरी',
      nearby: 'आपके पास',
    },
    tiers: { NEW: 'नया', COLD: 'बढ़ रहा', ESTABLISHED: 'स्थापित', STRONG: 'मज़बूत', ELITE: 'उत्कृष्ट' },
  },
  sw: {
    title: 'Orodha yako fupi',
    note: 'Zimepangwa na wakala wako. Gusa moja kuona zaidi.',
    show: 'Onyesha orodha yako fupi',
    hide: 'Ficha',
    countOne: 'Muuzaji 1 ametoa ofa',
    countMany: 'Wauzaji {n} wametoa ofa',
    pick: 'Chaguo la wakala wako',
    rank: '#{n}',
    close: 'Funga',
    recordLabel: 'Rekodi',
    numbersLabel: 'Mikataba',
    whyPlace: 'Kwa nini wakala wako alimweka {name} hapa',
    recommended: 'Anapendekezwa',
    verified: 'Amethibitishwa',
    notVerified: 'Hajathibitishwa',
    days: 'siku {n}',
    dayOne: 'siku 1',
    asked: 'aliomba {amount}',
    completedOne: 'mpango 1 uliokamilika',
    completedMany: 'mipango {n} iliyokamilika',
    onTime: '{n}% kwa wakati',
    disputesLostOne: 'mzozo 1 alioshindwa',
    disputesLostMany: 'mizozo {n} aliyoshindwa',
    noDeals: 'Bado hakuna mpango uliokamilika',
    recordChecked: 'Rekodi imekaguliwa',
    checkedCost: 'Wakala wako alikagua rekodi {count} · {amount} USDC',
    checkedCostOne: 'Wakala wako alikagua rekodi 1 · {amount} USDC',
    viewProfile: 'Tazama wasifu',
    choose: 'Chagua',
    unavailable: 'Haipatikani tena',
    isNew: 'Mpya',
    negotiating: 'Wakala wako anakubaliana bei',
    noneYet: 'Bado hakuna aliyetoa ofa. Wakala wako anaendelea kutafuta hadi ombi lifungwe.',
    noneVerified: 'Hakuna kati ya wauzaji hawa aliyethibitishwa bado.',
    noneInBudget: 'Bado hakuna muuzaji aliyethibitishwa ndani ya bajeti yako.',
    unverifiedWarning: "{name} hajathibitishwa. Kagua historia iliyopo kabla ya kukubali. Malipo yanafuata kanuni zilizokubaliwa.",
    outsideRequest: 'Juu ya bajeti yako, nje ya ombi lako',
    mustLink: 'Bado hajaunganishwa na akaunti yake. Unaweza kumchagua akishaunganisha.',
    longerOne: 'Anahitaji siku 1 zaidi ya ombi lako',
    longerMany: 'Anahitaji siku {n} zaidi ya ombi lako',
    reasons: {
      best_fit: 'Ujuzi unaolingana zaidi',
      verified: 'Amethibitishwa',
      within_budget: 'Ndani ya bajeti',
      lower_price: 'Bei nafuu zaidi',
      on_time_record: 'Hukabidhi kwa wakati',
      nearby: 'Karibu nawe',
    },
    tiers: { NEW: 'Mpya', COLD: 'Anakua', ESTABLISHED: 'Imara', STRONG: 'Madhubuti', ELITE: 'Bora kabisa' },
  },
};
