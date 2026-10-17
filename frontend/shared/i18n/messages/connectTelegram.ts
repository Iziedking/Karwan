/// The page the Telegram bot sends people who sign in to Karwan with a wallet
/// or a passkey: sign in here, then open Telegram from a link made for you.
export interface ConnectTelegramCopy {
  title: string;
  body: string;
  connect: string;
  signInEmail: string;
  link: string;
  linking: string;
  failed: string;
}

const en: ConnectTelegramCopy = {
  title: 'Connect Telegram',
  body: 'Sign in to Karwan, then open Telegram from here. Your chat with the Karwan bot joins this account.',
  connect: 'Connect wallet',
  signInEmail: 'Sign in with email instead',
  link: 'Open Telegram',
  linking: 'Opening Telegram',
  failed: "That didn't work. Try again in a minute.",
};

const ar: ConnectTelegramCopy = {
  title: 'اربط تيليجرام',
  body: 'سجّل الدخول إلى كاروان، ثم افتح تيليجرام من هنا. تنضم محادثتك مع بوت كاروان إلى هذا الحساب.',
  connect: 'اربط المحفظة',
  signInEmail: 'سجّل الدخول بالبريد الإلكتروني بدلًا من ذلك',
  link: 'افتح تيليجرام',
  linking: 'جارٍ فتح تيليجرام',
  failed: 'لم ينجح ذلك. حاول مرة أخرى بعد دقيقة.',
};

const fr: ConnectTelegramCopy = {
  title: 'Connecter Telegram',
  body: 'Connectez-vous à Karwan, puis ouvrez Telegram d’ici. Votre conversation avec le bot Karwan rejoint ce compte.',
  connect: 'Connecter le portefeuille',
  signInEmail: 'Se connecter plutôt avec un e-mail',
  link: 'Ouvrir Telegram',
  linking: 'Ouverture de Telegram',
  failed: "Ça n'a pas marché. Réessayez dans une minute.",
};

const hi: ConnectTelegramCopy = {
  title: 'Telegram जोड़ें',
  body: 'Karwan में साइन इन करें, फिर यहां से Telegram खोलें। Karwan बॉट के साथ आपकी चैट इस खाते से जुड़ जाएगी।',
  connect: 'वॉलेट जोड़ें',
  signInEmail: 'इसके बजाय ईमेल से साइन इन करें',
  link: 'Telegram खोलें',
  linking: 'Telegram खुल रहा है',
  failed: 'यह नहीं हुआ। एक मिनट बाद फिर कोशिश करें।',
};

const sw: ConnectTelegramCopy = {
  title: 'Unganisha Telegram',
  body: 'Ingia kwenye Karwan, kisha fungua Telegram kutoka hapa. Mazungumzo yako na boti ya Karwan yanajiunga na akaunti hii.',
  connect: 'Unganisha pochi',
  signInEmail: 'Ingia kwa barua pepe badala yake',
  link: 'Fungua Telegram',
  linking: 'Inafungua Telegram',
  failed: 'Haikufanikiwa. Jaribu tena baada ya dakika moja.',
};

export const connectTelegramCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', ConnectTelegramCopy> = { en, ar, fr, hi, sw };
