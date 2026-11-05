/// Deals opened by agents outside Karwan (view 15): the person behind the agent
/// pairs once and answers each delivery; the seller marks the work delivered.
/// Never "evaluator", "escrow", "MCP" or "AgentKit".
export interface AgentJobsCopy {
  pair: { title: string; lead: string; start: string; done: string; doneLead: string };
  release: {
    title: string;
    from: string;
    amount: string;
    delivered: string;
    reviewEnds: string;
    happy: string;
    notHappy: string;
    noteLabel: string;
    noteHint: string;
    sendNotHappy: string;
    paid: string;
    rejected: string;
    payConsequence: string;
    notHappyConsequence: string;
  };
  seller: {
    title: string;
    badge: string;
    youGet: string;
    deadline: string;
    status: { created: string; funded: string; submitted: string; completed: string; rejected: string; disputed: string; refunded: string; expired: string };
    noteLabel: string;
    noteHint: string;
    deliver: string;
    reviewEnds: string;
    unhappy: string;
    disputeBy: string;
    clauseLabel: string;
    dispute: string;
    list: string;
    empty: string;
    deliverConsequence: string;
    disputeConsequence: string;
  };
  setting: { label: string; hint: string };
  errors: { used: string; wrongPerson: string; unavailable: string; failed: string };
  checking: string;
}

const en: AgentJobsCopy = {
  pair: {
    title: 'Verify once for your agent',
    lead: 'Your agent wants to open a protected deal for you on Karwan. Verify with World ID once so that only you can approve paying the seller.',
    start: 'Verify with World ID',
    done: 'You are verified',
    doneLead: 'Go back to your agent. It can open the deal now.',
  },
  release: {
    title: 'Are you happy with the work?',
    from: 'From',
    amount: 'Amount',
    delivered: 'What the seller says they delivered',
    reviewEnds: 'If you do nothing, the seller is paid on {date}.',
    happy: 'Pay {amount} USDC',
    notHappy: 'I am not happy',
    noteLabel: 'What is wrong',
    noteHint: 'One line. The seller sees it.',
    sendNotHappy: 'Send to the seller',
    paid: 'Paid. The seller has the money.',
    rejected: 'Sent. The seller has 3 days to dispute. Otherwise the money goes back to your agent\'s wallet.',
    payConsequence: 'The seller gets {amount} USDC. This cannot be undone.',
    notHappyConsequence: 'The seller is told what is wrong and has 3 days to dispute.',
  },
  seller: {
    title: 'Deal from an outside agent',
    badge: 'Funded by an agent for a verified person',
    youGet: 'You get',
    deadline: 'Deliver by',
    status: {
      created: 'Waiting for the money',
      funded: 'Funded. Deliver the work',
      submitted: 'Delivered. Waiting for the buyer',
      completed: 'Paid',
      rejected: 'The buyer was not happy',
      disputed: 'Under review',
      refunded: 'Money went back to the buyer',
      expired: 'Money went back to the buyer',
    },
    noteLabel: 'What you delivered',
    noteHint: 'Say where the buyer finds it.',
    deliver: 'Mark delivered',
    reviewEnds: 'If the buyer says nothing, you are paid on {date}.',
    unhappy: 'What the buyer said',
    disputeBy: 'Dispute by {date}',
    clauseLabel: 'Why the work meets what was agreed',
    dispute: 'Dispute',
    list: 'Deals from outside agents',
    empty: 'No deals from outside agents yet.',
    deliverConsequence: 'The buyer is asked to review it. If they say nothing, you are paid when the review ends.',
    disputeConsequence: 'A Karwan reviewer looks at both sides and decides what is paid.',
  },
  setting: { label: 'Accept deals from agents outside Karwan', hint: 'Their buyer pairs with World ID, and only that person can approve paying you.' },
  errors: {
    used: 'This link has been used or has expired. Ask the agent for a new one.',
    wrongPerson: 'Only the person who paired with this agent can answer.',
    unavailable: 'World ID is not available right now. Try again shortly.',
    failed: 'That did not go through. Try again.',
  },
  checking: 'Checking',
};

