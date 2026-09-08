import type { Locale } from '@/shared/i18n/locales';
import type { TourStep } from './GuideProvider';

// Pure route policy, also exercised by the route-coverage tests. Guidance does
// not grant access or perform actions; the real forms retain every review gate.
export type GuidanceKind = 'profile' | 'balance' | 'business' | 'trade' | 'settings' | 'funds';
export function guidanceKind(path: string): GuidanceKind | null {
  if (path === '/settings') return 'settings';
  if (path === '/account' || path === '/profile/wallets') return 'balance';
  if (path === '/profile/agent-funds' || path === '/cashout' || path.startsWith('/cashout/')) return 'funds';
  if (path === '/business/verification' || path === '/profile/business' || path === '/profile/business/setup') return 'business';
  if (path === '/p2p' || path === '/b2b') return 'trade';
  if (path === '/profile' || path.startsWith('/profile/')) return 'profile';
  return null;
}

type Copy = {
  launch: string; close: string; next: string; back: string; done: string;
  stopTips: string; step: string;
  guides: Record<GuidanceKind, [TourStep, TourStep]>;
};

export const GUIDE_COPY: Record<Locale, Copy> = {
  en: {
    launch: 'Page tour', close: 'Close tour', next: 'Next', back: 'Back', done: 'Done', stopTips: 'Turn off automatic tips', step: 'Step',
    guides: {
      profile: [{ title: 'Your account', body: 'Open personal details, business details or settings from this hub. Contact details is where you manage ways to reach you.' }, { title: 'Money and trade', body: 'Balance, wallets and agent funds have their own pages. Open a deal to review its terms and delivery. Sign out is at the bottom of Profile.' }],
      balance: [{ title: 'Check where the USDC is held', body: 'Review the chain and wallet beside each balance. An available balance is different from money held in a deal.' }, { title: 'Choose what to do', body: 'Add brings USDC in. Move changes the chain. Send pays another wallet. Check the destination, amount and any fees on the review screen before confirming.' }],
      business: [{ title: 'Company details', body: 'Check the business name and public details before saving. Adding company information does not verify the business.' }, { title: 'Business verification', body: 'Review which document is requested and what will be submitted. Verification status changes only after the required checks. This tour does not submit a document.' }],
      trade: [{ title: 'Choose how to trade', body: 'Bring a deal with someone you already know, or post a request or offer to find a match. Check who will supply the work or goods and who will pay.' }, { title: 'Agree before funding', body: 'Review the scope, amount, deadlines and delivery evidence with the other party. Funding and payment release have their own confirmation steps.' }],
      settings: [{ title: 'Your preferences', body: 'Change language, theme, sound and notifications here. Turning off automatic tips does not remove the Page tour button.' }, { title: 'Account changes', body: 'Read the confirmation before changing privacy or deleting an account. Deleting profile data does not reverse completed payments.' }],
      funds: [{ title: 'Check the source', body: 'Confirm which wallet holds the USDC and which agent or wallet will receive it. Available funds and money committed to a deal are not interchangeable.' }, { title: 'Review before confirming', body: 'Check the amount, destination and fees. If a transfer is still pending, check its status before trying again. This tour never moves money.' }],
    },
  },
  fr: {
    launch: 'Guide de la page', close: 'Fermer le guide', next: 'Suivant', back: 'Retour', done: 'Terminer', stopTips: 'Désactiver les conseils automatiques', step: 'Étape',
    guides: {
      profile: [{ title: 'Votre compte', body: 'Accédez aux informations personnelles, à votre entreprise ou aux paramètres. Gérez vos moyens de contact dans Coordonnées.' }, { title: 'Argent et échanges', body: 'Le solde, les portefeuilles et les fonds des agents ont leurs propres pages. Ouvrez un accord pour vérifier les conditions et la livraison. Déconnexion se trouve en bas du profil.' }],
      balance: [{ title: 'Où sont vos USDC ?', body: 'Vérifiez le réseau et le portefeuille de chaque solde. Le solde disponible diffère des fonds réservés à un accord.' }, { title: 'Choisir une action', body: 'Ajouter fait entrer des USDC. Déplacer change de réseau. Envoyer paie un autre portefeuille. Vérifiez la destination, le montant et les frais avant confirmation.' }],
      business: [{ title: 'Informations de l’entreprise', body: 'Vérifiez le nom et les informations publiques avant d’enregistrer. Ajouter ces informations ne vérifie pas l’entreprise.' }, { title: 'Vérification de l’entreprise', body: 'Vérifiez le document demandé et les informations envoyées. Le statut change après les contrôles requis. Ce guide n’envoie aucun document.' }],
      trade: [{ title: 'Choisir comment échanger', body: 'Apportez un accord avec une personne connue ou publiez une demande ou une offre. Vérifiez qui fournit le travail ou les biens et qui paie.' }, { title: 'S’accorder avant de financer', body: 'Vérifiez le périmètre, le montant, les délais et les preuves de livraison avec l’autre partie. Le financement et le paiement ont leurs propres confirmations.' }],
      settings: [{ title: 'Vos préférences', body: 'Modifiez la langue, le thème, le son et les notifications. Désactiver les conseils automatiques ne supprime pas le guide de la page.' }, { title: 'Modifications du compte', body: 'Lisez la confirmation avant de modifier la confidentialité ou de supprimer le compte. Supprimer le profil n’annule pas les paiements effectués.' }],
      funds: [{ title: 'Vérifier la source', body: 'Confirmez quel portefeuille détient les USDC et quel agent ou portefeuille les recevra. Les fonds disponibles et ceux engagés dans un accord sont distincts.' }, { title: 'Vérifier avant confirmation', body: 'Vérifiez le montant, la destination et les frais. Si un transfert est en cours, consultez son statut avant de réessayer. Ce guide ne déplace jamais d’argent.' }],
    },
  },
  ar: {
    launch: 'دليل الصفحة', close: 'إغلاق الدليل', next: 'التالي', back: 'السابق', done: 'تم', stopTips: 'إيقاف النصائح التلقائية', step: 'الخطوة',
    guides: {
      profile: [{ title: 'حسابك', body: 'افتح التفاصيل الشخصية أو تفاصيل الشركة أو الإعدادات من هنا. يمكنك إدارة وسائل التواصل معك في بيانات الاتصال.' }, { title: 'الأموال والتجارة', body: 'للرصيد والمحافظ وأموال الوكلاء صفحات خاصة. افتح الصفقة لمراجعة الشروط والتسليم. تسجيل الخروج في أسفل الملف الشخصي.' }],
      balance: [{ title: 'تحقق من مكان رصيد USDC', body: 'راجع الشبكة والمحفظة بجانب كل رصيد. الرصيد المتاح يختلف عن الأموال المحجوزة لصفقة.' }, { title: 'اختر الإجراء', body: 'الإضافة لإيداع USDC، والنقل لتغيير الشبكة، والإرسال للدفع لمحفظة أخرى. تحقق من الوجهة والمبلغ والرسوم قبل التأكيد.' }],
      business: [{ title: 'بيانات الشركة', body: 'راجع اسم الشركة وبياناتها العامة قبل الحفظ. إضافة بيانات الشركة لا تعني توثيقها.' }, { title: 'توثيق الشركة', body: 'راجع المستند المطلوب وما سيتم إرساله. تتغير حالة التوثيق بعد الفحوص المطلوبة. هذا الدليل لا يرسل أي مستند.' }],
      trade: [{ title: 'اختر طريقة التجارة', body: 'أضف صفقة مع شخص تعرفه أو انشر طلباً أو عرضاً للعثور على طرف مناسب. تحقق ممن يقدم العمل أو البضائع وممن يدفع.' }, { title: 'الاتفاق قبل التمويل', body: 'راجع النطاق والمبلغ والمواعيد وأدلة التسليم مع الطرف الآخر. للتمويل وصرف الدفعات خطوات تأكيد مستقلة.' }],
      settings: [{ title: 'تفضيلاتك', body: 'غيّر اللغة والمظهر والصوت والإشعارات هنا. إيقاف النصائح التلقائية لا يخفي زر دليل الصفحة.' }, { title: 'تغييرات الحساب', body: 'اقرأ التأكيد قبل تغيير الخصوصية أو حذف الحساب. حذف بيانات الملف الشخصي لا يعكس الدفعات المكتملة.' }],
      funds: [{ title: 'تحقق من المصدر', body: 'تأكد من المحفظة التي تحتفظ برصيد USDC ومن الوكيل أو المحفظة المستلمة. الأموال المتاحة تختلف عن الأموال المخصصة لصفقة.' }, { title: 'المراجعة قبل التأكيد', body: 'تحقق من المبلغ والوجهة والرسوم. إذا كان التحويل معلقاً، راجع حالته قبل المحاولة مجدداً. هذا الدليل لا ينقل الأموال.' }],
    },
  },
  hi: {
    launch: 'पेज गाइड', close: 'गाइड बंद करें', next: 'आगे', back: 'पीछे', done: 'पूरा हुआ', stopTips: 'अपने आप आने वाले सुझाव बंद करें', step: 'चरण',
    guides: {
      profile: [{ title: 'आपका खाता', body: 'यहाँ से व्यक्तिगत विवरण, व्यवसाय विवरण या सेटिंग खोलें। संपर्क विवरण में आपसे संपर्क करने के तरीके बदल सकते हैं।' }, { title: 'पैसा और व्यापार', body: 'बैलेंस, वॉलेट और एजेंट फंड के अलग पेज हैं। शर्तें और डिलीवरी देखने के लिए सौदा खोलें। प्रोफ़ाइल के नीचे साइन आउट है।' }],
      balance: [{ title: 'USDC कहाँ है, जाँचें', body: 'हर बैलेंस के पास नेटवर्क और वॉलेट देखें। उपलब्ध बैलेंस और सौदे में रखे पैसे अलग हैं।' }, { title: 'कार्रवाई चुनें', body: 'जोड़ें से USDC आता है। मूव से नेटवर्क बदलता है। भेजें से दूसरे वॉलेट को भुगतान होता है। पुष्टि से पहले गंतव्य, राशि और शुल्क जाँचें।' }],
      business: [{ title: 'व्यवसाय विवरण', body: 'सेव करने से पहले व्यवसाय का नाम और सार्वजनिक विवरण जाँचें। जानकारी जोड़ने से व्यवसाय सत्यापित नहीं होता।' }, { title: 'व्यवसाय सत्यापन', body: 'माँगा गया दस्तावेज़ और भेजी जाने वाली जानकारी जाँचें। आवश्यक जाँच के बाद ही सत्यापन स्थिति बदलती है। यह गाइड कोई दस्तावेज़ जमा नहीं करती।' }],
      trade: [{ title: 'व्यापार का तरीका चुनें', body: 'किसी परिचित के साथ सौदा जोड़ें या अनुरोध या ऑफ़र पोस्ट करें। जाँचें कि काम या सामान कौन देगा और भुगतान कौन करेगा।' }, { title: 'फंडिंग से पहले सहमति', body: 'दूसरे पक्ष के साथ काम, राशि, समय सीमा और डिलीवरी प्रमाण की समीक्षा करें। फंडिंग और भुगतान जारी करने के अलग पुष्टि चरण हैं।' }],
      settings: [{ title: 'आपकी प्राथमिकताएँ', body: 'भाषा, थीम, ध्वनि और सूचनाएँ यहाँ बदलें। अपने आप आने वाले सुझाव बंद करने पर भी पेज गाइड उपलब्ध रहती है।' }, { title: 'खाते में बदलाव', body: 'गोपनीयता बदलने या खाता हटाने से पहले पुष्टि पढ़ें। प्रोफ़ाइल डेटा हटाने से पूरे हो चुके भुगतान वापस नहीं होते।' }],
      funds: [{ title: 'स्रोत जाँचें', body: 'जाँचें कि USDC किस वॉलेट में है और किस एजेंट या वॉलेट को मिलेगा। उपलब्ध पैसा और सौदे के लिए रखा पैसा अलग हैं।' }, { title: 'पुष्टि से पहले समीक्षा', body: 'राशि, गंतव्य और शुल्क जाँचें। ट्रांसफ़र लंबित हो तो दोबारा कोशिश करने से पहले स्थिति देखें। यह गाइड कभी पैसा नहीं भेजती।' }],
    },
  },
  sw: {
    launch: 'Mwongozo wa ukurasa', close: 'Funga mwongozo', next: 'Endelea', back: 'Rudi', done: 'Maliza', stopTips: 'Zima vidokezo vya kiotomatiki', step: 'Hatua',
    guides: {
      profile: [{ title: 'Akaunti yako', body: 'Fungua taarifa binafsi, taarifa za biashara au mipangilio hapa. Simamia njia za kukufikia kwenye taarifa za mawasiliano.' }, { title: 'Fedha na biashara', body: 'Salio, pochi na fedha za mawakala zina kurasa zake. Fungua makubaliano kuona masharti na uwasilishaji. Kitufe cha kuondoka kiko chini ya wasifu.' }],
      balance: [{ title: 'Angalia USDC ilipo', body: 'Kagua mtandao na pochi kando ya kila salio. Salio linalopatikana ni tofauti na fedha zilizowekwa kwa makubaliano.' }, { title: 'Chagua hatua', body: 'Ongeza huingiza USDC. Hamisha hubadili mtandao. Tuma hulipa pochi nyingine. Kagua mpokeaji, kiasi na ada kabla ya kuthibitisha.' }],
      business: [{ title: 'Taarifa za biashara', body: 'Kagua jina na taarifa za umma kabla ya kuhifadhi. Kuongeza taarifa hakuithibitishi biashara.' }, { title: 'Uthibitishaji wa biashara', body: 'Kagua hati inayotakiwa na taarifa zitakazotumwa. Hali hubadilika baada ya ukaguzi unaohitajika. Mwongozo huu hautumi hati.' }],
      trade: [{ title: 'Chagua namna ya kufanya biashara', body: 'Leta makubaliano na mtu unayemjua au chapisha ombi au ofa. Kagua nani atatoa kazi au bidhaa na nani atalipa.' }, { title: 'Kubalianeni kabla ya kuweka fedha', body: 'Kagua kazi, kiasi, tarehe na ushahidi wa uwasilishaji na mhusika mwingine. Kuweka fedha na kutoa malipo kuna hatua zake za uthibitisho.' }],
      settings: [{ title: 'Mapendeleo yako', body: 'Badili lugha, mandhari, sauti na arifa hapa. Kuzima vidokezo vya kiotomatiki hakuondoi mwongozo wa ukurasa.' }, { title: 'Mabadiliko ya akaunti', body: 'Soma uthibitisho kabla ya kubadili faragha au kufuta akaunti. Kufuta taarifa za wasifu hakubatilishi malipo yaliyokamilika.' }],
      funds: [{ title: 'Kagua chanzo', body: 'Hakikisha pochi yenye USDC na wakala au pochi itakayopokea. Fedha zinazopatikana ni tofauti na zilizotengwa kwa makubaliano.' }, { title: 'Kagua kabla ya kuthibitisha', body: 'Kagua kiasi, mpokeaji na ada. Uhamisho ukiwa unasubiri, angalia hali yake kabla ya kujaribu tena. Mwongozo huu hauhamishi fedha.' }],
    },
  },
};

export function routeGuidance(pathname: string, locale: Locale) {
  const kind = guidanceKind(pathname);
  return kind ? { id: `page-${kind}-v1`, steps: GUIDE_COPY[locale].guides[kind] } : null;
}
