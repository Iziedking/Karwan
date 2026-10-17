/// Settings for public deal statements: publish (on by default), earlier deals
/// (off by default) and removing them all. {n} is filled at render.
export interface AttestationSettingsCopy {
  publishDeals: string;
  publishDealsNote: string;
  publishHistory: string;
  publishHistoryNote: string;
  removeDeals: string;
  removeTitle: string;
  removeConsequence: string;
  removeConfirm: string;
  removed: string;
  removedOne: string;
  removedNone: string;
  failed: string;
}

type Locale = 'en' | 'fr' | 'ar' | 'hi' | 'sw';

export const attestationSettingsCopy: Record<Locale, AttestationSettingsCopy> = {
  en: {
    publishDeals: 'Publish my settled deals',
    publishDealsNote: 'Each deal you settle from now on leaves a signed statement other apps can check: your role, the date and an amount range. Never the other person or the exact amount.',
    publishHistory: 'Publish my earlier deals too',
    publishHistoryNote: 'Adds statements for deals you settled before this started.',
    removeDeals: 'Remove my published deals',
    removeTitle: 'Remove your published deals?',
    removeConsequence: 'Every statement about your deals is marked removed, and no new ones are published. Apps that already checked them see they were removed.',
    removeConfirm: 'Remove them',
    removed: 'Removed {n} statements.',
    removedOne: "Removed 1 statement.",
    removedNone: "Nothing was published, so nothing to remove.",
    failed: 'That did not go through. Try again.',
  },
  fr: {
    publishDeals: 'Publier mes transactions réglées',
    publishDealsNote: "Chaque transaction que vous réglez désormais laisse une déclaration signée que d'autres applications peuvent vérifier : votre rôle, la date et une fourchette de montant. Jamais l'autre personne ni le montant exact.",
    publishHistory: 'Publier aussi mes transactions plus anciennes',
    publishHistoryNote: 'Ajoute des déclarations pour les transactions réglées avant le lancement.',
    removeDeals: 'Retirer mes transactions publiées',
    removeTitle: 'Retirer vos transactions publiées ?',
    removeConsequence: "Chaque déclaration sur vos transactions est marquée comme retirée, et aucune nouvelle n'est publiée. Les applications qui les ont déjà vérifiées voient qu'elles ont été retirées.",
    removeConfirm: 'Les retirer',
    removed: '{n} déclarations retirées.',
    removedOne: "1 déclaration retirée.",
    removedNone: "Rien n'était publié, donc rien à retirer.",
    failed: "Ça n'a pas abouti. Réessayez.",
  },
  ar: {
    publishDeals: 'انشر صفقاتي المكتملة',
    publishDealsNote: 'كل صفقة تُكملها من الآن تترك بيانًا موقّعًا يمكن للتطبيقات الأخرى التحقق منه: دورك والتاريخ ونطاق المبلغ. لا يظهر الطرف الآخر أو المبلغ الدقيق أبدًا.',
    publishHistory: 'انشر صفقاتي السابقة أيضًا',
    publishHistoryNote: 'يضيف بيانات للصفقات التي أكملتها قبل بدء هذه الميزة.',
    removeDeals: 'أزل صفقاتي المنشورة',
    removeTitle: 'إزالة صفقاتك المنشورة؟',
    removeConsequence: 'يُعلَّم كل بيان عن صفقاتك على أنه أُزيل، ولا يُنشر أي بيان جديد. التطبيقات التي تحققت منها سترى أنها أُزيلت.',
    removeConfirm: 'أزلها',
    removed: 'أُزيل {n} من البيانات.',
    removedOne: "أُزيل بيان واحد.",
    removedNone: "لم يُنشر شيء، فلا يوجد ما يُزال.",
    failed: 'لم تكتمل العملية. حاول مرة أخرى.',
  },
  hi: {
    publishDeals: 'मेरे पूरे हुए सौदे प्रकाशित करें',
    publishDealsNote: 'अब से आप जो भी सौदा पूरा करेंगे, उसका एक हस्ताक्षरित विवरण बनेगा जिसे दूसरे ऐप जांच सकते हैं: आपकी भूमिका, तारीख और रकम की सीमा। दूसरा व्यक्ति या सटीक रकम कभी नहीं।',
    publishHistory: 'मेरे पुराने सौदे भी प्रकाशित करें',
    publishHistoryNote: 'इसके शुरू होने से पहले पूरे हुए सौदों के विवरण जोड़ता है।',
    removeDeals: 'मेरे प्रकाशित सौदे हटाएं',
    removeTitle: 'अपने प्रकाशित सौदे हटाएं?',
    removeConsequence: 'आपके सौदों का हर विवरण हटाया गया चिह्नित होता है, और कोई नया प्रकाशित नहीं होता। जिन ऐप ने इन्हें पहले जांचा है, वे देखेंगे कि ये हटाए गए।',
    removeConfirm: 'इन्हें हटाएं',
    removed: '{n} विवरण हटाए गए।',
    removedOne: "1 विवरण हटाया गया।",
    removedNone: "कुछ प्रकाशित नहीं था, इसलिए हटाने को कुछ नहीं।",
    failed: 'यह पूरा नहीं हुआ। फिर से कोशिश करें।',
  },
  sw: {
    publishDeals: 'Chapisha mikataba yangu iliyokamilika',
    publishDealsNote: 'Kila mkataba utakaokamilisha kuanzia sasa unaacha taarifa iliyosainiwa ambayo programu nyingine zinaweza kukagua: nafasi yako, tarehe na kiwango cha kiasi. Kamwe si mtu mwingine wala kiasi kamili.',
    publishHistory: 'Chapisha pia mikataba yangu ya awali',
    publishHistoryNote: 'Huongeza taarifa za mikataba uliyokamilisha kabla ya hili kuanza.',
    removeDeals: 'Ondoa mikataba yangu iliyochapishwa',
    removeTitle: 'Ondoa mikataba yako iliyochapishwa?',
    removeConsequence: 'Kila taarifa kuhusu mikataba yako inawekwa alama ya kuondolewa, na hakuna mpya inayochapishwa. Programu zilizozikagua tayari zinaona zimeondolewa.',
    removeConfirm: 'Ziondoe',
    removed: 'Taarifa {n} zimeondolewa.',
    removedOne: "Taarifa 1 imeondolewa.",
    removedNone: "Hakuna kilichochapishwa, kwa hivyo hakuna cha kuondoa.",
    failed: 'Haikufanikiwa. Jaribu tena.',
  },
};