const fr: AgentJobsCopy = {
  pair: {
    title: 'Vérifiez une fois pour votre agent',
    lead: 'Votre agent veut ouvrir pour vous un accord protégé sur Karwan. Vérifiez-vous une fois avec World ID pour que vous seul puissiez approuver le paiement du vendeur.',
    start: 'Vérifier avec World ID',
    done: 'Vous êtes vérifié',
    doneLead: 'Revenez à votre agent. Il peut maintenant ouvrir l\'accord.',
  },
  release: {
    title: 'Le travail vous convient-il ?',
    from: 'De',
    amount: 'Montant',
    delivered: 'Ce que le vendeur dit avoir livré',
    reviewEnds: 'Si vous ne faites rien, le vendeur est payé le {date}.',
    happy: 'Payer {amount} USDC',
    notHappy: 'Je ne suis pas satisfait',
    noteLabel: 'Ce qui ne va pas',
    noteHint: 'Une ligne. Le vendeur la verra.',
    sendNotHappy: 'Envoyer au vendeur',
    paid: 'Payé. Le vendeur a l\'argent.',
    rejected: 'Envoyé. Le vendeur a 3 jours pour contester. Sinon, l\'argent revient au portefeuille de votre agent.',
    payConsequence: 'Le vendeur reçoit {amount} USDC. C’est irréversible.',
    notHappyConsequence: 'Le vendeur est informé du problème et a 3 jours pour contester.',
  },
  seller: {
    title: 'Accord d\'un agent extérieur',
    badge: 'Financé par un agent pour une personne vérifiée',
    youGet: 'Vous recevez',
    deadline: 'Livrer avant le',
    status: {
      created: 'En attente de l\'argent',
      funded: 'Financé. Livrez le travail',
      submitted: 'Livré. En attente de l\'acheteur',
      completed: 'Payé',
      rejected: 'L\'acheteur n\'est pas satisfait',
      disputed: 'En cours d\'examen',
      refunded: 'L\'argent est revenu à l\'acheteur',
      expired: 'L\'argent est revenu à l\'acheteur',
    },
    noteLabel: 'Ce que vous avez livré',
    noteHint: 'Dites où l\'acheteur le trouve.',
    deliver: 'Marquer comme livré',
    reviewEnds: 'Si l\'acheteur ne dit rien, vous êtes payé le {date}.',
    unhappy: 'Ce que l\'acheteur a dit',
    disputeBy: 'Contester avant le {date}',
    clauseLabel: 'Pourquoi le travail correspond à ce qui était convenu',
    dispute: 'Contester',
    list: 'Accords d\'agents extérieurs',
    empty: 'Aucun accord d\'agent extérieur pour l\'instant.',
    deliverConsequence: 'L’acheteur est invité à vérifier. S’il ne dit rien, vous êtes payé à la fin de la vérification.',
    disputeConsequence: 'Un examinateur Karwan regarde les deux côtés et décide de ce qui est payé.',
  },
  setting: { label: 'Accepter les accords d\'agents extérieurs à Karwan', hint: 'Leur acheteur se vérifie avec World ID, et lui seul peut approuver votre paiement.' },
  errors: {
    used: 'Ce lien a déjà servi ou a expiré. Demandez-en un nouveau à l\'agent.',
    wrongPerson: 'Seule la personne liée à cet agent peut répondre.',
    unavailable: 'World ID n\'est pas disponible pour le moment. Réessayez bientôt.',
    failed: 'Cela n\'a pas abouti. Réessayez.',
  },
  checking: 'Vérification',
};

