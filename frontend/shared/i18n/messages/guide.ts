/// Aman, the guide with a face (view 57). {name} is the person's first name,
/// {page} the page the assistant was opened from.

export const QUESTION_KEYS = [
  'deal.money',
  'deal.approvePart',
  'deal.moveDate',
  'market.safe',
  'market.post',
  'market.cost',
  'money.where',
  'money.withdraw',
  'money.agent',
  'home.first',
  'home.findSeller',
  'home.getPaid',
] as const;

export type QuestionKey = (typeof QUESTION_KEYS)[number];

export interface GuideCopy {
  label: string;
  open: string;
  notNow: string;
  menu: { ask: string; askSub: string; quiet: string; quietSub: string; hide: string; hideSub: string };
  showGuide: string;
  showGuideInfo: string;
  greeting: string;
  from: string;
  box: string;
  person: string;
  questions: Record<QuestionKey, string>;
}

const en: GuideCopy = {
  label: 'Aman',
  open: 'Open Aman',
  notNow: 'Not now',
  menu: {
    ask: 'Ask Aman',
    askSub: 'Opens the assistant page',
    quiet: 'Not on this page',
    quietSub: 'Quiet here for this visit',
    hide: 'Hide the guide',
    hideSub: 'A small face in the top bar',
  },
  showGuide: 'Show the guide on pages',
  showGuideInfo: 'Aman sits beside the page with your next move. Off: open Aman from the menu or Ctrl+K.',
  greeting: 'Hi {name}. What do you want to do?',
  from: 'From {page}',
  box: 'Ask or tell Aman anything',
  person: 'Talk to a person',
  questions: {
    'deal.money': "What happens to my money if they don't deliver?",
    'deal.approvePart': 'How do I approve a part?',
    'deal.moveDate': 'Ask them to move the date',
    'market.safe': 'How do I know a seller is safe?',
    'market.post': 'Post what I need',
    'market.cost': 'What does Karwan cost?',
    'money.where': 'Where is my money?',
    'money.withdraw': 'How do I withdraw to my bank?',
    'money.agent': 'Why is some of it with my agent?',
    'home.first': 'What should I do first?',
    'home.findSeller': 'Find me a seller',
    'home.getPaid': 'How do I get paid?',
  },
};

const fr: GuideCopy = {
  label: 'Aman',
  open: 'Ouvrir Aman',
  notNow: 'Pas maintenant',
  menu: {
    ask: 'Demander à Aman',
    askSub: "Ouvre la page de l'assistant",
    quiet: 'Pas sur cette page',
    quietSub: 'Silence ici pour cette visite',
    hide: 'Masquer le guide',
    hideSub: 'Un petit visage dans la barre du haut',
  },
  showGuide: 'Afficher le guide sur les pages',
  showGuideInfo: "Aman se tient à côté de la page avec votre prochaine étape. Désactivé : ouvrez Aman depuis le menu ou avec Ctrl+K.",
  greeting: 'Bonjour {name}. Que voulez-vous faire ?',
  from: 'Depuis {page}',
  box: 'Demandez ou dites tout à Aman',
  person: 'Parler à une personne',
  questions: {
    'deal.money': "Qu'arrive-t-il à mon argent s'ils ne livrent pas ?",
    'deal.approvePart': 'Comment approuver une partie ?',
    'deal.moveDate': 'Leur demander de changer la date',
    'market.safe': 'Comment savoir si un vendeur est fiable ?',
    'market.post': "Publier ce dont j'ai besoin",
    'market.cost': 'Combien coûte Karwan ?',
    'money.where': 'Où est mon argent ?',
    'money.withdraw': 'Comment retirer vers ma banque ?',
    'money.agent': 'Pourquoi une partie est-elle chez mon agent ?',
    'home.first': 'Que dois-je faire en premier ?',
    'home.findSeller': 'Trouvez-moi un vendeur',
    'home.getPaid': 'Comment être payé ?',
  },
};

