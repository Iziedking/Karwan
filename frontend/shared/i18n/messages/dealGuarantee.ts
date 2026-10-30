/// The Deal guarantee page and Legacy contracts (view 37). "Stake", "vault"
/// and "insurance" never appear here: the thing is a deal guarantee, and the
/// page of older contracts is Legacy contracts.
export interface DealGuaranteeCopy {
  title: string;
  hint: string;
  signedOut: { tag: string; titlePrefix: string; titleAccent: string; body: string; buttonLabel: string };
  rows: { inPlace: string; held: string; comingBack: string; ready: string; earns: string };
  earnsValue: string;
  comingBackValue: string;
  readyValue: string;
  notAvailable: string;
  previous: { line: string; link: string };
  buttons: { putUp: string; takeOut: string; cancel: string; collect: string };
  amountLabel: string;
  sheets: {
    putUp: { title: string; body: string; confirm: string };
    takeOut: { title: string; body: string; restart: string; confirm: string };
    cancel: { title: string; body: string; confirm: string };
    collect: { title: string; body: string; confirm: string };
    busy: string;
    notNow: string;
  };
  errors: { amount: string; overBalance: string; overFree: string; failed: string };
  done: { putUp: string; takeOut: string; cancel: string; collect: string };
  legacy: {
    gate: { tag: string; titleBefore: string; titleAccent: string; body: string; button: string };
    title: string;
    hint: string;
    empty: string;
    loading: string;
    olderDeals: string;
    guarantees: string;
    asBuyer: string;
    asSeller: string;
    withWho: string;
    funded: string;
    disputed: string;
    waitingBuyer: string;
    inPlace: string;
    comingBackOn: string;
    ready: string;
    previousContract: string;
    heldByKarwan: string;
    steps: { releaseFinal: string; refund: string; requestWithdraw: string; cancelWithdraw: string; claim: string };
    releaseWarning: string;
    done: string;
    failed: string;
  };
  profile: { dealGuarantee: string; legacyContracts: string };
}

