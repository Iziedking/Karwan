/// The action tiles beside each wallet on the balance page (view 19, Money board).

import type { WalletActionKey, WalletActionNote, WalletTab } from '@/features/account/walletActions';

export interface WalletPanelCopy {
  title: Record<WalletTab, string>;
  intro: Record<WalletTab, string>;
  label: Record<WalletActionKey, string>;
  note: Record<WalletActionNote, string>;
}

export const walletPanelCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', WalletPanelCopy> = {
  en: {
    title: { you: 'Your wallet', buyer: 'Buying agent', seller: 'Selling agent' },
    intro: {
      you: 'Money you can spend, send or take out.',
      buyer: 'It pays into a deal when you agree to one. Keep enough here for your next purchase.',
      seller: 'What buyers pay you arrives here. Move it to your wallet to spend or withdraw it.',
    },
    label: {
      add: 'Add money', withdraw: 'Withdraw', send: 'Send to someone', request: 'Payment request',
      topUp: 'Top up from your wallet', moveBack: 'Move back to your wallet', moveEarnings: 'Move earnings to your wallet',
    },
    note: {
      add: 'Send from an app or exchange', addEmail: 'Send from an app or exchange', addWallet: 'Move USDC from your wallet',
      addEmailTestnet: 'Free test USDC, or send from an app or exchange', addWalletTestnet: 'Move USDC from your wallet, or get free test USDC',
      withdraw: 'To your own wallet, on the network you choose', send: 'Pay a Karwan tag like @ada. Instant, no fee',
      request: 'Ask someone to pay you. They pay from any wallet', topUp: 'Instant, no fee', topUpSeller: 'Only needed for a deal guarantee',
      moveBack: 'Instant, no fee', moveEarnings: 'Instant, no fee',
    },
  },
  fr: {
    title: { you: 'Votre wallet', buyer: 'Agent acheteur', seller: 'Agent vendeur' },
    intro: {
      you: 'L’argent que vous pouvez dépenser, envoyer ou retirer.',
      buyer: 'Il paie dans une transaction quand vous en acceptez une. Gardez-y assez pour votre prochain achat.',
      seller: 'Ce que les acheteurs vous paient arrive ici. Déplacez-le vers votre wallet pour le dépenser ou le retirer.',
    },
    label: {
      add: 'Ajouter de l’argent', withdraw: 'Retirer', send: 'Envoyer à quelqu’un', request: 'Demande de paiement',
      topUp: 'Recharger depuis votre wallet', moveBack: 'Remettre dans votre wallet', moveEarnings: 'Verser vos gains dans votre wallet',
    },
    note: {
      add: 'Envoyez depuis une app ou une plateforme d’échange', addEmail: 'Envoyez depuis une app ou une plateforme d’échange', addWallet: 'Déplacez des USDC depuis votre wallet',
      addEmailTestnet: 'USDC de test gratuits, ou envoi depuis une app ou une plateforme', addWalletTestnet: 'Déplacez des USDC depuis votre wallet, ou prenez des USDC de test gratuits',
      withdraw: 'Vers votre propre wallet, sur le réseau de votre choix', send: 'Payez un tag Karwan comme @ada. Instantané, sans frais',
      request: 'Demandez à quelqu’un de vous payer. Il paie depuis n’importe quel wallet', topUp: 'Instantané, sans frais', topUpSeller: 'Utile seulement pour une garantie de transaction',
      moveBack: 'Instantané, sans frais', moveEarnings: 'Instantané, sans frais',
    },
  },
  ar: {
    title: { you: 'محفظتك', buyer: 'وكيل الشراء', seller: 'وكيل البيع' },
    intro: {
      you: 'المال الذي يمكنك إنفاقه أو إرساله أو سحبه.',
      buyer: 'يدفع في الصفقة عندما توافق عليها. أبقِ هنا ما يكفي لشرائك القادم.',
      seller: 'ما يدفعه لك المشترون يصل هنا. انقله إلى محفظتك لتنفقه أو تسحبه.',
    },
    label: {
      add: 'أضف مالًا', withdraw: 'اسحب', send: 'أرسل إلى شخص', request: 'طلب دفع',
      topUp: 'اشحن من محفظتك', moveBack: 'أعده إلى محفظتك', moveEarnings: 'انقل أرباحك إلى محفظتك',
    },
    note: {
      add: 'أرسل من تطبيق أو منصة تداول', addEmail: 'أرسل من تطبيق أو منصة تداول', addWallet: 'انقل USDC من محفظتك',
      addEmailTestnet: 'USDC تجريبي مجاني، أو أرسل من تطبيق أو منصة تداول', addWalletTestnet: 'انقل USDC من محفظتك، أو احصل على USDC تجريبي مجاني',
      withdraw: 'إلى محفظتك الخاصة، على الشبكة التي تختارها', send: 'ادفع لوسم Karwan مثل @ada. فوري، بلا رسوم',
      request: 'اطلب من شخص أن يدفع لك. يدفع من أي محفظة', topUp: 'فوري، بلا رسوم', topUpSeller: 'مطلوب فقط لضمان الصفقة',
      moveBack: 'فوري، بلا رسوم', moveEarnings: 'فوري، بلا رسوم',
    },
  },
  hi: {
    title: { you: 'आपका वॉलेट', buyer: 'खरीद एजेंट', seller: 'बिक्री एजेंट' },
    intro: {
      you: 'वह पैसा जिसे आप खर्च, भेज या निकाल सकते हैं।',
      buyer: 'जब आप किसी सौदे पर सहमत होते हैं तो यह उसमें भुगतान करता है। अपनी अगली खरीद के लिए यहाँ काफ़ी रखें।',
      seller: 'खरीदार जो भुगतान करते हैं वह यहाँ आता है। खर्च करने या निकालने के लिए इसे अपने वॉलेट में ले जाएँ।',
    },
    label: {
      add: 'पैसे जोड़ें', withdraw: 'निकालें', send: 'किसी को भेजें', request: 'भुगतान अनुरोध',
      topUp: 'अपने वॉलेट से टॉप अप करें', moveBack: 'वापस अपने वॉलेट में ले जाएँ', moveEarnings: 'कमाई अपने वॉलेट में ले जाएँ',
    },
    note: {
      add: 'किसी ऐप या एक्सचेंज से भेजें', addEmail: 'किसी ऐप या एक्सचेंज से भेजें', addWallet: 'अपने वॉलेट से USDC ले आएँ',
      addEmailTestnet: 'मुफ़्त टेस्ट USDC, या किसी ऐप या एक्सचेंज से भेजें', addWalletTestnet: 'अपने वॉलेट से USDC ले आएँ, या मुफ़्त टेस्ट USDC लें',
      withdraw: 'अपने वॉलेट में, अपनी चुनी नेटवर्क पर', send: '@ada जैसे Karwan टैग को भुगतान करें। तुरंत, कोई शुल्क नहीं',
      request: 'किसी से भुगतान माँगें। वे किसी भी वॉलेट से भुगतान करते हैं', topUp: 'तुरंत, कोई शुल्क नहीं', topUpSeller: 'केवल डील गारंटी के लिए ज़रूरी',
      moveBack: 'तुरंत, कोई शुल्क नहीं', moveEarnings: 'तुरंत, कोई शुल्क नहीं',
    },
  },
  sw: {
    title: { you: 'Pochi yako', buyer: 'Wakala wa kununua', seller: 'Wakala wa kuuza' },
    intro: {
      you: 'Pesa unazoweza kutumia, kutuma au kutoa.',
      buyer: 'Hulipa kwenye mkataba unapokubali mmoja. Weka za kutosha hapa kwa ununuzi wako ujao.',
      seller: 'Wanunuzi wanachokulipa huingia hapa. Kihamishie kwenye pochi yako ili ukitumie au ukitoe.',
    },
    label: {
      add: 'Ongeza pesa', withdraw: 'Toa', send: 'Tuma kwa mtu', request: 'Ombi la malipo',
      topUp: 'Ongeza kutoka pochi yako', moveBack: 'Rudisha kwenye pochi yako', moveEarnings: 'Hamisha mapato kwenye pochi yako',
    },
    note: {
      add: 'Tuma kutoka programu au soko la kubadilisha', addEmail: 'Tuma kutoka programu au soko la kubadilisha', addWallet: 'Hamisha USDC kutoka pochi yako',
      addEmailTestnet: 'USDC za majaribio bure, au tuma kutoka programu au soko la kubadilisha', addWalletTestnet: 'Hamisha USDC kutoka pochi yako, au pata USDC za majaribio bure',
      withdraw: 'Kwenye pochi yako mwenyewe, kwenye mtandao unaochagua', send: 'Lipa tagi ya Karwan kama @ada. Papo hapo, bila ada',
      request: 'Mwombe mtu akulipe. Analipa kutoka pochi yoyote', topUp: 'Papo hapo, bila ada', topUpSeller: 'Inahitajika tu kwa dhamana ya mpango',
      moveBack: 'Papo hapo, bila ada', moveEarnings: 'Papo hapo, bila ada',
    },
  },
};
