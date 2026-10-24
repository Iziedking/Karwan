/// The shortlist a buyer chooses from: who the agents found, verified or not,
/// each person's tier and reasons, and the one the agent recommends. {n},
/// {amount} and {name} are filled at render.
export interface ShortlistCopy {
  title: string;
  note: string;
  /// The folded row: {n} offers and the lowest {amount}, then Show or Hide.
  foldOne: string;
  fold: string;
  show: string;
  hide: string;
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
  reasons: { best_fit: string; verified: string; within_budget: string; lower_price: string; on_time_record: string; nearby: string };
  tiers: { NEW: string; COLD: string; ESTABLISHED: string; STRONG: string; ELITE: string };
}

export const shortlistCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', ShortlistCopy> = {
  en: {
    title: 'Your shortlist',
    note: 'Your agent checked each record and recommends one. You choose.',
    foldOne: '1 offer, {amount} USDC',
    fold: '{n} offers, from {amount} USDC',
    show: 'Show',
    hide: 'Hide',
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
    unverifiedWarning: '{name} is not verified. Karwan has not checked their identity or past work. Your money stays in escrow until you release it.',
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
    note: 'Votre agent a vérifié chaque dossier et en recommande un. Vous choisissez.',
    foldOne: '1 offre, {amount} USDC',
    fold: '{n} offres, à partir de {amount} USDC',
    show: 'Afficher',
    hide: 'Masquer',
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
    unverifiedWarning: '{name} n’est pas vérifié. Karwan n’a contrôlé ni son identité ni ses travaux passés. Votre argent reste en séquestre jusqu’à ce que vous le libériez.',
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
    note: 'راجع وكيلك سجل كل شخص ويوصي بواحد. القرار لك.',
    foldOne: 'عرض واحد، {amount} USDC',
    fold: '{n} عروض، ابتداءً من {amount} USDC',
    show: 'عرض',
    hide: 'إخفاء',
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
    unverifiedWarning: '{name} غير موثّق. لم تتحقق كاروان من هويته أو أعماله السابقة. تبقى أموالك في الضمان حتى تحررها.',
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
    note: 'आपके एजेंट ने हर रिकॉर्ड जांचा और एक की सिफ़ारिश की है। फ़ैसला आपका है।',
    foldOne: '1 ऑफ़र, {amount} USDC',
    fold: '{n} ऑफ़र, {amount} USDC से',
    show: 'दिखाएँ',
    hide: 'छिपाएँ',
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
    unverifiedWarning: '{name} सत्यापित नहीं है। Karwan ने उनकी पहचान या पिछला काम नहीं जांचा है। जब तक आप जारी नहीं करते, आपका पैसा एस्क्रो में रहता है।',
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
    note: 'Wakala wako amekagua rekodi ya kila mmoja na anapendekeza mmoja. Wewe ndiye unachagua.',
    foldOne: 'Ofa 1, {amount} USDC',
    fold: 'Ofa {n}, kuanzia {amount} USDC',
    show: 'Onyesha',
    hide: 'Ficha',
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
    unverifiedWarning: '{name} hajathibitishwa. Karwan haijakagua utambulisho wake wala kazi zake za awali. Pesa zako zinabaki kwenye escrow hadi utakapozitoa.',
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
