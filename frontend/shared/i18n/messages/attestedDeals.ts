import type { AttestationBand } from '../../../core/api';

/// The settled deals Karwan has signed a public statement about, on a
/// person's passport. Bands are the attestation bands, not the market's.
export interface AttestedDealsCopy {
  title: string;
  buyer: string;
  seller: string;
  disputed: string;
  check: string;
  removed: string;
  none: string;
  download: string;
  pageTitle: string;
  settledOn: string;
  roleLabel: string;
  valueLabel: string;
  disputeLabel: string;
  signedOn: string;
  signedBy: string;
  /// The person the statement is about, by name and Karwan tag.
  whoLabel: string;
  /// The fold holding the signing address and the signed credential.
  proofLabel: string;
  stands: string;
  withdrawn: string;
  openCredential: string;
  notFound: string;
  yes: string;
  bands: Record<AttestationBand, string>;
}

type Locale = 'en' | 'fr' | 'ar' | 'hi' | 'sw';

export const attestedDealsCopy: Record<Locale, AttestedDealsCopy> = {
  en: {
    title: 'Settled deals, attested by Karwan',
    buyer: 'As buyer',
    seller: 'As seller',
    disputed: 'Went through a dispute',
    check: 'Check this',
    removed: 'Removed',
    none: 'No attested deals yet.',
    download: 'Download my attested deals',
    pageTitle: "A settled deal, attested by Karwan",
    settledOn: "Settled",
    roleLabel: "Role",
    valueLabel: "Value",
    disputeLabel: "Through a dispute",
    signedOn: "Signed by Karwan",
    signedBy: "Signing address",
    whoLabel: "Person",
    proofLabel: "Proof",
    stands: "Karwan still stands behind this statement.",
    withdrawn: "Karwan withdrew this statement on {date}.",
    openCredential: "Open the signed credential",
    notFound: "This statement could not be found.",
    yes: "Yes",
    bands: {
      'under-100': 'Under 100 USDC',
      '100-1k': '100 to 1,000 USDC',
      '1k-10k': '1,000 to 10,000 USDC',
      '10k-100k': '10,000 to 100,000 USDC',
      'over-100k': 'Over 100,000 USDC',
    },
  },
  fr: {
    title: 'Transactions réglées, attestées par Karwan',
    buyer: 'En tant qu’acheteur',
    seller: 'En tant que vendeur',
    disputed: 'Passée par un litige',
    check: 'Vérifier',
    removed: 'Retirée',
    none: 'Aucune transaction attestée pour le moment.',
    download: 'Télécharger mes transactions attestées',
    pageTitle: "Une transaction réglée, attestée par Karwan",
    settledOn: "Réglée",
    roleLabel: "Rôle",
    valueLabel: "Valeur",
    disputeLabel: "Par un litige",
    signedOn: "Signée par Karwan",
    signedBy: "Adresse de signature",
    whoLabel: "Personne",
    proofLabel: "Preuve",
    stands: "Karwan maintient cette déclaration.",
    withdrawn: "Karwan a retiré cette déclaration le {date}.",
    openCredential: "Ouvrir l’attestation signée",
    notFound: "Cette déclaration est introuvable.",
    yes: "Oui",
    bands: {
      'under-100': 'Moins de 100 USDC',
      '100-1k': '100 à 1 000 USDC',
      '1k-10k': '1 000 à 10 000 USDC',
      '10k-100k': '10 000 à 100 000 USDC',
      'over-100k': 'Plus de 100 000 USDC',
    },
  },
  ar: {
    title: 'صفقات مكتملة، موثّقة من كاروان',
    buyer: 'كمشترٍ',
    seller: 'كبائع',
    disputed: 'مرّت بنزاع',
    check: 'تحقّق منها',
    removed: 'أُزيلت',
    none: 'لا توجد صفقات موثّقة بعد.',
    download: 'نزّل صفقاتي الموثّقة',
    pageTitle: "صفقة مكتملة، موثقة من Karwan",
    settledOn: "اكتملت",
    roleLabel: "الدور",
    valueLabel: "القيمة",
    disputeLabel: "عبر نزاع",
    signedOn: "وقّعتها Karwan",
    signedBy: "عنوان التوقيع",
    whoLabel: "الشخص",
    proofLabel: "الإثبات",
    stands: "ما زالت Karwan تؤيد هذا البيان.",
    withdrawn: "سحبت Karwan هذا البيان في {date}.",
    openCredential: "افتح الشهادة الموقعة",
    notFound: "تعذر العثور على هذا البيان.",
    yes: "نعم",
    bands: {
      'under-100': 'أقل من 100 USDC',
      '100-1k': 'من 100 إلى 1,000 USDC',
      '1k-10k': 'من 1,000 إلى 10,000 USDC',
      '10k-100k': 'من 10,000 إلى 100,000 USDC',
      'over-100k': 'أكثر من 100,000 USDC',
    },
  },
  hi: {
    title: 'पूरे हुए सौदे, Karwan द्वारा प्रमाणित',
    buyer: 'खरीदार के रूप में',
    seller: 'विक्रेता के रूप में',
    disputed: 'विवाद से होकर गुज़रा',
    check: 'इसे जांचें',
    removed: 'हटाया गया',
    none: 'अभी कोई प्रमाणित सौदा नहीं।',
    download: 'मेरे प्रमाणित सौदे डाउनलोड करें',
    pageTitle: "एक पूरी हुई डील, Karwan द्वारा प्रमाणित",
    settledOn: "पूरी हुई",
    roleLabel: "भूमिका",
    valueLabel: "मूल्य",
    disputeLabel: "विवाद के ज़रिए",
    signedOn: "Karwan ने हस्ताक्षर किए",
    signedBy: "हस्ताक्षर पता",
    whoLabel: "व्यक्ति",
    proofLabel: "प्रमाण",
    stands: "Karwan अब भी इस कथन के साथ है।",
    withdrawn: "Karwan ने यह कथन {date} को वापस लिया।",
    openCredential: "हस्ताक्षरित प्रमाणपत्र खोलें",
    notFound: "यह कथन नहीं मिला।",
    yes: "हाँ",
    bands: {
      'under-100': '100 USDC से कम',
      '100-1k': '100 से 1,000 USDC',
      '1k-10k': '1,000 से 10,000 USDC',
      '10k-100k': '10,000 से 100,000 USDC',
      'over-100k': '100,000 USDC से अधिक',
    },
  },
  sw: {
    title: 'Mikataba iliyokamilika, imethibitishwa na Karwan',
    buyer: 'Kama mnunuzi',
    seller: 'Kama muuzaji',
    disputed: 'Ilipitia mzozo',
    check: 'Kagua hii',
    removed: 'Imeondolewa',
    none: 'Bado hakuna mikataba iliyothibitishwa.',
    download: 'Pakua mikataba yangu iliyothibitishwa',
    pageTitle: "Mpango uliokamilika, umethibitishwa na Karwan",
    settledOn: "Ulikamilika",
    roleLabel: "Nafasi",
    valueLabel: "Thamani",
    disputeLabel: "Kupitia mgogoro",
    signedOn: "Ulisainiwa na Karwan",
    signedBy: "Anwani ya kusaini",
    whoLabel: "Mtu",
    proofLabel: "Uthibitisho",
    stands: "Karwan bado inasimamia taarifa hii.",
    withdrawn: "Karwan iliondoa taarifa hii tarehe {date}.",
    openCredential: "Fungua cheti kilichosainiwa",
    notFound: "Taarifa hii haikupatikana.",
    yes: "Ndiyo",
    bands: {
      'under-100': 'Chini ya USDC 100',
      '100-1k': 'USDC 100 hadi 1,000',
      '1k-10k': 'USDC 1,000 hadi 10,000',
      '10k-100k': 'USDC 10,000 hadi 100,000',
      'over-100k': 'Zaidi ya USDC 100,000',
    },
  },
};
