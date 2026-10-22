/// "What Karwan remembers" in Settings (architecture view 20).

export interface AssistantMemoryCopy {
  group: string;
  toggle: string;
  toggleNote: string;
  notes: string;
  /// {n} notes kept.
  notesCount: string;
  none: string;
  sheetTitle: string;
  sheetBody: string;
  /// Accessible name of a note's delete button: {text}.
  deleteNote: string;
  forgetAll: string;
  forgetAllConfirm: string;
  forgetAllYes: string;
  keep: string;
  failed: string;
}

export const assistantMemoryCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', AssistantMemoryCopy> = {
  en: {
    group: 'What Karwan remembers',
    toggle: 'Remember our conversations',
    toggleNote: 'Your assistant keeps short notes, on the web and in Telegram, so it can pick up where you left off.',
    notes: 'Notes',
    notesCount: '{n} kept',
    none: 'Nothing remembered yet.',
    sheetTitle: 'What Karwan remembers',
    sheetBody: 'Only you can see these notes. Delete any of them. Passwords, codes, card, bank and phone numbers are never kept.',
    deleteNote: 'Delete note: {text}',
    forgetAll: 'Forget everything',
    forgetAllConfirm: 'Delete every note? Your saved conversations stay.',
    forgetAllYes: 'Delete every note',
    keep: 'Keep them',
    failed: "That didn't save. Try again in a moment.",
  },
  fr: {
    group: 'Ce dont Karwan se souvient',
    toggle: 'Se souvenir de nos conversations',
    toggleNote: "Votre assistant garde de courtes notes, sur le web et dans Telegram, pour reprendre là où vous vous êtes arrêté.",
    notes: 'Notes',
    notesCount: '{n} gardées',
    none: "Rien n'est encore mémorisé.",
    sheetTitle: 'Ce dont Karwan se souvient',
    sheetBody: 'Vous seul voyez ces notes. Supprimez celles que vous voulez. Les mots de passe, codes, numéros de carte, de compte et de téléphone ne sont jamais gardés.',
    deleteNote: 'Supprimer la note : {text}',
    forgetAll: 'Tout oublier',
    forgetAllConfirm: 'Supprimer toutes les notes ? Vos conversations enregistrées restent.',
    forgetAllYes: 'Supprimer toutes les notes',
    keep: 'Les garder',
    failed: "Ce n'a pas été enregistré. Réessayez dans un instant.",
  },
  ar: {
    group: 'ما يتذكره Karwan',
    toggle: 'تذكّر محادثاتنا',
    toggleNote: 'يحتفظ مساعدك بملاحظات قصيرة، على الويب وفي Telegram، ليكمل من حيث توقفت.',
    notes: 'الملاحظات',
    notesCount: '{n} محفوظة',
    none: 'لا شيء محفوظ بعد.',
    sheetTitle: 'ما يتذكره Karwan',
    sheetBody: 'أنت وحدك ترى هذه الملاحظات. احذف أيًا منها. لا تُحفظ أبدًا كلمات المرور أو الرموز أو أرقام البطاقات والحسابات والهواتف.',
    deleteNote: 'احذف الملاحظة: {text}',
    forgetAll: 'انسَ كل شيء',
    forgetAllConfirm: 'حذف كل الملاحظات؟ تبقى محادثاتك المحفوظة.',
    forgetAllYes: 'احذف كل الملاحظات',
    keep: 'أبقِها',
    failed: 'لم يُحفظ. حاول مرة أخرى بعد قليل.',
  },
  hi: {
    group: 'Karwan को क्या याद है',
    toggle: 'हमारी बातचीत याद रखें',
    toggleNote: 'आपका सहायक वेब और Telegram पर छोटे नोट रखता है, ताकि जहाँ बात छूटी थी वहीं से आगे बढ़ सके।',
    notes: 'नोट',
    notesCount: '{n} रखे गए',
    none: 'अभी कुछ याद नहीं रखा गया है।',
    sheetTitle: 'Karwan को क्या याद है',
    sheetBody: 'ये नोट सिर्फ़ आप देख सकते हैं। कोई भी नोट हटा दें। पासवर्ड, कोड, कार्ड, बैंक और फ़ोन नंबर कभी नहीं रखे जाते।',
    deleteNote: 'नोट हटाएँ: {text}',
    forgetAll: 'सब भूल जाएँ',
    forgetAllConfirm: 'सारे नोट हटाएँ? आपकी सहेजी गई बातचीत बनी रहेगी।',
    forgetAllYes: 'सारे नोट हटाएँ',
    keep: 'रहने दें',
    failed: 'यह सहेजा नहीं गया। थोड़ी देर बाद फिर कोशिश करें।',
  },
  sw: {
    group: 'Karwan inachokumbuka',
    toggle: 'Kumbuka mazungumzo yetu',
    toggleNote: 'Msaidizi wako huweka maelezo mafupi, kwenye wavuti na Telegram, ili aendelee pale mlipoachia.',
    notes: 'Maelezo',
    notesCount: '{n} yamehifadhiwa',
    none: 'Hakuna kilichokumbukwa bado.',
    sheetTitle: 'Karwan inachokumbuka',
    sheetBody: 'Ni wewe tu unayeona maelezo haya. Futa lolote. Nenosiri, misimbo, nambari za kadi, benki na simu hazihifadhiwi kamwe.',
    deleteNote: 'Futa maelezo: {text}',
    forgetAll: 'Sahau kila kitu',
    forgetAllConfirm: 'Ufute maelezo yote? Mazungumzo yako yaliyohifadhiwa yanabaki.',
    forgetAllYes: 'Futa maelezo yote',
    keep: 'Yabaki',
    failed: 'Haikuhifadhiwa. Jaribu tena baada ya muda mfupi.',
  },
};
