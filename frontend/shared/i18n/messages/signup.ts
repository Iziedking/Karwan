export interface SignupCopy {
  welcome: { tagline: string; backdropLabel: string };
  backdrop: {
    states: { agreed: string; locked: string; delivered: string; paid: string };
    deals: [string, string, string, string, string, string];
  };
  signIn: {
    title: string;
    emailLabel: string;
    continue: string;
    checking: string;
    or: string;
    wallet: string;
    walletContinue: string;
    walletSigning: string;
    passkeyTitle: string;
    passkeyButton: string;
    passkeyWaiting: string;
    codeTitle: string;
    codeSent: string;
    codeLabel: string;
    verify: string;
    verifying: string;
    resend: string;
    notFound: string;
    createInstead: string;
    noAccount: string;
    signUp: string;
    browsePrompt: string;
    browse: string;
  };
  signUp: {
    title: string;
    step: string;
    tagLabel: string;
    tagHint: string;
    tagChecking: string;
    tagAvailable: string;
    tagTaken: string;
    tagTooShort: string;
    tagTooLong: string;
    tagInvalid: string;
    tagReserved: string;
    next: string;
    methodTitle: string;
    emailLabel: string;
    sendCode: string;
    sending: string;
    codeTitle: string;
    codeSent: string;
    codeLabel: string;
    verify: string;
    verifying: string;
    resend: string;
    passkeyTitle: string;
    passkeyBody: string;
    passkeyCreate: string;
    passkeyWaiting: string;
    wallet: string;
    walletSigning: string;
    kindTitle: string;
    person: string;
    personBody: string;
    business: string;
    businessBody: string;
    comingSoon: string;
    termsPrefix: string;
    termsLink: string;
    create: string;
    creating: string;
    haveAccount: string;
    signIn: string;
    back: string;
  };
  tagPrompt: { title: string; body: string; save: string; saving: string };
  waitlist: {
    title: string;
    body: string;
    emailLabel: string;
    join: string;
    sending: string;
    codeTitle: string;
    codeSent: string;
    codeLabel: string;
    verify: string;
    verifying: string;
    resend: string;
    doneTitle: string;
    doneBody: string;
    position: string;
    invitedBody: string;
    createAccount: string;
    invitedPrompt: string;
    signIn: string;
    back: string;
    wrongCode: string;
    expired: string;
    sendFailed: string;
  };
  errors: {
    generic: string;
    notInvited: string;
    lookupFailed: string;
    codeSendFailed: string;
    codeRejected: string;
    passkeyCancelled: string;
    passkeyFailed: string;
    walletCancelled: string;
    emailInUse: string;
    emailExpired: string;
    tagTaken: string;
    accountExists: string;
    businessUnavailable: string;
    termsFailed: string;
  };
}

