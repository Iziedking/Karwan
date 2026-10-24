import type { Locale } from '../locales';

/// Photos on an offer (docs/architecture/28-photos-on-listings.md): the offer
/// form, the offer page, the market card, reporting and the assistant's photo
/// choice.
export interface OfferPhotosCopy {
  label: string;
  hint: string;
  add: string;
  removeTemplate: string;
  unreadable: string;
  max: string;
  altTemplate: string;
  openTemplate: string;
  close: string;
  report: string;
  reportTitle: string;
  reportPhoto: string;
  reportListing: string;
  reportNote: string;
  reportSend: string;
  reportSent: string;
  reportFailed: string;
  cancel: string;
  chooseTitle: string;
  forOffer: string;
  asInvoice: string;
}

export const offerPhotosCopy: Record<Locale, OfferPhotosCopy> = {
  en: {
    label: 'Photos',
    hint: 'Up to 4. A clear photo helps goods sell.',
    add: 'Add photos',
    removeTemplate: 'Remove photo {n}',
    unreadable: 'That photo could not be added. Use a JPEG, PNG or WebP.',
    max: 'An offer takes up to 4 photos.',
    altTemplate: 'Photo {n} of {title}',
    openTemplate: 'Show photo {n}',
    close: 'Close',
    report: 'Report this offer',
    reportTitle: 'Report this offer',
    reportPhoto: 'A photo is wrong or unsafe',
    reportListing: 'Something else is wrong',
    reportNote: 'Anything to add',
    reportSend: 'Send report',
    reportSent: 'Thanks. The team will look at it.',
    reportFailed: "That didn't send. Try again.",
    cancel: 'Cancel',
    chooseTitle: 'What is this photo for?',
    forOffer: 'For an offer',
    asInvoice: 'Read as an invoice',
  },
  fr: {
    label: 'Photos',
    hint: "Jusqu'à 4. Une photo nette aide à vendre un produit.",
    add: 'Ajouter des photos',
    removeTemplate: 'Retirer la photo {n}',
    unreadable: "Cette photo n'a pas pu être ajoutée. Utilisez un JPEG, PNG ou WebP.",
    max: "Une offre prend jusqu'à 4 photos.",
    altTemplate: 'Photo {n} de {title}',
    openTemplate: 'Voir la photo {n}',
    close: 'Fermer',
    report: 'Signaler cette offre',
    reportTitle: 'Signaler cette offre',
    reportPhoto: 'Une photo est fausse ou dangereuse',
    reportListing: 'Autre chose ne va pas',
    reportNote: 'Autre chose à ajouter',
    reportSend: 'Envoyer le signalement',
    reportSent: "Merci. L'équipe va regarder.",
    reportFailed: "L'envoi a échoué. Réessayez.",
    cancel: 'Annuler',
    chooseTitle: 'À quoi sert cette photo ?',
    forOffer: 'Pour une offre',
    asInvoice: 'Lire comme une facture',
  },
  ar: {
    label: 'الصور',
    hint: 'حتى 4 صور. الصورة الواضحة تساعد على بيع السلع.',
    add: 'إضافة صور',
    removeTemplate: 'إزالة الصورة {n}',
    unreadable: 'تعذّرت إضافة هذه الصورة. استخدم JPEG أو PNG أو WebP.',
    max: 'يقبل العرض حتى 4 صور.',
    altTemplate: 'الصورة {n} من {title}',
    openTemplate: 'عرض الصورة {n}',
    close: 'إغلاق',
    report: 'الإبلاغ عن هذا العرض',
    reportTitle: 'الإبلاغ عن هذا العرض',
    reportPhoto: 'صورة خاطئة أو غير آمنة',
    reportListing: 'شيء آخر غير صحيح',
    reportNote: 'هل تريد إضافة شيء',
    reportSend: 'إرسال البلاغ',
    reportSent: 'شكرًا. سيراجعه الفريق.',
    reportFailed: 'لم يُرسل. حاول مرة أخرى.',
    cancel: 'إلغاء',
    chooseTitle: 'لأي شيء هذه الصورة؟',
    forOffer: 'لعرض',
    asInvoice: 'قراءتها كفاتورة',
  },
  hi: {
    label: 'फ़ोटो',
    hint: '4 तक। साफ़ फ़ोटो से सामान जल्दी बिकता है।',
    add: 'फ़ोटो जोड़ें',
    removeTemplate: 'फ़ोटो {n} हटाएँ',
    unreadable: 'यह फ़ोटो नहीं जुड़ सकी। JPEG, PNG या WebP इस्तेमाल करें।',
    max: 'एक ऑफ़र में 4 फ़ोटो तक जुड़ती हैं।',
    altTemplate: '{title} की फ़ोटो {n}',
    openTemplate: 'फ़ोटो {n} देखें',
    close: 'बंद करें',
    report: 'इस ऑफ़र की शिकायत करें',
    reportTitle: 'इस ऑफ़र की शिकायत करें',
    reportPhoto: 'कोई फ़ोटो गलत या असुरक्षित है',
    reportListing: 'कुछ और गलत है',
    reportNote: 'कुछ और जोड़ना है',
    reportSend: 'शिकायत भेजें',
    reportSent: 'धन्यवाद। टीम इसे देखेगी।',
    reportFailed: 'यह नहीं भेजा गया। फिर से कोशिश करें।',
    cancel: 'रद्द करें',
    chooseTitle: 'यह फ़ोटो किसलिए है?',
    forOffer: 'किसी ऑफ़र के लिए',
    asInvoice: 'इनवॉइस की तरह पढ़ें',
  },
  sw: {
    label: 'Picha',
    hint: 'Hadi 4. Picha iliyo wazi husaidia bidhaa kuuzika.',
    add: 'Ongeza picha',
    removeTemplate: 'Ondoa picha {n}',
    unreadable: 'Picha hiyo haikuweza kuongezwa. Tumia JPEG, PNG au WebP.',
    max: 'Ofa inachukua hadi picha 4.',
    altTemplate: 'Picha {n} ya {title}',
    openTemplate: 'Onyesha picha {n}',
    close: 'Funga',
    report: 'Ripoti ofa hii',
    reportTitle: 'Ripoti ofa hii',
    reportPhoto: 'Picha si sahihi au si salama',
    reportListing: 'Kuna jambo jingine lisilo sawa',
    reportNote: 'Kitu cha kuongeza',
    reportSend: 'Tuma ripoti',
    reportSent: 'Asante. Timu itaiangalia.',
    reportFailed: 'Haikutumwa. Jaribu tena.',
    cancel: 'Ghairi',
    chooseTitle: 'Picha hii ni ya nini?',
    forOffer: 'Kwa ofa',
    asInvoice: 'Isome kama ankara',
  },
};
