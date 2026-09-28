/// Copy for the docs overview (product page) and the roadmap timeline.
/// Every claim here is either live and checked, or labelled as a target.

type Step = { title: string; body: string };
type Reason = { title: string; body: string };
type Status = 'live' | 'invite' | 'planned';
type Row = { feature: string; testnet: Status; mainnet: Status };
type Milestone = { when: string; title: string; body: string };

export interface DocsProductCopy {
  hero: {
    eyebrow: string;
    title: string;
    lede: string;
    testnet: string;
    mainnet: string;
    primary: string;
    secondary: string;
    scroll: string;
  };
  problem: { title: string; body: string };
  how: {
    title: string;
    lede: string;
    steps: [Step, Step, Step, Step];
    card: { label: string; title: string; parties: string; states: [string, string, string, string] };
  };
  why: { title: string; lede: string; reasons: Reason[]; numbersLink: string };
  facts: { fee: string; feeValue: string; confirm: string; confirmValue: string; token: string; tokenValue: string; note: string };
  today: {
    title: string;
    lede: string;
    feature: string;
    testnet: string;
    mainnet: string;
    status: Record<Status, string>;
    rows: Row[];
  };
  roadmap: { title: string; lede: string; now: string; milestones: Milestone[]; later: string; laterItems: string[]; note: string; full: string };
  cta: { title: string; body: string; primary: string; secondary: string };
  explore: { title: string };
  toc: { title: string; problem: string; how: string; why: string; today: string; roadmap: string; explore: string };
}

const statusRows = (f: string[]): Row[] => [
  { feature: f[0]!, testnet: 'live', mainnet: 'invite' },
  { feature: f[1]!, testnet: 'live', mainnet: 'planned' },
  { feature: f[2]!, testnet: 'live', mainnet: 'planned' },
  { feature: f[3]!, testnet: 'live', mainnet: 'invite' },
  { feature: f[4]!, testnet: 'live', mainnet: 'planned' },
  { feature: f[5]!, testnet: 'live', mainnet: 'live' },
  { feature: f[6]!, testnet: 'live', mainnet: 'planned' },
  { feature: f[7]!, testnet: 'planned', mainnet: 'planned' },
];

const en: DocsProductCopy = {
  hero: {
    eyebrow: 'Karwan documentation',
    title: "An open market. A record you can build on.",
    lede: "Karwan helps people and businesses find opportunities and build a record through completed trades. Agreements and USDC settlement support the exchange. Our longer-term goal is to let that reputation travel with you.",
    testnet: 'Testnet: open for trading',
    mainnet: 'Mainnet: waitlist open',
    primary: 'Open Karwan',
    secondary: 'See how a deal works',
    scroll: 'Scroll',
  },
  problem: {
    title: "Your history should not end at the edge of a platform",
    body: "A completed job, an on-time delivery and a paid invoice tell a useful story. Too often, that evidence stays where the trade happened. Karwan starts with its own market. Permissioned reputation checks across other platforms are planned, not available today.",
  },
  how: {
    title: 'How a deal works',
    lede: "This example shows the testnet deal flow. Mainnet escrow is not available yet.",
    steps: [
      { title: 'Agree the terms', body: 'Buyer and seller set what gets delivered, the price, the deadline and how the payment splits into stages. Nothing is paid yet.' },
      { title: 'Lock the USDC', body: 'The buyer funds the escrow contract and sees the exact total, fee included, before paying. The seller can see the money is there before starting work.' },
      { title: 'Deliver the work', body: 'The seller marks the work delivered. The buyer gets a review window, set in the terms, to check it.' },
      { title: 'Release the payment', body: "Review each delivery before releasing payment. If a review deadline passes, the seller may be able to claim the milestone, including the final one. A dispute pauses unreleased funds; it does not refund them automatically." },
    ],
    card: {
      label: "Example deal",
      title: 'Logo design, 3 revisions',
      parties: '@bakery_kofi to @ada_designs',
      states: ['Agreed', 'USDC locked', 'Delivered', 'Paid'],
    },
  },
  why: {
    title: "What supports a trade",
    lede: "These trading features are available on testnet. Check the availability table below for mainnet access.",
    reasons: [
      { title: 'The contract holds the money', body: 'USDC sits in an escrow contract on Arc, not in a Karwan account. It leaves only through the release, refund and dispute paths written into the contract.' },
      { title: 'Pay in stages', body: 'Split a deal into milestones and release each one on its own. A large job never rides on one payment.' },
      { title: "Settlement with a receipt", body: "Payments settle in USDC on Arc. Check the transaction status and receipt to confirm completion; a submitted payment is not a completed payment." },
      { title: 'A record anyone can check', body: 'Every funded deal and payout is recorded on chain. Both sides earn a reputation record, and Karwan publishes its totals straight from the contracts.' },
      { title: 'Sign in with an email', body: "Sign-in options depend on the network. Mainnet supports a device passkey or a connected wallet. Testnet also offers email sign-in with a managed wallet. Keep your recovery information safe." },
      { title: 'Agents do the legwork', body: 'Post what you need and your agent finds sellers and negotiates inside the limits you set. You approve the terms before any USDC moves.' },
      { title: 'Add USDC from other chains', body: "Use the transfer routes shown for your account. Supported networks, fees and signing requirements vary. Check the destination credit before treating a transfer as complete." },
    ],
    numbersLink: 'See the public numbers',
  },
  facts: {
    fee: 'Fee',
    feeValue: '1.5%, split between buyer and seller',
    confirm: 'Confirmation',
    confirmValue: "Confirmed by the network",
    token: 'Currency',
    tokenValue: 'USDC, for payment and fees',
    note: "Testnet trading terms. Check the amount, fees and review deadlines shown before approving a deal.",
  },
  today: {
    title: 'What works today',
    lede: "The market, agent matching and escrow deals run on testnet with test funds. Mainnet account and wallet access is by invitation, one user at a time. Mainnet escrow and cross-platform reputation sharing are not available yet.",
    feature: 'Feature',
    testnet: 'Arc testnet',
    mainnet: 'Arc mainnet',
    status: { live: 'Live', invite: 'Invite only', planned: 'Planned' },
    rows: statusRows([
      'Sign up with email, passkey or wallet',
      'Escrow deals with milestones',
      'Agent matching and negotiation',
      'Add USDC from other chains',
      'Disputes and review windows',
      'Reputation record on chain',
      'Public totals from the contracts',
      'Paid data access through x402',
    ]),
  },
  roadmap: {
    title: 'Roadmap',
    lede: 'What ships next, in order.',
    now: 'Now',
    milestones: [
      { when: 'Now', title: 'Mainnet waitlist', body: "Karwan is live on Arc mainnet with account and wallet access by invitation. We onboard one user at a time through the waitlist." },
      { when: 'Next', title: 'Deals on mainnet', body: 'The escrow, deal board and stake contracts released on Arc mainnet, so real deals can settle.' },
      { when: 'Then', title: 'Arbiter and external audit', body: 'An arbiter for deals where one side goes silent, using the delivery evidence, and an external audit of the contracts that hold money.' },
      { when: 'After that', title: 'Trade from anywhere', body: 'Start a protected deal from the page where the trade began, starting with X, plus recurring deals.' },
      { when: 'Later', title: 'Local payouts', body: 'Cash out USDC to a local bank account, one country at a time.' },
    ],
    later: 'Also planned',
    laterItems: ['Mobile app after the mainnet release', 'Paid data access through x402', 'File delivery inside a deal', 'More languages'],
    note: "We don't publish dates. Each step ships when its testing and security review are done.",
    full: 'Read the full roadmap',
  },
  cta: {
    title: "Join the early users",
    body: 'Join the mainnet waitlist, or try a full deal with test money on testnet.',
    primary: 'Join the waitlist',
    secondary: 'Try it on testnet',
  },
  explore: { title: 'Read the docs' },
  toc: { title: 'On this page', problem: 'The problem', how: 'How a deal works', why: 'Why Karwan', today: 'What works today', roadmap: 'Roadmap', explore: 'Read the docs' },
};

