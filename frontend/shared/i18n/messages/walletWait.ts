import type { Locale } from '../locales';

/// What a page says while it waits on the person's wallet to sign them in (17 Nov).
export interface WalletWaitCopy {
  title: string;
  body: string;
  network: string;
  again: string;
  other: string;
}

const en: WalletWaitCopy = {
  title: 'Confirm the sign-in in your wallet',
  body: 'Your wallet was asked to sign you in to Karwan. Open it and approve to carry on.',
  network: 'Your wallet was asked to move to Arc first. Open it and approve to carry on.',
  again: 'Ask my wallet again',
  other: 'Sign in another way',
};

const fr: WalletWaitCopy = {
  title: 'Confirmez la connexion dans votre portefeuille',
  body: 'Votre portefeuille a reçu une demande de connexion à Karwan. Ouvrez-le et approuvez pour continuer.',
  network: 'Votre portefeuille doit d’abord passer sur Arc. Ouvrez-le et approuvez pour continuer.',
  again: 'Redemander à mon portefeuille',
  other: 'Me connecter autrement',
};

const ar: WalletWaitCopy = {
  title: 'أكّد تسجيل الدخول في محفظتك',
  body: 'طُلب من محفظتك تسجيل دخولك إلى Karwan. افتحها ووافق للمتابعة.',
  network: 'طُلب من محفظتك الانتقال إلى Arc أولًا. افتحها ووافق للمتابعة.',
  again: 'اطلب من محفظتي مرة أخرى',
  other: 'سجّل الدخول بطريقة أخرى',
};

const hi: WalletWaitCopy = {
  title: 'अपने वॉलेट में साइन-इन की पुष्टि करें',
  body: 'आपके वॉलेट से Karwan में साइन इन करने को कहा गया है। आगे बढ़ने के लिए उसे खोलकर मंज़ूरी दें।',
  network: 'आपके वॉलेट से पहले Arc पर जाने को कहा गया है। आगे बढ़ने के लिए उसे खोलकर मंज़ूरी दें।',
  again: 'वॉलेट से फिर पूछें',
  other: 'किसी और तरीके से साइन इन करें',
};

const sw: WalletWaitCopy = {
  title: 'Thibitisha kuingia kwenye pochi yako',
  body: 'Pochi yako imeombwa ikuingize kwenye Karwan. Ifungue na uidhinishe ili kuendelea.',
  network: 'Pochi yako imeombwa ihamie Arc kwanza. Ifungue na uidhinishe ili kuendelea.',
  again: 'Uliza pochi yangu tena',
  other: 'Ingia kwa njia nyingine',
};

export const walletWaitCopy: Record<Locale, WalletWaitCopy> = { en, fr, ar, hi, sw };
