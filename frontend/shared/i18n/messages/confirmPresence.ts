/// The sheet a person confirms in, with a passkey or their Karwan PIN, before
/// they set up their record, put up deal insurance or send money out.
export interface ConfirmPresenceCopy {
  title: string;
  moveOut: string;
  insurance: string;
  insuranceLine: string;
  setup: string;
  setupLine: string;
  factor: string;
  fee: string;
  usePasskey: string;
  usePin: string;
  pinLabel: string;
  wrongPin: string;
  locked: string;
  forgot: string;
  setTitle: string;
  setHint: string;
  tooSimple: string;
  emailCode: string;
  sendCode: string;
  addPasskey: string;
  addEmail: string;
  walletSign: string;
  confirm: string;
  cancel: string;
  done: string;
  expired: string;
  failed: string;
}

const en: ConfirmPresenceCopy = {
  title: "Confirm it's you",
  moveOut: 'Send {amount} USDC to {to}',
  insurance: 'Put up {amount} USDC of deal insurance',
  insuranceLine: 'It protects your buyers and lets financiers advance you money on your deals. You can take it back when no deal is using it.',
  setup: 'Set up your Karwan record',
  setupLine: 'Your agents run your deals for you. Your buying agent can pay up to {perPayment} USDC at a time and {total} USDC in total for one year.',
  factor: 'Change how you confirm',
  fee: 'Network fee about {fee} USDC',
  usePasskey: 'Use passkey',
  usePin: 'Use PIN',
  pinLabel: 'Enter your PIN.',
  wrongPin: 'Wrong PIN. {left} tries left.',
  locked: 'PIN locked until {time}.',
  forgot: 'Forgot PIN',
  setTitle: 'Set a Karwan PIN',
  setHint: "6 digits. You'll use it when money leaves Karwan.",
  tooSimple: "Pick a PIN that's harder to guess.",
  emailCode: 'Enter the code we sent to your email.',
  sendCode: 'Send the code',
  addPasskey: 'Use a passkey instead',
  addEmail: 'Add an email in the chat to reset your PIN.',
  walletSign: 'Confirm in your wallet',
  confirm: 'Confirm',
  cancel: 'Cancel',
  done: 'Confirmed',
  expired: 'This took too long. Try again.',
  failed: "That didn't work. Try again.",
};

const ar: ConfirmPresenceCopy = {
  title: 'أكّد أنك أنت',
  moveOut: 'إرسال {amount} USDC إلى {to}',
  insurance: 'وضع {amount} USDC كتأمين للصفقات',
  insuranceLine: 'يحمي المشترين منك ويتيح للممولين تقديم سلفة لك على صفقاتك. يمكنك استرداده حين لا تستخدمه أي صفقة.',
  setup: 'أنشئ سجلك في Karwan',
  setupLine: 'وكلاؤك يديرون صفقاتك نيابة عنك. يمكن لوكيل الشراء أن يدفع حتى {perPayment} USDC في المرة و{total} USDC إجمالًا لمدة سنة.',
  factor: 'غيّر طريقة التأكيد',
  fee: 'رسوم الشبكة نحو {fee} USDC',
  usePasskey: 'استخدم مفتاح المرور',
  usePin: 'استخدم الرمز',
  pinLabel: 'أدخل رمزك.',
  wrongPin: 'رمز غير صحيح. بقيت {left} محاولات.',
  locked: 'الرمز مقفل حتى {time}.',
  forgot: 'نسيت الرمز',
  setTitle: 'عيّن رمز Karwan',
  setHint: '6 أرقام. ستستخدمه حين يخرج المال من Karwan.',
  tooSimple: 'اختر رمزًا يصعب تخمينه.',
  emailCode: 'أدخل الرمز الذي أرسلناه إلى بريدك الإلكتروني.',
  sendCode: 'أرسل الرمز',
  addPasskey: 'استخدم مفتاح مرور بدلًا من ذلك',
  addEmail: 'أضف بريدًا إلكترونيًا في المحادثة لإعادة تعيين رمزك.',
  walletSign: 'أكّد في محفظتك',
  confirm: 'تأكيد',
  cancel: 'إلغاء',
  done: 'تم التأكيد',
  expired: 'استغرق هذا وقتًا طويلًا. حاول مرة أخرى.',
  failed: 'لم ينجح ذلك. حاول مرة أخرى.',
};

const fr: ConfirmPresenceCopy = {
  title: "Confirmez que c'est vous",
  moveOut: 'Envoyer {amount} USDC à {to}',
  insurance: 'Déposer {amount} USDC en assurance de transaction',
  insuranceLine: 'Elle protège vos acheteurs et permet aux financeurs de vous avancer de l’argent sur vos transactions. Vous pouvez la reprendre quand aucune transaction ne l’utilise.',
  setup: 'Créez votre dossier Karwan',
  setupLine: 'Vos agents mènent vos transactions pour vous. Votre agent d’achat peut payer jusqu’à {perPayment} USDC à la fois et {total} USDC au total pendant un an.',
  factor: 'Changer votre façon de confirmer',
  fee: 'Frais de réseau environ {fee} USDC',
  usePasskey: 'Utiliser la clé d’accès',
  usePin: 'Utiliser le code',
  pinLabel: 'Saisissez votre code.',
  wrongPin: 'Code incorrect. Il reste {left} essais.',
  locked: 'Code bloqué jusqu’à {time}.',
  forgot: 'Code oublié',
  setTitle: 'Choisir un code Karwan',
  setHint: '6 chiffres. Vous l’utiliserez quand de l’argent quitte Karwan.',
  tooSimple: 'Choisissez un code plus difficile à deviner.',
  emailCode: 'Saisissez le code envoyé à votre e-mail.',
  sendCode: 'Envoyer le code',
  addPasskey: 'Utiliser plutôt une clé d’accès',
  addEmail: 'Ajoutez un e-mail dans la discussion pour réinitialiser votre code.',
  walletSign: 'Confirmez dans votre portefeuille',
  confirm: 'Confirmer',
  cancel: 'Annuler',
  done: 'Confirmé',
  expired: 'Cela a pris trop de temps. Réessayez.',
  failed: 'Cela n’a pas marché. Réessayez.',
};