const ar: DocsProductCopy = {
  hero: {
    eyebrow: 'توثيق كاروان',
    title: "سوق مفتوح. وسجل تبني عليه.",
    lede: "تساعد كروان الأفراد والشركات على إيجاد الفرص وبناء سجل من الصفقات المكتملة. تدعم الاتفاقات والتسوية بعملة USDC هذه التعاملات. هدفنا على المدى الطويل أن تنتقل سمعتك معك.",
    testnet: 'الشبكة التجريبية: مفتوحة للتداول',
    mainnet: 'الشبكة الرئيسية: قائمة الانتظار مفتوحة',
    primary: 'افتح كاروان',
    secondary: 'اطّلع على كيفية سير الصفقة',
    scroll: 'مرّر',
  },
  problem: {
    title: "ينبغي ألا ينتهي سجلك عند حدود منصة",
    body: "العمل المكتمل والتسليم في الموعد والفاتورة المدفوعة أدلة مفيدة، لكنها غالباً تبقى في منصة التعامل. تبدأ كروان بسوقها الخاص. التحقق من السمعة عبر المنصات بإذن المستخدم مخطط له وليس متاحاً الآن.",
  },
  how: {
    title: 'كيف تسير الصفقة',
    lede: "يوضح هذا المثال صفقة على شبكة الاختبار. الضمان على الشبكة الرئيسية غير متاح بعد.",
    steps: [
      { title: 'الاتفاق على الشروط', body: 'يحدد المشتري والبائع ما سيُسلَّم والسعر والموعد النهائي وكيفية تقسيم الدفع إلى مراحل. لا يُدفع شيء بعد.' },
      { title: 'حجز USDC', body: 'يموّل المشتري عقد الضمان ويرى المبلغ الإجمالي الدقيق شاملًا الرسوم قبل الدفع. ويرى البائع أن المال موجود قبل بدء العمل.' },
      { title: 'تسليم العمل', body: 'يحدد البائع أن العمل قد سُلّم. ويحصل المشتري على فترة مراجعة محددة في الشروط للتحقق منه.' },
      { title: 'تحرير الدفعة', body: "راجع كل تسليم قبل صرف الدفع. بعد انتهاء مهلة المراجعة قد يستطيع البائع المطالبة بالدفعة، بما فيها الأخيرة. يوقف النزاع صرف الأموال المتبقية ولا يعيدها تلقائياً." },
    ],
    card: {
      label: "مثال توضيحي لصفقة",
      title: 'تصميم شعار، 3 مراجعات',
      parties: 'من ‎@bakery_kofi إلى ‎@ada_designs',
      states: ['تم الاتفاق', 'تم حجز USDC', 'تم التسليم', 'تم الدفع'],
    },
  },
  why: {
    title: "ما يدعم الصفقة",
    lede: "ميزات التداول هذه متاحة على شبكة الاختبار. راجع الجدول أدناه لمعرفة المتاح على الشبكة الرئيسية.",
    reasons: [
      { title: 'العقد يحتفظ بالمال', body: 'تبقى USDC في عقد ضمان على Arc، وليس في حساب لدى كاروان. ولا تخرج إلا عبر مسارات التحرير والاسترداد والنزاع المكتوبة في العقد.' },
      { title: 'ادفع على مراحل', body: 'قسّم الصفقة إلى مراحل وحرّر كل مرحلة وحدها. لا يعتمد عمل كبير على دفعة واحدة.' },
      { title: "تسوية مع إيصال", body: "تُسوّى المدفوعات بعملة USDC على Arc. تحقق من حالة المعاملة والإيصال لتأكيد اكتمالها. إرسال الدفع لا يعني اكتماله." },
      { title: 'سجل يمكن لأي أحد التحقق منه', body: 'كل صفقة ممولة وكل دفعة مسجلة على السلسلة. يكسب الطرفان سجل سمعة، وينشر كاروان إجمالياته مباشرة من العقود.' },
      { title: 'سجّل الدخول ببريدك الإلكتروني', body: "تختلف خيارات الدخول حسب الشبكة. تدعم الشبكة الرئيسية مفتاح مرور على جهازك أو محفظة متصلة. تتيح شبكة الاختبار أيضاً الدخول بالبريد الإلكتروني مع محفظة مُدارة. احتفظ بمعلومات الاسترداد بأمان." },
      { title: 'الوكلاء يتولون البحث', body: 'انشر ما تحتاجه وسيجد وكيلك بائعين ويفاوض ضمن الحدود التي تضعها. توافق أنت على الشروط قبل تحريك أي USDC.' },
      { title: 'أضف USDC من شبكات أخرى', body: "استخدم مسارات التحويل المعروضة لحسابك. تختلف الشبكات والرسوم ومتطلبات التوقيع. تحقق من وصول الرصيد إلى الوجهة قبل اعتبار التحويل مكتملاً." },
    ],
    numbersLink: 'اطّلع على الأرقام العامة',
  },
  facts: {
    fee: 'الرسوم',
    feeValue: '1.5%، مقسّمة بين المشتري والبائع',
    confirm: 'التأكيد',
    confirmValue: "تؤكده الشبكة",
    token: 'العملة',
    tokenValue: 'USDC للدفع والرسوم',
    note: "شروط التداول على شبكة الاختبار. راجع المبلغ والرسوم ومهل المراجعة قبل الموافقة على صفقة.",
  },
  today: {
    title: 'ما يعمل اليوم',
    lede: "يعمل السوق ومطابقة الوكلاء وصفقات الضمان على شبكة الاختبار بأموال اختبار. الدخول إلى الحساب والمحفظة على الشبكة الرئيسية بالدعوة، مستخدم واحد في كل مرة. الضمان على الشبكة الرئيسية ومشاركة السمعة عبر المنصات غير متاحين بعد.",
    feature: 'الميزة',
    testnet: 'شبكة Arc التجريبية',
    mainnet: 'شبكة Arc الرئيسية',
    status: { live: 'متاح', invite: 'بالدعوة فقط', planned: 'مخطط' },
    rows: statusRows([
      'التسجيل بالبريد أو مفتاح المرور أو المحفظة',
      'صفقات ضمان بمراحل',
      'مطابقة الوكلاء والتفاوض',
      'إضافة USDC من شبكات أخرى',
      'النزاعات وفترات المراجعة',
      'سجل السمعة على السلسلة',
      'الإجماليات العامة من العقود',
      'الوصول المدفوع إلى البيانات عبر x402',
    ]),
  },
  roadmap: {
    title: 'خارطة الطريق',
    lede: 'ما سيأتي تاليًا، بالترتيب.',
    now: 'الآن',
    milestones: [
      { when: 'الآن', title: 'قائمة انتظار الشبكة الرئيسية', body: "كروان متاحة على Arc mainnet بحسابات ومحافظ عبر الدعوة. نستقبل مستخدماً واحداً في كل مرة من قائمة الانتظار." },
      { when: 'التالي', title: 'الصفقات على الشبكة الرئيسية', body: 'إطلاق عقود الضمان ولوحة الصفقات والرهن على الشبكة الرئيسية لـ Arc لتتم تسوية صفقات حقيقية.' },
      { when: 'ثم', title: 'المحكّم والتدقيق الخارجي', body: 'محكّم للصفقات التي يصمت فيها أحد الطرفين اعتمادًا على أدلة التسليم، وتدقيق خارجي للعقود التي تحتفظ بالمال.' },
      { when: 'بعد ذلك', title: 'التداول من أي مكان', body: 'ابدأ صفقة محمية من الصفحة التي بدأت فيها التجارة، بدءًا من X، إضافة إلى الصفقات المتكررة.' },
      { when: 'لاحقًا', title: 'السحب المحلي', body: 'اسحب USDC إلى حساب مصرفي محلي، دولة تلو الأخرى.' },
    ],
    later: 'مخطط أيضًا',
    laterItems: ['تطبيق للجوال بعد إطلاق الشبكة الرئيسية', 'الوصول المدفوع إلى البيانات عبر x402', 'تسليم الملفات داخل الصفقة', 'لغات إضافية'],
    note: 'لا ننشر مواعيد. تُطلق كل خطوة عندما تكتمل اختباراتها ومراجعتها الأمنية.',
    full: 'اقرأ خارطة الطريق كاملة',
  },
  cta: {
    title: "انضم إلى المستخدمين الأوائل",
    body: 'انضم إلى قائمة انتظار الشبكة الرئيسية، أو جرّب صفقة كاملة بأموال تجريبية على الشبكة التجريبية.',
    primary: 'انضم إلى قائمة الانتظار',
    secondary: 'جرّبه على الشبكة التجريبية',
  },
  explore: { title: 'اقرأ التوثيق' },
  toc: { title: 'في هذه الصفحة', problem: 'المشكلة', how: 'كيف تسير الصفقة', why: 'لماذا كاروان', today: 'ما يعمل اليوم', roadmap: 'خارطة الطريق', explore: 'اقرأ التوثيق' },
};

