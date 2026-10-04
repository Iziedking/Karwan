export interface PassportCopy {
  since: string;
  standing: string;
  scoreOf: string;
  breadthNoteOne: string;
  breadthNote: string;
  heldDealsOne: string;
  heldDeals: string;
  record: string;
  settled: string;
  completed: string;
  completedOf: string;
  disputes: string;
  volume: string;
  counterparties: string;
  stake: string;
  lastDeal: string;
  skills: string;
  how: string;
  proof: string;
}

const en: PassportCopy = {
  since: 'On Karwan since {date}',
  standing: 'Standing',
  scoreOf: 'Score {score} of 1000',
  breadthNoteOne: "Your deals so far are with 1 person, so they count for {pct}% of their full value. Each new person raises the score.",
  breadthNote: "Your deals so far are with {n} different people, so they count for {pct}% of their full value. Each new person raises the score.",
  heldDealsOne: 'Held at {tier} until 1 more settled deal.',
  heldDeals: 'Held at {tier} until {n} more settled deals.',
  record: 'Trade record',
  settled: 'Deals settled',
  completed: 'Completed',
  completedOf: '{done} of {total}',
  disputes: 'Disputes',
  volume: 'Volume',
  counterparties: 'Different people traded with',
  stake: 'Stake held as a reserve',
  lastDeal: 'Last deal',
  skills: 'Verified skills',
  how: 'How this is worked out',
  proof: 'Proof on Arc',
};

const fr: PassportCopy = {
  since: 'Sur Karwan depuis le {date}',
  standing: 'Niveau',
  scoreOf: 'Score {score} sur 1000',
  breadthNoteOne: "Vos transactions sont avec 1 personne, elles comptent donc pour {pct} % de leur valeur. Chaque nouvelle personne fait monter le score.",
  breadthNote: "Vos transactions sont avec {n} personnes différentes, elles comptent donc pour {pct} % de leur valeur. Chaque nouvelle personne fait monter le score.",
  heldDealsOne: 'Maintenu à {tier} jusqu’à 1 transaction réglée de plus.',
  heldDeals: 'Maintenu à {tier} jusqu’à {n} transactions réglées de plus.',
  record: 'Historique',
  settled: 'Transactions réglées',
  completed: 'Terminées',
  completedOf: '{done} sur {total}',
  disputes: 'Litiges',
  volume: 'Volume',
  counterparties: 'Personnes différentes',
  stake: 'Garantie déposée en réserve',
  lastDeal: 'Dernière transaction',
  skills: 'Compétences vérifiées',
  how: 'Comment il est calculé',
  proof: 'Preuve sur Arc',
};

const ar: PassportCopy = {
  since: 'على Karwan منذ {date}',
  standing: 'المستوى',
  scoreOf: 'النتيجة {score} من 1000',
  breadthNoteOne: "صفقاتك حتى الآن مع شخص واحد، لذا تُحتسب بنسبة {pct}% من قيمتها الكاملة. كل شخص جديد يرفع النتيجة.",
  breadthNote: "صفقاتك حتى الآن مع {n} أشخاص مختلفين، لذا تُحتسب بنسبة {pct}% من قيمتها الكاملة. كل شخص جديد يرفع النتيجة.",
  heldDealsOne: 'ثابت عند {tier} حتى صفقة مسوّاة واحدة أخرى.',
  heldDeals: 'ثابت عند {tier} حتى {n} صفقات مسوّاة أخرى.',
  record: 'سجل التداول',
  settled: 'الصفقات المسوّاة',
  completed: 'المكتملة',
  completedOf: '{done} من {total}',
  disputes: 'النزاعات',
  volume: 'الحجم',
  counterparties: 'أشخاص مختلفون تعامل معهم',
  stake: 'رهن محتفظ به كاحتياطي',
  lastDeal: 'آخر صفقة',
  skills: 'المهارات الموثقة',
  how: 'كيف يُحسب',
  proof: 'إثبات على Arc',
};

const hi: PassportCopy = {
  since: '{date} से Karwan पर',
  standing: 'स्तर',
  scoreOf: 'स्कोर 1000 में से {score}',
  breadthNoteOne: "अब तक आपके सौदे 1 व्यक्ति से हैं, इसलिए वे अपने पूरे मूल्य का {pct}% गिने जाते हैं। हर नया व्यक्ति स्कोर बढ़ाता है।",
  breadthNote: "अब तक आपके सौदे {n} अलग-अलग लोगों से हैं, इसलिए वे अपने पूरे मूल्य का {pct}% गिने जाते हैं। हर नया व्यक्ति स्कोर बढ़ाता है।",
  heldDealsOne: '1 और पूरे सौदे तक {tier} पर रुका है।',
  heldDeals: '{n} और पूरे सौदों तक {tier} पर रुका है।',
  record: 'व्यापार रिकॉर्ड',
  settled: 'पूरे हुए सौदे',
  completed: 'सफल',
  completedOf: '{total} में से {done}',
  disputes: 'विवाद',
  volume: 'कुल राशि',
  counterparties: 'अलग-अलग लोग जिनसे सौदा हुआ',
  stake: 'रिज़र्व के रूप में रखा स्टेक',
  lastDeal: 'पिछला सौदा',
  skills: 'सत्यापित कौशल',
  how: 'यह कैसे गिना जाता है',
  proof: 'Arc पर प्रमाण',
};

const sw: PassportCopy = {
  since: 'Kwenye Karwan tangu {date}',
  standing: 'Kiwango',
  scoreOf: 'Alama {score} kati ya 1000',
  breadthNoteOne: "Mikataba yako hadi sasa ni na mtu 1, kwa hivyo inahesabiwa {pct}% ya thamani yake kamili. Kila mtu mpya huongeza alama.",
  breadthNote: "Mikataba yako hadi sasa ni na watu {n} tofauti, kwa hivyo inahesabiwa {pct}% ya thamani yake kamili. Kila mtu mpya huongeza alama.",
  heldDealsOne: 'Kimesimama kwenye {tier} hadi mkataba 1 zaidi ukamilike.',
  heldDeals: 'Kimesimama kwenye {tier} hadi mikataba {n} zaidi ikamilike.',
  record: 'Rekodi ya biashara',
  settled: 'Mikataba iliyokamilika',
  completed: 'Iliyofanikiwa',
  completedOf: '{done} kati ya {total}',
  disputes: 'Migogoro',
  volume: 'Kiasi',
  counterparties: 'Watu tofauti uliofanya nao biashara',
  stake: 'Dhamana iliyohifadhiwa kama akiba',
  lastDeal: 'Mkataba wa mwisho',
  skills: 'Ujuzi uliothibitishwa',
  how: 'Inavyohesabiwa',
  proof: 'Uthibitisho kwenye Arc',
};

export const passportCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', PassportCopy> = { en, ar, fr, hi, sw };
