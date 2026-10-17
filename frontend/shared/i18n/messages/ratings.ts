/// Ratings after a settled deal: the public line ("4.8 from 23 deals", or New
/// under three) and the card on the deal page. {value}, {count} and {n} are
/// filled at render.
export interface RatingsCopy {
  label: string;
  rated: string;
  /// Appended to `rated` when ratings from disputed deals are counted.
  disputed: string;
  newNone: string;
  newOne: string;
  newSome: string;
  cardTitle: string;
  cardBody: string;
  star: string;
  note: string;
  notePlaceholder: string;
  submit: string;
  saving: string;
  saved: string;
  savedBoth: string;
  already: string;
  failed: string;
}

export const ratingsCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', RatingsCopy> = {
  en: {
    label: 'Rating',
    rated: '{value} from {count} deals',
    disputed: ", {n} disputed",
    newNone: 'New, no ratings yet',
    newOne: 'New, 1 rating so far',
    newSome: 'New, {count} ratings so far',
    cardTitle: 'Rate this deal',
    cardBody: 'How did it go? Your rating shows when they rate too, or in 14 days.',
    star: '{n} out of 5',
    note: 'Note, if you like',
    notePlaceholder: 'What went well, or what did not',
    submit: 'Save rating',
    saving: 'Saving',
    saved: 'Saved. It shows when they rate too, or in 14 days.',
    savedBoth: 'Saved. Both ratings now show.',
    already: 'You rated this deal.',
    failed: 'Not saved. Try again.',
  },
  fr: {
    label: 'Note',
    rated: '{value} sur {count} accords',
    disputed: ", dont {n} en litige",
    newNone: 'Nouveau, aucune note pour l’instant',
    newOne: 'Nouveau, 1 note pour l’instant',
    newSome: 'Nouveau, {count} notes pour l’instant',
    cardTitle: 'Notez cet accord',
    cardBody: 'Comment cela s’est-il passé ? Votre note s’affiche quand l’autre personne note aussi, ou dans 14 jours.',
    star: '{n} sur 5',
    note: 'Un commentaire, si vous voulez',
    notePlaceholder: 'Ce qui s’est bien passé, ou non',
    submit: 'Enregistrer la note',
    saving: 'Enregistrement',
    saved: 'Enregistrée. Elle s’affiche quand l’autre personne note aussi, ou dans 14 jours.',
    savedBoth: 'Enregistrée. Les deux notes s’affichent maintenant.',
    already: 'Vous avez noté cet accord.',
    failed: 'Non enregistrée. Réessayez.',
  },
  ar: {
    label: 'التقييم',
    rated: '{value} من {count} صفقة',
    disputed: "، منها {n} بنزاع",
    newNone: 'جديد، لا تقييمات بعد',
    newOne: 'جديد، تقييم واحد حتى الآن',
    newSome: 'جديد، {count} تقييمات حتى الآن',
    cardTitle: 'قيّم هذه الصفقة',
    cardBody: 'كيف سارت؟ يظهر تقييمك عندما يقيّم الطرف الآخر أيضًا، أو بعد 14 يومًا.',
    star: '{n} من 5',
    note: 'ملاحظة، إن أردت',
    notePlaceholder: 'ما الذي سار جيدًا، أو ما الذي لم يسر',
    submit: 'احفظ التقييم',
    saving: 'جارٍ الحفظ',
    saved: 'تم الحفظ. يظهر عندما يقيّم الطرف الآخر أيضًا، أو بعد 14 يومًا.',
    savedBoth: 'تم الحفظ. يظهر التقييمان الآن.',
    already: 'لقد قيّمت هذه الصفقة.',
    failed: 'لم يُحفظ. حاول مرة أخرى.',
  },
  hi: {
    label: 'रेटिंग',
    rated: '{count} डील से {value}',
    disputed: ", {n} विवादित",
    newNone: 'नया, अभी कोई रेटिंग नहीं',
    newOne: 'नया, अब तक 1 रेटिंग',
    newSome: 'नया, अब तक {count} रेटिंग',
    cardTitle: 'इस डील को रेट करें',
    cardBody: 'कैसा रहा? आपकी रेटिंग तब दिखेगी जब वे भी रेट करें, या 14 दिन में।',
    star: '5 में से {n}',
    note: 'चाहें तो एक नोट',
    notePlaceholder: 'क्या अच्छा रहा, या क्या नहीं',
    submit: 'रेटिंग सेव करें',
    saving: 'सेव हो रहा है',
    saved: 'सेव हो गया। यह तब दिखेगा जब वे भी रेट करें, या 14 दिन में।',
    savedBoth: 'सेव हो गया। अब दोनों रेटिंग दिखती हैं।',
    already: 'आप इस डील को रेट कर चुके हैं।',
    failed: 'सेव नहीं हुआ। फिर से कोशिश करें।',
  },
  sw: {
    label: 'Ukadiriaji',
    rated: '{value} kutoka mipango {count}',
    disputed: ", {n} zenye mgogoro",
    newNone: 'Mpya, bado hakuna ukadiriaji',
    newOne: 'Mpya, ukadiriaji 1 hadi sasa',
    newSome: 'Mpya, ukadiriaji {count} hadi sasa',
    cardTitle: 'Kadiria mpango huu',
    cardBody: 'Ulikwendaje? Ukadiriaji wako unaonekana wakikadiria pia, au baada ya siku 14.',
    star: '{n} kati ya 5',
    note: 'Maoni, ukipenda',
    notePlaceholder: 'Kilichokwenda vizuri, au kisichokwenda',
    submit: 'Hifadhi ukadiriaji',
    saving: 'Inahifadhi',
    saved: 'Imehifadhiwa. Inaonekana wakikadiria pia, au baada ya siku 14.',
    savedBoth: 'Imehifadhiwa. Ukadiriaji wote miwili unaonekana sasa.',
    already: 'Umeshakadiria mpango huu.',
    failed: 'Haikuhifadhiwa. Jaribu tena.',
  },
};
