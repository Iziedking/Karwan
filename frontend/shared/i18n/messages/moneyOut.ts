/// Money leaving an account Karwan signs for: the guard's answers on every
/// payment screen, and the saved addresses on the money page.
export interface MoneyOutCopy {
  noSession: string;
  linkWorldId: string;
  paused: string;
  resume: string;
  returnCheck: string;
  confirmItsYou: string;
  notSaved: string;
  addAddress: string;
  added: string;
  opensLater: string;
  limit: string;
  ownWalletOnly: string;
  cleared: string;
  opening: string;
  worldError: string;
  worldMismatch: string;
  worldUnavailable: string;
  title: string;
  lead: string;
  empty: string;
  onChain: string;
  opensAt: string;
  ready: string;
  remove: string;
  limitLeft: string;
  pause: string;
  pausedLine: string;
  actionFailed: string;
}

const en: MoneyOutCopy = {
  noSession: 'Link your World ID before money can leave your account.',
  linkWorldId: 'Link your World ID',
  paused: 'Every payment out of your account is paused.',
  resume: 'Resume with World ID',
  returnCheck: 'Welcome back. Confirm it is still you before money moves.',
  confirmItsYou: 'Confirm with World ID',
  notSaved: 'This address is new to your account. Add it with your World ID and it can receive money 24 hours later.',
  addAddress: 'Add this address',
  added: 'Added. It can receive money from {time}.',
  opensLater: 'This address can receive money from {time}.',
  limit: 'Up to {limit} USDC can leave your account in 24 hours. {left} USDC can leave now, and more from {time}.',
  ownWalletOnly: 'Your Karwan wallets pay out to your own wallet. Send from there to anyone else.',
  cleared: 'Done. You can try the payment again.',
  opening: 'Opening World ID',
  worldError: 'That did not work. Try again.',
  worldMismatch: 'Use the World ID linked to this account.',
  worldUnavailable: 'World ID is not available right now. Try again shortly.',
  title: 'Where your money can go',
  lead: 'Money leaves your account only to these addresses.',
  empty: 'None yet. You add an address the first time you send to it.',
  onChain: '{address} on {chain}',
  opensAt: 'Receives money from {time}',
  ready: 'Ready',
  remove: 'Remove',
  limitLeft: '{left} of {limit} USDC can leave in the next 24 hours.',
  pause: 'Pause payments out',
  pausedLine: 'Payments out are paused.',
  actionFailed: 'That did not work. Try again.',
};

const ar: MoneyOutCopy = {
  noSession: 'اربط World ID الخاص بك قبل أن يخرج أي مال من حسابك.',
  linkWorldId: 'اربط World ID',
  paused: 'كل المدفوعات الخارجة من حسابك متوقفة.',
  resume: 'استأنف عبر World ID',
  returnCheck: 'مرحبًا بعودتك. أكّد أنك أنت قبل أن يتحرك المال.',
  confirmItsYou: 'أكّد عبر World ID',
  notSaved: 'هذا العنوان جديد على حسابك. أضفه عبر World ID ويمكنه استلام المال بعد 24 ساعة.',
  addAddress: 'أضف هذا العنوان',
  added: 'تمت الإضافة. يمكنه استلام المال من {time}.',
  opensLater: 'يمكن لهذا العنوان استلام المال من {time}.',
  limit: 'يمكن أن يخرج من حسابك حتى {limit} USDC خلال 24 ساعة. يمكن أن يخرج {left} USDC الآن، والمزيد من {time}.',
  ownWalletOnly: 'محافظ Karwan الخاصة بك تدفع إلى محفظتك أنت فقط. أرسل من هناك إلى أي شخص آخر.',
  cleared: 'تم. يمكنك تجربة الدفع مرة أخرى.',
  opening: 'جارٍ فتح World ID',
  worldError: 'لم ينجح ذلك. حاول مرة أخرى.',
  worldMismatch: 'استخدم World ID المرتبط بهذا الحساب.',
  worldUnavailable: 'World ID غير متاح الآن. حاول بعد قليل.',
  title: 'إلى أين يمكن أن يذهب مالك',
  lead: 'لا يخرج المال من حسابك إلا إلى هذه العناوين.',
  empty: 'لا شيء بعد. تضيف العنوان أول مرة ترسل إليه.',
  onChain: '{address} على {chain}',
  opensAt: 'يستلم المال من {time}',
  ready: 'جاهز',
  remove: 'إزالة',
  limitLeft: 'يمكن أن يخرج {left} من {limit} USDC خلال الـ 24 ساعة القادمة.',
  pause: 'أوقف المدفوعات الخارجة',
  pausedLine: 'المدفوعات الخارجة متوقفة.',
  actionFailed: 'لم ينجح ذلك. حاول مرة أخرى.',
};