const fr: DocsProductCopy = {
  hero: {
    eyebrow: 'Documentation Karwan',
    title: "Un marché ouvert. Un historique sur lequel compter.",
    lede: "Karwan aide les particuliers et les entreprises à trouver des opportunités et à construire un historique grâce aux échanges réalisés. Les accords et le règlement en USDC accompagnent ces échanges. À terme, nous voulons que cette réputation vous suive.",
    testnet: 'Testnet : ouvert aux échanges',
    mainnet: 'Mainnet : liste d’attente ouverte',
    primary: 'Ouvrir Karwan',
    secondary: 'Voir comment se déroule une transaction',
    scroll: 'Défiler',
  },
  problem: {
    title: "Votre historique ne devrait pas s’arrêter à une plateforme",
    body: "Une mission terminée, une livraison à temps et une facture réglée apportent des preuves utiles. Elles restent souvent sur la plateforme d’origine. Karwan commence par son propre marché. Les vérifications de réputation entre plateformes, avec autorisation, sont prévues mais ne sont pas disponibles.",
  },
  how: {
    title: 'Comment se déroule une transaction',
    lede: "Cet exemple présente un accord sur le testnet. Le séquestre sur mainnet n’est pas encore disponible.",
    steps: [
      { title: 'Convenir des conditions', body: 'L’acheteur et le vendeur fixent ce qui sera livré, le prix, l’échéance et le découpage du paiement en étapes. Rien n’est encore payé.' },
      { title: 'Bloquer les USDC', body: 'L’acheteur finance le contrat de séquestre et voit le total exact, frais compris, avant de payer. Le vendeur voit que l’argent est là avant de commencer.' },
      { title: 'Livrer le travail', body: 'Le vendeur indique que le travail est livré. L’acheteur dispose d’une période de vérification, fixée dans les conditions.' },
      { title: 'Libérer le paiement', body: "Vérifiez chaque livraison avant de libérer le paiement. Après le délai de vérification, le vendeur peut avoir le droit de réclamer l’étape, y compris la dernière. Un litige bloque les fonds non versés sans les rembourser automatiquement." },
    ],
    card: {
      label: "Exemple d’accord",
      title: 'Création de logo, 3 révisions',
      parties: 'De @bakery_kofi à @ada_designs',
      states: ['Accord conclu', 'USDC bloqués', 'Livré', 'Payé'],
    },
  },
  why: {
    title: "Ce qui accompagne un échange",
    lede: "Ces fonctions commerciales sont disponibles sur le testnet. Consultez le tableau ci-dessous pour l’accès au mainnet.",
    reasons: [
      { title: 'Le contrat détient l’argent', body: 'Les USDC restent dans un contrat de séquestre sur Arc, pas sur un compte Karwan. Ils n’en sortent que par les voies de libération, de remboursement et de litige écrites dans le contrat.' },
      { title: 'Payer par étapes', body: 'Découpez une transaction en jalons et libérez-les un par un. Un gros projet ne dépend jamais d’un seul paiement.' },
      { title: "Un règlement avec un reçu", body: "Les paiements sont réglés en USDC sur Arc. Vérifiez le statut et le reçu pour confirmer leur exécution. Un paiement envoyé n’est pas encore un paiement terminé." },
      { title: 'Un historique vérifiable par tous', body: 'Chaque transaction financée et chaque paiement sont enregistrés sur la chaîne. Les deux parties gagnent un historique de réputation, et Karwan publie ses totaux directement depuis les contrats.' },
      { title: 'Connexion par e-mail', body: "Les options de connexion dépendent du réseau. Le mainnet prend en charge une passkey ou un portefeuille connecté. Le testnet propose aussi la connexion par e-mail avec un portefeuille géré. Conservez vos informations de récupération." },
      { title: 'Des agents qui font le travail de recherche', body: 'Publiez votre besoin et votre agent trouve des vendeurs et négocie dans les limites que vous fixez. Vous approuvez les conditions avant tout mouvement d’USDC.' },
      { title: 'Ajouter des USDC depuis d’autres chaînes', body: "Utilisez les transferts proposés pour votre compte. Les réseaux, les frais et les signatures nécessaires varient. Vérifiez le crédit à destination avant de considérer le transfert comme terminé." },
    ],
    numbersLink: 'Voir les chiffres publics',
  },
  facts: {
    fee: 'Frais',
    feeValue: '1,5 %, partagés entre acheteur et vendeur',
    confirm: 'Confirmation',
    confirmValue: "Confirmé par le réseau",
    token: 'Monnaie',
    tokenValue: 'USDC, pour le paiement et les frais',
    note: "Conditions des échanges sur testnet. Vérifiez le montant, les frais et les délais avant d’approuver un accord.",
  },
  today: {
    title: 'Ce qui fonctionne aujourd’hui',
    lede: "Le marché, la recherche par agents et le séquestre fonctionnent sur testnet avec des fonds de test. L’accès aux comptes et portefeuilles sur mainnet se fait sur invitation, une personne à la fois. Le séquestre mainnet et le partage de réputation entre plateformes ne sont pas encore disponibles.",
    feature: 'Fonction',
    testnet: 'Testnet Arc',
    mainnet: 'Mainnet Arc',
    status: { live: 'Disponible', invite: 'Sur invitation', planned: 'Prévu' },
    rows: statusRows([
      'Inscription par e-mail, clé d’accès ou portefeuille',
      'Transactions sous séquestre avec jalons',
      'Mise en relation et négociation par agents',
      'Ajout d’USDC depuis d’autres chaînes',
      'Litiges et périodes de vérification',
      'Historique de réputation sur la chaîne',
      'Totaux publics issus des contrats',
      'Accès payant aux données via x402',
    ]),
  },
  roadmap: {
    title: 'Feuille de route',
    lede: 'Ce qui arrive ensuite, dans l’ordre.',
    now: 'Maintenant',
    milestones: [
      { when: 'Maintenant', title: 'Liste d’attente mainnet', body: "Karwan est sur Arc mainnet avec un accès aux comptes et portefeuilles sur invitation. Nous accueillons une personne à la fois depuis la liste d’attente." },
      { when: 'Ensuite', title: 'Transactions sur le mainnet', body: 'Les contrats de séquestre, de tableau des transactions et de mise en jeu déployés sur le mainnet d’Arc, pour régler de vraies transactions.' },
      { when: 'Puis', title: 'Arbitre et audit externe', body: 'Un arbitre pour les transactions où une partie ne répond plus, fondé sur les preuves de livraison, et un audit externe des contrats qui détiennent l’argent.' },
      { when: 'Après', title: 'Échanger depuis n’importe où', body: 'Lancez une transaction protégée depuis la page où l’échange a commencé, en commençant par X, avec des transactions récurrentes.' },
      { when: 'Plus tard', title: 'Retraits locaux', body: 'Retirez des USDC vers un compte bancaire local, un pays à la fois.' },
    ],
    later: 'Également prévu',
    laterItems: ['Application mobile après le lancement mainnet', 'Accès payant aux données via x402', 'Livraison de fichiers dans une transaction', 'D’autres langues'],
    note: 'Nous ne publions pas de dates. Chaque étape sort quand ses tests et sa revue de sécurité sont terminés.',
    full: 'Lire la feuille de route complète',
  },
  cta: {
    title: "Rejoignez les premiers utilisateurs",
    body: 'Rejoignez la liste d’attente mainnet, ou essayez une transaction complète avec de l’argent de test sur le testnet.',
    primary: 'Rejoindre la liste d’attente',
    secondary: 'Essayer sur le testnet',
  },
  explore: { title: 'Lire la documentation' },
  toc: { title: 'Sur cette page', problem: 'Le problème', how: 'Déroulement d’une transaction', why: 'Pourquoi Karwan', today: 'Ce qui fonctionne', roadmap: 'Feuille de route', explore: 'Lire la documentation' },
};

