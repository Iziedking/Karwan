import type { Locale } from '../locales';

/// The one attach button on a request and a direct deal (view 56), and the
/// photos and PDFs shown on the request and deal pages.
export interface AttachCopy {
  label: string;
  hintRequest: string;
  hintDeal: string;
  add: string;
  removeTemplate: string;
  max: string;
  tooLarge: string;
  notAllowed: string;
  reviewRow: string;
  shown: string;
  photoAltTemplate: string;
}

export const attachCopy: Record<Locale, AttachCopy> = {
  en: {
    label: 'Photos or files',
    hintRequest: 'Up to 4 photos or PDFs. Anyone who can read the request sees them.',
    hintDeal: 'Up to 4 photos or PDFs. Only the two of you see them.',
    add: 'Attach',
    removeTemplate: 'Remove {name}',
    max: 'Up to 4 photos or PDFs.',
    tooLarge: 'That file is too large. A PDF can be 4 MB, all files together 6 MB.',
    notAllowed: 'Add a photo or a PDF.',
    reviewRow: 'Attached',
    shown: 'Photos and files',
    photoAltTemplate: 'Attached photo {n}',
  },
  fr: {
    label: 'Photos ou fichiers',
    hintRequest: 'Jusqu’à 4 photos ou PDF. Toute personne qui peut lire la demande les voit.',
    hintDeal: 'Jusqu’à 4 photos ou PDF. Vous seuls les voyez.',
    add: 'Joindre',
    removeTemplate: 'Retirer {name}',
    max: 'Jusqu’à 4 photos ou PDF.',
    tooLarge: 'Ce fichier est trop lourd. Un PDF peut faire 4 Mo, tous les fichiers ensemble 6 Mo.',
    notAllowed: 'Ajoutez une photo ou un PDF.',
    reviewRow: 'Joints',
    shown: 'Photos et fichiers',
    photoAltTemplate: 'Photo jointe {n}',
  },
  ar: {
    label: 'صور أو ملفات',
    hintRequest: 'حتى 4 صور أو ملفات PDF. يراها كل من يستطيع قراءة الطلب.',
    hintDeal: 'حتى 4 صور أو ملفات PDF. لا يراها سواكما.',
    add: 'إرفاق',
    removeTemplate: 'إزالة {name}',
    max: 'حتى 4 صور أو ملفات PDF.',
    tooLarge: 'هذا الملف كبير جدًا. يمكن أن يصل ملف PDF إلى 4 ميغابايت، والملفات معًا إلى 6 ميغابايت.',
    notAllowed: 'أضف صورة أو ملف PDF.',
    reviewRow: 'المرفقات',
    shown: 'الصور والملفات',
    photoAltTemplate: 'الصورة المرفقة {n}',
  },
  hi: {
    label: 'फ़ोटो या फ़ाइलें',
    hintRequest: 'ज़्यादा से ज़्यादा 4 फ़ोटो या PDF। जो भी अनुरोध पढ़ सकता है, वह इन्हें देखता है।',
    hintDeal: 'ज़्यादा से ज़्यादा 4 फ़ोटो या PDF। इन्हें सिर्फ़ आप दोनों देखते हैं।',
    add: 'जोड़ें',
    removeTemplate: '{name} हटाएँ',
    max: 'ज़्यादा से ज़्यादा 4 फ़ोटो या PDF।',
    tooLarge: 'यह फ़ाइल बहुत बड़ी है। एक PDF 4 MB तक, सभी फ़ाइलें मिलाकर 6 MB तक हो सकती हैं।',
    notAllowed: 'कोई फ़ोटो या PDF जोड़ें।',
    reviewRow: 'जोड़ी गई',
    shown: 'फ़ोटो और फ़ाइलें',
    photoAltTemplate: 'जोड़ी गई फ़ोटो {n}',
  },
  sw: {
    label: 'Picha au faili',
    hintRequest: 'Hadi picha au PDF 4. Yeyote anayeweza kusoma ombi anaziona.',
    hintDeal: 'Hadi picha au PDF 4. Ni nyinyi wawili tu mnaoziona.',
    add: 'Ambatisha',
    removeTemplate: 'Ondoa {name}',
    max: 'Hadi picha au PDF 4.',
    tooLarge: 'Faili hiyo ni kubwa mno. PDF inaweza kuwa MB 4, faili zote pamoja MB 6.',
    notAllowed: 'Ongeza picha au PDF.',
    reviewRow: 'Viambatisho',
    shown: 'Picha na faili',
    photoAltTemplate: 'Picha iliyoambatishwa {n}',
  },
};