const en: SignupCopy = {
  welcome: {
    tagline: 'Trade with anyone online. The USDC waits in escrow until the work is done.',
    backdropLabel: 'Examples of deals made on Karwan',
  },
  backdrop: {
    states: { agreed: 'Agreed', locked: 'USDC locked', delivered: 'Delivered', paid: 'Paid' },
    deals: [
      'Logo design, 3 revisions',
      'Used iPhone 14, shipped',
      'Domain name transfer',
      '1-hour consulting call',
      '200 printed T-shirts',
      'Translation, English to Arabic',
    ],
  },
  signIn: {
    title: 'Sign in to Karwan',
    emailLabel: 'Email',
    continue: 'Continue',
    checking: 'Checking',
    or: 'or',
    wallet: 'Connect a wallet',
    walletContinue: 'Continue with your wallet',
    walletSigning: 'Check your wallet',
    passkeyTitle: 'Use your passkey',
    passkeyButton: 'Sign in with passkey',
    passkeyWaiting: 'Waiting for your passkey',
    codeTitle: 'Check your email',
    codeSent: 'We sent a 6-digit code to {email}.',
    codeLabel: 'Code',
    verify: 'Sign in',
    verifying: 'Signing in',
    resend: 'Send a new code',
    notFound: 'No account uses this email yet.',
    createInstead: 'Create an account',
    noAccount: "Don't have an account?",
    signUp: 'Sign up',
    browsePrompt: 'Just looking around?',
    browse: 'Browse the market first',
  },
  signUp: {
    title: 'Create your account',
    step: 'Step {n} of 3',
    tagLabel: 'Choose your Karwan tag',
    tagHint: 'People find you and send you deals by this tag.',
    tagChecking: 'Checking',
    tagAvailable: '@{tag} is available',
    tagTaken: '@{tag} is taken',
    tagTooShort: 'Use at least 3 characters.',
    tagTooLong: 'Use at most 20 characters.',
    tagInvalid: 'Letters, numbers and single underscores. Start with a letter.',
    tagReserved: 'This tag is reserved.',
    next: 'Continue',
    methodTitle: 'Sign in with',
    emailLabel: 'Email',
    sendCode: 'Send code',
    sending: 'Sending code',
    codeTitle: 'Check your email',
    codeSent: 'Enter the 6-digit code we sent to {email}.',
    codeLabel: 'Code',
    verify: 'Verify email',
    verifying: 'Verifying',
    resend: 'Send a new code',
    passkeyTitle: 'Create your passkey',
    passkeyBody: 'Your passkey signs you in and controls your wallet. It stays on this device.',
    passkeyCreate: 'Create passkey',
    passkeyWaiting: 'Waiting for your passkey',
    wallet: 'Connect a wallet',
    walletSigning: 'Check your wallet',
    kindTitle: 'Who is this account for?',
    person: 'Personal',
    personBody: 'Buy and sell as yourself.',
    business: 'Business',
    businessBody: 'Trade as a company.',
    comingSoon: 'Coming soon',
    termsPrefix: 'I agree to the',
    termsLink: 'Karwan Terms of Use',
    create: 'Create account',
    creating: 'Creating your account',
    haveAccount: 'Already have an account?',
    signIn: 'Sign in',
    back: 'Back',
  },
  tagPrompt: {
    title: 'Choose your Karwan tag',
    body: 'People find you and send you deals by your tag. You pick it once.',
    save: 'Save tag',
    saving: 'Saving',
  },
  waitlist: {
    title: "Join the Karwan waitlist",
    body: "Karwan is live on Arc mainnet. We are letting people in a few at a time.",
    emailLabel: "Email",
    join: "Join the waitlist",
    sending: "Sending code",
    codeTitle: "Check your email",
    codeSent: "Enter the 6-digit code we sent to {email}.",
    codeLabel: "Code",
    verify: "Confirm",
    verifying: "Confirming",
    resend: "Send a new code",
    doneTitle: "Congratulations, you're on the waitlist",
    doneBody: "We'll email {email} when Karwan opens for you.",
    position: "You're number {n} on the list.",
    invitedBody: "Your email is already invited. You can create your account now.",
    createAccount: "Create your account",
    invitedPrompt: "Already invited?",
    signIn: "Sign in",
    back: "Back to the waitlist",
    wrongCode: "That code did not work. Check it and try again.",
    expired: "The code expired. Send a new one.",
    sendFailed: "We could not send the code. Try again.",
  },
  errors: {
    generic: 'Something went wrong. Try again.',
    notInvited: "This email is not invited yet. Join the waitlist instead.",
    lookupFailed: 'We could not check that email. Try again.',
    codeSendFailed: 'We could not send the code. Try again.',
    codeRejected: 'That code did not work. Check it and try again.',
    passkeyCancelled: 'Passkey cancelled. Try again when you are ready.',
    passkeyFailed: 'We could not reach your passkey. Try again.',
    walletCancelled: 'Signature cancelled. Try again when you are ready.',
    emailInUse: 'This email already has an account. Sign in instead.',
    emailExpired: 'The code expired. Send a new one.',
    tagTaken: 'That tag was just taken. Pick another.',
    accountExists: 'You already have an account. Taking you to it.',
    businessUnavailable: 'Business accounts are coming soon.',
    termsFailed: 'We could not record your agreement. Try again.',
  },
};