const ar: AgentJobsCopy = {
  pair: {
    title: 'تحقّق مرة واحدة لوكيلك',
    lead: 'يريد وكيلك فتح صفقة محمية لك على Karwan. تحقّق مرة واحدة عبر World ID حتى تكون أنت وحدك من يوافق على الدفع للبائع.',
    start: 'التحقق عبر World ID',
    done: 'تم التحقق منك',
    doneLead: 'عد إلى وكيلك. يمكنه الآن فتح الصفقة.',
  },
  release: {
    title: 'هل أنت راضٍ عن العمل؟',
    from: 'من',
    amount: 'المبلغ',
    delivered: 'ما يقول البائع إنه سلّمه',
    reviewEnds: 'إن لم تفعل شيئًا، يُدفع للبائع في {date}.',
    happy: 'ادفع {amount} USDC',
    notHappy: 'لست راضيًا',
    noteLabel: 'ما المشكلة',
    noteHint: 'سطر واحد. سيراه البائع.',
    sendNotHappy: 'أرسل إلى البائع',
    paid: 'تم الدفع. وصل المال إلى البائع.',
    rejected: 'تم الإرسال. لدى البائع 3 أيام للاعتراض، وإلا يعود المال إلى محفظة وكيلك.',
    payConsequence: 'يحصل البائع على {amount} USDC. لا يمكن التراجع عن ذلك.',
    notHappyConsequence: 'يُبلَّغ البائع بالمشكلة ولديه 3 أيام للاعتراض.',
  },
  seller: {
    title: 'صفقة من وكيل خارجي',
    badge: 'مموّلة من وكيل لشخص تم التحقق منه',
    youGet: 'تحصل على',
    deadline: 'التسليم قبل',
    status: {
      created: 'بانتظار المال',
      funded: 'مموّلة. سلّم العمل',
      submitted: 'تم التسليم. بانتظار المشتري',
      completed: 'تم الدفع',
      rejected: 'المشتري غير راضٍ',
      disputed: 'قيد المراجعة',
      refunded: 'عاد المال إلى المشتري',
      expired: 'عاد المال إلى المشتري',
    },
    noteLabel: 'ما الذي سلّمته',
    noteHint: 'اذكر أين يجده المشتري.',
    deliver: 'تأكيد التسليم',
    reviewEnds: 'إن لم يقل المشتري شيئًا، يُدفع لك في {date}.',
    unhappy: 'ما قاله المشتري',
    disputeBy: 'اعترض قبل {date}',
    clauseLabel: 'لماذا يطابق العمل ما اتُّفق عليه',
    dispute: 'اعتراض',
    list: 'صفقات من وكلاء خارجيين',
    empty: 'لا صفقات من وكلاء خارجيين بعد.',
    deliverConsequence: 'يُطلب من المشتري مراجعته. إن لم يقل شيئًا، يُدفع لك عند انتهاء المراجعة.',
    disputeConsequence: 'يراجع مراجع من Karwan الطرفين ويقرر ما يُدفع.',
  },
  setting: { label: 'قبول الصفقات من وكلاء خارج Karwan', hint: 'يتحقق المشتري عبر World ID، وهو وحده من يوافق على الدفع لك.' },
  errors: {
    used: 'استُخدم هذا الرابط أو انتهت صلاحيته. اطلب رابطًا جديدًا من الوكيل.',
    wrongPerson: 'لا يجيب إلا الشخص المرتبط بهذا الوكيل.',
    unavailable: 'World ID غير متاح الآن. حاول بعد قليل.',
    failed: 'لم يتم ذلك. حاول مرة أخرى.',
  },
  checking: 'جارٍ التحقق',
};