const hi: DocsProductCopy = {
  hero: {
    eyebrow: 'कारवान दस्तावेज़',
    title: "एक खुला बाज़ार। आगे काम आने वाला रिकॉर्ड।",
    lede: "Karwan लोगों और व्यवसायों को अवसर खोजने और पूरे किए गए सौदों का रिकॉर्ड बनाने में मदद करता है। समझौते और USDC में भुगतान इन सौदों का हिस्सा हैं। आगे हमारा उद्देश्य है कि आपकी प्रतिष्ठा दूसरे प्लेटफ़ॉर्म पर भी आपके काम आए।",
    testnet: 'टेस्टनेट: व्यापार के लिए खुला',
    mainnet: 'मेननेट: प्रतीक्षा सूची खुली',
    primary: 'कारवान खोलें',
    secondary: 'देखें सौदा कैसे होता है',
    scroll: 'स्क्रॉल करें',
  },
  problem: {
    title: "आपका इतिहास एक प्लेटफ़ॉर्म तक सीमित नहीं रहना चाहिए",
    body: "पूरा किया गया काम, समय पर डिलीवरी और चुकाया गया बिल उपयोगी प्रमाण हैं। ये अक्सर उसी प्लेटफ़ॉर्म पर रह जाते हैं। Karwan अपने बाज़ार से शुरुआत करता है। अनुमति से दूसरे प्लेटफ़ॉर्म की प्रतिष्ठा जाँचना योजना में है, अभी उपलब्ध नहीं है।",
  },
  how: {
    title: 'सौदा कैसे होता है',
    lede: "यह उदाहरण टेस्टनेट का सौदा दिखाता है। मेननेट एस्क्रो अभी उपलब्ध नहीं है।",
    steps: [
      { title: 'शर्तें तय करें', body: 'खरीदार और विक्रेता तय करते हैं कि क्या डिलीवर होगा, कीमत, समय सीमा और भुगतान किन चरणों में बँटेगा। अभी कुछ भुगतान नहीं होता।' },
      { title: 'USDC लॉक करें', body: 'खरीदार एस्क्रो अनुबंध में पैसा डालता है और भुगतान से पहले शुल्क सहित सटीक कुल राशि देखता है। विक्रेता काम शुरू करने से पहले देख सकता है कि पैसा मौजूद है।' },
      { title: 'काम डिलीवर करें', body: 'विक्रेता काम को डिलीवर चिह्नित करता है। खरीदार को जाँच के लिए शर्तों में तय समीक्षा अवधि मिलती है।' },
      { title: 'भुगतान जारी करें', body: "भुगतान जारी करने से पहले हर डिलीवरी की समीक्षा करें। समीक्षा की समय सीमा बीतने पर विक्रेता अंतिम चरण सहित भुगतान का दावा कर सकता है। विवाद बचे हुए फंड को रोकता है, अपने आप रिफंड नहीं करता।" },
    ],
    card: {
      label: "उदाहरण सौदा",
      title: 'लोगो डिज़ाइन, 3 संशोधन',
      parties: '@bakery_kofi से @ada_designs',
      states: ['सहमति हुई', 'USDC लॉक', 'डिलीवर हुआ', 'भुगतान हुआ'],
    },
  },
  why: {
    title: "सौदे में मदद करने वाली सुविधाएँ",
    lede: "ये व्यापार सुविधाएँ टेस्टनेट पर उपलब्ध हैं। मेननेट की उपलब्धता नीचे दी गई तालिका में देखें।",
    reasons: [
      { title: 'पैसा अनुबंध रखता है', body: 'USDC Arc पर एक एस्क्रो अनुबंध में रहता है, कारवान के किसी खाते में नहीं। यह केवल अनुबंध में लिखे रिलीज़, रिफ़ंड और विवाद के रास्तों से निकलता है।' },
      { title: 'चरणों में भुगतान', body: 'सौदे को चरणों में बाँटें और हर चरण अलग से जारी करें। बड़ा काम कभी एक भुगतान पर नहीं टिकता।' },
      { title: "रसीद के साथ भुगतान", body: "भुगतान Arc पर USDC में होता है। पूरा होने की पुष्टि के लिए लेनदेन की स्थिति और रसीद देखें। भेजा गया भुगतान अभी पूरा हुआ भुगतान नहीं है।" },
      { title: 'ऐसा रिकॉर्ड जिसे कोई भी जाँच सके', body: 'हर फ़ंड किया गया सौदा और भुगतान चेन पर दर्ज होता है। दोनों पक्षों को प्रतिष्ठा रिकॉर्ड मिलता है, और कारवान अपने कुल आँकड़े सीधे अनुबंधों से प्रकाशित करता है।' },
      { title: 'ईमेल से साइन इन', body: "साइन-इन के तरीके नेटवर्क पर निर्भर हैं। मेननेट पर डिवाइस पासकी या कनेक्टेड वॉलेट का उपयोग होता है। टेस्टनेट पर प्रबंधित वॉलेट के साथ ईमेल साइन-इन भी है। रिकवरी जानकारी सुरक्षित रखें।" },
      { title: 'एजेंट खोजबीन करते हैं', body: 'जो चाहिए वह पोस्ट करें और आपका एजेंट विक्रेता ढूँढकर आपकी तय सीमाओं में मोलभाव करता है। कोई USDC हिलने से पहले आप शर्तें मंज़ूर करते हैं।' },
      { title: 'दूसरी चेन से USDC जोड़ें', body: "अपने खाते में दिख रहे ट्रांसफ़र विकल्प इस्तेमाल करें। नेटवर्क, शुल्क और हस्ताक्षर की ज़रूरत अलग हो सकती है। ट्रांसफ़र पूरा मानने से पहले गंतव्य पर रकम जाँचें।" },
    ],
    numbersLink: 'सार्वजनिक आँकड़े देखें',
  },
  facts: {
    fee: 'शुल्क',
    feeValue: '1.5%, खरीदार और विक्रेता में बँटा',
    confirm: 'पुष्टि',
    confirmValue: "नेटवर्क की पुष्टि के बाद",
    token: 'मुद्रा',
    tokenValue: 'भुगतान और शुल्क के लिए USDC',
    note: "टेस्टनेट व्यापार की शर्तें। सौदा स्वीकार करने से पहले राशि, शुल्क और समीक्षा की समय सीमा जाँचें।",
  },
  today: {
    title: 'आज क्या काम करता है',
    lede: "बाज़ार, एजेंट मिलान और एस्क्रो सौदे टेस्ट फंड के साथ टेस्टनेट पर चलते हैं। मेननेट खाते और वॉलेट के लिए एक समय में एक उपयोगकर्ता को निमंत्रण मिलता है। मेननेट एस्क्रो और दूसरे प्लेटफ़ॉर्म पर प्रतिष्ठा साझा करना अभी उपलब्ध नहीं हैं।",
    feature: 'सुविधा',
    testnet: 'Arc टेस्टनेट',
    mainnet: 'Arc मेननेट',
    status: { live: 'उपलब्ध', invite: 'केवल आमंत्रण', planned: 'योजना में' },
    rows: statusRows([
      'ईमेल, पासकी या वॉलेट से साइन अप',
      'चरणों वाले एस्क्रो सौदे',
      'एजेंट मिलान और मोलभाव',
      'दूसरी चेन से USDC जोड़ना',
      'विवाद और समीक्षा अवधि',
      'चेन पर प्रतिष्ठा रिकॉर्ड',
      'अनुबंधों से सार्वजनिक कुल आँकड़े',
      'x402 से भुगतान वाली डेटा पहुँच',
    ]),
  },
  roadmap: {
    title: 'रोडमैप',
    lede: 'आगे क्या आ रहा है, क्रम से।',
    now: 'अभी',
    milestones: [
      { when: 'अभी', title: 'मेननेट प्रतीक्षा सूची', body: "Karwan Arc मेननेट पर निमंत्रण से खाता और वॉलेट पहुँच देता है। प्रतीक्षा सूची से एक समय में एक उपयोगकर्ता को आमंत्रित किया जाता है।" },
      { when: 'अगला', title: 'मेननेट पर सौदे', body: 'एस्क्रो, सौदा बोर्ड और स्टेक अनुबंध Arc मेननेट पर जारी, ताकि असली सौदे निपट सकें।' },
      { when: 'फिर', title: 'मध्यस्थ और बाहरी ऑडिट', body: 'उन सौदों के लिए मध्यस्थ जिनमें एक पक्ष चुप हो जाए, डिलीवरी सबूतों के आधार पर, और पैसा रखने वाले अनुबंधों का बाहरी ऑडिट।' },
      { when: 'उसके बाद', title: 'कहीं से भी व्यापार', body: 'जिस पेज पर व्यापार शुरू हुआ वहीं से सुरक्षित सौदा शुरू करें, पहले X से, साथ में दोहराए जाने वाले सौदे।' },
      { when: 'बाद में', title: 'स्थानीय भुगतान', body: 'USDC को स्थानीय बैंक खाते में निकालें, एक-एक देश करके।' },
    ],
    later: 'और भी योजना में',
    laterItems: ['मेननेट रिलीज़ के बाद मोबाइल ऐप', 'x402 से भुगतान वाली डेटा पहुँच', 'सौदे के अंदर फ़ाइल डिलीवरी', 'और भाषाएँ'],
    note: 'हम तारीखें प्रकाशित नहीं करते। हर चरण तब आता है जब उसकी टेस्टिंग और सुरक्षा समीक्षा पूरी हो जाती है।',
    full: 'पूरा रोडमैप पढ़ें',
  },
  cta: {
    title: "शुरुआती उपयोगकर्ताओं से जुड़ें",
    body: 'मेननेट प्रतीक्षा सूची से जुड़ें, या टेस्टनेट पर टेस्ट पैसे से पूरा सौदा आज़माएँ।',
    primary: 'प्रतीक्षा सूची से जुड़ें',
    secondary: 'टेस्टनेट पर आज़माएँ',
  },
  explore: { title: 'दस्तावेज़ पढ़ें' },
  toc: { title: 'इस पेज पर', problem: 'समस्या', how: 'सौदा कैसे होता है', why: 'कारवान क्यों', today: 'आज क्या काम करता है', roadmap: 'रोडमैप', explore: 'दस्तावेज़ पढ़ें' },
};