const ar: SignupCopy = {
  welcome: {
    tagline: 'تاجر مع أي شخص عبر الإنترنت. تبقى عملات USDC في الضمان حتى يكتمل العمل.',
    backdropLabel: 'أمثلة على صفقات تمت على كاروان',
  },
  backdrop: {
    states: { agreed: 'تم الاتفاق', locked: 'تم حجز USDC', delivered: 'تم التسليم', paid: 'تم الدفع' },
    deals: [
      'تصميم شعار، 3 مراجعات',
      'آيفون 14 مستعمل، مع الشحن',
      'نقل اسم نطاق',
      'مكالمة استشارية لمدة ساعة',
      '200 قميص مطبوع',
      'ترجمة من الإنجليزية إلى العربية',
    ],
  },
  signIn: {
    title: 'تسجيل الدخول إلى كاروان',
    emailLabel: 'البريد الإلكتروني',
    continue: 'متابعة',
    checking: 'جارٍ التحقق',
    or: 'أو',
    wallet: 'ربط محفظة',
    walletContinue: 'المتابعة بمحفظتك',
    walletSigning: 'تحقق من محفظتك',
    passkeyTitle: 'استخدم مفتاح المرور',
    passkeyButton: 'تسجيل الدخول بمفتاح المرور',
    passkeyWaiting: 'بانتظار مفتاح المرور',
    codeTitle: 'تحقق من بريدك',
    codeSent: 'أرسلنا رمزًا من 6 أرقام إلى {email}.',
    codeLabel: 'الرمز',
    verify: 'تسجيل الدخول',
    verifying: 'جارٍ تسجيل الدخول',
    resend: 'إرسال رمز جديد',
    notFound: 'لا يوجد حساب بهذا البريد بعد.',
    createInstead: 'إنشاء حساب',
    noAccount: 'ليس لديك حساب؟',
    signUp: 'أنشئ حسابًا',
    browsePrompt: 'تتصفح فقط؟',
    browse: 'تصفح السوق أولًا',
  },
  signUp: {
    title: 'أنشئ حسابك',
    step: 'الخطوة {n} من 3',
    tagLabel: 'اختر وسمك على كاروان',
    tagHint: 'يجدك الناس ويرسلون إليك الصفقات عبر هذا الوسم.',
    tagChecking: 'جارٍ التحقق',
    tagAvailable: '@{tag} متاح',
    tagTaken: '@{tag} مستخدم',
    tagTooShort: 'استخدم 3 أحرف على الأقل.',
    tagTooLong: 'استخدم 20 حرفًا على الأكثر.',
    tagInvalid: 'أحرف وأرقام وشرطة سفلية واحدة. ابدأ بحرف.',
    tagReserved: 'هذا الوسم محجوز.',
    next: 'متابعة',
    methodTitle: 'سجّل الدخول باستخدام',
    emailLabel: 'البريد الإلكتروني',
    sendCode: 'إرسال الرمز',
    sending: 'جارٍ إرسال الرمز',
    codeTitle: 'تحقق من بريدك',
    codeSent: 'أدخل الرمز المكون من 6 أرقام الذي أرسلناه إلى {email}.',
    codeLabel: 'الرمز',
    verify: 'تأكيد البريد',
    verifying: 'جارٍ التأكيد',
    resend: 'إرسال رمز جديد',
    passkeyTitle: 'أنشئ مفتاح المرور',
    passkeyBody: 'مفتاح المرور يسجل دخولك ويتحكم في محفظتك. يبقى على هذا الجهاز.',
    passkeyCreate: 'إنشاء مفتاح المرور',
    passkeyWaiting: 'بانتظار مفتاح المرور',
    wallet: 'ربط محفظة',
    walletSigning: 'تحقق من محفظتك',
    kindTitle: 'لمن هذا الحساب؟',
    person: 'شخصي',
    personBody: 'اشترِ وبِع باسمك.',
    business: 'تجاري',
    businessBody: 'تاجر كشركة.',
    comingSoon: 'قريبًا',
    termsPrefix: 'أوافق على',
    termsLink: 'شروط استخدام كاروان',
    create: 'إنشاء الحساب',
    creating: 'جارٍ إنشاء حسابك',
    haveAccount: 'لديك حساب بالفعل؟',
    signIn: 'تسجيل الدخول',
    back: 'رجوع',
  },
  tagPrompt: {
    title: 'اختر وسمك على كاروان',
    body: 'يجدك الناس ويرسلون إليك الصفقات عبر وسمك. تختاره مرة واحدة.',
    save: 'حفظ الوسم',
    saving: 'جارٍ الحفظ',
  },
  waitlist: {
    title: "انضم إلى قائمة انتظار كاروان",
    body: "كاروان متاح الآن على الشبكة الرئيسية لـ Arc. نفتح الدخول لعدد قليل من الأشخاص في كل مرة.",
    emailLabel: "البريد الإلكتروني",
    join: "انضم إلى قائمة الانتظار",
    sending: "جارٍ إرسال الرمز",
    codeTitle: "تحقق من بريدك",
    codeSent: "أدخل الرمز المكون من 6 أرقام الذي أرسلناه إلى {email}.",
    codeLabel: "الرمز",
    verify: "تأكيد",
    verifying: "جارٍ التأكيد",
    resend: "إرسال رمز جديد",
    doneTitle: "تهانينا، أنت الآن في قائمة الانتظار",
    doneBody: "سنراسل {email} عندما يُفتح كاروان لك.",
    position: "ترتيبك {n} في القائمة.",
    invitedBody: "بريدك مدعو بالفعل. يمكنك إنشاء حسابك الآن.",
    createAccount: "أنشئ حسابك",
    invitedPrompt: "لديك دعوة بالفعل؟",
    signIn: "تسجيل الدخول",
    back: "العودة إلى قائمة الانتظار",
    wrongCode: "الرمز غير صحيح. تحقق منه وحاول مرة أخرى.",
    expired: "انتهت صلاحية الرمز. أرسل رمزًا جديدًا.",
    sendFailed: "تعذر إرسال الرمز. حاول مرة أخرى.",
  },
  errors: {
    generic: 'حدث خطأ. حاول مرة أخرى.',
    notInvited: "هذا البريد غير مدعو بعد. انضم إلى قائمة الانتظار بدلًا من ذلك.",
    lookupFailed: 'تعذر التحقق من هذا البريد. حاول مرة أخرى.',
    codeSendFailed: 'تعذر إرسال الرمز. حاول مرة أخرى.',
    codeRejected: 'الرمز غير صحيح. تحقق منه وحاول مرة أخرى.',
    passkeyCancelled: 'تم إلغاء مفتاح المرور. حاول مرة أخرى عندما تكون جاهزًا.',
    passkeyFailed: 'تعذر الوصول إلى مفتاح المرور. حاول مرة أخرى.',
    walletCancelled: 'تم إلغاء التوقيع. حاول مرة أخرى عندما تكون جاهزًا.',
    emailInUse: 'هذا البريد مرتبط بحساب بالفعل. سجّل الدخول بدلًا من ذلك.',
    emailExpired: 'انتهت صلاحية الرمز. أرسل رمزًا جديدًا.',
    tagTaken: 'تم أخذ هذا الوسم للتو. اختر وسمًا آخر.',
    accountExists: 'لديك حساب بالفعل. سننقلك إليه.',
    businessUnavailable: 'الحسابات التجارية قادمة قريبًا.',
    termsFailed: 'تعذر تسجيل موافقتك. حاول مرة أخرى.',
  },
};

