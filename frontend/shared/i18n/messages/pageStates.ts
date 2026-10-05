/// Copy for the page Karwan shows when an address does not exist.
export interface NotFoundCopy {
  title: string;
  body: string;
  home: string;
  help: string;
}

export const notFoundCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', NotFoundCopy> = {
  en: {
    title: 'This page does not exist',
    body: 'The link may be old or mistyped. Your money and deals are not affected.',
    home: 'Go to home',
    help: 'Read the docs',
  },
  fr: {
    title: "Cette page n'existe pas",
    body: "Le lien est peut-être ancien ou mal saisi. Votre argent et vos accords ne sont pas concernés.",
    home: "Aller à l'accueil",
    help: 'Lire la documentation',
  },
  ar: {
    title: 'هذه الصفحة غير موجودة',
    body: 'قد يكون الرابط قديمًا أو مكتوبًا بشكل خاطئ. أموالك وصفقاتك لم تتأثر.',
    home: 'الذهاب إلى الرئيسية',
    help: 'قراءة الدليل',
  },
  hi: {
    title: 'यह पेज मौजूद नहीं है',
    body: 'लिंक पुराना या गलत लिखा हो सकता है। आपके पैसे और सौदों पर कोई असर नहीं है।',
    home: 'होम पर जाएँ',
    help: 'डॉक्स पढ़ें',
  },
  sw: {
    title: 'Ukurasa huu haupo',
    body: 'Kiungo kinaweza kuwa cha zamani au kimeandikwa vibaya. Pesa na mikataba yako haijaathirika.',
    home: 'Nenda nyumbani',
    help: 'Soma maelezo',
  },
};