const hi: AgentJobsCopy = {
  pair: {
    title: 'अपने एजेंट के लिए एक बार सत्यापित करें',
    lead: 'आपका एजेंट Karwan पर आपके लिए एक सुरक्षित सौदा खोलना चाहता है। World ID से एक बार सत्यापित करें, ताकि विक्रेता को भुगतान सिर्फ़ आप ही मंज़ूर कर सकें।',
    start: 'World ID से सत्यापित करें',
    done: 'आप सत्यापित हैं',
    doneLead: 'अपने एजेंट पर लौटें। वह अब सौदा खोल सकता है।',
  },
  release: {
    title: 'क्या आप काम से संतुष्ट हैं?',
    from: 'किससे',
    amount: 'राशि',
    delivered: 'विक्रेता के अनुसार क्या डिलीवर हुआ',
    reviewEnds: 'अगर आप कुछ नहीं करते, तो विक्रेता को {date} को भुगतान होगा।',
    happy: '{amount} USDC भुगतान करें',
    notHappy: 'मैं संतुष्ट नहीं हूँ',
    noteLabel: 'क्या गलत है',
    noteHint: 'एक पंक्ति। विक्रेता इसे देखेगा।',
    sendNotHappy: 'विक्रेता को भेजें',
    paid: 'भुगतान हो गया। पैसा विक्रेता के पास है।',
    rejected: 'भेज दिया। विक्रेता के पास आपत्ति के लिए 3 दिन हैं, वरना पैसा आपके एजेंट के वॉलेट में लौट आएगा।',
    payConsequence: 'विक्रेता को {amount} USDC मिलेंगे। इसे वापस नहीं किया जा सकता।',
    notHappyConsequence: 'विक्रेता को बताया जाएगा कि क्या गलत है, और उसके पास आपत्ति के लिए 3 दिन होंगे।',
  },
  seller: {
    title: 'बाहरी एजेंट से सौदा',
    badge: 'एक सत्यापित व्यक्ति के लिए एजेंट द्वारा फ़ंड किया गया',
    youGet: 'आपको मिलेगा',
    deadline: 'डिलीवरी की तारीख',
    status: {
      created: 'पैसे का इंतज़ार',
      funded: 'फ़ंड हो गया। काम डिलीवर करें',
      submitted: 'डिलीवर हो गया। खरीदार का इंतज़ार',
      completed: 'भुगतान हो गया',
      rejected: 'खरीदार संतुष्ट नहीं है',
      disputed: 'समीक्षा में',
      refunded: 'पैसा खरीदार को लौट गया',
      expired: 'पैसा खरीदार को लौट गया',
    },
    noteLabel: 'आपने क्या डिलीवर किया',
    noteHint: 'बताएँ कि खरीदार इसे कहाँ पाएगा।',
    deliver: 'डिलीवर किया चिह्नित करें',
    reviewEnds: 'अगर खरीदार कुछ नहीं कहता, तो आपको {date} को भुगतान होगा।',
    unhappy: 'खरीदार ने क्या कहा',
    disputeBy: '{date} तक आपत्ति करें',
    clauseLabel: 'काम तय बात से कैसे मेल खाता है',
    dispute: 'आपत्ति करें',
    list: 'बाहरी एजेंटों से सौदे',
    empty: 'अभी बाहरी एजेंटों से कोई सौदा नहीं।',
    deliverConsequence: 'खरीदार से समीक्षा करने को कहा जाएगा। अगर वह कुछ नहीं कहता, तो समीक्षा खत्म होने पर आपको भुगतान होगा।',
    disputeConsequence: 'Karwan का एक समीक्षक दोनों पक्ष देखकर तय करेगा कि क्या भुगतान होगा।',
  },
  setting: { label: 'Karwan के बाहर के एजेंटों से सौदे स्वीकार करें', hint: 'उनका खरीदार World ID से सत्यापित होता है, और सिर्फ़ वही आपका भुगतान मंज़ूर कर सकता है।' },
  errors: {
    used: 'यह लिंक इस्तेमाल हो चुका है या समाप्त हो गया है। एजेंट से नया लिंक माँगें।',
    wrongPerson: 'सिर्फ़ इस एजेंट से जुड़ा व्यक्ति ही जवाब दे सकता है।',
    unavailable: 'World ID अभी उपलब्ध नहीं है। थोड़ी देर में फिर कोशिश करें।',
    failed: 'यह नहीं हो पाया। फिर कोशिश करें।',
  },
  checking: 'जाँच हो रही है',
};