const fr: SignupCopy = {
  welcome: {
    tagline: "Échangez avec n'importe qui en ligne. Les USDC restent en séquestre jusqu'à la fin du travail.",
    backdropLabel: 'Exemples de transactions conclues sur Karwan',
  },
  backdrop: {
    states: { agreed: 'Accord conclu', locked: 'USDC bloqués', delivered: 'Livré', paid: 'Payé' },
    deals: [
      'Création de logo, 3 révisions',
      'iPhone 14 d’occasion, expédié',
      'Transfert de nom de domaine',
      'Appel de conseil d’une heure',
      '200 T-shirts imprimés',
      'Traduction anglais vers arabe',
    ],
  },
  signIn: {
    title: 'Se connecter à Karwan',
    emailLabel: 'E-mail',
    continue: 'Continuer',
    checking: 'Vérification',
    or: 'ou',
    wallet: 'Connecter un portefeuille',
    walletContinue: 'Continuer avec votre portefeuille',
    walletSigning: 'Vérifiez votre portefeuille',
    passkeyTitle: 'Utilisez votre clé d’accès',
    passkeyButton: 'Se connecter avec une clé d’accès',
    passkeyWaiting: 'En attente de votre clé d’accès',
    codeTitle: 'Consultez vos e-mails',
    codeSent: 'Nous avons envoyé un code à 6 chiffres à {email}.',
    codeLabel: 'Code',
    verify: 'Se connecter',
    verifying: 'Connexion',
    resend: 'Envoyer un nouveau code',
    notFound: 'Aucun compte n’utilise encore cet e-mail.',
    createInstead: 'Créer un compte',
    noAccount: 'Pas encore de compte ?',
    signUp: 'S’inscrire',
    browsePrompt: 'Vous jetez juste un œil ?',
    browse: 'Parcourir le marché d’abord',
  },
  signUp: {
    title: 'Créez votre compte',
    step: 'Étape {n} sur 3',
    tagLabel: 'Choisissez votre tag Karwan',
    tagHint: 'Les gens vous trouvent et vous envoient des transactions avec ce tag.',
    tagChecking: 'Vérification',
    tagAvailable: '@{tag} est disponible',
    tagTaken: '@{tag} est déjà pris',
    tagTooShort: 'Utilisez au moins 3 caractères.',
    tagTooLong: 'Utilisez au plus 20 caractères.',
    tagInvalid: 'Lettres, chiffres et tirets bas simples. Commencez par une lettre.',
    tagReserved: 'Ce tag est réservé.',
    next: 'Continuer',
    methodTitle: 'Se connecter avec',
    emailLabel: 'E-mail',
    sendCode: 'Envoyer le code',
    sending: 'Envoi du code',
    codeTitle: 'Consultez vos e-mails',
    codeSent: 'Saisissez le code à 6 chiffres envoyé à {email}.',
    codeLabel: 'Code',
    verify: 'Vérifier l’e-mail',
    verifying: 'Vérification',
    resend: 'Envoyer un nouveau code',
    passkeyTitle: 'Créez votre clé d’accès',
    passkeyBody: 'Votre clé d’accès vous connecte et contrôle votre portefeuille. Elle reste sur cet appareil.',
    passkeyCreate: 'Créer la clé d’accès',
    passkeyWaiting: 'En attente de votre clé d’accès',
    wallet: 'Connecter un portefeuille',
    walletSigning: 'Vérifiez votre portefeuille',
    kindTitle: 'Pour qui est ce compte ?',
    person: 'Personnel',
    personBody: 'Achetez et vendez en votre nom.',
    business: 'Entreprise',
    businessBody: 'Échangez en tant que société.',
    comingSoon: 'Bientôt',
    termsPrefix: 'J’accepte les',
    termsLink: 'Conditions d’utilisation de Karwan',
    create: 'Créer le compte',
    creating: 'Création de votre compte',
    haveAccount: 'Vous avez déjà un compte ?',
    signIn: 'Se connecter',
    back: 'Retour',
  },
  tagPrompt: {
    title: 'Choisissez votre tag Karwan',
    body: 'Les gens vous trouvent et vous envoient des transactions avec votre tag. Vous le choisissez une fois.',
    save: 'Enregistrer le tag',
    saving: 'Enregistrement',
  },
  waitlist: {
    title: "Rejoignez la liste d’attente Karwan",
    body: "Karwan est en ligne sur le mainnet d’Arc. Nous ouvrons l’accès à quelques personnes à la fois.",
    emailLabel: "E-mail",
    join: "Rejoindre la liste d’attente",
    sending: "Envoi du code",
    codeTitle: "Consultez vos e-mails",
    codeSent: "Saisissez le code à 6 chiffres envoyé à {email}.",
    codeLabel: "Code",
    verify: "Confirmer",
    verifying: "Confirmation",
    resend: "Envoyer un nouveau code",
    doneTitle: "Félicitations, vous êtes sur la liste d’attente",
    doneBody: "Nous écrirons à {email} quand Karwan vous sera ouvert.",
    position: "Vous êtes numéro {n} sur la liste.",
    invitedBody: "Votre e-mail est déjà invité. Vous pouvez créer votre compte maintenant.",
    createAccount: "Créer votre compte",
    invitedPrompt: "Déjà invité ?",
    signIn: "Se connecter",
    back: "Retour à la liste d’attente",
    wrongCode: "Ce code ne fonctionne pas. Vérifiez-le et réessayez.",
    expired: "Le code a expiré. Demandez-en un nouveau.",
    sendFailed: "Impossible d’envoyer le code. Réessayez.",
  },
  errors: {
    generic: 'Une erreur est survenue. Réessayez.',
    notInvited: "Cet e-mail n’est pas encore invité. Rejoignez plutôt la liste d’attente.",
    lookupFailed: 'Impossible de vérifier cet e-mail. Réessayez.',
    codeSendFailed: 'Impossible d’envoyer le code. Réessayez.',
    codeRejected: 'Ce code ne fonctionne pas. Vérifiez-le et réessayez.',
    passkeyCancelled: 'Clé d’accès annulée. Réessayez quand vous êtes prêt.',
    passkeyFailed: 'Impossible de joindre votre clé d’accès. Réessayez.',
    walletCancelled: 'Signature annulée. Réessayez quand vous êtes prêt.',
    emailInUse: 'Cet e-mail a déjà un compte. Connectez-vous plutôt.',
    emailExpired: 'Le code a expiré. Demandez-en un nouveau.',
    tagTaken: 'Ce tag vient d’être pris. Choisissez-en un autre.',
    accountExists: 'Vous avez déjà un compte. Nous vous y emmenons.',
    businessUnavailable: 'Les comptes entreprise arrivent bientôt.',
    termsFailed: 'Impossible d’enregistrer votre accord. Réessayez.',
  },
};

