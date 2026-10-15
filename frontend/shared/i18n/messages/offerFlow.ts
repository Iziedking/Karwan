export interface OfferFlowCopy {
  titleShort: string;
  descriptionShort: string;
  liveTitle: string;
  liveBody: string;
  viewOffer: string;
  postAnother: string;
  matchedTitle: string;
  openDeal: string;
  tryAgain: string;
}

const en: OfferFlowCopy = {
  titleShort: 'Give your offer a title of at least 3 characters.',
  descriptionShort: 'Describe your offer in at least 5 characters.',
  liveTitle: 'Your offer is live',
  liveBody: 'Your agent checks open requests and offers your price when one fits. You get a notification when a buyer is matched.',
  viewOffer: 'See your offer',
  postAnother: 'Post another offer',
  matchedTitle: 'A buyer matched your offer.',
  openDeal: 'Open the deal',
  tryAgain: 'Check your connection and try again.',
};

const fr: OfferFlowCopy = {
  titleShort: 'Donnez à votre offre un titre d’au moins 3 caractères.',
  descriptionShort: 'Décrivez votre offre en au moins 5 caractères.',
  liveTitle: 'Votre offre est en ligne',
  liveBody: 'Votre agent consulte les demandes ouvertes et propose votre prix quand l’une correspond. Vous recevez une notification quand un acheteur est trouvé.',
  viewOffer: 'Voir votre offre',
  postAnother: 'Publier une autre offre',
  matchedTitle: 'Un acheteur correspond à votre offre.',
  openDeal: 'Ouvrir l’accord',
  tryAgain: 'Vérifiez votre connexion et réessayez.',
};

const ar: OfferFlowCopy = {
  titleShort: 'اكتب عنوانًا لعرضك من 3 أحرف على الأقل.',
  descriptionShort: 'صِف عرضك في 5 أحرف على الأقل.',
  liveTitle: 'عرضك منشور الآن',
  liveBody: 'يتفقد وكيلك الطلبات المفتوحة ويعرض سعرك عندما يناسب أحدها. يصلك إشعار عند إيجاد مشترٍ.',
  viewOffer: 'اعرض عرضك',
  postAnother: 'انشر عرضًا آخر',
  matchedTitle: 'وُجد مشترٍ لعرضك.',
  openDeal: 'افتح الصفقة',
  tryAgain: 'تحقق من اتصالك وحاول مرة أخرى.',
};

const hi: OfferFlowCopy = {
  titleShort: 'अपने ऑफ़र का शीर्षक कम से कम 3 अक्षरों का रखें।',
  descriptionShort: 'अपने ऑफ़र का विवरण कम से कम 5 अक्षरों में लिखें।',
  liveTitle: 'आपका ऑफ़र लाइव है',
  liveBody: 'आपका एजेंट खुले अनुरोध देखता है और कोई मेल खाने पर आपकी कीमत ऑफ़र करता है। खरीदार मिलने पर आपको सूचना मिलेगी।',
  viewOffer: 'अपना ऑफ़र देखें',
  postAnother: 'एक और ऑफ़र पोस्ट करें',
  matchedTitle: 'आपके ऑफ़र से एक खरीदार मेल खा गया।',
  openDeal: 'सौदा खोलें',
  tryAgain: 'अपना कनेक्शन जाँचें और फिर कोशिश करें।',
};

const sw: OfferFlowCopy = {
  titleShort: 'Ipe ofa yako kichwa cha angalau herufi 3.',
  descriptionShort: 'Eleza ofa yako kwa angalau herufi 5.',
  liveTitle: 'Ofa yako iko hewani',
  liveBody: 'Wakala wako anaangalia maombi yaliyo wazi na kutoa bei yako moja inapofaa. Unapata arifa mnunuzi anapopatikana.',
  viewOffer: 'Tazama ofa yako',
  postAnother: 'Chapisha ofa nyingine',
  matchedTitle: 'Mnunuzi amelingana na ofa yako.',
  openDeal: 'Fungua makubaliano',
  tryAgain: 'Angalia muunganisho wako na ujaribu tena.',
};

export const offerFlowCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', OfferFlowCopy> = { en, ar, fr, hi, sw };