export const dealGuaranteeCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', DealGuaranteeCopy> = {
  en: {
    title: 'Deal guarantee',
    hint: 'Money you set aside to protect your buyers. Deals and advances can hold part of it until they finish.',
    signedOut: { tag: 'Deal guarantee', titlePrefix: 'Protect your', titleAccent: 'buyers', body: 'Set money aside as a deal guarantee. It protects your buyers and can back an advance.', buttonLabel: 'Log in' },
    rows: { inPlace: 'In place', held: 'Held by deals', comingBack: 'Coming back', ready: 'Ready to collect', earns: 'Earns' },
    earnsValue: 'At the USYC rate, paid by Karwan on testnet',
    comingBackValue: '{amount} USDC on {date}',
    readyValue: '{amount} USDC',
    notAvailable: 'The deal guarantee is not available right now.',
    previous: { line: 'You have {amount} USDC on the previous contract.', link: 'Withdraw' },
    buttons: { putUp: 'Deposit', takeOut: 'Withdraw', cancel: 'Cancel withdrawal', collect: 'Collect' },
    amountLabel: 'Amount in USDC',
    sheets: {
      putUp: { title: 'Deposit {amount} USDC', body: 'It protects your buyers and can back an advance. Coming back takes {days} days.', confirm: 'Deposit' },
      takeOut: { title: 'Withdraw {amount} USDC', body: 'It comes back on {date}. While it comes back it no longer protects your buyers.', restart: 'This restarts the {days} days for all {total} USDC coming back.', confirm: 'Withdraw' },
      cancel: { title: 'Keep {amount} USDC', body: 'It stays in your guarantee and protects your buyers again.', confirm: 'Keep it' },
      collect: { title: 'Collect {amount} USDC', body: 'It goes back to your balance.', confirm: 'Collect' },
      busy: 'Working…',
      notNow: 'Not now',
    },
    errors: { amount: 'Enter an amount above 0.', overBalance: 'Your balance is {amount} USDC.', overFree: 'You can withdraw up to {amount} USDC now.', failed: 'That did not go through. Nothing moved.' },
    done: { putUp: 'Your deal guarantee is in place.', takeOut: 'Started. It comes back on {date}.', cancel: 'Kept. It protects your buyers again.', collect: 'Collected. It is back in your balance.' },
    legacy: {
      gate: { tag: 'Legacy contracts', titleBefore: 'Money on', titleAccent: 'older contracts', body: 'Anything you still have on an older Karwan contract stays yours. Sign in to see it and get it back.', button: 'Sign in' },
      title: 'Legacy contracts',
      hint: 'Money you still have on older Karwan contracts.',
      empty: 'Nothing left on older contracts.',
      loading: 'Reading older contracts',
      olderDeals: 'Older deals',
      guarantees: 'Guarantees on older contracts',
      asBuyer: 'You buy',
      asSeller: 'You sell',
      withWho: 'With {who}',
      funded: 'Money in the deal',
      disputed: 'In dispute',
      waitingBuyer: 'Waiting for the buyer',
      inPlace: 'In place',
      comingBackOn: 'Coming back on {date}',
      ready: 'Ready to collect',
      previousContract: 'Previous contract',
      heldByKarwan: 'Held by Karwan. Contact support and we will return it.',
      steps: { releaseFinal: 'Release to the seller', refund: 'Get it back', requestWithdraw: 'Withdraw', cancelWithdraw: 'Keep it', claim: 'Collect' },
      releaseWarning: 'The seller is paid and this cannot be undone.',
      done: 'Done. {amount} USDC.',
      failed: 'That did not go through. Nothing moved.',
    },
    profile: { dealGuarantee: 'Deal guarantee', legacyContracts: 'Legacy contracts' },
  },
  fr: {
    title: 'Garantie de transaction',
    hint: 'De l’argent mis de côté pour protéger vos acheteurs. Les accords et les avances peuvent en retenir une partie jusqu’à leur fin.',
    signedOut: { tag: 'Garantie de transaction', titlePrefix: 'Protégez vos', titleAccent: 'acheteurs', body: 'Mettez de l’argent de côté comme garantie de transaction. Elle protège vos acheteurs et peut soutenir une avance.', buttonLabel: 'Se connecter' },
    rows: { inPlace: 'En place', held: 'Retenu par des accords', comingBack: 'En retour', ready: 'Prêt à récupérer', earns: 'Rapporte' },
    earnsValue: 'Au taux USYC, versé par Karwan sur le testnet',
    comingBackValue: '{amount} USDC le {date}',
    readyValue: '{amount} USDC',
    notAvailable: 'La garantie de transaction n’est pas disponible pour le moment.',
    previous: { line: 'Vous avez {amount} USDC sur le contrat précédent.', link: 'Retirer' },
    buttons: { putUp: 'Déposer', takeOut: 'Retirer', cancel: 'Annuler le retrait', collect: 'Récupérer' },
    amountLabel: 'Montant en USDC',
    sheets: {
      putUp: { title: 'Déposer {amount} USDC', body: 'Elle protège vos acheteurs et peut soutenir une avance. Le retour prend {days} jours.', confirm: 'Déposer' },
      takeOut: { title: 'Retirer {amount} USDC', body: 'L’argent revient le {date}. Pendant ce temps, il ne protège plus vos acheteurs.', restart: 'Cela relance les {days} jours pour les {total} USDC en retour.', confirm: 'Retirer' },
      cancel: { title: 'Garder {amount} USDC', body: 'L’argent reste dans votre garantie et protège de nouveau vos acheteurs.', confirm: 'Garder' },
      collect: { title: 'Récupérer {amount} USDC', body: 'L’argent revient sur votre solde.', confirm: 'Récupérer' },
      busy: 'En cours…',
      notNow: 'Pas maintenant',
    },
    errors: { amount: 'Saisissez un montant supérieur à 0.', overBalance: 'Votre solde est de {amount} USDC.', overFree: 'Vous pouvez retirer jusqu’à {amount} USDC maintenant.', failed: 'Cela n’a pas abouti. Rien n’a bougé.' },
    done: { putUp: 'Votre garantie de transaction est en place.', takeOut: 'C’est lancé. L’argent revient le {date}.', cancel: 'Gardé. Il protège de nouveau vos acheteurs.', collect: 'Récupéré. L’argent est de retour sur votre solde.' },
    legacy: {
      gate: { tag: 'Anciens contrats', titleBefore: 'L’argent sur', titleAccent: 'd’anciens contrats', body: 'Ce que vous avez encore sur un ancien contrat Karwan vous appartient. Connectez-vous pour le voir et le récupérer.', button: 'Se connecter' },
      title: 'Anciens contrats',
      hint: 'L’argent que vous avez encore sur d’anciens contrats Karwan.',
      empty: 'Il ne reste rien sur les anciens contrats.',
      loading: 'Lecture des anciens contrats',
      olderDeals: 'Anciens accords',
      guarantees: 'Garanties sur d’anciens contrats',
      asBuyer: 'Vous achetez',
      asSeller: 'Vous vendez',
      withWho: 'Avec {who}',
      funded: 'Argent dans l’accord',
      disputed: 'En litige',
      waitingBuyer: 'En attente de l’acheteur',
      inPlace: 'En place',
      comingBackOn: 'Retour le {date}',
      ready: 'Prêt à récupérer',
      previousContract: 'Contrat précédent',
      heldByKarwan: 'Détenu par Karwan. Contactez le support et nous vous le rendrons.',
      steps: { releaseFinal: 'Payer le vendeur', refund: 'Le récupérer', requestWithdraw: 'Retirer', cancelWithdraw: 'Garder', claim: 'Récupérer' },
      releaseWarning: 'Le vendeur est payé, et cela ne peut pas être annulé.',
      done: 'C’est fait. {amount} USDC.',
      failed: 'Cela n’a pas abouti. Rien n’a bougé.',
    },
    profile: { dealGuarantee: 'Garantie de transaction', legacyContracts: 'Anciens contrats' },
  },
  ar: {
    title: 'ضمان الصفقة',
    hint: 'مال تخصصه لحماية المشترين منك. يمكن للصفقات والسلف أن تحجز جزءا منه حتى تنتهي.',
    signedOut: { tag: 'ضمان الصفقة', titlePrefix: 'احمِ', titleAccent: 'المشترين منك', body: 'خصص مالا كضمان للصفقة. يحمي المشترين منك ويمكن أن يدعم سلفة.', buttonLabel: 'تسجيل الدخول' },
    rows: { inPlace: 'قائم', held: 'محجوز للصفقات', comingBack: 'في طريق العودة', ready: 'جاهز للاستلام', earns: 'العائد' },
    earnsValue: 'بمعدل USYC، تدفعه Karwan على الشبكة التجريبية',
    comingBackValue: '{amount} USDC في {date}',
    readyValue: '{amount} USDC',
    notAvailable: 'ضمان الصفقة غير متاح الآن.',
    previous: { line: 'لديك {amount} USDC على العقد السابق.', link: 'اسحبه' },
    buttons: { putUp: 'إيداع', takeOut: 'سحب', cancel: 'إلغاء السحب', collect: 'استلام' },
    amountLabel: 'المبلغ بعملة USDC',
    sheets: {
      putUp: { title: 'إيداع {amount} USDC', body: 'يحمي المشترين منك ويمكن أن يدعم سلفة. تستغرق العودة {days} أيام.', confirm: 'إيداع' },
      takeOut: { title: 'سحب {amount} USDC', body: 'يعود في {date}. خلال العودة لا يحمي المشترين منك.', restart: 'هذا يعيد بدء الأيام الـ {days} لكامل {total} USDC العائدة.', confirm: 'سحب' },
      cancel: { title: 'الإبقاء على {amount} USDC', body: 'يبقى في ضمانك ويحمي المشترين منك من جديد.', confirm: 'أبقِه' },
      collect: { title: 'استلام {amount} USDC', body: 'يعود إلى رصيدك.', confirm: 'استلام' },
      busy: 'جارٍ التنفيذ…',
      notNow: 'ليس الآن',
    },
    errors: { amount: 'أدخل مبلغا أكبر من 0.', overBalance: 'رصيدك {amount} USDC.', overFree: 'يمكنك سحب ما يصل إلى {amount} USDC الآن.', failed: 'لم تتم العملية. لم يتحرك شيء.' },
    done: { putUp: 'ضمان صفقتك قائم.', takeOut: 'بدأ السحب. يعود في {date}.', cancel: 'تم الإبقاء عليه. يحمي المشترين منك من جديد.', collect: 'تم الاستلام. عاد إلى رصيدك.' },
    legacy: {
      gate: { tag: 'العقود السابقة', titleBefore: 'مالك على', titleAccent: 'العقود السابقة', body: 'ما زال لك كل ما لديك على عقد سابق من Karwan. سجّل الدخول لتراه وتسترده.', button: 'تسجيل الدخول' },
      title: 'العقود السابقة',
      hint: 'المال الذي ما زال لك على عقود Karwan السابقة.',
      empty: 'لم يبقَ شيء على العقود السابقة.',
      loading: 'جارٍ قراءة العقود السابقة',
      olderDeals: 'صفقات سابقة',
      guarantees: 'ضمانات على عقود سابقة',
      asBuyer: 'أنت تشتري',
      asSeller: 'أنت تبيع',
      withWho: 'مع {who}',
      funded: 'المال في الصفقة',
      disputed: 'في نزاع',
      waitingBuyer: 'بانتظار المشتري',
      inPlace: 'قائم',
      comingBackOn: 'يعود في {date}',
      ready: 'جاهز للاستلام',
      previousContract: 'العقد السابق',
      heldByKarwan: 'تحتفظ به Karwan. تواصل مع الدعم وسنعيده إليك.',
      steps: { releaseFinal: 'الدفع للبائع', refund: 'استرداده', requestWithdraw: 'سحب', cancelWithdraw: 'أبقِه', claim: 'استلام' },
      releaseWarning: 'يُدفع للبائع ولا يمكن التراجع عن ذلك.',
      done: 'تم. {amount} USDC.',
      failed: 'لم تتم العملية. لم يتحرك شيء.',
    },
    profile: { dealGuarantee: 'ضمان الصفقة', legacyContracts: 'العقود السابقة' },
  },
  hi: {
    title: 'डील गारंटी',
    hint: 'आपके खरीदारों की सुरक्षा के लिए अलग रखा गया पैसा। डील और एडवांस इसका एक हिस्सा अपने पूरा होने तक रोक सकते हैं।',
    signedOut: { tag: 'डील गारंटी', titlePrefix: 'अपने खरीदारों को', titleAccent: 'सुरक्षित रखें', body: 'डील गारंटी के रूप में पैसा अलग रखें। यह आपके खरीदारों की रक्षा करता है और एडवांस का सहारा बन सकता है।', buttonLabel: 'लॉग इन करें' },
    rows: { inPlace: 'लगा हुआ', held: 'डील में रुका', comingBack: 'वापस आ रहा', ready: 'लेने के लिए तैयार', earns: 'कमाई' },
    earnsValue: 'USYC दर पर, टेस्टनेट पर Karwan द्वारा दिया जाता है',
    comingBackValue: '{date} को {amount} USDC',
    readyValue: '{amount} USDC',
    notAvailable: 'डील गारंटी अभी उपलब्ध नहीं है।',
    previous: { line: 'पिछले कॉन्ट्रैक्ट पर आपके {amount} USDC हैं।', link: 'निकालें' },
    buttons: { putUp: 'जमा करें', takeOut: 'निकालें', cancel: 'निकालना रद्द करें', collect: 'लें' },
    amountLabel: 'USDC में राशि',
    sheets: {
      putUp: { title: '{amount} USDC जमा करें', body: 'यह आपके खरीदारों की रक्षा करता है और एडवांस का सहारा बन सकता है। वापसी में {days} दिन लगते हैं।', confirm: 'जमा करें' },
      takeOut: { title: '{amount} USDC निकालें', body: 'यह {date} को वापस आता है। वापस आते समय यह आपके खरीदारों की रक्षा नहीं करता।', restart: 'इससे वापस आ रहे सभी {total} USDC के लिए {days} दिन फिर से शुरू होते हैं।', confirm: 'निकालें' },
      cancel: { title: '{amount} USDC रखें', body: 'यह आपकी गारंटी में रहता है और फिर से आपके खरीदारों की रक्षा करता है।', confirm: 'रखें' },
      collect: { title: '{amount} USDC लें', body: 'यह आपके बैलेंस में वापस जाता है।', confirm: 'लें' },
      busy: 'हो रहा है…',
      notNow: 'अभी नहीं',
    },
    errors: { amount: '0 से अधिक राशि डालें।', overBalance: 'आपका बैलेंस {amount} USDC है।', overFree: 'आप अभी {amount} USDC तक निकाल सकते हैं।', failed: 'यह पूरा नहीं हुआ। कुछ नहीं हिला।' },
    done: { putUp: 'आपकी डील गारंटी लग गई है।', takeOut: 'शुरू हो गया। यह {date} को वापस आएगा।', cancel: 'रखा गया। यह फिर से आपके खरीदारों की रक्षा करता है।', collect: 'मिल गया। यह आपके बैलेंस में वापस है।' },
    legacy: {
      gate: { tag: 'पुराने कॉन्ट्रैक्ट', titleBefore: 'पैसा', titleAccent: 'पुराने कॉन्ट्रैक्ट पर', body: 'पुराने Karwan कॉन्ट्रैक्ट पर जो भी है, वह आपका ही है। उसे देखने और वापस पाने के लिए साइन इन करें।', button: 'साइन इन करें' },
      title: 'पुराने कॉन्ट्रैक्ट',
      hint: 'पुराने Karwan कॉन्ट्रैक्ट पर अभी भी आपका पैसा।',
      empty: 'पुराने कॉन्ट्रैक्ट पर कुछ नहीं बचा।',
      loading: 'पुराने कॉन्ट्रैक्ट पढ़े जा रहे हैं',
      olderDeals: 'पुरानी डील',
      guarantees: 'पुराने कॉन्ट्रैक्ट पर गारंटी',
      asBuyer: 'आप खरीद रहे हैं',
      asSeller: 'आप बेच रहे हैं',
      withWho: '{who} के साथ',
      funded: 'डील में पैसा',
      disputed: 'विवाद में',
      waitingBuyer: 'खरीदार की प्रतीक्षा',
      inPlace: 'लगा हुआ',
      comingBackOn: '{date} को वापस',
      ready: 'लेने के लिए तैयार',
      previousContract: 'पिछला कॉन्ट्रैक्ट',
      heldByKarwan: 'Karwan के पास है। सपोर्ट से संपर्क करें और हम इसे लौटा देंगे।',
      steps: { releaseFinal: 'विक्रेता को भुगतान करें', refund: 'वापस लें', requestWithdraw: 'निकालें', cancelWithdraw: 'रखें', claim: 'लें' },
      releaseWarning: 'विक्रेता को भुगतान हो जाता है और इसे वापस नहीं किया जा सकता।',
      done: 'हो गया। {amount} USDC।',
      failed: 'यह पूरा नहीं हुआ। कुछ नहीं हिला।',
    },
    profile: { dealGuarantee: 'डील गारंटी', legacyContracts: 'पुराने कॉन्ट्रैक्ट' },
  },
  sw: {
    title: 'Dhamana ya mpango',
    hint: 'Pesa unazotenga kulinda wanunuzi wako. Mipango na malipo ya mapema yanaweza kushikilia sehemu yake hadi yamalizike.',
    signedOut: { tag: 'Dhamana ya mpango', titlePrefix: 'Linda', titleAccent: 'wanunuzi wako', body: 'Tenga pesa kama dhamana ya mpango. Inalinda wanunuzi wako na inaweza kusaidia malipo ya mapema.', buttonLabel: 'Ingia' },
    rows: { inPlace: 'Imewekwa', held: 'Inashikiliwa na mipango', comingBack: 'Inarudi', ready: 'Tayari kuchukuliwa', earns: 'Inapata' },
    earnsValue: 'Kwa kiwango cha USYC, hulipwa na Karwan kwenye testnet',
    comingBackValue: '{amount} USDC tarehe {date}',
    readyValue: '{amount} USDC',
    notAvailable: 'Dhamana ya mpango haipatikani kwa sasa.',
    previous: { line: 'Una {amount} USDC kwenye mkataba uliopita.', link: 'Toa' },
    buttons: { putUp: 'Weka', takeOut: 'Toa', cancel: 'Ghairi kutoa', collect: 'Chukua' },
    amountLabel: 'Kiasi kwa USDC',
    sheets: {
      putUp: { title: 'Weka {amount} USDC', body: 'Inalinda wanunuzi wako na inaweza kusaidia malipo ya mapema. Kurudi huchukua siku {days}.', confirm: 'Weka' },
      takeOut: { title: 'Toa {amount} USDC', body: 'Inarudi tarehe {date}. Wakati inarudi hailindi wanunuzi wako.', restart: 'Hii inaanzisha upya siku {days} kwa {total} USDC zote zinazorudi.', confirm: 'Toa' },
      cancel: { title: 'Baki na {amount} USDC', body: 'Inabaki kwenye dhamana yako na inalinda wanunuzi wako tena.', confirm: 'Baki nayo' },
      collect: { title: 'Chukua {amount} USDC', body: 'Inarudi kwenye salio lako.', confirm: 'Chukua' },
      busy: 'Inaendelea…',
      notNow: 'Si sasa',
    },
    errors: { amount: 'Weka kiasi zaidi ya 0.', overBalance: 'Salio lako ni {amount} USDC.', overFree: 'Unaweza kutoa hadi {amount} USDC sasa.', failed: 'Haikufanikiwa. Hakuna kilichohamishwa.' },
    done: { putUp: 'Dhamana yako ya mpango imewekwa.', takeOut: 'Imeanza. Inarudi tarehe {date}.', cancel: 'Imebaki. Inalinda wanunuzi wako tena.', collect: 'Imechukuliwa. Imerudi kwenye salio lako.' },
    legacy: {
      gate: { tag: 'Mikataba ya zamani', titleBefore: 'Pesa kwenye', titleAccent: 'mikataba ya zamani', body: 'Chochote ulicho nacho kwenye mkataba wa zamani wa Karwan bado ni chako. Ingia ili ukione na ukirudishe.', button: 'Ingia' },
      title: 'Mikataba ya zamani',
      hint: 'Pesa ambazo bado unazo kwenye mikataba ya zamani ya Karwan.',
      empty: 'Hakuna kilichobaki kwenye mikataba ya zamani.',
      loading: 'Inasoma mikataba ya zamani',
      olderDeals: 'Mipango ya zamani',
      guarantees: 'Dhamana kwenye mikataba ya zamani',
      asBuyer: 'Unanunua',
      asSeller: 'Unauza',
      withWho: 'Na {who}',
      funded: 'Pesa ziko kwenye mpango',
      disputed: 'Kwenye mzozo',
      waitingBuyer: 'Inamsubiri mnunuzi',
      inPlace: 'Imewekwa',
      comingBackOn: 'Inarudi tarehe {date}',
      ready: 'Tayari kuchukuliwa',
      previousContract: 'Mkataba uliopita',
      heldByKarwan: 'Inashikiliwa na Karwan. Wasiliana na msaada na tutairudisha.',
      steps: { releaseFinal: 'Mlipe muuzaji', refund: 'Irudishe', requestWithdraw: 'Toa', cancelWithdraw: 'Baki nayo', claim: 'Chukua' },
      releaseWarning: 'Muuzaji analipwa na hili haliwezi kurudishwa nyuma.',
      done: 'Imekamilika. {amount} USDC.',
      failed: 'Haikufanikiwa. Hakuna kilichohamishwa.',
    },
    profile: { dealGuarantee: 'Dhamana ya mpango', legacyContracts: 'Mikataba ya zamani' },
  },
};
