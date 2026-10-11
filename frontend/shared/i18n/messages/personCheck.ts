export interface PersonCheckCopy {
  title: string;
  lead: string;
  start: string;
  preparing: string;
  checking: string;
  done: string;
  back: string;
  inUse: string;
  error: string;
  unavailable: string;
  signIn: string;
}

const en: PersonCheckCopy = {
  title: 'Prove you are one real person',
  lead: 'One check with World ID. Karwan never sees your face or your documents, only that you are one unique person.',
  start: 'Verify with World ID',
  preparing: 'Opening World ID',
  checking: 'Checking your proof',
  done: 'You are verified as one real person.',
  back: 'You can go back to the chat now.',
  inUse: 'This World ID already verifies another Karwan account.',
  error: 'That did not work. Try again.',
  unavailable: 'The person check is not available right now.',
  signIn: 'Open this page from the link the Karwan agent sent you.',
};

const ar: PersonCheckCopy = {
  title: 'أثبت أنك شخص حقيقي واحد',
  lead: 'تحقق واحد عبر World ID. لا ترى Karwan وجهك ولا مستنداتك، بل فقط أنك شخص فريد.',
  start: 'تحقق عبر World ID',
  preparing: 'جارٍ فتح World ID',
  checking: 'جارٍ فحص إثباتك',
  done: 'تم التحقق منك كشخص حقيقي واحد.',
  back: 'يمكنك العودة إلى المحادثة الآن.',
  inUse: 'هذا الـ World ID يثبت حسابًا آخر على Karwan.',
  error: 'لم ينجح ذلك. حاول مرة أخرى.',
  unavailable: 'التحقق من الشخص غير متاح الآن.',
  signIn: 'افتح هذه الصفحة من الرابط الذي أرسله لك وكيل Karwan.',
};

const fr: PersonCheckCopy = {
  title: 'Prouvez que vous êtes une seule vraie personne',
  lead: 'Une vérification avec World ID. Karwan ne voit ni votre visage ni vos documents, seulement que vous êtes une personne unique.',
  start: 'Vérifier avec World ID',
  preparing: 'Ouverture de World ID',
  checking: 'Vérification de votre preuve',
  done: 'Vous êtes vérifié comme une seule vraie personne.',
  back: 'Vous pouvez retourner dans le chat.',
  inUse: 'Ce World ID vérifie déjà un autre compte Karwan.',
  error: 'Cela n’a pas fonctionné. Réessayez.',
  unavailable: 'La vérification de personne n’est pas disponible pour le moment.',
  signIn: 'Ouvrez cette page depuis le lien envoyé par l’agent Karwan.',
};

const hi: PersonCheckCopy = {
  title: 'साबित करें कि आप एक असली व्यक्ति हैं',
  lead: 'World ID से एक जांच। Karwan आपका चेहरा या दस्तावेज़ कभी नहीं देखता, केवल यह कि आप एक अद्वितीय व्यक्ति हैं।',
  start: 'World ID से सत्यापित करें',
  preparing: 'World ID खुल रहा है',
  checking: 'आपका प्रमाण जांचा जा रहा है',
  done: 'आप एक असली व्यक्ति के रूप में सत्यापित हैं।',
  back: 'अब आप चैट पर लौट सकते हैं।',
  inUse: 'यह World ID पहले से दूसरे Karwan खाते को सत्यापित करता है।',
  error: 'यह काम नहीं किया। फिर से कोशिश करें।',
  unavailable: 'व्यक्ति जांच अभी उपलब्ध नहीं है।',
  signIn: 'यह पेज Karwan एजेंट के भेजे लिंक से खोलें।',
};

const sw: PersonCheckCopy = {
  title: 'Thibitisha kuwa wewe ni mtu mmoja halisi',
  lead: 'Ukaguzi mmoja kwa World ID. Karwan haioni uso wako wala nyaraka zako, ila tu kuwa wewe ni mtu wa kipekee.',
  start: 'Thibitisha kwa World ID',
  preparing: 'Inafungua World ID',
  checking: 'Inakagua uthibitisho wako',
  done: 'Umethibitishwa kuwa mtu mmoja halisi.',
  back: 'Sasa unaweza kurudi kwenye mazungumzo.',
  inUse: 'World ID hii tayari inathibitisha akaunti nyingine ya Karwan.',
  error: 'Haikufanya kazi. Jaribu tena.',
  unavailable: 'Ukaguzi wa mtu haupatikani kwa sasa.',
  signIn: 'Fungua ukurasa huu kupitia kiungo ulichotumiwa na wakala wa Karwan.',
};

export const personCheckCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', PersonCheckCopy> = { en, ar, fr, hi, sw };
