/// Offers that move (view 35): a seller lowering their own offer, and the
/// honest note when a budget sits far under what sellers take.
export interface OffersThatMoveCopy {
  lowerOpen: string;
  lowerLabel: string;
  lowerHint: string;
  lowerSubmit: string;
  lowerCancel: string;
  lowerErrors: { NOT_LOWER: string; LIMIT: string; CLOSED: string; BUSY: string; other: string };
  underTitle: string;
  /// {fair} and {budget} are USDC amounts.
  underBody: string;
  underAllowMore: string;
  underPostAgain: string;
  underDismiss: string;
}

export const offersThatMoveCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', OffersThatMoveCopy> = {
  en: {
    lowerOpen: 'Lower my offer',
    lowerLabel: 'New price in USDC',
    lowerHint: 'An offer can only go down, at most three times.',
    lowerSubmit: 'Lower it',
    lowerCancel: 'Cancel',
    lowerErrors: {
      NOT_LOWER: 'The new price has to be lower than your offer now.',
      LIMIT: 'You have lowered this offer three times already.',
      CLOSED: 'This request no longer takes offers.',
      BUSY: 'The buyer is paying in right now. Try again in a moment.',
      other: 'That did not go through. Try again.',
    },
    underTitle: 'Market check',
    underBody: 'Sellers ask about {fair} USDC for this. None has taken it at {budget} USDC.',
    underAllowMore: 'Allow more',
    underPostAgain: 'Post again',
    underDismiss: 'Dismiss',
  },
  fr: {
    lowerOpen: 'Baisser mon offre',
    lowerLabel: 'Nouveau prix en USDC',
    lowerHint: 'Une offre ne peut que baisser, au plus trois fois.',
    lowerSubmit: 'La baisser',
    lowerCancel: 'Annuler',
    lowerErrors: {
      NOT_LOWER: 'Le nouveau prix doit être plus bas que votre offre actuelle.',
      LIMIT: 'Vous avez déjà baissé cette offre trois fois.',
      CLOSED: 'Cette demande ne prend plus d’offres.',
      BUSY: 'L’acheteur est en train de payer. Réessayez dans un instant.',
      other: 'Cela n’a pas abouti. Réessayez.',
    },
    underTitle: 'Point marché',
    underBody: 'Les vendeurs demandent environ {fair} USDC pour cela. Aucun ne l’a accepté à {budget} USDC.',
    underAllowMore: 'Accepter plus',
    underPostAgain: 'Republier',
    underDismiss: 'Fermer',
  },
  ar: {
    lowerOpen: 'اخفض عرضي',
    lowerLabel: 'السعر الجديد بعملة USDC',
    lowerHint: 'يمكن للعرض أن ينخفض فقط، ثلاث مرات على الأكثر.',
    lowerSubmit: 'اخفضه',
    lowerCancel: 'إلغاء',
    lowerErrors: {
      NOT_LOWER: 'يجب أن يكون السعر الجديد أقل من عرضك الحالي.',
      LIMIT: 'لقد خفّضت هذا العرض ثلاث مرات بالفعل.',
      CLOSED: 'هذا الطلب لم يعد يستقبل عروضًا.',
      BUSY: 'المشتري يدفع الآن. حاول مرة أخرى بعد قليل.',
      other: 'لم يتم ذلك. حاول مرة أخرى.',
    },
    underTitle: 'فحص السوق',
    underBody: 'يطلب البائعون نحو {fair} USDC لهذا. لم يقبله أحد بسعر {budget} USDC.',
    underAllowMore: 'اسمح بالمزيد',
    underPostAgain: 'انشر من جديد',
    underDismiss: 'إغلاق',
  },
  hi: {
    lowerOpen: 'मेरा ऑफ़र घटाएँ',
    lowerLabel: 'USDC में नई कीमत',
    lowerHint: 'ऑफ़र सिर्फ़ घट सकता है, ज़्यादा से ज़्यादा तीन बार।',
    lowerSubmit: 'घटाएँ',
    lowerCancel: 'रद्द करें',
    lowerErrors: {
      NOT_LOWER: 'नई कीमत आपके मौजूदा ऑफ़र से कम होनी चाहिए।',
      LIMIT: 'आप यह ऑफ़र तीन बार घटा चुके हैं।',
      CLOSED: 'यह अनुरोध अब ऑफ़र नहीं ले रहा।',
      BUSY: 'खरीदार अभी भुगतान कर रहा है। थोड़ी देर में फिर कोशिश करें।',
      other: 'यह नहीं हो पाया। फिर कोशिश करें।',
    },
    underTitle: 'बाज़ार की जाँच',
    underBody: 'विक्रेता इसके लिए लगभग {fair} USDC माँगते हैं। {budget} USDC पर किसी ने नहीं लिया।',
    underAllowMore: 'ज़्यादा की अनुमति दें',
    underPostAgain: 'फिर से पोस्ट करें',
    underDismiss: 'बंद करें',
  },
  sw: {
    lowerOpen: 'Shusha ofa yangu',
    lowerLabel: 'Bei mpya kwa USDC',
    lowerHint: 'Ofa inaweza kushuka tu, mara tatu zaidi.',
    lowerSubmit: 'Ishushe',
    lowerCancel: 'Ghairi',
    lowerErrors: {
      NOT_LOWER: 'Bei mpya lazima iwe chini ya ofa yako ya sasa.',
      LIMIT: 'Umeshusha ofa hii mara tatu tayari.',
      CLOSED: 'Ombi hili halipokei ofa tena.',
      BUSY: 'Mnunuzi analipa sasa hivi. Jaribu tena baada ya muda mfupi.',
      other: 'Hilo halikufanikiwa. Jaribu tena.',
    },
    underTitle: 'Ukaguzi wa soko',
    underBody: 'Wauzaji wanaomba takriban {fair} USDC kwa hili. Hakuna aliyekubali kwa {budget} USDC.',
    underAllowMore: 'Ruhusu zaidi',
    underPostAgain: 'Chapisha tena',
    underDismiss: 'Funga',
  },
};
