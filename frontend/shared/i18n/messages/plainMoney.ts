/// Add and withdraw as one plain question each (view 19, Money board). No
/// protocol names: features/deposit/plainSteps.test.ts checks it.

import type { AddOptionId, WithdrawOptionId } from '@/features/deposit/plainSteps';

export interface PlainMoneyCopy {
  addQuestion: string;
  withdrawQuestion: string;
  add: Record<AddOptionId, { label: string }>;
  /// The withdraw choice to your own wallet differs by account.
  withdraw: Record<Exclude<WithdrawOptionId, 'ownWallet'>, { label: string; note: string }> & {
    ownWalletEmail: { label: string; note: string };
    ownWalletConnected: { label: string; note: string };
  };
  soon: string;
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
      faucet: { label: 'Get free test USDC' },
      address: { label: 'Send from an app or exchange' },
      card: { label: 'Pay with card or bank' },
      fromWallet: { label: 'Move USDC from your wallet' },
      fromExchange: { label: 'From an exchange' },
    },
    withdraw: {
      ownWalletEmail: { label: 'To a wallet you own', note: 'Paste its address, then pick the network.' },
      ownWalletConnected: { label: 'To your connected wallet', note: 'On the network you choose. You confirm in your wallet.' },
      someone: { label: 'To someone on Karwan', note: "Send to a Karwan tag such as @ada. Review the details before confirming." },
      bank: { label: 'To a bank account', note: 'Not available yet.' },
    },
    soon: 'Coming soon',
    exchangeTitle: 'Send from an exchange',
    exchangeBody: 'Withdraw USDC on the Arc network to this address. Only send USDC.',
    copy: 'Copy',
    copied: 'Copied',
  },
  fr: {
    addQuestion: 'Comment voulez-vous ajouter de l’argent ?',
    withdrawQuestion: 'Où doit aller l’argent ?',
    add: {
      faucet: { label: 'Obtenir des USDC de test gratuits' },
      address: { label: 'Envoyer depuis une app ou une plateforme' },
      card: { label: 'Payer par carte ou banque' },
      fromWallet: { label: 'Déplacer des USDC depuis votre wallet' },
      fromExchange: { label: 'Depuis une plateforme d’échange' },
    },
    withdraw: {
      ownWalletEmail: { label: 'Vers un wallet à vous', note: 'Collez son adresse, puis choisissez le réseau.' },
      ownWalletConnected: { label: 'Vers votre wallet connecté', note: 'Sur le réseau de votre choix. Vous confirmez dans votre wallet.' },
      someone: { label: 'À quelqu’un sur Karwan', note: "Envoyez à un tag Karwan comme @ada. Vérifiez les détails avant de confirmer." },
      bank: { label: 'Vers un compte bancaire', note: 'Pas encore disponible.' },
    },
    soon: 'Bientôt',
    exchangeTitle: 'Envoyer depuis une plateforme',
    exchangeBody: 'Retirez des USDC sur le réseau Arc vers cette adresse. N’envoyez que des USDC.',
    copy: 'Copier',
    copied: 'Copié',
  },
  ar: {
    addQuestion: 'كيف تريد إضافة المال؟',
    withdrawQuestion: 'إلى أين يذهب المال؟',
    add: {
      faucet: { label: 'احصل على USDC تجريبي مجاني' },
      address: { label: 'أرسل من تطبيق أو منصة تداول' },
      card: { label: 'ادفع بالبطاقة أو البنك' },
      fromWallet: { label: 'انقل USDC من محفظتك' },
      fromExchange: { label: 'من منصة تداول' },
    },
    withdraw: {
      ownWalletEmail: { label: 'إلى محفظة تملكها', note: 'الصق عنوانها ثم اختر الشبكة.' },
      ownWalletConnected: { label: 'إلى محفظتك المتصلة', note: 'على الشبكة التي تختارها. تؤكد في محفظتك.' },
      someone: { label: 'إلى شخص على Karwan', note: "أرسل إلى وسم Karwan مثل @ada. راجع التفاصيل قبل التأكيد." },
      bank: { label: 'إلى حساب بنكي', note: 'غير متاح بعد.' },
    },
    soon: 'قريبًا',
    exchangeTitle: 'أرسل من منصة تداول',
    exchangeBody: 'اسحب USDC على شبكة Arc إلى هذا العنوان. أرسل USDC فقط.',
    copy: 'نسخ',
    copied: 'تم النسخ',
  },
  hi: {
    addQuestion: 'आप पैसे कैसे जोड़ना चाहते हैं?',
    withdrawQuestion: 'पैसा कहाँ जाना चाहिए?',
    add: {
      faucet: { label: 'मुफ़्त टेस्ट USDC पाएँ' },
      address: { label: 'किसी ऐप या एक्सचेंज से भेजें' },
      card: { label: 'कार्ड या बैंक से भुगतान करें' },
      fromWallet: { label: 'अपने वॉलेट से USDC लाएँ' },
      fromExchange: { label: 'किसी एक्सचेंज से' },
    },
    withdraw: {
      ownWalletEmail: { label: 'अपने किसी वॉलेट में', note: 'उसका पता चिपकाएँ, फिर नेटवर्क चुनें।' },
      ownWalletConnected: { label: 'अपने जुड़े वॉलेट में', note: 'अपनी चुनी नेटवर्क पर। आप अपने वॉलेट में पुष्टि करते हैं।' },
      someone: { label: 'Karwan पर किसी को', note: "@ada जैसे Karwan टैग पर भेजें। पुष्टि से पहले विवरण जाँचें।" },
      bank: { label: 'बैंक खाते में', note: 'अभी उपलब्ध नहीं।' },
    },
    soon: 'जल्द आ रहा है',
    exchangeTitle: 'किसी एक्सचेंज से भेजें',
    exchangeBody: 'Arc नेटवर्क पर USDC इस पते पर निकालें। केवल USDC भेजें।',
    copy: 'कॉपी करें',
    copied: 'कॉपी हुआ',
  },
  sw: {
    addQuestion: 'Unataka kuongeza pesa vipi?',
    withdrawQuestion: 'Pesa ziende wapi?',
    add: {
      faucet: { label: 'Pata USDC za majaribio bure' },
      address: { label: 'Tuma kutoka programu au soko la kubadilisha' },
      card: { label: 'Lipa kwa kadi au benki' },
      fromWallet: { label: 'Hamisha USDC kutoka pochi yako' },
      fromExchange: { label: 'Kutoka soko la kubadilisha' },
    },
    withdraw: {
      ownWalletEmail: { label: 'Kwenye pochi unayomiliki', note: 'Bandika anwani yake, kisha chagua mtandao.' },
      ownWalletConnected: { label: 'Kwenye pochi yako iliyounganishwa', note: 'Kwenye mtandao unaochagua. Unathibitisha kwenye pochi yako.' },
      someone: { label: 'Kwa mtu kwenye Karwan', note: "Tuma kwa tagi ya Karwan kama @ada. Kagua maelezo kabla ya kuthibitisha." },
      bank: { label: 'Kwenye akaunti ya benki', note: 'Bado haipatikani.' },
    },
    soon: 'Inakuja hivi karibuni',
    exchangeTitle: 'Tuma kutoka soko la kubadilisha',
    exchangeBody: 'Toa USDC kwenye mtandao wa Arc kwenda anwani hii. Tuma USDC tu.',
    copy: 'Nakili',
    copied: 'Imenakiliwa',
  },
};
