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

export type MomentLineKey = 'paid' | 'released' | 'tier' | 'lapsed' | 'late' | 'pocketPaid' | 'broke' | 'offer' | 'entry';

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
  /// The day's hello on Home (view 57, 15 Nov evening). {name} is the first name.
  hello: string;
  /// One line and one button per moment; {amount} is money in the person's currency.
  moments: Record<MomentLineKey, { line: string; action: string }>;
  /// The page tour with Aman: the offer, its buttons, the menu item and the step header.
  tour: { offer: string; showMe: string; showAround: string; step: string };
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
  hello: 'Good to see you, {name}!',
  moments: {
    paid: { line: 'You were paid {amount}.', action: 'See it' },
    released: { line: 'Your buyer released the money.', action: 'See the deal' },
    tier: { line: 'Your record moved up a level.', action: 'Your record' },
    lapsed: { line: 'That one fell through. Want me to find another?', action: 'Find another' },
    late: { line: 'A deadline passed on a deal.', action: 'See the deal' },
    pocketPaid: { line: 'Part of your savings pocket went to the buyer. Here is why.', action: 'See why' },
    broke: { line: 'Something broke on our side. Your money is safe.', action: 'Try again' },
    offer: { line: 'A new offer came in on your request.', action: 'See the offer' },
    entry: { line: 'Someone entered your contest.', action: 'See the entry' },
  },
  tour: { offer: 'New here? Want a quick look around?', showMe: 'Show me', showAround: 'Show me around', step: 'Aman · {n} of {m}' },
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
  hello: 'Content de vous revoir, {name} !',
  moments: {
    paid: { line: 'Vous avez été payé {amount}.', action: 'Voir' },
    released: { line: 'Votre acheteur a libéré l\'argent.', action: 'Voir le contrat' },
    tier: { line: 'Votre dossier est monté d\'un niveau.', action: 'Votre dossier' },
    lapsed: { line: 'Celui-ci n\'a pas abouti. Je vous en trouve un autre ?', action: 'En trouver un autre' },
    late: { line: 'Une échéance est passée sur un contrat.', action: 'Voir le contrat' },
    pocketPaid: { line: 'Une partie de votre épargne est allée à l\'acheteur. Voici pourquoi.', action: 'Voir pourquoi' },
    broke: { line: 'Un problème est survenu de notre côté. Votre argent est en sécurité.', action: 'Réessayer' },
    offer: { line: 'Une nouvelle offre est arrivée sur votre demande.', action: 'Voir l’offre' },
    entry: { line: 'Quelqu’un a participé à votre concours.', action: 'Voir la participation' },
  },
  tour: { offer: 'Nouveau ici ? Un petit tour de la page ?', showMe: 'Montrez-moi', showAround: 'Faire le tour', step: 'Aman · {n} sur {m}' },
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
  hello: 'سعيد برؤيتك يا {name}!',
  moments: {
    paid: { line: 'وصلك {amount}.', action: 'عرض' },
    released: { line: 'أفرج المشتري عن المال.', action: 'عرض الصفقة' },
    tier: { line: 'ارتفع سجلك مستوى.', action: 'سجلك' },
    lapsed: { line: 'لم تتم هذه الصفقة. هل أبحث لك عن غيرها؟', action: 'ابحث عن غيرها' },
    late: { line: 'انتهى موعد في إحدى الصفقات.', action: 'عرض الصفقة' },
    pocketPaid: { line: 'ذهب جزء من جيب ادخارك إلى المشتري. إليك السبب.', action: 'اعرف السبب' },
    broke: { line: 'حدث خطأ من جهتنا. أموالك في أمان.', action: 'حاول مرة أخرى' },
    offer: { line: 'وصل عرض جديد على طلبك.', action: 'اطّلع على العرض' },
    entry: { line: 'شارك أحدهم في مسابقتك.', action: 'اطّلع على المشاركة' },
  },
  tour: { offer: 'جديد هنا؟ هل تريد جولة سريعة؟', showMe: 'أرني', showAround: 'جولة في الصفحة', step: 'أمان · {n} من {m}' },
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
  hello: 'आपको देखकर अच्छा लगा, {name}!',
  moments: {
    paid: { line: 'आपको {amount} मिले।', action: 'देखें' },
    released: { line: 'आपके खरीदार ने पैसे जारी कर दिए।', action: 'डील देखें' },
    tier: { line: 'आपका रिकॉर्ड एक स्तर ऊपर गया।', action: 'आपका रिकॉर्ड' },
    lapsed: { line: 'यह नहीं हो पाया। क्या मैं दूसरा ढूँढूँ?', action: 'दूसरा ढूँढें' },
    late: { line: 'एक डील की समय सीमा निकल गई।', action: 'डील देखें' },
    pocketPaid: { line: 'आपकी बचत जेब का कुछ हिस्सा खरीदार को गया। कारण यह है।', action: 'कारण देखें' },
    broke: { line: 'हमारी तरफ़ कुछ गड़बड़ हुई। आपका पैसा सुरक्षित है।', action: 'फिर कोशिश करें' },
    offer: { line: 'आपकी माँग पर एक नया ऑफ़र आया है।', action: 'ऑफ़र देखें' },
    entry: { line: 'किसी ने आपकी प्रतियोगिता में हिस्सा लिया।', action: 'प्रविष्टि देखें' },
  },
  tour: { offer: 'यहाँ नए हैं? एक छोटा सा दौरा करें?', showMe: 'दिखाइए', showAround: 'पेज का दौरा', step: 'अमान · {m} में से {n}' },
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
  hello: 'Nafurahi kukuona, {name}!',
  moments: {
    paid: { line: 'Umelipwa {amount}.', action: 'Ona' },
    released: { line: 'Mnunuzi wako ametoa pesa.', action: 'Ona mkataba' },
    tier: { line: 'Rekodi yako imepanda kiwango.', action: 'Rekodi yako' },
    lapsed: { line: 'Huo haukufanikiwa. Nikutafutie mwingine?', action: 'Tafuta mwingine' },
    late: { line: 'Muda wa mkataba mmoja umepita.', action: 'Ona mkataba' },
    pocketPaid: { line: 'Sehemu ya akiba yako imeenda kwa mnunuzi. Hii ndiyo sababu.', action: 'Ona sababu' },
    broke: { line: 'Kuna hitilafu upande wetu. Pesa zako ziko salama.', action: 'Jaribu tena' },
    offer: { line: 'Ofa mpya imefika kwenye ombi lako.', action: 'Angalia ofa' },
    entry: { line: 'Mtu ameingia kwenye shindano lako.', action: 'Angalia maingizo' },
  },
  tour: { offer: 'Mgeni hapa? Ungependa kuzungushwa haraka?', showMe: 'Nionyeshe', showAround: 'Nizungushe', step: 'Aman · {n} kati ya {m}' },
};

export const guideCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', GuideCopy> = { en, ar, fr, hi, sw };