const fr: MoneyOutCopy = {
  noSession: 'Liez votre World ID avant que de l’argent puisse quitter votre compte.',
  linkWorldId: 'Lier votre World ID',
  paused: 'Tous les paiements sortants de votre compte sont en pause.',
  resume: 'Reprendre avec World ID',
  returnCheck: 'Bon retour. Confirmez que c’est bien vous avant que l’argent ne bouge.',
  confirmItsYou: 'Confirmer avec World ID',
  notSaved: 'Cette adresse est nouvelle pour votre compte. Ajoutez-la avec votre World ID et elle pourra recevoir de l’argent 24 heures plus tard.',
  addAddress: 'Ajouter cette adresse',
  added: 'Ajoutée. Elle peut recevoir de l’argent à partir du {time}.',
  opensLater: 'Cette adresse peut recevoir de l’argent à partir du {time}.',
  limit: 'Jusqu’à {limit} USDC peuvent quitter votre compte en 24 heures. {left} USDC peuvent partir maintenant, et davantage à partir du {time}.',
  ownWalletOnly: 'Vos portefeuilles Karwan paient uniquement vers votre propre portefeuille. Envoyez depuis celui-ci à qui vous voulez.',
  cleared: 'C’est fait. Vous pouvez relancer le paiement.',
  opening: 'Ouverture de World ID',
  worldError: 'Cela n’a pas fonctionné. Réessayez.',
  worldMismatch: 'Utilisez le World ID lié à ce compte.',
  worldUnavailable: 'World ID n’est pas disponible pour le moment. Réessayez dans un instant.',
  title: 'Où votre argent peut aller',
  lead: 'L’argent ne quitte votre compte que vers ces adresses.',
  empty: 'Aucune pour l’instant. Vous ajoutez une adresse la première fois que vous y envoyez.',
  onChain: '{address} sur {chain}',
  opensAt: 'Reçoit de l’argent à partir du {time}',
  ready: 'Prête',
  remove: 'Retirer',
  limitLeft: '{left} sur {limit} USDC peuvent partir dans les prochaines 24 heures.',
  pause: 'Mettre les paiements sortants en pause',
  pausedLine: 'Les paiements sortants sont en pause.',
  actionFailed: 'Cela n’a pas fonctionné. Réessayez.',
};