const hi: ConfirmPresenceCopy = {
  title: 'पुष्टि करें कि यह आप हैं',
  moveOut: '{to} को {amount} USDC भेजें',
  insurance: '{amount} USDC डील बीमा के रूप में रखें',
  insuranceLine: 'यह आपके खरीदारों की रक्षा करता है और फ़ाइनेंसरों को आपकी डील पर आपको पैसा अग्रिम देने देता है। जब कोई डील इसका उपयोग न कर रही हो, तब आप इसे वापस ले सकते हैं।',
  setup: 'अपना Karwan रिकॉर्ड बनाएँ',
  setupLine: 'आपके एजेंट आपकी डील आपके लिए चलाते हैं। आपका खरीद एजेंट एक बार में {perPayment} USDC तक और एक साल में कुल {total} USDC तक भुगतान कर सकता है।',
  factor: 'पुष्टि का तरीका बदलें',
  fee: 'नेटवर्क शुल्क लगभग {fee} USDC',
  usePasskey: 'पासकी का उपयोग करें',
  usePin: 'PIN का उपयोग करें',
  pinLabel: 'अपना PIN डालें।',
  wrongPin: 'गलत PIN। {left} प्रयास बाकी।',
  locked: 'PIN {time} तक लॉक है।',
  forgot: 'PIN भूल गए',
  setTitle: 'Karwan PIN सेट करें',
  setHint: '6 अंक। जब पैसा Karwan से बाहर जाएगा, तब आप इसका उपयोग करेंगे।',
  tooSimple: 'ऐसा PIN चुनें जिसका अनुमान लगाना कठिन हो।',
  emailCode: 'अपने ईमेल पर भेजा गया कोड डालें।',
  sendCode: 'कोड भेजें',
  addPasskey: 'इसके बजाय पासकी का उपयोग करें',
  addEmail: 'अपना PIN रीसेट करने के लिए चैट में ईमेल जोड़ें।',
  walletSign: 'अपने वॉलेट में पुष्टि करें',
  confirm: 'पुष्टि करें',
  cancel: 'रद्द करें',
  done: 'पुष्टि हो गई',
  expired: 'इसमें बहुत समय लगा। फिर से कोशिश करें।',
  failed: 'यह काम नहीं किया। फिर से कोशिश करें।',
};

const sw: ConfirmPresenceCopy = {
  title: 'Thibitisha kuwa ni wewe',
  moveOut: 'Tuma USDC {amount} kwa {to}',
  insurance: 'Weka USDC {amount} kama bima ya mikataba',
  insuranceLine: 'Inawalinda wanunuzi wako na inawaruhusu wafadhili kukupa pesa mapema kwa mikataba yako. Unaweza kuirudisha wakati hakuna mkataba unaoitumia.',
  setup: 'Fungua rekodi yako ya Karwan',
  setupLine: 'Mawakala wako wanaendesha mikataba yako kwa niaba yako. Wakala wako wa kununua anaweza kulipa hadi USDC {perPayment} kwa mara moja na USDC {total} kwa jumla kwa mwaka mmoja.',
  factor: 'Badilisha jinsi unavyothibitisha',
  fee: 'Ada ya mtandao karibu USDC {fee}',
  usePasskey: 'Tumia passkey',
  usePin: 'Tumia PIN',
  pinLabel: 'Weka PIN yako.',
  wrongPin: 'PIN si sahihi. Majaribio {left} yamebaki.',
  locked: 'PIN imefungwa hadi {time}.',
  forgot: 'Nimesahau PIN',
  setTitle: 'Weka PIN ya Karwan',
  setHint: 'Tarakimu 6. Utaitumia pesa zinapotoka Karwan.',
  tooSimple: 'Chagua PIN iliyo ngumu kukisia.',
  emailCode: 'Weka msimbo tuliotuma kwenye barua pepe yako.',
  sendCode: 'Tuma msimbo',
  addPasskey: 'Tumia passkey badala yake',
  addEmail: 'Ongeza barua pepe kwenye mazungumzo ili kuweka upya PIN yako.',
  walletSign: 'Thibitisha kwenye pochi yako',
  confirm: 'Thibitisha',
  cancel: 'Ghairi',
  done: 'Imethibitishwa',
  expired: 'Hii imechukua muda mrefu. Jaribu tena.',
  failed: 'Haikufanya kazi. Jaribu tena.',
};

export const confirmPresenceCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', ConfirmPresenceCopy> = { en, ar, fr, hi, sw };