const ar: GuideCopy = {
  label: 'أمان',
  open: 'افتح أمان',
  notNow: 'ليس الآن',
  menu: {
    ask: 'اسأل أمان',
    askSub: 'يفتح صفحة المساعد',
    quiet: 'ليس في هذه الصفحة',
    quietSub: 'هدوء هنا خلال هذه الزيارة',
    hide: 'إخفاء الدليل',
    hideSub: 'وجه صغير في الشريط العلوي',
  },
  showGuide: 'إظهار الدليل في الصفحات',
  showGuideInfo: 'يجلس أمان بجانب الصفحة ومعه خطوتك التالية. عند الإيقاف: افتح أمان من القائمة أو بـ Ctrl+K.',
  greeting: 'مرحبًا {name}. ماذا تريد أن تفعل؟',
  from: 'من {page}',
  box: 'اسأل أمان أو أخبره بأي شيء',
  person: 'تحدث إلى شخص',
  questions: {
    'deal.money': 'ماذا يحدث لأموالي إذا لم يسلّموا؟',
    'deal.approvePart': 'كيف أوافق على جزء؟',
    'deal.moveDate': 'اطلب منهم تغيير الموعد',
    'market.safe': 'كيف أعرف أن البائع موثوق؟',
    'market.post': 'انشر ما أحتاجه',
    'market.cost': 'كم تكلّف Karwan؟',
    'money.where': 'أين أموالي؟',
    'money.withdraw': 'كيف أسحب إلى حسابي البنكي؟',
    'money.agent': 'لماذا جزء منها مع وكيلي؟',
    'home.first': 'ماذا أفعل أولًا؟',
    'home.findSeller': 'ابحث لي عن بائع',
    'home.getPaid': 'كيف أتلقى أموالي؟',
  },
};

const hi: GuideCopy = {
  label: 'अमान',
  open: 'अमान खोलें',
  notNow: 'अभी नहीं',
  menu: {
    ask: 'अमान से पूछें',
    askSub: 'सहायक का पेज खोलता है',
    quiet: 'इस पेज पर नहीं',
    quietSub: 'इस विज़िट में यहां चुप',
    hide: 'गाइड छिपाएं',
    hideSub: 'ऊपर की पट्टी में एक छोटा चेहरा',
  },
  showGuide: 'पेजों पर गाइड दिखाएं',
  showGuideInfo: 'अमान आपके अगले कदम के साथ पेज के पास रहता है। बंद होने पर: मेनू से या Ctrl+K से अमान खोलें।',
  greeting: 'नमस्ते {name}। आप क्या करना चाहते हैं?',
  from: '{page} से',
  box: 'अमान से कुछ भी पूछें या कहें',
  person: 'किसी व्यक्ति से बात करें',
  questions: {
    'deal.money': 'अगर वे डिलीवर नहीं करते तो मेरे पैसे का क्या होगा?',
    'deal.approvePart': 'मैं एक हिस्सा कैसे मंज़ूर करूं?',
    'deal.moveDate': 'उनसे तारीख बदलने को कहें',
    'market.safe': 'मैं कैसे जानूं कि विक्रेता भरोसेमंद है?',
    'market.post': 'जो चाहिए वह पोस्ट करें',
    'market.cost': 'Karwan की लागत क्या है?',
    'money.where': 'मेरा पैसा कहां है?',
    'money.withdraw': 'मैं अपने बैंक में कैसे निकालूं?',
    'money.agent': 'इसका कुछ हिस्सा मेरे एजेंट के पास क्यों है?',
    'home.first': 'मुझे पहले क्या करना चाहिए?',
    'home.findSeller': 'मेरे लिए विक्रेता ढूंढें',
    'home.getPaid': 'मुझे भुगतान कैसे मिलेगा?',
  },
};

const sw: GuideCopy = {
  label: 'Aman',
  open: 'Fungua Aman',
  notNow: 'Si sasa',
  menu: {
    ask: 'Uliza Aman',
    askSub: 'Hufungua ukurasa wa msaidizi',
    quiet: 'Si kwenye ukurasa huu',
    quietSub: 'Kimya hapa kwa ziara hii',
    hide: 'Ficha mwongozo',
    hideSub: 'Uso mdogo kwenye upau wa juu',
  },
  showGuide: 'Onyesha mwongozo kwenye kurasa',
  showGuideInfo: 'Aman hukaa kando ya ukurasa na hatua yako inayofuata. Ukizima: fungua Aman kutoka kwenye menyu au kwa Ctrl+K.',
  greeting: 'Habari {name}. Unataka kufanya nini?',
  from: 'Kutoka {page}',
  box: 'Uliza au mwambie Aman chochote',
  person: 'Ongea na mtu',
  questions: {
    'deal.money': 'Pesa yangu itakuwaje wasipowasilisha?',
    'deal.approvePart': 'Ninaidhinishaje sehemu moja?',
    'deal.moveDate': 'Waombe wabadilishe tarehe',
    'market.safe': 'Ninajuaje kwamba muuzaji ni salama?',
    'market.post': 'Weka ninachohitaji',
    'market.cost': 'Karwan inagharimu kiasi gani?',
    'money.where': 'Pesa yangu iko wapi?',
    'money.withdraw': 'Ninatoaje pesa kwenda benki yangu?',
    'money.agent': 'Kwa nini sehemu yake iko kwa wakala wangu?',
    'home.first': 'Nifanye nini kwanza?',
    'home.findSeller': 'Nitafutie muuzaji',
    'home.getPaid': 'Ninalipwaje?',
  },
};

export const guideCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', GuideCopy> = { en, ar, fr, hi, sw };
