/// How a deal reaches the buyer (view 85): online, in person or shipped. The
/// request form asks it, the deal page and deal rows name it, and Deals filters by it.

export type DeliveryMethod = 'online' | 'in_person' | 'shipped';

export interface DeliveryMethodCopy {
  label: Record<DeliveryMethod, string>;
  /// What each one means, under the choice on the request form.
  hint: Record<DeliveryMethod, string>;
  question: string;
  filterLabel: string;
  all: string;
}

export const deliveryMethodCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', DeliveryMethodCopy> = {
  en: {
    label: { online: 'Online', in_person: 'In person', shipped: 'Shipped' },
    hint: { online: 'Sent as a link or a file', in_person: 'Done or handed over at a place', shipped: 'Sent by a carrier' },
    question: 'How does it reach you?',
    filterLabel: 'How it arrives',
    all: 'All',
  },
  fr: {
    label: { online: 'En ligne', in_person: 'En personne', shipped: 'Expédié' },
    hint: { online: 'Envoyé par lien ou fichier', in_person: 'Fait ou remis sur place', shipped: 'Envoyé par un transporteur' },
    question: 'Comment cela vous parvient-il ?',
    filterLabel: 'Mode de livraison',
    all: 'Tous',
  },
  ar: {
    label: { online: 'عبر الإنترنت', in_person: 'حضوريًا', shipped: 'بالشحن' },
    hint: { online: 'يُرسل كرابط أو ملف', in_person: 'يُنجز أو يُسلَّم في مكان', shipped: 'يُرسل مع شركة شحن' },
    question: 'كيف يصل إليك؟',
    filterLabel: 'طريقة الوصول',
    all: 'الكل',
  },
  hi: {
    label: { online: 'ऑनलाइन', in_person: 'आमने-सामने', shipped: 'शिप किया गया' },
    hint: { online: 'लिंक या फ़ाइल से भेजा जाता है', in_person: 'किसी जगह पर किया या सौंपा जाता है', shipped: 'कूरियर से भेजा जाता है' },
    question: 'यह आप तक कैसे पहुँचेगा?',
    filterLabel: 'कैसे पहुँचता है',
    all: 'सभी',
  },
  sw: {
    label: { online: 'Mtandaoni', in_person: 'Ana kwa ana', shipped: 'Kwa usafirishaji' },
    hint: { online: 'Hutumwa kama kiungo au faili', in_person: 'Hufanywa au hukabidhiwa mahali', shipped: 'Hutumwa na msafirishaji' },
    question: 'Inakufikiaje?',
    filterLabel: 'Inavyofika',
    all: 'Zote',
  },
};
