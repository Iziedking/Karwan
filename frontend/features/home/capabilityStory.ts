import type { Locale } from '@/shared/i18n/locales';

// Shared by Home and the no-network verification suite.
export const CAPABILITIES = [
  { id: 'anywhere', href: '/p2p' },
  { id: 'market', href: '/market' },
  { id: 'research', href: '/partners' },
  { id: 'settlement', href: '/account' },
  { id: 'reputation', href: '/stake' },
] as const;
export type CapabilityId = (typeof CAPABILITIES)[number]['id'];
export const STORY_INTERVAL_MS = 6500;

export function canRotateStory(state: { paused: boolean; reduced: boolean; hovered: boolean; visible: boolean; inView: boolean }) {
  return !state.paused && !state.reduced && !state.hovered && state.visible && state.inView;
}

type SceneCopy = { label: string; title: string; body: string; action: string; from: string; to: string };
type StoryCopy = {
  heading: string; pause: string; play: string; controls: string; guide: string;
  scenes: Record<CapabilityId, SceneCopy>;
};

export const CAPABILITY_COPY: Record<Locale, StoryCopy> = {
  en: {
    heading: 'The open market for internet trade', pause: 'Pause animation', play: 'Play animation', controls: 'What you can do on Karwan', guide: 'How it works',
    scenes: {
      anywhere: { label: 'Trade anywhere', title: 'Meet anywhere. Trade on Karwan.', body: 'Found a buyer or seller on Instagram, X, TikTok, or down the street? Bring the deal here, set the delivery terms, and protect payment together.', action: 'Bring a deal', from: 'Your conversation', to: 'Your Karwan deal' },
      market: { label: 'Open market', title: 'Find what you want to buy or sell.', body: 'Browse requests, offers, and businesses across goods and services. Meet the other side, review the available record, and decide whether to trade.', action: 'Explore the market', from: 'Requests and offers', to: 'A buyer or seller' },
      research: { label: 'Agent checks', title: 'Know who you are trading with.', body: 'Review a counterparty’s Karwan history and available evidence. Agents help with matching and research. You decide who to trade with.', action: 'Explore counterparties', from: 'Available evidence', to: 'Your decision' },
      settlement: { label: 'USDC settlement', title: 'One currency for your next deal.', body: 'Agree a price in USDC and secure it against delivery. This build uses test USDC. Live settlement and local bank payouts are still to come.', action: 'View USDC balance', from: 'Agreed terms', to: 'Protected USDC payment' },
      reputation: { label: 'Track record', title: 'Reliable trade should count.', body: 'Keep a record of completed Karwan trades, delivery, and payment. Let the next person you trade with review it.', action: 'View your track record', from: 'Completed trades', to: 'A record you can share' },
    },
  },
  fr: {
    heading: 'Le marché ouvert du commerce sur internet', pause: 'Mettre en pause', play: 'Lancer l’animation', controls: 'Ce que vous pouvez faire sur Karwan', guide: 'Comment ça marche',
    scenes: {
      anywhere: { label: 'Commerce partout', title: 'Rencontrez-vous ailleurs. Traitez sur Karwan.', body: 'Vous avez trouvé un acheteur ou un vendeur sur Instagram, X, TikTok ou près de chez vous ? Apportez l’accord ici, fixez la livraison et protégez le paiement ensemble.', action: 'Apporter un accord', from: 'Votre conversation', to: 'Votre accord Karwan' },
      market: { label: 'Marché ouvert', title: 'Trouvez ce que vous voulez acheter ou vendre.', body: 'Parcourez les demandes, les offres et les entreprises pour des biens et des services. Consultez le dossier disponible et décidez si vous voulez traiter.', action: 'Explorer le marché', from: 'Demandes et offres', to: 'Un acheteur ou vendeur' },
      research: { label: 'Aide des agents', title: 'Sachez avec qui vous traitez.', body: 'Consultez l’historique Karwan et les éléments disponibles. Les agents aident à trouver et à évaluer des partenaires. Vous choisissez avec qui traiter.', action: 'Explorer les partenaires', from: 'Éléments disponibles', to: 'Votre décision' },
      settlement: { label: 'Paiement USDC', title: 'Une devise pour votre prochain accord.', body: 'Fixez le prix en USDC et protégez-le selon la livraison. Cette version utilise des USDC de test. Le règlement réel et les retraits bancaires sont prévus plus tard.', action: 'Voir le solde USDC', from: 'Conditions convenues', to: 'Paiement USDC protégé' },

      reputation: { label: 'Historique', title: 'La fiabilité commerciale doit compter.', body: 'Conservez un dossier de vos échanges Karwan terminés, des livraisons et des paiements. Montrez-le à votre prochaine contrepartie.', action: 'Voir votre historique', from: 'Échanges terminés', to: 'Un historique à partager' },
    },
  },
  ar: {
    heading: 'السوق المفتوح للتجارة عبر الإنترنت', pause: 'إيقاف الحركة', play: 'تشغيل الحركة', controls: 'ما يمكنك فعله على Karwan', guide: 'كيف يعمل',
    scenes: {
      anywhere: { label: 'تجارة من أي مكان', title: 'تعارف في أي مكان. تعامل على Karwan.', body: 'وجدت مشتريًا أو بائعًا على Instagram أو X أو TikTok أو بالقرب منك؟ أحضر الصفقة إلى هنا وحدد شروط التسليم واحمِ الدفع معًا.', action: 'أحضر اتفاقًا', from: 'محادثتك', to: 'اتفاقك على Karwan' },
      market: { label: 'السوق المفتوح', title: 'اعثر على ما تريد شراءه أو بيعه.', body: 'تصفح الطلبات والعروض والشركات للسلع والخدمات. راجع السجل المتاح ثم قرر إن كنت ستتاجر مع الطرف الآخر.', action: 'استكشف السوق', from: 'طلبات وعروض', to: 'مشتري أو بائع' },
      research: { label: 'مساعدة الوكلاء', title: 'اعرف من تتعامل معه.', body: 'راجع سجل الطرف الآخر على Karwan والأدلة المتاحة. يساعد الوكلاء في المطابقة والبحث. أنت تختار من تتعامل معه.', action: 'استكشف الأطراف', from: 'الأدلة المتاحة', to: 'قرارك' },
      settlement: { label: 'تسوية USDC', title: 'عملة واحدة لاتفاقك القادم.', body: 'اتفق على السعر بعملة USDC واربط حمايته بالتسليم. تستخدم هذه النسخة USDC تجريبيًا. التسوية الفعلية والتحويل إلى البنوك المحلية مخططان لاحقًا.', action: 'عرض رصيد USDC', from: 'شروط متفق عليها', to: 'دفع USDC محمي' },
      reputation: { label: 'سجل التعاملات', title: 'التجارة الموثوقة يجب أن تُحسب.', body: 'احتفظ بسجل تعاملات Karwan المكتملة والتسليم والدفع. اعرضه على الطرف التالي الذي تتعامل معه.', action: 'عرض سجلّك', from: 'تعاملات مكتملة', to: 'سجل يمكنك مشاركته' },
    },
  },
  hi: {
    heading: 'इंटरनेट व्यापार के लिए खुला बाज़ार', pause: 'एनिमेशन रोकें', play: 'एनिमेशन चलाएँ', controls: 'Karwan पर आप क्या कर सकते हैं', guide: 'यह कैसे काम करता है',
    scenes: {
      anywhere: { label: 'कहीं से भी व्यापार', title: 'कहीं भी मिलें। Karwan पर सौदा करें।', body: 'Instagram, X, TikTok या अपने आस-पास कोई खरीदार या विक्रेता मिला? सौदा यहाँ लाएँ, डिलीवरी की शर्तें तय करें और भुगतान सुरक्षित करें।', action: 'अपना सौदा लाएँ', from: 'आपकी बातचीत', to: 'आपका Karwan सौदा' },
      market: { label: 'खुला बाज़ार', title: 'जो खरीदना या बेचना है, उसे खोजें।', body: 'सामान और सेवाओं के अनुरोध, ऑफ़र और व्यवसाय देखें। उपलब्ध रिकॉर्ड जाँचें और तय करें कि व्यापार करना है या नहीं।', action: 'बाज़ार देखें', from: 'अनुरोध और ऑफ़र', to: 'खरीदार या विक्रेता' },
      research: { label: 'एजेंट की मदद', title: 'जानें कि आप किससे सौदा कर रहे हैं।', body: 'दूसरे पक्ष का Karwan इतिहास और उपलब्ध प्रमाण देखें। एजेंट मिलान और शोध में मदद करते हैं। किससे सौदा करना है, आप तय करते हैं।', action: 'व्यापार साथी देखें', from: 'उपलब्ध प्रमाण', to: 'आपका निर्णय' },
      settlement: { label: 'USDC भुगतान', title: 'अगले सौदे के लिए एक मुद्रा।', body: 'USDC में कीमत तय करें और डिलीवरी के आधार पर सुरक्षित करें। यह संस्करण टेस्ट USDC इस्तेमाल करता है। असली भुगतान और स्थानीय बैंक निकासी बाद में आएँगे।', action: 'USDC बैलेंस देखें', from: 'तय शर्तें', to: 'सुरक्षित USDC भुगतान' },
      reputation: { label: 'व्यापार रिकॉर्ड', title: 'भरोसेमंद व्यापार की पहचान होनी चाहिए।', body: 'पूरे हुए Karwan सौदों, डिलीवरी और भुगतान का रिकॉर्ड रखें। इसे अगले व्यापार साथी को दिखाएँ।', action: 'अपना रिकॉर्ड देखें', from: 'पूरे हुए सौदे', to: 'साझा करने योग्य रिकॉर्ड' },
    },
  },
  sw: {
    heading: 'Soko wazi la biashara mtandaoni', pause: 'Sitisha uhuishaji', play: 'Endelea na uhuishaji', controls: 'Unachoweza kufanya kwenye Karwan', guide: 'Jinsi inavyofanya kazi',
    scenes: {
      anywhere: { label: 'Biashara popote', title: 'Kutana popote. Fanya biashara Karwan.', body: 'Umepata mnunuzi au muuzaji Instagram, X, TikTok au karibu nawe? Leta biashara hapa, weka masharti ya uwasilishaji na linda malipo pamoja.', action: 'Leta makubaliano', from: 'Mazungumzo yako', to: 'Makubaliano ya Karwan' },
      market: { label: 'Soko wazi', title: 'Pata unachotaka kununua au kuuza.', body: 'Angalia maombi, ofa na biashara za bidhaa na huduma. Kagua rekodi iliyopo na uamue kama utafanya biashara.', action: 'Chunguza soko', from: 'Maombi na ofa', to: 'Mnunuzi au muuzaji' },
      research: { label: 'Msaada wa wakala', title: 'Mjue unayefanya naye biashara.', body: 'Kagua historia yake ya Karwan na ushahidi uliopo. Mawakala husaidia kupata washirika na kufanya utafiti. Wewe unaamua ufanye biashara na nani.', action: 'Chunguza washirika', from: 'Ushahidi uliopo', to: 'Uamuzi wako' },
      settlement: { label: 'Malipo ya USDC', title: 'Sarafu moja kwa makubaliano yako.', body: 'Kubalianeni bei kwa USDC na ilinde kulingana na uwasilishaji. Toleo hili hutumia USDC ya majaribio. Malipo halisi na kutoa pesa benki bado vinapangwa.', action: 'Angalia salio la USDC', from: 'Masharti yaliyokubaliwa', to: 'Malipo ya USDC yaliyolindwa' },
      reputation: { label: 'Rekodi ya biashara', title: 'Biashara ya kuaminika inapaswa kutambulika.', body: 'Hifadhi rekodi ya biashara za Karwan zilizokamilika, uwasilishaji na malipo. Mwonyeshe mshirika wako ajaye.', action: 'Angalia rekodi yako', from: 'Biashara zilizokamilika', to: 'Rekodi unayoweza kushiriki' },
    },
  },
};