const hi: SignupCopy = {
  welcome: {
    tagline: 'ऑनलाइन किसी से भी व्यापार करें। काम पूरा होने तक USDC एस्क्रो में रहता है।',
    backdropLabel: 'कारवान पर हुए सौदों के उदाहरण',
  },
  backdrop: {
    states: { agreed: 'सहमति हुई', locked: 'USDC लॉक', delivered: 'डिलीवर हुआ', paid: 'भुगतान हुआ' },
    deals: [
      'लोगो डिज़ाइन, 3 संशोधन',
      'पुराना iPhone 14, शिप किया गया',
      'डोमेन नाम ट्रांसफ़र',
      '1 घंटे की सलाह कॉल',
      '200 प्रिंटेड टी-शर्ट',
      'अंग्रेज़ी से अरबी अनुवाद',
    ],
  },
  signIn: {
    title: 'कारवान में साइन इन करें',
    emailLabel: 'ईमेल',
    continue: 'जारी रखें',
    checking: 'जाँच हो रही है',
    or: 'या',
    wallet: 'वॉलेट जोड़ें',
    walletContinue: 'अपने वॉलेट से जारी रखें',
    walletSigning: 'अपना वॉलेट देखें',
    passkeyTitle: 'अपनी पासकी इस्तेमाल करें',
    passkeyButton: 'पासकी से साइन इन करें',
    passkeyWaiting: 'आपकी पासकी का इंतज़ार',
    codeTitle: 'अपना ईमेल देखें',
    codeSent: 'हमने {email} पर 6 अंकों का कोड भेजा है।',
    codeLabel: 'कोड',
    verify: 'साइन इन करें',
    verifying: 'साइन इन हो रहा है',
    resend: 'नया कोड भेजें',
    notFound: 'इस ईमेल से अभी कोई खाता नहीं है।',
    createInstead: 'खाता बनाएँ',
    noAccount: 'खाता नहीं है?',
    signUp: 'साइन अप करें',
    browsePrompt: 'बस देख रहे हैं?',
    browse: 'पहले बाज़ार देखें',
  },
  signUp: {
    title: 'अपना खाता बनाएँ',
    step: 'चरण {n} / 3',
    tagLabel: 'अपना कारवान टैग चुनें',
    tagHint: 'लोग इसी टैग से आपको ढूँढते हैं और सौदे भेजते हैं।',
    tagChecking: 'जाँच हो रही है',
    tagAvailable: '@{tag} उपलब्ध है',
    tagTaken: '@{tag} पहले से लिया गया है',
    tagTooShort: 'कम से कम 3 अक्षर रखें।',
    tagTooLong: 'ज़्यादा से ज़्यादा 20 अक्षर रखें।',
    tagInvalid: 'अक्षर, अंक और एकल अंडरस्कोर। अक्षर से शुरू करें।',
    tagReserved: 'यह टैग आरक्षित है।',
    next: 'जारी रखें',
    methodTitle: 'इससे साइन इन करें',
    emailLabel: 'ईमेल',
    sendCode: 'कोड भेजें',
    sending: 'कोड भेजा जा रहा है',
    codeTitle: 'अपना ईमेल देखें',
    codeSent: '{email} पर भेजा गया 6 अंकों का कोड डालें।',
    codeLabel: 'कोड',
    verify: 'ईमेल सत्यापित करें',
    verifying: 'सत्यापन हो रहा है',
    resend: 'नया कोड भेजें',
    passkeyTitle: 'अपनी पासकी बनाएँ',
    passkeyBody: 'आपकी पासकी साइन इन करती है और आपके वॉलेट को नियंत्रित करती है। यह इसी डिवाइस पर रहती है।',
    passkeyCreate: 'पासकी बनाएँ',
    passkeyWaiting: 'आपकी पासकी का इंतज़ार',
    wallet: 'वॉलेट जोड़ें',
    walletSigning: 'अपना वॉलेट देखें',
    kindTitle: 'यह खाता किसके लिए है?',
    person: 'व्यक्तिगत',
    personBody: 'अपने नाम से खरीदें और बेचें।',
    business: 'व्यवसाय',
    businessBody: 'कंपनी के रूप में व्यापार करें।',
    comingSoon: 'जल्द आ रहा है',
    termsPrefix: 'मैं सहमत हूँ',
    termsLink: 'कारवान उपयोग की शर्तें',
    create: 'खाता बनाएँ',
    creating: 'आपका खाता बन रहा है',
    haveAccount: 'पहले से खाता है?',
    signIn: 'साइन इन करें',
    back: 'वापस',
  },
  tagPrompt: {
    title: 'अपना कारवान टैग चुनें',
    body: 'लोग आपके टैग से आपको ढूँढते हैं और सौदे भेजते हैं। इसे एक बार चुनें।',
    save: 'टैग सहेजें',
    saving: 'सहेजा जा रहा है',
  },
  waitlist: {
    title: "कारवान प्रतीक्षा सूची से जुड़ें",
    body: "कारवान Arc मेननेट पर लाइव है। हम कुछ लोगों को एक बार में प्रवेश दे रहे हैं।",
    emailLabel: "ईमेल",
    join: "प्रतीक्षा सूची से जुड़ें",
    sending: "कोड भेजा जा रहा है",
    codeTitle: "अपना ईमेल देखें",
    codeSent: "{email} पर भेजा गया 6 अंकों का कोड डालें।",
    codeLabel: "कोड",
    verify: "पुष्टि करें",
    verifying: "पुष्टि हो रही है",
    resend: "नया कोड भेजें",
    doneTitle: "बधाई हो, आप प्रतीक्षा सूची में हैं",
    doneBody: "कारवान आपके लिए खुलने पर हम {email} पर ईमेल करेंगे।",
    position: "सूची में आपका नंबर {n} है।",
    invitedBody: "आपका ईमेल पहले से आमंत्रित है। आप अभी अपना खाता बना सकते हैं।",
    createAccount: "अपना खाता बनाएँ",
    invitedPrompt: "पहले से आमंत्रित हैं?",
    signIn: "साइन इन करें",
    back: "प्रतीक्षा सूची पर वापस",
    wrongCode: "यह कोड काम नहीं किया। जाँचकर फिर कोशिश करें।",
    expired: "कोड की समय सीमा खत्म हो गई। नया कोड भेजें।",
    sendFailed: "कोड नहीं भेजा जा सका। फिर से कोशिश करें।",
  },
  errors: {
    generic: 'कुछ गलत हुआ। फिर से कोशिश करें।',
    notInvited: "यह ईमेल अभी आमंत्रित नहीं है। प्रतीक्षा सूची से जुड़ें।",
    lookupFailed: 'हम यह ईमेल जाँच नहीं सके। फिर से कोशिश करें।',
    codeSendFailed: 'कोड नहीं भेजा जा सका। फिर से कोशिश करें।',
    codeRejected: 'यह कोड काम नहीं किया। जाँचकर फिर कोशिश करें।',
    passkeyCancelled: 'पासकी रद्द हुई। तैयार होने पर फिर कोशिश करें।',
    passkeyFailed: 'आपकी पासकी तक नहीं पहुँच सके। फिर से कोशिश करें।',
    walletCancelled: 'हस्ताक्षर रद्द हुआ। तैयार होने पर फिर कोशिश करें।',
    emailInUse: 'इस ईमेल से पहले से खाता है। साइन इन करें।',
    emailExpired: 'कोड की समय सीमा खत्म हो गई। नया कोड भेजें।',
    tagTaken: 'यह टैग अभी लिया गया। कोई दूसरा चुनें।',
    accountExists: 'आपका खाता पहले से है। आपको वहाँ ले जा रहे हैं।',
    businessUnavailable: 'व्यवसाय खाते जल्द आ रहे हैं।',
    termsFailed: 'आपकी सहमति दर्ज नहीं हो सकी। फिर से कोशिश करें।',
  },
};

