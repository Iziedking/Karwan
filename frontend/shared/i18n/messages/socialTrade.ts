import type { SocialTradeId } from '@/features/home/socialTradeExamples';

type ExampleCopy = { title: string; message: string; first: string; final: string };
export interface SocialTradeCopy {
  label: string; title: string; body: string; action: string;
  controls: string; select: string; pause: string; play: string;
  illustration: string; disclaimer: string; conversation: string;
  draft: string; value: string; delivery: string; days: string;
  milestones: string; review: string; handoff: string;
  examples: Record<SocialTradeId, ExampleCopy>;
}

export const socialTradeCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', SocialTradeCopy> = {
  en: {
    label: 'Trade from anywhere', title: 'Meet anywhere. Make it a deal.',
    body: 'The right buyer or seller might be in your next message. Bring the conversation to Karwan. Agree on delivery and payment before either side commits.',
    action: 'Bring a deal', controls: 'Explore example trades', select: 'Show {platform} example', pause: 'Pause examples', play: 'Play examples',
    illustration: 'Example agreement', disclaimer: 'Illustrative trades, not live activity. You bring the terms to Karwan. No social account is connected.',
    conversation: 'The conversation', draft: 'Draft agreement', value: 'Deal value', delivery: 'Delivery', days: '{days} days',
    milestones: 'Proposed milestones', review: 'For both sides to review', handoff: 'Bring the terms to Karwan',
    examples: {
      tiktok: { title: '200 custom tote bags', message: 'Can you make 200 tote bags with our artwork?', first: 'Sample approved', final: 'Order delivered' },
      instagram: { title: '80 leather sandals', message: 'We’d like 80 pairs for our next collection.', first: 'Design confirmed', final: 'Order delivered' },
      facebook: { title: '40 solar lamps', message: 'Can you supply 40 solar lamps for our shop?', first: 'Order confirmed', final: 'Delivery reviewed' },
      x: { title: 'Lagos to Accra freight', message: 'We need a carrier for a Lagos to Accra shipment.', first: 'Pickup confirmed', final: 'Delivery confirmed' },
      linkedin: { title: 'A new brand website', message: 'Could you design and build our new website?', first: 'Design reviewed', final: 'Website handed over' },
    },
  },
  ar: {
    label: 'تجارة من أي مكان', title: 'تعارف أينما كنت. واتفق على الصفقة.',
    body: 'قد تجد المشتري أو البائع المناسب في رسالتك القادمة. أحضر المحادثة إلى Karwan واتفقا على التسليم والدفع قبل أن يلتزم أي طرف.',
    action: 'أحضر صفقة', controls: 'استكشف أمثلة الصفقات', select: 'اعرض مثال {platform}', pause: 'أوقف الأمثلة مؤقتاً', play: 'شغّل الأمثلة',
    illustration: 'مثال على اتفاق', disclaimer: 'صفقات توضيحية وليست نشاطاً مباشراً. أنت تنقل الشروط إلى Karwan. لا يتم ربط أي حساب اجتماعي.',
    conversation: 'المحادثة', draft: 'مسودة الاتفاق', value: 'قيمة الصفقة', delivery: 'التسليم', days: '{days} يوم',
    milestones: 'المراحل المقترحة', review: 'ليراجعه الطرفان', handoff: 'انقل الشروط إلى Karwan',
    examples: {
      tiktok: { title: '200 حقيبة قماش مخصصة', message: 'هل يمكنكم صنع 200 حقيبة قماش بتصميمنا؟', first: 'اعتماد العينة', final: 'تسليم الطلب' },
      instagram: { title: '80 صندلاً جلدياً', message: 'نريد 80 زوجاً لمجموعتنا القادمة.', first: 'تأكيد التصميم', final: 'تسليم الطلب' },
      facebook: { title: '40 مصباحاً شمسياً', message: 'هل يمكنكم توريد 40 مصباحاً شمسياً لمتجرنا؟', first: 'تأكيد الطلب', final: 'مراجعة التسليم' },
      x: { title: 'شحن من لاغوس إلى أكرا', message: 'نحتاج ناقلاً لشحنة من لاغوس إلى أكرا.', first: 'تأكيد الاستلام', final: 'تأكيد التسليم' },
      linkedin: { title: 'موقع جديد للعلامة التجارية', message: 'هل يمكنكم تصميم وبناء موقعنا الجديد؟', first: 'مراجعة التصميم', final: 'تسليم الموقع' },
    },
  },
  fr: {
    label: 'Le commerce, partout', title: 'Rencontrez-vous ailleurs. Concluez ici.',
    body: 'Votre prochain message pourrait venir du bon acheteur ou vendeur. Poursuivez sur Karwan. Convenez de la livraison et du paiement avant de vous engager.',
    action: 'Proposer un accord', controls: 'Explorer des exemples d’accords', select: 'Voir l’exemple {platform}', pause: 'Mettre en pause', play: 'Lire les exemples',
    illustration: 'Exemple d’accord', disclaimer: 'Accords illustratifs, pas une activité en direct. Vous apportez les conditions à Karwan. Aucun compte social n’est connecté.',
    conversation: 'La conversation', draft: 'Projet d’accord', value: 'Valeur de l’accord', delivery: 'Livraison', days: '{days} jours',
    milestones: 'Étapes proposées', review: 'À examiner par les deux parties', handoff: 'Apportez les conditions à Karwan',
    examples: {
      tiktok: { title: '200 sacs personnalisés', message: 'Pouvez-vous fabriquer 200 sacs avec notre motif ?', first: 'Échantillon approuvé', final: 'Commande livrée' },
      instagram: { title: '80 sandales en cuir', message: 'Nous souhaitons 80 paires pour notre prochaine collection.', first: 'Modèle confirmé', final: 'Commande livrée' },
      facebook: { title: '40 lampes solaires', message: 'Pouvez-vous fournir 40 lampes solaires pour notre boutique ?', first: 'Commande confirmée', final: 'Livraison examinée' },
      x: { title: 'Transport de Lagos à Accra', message: 'Nous cherchons un transporteur pour un envoi de Lagos à Accra.', first: 'Enlèvement confirmé', final: 'Livraison confirmée' },
      linkedin: { title: 'Un nouveau site de marque', message: 'Pourriez-vous concevoir et réaliser notre nouveau site ?', first: 'Maquette examinée', final: 'Site remis' },
    },
  },
  hi: {
    label: 'कहीं से भी व्यापार', title: 'कहीं भी मिलें। सौदा यहाँ करें।',
    body: 'अगला संदेश सही खरीदार या विक्रेता से आ सकता है। बातचीत को Karwan पर लाएँ। किसी भी पक्ष की प्रतिबद्धता से पहले डिलीवरी और भुगतान पर सहमत हों।',
    action: 'सौदा लाएँ', controls: 'उदाहरण सौदे देखें', select: '{platform} का उदाहरण देखें', pause: 'उदाहरण रोकें', play: 'उदाहरण चलाएँ',
    illustration: 'समझौते का उदाहरण', disclaimer: 'ये उदाहरण हैं, लाइव गतिविधि नहीं। आप शर्तें Karwan पर लाते हैं। कोई सोशल खाता जुड़ा नहीं है।',
    conversation: 'बातचीत', draft: 'समझौते का मसौदा', value: 'सौदे का मूल्य', delivery: 'डिलीवरी', days: '{days} दिन',
    milestones: 'प्रस्तावित चरण', review: 'दोनों पक्षों की समीक्षा के लिए', handoff: 'शर्तें Karwan पर लाएँ',
    examples: {
      tiktok: { title: '200 कस्टम टोट बैग', message: 'क्या आप हमारे डिज़ाइन वाले 200 टोट बैग बना सकते हैं?', first: 'नमूना स्वीकृत', final: 'ऑर्डर की डिलीवरी' },
      instagram: { title: 'चमड़े के 80 सैंडल', message: 'हमें अपने अगले संग्रह के लिए 80 जोड़े चाहिए।', first: 'डिज़ाइन की पुष्टि', final: 'ऑर्डर की डिलीवरी' },
      facebook: { title: '40 सोलर लैंप', message: 'क्या आप हमारी दुकान के लिए 40 सोलर लैंप दे सकते हैं?', first: 'ऑर्डर की पुष्टि', final: 'डिलीवरी की समीक्षा' },
      x: { title: 'लागोस से अक्रा माल ढुलाई', message: 'हमें लागोस से अक्रा शिपमेंट के लिए वाहक चाहिए।', first: 'पिकअप की पुष्टि', final: 'डिलीवरी की पुष्टि' },
      linkedin: { title: 'ब्रांड की नई वेबसाइट', message: 'क्या आप हमारी नई वेबसाइट डिज़ाइन और बना सकते हैं?', first: 'डिज़ाइन की समीक्षा', final: 'वेबसाइट का हस्तांतरण' },
    },
  },
  sw: {
    label: 'Biashara kutoka popote', title: 'Kutana popote. Kubalianeni hapa.',
    body: 'Ujumbe wako unaofuata unaweza kuwa kutoka kwa mnunuzi au muuzaji anayefaa. Leta mazungumzo Karwan. Kubalianeni uwasilishaji na malipo kabla ya yeyote kujifunga.',
    action: 'Leta biashara', controls: 'Chunguza mifano ya biashara', select: 'Onyesha mfano wa {platform}', pause: 'Sitisha mifano', play: 'Endeleza mifano',
    illustration: 'Mfano wa makubaliano', disclaimer: 'Biashara za mfano, si shughuli za moja kwa moja. Unaleta masharti Karwan. Hakuna akaunti ya kijamii iliyounganishwa.',
    conversation: 'Mazungumzo', draft: 'Rasimu ya makubaliano', value: 'Thamani ya biashara', delivery: 'Uwasilishaji', days: 'Siku {days}',
    milestones: 'Hatua zinazopendekezwa', review: 'Kwa pande zote kukagua', handoff: 'Leta masharti Karwan',
    examples: {
      tiktok: { title: 'Mifuko 200 yenye chapa', message: 'Mnaweza kutengeneza mifuko 200 yenye mchoro wetu?', first: 'Sampuli imeidhinishwa', final: 'Oda imewasilishwa' },
      instagram: { title: 'Sandali 80 za ngozi', message: 'Tungependa jozi 80 kwa mkusanyiko wetu ujao.', first: 'Muundo umethibitishwa', final: 'Oda imewasilishwa' },
      facebook: { title: 'Taa 40 za sola', message: 'Mnaweza kusambaza taa 40 za sola kwa duka letu?', first: 'Oda imethibitishwa', final: 'Uwasilishaji umekaguliwa' },
      x: { title: 'Mizigo kutoka Lagos hadi Accra', message: 'Tunahitaji msafirishaji wa mzigo kutoka Lagos hadi Accra.', first: 'Uchukuaji umethibitishwa', final: 'Uwasilishaji umethibitishwa' },
      linkedin: { title: 'Tovuti mpya ya chapa', message: 'Mnaweza kubuni na kujenga tovuti yetu mpya?', first: 'Muundo umekaguliwa', final: 'Tovuti imekabidhiwa' },
    },
  },
};
