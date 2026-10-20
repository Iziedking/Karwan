/// Add and withdraw as one plain question each (view 19, Money board). No
/// protocol names: features/deposit/plainSteps.test.ts checks it.

import type { AddOptionId, WithdrawOptionId } from '@/features/deposit/plainSteps';

export interface PlainMoneyCopy {
  addQuestion: string;
  withdrawQuestion: string;
  add: Record<AddOptionId, { label: string; note: string }>;
  /// The withdraw choice to your own wallet differs by account.
  withdraw: Record<Exclude<WithdrawOptionId, 'ownWallet'>, { label: string; note: string }> & {
    ownWalletEmail: { label: string; note: string };
    ownWalletConnected: { label: string; note: string };
  };
  soon: string;
  back: string;
  exchangeTitle: string;
  exchangeBody: string;
  copy: string;
  copied: string;
}

export const plainMoneyCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', PlainMoneyCopy> = {
  en: {
    addQuestion: 'How do you want to add money?',
    withdrawQuestion: 'Where should the money go?',
    add: {
      faucet: { label: 'Get free test USDC', note: 'Try a whole deal without real money. Testnet only.' },
      address: { label: 'Send from an app or exchange', note: 'Use your Karwan address. Any supported network works.' },
      card: { label: 'Pay with card or bank', note: 'Not available yet.' },
      fromWallet: { label: 'Move USDC from your wallet', note: 'We show the USDC your wallet holds on each network. You confirm in your wallet.' },
      fromExchange: { label: 'From an exchange', note: 'Send USDC on Arc to your wallet address.' },
    },
    withdraw: {
      ownWalletEmail: { label: 'To a wallet you own', note: 'Paste its address, then pick the network.' },
      ownWalletConnected: { label: 'To your connected wallet', note: 'On the network you choose. You confirm in your wallet.' },
      someone: { label: 'To someone on Karwan', note: 'Pay a tag like @ada. Instant, no fee.' },
      bank: { label: 'To a bank account', note: 'Not available yet.' },
    },
    soon: 'Coming soon',
    back: 'Back',
    exchangeTitle: 'Send from an exchange',
    exchangeBody: 'Withdraw USDC on the Arc network to this address. Only send USDC.',
    copy: 'Copy',
    copied: 'Copied',
  },
  fr: {
    addQuestion: 'Comment voulez-vous ajouter de l’argent ?',
    withdrawQuestion: 'Où doit aller l’argent ?',
    add: {
      faucet: { label: 'Obtenir des USDC de test gratuits', note: 'Essayez une transaction entière sans argent réel. Testnet uniquement.' },
      address: { label: 'Envoyer depuis une app ou une plateforme', note: 'Utilisez votre adresse Karwan. Tout réseau pris en charge fonctionne.' },
      card: { label: 'Payer par carte ou banque', note: 'Pas encore disponible.' },
      fromWallet: { label: 'Déplacer des USDC depuis votre wallet', note: 'Nous montrons les USDC de votre wallet sur chaque réseau. Vous confirmez dans votre wallet.' },
      fromExchange: { label: 'Depuis une plateforme d’échange', note: 'Envoyez des USDC sur Arc à l’adresse de votre wallet.' },
    },
    withdraw: {
      ownWalletEmail: { label: 'Vers un wallet à vous', note: 'Collez son adresse, puis choisissez le réseau.' },
      ownWalletConnected: { label: 'Vers votre wallet connecté', note: 'Sur le réseau de votre choix. Vous confirmez dans votre wallet.' },
      someone: { label: 'À quelqu’un sur Karwan', note: 'Payez un tag comme @ada. Instantané, sans frais.' },
      bank: { label: 'Vers un compte bancaire', note: 'Pas encore disponible.' },
    },
    soon: 'Bientôt',
    back: 'Retour',
    exchangeTitle: 'Envoyer depuis une plateforme',
    exchangeBody: 'Retirez des USDC sur le réseau Arc vers cette adresse. N’envoyez que des USDC.',
    copy: 'Copier',
    copied: 'Copié',
  },
  ar: {
    addQuestion: 'كيف تريد إضافة المال؟',
    withdrawQuestion: 'إلى أين يذهب المال؟',
    add: {
      faucet: { label: 'احصل على USDC تجريبي مجاني', note: 'جرّب صفقة كاملة بلا مال حقيقي. على الشبكة التجريبية فقط.' },
      address: { label: 'أرسل من تطبيق أو منصة تداول', note: 'استخدم عنوانك في Karwan. أي شبكة مدعومة تعمل.' },
      card: { label: 'ادفع بالبطاقة أو البنك', note: 'غير متاح بعد.' },
      fromWallet: { label: 'انقل USDC من محفظتك', note: 'نعرض USDC الموجود في محفظتك على كل شبكة. تؤكد في محفظتك.' },
      fromExchange: { label: 'من منصة تداول', note: 'أرسل USDC على شبكة Arc إلى عنوان محفظتك.' },
    },
    withdraw: {
      ownWalletEmail: { label: 'إلى محفظة تملكها', note: 'الصق عنوانها ثم اختر الشبكة.' },
      ownWalletConnected: { label: 'إلى محفظتك المتصلة', note: 'على الشبكة التي تختارها. تؤكد في محفظتك.' },
      someone: { label: 'إلى شخص على Karwan', note: 'ادفع لوسم مثل @ada. فوري، بلا رسوم.' },
      bank: { label: 'إلى حساب بنكي', note: 'غير متاح بعد.' },
    },
    soon: 'قريبًا',
    back: 'رجوع',
    exchangeTitle: 'أرسل من منصة تداول',
    exchangeBody: 'اسحب USDC على شبكة Arc إلى هذا العنوان. أرسل USDC فقط.',
    copy: 'نسخ',
    copied: 'تم النسخ',
  },
  hi: {
    addQuestion: 'आप पैसे कैसे जोड़ना चाहते हैं?',
    withdrawQuestion: 'पैसा कहाँ जाना चाहिए?',
    add: {
      faucet: { label: 'मुफ़्त टेस्ट USDC पाएँ', note: 'असली पैसे के बिना पूरा सौदा आज़माएँ। केवल टेस्टनेट पर।' },
      address: { label: 'किसी ऐप या एक्सचेंज से भेजें', note: 'अपना Karwan पता इस्तेमाल करें। कोई भी समर्थित नेटवर्क चलेगा।' },
      card: { label: 'कार्ड या बैंक से भुगतान करें', note: 'अभी उपलब्ध नहीं।' },
      fromWallet: { label: 'अपने वॉलेट से USDC लाएँ', note: 'हम हर नेटवर्क पर आपके वॉलेट का USDC दिखाते हैं। आप अपने वॉलेट में पुष्टि करते हैं।' },
      fromExchange: { label: 'किसी एक्सचेंज से', note: 'Arc नेटवर्क पर USDC अपने वॉलेट पते पर भेजें।' },
    },
    withdraw: {
      ownWalletEmail: { label: 'अपने किसी वॉलेट में', note: 'उसका पता चिपकाएँ, फिर नेटवर्क चुनें।' },
      ownWalletConnected: { label: 'अपने जुड़े वॉलेट में', note: 'अपनी चुनी नेटवर्क पर। आप अपने वॉलेट में पुष्टि करते हैं।' },
      someone: { label: 'Karwan पर किसी को', note: '@ada जैसे टैग को भुगतान करें। तुरंत, कोई शुल्क नहीं।' },
      bank: { label: 'बैंक खाते में', note: 'अभी उपलब्ध नहीं।' },
    },
    soon: 'जल्द आ रहा है',
    back: 'वापस',
    exchangeTitle: 'किसी एक्सचेंज से भेजें',
    exchangeBody: 'Arc नेटवर्क पर USDC इस पते पर निकालें। केवल USDC भेजें।',
    copy: 'कॉपी करें',
    copied: 'कॉपी हुआ',
  },
  sw: {
    addQuestion: 'Unataka kuongeza pesa vipi?',
    withdrawQuestion: 'Pesa ziende wapi?',
    add: {
      faucet: { label: 'Pata USDC za majaribio bure', note: 'Jaribu mkataba mzima bila pesa halisi. Kwenye testnet tu.' },
      address: { label: 'Tuma kutoka programu au soko la kubadilisha', note: 'Tumia anwani yako ya Karwan. Mtandao wowote unaoungwa mkono unafanya kazi.' },
      card: { label: 'Lipa kwa kadi au benki', note: 'Bado haipatikani.' },
      fromWallet: { label: 'Hamisha USDC kutoka pochi yako', note: 'Tunaonyesha USDC za pochi yako kwenye kila mtandao. Unathibitisha kwenye pochi yako.' },
      fromExchange: { label: 'Kutoka soko la kubadilisha', note: 'Tuma USDC kwenye Arc kwenda anwani ya pochi yako.' },
    },
    withdraw: {
      ownWalletEmail: { label: 'Kwenye pochi unayomiliki', note: 'Bandika anwani yake, kisha chagua mtandao.' },
      ownWalletConnected: { label: 'Kwenye pochi yako iliyounganishwa', note: 'Kwenye mtandao unaochagua. Unathibitisha kwenye pochi yako.' },
      someone: { label: 'Kwa mtu kwenye Karwan', note: 'Lipa tagi kama @ada. Papo hapo, bila ada.' },
      bank: { label: 'Kwenye akaunti ya benki', note: 'Bado haipatikani.' },
    },
    soon: 'Inakuja hivi karibuni',
    back: 'Rudi',
    exchangeTitle: 'Tuma kutoka soko la kubadilisha',
    exchangeBody: 'Toa USDC kwenye mtandao wa Arc kwenda anwani hii. Tuma USDC tu.',
    copy: 'Nakili',
    copied: 'Imenakiliwa',
  },
};
