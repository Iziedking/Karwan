/// Money, withdrawing, the deal guarantee and earlier deals (view 44, Batch 7).
export interface MoneyPageCopy {
  heldInDeals: string;
  addMoney: string;
  send: string;
  withdraw: string;
  askForMoney: string;
  agentsRow: string;
  deal: string;
  available: string;
  amount: string;
  whereTitle: string;
  toWallet: string;
  toWalletLine: string;
  toKarwan: string;
  toKarwanLine: string;
  pasteAddress: string;
  withdrawCta: string;
  continueCta: string;
  over: string;
  badAddress: string;
  guaranteeTitle: string;
  guaranteed: string;
  heldRow: string;
  freeRow: string;
  comingBack: string;
  whatItDoes: string;
  whatItDoesBody: string;
  earnings: string;
  off: string;
}

export const moneyPageCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', MoneyPageCopy> = {
  en: {
    heldInDeals: '{amount} USDC held in your deals',
    addMoney: 'Add money',
    send: 'Send',
    withdraw: 'Withdraw',
    askForMoney: 'Ask for money',
    agentsRow: 'Money your agents hold',
    deal: 'Deal {reference}',
    available: '{amount} USDC available',
    amount: 'Amount',
    whereTitle: 'Where should it go?',
    toWallet: 'A wallet or exchange',
    toWalletLine: 'Binance, Bybit or any wallet',
    toKarwan: 'Someone on Karwan',
    toKarwanLine: 'Send it to their Karwan tag',
    pasteAddress: 'Paste the address',
    withdrawCta: 'Withdraw {amount} USDC',
    continueCta: 'Continue',
    over: 'That is more than you have.',
    badAddress: 'Check the address. It starts with 0x and has 42 characters.',
    guaranteeTitle: 'Deal guarantee',
    guaranteed: 'guaranteed',
    heldRow: 'Held in your deals',
    freeRow: 'Free to withdraw',
    comingBack: 'Coming back on {date}',
    whatItDoes: 'What your guarantee does',
    whatItDoesBody: 'It shows buyers you stand behind your work. If you lose a problem on a deal, part of it can go to the buyer. You can withdraw what is free at any time.',
    earnings: 'Earnings on your guarantee',
    off: 'The deal guarantee is not open on this network yet.',
  },
  fr: {
    heldInDeals: '{amount} USDC gardés dans vos transactions',
    addMoney: 'Ajouter de l’argent',
    send: 'Envoyer',
    withdraw: 'Retirer',
    askForMoney: 'Demander de l’argent',
    agentsRow: 'Argent détenu par vos agents',
    deal: 'Transaction {reference}',
    available: '{amount} USDC disponibles',
    amount: 'Montant',
    whereTitle: 'Où doit-il aller ?',
    toWallet: 'Un portefeuille ou une plateforme',
    toWalletLine: 'Binance, Bybit ou tout portefeuille',
    toKarwan: 'Quelqu’un sur Karwan',
    toKarwanLine: 'Envoyez-le à son identifiant Karwan',
    pasteAddress: 'Collez l’adresse',
    withdrawCta: 'Retirer {amount} USDC',
    continueCta: 'Continuer',
    over: 'C’est plus que ce que vous avez.',
    badAddress: 'Vérifiez l’adresse. Elle commence par 0x et compte 42 caractères.',
    guaranteeTitle: 'Garantie de transaction',
    guaranteed: 'garantis',
    heldRow: 'Gardé dans vos transactions',
    freeRow: 'Libre de retrait',
    comingBack: 'Revient le {date}',
    whatItDoes: 'À quoi sert votre garantie',
    whatItDoesBody: 'Elle montre aux acheteurs que vous assumez votre travail. Si vous perdez un problème sur une transaction, une partie peut aller à l’acheteur. Vous pouvez retirer ce qui est libre à tout moment.',
    earnings: 'Gains sur votre garantie',
    off: 'La garantie de transaction n’est pas encore ouverte sur ce réseau.',
  },
  ar: {
    heldInDeals: '{amount} USDC محفوظة في صفقاتك',
    addMoney: 'إضافة مال',
    send: 'إرسال',
    withdraw: 'سحب',
    askForMoney: 'اطلب مالًا',
    agentsRow: 'المال لدى وكلائك',
    deal: 'الصفقة {reference}',
    available: '{amount} USDC متاحة',
    amount: 'المبلغ',
    whereTitle: 'إلى أين يذهب؟',
    toWallet: 'محفظة أو منصة تداول',
    toWalletLine: 'Binance أو Bybit أو أي محفظة',
    toKarwan: 'شخص على كاروان',
    toKarwanLine: 'أرسله إلى معرّفه في كاروان',
    pasteAddress: 'الصق العنوان',
    withdrawCta: 'اسحب {amount} USDC',
    continueCta: 'متابعة',
    over: 'هذا أكثر مما لديك.',
    badAddress: 'تحقق من العنوان. يبدأ بـ 0x ويتكون من 42 حرفًا.',
    guaranteeTitle: 'ضمان الصفقات',
    guaranteed: 'مضمونة',
    heldRow: 'محفوظ في صفقاتك',
    freeRow: 'متاح للسحب',
    comingBack: 'يعود في {date}',
    whatItDoes: 'ما الذي يفعله ضمانك',
    whatItDoesBody: 'يُظهر للمشترين أنك تقف وراء عملك. إذا خسرت مشكلة في صفقة، قد يذهب جزء منه إلى المشتري. يمكنك سحب المتاح في أي وقت.',
    earnings: 'أرباح ضمانك',
    off: 'ضمان الصفقات غير متاح على هذه الشبكة بعد.',
  },
  hi: {
    heldInDeals: '{amount} USDC आपकी डील में सुरक्षित',
    addMoney: 'पैसे जोड़ें',
    send: 'भेजें',
    withdraw: 'निकालें',
    askForMoney: 'पैसे माँगें',
    agentsRow: 'आपके एजेंटों के पास पैसे',
    deal: 'डील {reference}',
    available: '{amount} USDC उपलब्ध',
    amount: 'राशि',
    whereTitle: 'यह कहाँ जाए?',
    toWallet: 'वॉलेट या एक्सचेंज',
    toWalletLine: 'Binance, Bybit या कोई भी वॉलेट',
    toKarwan: 'Karwan पर कोई',
    toKarwanLine: 'इसे उनके Karwan टैग पर भेजें',
    pasteAddress: 'पता पेस्ट करें',
    withdrawCta: '{amount} USDC निकालें',
    continueCta: 'आगे बढ़ें',
    over: 'यह आपके पास मौजूद राशि से ज़्यादा है।',
    badAddress: 'पता जाँचें। यह 0x से शुरू होता है और इसमें 42 अक्षर होते हैं।',
    guaranteeTitle: 'डील गारंटी',
    guaranteed: 'गारंटी',
    heldRow: 'आपकी डील में सुरक्षित',
    freeRow: 'निकालने के लिए उपलब्ध',
    comingBack: '{date} को वापस आएगा',
    whatItDoes: 'आपकी गारंटी क्या करती है',
    whatItDoesBody: 'यह खरीदारों को दिखाती है कि आप अपने काम के पीछे खड़े हैं। अगर आप किसी डील में समस्या हारते हैं, तो इसका हिस्सा खरीदार को जा सकता है। जो उपलब्ध है उसे आप कभी भी निकाल सकते हैं।',
    earnings: 'आपकी गारंटी पर कमाई',
    off: 'डील गारंटी अभी इस नेटवर्क पर उपलब्ध नहीं है।',
  },
  sw: {
    heldInDeals: 'USDC {amount} zinashikiliwa kwenye mipango yako',
    addMoney: 'Ongeza pesa',
    send: 'Tuma',
    withdraw: 'Toa',
    askForMoney: 'Omba pesa',
    agentsRow: 'Pesa walizonazo mawakala wako',
    deal: 'Mpango {reference}',
    available: 'USDC {amount} zinapatikana',
    amount: 'Kiasi',
    whereTitle: 'Ziende wapi?',
    toWallet: 'Pochi au soko la kubadilisha',
    toWalletLine: 'Binance, Bybit au pochi yoyote',
    toKarwan: 'Mtu aliye kwenye Karwan',
    toKarwanLine: 'Mtumie kwa lebo yake ya Karwan',
    pasteAddress: 'Bandika anwani',
    withdrawCta: 'Toa USDC {amount}',
    continueCta: 'Endelea',
    over: 'Hiyo ni zaidi ya ulichonacho.',
    badAddress: 'Kagua anwani. Inaanza na 0x na ina herufi 42.',
    guaranteeTitle: 'Dhamana ya mpango',
    guaranteed: 'zimedhaminiwa',
    heldRow: 'Inashikiliwa kwenye mipango yako',
    freeRow: 'Inaweza kutolewa',
    comingBack: 'Inarudi tarehe {date}',
    whatItDoes: 'Dhamana yako inafanya nini',
    whatItDoesBody: 'Inawaonyesha wanunuzi kuwa unasimamia kazi yako. Ukishindwa tatizo kwenye mpango, sehemu yake inaweza kwenda kwa mnunuzi. Unaweza kutoa kilicho huru wakati wowote.',
    earnings: 'Mapato ya dhamana yako',
    off: 'Dhamana ya mpango bado haijafunguliwa kwenye mtandao huu.',
  },
};
