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
    title: "Trade with people you don't know. Get paid when the work is done.",
    lede: 'Karwan holds the USDC in an escrow contract on Arc until the agreed work is delivered. The contract holds the money, not Karwan, and it pays out by the rules both sides agreed.',
    testnet: 'Testnet: open for trading',
    mainnet: 'Mainnet: waitlist open',
    primary: 'Open Karwan',
    secondary: 'See how a deal works',
    scroll: 'Scroll',
  },
  problem: {
    title: 'Paying a stranger online means someone takes the risk',
    body: 'Pay first and the seller can disappear. Deliver first and the buyer can stop replying. Most trades between strangers run on trust, a screenshot, or a middleman who holds the money. Karwan puts the money in a contract that both sides can check.',
  },
  how: {
    title: 'How a deal works',
    lede: 'Four steps, the same for a logo, a used phone or a container of goods.',
    steps: [
      { title: 'Agree the terms', body: 'Buyer and seller set what gets delivered, the price, the deadline and how the payment splits into stages. Nothing is paid yet.' },
      { title: 'Lock the USDC', body: 'The buyer funds the escrow contract and sees the exact total, fee included, before paying. The seller can see the money is there before starting work.' },
      { title: 'Deliver the work', body: 'The seller marks the work delivered. The buyer gets a review window, set in the terms, to check it.' },
      { title: 'Release the payment', body: 'The buyer releases each stage. If the buyer goes quiet, the first stage releases when its review window ends. If something is wrong, either side can open a dispute, and the unreleased money stays frozen until it is settled.' },
    ],
    card: {
      label: 'Karwan deal',
      title: 'Logo design, 3 revisions',
      parties: '@bakery_kofi to @ada_designs',
      states: ['Agreed', 'USDC locked', 'Delivered', 'Paid'],
    },
  },
  why: {
    title: 'Why people trade on Karwan',
    lede: 'Each of these can be checked in the product or on chain.',
    reasons: [
      { title: 'The contract holds the money', body: 'USDC sits in an escrow contract on Arc, not in a Karwan account. It leaves only through the release, refund and dispute paths written into the contract.' },
      { title: 'Pay in stages', body: 'Split a deal into milestones and release each one on its own. A large job never rides on one payment.' },
      { title: 'Settles in about a second', body: 'Arc confirms a payment in under a second, and network fees are paid in USDC. You only ever hold one token.' },
      { title: 'A record anyone can check', body: 'Every funded deal and payout is recorded on chain. Both sides earn a reputation record, and Karwan publishes its totals straight from the contracts.' },
      { title: 'Sign in with an email', body: 'Create an account with an email and a passkey on your device. There is no seed phrase to lose. You can also connect your own wallet.' },
      { title: 'Agents do the legwork', body: 'Post what you need and your agent finds sellers and negotiates inside the limits you set. You approve the terms before any USDC moves.' },
      { title: 'Add USDC from other chains', body: 'Send USDC from Ethereum, Base, Arbitrum or Polygon to one address. It lands on Arc in the same balance.' },
    ],
    numbersLink: 'See the public numbers',
  },
  facts: {
    fee: 'Fee',
    feeValue: '1.5%, split between buyer and seller',
    confirm: 'Confirmation',
    confirmValue: 'Under 1 second on Arc',
    token: 'Currency',
    tokenValue: 'USDC, for payment and fees',
    note: 'Figures from Arc testnet today.',
  },
  today: {
    title: 'What works today',
    lede: 'Testnet runs the full product with test money. Mainnet is open by invitation while the deal contracts are prepared for release.',
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
      { when: 'Now', title: 'Mainnet waitlist', body: 'Karwan is live on Arc mainnet by invitation. People on the waitlist are let in in batches.' },
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
    title: 'Start with one deal',
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
    title: 'تاجر مع أشخاص لا تعرفهم. واحصل على أجرك عندما يكتمل العمل.',
    lede: 'يحتفظ كاروان بعملات USDC في عقد ضمان على Arc حتى يُسلَّم العمل المتفق عليه. العقد هو من يحتفظ بالمال وليس كاروان، ويدفع وفق القواعد التي اتفق عليها الطرفان.',
    testnet: 'الشبكة التجريبية: مفتوحة للتداول',
    mainnet: 'الشبكة الرئيسية: قائمة الانتظار مفتوحة',
    primary: 'افتح كاروان',
    secondary: 'اطّلع على كيفية سير الصفقة',
    scroll: 'مرّر',
  },
  problem: {
    title: 'الدفع لشخص غريب عبر الإنترنت يعني أن أحدًا يتحمل المخاطرة',
    body: 'إذا دفعت أولًا فقد يختفي البائع. وإذا سلّمت أولًا فقد يتوقف المشتري عن الرد. معظم الصفقات بين الغرباء تقوم على الثقة أو لقطة شاشة أو وسيط يحتفظ بالمال. يضع كاروان المال في عقد يستطيع الطرفان التحقق منه.',
  },
  how: {
    title: 'كيف تسير الصفقة',
    lede: 'أربع خطوات، هي نفسها لشعار أو هاتف مستعمل أو حاوية بضائع.',
    steps: [
      { title: 'الاتفاق على الشروط', body: 'يحدد المشتري والبائع ما سيُسلَّم والسعر والموعد النهائي وكيفية تقسيم الدفع إلى مراحل. لا يُدفع شيء بعد.' },
      { title: 'حجز USDC', body: 'يموّل المشتري عقد الضمان ويرى المبلغ الإجمالي الدقيق شاملًا الرسوم قبل الدفع. ويرى البائع أن المال موجود قبل بدء العمل.' },
      { title: 'تسليم العمل', body: 'يحدد البائع أن العمل قد سُلّم. ويحصل المشتري على فترة مراجعة محددة في الشروط للتحقق منه.' },
      { title: 'تحرير الدفعة', body: 'يحرر المشتري كل مرحلة. إذا لم يستجب المشتري، تُحرَّر المرحلة الأولى عند انتهاء فترة مراجعتها. وإذا كان هناك خطأ، يمكن لأي طرف فتح نزاع، ويبقى المال غير المحرر مجمّدًا حتى تتم تسويته.' },
    ],
    card: {
      label: 'صفقة كاروان',
      title: 'تصميم شعار، 3 مراجعات',
      parties: 'من ‎@bakery_kofi إلى ‎@ada_designs',
      states: ['تم الاتفاق', 'تم حجز USDC', 'تم التسليم', 'تم الدفع'],
    },
  },
  why: {
    title: 'لماذا يتاجر الناس على كاروان',
    lede: 'يمكن التحقق من كل نقطة داخل المنتج أو على السلسلة.',
    reasons: [
      { title: 'العقد يحتفظ بالمال', body: 'تبقى USDC في عقد ضمان على Arc، وليس في حساب لدى كاروان. ولا تخرج إلا عبر مسارات التحرير والاسترداد والنزاع المكتوبة في العقد.' },
      { title: 'ادفع على مراحل', body: 'قسّم الصفقة إلى مراحل وحرّر كل مرحلة وحدها. لا يعتمد عمل كبير على دفعة واحدة.' },
      { title: 'تسوية في نحو ثانية', body: 'تؤكد Arc الدفعة في أقل من ثانية، وتُدفع رسوم الشبكة بعملة USDC. لا تحتاج إلا إلى عملة واحدة.' },
      { title: 'سجل يمكن لأي أحد التحقق منه', body: 'كل صفقة ممولة وكل دفعة مسجلة على السلسلة. يكسب الطرفان سجل سمعة، وينشر كاروان إجمالياته مباشرة من العقود.' },
      { title: 'سجّل الدخول ببريدك الإلكتروني', body: 'أنشئ حسابًا ببريد إلكتروني ومفتاح مرور على جهازك. لا توجد عبارة استرداد لتفقدها. ويمكنك أيضًا ربط محفظتك.' },
      { title: 'الوكلاء يتولون البحث', body: 'انشر ما تحتاجه وسيجد وكيلك بائعين ويفاوض ضمن الحدود التي تضعها. توافق أنت على الشروط قبل تحريك أي USDC.' },
      { title: 'أضف USDC من شبكات أخرى', body: 'أرسل USDC من Ethereum أو Base أو Arbitrum أو Polygon إلى عنوان واحد. تصل إلى Arc في الرصيد نفسه.' },
    ],
    numbersLink: 'اطّلع على الأرقام العامة',
  },
  facts: {
    fee: 'الرسوم',
    feeValue: '1.5%، مقسّمة بين المشتري والبائع',
    confirm: 'التأكيد',
    confirmValue: 'أقل من ثانية على Arc',
    token: 'العملة',
    tokenValue: 'USDC للدفع والرسوم',
    note: 'الأرقام من الشبكة التجريبية لـ Arc اليوم.',
  },
  today: {
    title: 'ما يعمل اليوم',
    lede: 'تشغّل الشبكة التجريبية المنتج كاملًا بأموال تجريبية. والشبكة الرئيسية مفتوحة بالدعوة بينما تُجهَّز عقود الصفقات للإطلاق.',
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
      { when: 'الآن', title: 'قائمة انتظار الشبكة الرئيسية', body: 'كاروان متاح على الشبكة الرئيسية لـ Arc بالدعوة. يُسمح بدخول من في قائمة الانتظار على دفعات.' },
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
    title: 'ابدأ بصفقة واحدة',
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
    title: 'Échangez avec des inconnus. Soyez payé quand le travail est fait.',
    lede: 'Karwan conserve les USDC dans un contrat de séquestre sur Arc jusqu’à la livraison du travail convenu. C’est le contrat qui détient l’argent, pas Karwan, et il paie selon les règles acceptées par les deux parties.',
    testnet: 'Testnet : ouvert aux échanges',
    mainnet: 'Mainnet : liste d’attente ouverte',
    primary: 'Ouvrir Karwan',
    secondary: 'Voir comment se déroule une transaction',
    scroll: 'Défiler',
  },
  problem: {
    title: 'Payer un inconnu en ligne, c’est laisser quelqu’un prendre le risque',
    body: 'Payez d’abord et le vendeur peut disparaître. Livrez d’abord et l’acheteur peut cesser de répondre. La plupart des échanges entre inconnus reposent sur la confiance, une capture d’écran ou un intermédiaire qui garde l’argent. Karwan place l’argent dans un contrat que les deux parties peuvent vérifier.',
  },
  how: {
    title: 'Comment se déroule une transaction',
    lede: 'Quatre étapes, les mêmes pour un logo, un téléphone d’occasion ou un conteneur de marchandises.',
    steps: [
      { title: 'Convenir des conditions', body: 'L’acheteur et le vendeur fixent ce qui sera livré, le prix, l’échéance et le découpage du paiement en étapes. Rien n’est encore payé.' },
      { title: 'Bloquer les USDC', body: 'L’acheteur finance le contrat de séquestre et voit le total exact, frais compris, avant de payer. Le vendeur voit que l’argent est là avant de commencer.' },
      { title: 'Livrer le travail', body: 'Le vendeur indique que le travail est livré. L’acheteur dispose d’une période de vérification, fixée dans les conditions.' },
      { title: 'Libérer le paiement', body: 'L’acheteur libère chaque étape. S’il ne répond plus, la première étape est libérée à la fin de sa période de vérification. En cas de problème, chaque partie peut ouvrir un litige, et l’argent non libéré reste gelé jusqu’à son règlement.' },
    ],
    card: {
      label: 'Transaction Karwan',
      title: 'Création de logo, 3 révisions',
      parties: 'De @bakery_kofi à @ada_designs',
      states: ['Accord conclu', 'USDC bloqués', 'Livré', 'Payé'],
    },
  },
  why: {
    title: 'Pourquoi échanger sur Karwan',
    lede: 'Chaque point peut être vérifié dans le produit ou sur la chaîne.',
    reasons: [
      { title: 'Le contrat détient l’argent', body: 'Les USDC restent dans un contrat de séquestre sur Arc, pas sur un compte Karwan. Ils n’en sortent que par les voies de libération, de remboursement et de litige écrites dans le contrat.' },
      { title: 'Payer par étapes', body: 'Découpez une transaction en jalons et libérez-les un par un. Un gros projet ne dépend jamais d’un seul paiement.' },
      { title: 'Réglé en une seconde environ', body: 'Arc confirme un paiement en moins d’une seconde, et les frais de réseau se paient en USDC. Vous ne détenez qu’une seule monnaie.' },
      { title: 'Un historique vérifiable par tous', body: 'Chaque transaction financée et chaque paiement sont enregistrés sur la chaîne. Les deux parties gagnent un historique de réputation, et Karwan publie ses totaux directement depuis les contrats.' },
      { title: 'Connexion par e-mail', body: 'Créez un compte avec un e-mail et une clé d’accès sur votre appareil. Aucune phrase de récupération à perdre. Vous pouvez aussi connecter votre propre portefeuille.' },
      { title: 'Des agents qui font le travail de recherche', body: 'Publiez votre besoin et votre agent trouve des vendeurs et négocie dans les limites que vous fixez. Vous approuvez les conditions avant tout mouvement d’USDC.' },
      { title: 'Ajouter des USDC depuis d’autres chaînes', body: 'Envoyez des USDC depuis Ethereum, Base, Arbitrum ou Polygon vers une seule adresse. Ils arrivent sur Arc dans le même solde.' },
    ],
    numbersLink: 'Voir les chiffres publics',
  },
  facts: {
    fee: 'Frais',
    feeValue: '1,5 %, partagés entre acheteur et vendeur',
    confirm: 'Confirmation',
    confirmValue: 'Moins d’une seconde sur Arc',
    token: 'Monnaie',
    tokenValue: 'USDC, pour le paiement et les frais',
    note: 'Chiffres du testnet Arc aujourd’hui.',
  },
  today: {
    title: 'Ce qui fonctionne aujourd’hui',
    lede: 'Le testnet fait tourner tout le produit avec de l’argent de test. Le mainnet est ouvert sur invitation pendant la préparation des contrats de transaction.',
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
      { when: 'Maintenant', title: 'Liste d’attente mainnet', body: 'Karwan est en ligne sur le mainnet d’Arc sur invitation. Les personnes inscrites entrent par vagues.' },
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
    title: 'Commencez par une transaction',
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
    title: 'अनजान लोगों से व्यापार करें। काम पूरा होने पर भुगतान पाएँ।',
    lede: 'कारवान तय काम डिलीवर होने तक USDC को Arc पर एक एस्क्रो अनुबंध में रखता है। पैसा अनुबंध रखता है, कारवान नहीं, और भुगतान दोनों पक्षों के तय नियमों से होता है।',
    testnet: 'टेस्टनेट: व्यापार के लिए खुला',
    mainnet: 'मेननेट: प्रतीक्षा सूची खुली',
    primary: 'कारवान खोलें',
    secondary: 'देखें सौदा कैसे होता है',
    scroll: 'स्क्रॉल करें',
  },
  problem: {
    title: 'ऑनलाइन अनजान व्यक्ति को भुगतान करने में किसी न किसी को जोखिम उठाना पड़ता है',
    body: 'पहले भुगतान करें तो विक्रेता गायब हो सकता है। पहले डिलीवर करें तो खरीदार जवाब देना बंद कर सकता है। अनजान लोगों के बीच ज़्यादातर सौदे भरोसे, स्क्रीनशॉट या पैसा रखने वाले बिचौलिये पर चलते हैं। कारवान पैसे को ऐसे अनुबंध में रखता है जिसे दोनों पक्ष जाँच सकते हैं।',
  },
  how: {
    title: 'सौदा कैसे होता है',
    lede: 'चार चरण, चाहे लोगो हो, पुराना फ़ोन हो या माल का कंटेनर।',
    steps: [
      { title: 'शर्तें तय करें', body: 'खरीदार और विक्रेता तय करते हैं कि क्या डिलीवर होगा, कीमत, समय सीमा और भुगतान किन चरणों में बँटेगा। अभी कुछ भुगतान नहीं होता।' },
      { title: 'USDC लॉक करें', body: 'खरीदार एस्क्रो अनुबंध में पैसा डालता है और भुगतान से पहले शुल्क सहित सटीक कुल राशि देखता है। विक्रेता काम शुरू करने से पहले देख सकता है कि पैसा मौजूद है।' },
      { title: 'काम डिलीवर करें', body: 'विक्रेता काम को डिलीवर चिह्नित करता है। खरीदार को जाँच के लिए शर्तों में तय समीक्षा अवधि मिलती है।' },
      { title: 'भुगतान जारी करें', body: 'खरीदार हर चरण जारी करता है। अगर खरीदार जवाब नहीं देता, तो पहला चरण उसकी समीक्षा अवधि खत्म होने पर जारी हो जाता है। कुछ गलत हो तो कोई भी पक्ष विवाद खोल सकता है, और निपटारे तक बचा पैसा रुका रहता है।' },
    ],
    card: {
      label: 'कारवान सौदा',
      title: 'लोगो डिज़ाइन, 3 संशोधन',
      parties: '@bakery_kofi से @ada_designs',
      states: ['सहमति हुई', 'USDC लॉक', 'डिलीवर हुआ', 'भुगतान हुआ'],
    },
  },
  why: {
    title: 'लोग कारवान पर व्यापार क्यों करते हैं',
    lede: 'हर बात को प्रोडक्ट में या चेन पर जाँचा जा सकता है।',
    reasons: [
      { title: 'पैसा अनुबंध रखता है', body: 'USDC Arc पर एक एस्क्रो अनुबंध में रहता है, कारवान के किसी खाते में नहीं। यह केवल अनुबंध में लिखे रिलीज़, रिफ़ंड और विवाद के रास्तों से निकलता है।' },
      { title: 'चरणों में भुगतान', body: 'सौदे को चरणों में बाँटें और हर चरण अलग से जारी करें। बड़ा काम कभी एक भुगतान पर नहीं टिकता।' },
      { title: 'लगभग एक सेकंड में निपटान', body: 'Arc एक सेकंड से कम में भुगतान की पुष्टि करता है, और नेटवर्क शुल्क USDC में लगता है। आपको बस एक टोकन रखना होता है।' },
      { title: 'ऐसा रिकॉर्ड जिसे कोई भी जाँच सके', body: 'हर फ़ंड किया गया सौदा और भुगतान चेन पर दर्ज होता है। दोनों पक्षों को प्रतिष्ठा रिकॉर्ड मिलता है, और कारवान अपने कुल आँकड़े सीधे अनुबंधों से प्रकाशित करता है।' },
      { title: 'ईमेल से साइन इन', body: 'ईमेल और अपने डिवाइस पर पासकी से खाता बनाएँ। खोने के लिए कोई सीड फ़्रेज़ नहीं। आप अपना वॉलेट भी जोड़ सकते हैं।' },
      { title: 'एजेंट खोजबीन करते हैं', body: 'जो चाहिए वह पोस्ट करें और आपका एजेंट विक्रेता ढूँढकर आपकी तय सीमाओं में मोलभाव करता है। कोई USDC हिलने से पहले आप शर्तें मंज़ूर करते हैं।' },
      { title: 'दूसरी चेन से USDC जोड़ें', body: 'Ethereum, Base, Arbitrum या Polygon से एक ही पते पर USDC भेजें। वह उसी बैलेंस में Arc पर आ जाता है।' },
    ],
    numbersLink: 'सार्वजनिक आँकड़े देखें',
  },
  facts: {
    fee: 'शुल्क',
    feeValue: '1.5%, खरीदार और विक्रेता में बँटा',
    confirm: 'पुष्टि',
    confirmValue: 'Arc पर 1 सेकंड से कम',
    token: 'मुद्रा',
    tokenValue: 'भुगतान और शुल्क के लिए USDC',
    note: 'आँकड़े आज के Arc टेस्टनेट से।',
  },
  today: {
    title: 'आज क्या काम करता है',
    lede: 'टेस्टनेट पर पूरा प्रोडक्ट टेस्ट पैसे से चलता है। सौदा अनुबंधों की रिलीज़ की तैयारी तक मेननेट आमंत्रण से खुला है।',
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
      { when: 'अभी', title: 'मेननेट प्रतीक्षा सूची', body: 'कारवान Arc मेननेट पर आमंत्रण से लाइव है। प्रतीक्षा सूची के लोगों को बैचों में प्रवेश मिलता है।' },
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
    title: 'एक सौदे से शुरुआत करें',
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
    title: 'Fanya biashara na watu usiowajua. Ulipwe kazi ikikamilika.',
    lede: 'Karwan huhifadhi USDC kwenye mkataba wa escrow kwenye Arc hadi kazi iliyokubaliwa iwasilishwe. Mkataba ndio unashikilia pesa, si Karwan, na hulipa kwa kanuni zilizokubaliwa na pande zote mbili.',
    testnet: 'Testnet: wazi kwa biashara',
    mainnet: 'Mainnet: orodha ya kusubiri iko wazi',
    primary: 'Fungua Karwan',
    secondary: 'Ona jinsi mkataba unavyofanyika',
    scroll: 'Sogeza',
  },
  problem: {
    title: 'Kumlipa mgeni mtandaoni kunamaanisha mtu anabeba hatari',
    body: 'Ukilipa kwanza, muuzaji anaweza kutoweka. Ukiwasilisha kwanza, mnunuzi anaweza kuacha kujibu. Biashara nyingi kati ya wageni hutegemea imani, picha ya skrini, au mtu wa kati anayeshikilia pesa. Karwan huweka pesa kwenye mkataba ambao pande zote mbili zinaweza kuukagua.',
  },
  how: {
    title: 'Jinsi mkataba unavyofanyika',
    lede: 'Hatua nne, zilezile kwa nembo, simu iliyotumika au kontena la bidhaa.',
    steps: [
      { title: 'Kubaliana masharti', body: 'Mnunuzi na muuzaji huweka kitakachowasilishwa, bei, tarehe ya mwisho na jinsi malipo yanavyogawanywa kwa awamu. Hakuna kinacholipwa bado.' },
      { title: 'Funga USDC', body: 'Mnunuzi hufadhili mkataba wa escrow na huona jumla kamili, ada ikiwemo, kabla ya kulipa. Muuzaji huona pesa ipo kabla ya kuanza kazi.' },
      { title: 'Wasilisha kazi', body: 'Muuzaji huweka alama kuwa kazi imewasilishwa. Mnunuzi hupata muda wa ukaguzi uliowekwa kwenye masharti.' },
      { title: 'Toa malipo', body: 'Mnunuzi hutoa kila awamu. Mnunuzi akinyamaza, awamu ya kwanza hutolewa muda wake wa ukaguzi ukiisha. Kukiwa na tatizo, upande wowote unaweza kufungua mgogoro, na pesa ambayo haijatolewa hubaki imezuiwa hadi usuluhishwe.' },
    ],
    card: {
      label: 'Mkataba wa Karwan',
      title: 'Kubuni nembo, marekebisho 3',
      parties: 'Kutoka @bakery_kofi kwenda @ada_designs',
      states: ['Imekubaliwa', 'USDC imefungwa', 'Imewasilishwa', 'Imelipwa'],
    },
  },
  why: {
    title: 'Kwa nini watu hufanya biashara kwenye Karwan',
    lede: 'Kila jambo linaweza kukaguliwa kwenye bidhaa au kwenye mnyororo.',
    reasons: [
      { title: 'Mkataba unashikilia pesa', body: 'USDC hukaa kwenye mkataba wa escrow kwenye Arc, si kwenye akaunti ya Karwan. Hutoka tu kupitia njia za kutoa, kurejesha na mgogoro zilizoandikwa kwenye mkataba.' },
      { title: 'Lipa kwa awamu', body: 'Gawanya mkataba kwa hatua na utoe kila moja peke yake. Kazi kubwa haitegemei malipo moja.' },
      { title: 'Hukamilika kwa takriban sekunde moja', body: 'Arc huthibitisha malipo chini ya sekunde moja, na ada za mtandao hulipwa kwa USDC. Unahitaji sarafu moja tu.' },
      { title: 'Rekodi ambayo yeyote anaweza kuikagua', body: 'Kila mkataba uliofadhiliwa na kila malipo hurekodiwa kwenye mnyororo. Pande zote mbili hupata rekodi ya sifa, na Karwan huchapisha jumla zake moja kwa moja kutoka kwenye mikataba.' },
      { title: 'Ingia kwa barua pepe', body: 'Fungua akaunti kwa barua pepe na passkey kwenye kifaa chako. Hakuna maneno ya siri ya kupoteza. Unaweza pia kuunganisha pochi yako.' },
      { title: 'Mawakala hufanya utafutaji', body: 'Weka unachohitaji na wakala wako hupata wauzaji na kujadiliana ndani ya mipaka unayoweka. Unaidhinisha masharti kabla USDC yoyote kusogea.' },
      { title: 'Ongeza USDC kutoka minyororo mingine', body: 'Tuma USDC kutoka Ethereum, Base, Arbitrum au Polygon kwenda anwani moja. Hufika Arc kwenye salio lilelile.' },
    ],
    numbersLink: 'Ona takwimu za umma',
  },
  facts: {
    fee: 'Ada',
    feeValue: '1.5%, hugawanywa kati ya mnunuzi na muuzaji',
    confirm: 'Uthibitisho',
    confirmValue: 'Chini ya sekunde 1 kwenye Arc',
    token: 'Sarafu',
    tokenValue: 'USDC, kwa malipo na ada',
    note: 'Takwimu kutoka testnet ya Arc leo.',
  },
  today: {
    title: 'Kinachofanya kazi leo',
    lede: 'Testnet huendesha bidhaa nzima kwa pesa za majaribio. Mainnet iko wazi kwa mwaliko wakati mikataba ya biashara inaandaliwa kuzinduliwa.',
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
      { when: 'Sasa', title: 'Orodha ya kusubiri ya mainnet', body: 'Karwan iko hewani kwenye mainnet ya Arc kwa mwaliko. Walio kwenye orodha ya kusubiri huingizwa kwa makundi.' },
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
    title: 'Anza na mkataba mmoja',
    body: 'Jiunge na orodha ya kusubiri ya mainnet, au jaribu mkataba kamili kwa pesa za majaribio kwenye testnet.',
    primary: 'Jiunge na orodha ya kusubiri',
    secondary: 'Jaribu kwenye testnet',
  },
  explore: { title: 'Soma nyaraka' },
  toc: { title: 'Kwenye ukurasa huu', problem: 'Tatizo', how: 'Jinsi mkataba unavyofanyika', why: 'Kwa nini Karwan', today: 'Kinachofanya kazi leo', roadmap: 'Ramani', explore: 'Soma nyaraka' },
};

export const docsProductCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', DocsProductCopy> = { en, ar, fr, hi, sw };