const hi: MoneyOutCopy = {
  noSession: 'आपके खाते से पैसा निकलने से पहले अपना World ID जोड़ें।',
  linkWorldId: 'अपना World ID जोड़ें',
  paused: 'आपके खाते से बाहर जाने वाले सभी भुगतान रुके हुए हैं।',
  resume: 'World ID से फिर शुरू करें',
  returnCheck: 'वापसी पर स्वागत है। पैसा चलने से पहले पुष्टि करें कि यह आप ही हैं।',
  confirmItsYou: 'World ID से पुष्टि करें',
  notSaved: 'यह पता आपके खाते के लिए नया है। इसे अपने World ID से जोड़ें और 24 घंटे बाद इसे पैसा मिल सकता है।',
  addAddress: 'यह पता जोड़ें',
  added: 'जोड़ दिया गया। इसे {time} से पैसा मिल सकता है।',
  opensLater: 'इस पते को {time} से पैसा मिल सकता है।',
  limit: '24 घंटे में आपके खाते से {limit} USDC तक निकल सकते हैं। अभी {left} USDC निकल सकते हैं, और ज़्यादा {time} से।',
  ownWalletOnly: 'आपके Karwan वॉलेट केवल आपके अपने वॉलेट में भुगतान करते हैं। किसी और को वहीं से भेजें।',
  cleared: 'हो गया। आप भुगतान फिर से आज़मा सकते हैं।',
  opening: 'World ID खुल रहा है',
  worldError: 'यह काम नहीं किया। फिर से कोशिश करें।',
  worldMismatch: 'इस खाते से जुड़ा World ID इस्तेमाल करें।',
  worldUnavailable: 'World ID अभी उपलब्ध नहीं है। थोड़ी देर में फिर कोशिश करें।',
  title: 'आपका पैसा कहाँ जा सकता है',
  lead: 'आपके खाते से पैसा केवल इन पतों पर जाता है।',
  empty: 'अभी कोई नहीं। किसी पते पर पहली बार भेजते समय आप उसे जोड़ते हैं।',
  onChain: '{chain} पर {address}',
  opensAt: '{time} से पैसा मिलता है',
  ready: 'तैयार',
  remove: 'हटाएँ',
  limitLeft: 'अगले 24 घंटों में {limit} में से {left} USDC निकल सकते हैं।',
  pause: 'बाहर जाने वाले भुगतान रोकें',
  pausedLine: 'बाहर जाने वाले भुगतान रुके हुए हैं।',
  actionFailed: 'यह काम नहीं किया। फिर से कोशिश करें।',
};

const sw: MoneyOutCopy = {
  noSession: 'Unganisha World ID yako kabla pesa haijatoka kwenye akaunti yako.',
  linkWorldId: 'Unganisha World ID yako',
  paused: 'Malipo yote yanayotoka kwenye akaunti yako yamesimamishwa.',
  resume: 'Endelea kwa World ID',
  returnCheck: 'Karibu tena. Thibitisha kuwa ni wewe kabla pesa haijasonga.',
  confirmItsYou: 'Thibitisha kwa World ID',
  notSaved: 'Anwani hii ni mpya kwa akaunti yako. Iongeze kwa World ID yako na itaweza kupokea pesa baada ya saa 24.',
  addAddress: 'Ongeza anwani hii',
  added: 'Imeongezwa. Inaweza kupokea pesa kuanzia {time}.',
  opensLater: 'Anwani hii inaweza kupokea pesa kuanzia {time}.',
  limit: 'Hadi USDC {limit} zinaweza kutoka kwenye akaunti yako ndani ya saa 24. USDC {left} zinaweza kutoka sasa, na zaidi kuanzia {time}.',
  ownWalletOnly: 'Pochi zako za Karwan hulipa kwenye pochi yako mwenyewe tu. Tuma kutoka hapo kwa mtu mwingine yeyote.',
  cleared: 'Imekamilika. Unaweza kujaribu malipo tena.',
  opening: 'Inafungua World ID',
  worldError: 'Haikufanya kazi. Jaribu tena.',
  worldMismatch: 'Tumia World ID iliyounganishwa na akaunti hii.',
  worldUnavailable: 'World ID haipatikani kwa sasa. Jaribu tena baada ya muda mfupi.',
  title: 'Pesa zako zinaweza kwenda wapi',
  lead: 'Pesa hutoka kwenye akaunti yako kwenda kwenye anwani hizi tu.',
  empty: 'Hakuna bado. Unaongeza anwani mara ya kwanza unapotuma kwake.',
  onChain: '{address} kwenye {chain}',
  opensAt: 'Inapokea pesa kuanzia {time}',
  ready: 'Tayari',
  remove: 'Ondoa',
  limitLeft: 'USDC {left} kati ya {limit} zinaweza kutoka ndani ya saa 24 zijazo.',
  pause: 'Simamisha malipo yanayotoka',
  pausedLine: 'Malipo yanayotoka yamesimamishwa.',
  actionFailed: 'Haikufanya kazi. Jaribu tena.',
};

export const moneyOutCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', MoneyOutCopy> = { en, ar, fr, hi, sw };