const sw: DocsProductCopy = {
  hero: {
    eyebrow: 'Nyaraka za Karwan',
    title: "Soko wazi. Rekodi unayoweza kuijengea.",
    lede: "Karwan husaidia watu na biashara kupata fursa na kujenga rekodi kupitia miamala iliyokamilika. Makubaliano na malipo ya USDC yanaunga mkono miamala hiyo. Lengo letu la baadaye ni sifa zako ziweze kukufuata.",
    testnet: 'Testnet: wazi kwa biashara',
    mainnet: 'Mainnet: orodha ya kusubiri iko wazi',
    primary: 'Fungua Karwan',
    secondary: 'Ona jinsi mkataba unavyofanyika',
    scroll: 'Sogeza',
  },
  problem: {
    title: "Historia yako haipaswi kuishia kwenye jukwaa moja",
    body: "Kazi iliyokamilika, uwasilishaji wa wakati na ankara iliyolipwa ni ushahidi muhimu. Mara nyingi unabaki kwenye jukwaa ambako biashara ilifanyika. Karwan inaanza na soko lake. Ukaguzi wa sifa kati ya majukwaa kwa ruhusa umepangwa, lakini haupatikani sasa.",
  },
  how: {
    title: 'Jinsi mkataba unavyofanyika',
    lede: "Mfano huu unaonyesha makubaliano ya testnet. Escrow ya mainnet bado haipatikani.",
    steps: [
      { title: 'Kubaliana masharti', body: 'Mnunuzi na muuzaji huweka kitakachowasilishwa, bei, tarehe ya mwisho na jinsi malipo yanavyogawanywa kwa awamu. Hakuna kinacholipwa bado.' },
      { title: 'Funga USDC', body: 'Mnunuzi hufadhili mkataba wa escrow na huona jumla kamili, ada ikiwemo, kabla ya kulipa. Muuzaji huona pesa ipo kabla ya kuanza kazi.' },
      { title: 'Wasilisha kazi', body: 'Muuzaji huweka alama kuwa kazi imewasilishwa. Mnunuzi hupata muda wa ukaguzi uliowekwa kwenye masharti.' },
      { title: 'Toa malipo', body: "Kagua kila uwasilishaji kabla ya kutoa malipo. Muda wa ukaguzi ukiisha, muuzaji anaweza kudai malipo ya hatua, hata ya mwisho. Mgogoro husimamisha fedha ambazo hazijatolewa; hauzirejeshi moja kwa moja." },
    ],
    card: {
      label: "Mfano wa makubaliano",
      title: 'Kubuni nembo, marekebisho 3',
      parties: 'Kutoka @bakery_kofi kwenda @ada_designs',
      states: ['Imekubaliwa', 'USDC imefungwa', 'Imewasilishwa', 'Imelipwa'],
    },
  },
  why: {
    title: "Kinachosaidia muamala",
    lede: "Vipengele hivi vya biashara vinapatikana kwenye testnet. Angalia jedwali hapa chini kwa ufikiaji wa mainnet.",
    reasons: [
      { title: 'Mkataba unashikilia pesa', body: 'USDC hukaa kwenye mkataba wa escrow kwenye Arc, si kwenye akaunti ya Karwan. Hutoka tu kupitia njia za kutoa, kurejesha na mgogoro zilizoandikwa kwenye mkataba.' },
      { title: 'Lipa kwa awamu', body: 'Gawanya mkataba kwa hatua na utoe kila moja peke yake. Kazi kubwa haitegemei malipo moja.' },
      { title: "Malipo yenye risiti", body: "Malipo hukamilishwa kwa USDC kwenye Arc. Angalia hali ya muamala na risiti kuthibitisha kukamilika. Kutuma malipo hakumaanishi yamekamilika." },
      { title: 'Rekodi ambayo yeyote anaweza kuikagua', body: 'Kila mkataba uliofadhiliwa na kila malipo hurekodiwa kwenye mnyororo. Pande zote mbili hupata rekodi ya sifa, na Karwan huchapisha jumla zake moja kwa moja kutoka kwenye mikataba.' },
      { title: 'Ingia kwa barua pepe', body: "Njia za kuingia hutegemea mtandao. Mainnet hutumia passkey ya kifaa au pochi iliyounganishwa. Testnet pia ina kuingia kwa barua pepe na pochi inayosimamiwa. Hifadhi taarifa zako za urejeshaji salama." },
      { title: 'Mawakala hufanya utafutaji', body: 'Weka unachohitaji na wakala wako hupata wauzaji na kujadiliana ndani ya mipaka unayoweka. Unaidhinisha masharti kabla USDC yoyote kusogea.' },
      { title: 'Ongeza USDC kutoka minyororo mingine', body: "Tumia njia za uhamisho zilizoonyeshwa kwa akaunti yako. Mitandao, ada na saini zinazohitajika hutofautiana. Hakikisha fedha zimefika kabla ya kuhesabu uhamisho kuwa umekamilika." },
    ],
    numbersLink: 'Ona takwimu za umma',
  },
  facts: {
    fee: 'Ada',
    feeValue: '1.5%, hugawanywa kati ya mnunuzi na muuzaji',
    confirm: 'Uthibitisho',
    confirmValue: "Yanathibitishwa na mtandao",
    token: 'Sarafu',
    tokenValue: 'USDC, kwa malipo na ada',
    note: "Masharti ya biashara ya testnet. Kagua kiasi, ada na muda wa ukaguzi kabla ya kukubali makubaliano.",
  },
  today: {
    title: 'Kinachofanya kazi leo',
    lede: "Soko, ulinganishaji wa mawakala na escrow vinafanya kazi kwenye testnet kwa fedha za majaribio. Akaunti na pochi za mainnet hupatikana kwa mwaliko, mtumiaji mmoja kwa wakati. Escrow ya mainnet na kushiriki sifa kati ya majukwaa bado havipatikani.",
    feature: 'Kipengele',
    testnet: 'Testnet ya Arc',
    mainnet: 'Mainnet ya Arc',
    status: { live: 'Kinapatikana', invite: 'Kwa mwaliko tu', planned: 'Kimepangwa' },
    rows: statusRows([
      'Jisajili kwa barua pepe, passkey au pochi',
      'Mikataba ya escrow yenye awamu',
      'Ulinganishaji na majadiliano ya mawakala',
      'Kuongeza USDC kutoka minyororo mingine',
      'Migogoro na muda wa ukaguzi',
      'Rekodi ya sifa kwenye mnyororo',
      'Jumla za umma kutoka kwenye mikataba',
      'Ufikiaji wa data unaolipiwa kupitia x402',
    ]),
  },
  roadmap: {
    title: 'Ramani ya maendeleo',
    lede: 'Kinachokuja baadaye, kwa mpangilio.',
    now: 'Sasa',
    milestones: [
      { when: 'Sasa', title: 'Orodha ya kusubiri ya mainnet', body: "Karwan iko kwenye Arc mainnet yenye akaunti na pochi kwa mwaliko. Tunapokea mtumiaji mmoja kwa wakati kutoka orodha ya kusubiri." },
      { when: 'Kinachofuata', title: 'Mikataba kwenye mainnet', body: 'Mikataba ya escrow, ubao wa mikataba na dhamana huzinduliwa kwenye mainnet ya Arc ili mikataba halisi ikamilike.' },
      { when: 'Kisha', title: 'Msuluhishi na ukaguzi wa nje', body: 'Msuluhishi wa mikataba ambapo upande mmoja umenyamaza, kwa kutumia ushahidi wa uwasilishaji, na ukaguzi wa nje wa mikataba inayoshikilia pesa.' },
      { when: 'Baada ya hapo', title: 'Fanya biashara popote', body: 'Anzisha mkataba uliolindwa kutoka ukurasa ambapo biashara ilianzia, kuanzia X, pamoja na mikataba ya kujirudia.' },
      { when: 'Baadaye', title: 'Malipo ya ndani', body: 'Toa USDC kwenda akaunti ya benki ya ndani, nchi moja baada ya nyingine.' },
    ],
    later: 'Pia imepangwa',
    laterItems: ['Programu ya simu baada ya uzinduzi wa mainnet', 'Ufikiaji wa data unaolipiwa kupitia x402', 'Kuwasilisha faili ndani ya mkataba', 'Lugha zaidi'],
    note: 'Hatuchapishi tarehe. Kila hatua huzinduliwa majaribio na ukaguzi wake wa usalama vikikamilika.',
    full: 'Soma ramani kamili',
  },
  cta: {
    title: "Jiunge na watumiaji wa mwanzo",
    body: 'Jiunge na orodha ya kusubiri ya mainnet, au jaribu mkataba kamili kwa pesa za majaribio kwenye testnet.',
    primary: 'Jiunge na orodha ya kusubiri',
    secondary: 'Jaribu kwenye testnet',
  },
  explore: { title: 'Soma nyaraka' },
  toc: { title: 'Kwenye ukurasa huu', problem: 'Tatizo', how: 'Jinsi mkataba unavyofanyika', why: 'Kwa nini Karwan', today: 'Kinachofanya kazi leo', roadmap: 'Ramani', explore: 'Soma nyaraka' },
};

export const docsProductCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', DocsProductCopy> = { en, ar, fr, hi, sw };
