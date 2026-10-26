export interface DeliveryCardCopy {
  title: string;
  milestoneTemplate: string;
  delivered: string;
  openTemplate: string;
  held: string;
  whereItIs: string;
  trackingNumber: string;
  copy: string;
  copied: string;
  track: string;
  sentTemplate: string;
  arrivedTemplate: string;
  confirmArrival: string;
  confirmArrivalNote: string;
  checked: string;
  linksReal: string;
  trackingFitsTemplate: string;
  match: { aligned: string; partial: string; mismatch: string; unknown: string };
  earlier: string;
  heldShort: string;
  documents: string;
  docKinds: { invoice: string; po: string; bol: string; coo: string; pod: string; other: string };
  photos: string;
  photoAltTemplate: string;
  handedOverTemplate: string;
  form: {
    how: string;
    byCourier: string;
    inPerson: string;
    codeLabel: string;
    codeNote: string;
    photosLabel: string;
    photosRequired: string;
    photosOptional: string;
    addPhotos: string;
    removeTemplate: string;
    photoFailed: string;
  };
  code: {
    title: string;
    body: string;
    show: string;
    showAgain: string;
    hint: string;
  };
}

export const deliveryCardCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', DeliveryCardCopy> = {
  en: {
    title: 'Delivery',
    milestoneTemplate: 'Milestone {n} of {total}',
    delivered: 'What was delivered',
    openTemplate: 'Open {host}',
    held: 'A link in this delivery is held for a safety check. You see it once it is cleared.',
    whereItIs: 'Where it is',
    trackingNumber: 'Tracking number',
    copy: 'Copy',
    copied: 'Copied',
    track: 'Track shipment',
    sentTemplate: 'Sent {date}',
    arrivedTemplate: 'Arrived {date}',
    confirmArrival: 'It arrived',
    confirmArrivalNote: 'Confirming arrival starts your review. It does not pay the seller.',
    checked: 'What Karwan checked',
    linksReal: 'Each link points to a real site.',
    trackingFitsTemplate: 'The tracking number fits {carrier}.',
    match: {
      aligned: 'It matches what you asked for.',
      partial: 'It partly matches what you asked for.',
      mismatch: 'It does not match what you asked for.',
      unknown: 'It could not be compared with your request.',
    },
    earlier: 'Earlier deliveries',
    heldShort: 'Held for a safety check',
    documents: 'Documents',
    docKinds: { invoice: 'Invoice', po: 'Purchase order', bol: 'Bill of lading', coo: 'Certificate of origin', pod: 'Proof of delivery', other: 'Document' },
    photos: "Photos",
    photoAltTemplate: "Delivery photo {n}",
    handedOverTemplate: "Handed over in person {date}",
    form: {
      how: "How it reaches the buyer",
      byCourier: "By courier",
      inPerson: "In person",
      codeLabel: "The buyer's handover code",
      codeNote: "The buyer shows it once they hold the item.",
      photosLabel: "Photos",
      photosRequired: "Goods over 50 USDC are delivered with a photo of the item.",
      photosOptional: "Optional. Up to 4.",
      addPhotos: "Add photos",
      removeTemplate: "Remove photo {n}",
      photoFailed: "That photo could not be added. Use a JPEG, PNG or WebP.",
    },
    code: {
      title: "Handing it over in person?",
      body: "When you hold the item, show this code to the seller. It works once and counts as the item arriving.",
      show: "Show my handover code",
      showAgain: "Show a new code",
      hint: "Show it only with the item in hand. A new code replaces this one.",
    },
  },
  fr: {
    title: 'Livraison',
    milestoneTemplate: 'Étape {n} sur {total}',
    delivered: 'Ce qui a été livré',
    openTemplate: 'Ouvrir {host}',
    held: 'Un lien de cette livraison est retenu pour un contrôle de sécurité. Vous le verrez une fois validé.',
    whereItIs: 'Où en est l’envoi',
    trackingNumber: 'Numéro de suivi',
    copy: 'Copier',
    copied: 'Copié',
    track: 'Suivre l’envoi',
    sentTemplate: 'Envoyé le {date}',
    arrivedTemplate: 'Arrivé le {date}',
    confirmArrival: 'C’est arrivé',
    confirmArrivalNote: 'Confirmer l’arrivée lance votre vérification. Le vendeur n’est pas payé pour autant.',
    checked: 'Ce que Karwan a vérifié',
    linksReal: 'Chaque lien mène à un vrai site.',
    trackingFitsTemplate: 'Le numéro de suivi correspond à {carrier}.',
    match: {
      aligned: 'La livraison correspond à votre demande.',
      partial: 'La livraison correspond en partie à votre demande.',
      mismatch: 'La livraison ne correspond pas à votre demande.',
      unknown: 'La livraison n’a pas pu être comparée à votre demande.',
    },
    earlier: 'Livraisons précédentes',
    heldShort: 'Retenu pour un contrôle de sécurité',
    documents: 'Documents',
    docKinds: { invoice: 'Facture', po: 'Bon de commande', bol: 'Connaissement', coo: 'Certificat d’origine', pod: 'Preuve de livraison', other: 'Document' },
    photos: "Photos",
    photoAltTemplate: "Photo de livraison {n}",
    handedOverTemplate: "Remis en main propre le {date}",
    form: {
      how: "Comment l’article arrive",
      byCourier: "Par transporteur",
      inPerson: "En main propre",
      codeLabel: "Le code de remise de l’acheteur",
      codeNote: "L’acheteur le montre une fois l’article en main.",
      photosLabel: "Photos",
      photosRequired: "Les marchandises de plus de 50 USDC sont livrées avec une photo de l’article.",
      photosOptional: "Facultatif. Jusqu’à 4.",
      addPhotos: "Ajouter des photos",
      removeTemplate: "Retirer la photo {n}",
      photoFailed: "Cette photo n’a pas pu être ajoutée. Utilisez un JPEG, PNG ou WebP.",
    },
    code: {
      title: "Remise en main propre ?",
      body: "Quand vous avez l’article en main, montrez ce code au vendeur. Il ne sert qu’une fois et vaut arrivée de l’article.",
      show: "Afficher mon code de remise",
      showAgain: "Afficher un nouveau code",
      hint: "Montrez-le seulement avec l’article en main. Un nouveau code remplace celui-ci.",
    },
  },
  ar: {
    title: 'التسليم',
    milestoneTemplate: 'المرحلة {n} من {total}',
    delivered: 'ما تم تسليمه',
    openTemplate: 'فتح {host}',
    held: 'رابط في هذا التسليم محجوز لفحص أمني. سيظهر لك بعد التحقق منه.',
    whereItIs: 'أين الشحنة',
    trackingNumber: 'رقم التتبع',
    copy: 'نسخ',
    copied: 'تم النسخ',
    track: 'تتبّع الشحنة',
    sentTemplate: 'أُرسلت في {date}',
    arrivedTemplate: 'وصلت في {date}',
    confirmArrival: 'وصلت',
    confirmArrivalNote: 'تأكيد الوصول يبدأ مراجعتك. ولا يدفع للبائع.',
    checked: 'ما تحققت منه Karwan',
    linksReal: 'كل رابط يشير إلى موقع حقيقي.',
    trackingFitsTemplate: 'رقم التتبع يطابق {carrier}.',
    match: {
      aligned: 'التسليم يطابق ما طلبته.',
      partial: 'التسليم يطابق ما طلبته جزئيًا.',
      mismatch: 'التسليم لا يطابق ما طلبته.',
      unknown: 'تعذّرت مقارنة التسليم بطلبك.',
    },
    earlier: 'تسليمات سابقة',
    heldShort: 'محجوز لفحص أمني',
    documents: 'المستندات',
    docKinds: { invoice: 'فاتورة', po: 'أمر شراء', bol: 'بوليصة شحن', coo: 'شهادة منشأ', pod: 'إثبات التسليم', other: 'مستند' },
    photos: "الصور",
    photoAltTemplate: "صورة التسليم {n}",
    handedOverTemplate: "سُلّم يدًا بيد في {date}",
    form: {
      how: "كيف يصل إلى المشتري",
      byCourier: "عبر شركة شحن",
      inPerson: "يدًا بيد",
      codeLabel: "رمز الاستلام الخاص بالمشتري",
      codeNote: "يعرضه المشتري بعد أن يستلم السلعة بيده.",
      photosLabel: "الصور",
      photosRequired: "السلع التي تزيد عن 50 USDC تُسلَّم مع صورة للسلعة.",
      photosOptional: "اختياري. حتى 4 صور.",
      addPhotos: "أضف صورًا",
      removeTemplate: "إزالة الصورة {n}",
      photoFailed: "تعذّر إضافة هذه الصورة. استخدم JPEG أو PNG أو WebP.",
    },
    code: {
      title: "الاستلام يدًا بيد؟",
      body: "عندما تكون السلعة بيدك، اعرض هذا الرمز على البائع. يعمل مرة واحدة ويُحتسب وصولًا للسلعة.",
      show: "اعرض رمز الاستلام",
      showAgain: "اعرض رمزًا جديدًا",
      hint: "اعرضه فقط والسلعة بيدك. الرمز الجديد يلغي هذا الرمز.",
    },
  },
  hi: {
    title: 'डिलीवरी',
    milestoneTemplate: 'चरण {n} / {total}',
    delivered: 'क्या डिलीवर हुआ',
    openTemplate: '{host} खोलें',
    held: 'इस डिलीवरी का एक लिंक सुरक्षा जाँच के लिए रोका गया है। जाँच पूरी होने पर आपको दिखेगा।',
    whereItIs: 'शिपमेंट कहाँ है',
    trackingNumber: 'ट्रैकिंग नंबर',
    copy: 'कॉपी करें',
    copied: 'कॉपी हो गया',
    track: 'शिपमेंट ट्रैक करें',
    sentTemplate: '{date} को भेजा गया',
    arrivedTemplate: '{date} को पहुँचा',
    confirmArrival: 'पहुँच गया',
    confirmArrivalNote: 'पहुँचने की पुष्टि से आपकी जाँच शुरू होती है। इससे विक्रेता को भुगतान नहीं होता।',
    checked: 'Karwan ने क्या जाँचा',
    linksReal: 'हर लिंक एक असली साइट पर जाता है।',
    trackingFitsTemplate: 'ट्रैकिंग नंबर {carrier} से मेल खाता है।',
    match: {
      aligned: 'डिलीवरी आपके अनुरोध से मेल खाती है।',
      partial: 'डिलीवरी आपके अनुरोध से आंशिक रूप से मेल खाती है।',
      mismatch: 'डिलीवरी आपके अनुरोध से मेल नहीं खाती।',
      unknown: 'डिलीवरी की आपके अनुरोध से तुलना नहीं हो सकी।',
    },
    earlier: 'पिछली डिलीवरी',
    heldShort: 'सुरक्षा जाँच के लिए रोका गया',
    documents: 'दस्तावेज़',
    docKinds: { invoice: 'चालान', po: 'खरीद आदेश', bol: 'बिल ऑफ़ लैडिंग', coo: 'मूल प्रमाणपत्र', pod: 'डिलीवरी का प्रमाण', other: 'दस्तावेज़' },
    photos: "फ़ोटो",
    photoAltTemplate: "डिलीवरी फ़ोटो {n}",
    handedOverTemplate: "{date} को हाथों-हाथ सौंपा गया",
    form: {
      how: "सामान खरीदार तक कैसे पहुँचता है",
      byCourier: "कूरियर से",
      inPerson: "हाथों-हाथ",
      codeLabel: "खरीदार का हैंडओवर कोड",
      codeNote: "खरीदार इसे सामान हाथ में आने के बाद दिखाता है।",
      photosLabel: "फ़ोटो",
      photosRequired: "50 USDC से ज़्यादा का सामान उसकी फ़ोटो के साथ डिलीवर होता है।",
      photosOptional: "वैकल्पिक। 4 तक।",
      addPhotos: "फ़ोटो जोड़ें",
      removeTemplate: "फ़ोटो {n} हटाएँ",
      photoFailed: "यह फ़ोटो नहीं जुड़ सकी। JPEG, PNG या WebP इस्तेमाल करें।",
    },
    code: {
      title: "हाथों-हाथ ले रहे हैं?",
      body: "सामान हाथ में आने पर यह कोड विक्रेता को दिखाएँ। यह एक बार चलता है और सामान पहुँचने के रूप में गिना जाता है।",
      show: "मेरा हैंडओवर कोड दिखाएँ",
      showAgain: "नया कोड दिखाएँ",
      hint: "इसे सिर्फ़ सामान हाथ में होने पर दिखाएँ। नया कोड इसकी जगह ले लेता है।",
    },
  },
  sw: {
    title: 'Uwasilishaji',
    milestoneTemplate: 'Hatua {n} kati ya {total}',
    delivered: 'Kilichowasilishwa',
    openTemplate: 'Fungua {host}',
    held: 'Kiungo kimoja katika uwasilishaji huu kimezuiwa kwa ukaguzi wa usalama. Utakiona kikishaidhinishwa.',
    whereItIs: 'Mzigo uko wapi',
    trackingNumber: 'Namba ya ufuatiliaji',
    copy: 'Nakili',
    copied: 'Imenakiliwa',
    track: 'Fuatilia mzigo',
    sentTemplate: 'Ulitumwa {date}',
    arrivedTemplate: 'Ulifika {date}',
    confirmArrival: 'Umefika',
    confirmArrivalNote: 'Kuthibitisha kufika kunaanza ukaguzi wako. Haimlipi muuzaji.',
    checked: 'Karwan ilichokagua',
    linksReal: 'Kila kiungo kinaelekea tovuti halisi.',
    trackingFitsTemplate: 'Namba ya ufuatiliaji inalingana na {carrier}.',
    match: {
      aligned: 'Uwasilishaji unalingana na ulichoomba.',
      partial: 'Uwasilishaji unalingana kwa sehemu na ulichoomba.',
      mismatch: 'Uwasilishaji haulingani na ulichoomba.',
      unknown: 'Uwasilishaji haukuweza kulinganishwa na ombi lako.',
    },
    earlier: 'Uwasilishaji wa awali',
    heldShort: 'Umezuiwa kwa ukaguzi wa usalama',
    documents: 'Nyaraka',
    docKinds: { invoice: 'Ankara', po: 'Agizo la ununuzi', bol: 'Hati ya shehena', coo: 'Cheti cha asili', pod: 'Uthibitisho wa uwasilishaji', other: 'Hati' },
    photos: "Picha",
    photoAltTemplate: "Picha ya uwasilishaji {n}",
    handedOverTemplate: "Imekabidhiwa ana kwa ana {date}",
    form: {
      how: "Kinamfikiaje mnunuzi",
      byCourier: "Kwa kampuni ya usafirishaji",
      inPerson: "Ana kwa ana",
      codeLabel: "Namba ya makabidhiano ya mnunuzi",
      codeNote: "Mnunuzi anaionyesha akishakuwa na bidhaa mkononi.",
      photosLabel: "Picha",
      photosRequired: "Bidhaa za zaidi ya 50 USDC zinawasilishwa na picha ya bidhaa.",
      photosOptional: "Si lazima. Hadi 4.",
      addPhotos: "Ongeza picha",
      removeTemplate: "Ondoa picha {n}",
      photoFailed: "Picha hiyo haikuweza kuongezwa. Tumia JPEG, PNG au WebP.",
    },
    code: {
      title: "Unakabidhiwa ana kwa ana?",
      body: "Ukishakuwa na bidhaa mkononi, mwonyeshe muuzaji namba hii. Inatumika mara moja na inahesabiwa kama bidhaa imefika.",
      show: "Onyesha namba yangu ya makabidhiano",
      showAgain: "Onyesha namba mpya",
      hint: "Ionyeshe tu ukiwa na bidhaa mkononi. Namba mpya inachukua nafasi ya hii.",
    },
  },
};