const sw: AgentJobsCopy = {
  pair: {
    title: 'Thibitisha mara moja kwa wakala wako',
    lead: 'Wakala wako anataka kukufungulia mpango uliolindwa kwenye Karwan. Thibitisha mara moja kwa World ID ili wewe tu uweze kuidhinisha malipo kwa muuzaji.',
    start: 'Thibitisha kwa World ID',
    done: 'Umethibitishwa',
    doneLead: 'Rudi kwa wakala wako. Sasa anaweza kufungua mpango.',
  },
  release: {
    title: 'Umeridhika na kazi?',
    from: 'Kutoka',
    amount: 'Kiasi',
    delivered: 'Muuzaji anasema aliwasilisha nini',
    reviewEnds: 'Usipofanya chochote, muuzaji atalipwa tarehe {date}.',
    happy: 'Lipa {amount} USDC',
    notHappy: 'Sijaridhika',
    noteLabel: 'Kuna tatizo gani',
    noteHint: 'Mstari mmoja. Muuzaji ataona.',
    sendNotHappy: 'Tuma kwa muuzaji',
    paid: 'Imelipwa. Muuzaji amepata pesa.',
    rejected: 'Imetumwa. Muuzaji ana siku 3 kupinga, la sivyo pesa zinarudi kwenye pochi ya wakala wako.',
    payConsequence: 'Muuzaji anapata {amount} USDC. Haiwezi kutenduliwa.',
    notHappyConsequence: 'Muuzaji anaambiwa tatizo na ana siku 3 kupinga.',
  },
  seller: {
    title: 'Mpango kutoka kwa wakala wa nje',
    badge: 'Umefadhiliwa na wakala kwa mtu aliyethibitishwa',
    youGet: 'Unapata',
    deadline: 'Wasilisha kabla ya',
    status: {
      created: 'Inasubiri pesa',
      funded: 'Imefadhiliwa. Wasilisha kazi',
      submitted: 'Imewasilishwa. Inasubiri mnunuzi',
      completed: 'Imelipwa',
      rejected: 'Mnunuzi hajaridhika',
      disputed: 'Inakaguliwa',
      refunded: 'Pesa zilirudi kwa mnunuzi',
      expired: 'Pesa zilirudi kwa mnunuzi',
    },
    noteLabel: 'Ulichowasilisha',
    noteHint: 'Sema mnunuzi atakipata wapi.',
    deliver: 'Weka alama imewasilishwa',
    reviewEnds: 'Mnunuzi asiposema chochote, utalipwa tarehe {date}.',
    unhappy: 'Alichosema mnunuzi',
    disputeBy: 'Pinga kabla ya {date}',
    clauseLabel: 'Kwa nini kazi inalingana na makubaliano',
    dispute: 'Pinga',
    list: 'Mipango kutoka kwa mawakala wa nje',
    empty: 'Bado hakuna mipango kutoka kwa mawakala wa nje.',
    deliverConsequence: 'Mnunuzi anaombwa akague. Asiposema chochote, unalipwa ukaguzi ukiisha.',
    disputeConsequence: 'Mkaguzi wa Karwan anaangalia pande zote mbili na kuamua kinacholipwa.',
  },
  setting: { label: 'Kubali mipango kutoka kwa mawakala walio nje ya Karwan', hint: 'Mnunuzi wao anathibitishwa kwa World ID, na yeye tu anaweza kuidhinisha malipo yako.' },
  errors: {
    used: 'Kiungo hiki kimetumika au kimeisha muda. Muombe wakala kiungo kipya.',
    wrongPerson: 'Ni mtu aliyeunganishwa na wakala huyu tu anayeweza kujibu.',
    unavailable: 'World ID haipatikani sasa. Jaribu tena baada ya muda mfupi.',
    failed: 'Haikufanikiwa. Jaribu tena.',
  },
  checking: 'Inakagua',
};

export const agentJobsCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', AgentJobsCopy> = { en, fr, ar, hi, sw };
