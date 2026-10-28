/// The deals from before the new escrow, gathered on the legacy page (view 27,
/// "Moving over"). Each still finishes on its own deal page.
export interface PreviousEscrowCopy {
  tag: string;
  title: string;
  body: string;
  asBuyer: string;
  asSeller: string;
  open: string;
  /// The legacy page once the recovery window has closed and nothing is left.
  empty: string;
  /// The quiet link from Your trades to the legacy page, with the count.
  link: string;
}

export const previousEscrowCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', PreviousEscrowCopy> = {
  en: {
    tag: 'Before the new escrow',
    title: 'Deals from before the new escrow',
    body: 'These deals opened before Karwan moved to its new escrow. Each one finishes where it started, and everything you can do on it is on its deal page.',
    asBuyer: 'You buy',
    asSeller: 'You sell',
    open: 'Open deal',
    empty: 'Nothing to settle here. Every deal you have runs on the new escrow.',
    link: 'Deals from before the new escrow: {n}',
  },
  fr: {
    tag: 'Avant le nouveau séquestre',
    title: 'Accords d’avant le nouveau séquestre',
    body: 'Ces accords ont été ouverts avant le passage de Karwan à son nouveau séquestre. Chacun se termine là où il a commencé, et tout ce que vous pouvez y faire se trouve sur sa page.',
    asBuyer: 'Vous achetez',
    asSeller: 'Vous vendez',
    open: 'Ouvrir l’accord',
    empty: 'Rien à régler ici. Tous vos accords passent par le nouveau séquestre.',
    link: 'Accords d’avant le nouveau séquestre : {n}',
  },
  ar: {
    tag: 'قبل الضمان الجديد',
    title: 'صفقات من قبل الضمان الجديد',
    body: 'فُتحت هذه الصفقات قبل انتقال Karwan إلى نظام الضمان الجديد. تنتهي كل صفقة حيث بدأت، وكل ما يمكنك فعله فيها موجود في صفحتها.',
    asBuyer: 'أنت تشتري',
    asSeller: 'أنت تبيع',
    open: 'افتح الصفقة',
    empty: 'لا شيء لتسويته هنا. كل صفقاتك تعمل على الضمان الجديد.',
    link: 'صفقات من قبل الضمان الجديد: {n}',
  },
  hi: {
    tag: 'नए एस्क्रो से पहले',
    title: 'नए एस्क्रो से पहले के सौदे',
    body: 'ये सौदे Karwan के नए एस्क्रो पर जाने से पहले खुले थे। हर सौदा वहीं पूरा होता है जहाँ शुरू हुआ था, और उस पर आप जो कुछ कर सकते हैं वह उसके सौदे के पेज पर है।',
    asBuyer: 'आप खरीदते हैं',
    asSeller: 'आप बेचते हैं',
    open: 'सौदा खोलें',
    empty: 'यहाँ निपटाने को कुछ नहीं। आपकी सभी डील नए एस्क्रो पर चलती हैं।',
    link: 'नए एस्क्रो से पहले के सौदे: {n}',
  },
  sw: {
    tag: 'Kabla ya escrow mpya',
    title: 'Mikataba ya kabla ya escrow mpya',
    body: 'Mikataba hii ilifunguliwa kabla Karwan haijahamia escrow yake mpya. Kila mmoja unamalizika pale ulipoanzia, na kila unachoweza kufanya juu yake kiko kwenye ukurasa wake.',
    asBuyer: 'Unanunua',
    asSeller: 'Unauza',
    open: 'Fungua mkataba',
    empty: 'Hakuna cha kumalizia hapa. Mikataba yako yote inaendeshwa kwenye escrow mpya.',
    link: 'Mikataba ya kabla ya escrow mpya: {n}',
  },
};