const sw: SignupCopy = {
  welcome: {
    tagline: 'Fanya biashara na mtu yeyote mtandaoni. USDC hukaa kwenye escrow hadi kazi ikamilike.',
    backdropLabel: 'Mifano ya mikataba iliyofanywa Karwan',
  },
  backdrop: {
    states: { agreed: 'Imekubaliwa', locked: 'USDC imefungwa', delivered: 'Imewasilishwa', paid: 'Imelipwa' },
    deals: [
      'Kubuni nembo, marekebisho 3',
      'iPhone 14 iliyotumika, imesafirishwa',
      'Uhamisho wa jina la kikoa',
      'Simu ya ushauri ya saa 1',
      'Fulana 200 zilizochapishwa',
      'Tafsiri kutoka Kiingereza hadi Kiarabu',
    ],
  },
  signIn: {
    title: 'Ingia Karwan',
    emailLabel: 'Barua pepe',
    continue: 'Endelea',
    checking: 'Inakagua',
    or: 'au',
    wallet: 'Unganisha pochi',
    walletContinue: 'Endelea na pochi yako',
    walletSigning: 'Angalia pochi yako',
    passkeyTitle: 'Tumia passkey yako',
    passkeyButton: 'Ingia kwa passkey',
    passkeyWaiting: 'Inasubiri passkey yako',
    codeTitle: 'Angalia barua pepe yako',
    codeSent: 'Tumetuma msimbo wa tarakimu 6 kwa {email}.',
    codeLabel: 'Msimbo',
    verify: 'Ingia',
    verifying: 'Inaingia',
    resend: 'Tuma msimbo mpya',
    notFound: 'Hakuna akaunti inayotumia barua pepe hii bado.',
    createInstead: 'Fungua akaunti',
    noAccount: 'Huna akaunti?',
    signUp: 'Jisajili',
    browsePrompt: 'Unaangalia tu?',
    browse: 'Tazama soko kwanza',
  },
  signUp: {
    title: 'Fungua akaunti yako',
    step: 'Hatua {n} kati ya 3',
    tagLabel: 'Chagua tagi yako ya Karwan',
    tagHint: 'Watu hukupata na kukutumia mikataba kwa tagi hii.',
    tagChecking: 'Inakagua',
    tagAvailable: '@{tag} inapatikana',
    tagTaken: '@{tag} imeshachukuliwa',
    tagTooShort: 'Tumia angalau herufi 3.',
    tagTooLong: 'Tumia herufi zisizozidi 20.',
    tagInvalid: 'Herufi, namba na mstari mmoja wa chini. Anza na herufi.',
    tagReserved: 'Tagi hii imehifadhiwa.',
    next: 'Endelea',
    methodTitle: 'Ingia kwa',
    emailLabel: 'Barua pepe',
    sendCode: 'Tuma msimbo',
    sending: 'Inatuma msimbo',
    codeTitle: 'Angalia barua pepe yako',
    codeSent: 'Weka msimbo wa tarakimu 6 tuliotuma kwa {email}.',
    codeLabel: 'Msimbo',
    verify: 'Thibitisha barua pepe',
    verifying: 'Inathibitisha',
    resend: 'Tuma msimbo mpya',
    passkeyTitle: 'Tengeneza passkey yako',
    passkeyBody: 'Passkey yako hukuingiza na kudhibiti pochi yako. Hubaki kwenye kifaa hiki.',
    passkeyCreate: 'Tengeneza passkey',
    passkeyWaiting: 'Inasubiri passkey yako',
    wallet: 'Unganisha pochi',
    walletSigning: 'Angalia pochi yako',
    kindTitle: 'Akaunti hii ni ya nani?',
    person: 'Binafsi',
    personBody: 'Nunua na uuze kwa jina lako.',
    business: 'Biashara',
    businessBody: 'Fanya biashara kama kampuni.',
    comingSoon: 'Inakuja hivi karibuni',
    termsPrefix: 'Nakubali',
    termsLink: 'Masharti ya Matumizi ya Karwan',
    create: 'Fungua akaunti',
    creating: 'Inafungua akaunti yako',
    haveAccount: 'Tayari una akaunti?',
    signIn: 'Ingia',
    back: 'Rudi',
  },
  tagPrompt: {
    title: 'Chagua tagi yako ya Karwan',
    body: 'Watu hukupata na kukutumia mikataba kwa tagi yako. Unaichagua mara moja.',
    save: 'Hifadhi tagi',
    saving: 'Inahifadhi',
  },
  waitlist: {
    title: "Jiunge na orodha ya kusubiri ya Karwan",
    body: "Karwan iko hewani kwenye mainnet ya Arc. Tunawaruhusu watu wachache kwa wakati mmoja.",
    emailLabel: "Barua pepe",
    join: "Jiunge na orodha ya kusubiri",
    sending: "Inatuma msimbo",
    codeTitle: "Angalia barua pepe yako",
    codeSent: "Weka msimbo wa tarakimu 6 tuliotuma kwa {email}.",
    codeLabel: "Msimbo",
    verify: "Thibitisha",
    verifying: "Inathibitisha",
    resend: "Tuma msimbo mpya",
    doneTitle: "Hongera, uko kwenye orodha ya kusubiri",
    doneBody: "Tutaandikia {email} Karwan itakapofunguliwa kwako.",
    position: "Wewe ni nambari {n} kwenye orodha.",
    invitedBody: "Barua pepe yako tayari imealikwa. Unaweza kufungua akaunti yako sasa.",
    createAccount: "Fungua akaunti yako",
    invitedPrompt: "Tayari umealikwa?",
    signIn: "Ingia",
    back: "Rudi kwenye orodha ya kusubiri",
    wrongCode: "Msimbo huo haukufanya kazi. Ukague ujaribu tena.",
    expired: "Msimbo umeisha muda. Tuma mpya.",
    sendFailed: "Hatukuweza kutuma msimbo. Jaribu tena.",
  },
  errors: {
    generic: 'Kuna tatizo. Jaribu tena.',
    notInvited: "Barua pepe hii bado haijaalikwa. Jiunge na orodha ya kusubiri badala yake.",
    lookupFailed: 'Hatukuweza kukagua barua pepe hiyo. Jaribu tena.',
    codeSendFailed: 'Hatukuweza kutuma msimbo. Jaribu tena.',
    codeRejected: 'Msimbo huo haukufanya kazi. Ukague ujaribu tena.',
    passkeyCancelled: 'Passkey imeghairiwa. Jaribu tena ukiwa tayari.',
    passkeyFailed: 'Hatukuweza kufikia passkey yako. Jaribu tena.',
    walletCancelled: 'Sahihi imeghairiwa. Jaribu tena ukiwa tayari.',
    emailInUse: 'Barua pepe hii tayari ina akaunti. Ingia badala yake.',
    emailExpired: 'Msimbo umeisha muda. Tuma mpya.',
    tagTaken: 'Tagi hiyo imechukuliwa sasa hivi. Chagua nyingine.',
    accountExists: 'Tayari una akaunti. Tunakupeleka huko.',
    businessUnavailable: 'Akaunti za biashara zinakuja hivi karibuni.',
    termsFailed: 'Hatukuweza kurekodi ukubali wako. Jaribu tena.',
  },
};

export const signupCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', SignupCopy> = { en, ar, fr, hi, sw };
