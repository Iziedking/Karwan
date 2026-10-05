/// A person's own requests as a list: what was asked, the budget and the due date.
export interface RequestListCopy {
  untitled: string;
  upTo: string;
  due: string;
  showMore: string;
}

export const requestListCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', RequestListCopy> = {
  en: { untitled: 'A request', upTo: 'Up to {amount} USDC', due: 'due {when}', showMore: 'Show more' },
  fr: { untitled: 'Une demande', upTo: "Jusqu'à {amount} USDC", due: 'échéance {when}', showMore: 'Afficher plus' },
  ar: { untitled: 'طلب', upTo: 'حتى {amount} USDC', due: 'الموعد {when}', showMore: 'عرض المزيد' },
  hi: { untitled: 'एक अनुरोध', upTo: '{amount} USDC तक', due: 'समय-सीमा {when}', showMore: 'और दिखाएँ' },
  sw: { untitled: 'Ombi', upTo: 'Hadi USDC {amount}', due: 'mwisho {when}', showMore: 'Onyesha zaidi' },
};
