/// A buyer chose a seller from the shortlist and the seller is asked before
/// the deal is funded (view 75). Both sides' words, in every language.
export interface ChosenCopy {
  /// Seller.
  sellerTitle: string;
  /// "{title}" is the request, "{amount}" the price.
  sellerLine: string;
  /// "{date}" is when the choice lapses.
  answerBy: string;
  accept: string;
  askForMore: string;
  decline: string;
  declineSure: string;
  yourPrice: string;
  sendPrice: string;
  back: string;
  askedForMore: string;
  nothingHeld: string;
  sellerFailed: string;
  /// Buyer. "{name}" is the seller.
  waiting: string;
  takeBack: string;
  raised: string;
  approve: string;
  chooseAnother: string;
  declined: string;
  buyerFailed: string;
}

export const chosenCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', ChosenCopy> = {
  en: {
    sellerTitle: 'A buyer chose you',
    sellerLine: '{title}, at {amount}.',
    answerBy: 'Answer by {date}.',
    accept: 'Accept',
    askForMore: 'Ask for more',
    decline: 'Decline',
    declineSure: 'Yes, decline',
    yourPrice: 'Your price',
    sendPrice: 'Send to the buyer',
    back: 'Back',
    askedForMore: 'You asked for {amount}. The buyer has to answer.',
    nothingHeld: 'Nothing is held until you accept.',
    sellerFailed: 'That did not go through. Try again.',
    waiting: 'Waiting for {name} to accept. They have until {date}.',
    takeBack: 'Choose someone else',
    raised: '{name} asks for {amount}.',
    approve: 'Approve {amount}',
    chooseAnother: 'Choose someone else',
    declined: '{name} turned this down. Choose another offer.',
    buyerFailed: 'That did not go through. Try again.',
  },
  fr: {
    sellerTitle: 'Un acheteur vous a choisi',
    sellerLine: '{title}, à {amount}.',
    answerBy: 'Répondez avant le {date}.',
    accept: 'Accepter',
    askForMore: 'Demander plus',
    decline: 'Refuser',
    declineSure: 'Oui, refuser',
    yourPrice: 'Votre prix',
    sendPrice: 'Envoyer à l’acheteur',
    back: 'Retour',
    askedForMore: 'Vous avez demandé {amount}. L’acheteur doit répondre.',
    nothingHeld: 'Rien n’est bloqué tant que vous n’avez pas accepté.',
    sellerFailed: 'Cela n’a pas abouti. Réessayez.',
    waiting: 'En attente de l’accord de {name}. Réponse attendue avant le {date}.',
    takeBack: 'Choisir quelqu’un d’autre',
    raised: '{name} demande {amount}.',
    approve: 'Approuver {amount}',
    chooseAnother: 'Choisir quelqu’un d’autre',
    declined: '{name} a refusé. Choisissez une autre offre.',
    buyerFailed: 'Cela n’a pas abouti. Réessayez.',
  },
  ar: {
    sellerTitle: 'اختارك مشترٍ',
    sellerLine: '{title}، بسعر {amount}.',
    answerBy: 'أجب قبل {date}.',
    accept: 'قبول',
    askForMore: 'اطلب أكثر',
    decline: 'رفض',
    declineSure: 'نعم، ارفض',
    yourPrice: 'سعرك',
    sendPrice: 'أرسل إلى المشتري',
    back: 'رجوع',
    askedForMore: 'طلبت {amount}. على المشتري أن يجيب.',
    nothingHeld: 'لا يُحجز أي مبلغ حتى تقبل.',
    sellerFailed: 'لم يتم ذلك. حاول مرة أخرى.',
    waiting: 'بانتظار قبول {name}. أمامه حتى {date}.',
    takeBack: 'اختر شخصًا آخر',
    raised: '{name} يطلب {amount}.',
    approve: 'وافق على {amount}',
    chooseAnother: 'اختر شخصًا آخر',
    declined: '{name} رفض هذا الطلب. اختر عرضًا آخر.',
    buyerFailed: 'لم يتم ذلك. حاول مرة أخرى.',
  },
  hi: {
    sellerTitle: 'एक खरीदार ने आपको चुना',
    sellerLine: '{title}, {amount} पर।',
    answerBy: '{date} तक जवाब दें।',
    accept: 'स्वीकार करें',
    askForMore: 'ज़्यादा माँगें',
    decline: 'मना करें',
    declineSure: 'हाँ, मना करें',
    yourPrice: 'आपकी कीमत',
    sendPrice: 'खरीदार को भेजें',
    back: 'वापस',
    askedForMore: 'आपने {amount} माँगा। अब खरीदार को जवाब देना है।',
    nothingHeld: 'जब तक आप स्वीकार नहीं करते, कुछ भी रोका नहीं जाता।',
    sellerFailed: 'यह नहीं हो पाया। फिर कोशिश करें।',
    waiting: '{name} की स्वीकृति का इंतज़ार है। उनके पास {date} तक का समय है।',
    takeBack: 'किसी और को चुनें',
    raised: '{name} {amount} माँग रहे हैं।',
    approve: '{amount} मंज़ूर करें',
    chooseAnother: 'किसी और को चुनें',
    declined: '{name} ने मना कर दिया। कोई और ऑफ़र चुनें।',
    buyerFailed: 'यह नहीं हो पाया। फिर कोशिश करें।',
  },
  sw: {
    sellerTitle: 'Mnunuzi amekuchagua',
    sellerLine: '{title}, kwa {amount}.',
    answerBy: 'Jibu kabla ya {date}.',
    accept: 'Kubali',
    askForMore: 'Omba zaidi',
    decline: 'Kataa',
    declineSure: 'Ndiyo, kataa',
    yourPrice: 'Bei yako',
    sendPrice: 'Tuma kwa mnunuzi',
    back: 'Rudi',
    askedForMore: 'Umeomba {amount}. Mnunuzi anapaswa kujibu.',
    nothingHeld: 'Hakuna kinachoshikiliwa hadi ukubali.',
    sellerFailed: 'Haikufanikiwa. Jaribu tena.',
    waiting: 'Tunasubiri {name} akubali. Ana muda hadi {date}.',
    takeBack: 'Chagua mwingine',
    raised: '{name} anaomba {amount}.',
    approve: 'Idhinisha {amount}',
    chooseAnother: 'Chagua mwingine',
    declined: '{name} amekataa. Chagua ofa nyingine.',
    buyerFailed: 'Haikufanikiwa. Jaribu tena.',
  },
};
