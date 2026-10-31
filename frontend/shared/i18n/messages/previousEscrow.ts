/// The deals from before the new escrow, gathered on the legacy page (view 27,
/// "Moving over"). Each still finishes on its own deal page.
export interface PreviousEscrowCopy {
  tag: string;
  title: string;
  body: string;
  asBuyer: string;
  asSeller: string;
  open: string;
  /// The quiet link from Your trades to the legacy page, with the count.
  link: string;
}

export const previousEscrowCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', PreviousEscrowCopy> = {
  en: {
    tag: 'Before the new escrow',
    title: 'Earlier deals',
    body: 'These deals opened before Karwan moved to its new escrow. Each one finishes where it started, and everything you can do on it is on its deal page.',
    asBuyer: 'You buy',
    asSeller: 'You sell',
    open: 'Open deal',
    link: 'Earlier deals: {n}',
  },
  fr: {
    tag: 'Avant le nouveau séquestre',
    title: 'Accords précédents',
    body: 'Ces accords ont été ouverts avant le passage de Karwan à son nouveau séquestre. Chacun se termine là où il a commencé, et tout ce que vous pouvez y faire se trouve sur sa page.',
    asBuyer: 'Vous achetez',
    asSeller: 'Vous vendez',
    open: 'Ouvrir l’accord',
    link: 'Accords précédents : {n}',
  },
  ar: {
    tag: 'قبل الضمان الجديد',
    title: 'الصفقات السابقة',
    body: 'فُتحت هذه الصفقات قبل انتقال Karwan إلى نظام الضمان الجديد. تنتهي كل صفقة حيث بدأت، وكل ما يمكنك فعله فيها موجود في صفحتها.',
    asBuyer: 'أنت تشتري',
    asSeller: 'أنت تبيع',
    open: 'افتح الصفقة',
    link: 'الصفقات السابقة: {n}',
  },
  hi: {
    tag: 'नए एस्क्रो से पहले',
    title: 'पिछले सौदे',
    body: 'ये सौदे Karwan के नए एस्क्रो पर जाने से पहले खुले थे। हर सौदा वहीं पूरा होता है जहाँ शुरू हुआ था, और उस पर आप जो कुछ कर सकते हैं वह उसके सौदे के पेज पर है।',
    asBuyer: 'आप खरीदते हैं',
    asSeller: 'आप बेचते हैं',
    open: 'सौदा खोलें',
    link: 'पिछले सौदे: {n}',
  },
  sw: {
    tag: 'Kabla ya escrow mpya',
    title: 'Mikataba ya awali',
    body: 'Mikataba hii ilifunguliwa kabla Karwan haijahamia escrow yake mpya. Kila mmoja unamalizika pale ulipoanzia, na kila unachoweza kufanya juu yake kiko kwenye ukurasa wake.',
    asBuyer: 'Unanunua',
    asSeller: 'Unauza',
    open: 'Fungua mkataba',
    link: 'Mikataba ya awali: {n}',
  },
};
