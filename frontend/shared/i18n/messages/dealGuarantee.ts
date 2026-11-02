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
  refresh: string;
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
    refresh: "Refresh status",
    title: 'Deal guarantee',
    hint: 'Money you set aside to protect your buyers. Deals and advances can hold part of it until they finish.',
    signedOut: { tag: 'Deal guarantee', titlePrefix: 'Protect your', titleAccent: 'buyers', body: 'Set money aside as a deal guarantee. It protects your buyers and can back an advance.', buttonLabel: 'Log in' },
    rows: { inPlace: 'In place', held: 'Held by deals', comingBack: "Withdrawal pending", ready: 'Ready to collect', earns: 'Earns' },
    earnsValue: 'At the USYC rate, paid by Karwan on testnet',
    comingBackValue: '{amount} USDC on {date}',
    readyValue: '{amount} USDC',
    notAvailable: 'The deal guarantee is not available right now.',
    previous: { line: 'You have {amount} USDC on the previous contract.', link: 'Withdraw' },
    buttons: { putUp: 'Deposit', takeOut: 'Withdraw', cancel: 'Cancel withdrawal', collect: 'Collect' },
    amountLabel: 'Amount in USDC',
    sheets: {
      putUp: { title: 'Deposit {amount} USDC', body: "This can back your deals and advances. Withdrawal requires a {days}-day waiting period, then collection.", confirm: 'Deposit' },
      takeOut: { title: 'Withdraw {amount} USDC', body: "Available to collect from {date}. You must collect it to return it to your balance. During the waiting period, this amount no longer backs your deals.", restart: 'This restarts the {days} days for all {total} USDC coming back.', confirm: 'Withdraw' },
      cancel: { title: 'Keep {amount} USDC', body: 'It stays in your guarantee and protects your buyers again.', confirm: 'Keep it' },
      collect: { title: 'Collect {amount} USDC', body: 'It goes back to your balance.', confirm: 'Collect' },
      busy: 'Working…',
      notNow: 'Not now',
    },
    errors: { amount: 'Enter an amount above 0.', overBalance: 'Your balance is {amount} USDC.', overFree: "You can request withdrawal of up to {amount} USDC.", failed: "The result could not be confirmed. Refresh your guarantee and check activity before submitting again." },
    done: { putUp: 'Your deal guarantee is in place.', takeOut: "Withdrawal requested. Collect from {date}.", cancel: 'Kept. It protects your buyers again.', collect: 'Collected. It is back in your balance.' },
    legacy: {
      gate: { tag: 'Earlier deals', titleBefore: 'Money from', titleAccent: 'earlier deals', body: 'Anything you still have from an earlier deal on Karwan stays yours. Sign in to see it and get it back.', button: 'Sign in' },
      title: 'Earlier deals',
      hint: 'Money you still have from earlier deals on Karwan.',
      empty: 'Nothing is waiting in earlier deals.',
      loading: 'Looking for earlier deals',
      olderDeals: 'Older deals',
      guarantees: 'Earlier guarantees',
      asBuyer: 'You buy',
      asSeller: 'You sell',
      withWho: 'With {who}',
      funded: 'Money in the deal',
      disputed: 'A problem is open',
      waitingBuyer: 'Waiting for the buyer',
      inPlace: 'In place',
      comingBackOn: "Collect from {date}",
      ready: 'Ready to collect',
      previousContract: 'Earlier guarantee',
      heldByKarwan: 'Held by Karwan. Contact support and we will return it.',
      steps: { releaseFinal: 'Release to the seller', refund: 'Get it back', requestWithdraw: 'Withdraw', cancelWithdraw: 'Keep it', claim: 'Collect' },
      releaseWarning: 'The seller is paid and this cannot be undone.',
      done: 'Done. {amount} USDC.',
      failed: "The result could not be confirmed. Check activity and the current balance before submitting again.",
    },
    profile: { dealGuarantee: 'Deal guarantee', legacyContracts: 'Earlier deals' },
  },
  fr: {
    refresh: "Actualiser le statut",
    title: 'Garantie de transaction',
    hint: 'De l’argent mis de côté pour protéger vos acheteurs. Les accords et les avances peuvent en retenir une partie jusqu’à leur fin.',
    signedOut: { tag: 'Garantie de transaction', titlePrefix: 'Protégez vos', titleAccent: 'acheteurs', body: 'Mettez de l’argent de côté comme garantie de transaction. Elle protège vos acheteurs et peut soutenir une avance.', buttonLabel: 'Se connecter' },
    rows: { inPlace: 'En place', held: 'Retenu par des accords', comingBack: "Retrait en attente", ready: 'Prêt à récupérer', earns: 'Rapporte' },
    earnsValue: 'Au taux USYC, versé par Karwan sur le testnet',
    comingBackValue: '{amount} USDC le {date}',
    readyValue: '{amount} USDC',
    notAvailable: 'La garantie de transaction n’est pas disponible pour le moment.',
    previous: { line: 'Vous avez {amount} USDC sur le contrat précédent.', link: 'Retirer' },
    buttons: { putUp: 'Déposer', takeOut: 'Retirer', cancel: 'Annuler le retrait', collect: 'Récupérer' },
    amountLabel: 'Montant en USDC',
    sheets: {
      putUp: { title: 'Déposer {amount} USDC', body: "Ce montant peut soutenir vos transactions et avances. Le retrait exige un délai de {days} jours, puis une récupération.", confirm: 'Déposer' },
      takeOut: { title: 'Retirer {amount} USDC', body: "Disponible à récupérer à partir du {date}. Vous devez le récupérer pour le remettre sur votre solde. Pendant le délai, ce montant ne soutient plus vos transactions.", restart: 'Cela relance les {days} jours pour les {total} USDC en retour.', confirm: 'Retirer' },
      cancel: { title: 'Garder {amount} USDC', body: 'L’argent reste dans votre garantie et protège de nouveau vos acheteurs.', confirm: 'Garder' },
      collect: { title: 'Récupérer {amount} USDC', body: 'L’argent revient sur votre solde.', confirm: 'Récupérer' },
      busy: 'En cours…',
      notNow: 'Pas maintenant',
    },
    errors: { amount: 'Saisissez un montant supérieur à 0.', overBalance: 'Votre solde est de {amount} USDC.', overFree: "Vous pouvez demander le retrait de {amount} USDC au maximum.", failed: "Le résultat n’a pas pu être confirmé. Actualisez votre garantie et vérifiez l’activité avant de soumettre à nouveau." },
    done: { putUp: 'Votre garantie de transaction est en place.', takeOut: "Retrait demandé. Récupérez à partir du {date}.", cancel: 'Gardé. Il protège de nouveau vos acheteurs.', collect: 'Récupéré. L’argent est de retour sur votre solde.' },
    legacy: {
      gate: { tag: 'Accords précédents', titleBefore: 'L’argent de', titleAccent: 'vos accords précédents', body: 'Ce que vous avez encore d’un accord précédent sur Karwan vous appartient. Connectez-vous pour le voir et le récupérer.', button: 'Se connecter' },
      title: 'Accords précédents',
      hint: 'L’argent que vous avez encore dans des transactions antérieures sur Karwan.',
      empty: 'Rien n’attend dans les transactions antérieures.',
      loading: 'Recherche des transactions antérieures',
      olderDeals: 'Anciens accords',
      guarantees: 'Garanties antérieures',
      asBuyer: 'Vous achetez',
      asSeller: 'Vous vendez',
      withWho: 'Avec {who}',
      funded: 'Argent dans l’accord',
      disputed: 'Un problème est ouvert',
      waitingBuyer: 'En attente de l’acheteur',
      inPlace: 'En place',
      comingBackOn: "À récupérer à partir du {date}",
      ready: 'Prêt à récupérer',
      previousContract: 'Garantie antérieure',
      heldByKarwan: 'Détenu par Karwan. Contactez le support et nous vous le rendrons.',
      steps: { releaseFinal: 'Payer le vendeur', refund: 'Le récupérer', requestWithdraw: 'Retirer', cancelWithdraw: 'Garder', claim: 'Récupérer' },
      releaseWarning: 'Le vendeur est payé, et cela ne peut pas être annulé.',
      done: 'C’est fait. {amount} USDC.',
      failed: "Le résultat n’a pas pu être confirmé. Vérifiez l’activité et le solde actuel avant de soumettre à nouveau.",
    },
    profile: { dealGuarantee: 'Garantie de transaction', legacyContracts: 'Accords précédents' },
  },
  ar: {
    refresh: "تحديث الحالة",
    title: 'ضمان الصفقة',
    hint: 'مال تخصصه لحماية المشترين منك. يمكن للصفقات والسلف أن تحجز جزءا منه حتى تنتهي.',
    signedOut: { tag: 'ضمان الصفقة', titlePrefix: 'احمِ', titleAccent: 'المشترين منك', body: 'خصص مالا كضمان للصفقة. يحمي المشترين منك ويمكن أن يدعم سلفة.', buttonLabel: 'تسجيل الدخول' },
    rows: { inPlace: 'قائم', held: 'محجوز للصفقات', comingBack: "السحب قيد الانتظار", ready: 'جاهز للاستلام', earns: 'العائد' },
    earnsValue: 'بمعدل USYC، تدفعه Karwan على الشبكة التجريبية',
    comingBackValue: '{amount} USDC في {date}',
    readyValue: '{amount} USDC',
    notAvailable: 'ضمان الصفقة غير متاح الآن.',
    previous: { line: 'لديك {amount} USDC على العقد السابق.', link: 'اسحبه' },
    buttons: { putUp: 'إيداع', takeOut: 'سحب', cancel: 'إلغاء السحب', collect: 'استلام' },
    amountLabel: 'المبلغ بعملة USDC',
    sheets: {
      putUp: { title: 'إيداع {amount} USDC', body: "يمكن لهذا المبلغ دعم صفقاتك والسلف. يتطلب السحب انتظار {days} أيام، ثم تحصيل المبلغ.", confirm: 'إيداع' },
      takeOut: { title: 'سحب {amount} USDC', body: "متاح للتحصيل من {date}. يجب تحصيله لإعادته إلى رصيدك. خلال الانتظار، لا يعود هذا المبلغ داعمًا لصفقاتك.", restart: 'هذا يعيد بدء الأيام الـ {days} لكامل {total} USDC العائدة.', confirm: 'سحب' },
      cancel: { title: 'الإبقاء على {amount} USDC', body: 'يبقى في ضمانك ويحمي المشترين منك من جديد.', confirm: 'أبقِه' },
      collect: { title: 'استلام {amount} USDC', body: 'يعود إلى رصيدك.', confirm: 'استلام' },
      busy: 'جارٍ التنفيذ…',
      notNow: 'ليس الآن',
    },
    errors: { amount: 'أدخل مبلغا أكبر من 0.', overBalance: 'رصيدك {amount} USDC.', overFree: "يمكنك طلب سحب ما يصل إلى {amount} USDC.", failed: "تعذر تأكيد النتيجة. حدّث الضمان وتحقق من النشاط قبل تقديم الطلب مجددًا." },
    done: { putUp: 'ضمان صفقتك قائم.', takeOut: "تم طلب السحب. حصّل المبلغ من {date}.", cancel: 'تم الإبقاء عليه. يحمي المشترين منك من جديد.', collect: 'تم الاستلام. عاد إلى رصيدك.' },
    legacy: {
      gate: { tag: 'الصفقات السابقة', titleBefore: 'مالك من', titleAccent: 'الصفقات السابقة', body: 'ما زال لك كل ما لديك من صفقة سابقة على Karwan. سجّل الدخول لتراه وتسترده.', button: 'تسجيل الدخول' },
      title: 'الصفقات السابقة',
      hint: 'المال الذي ما زال لك من صفقات سابقة على كاروان.',
      empty: 'لا شيء ينتظر في الصفقات السابقة.',
      loading: 'جارٍ البحث عن الصفقات السابقة',
      olderDeals: 'صفقات سابقة',
      guarantees: 'ضمانات سابقة',
      asBuyer: 'أنت تشتري',
      asSeller: 'أنت تبيع',
      withWho: 'مع {who}',
      funded: 'المال في الصفقة',
      disputed: 'هناك مشكلة مفتوحة',
      waitingBuyer: 'بانتظار المشتري',
      inPlace: 'قائم',
      comingBackOn: "متاح للتحصيل من {date}",
      ready: 'جاهز للاستلام',
      previousContract: 'الضمان السابق',
      heldByKarwan: 'تحتفظ به Karwan. تواصل مع الدعم وسنعيده إليك.',
      steps: { releaseFinal: 'الدفع للبائع', refund: 'استرداده', requestWithdraw: 'سحب', cancelWithdraw: 'أبقِه', claim: 'استلام' },
      releaseWarning: 'يُدفع للبائع ولا يمكن التراجع عن ذلك.',
      done: 'تم. {amount} USDC.',
      failed: "تعذر تأكيد النتيجة. تحقق من النشاط والرصيد الحالي قبل تقديم الطلب مجددًا.",
    },
    profile: { dealGuarantee: 'ضمان الصفقة', legacyContracts: 'الصفقات السابقة' },
  },
  hi: {
    refresh: "स्थिति रीफ़्रेश करें",
    title: 'डील गारंटी',
    hint: 'आपके खरीदारों की सुरक्षा के लिए अलग रखा गया पैसा। डील और एडवांस इसका एक हिस्सा अपने पूरा होने तक रोक सकते हैं।',
    signedOut: { tag: 'डील गारंटी', titlePrefix: 'अपने खरीदारों को', titleAccent: 'सुरक्षित रखें', body: 'डील गारंटी के रूप में पैसा अलग रखें। यह आपके खरीदारों की रक्षा करता है और एडवांस का सहारा बन सकता है।', buttonLabel: 'लॉग इन करें' },
    rows: { inPlace: 'लगा हुआ', held: 'डील में रुका', comingBack: "निकासी लंबित", ready: 'लेने के लिए तैयार', earns: 'कमाई' },
    earnsValue: 'USYC दर पर, टेस्टनेट पर Karwan द्वारा दिया जाता है',
    comingBackValue: '{date} को {amount} USDC',
    readyValue: '{amount} USDC',
    notAvailable: 'डील गारंटी अभी उपलब्ध नहीं है।',
    previous: { line: 'पिछले कॉन्ट्रैक्ट पर आपके {amount} USDC हैं।', link: 'निकालें' },
    buttons: { putUp: 'जमा करें', takeOut: 'निकालें', cancel: 'निकालना रद्द करें', collect: 'लें' },
    amountLabel: 'USDC में राशि',
    sheets: {
      putUp: { title: '{amount} USDC जमा करें', body: "यह आपके सौदों और अग्रिमों के लिए गारंटी हो सकती है। निकासी के लिए {days} दिनों का इंतज़ार करना होगा, फिर राशि प्राप्त करनी होगी।", confirm: 'जमा करें' },
      takeOut: { title: '{amount} USDC निकालें', body: "{date} से प्राप्त कर सकते हैं। राशि शेष में वापस लाने के लिए उसे प्राप्त करना होगा। इंतज़ार के दौरान यह राशि आपके सौदों की गारंटी नहीं रहती।", restart: 'इससे वापस आ रहे सभी {total} USDC के लिए {days} दिन फिर से शुरू होते हैं।', confirm: 'निकालें' },
      cancel: { title: '{amount} USDC रखें', body: 'यह आपकी गारंटी में रहता है और फिर से आपके खरीदारों की रक्षा करता है।', confirm: 'रखें' },
      collect: { title: '{amount} USDC लें', body: 'यह आपके बैलेंस में वापस जाता है।', confirm: 'लें' },
      busy: 'हो रहा है…',
      notNow: 'अभी नहीं',
    },
    errors: { amount: '0 से अधिक राशि डालें।', overBalance: 'आपका बैलेंस {amount} USDC है।', overFree: "आप अधिकतम {amount} USDC की निकासी का अनुरोध कर सकते हैं।", failed: "परिणाम की पुष्टि नहीं हो सकी। दोबारा अनुरोध करने से पहले गारंटी रीफ़्रेश करें और गतिविधि जाँचें।" },
    done: { putUp: 'आपकी डील गारंटी लग गई है।', takeOut: "निकासी का अनुरोध भेजा गया। {date} से राशि प्राप्त करें।", cancel: 'रखा गया। यह फिर से आपके खरीदारों की रक्षा करता है।', collect: 'मिल गया। यह आपके बैलेंस में वापस है।' },
    legacy: {
      gate: { tag: 'पिछले सौदे', titleBefore: 'पैसा', titleAccent: 'पिछले सौदों से', body: 'Karwan पर पिछले सौदों से जो भी बचा है, वह आपका ही है। उसे देखने और वापस पाने के लिए साइन इन करें।', button: 'साइन इन करें' },
      title: 'पिछले सौदे',
      hint: 'Karwan पर पिछली डील में अभी भी आपका पैसा।',
      empty: 'पिछली डील में कुछ भी बाकी नहीं है।',
      loading: 'पिछली डील ढूँढी जा रही हैं',
      olderDeals: 'पुरानी डील',
      guarantees: 'पिछली गारंटी',
      asBuyer: 'आप खरीद रहे हैं',
      asSeller: 'आप बेच रहे हैं',
      withWho: '{who} के साथ',
      funded: 'डील में पैसा',
      disputed: 'एक समस्या खुली है',
      waitingBuyer: 'खरीदार की प्रतीक्षा',
      inPlace: 'लगा हुआ',
      comingBackOn: "{date} से प्राप्त करें",
      ready: 'लेने के लिए तैयार',
      previousContract: 'पिछली गारंटी',
      heldByKarwan: 'Karwan के पास है। सपोर्ट से संपर्क करें और हम इसे लौटा देंगे।',
      steps: { releaseFinal: 'विक्रेता को भुगतान करें', refund: 'वापस लें', requestWithdraw: 'निकालें', cancelWithdraw: 'रखें', claim: 'लें' },
      releaseWarning: 'विक्रेता को भुगतान हो जाता है और इसे वापस नहीं किया जा सकता।',
      done: 'हो गया। {amount} USDC।',
      failed: "परिणाम की पुष्टि नहीं हो सकी। दोबारा अनुरोध करने से पहले गतिविधि और वर्तमान शेष जाँचें।",
    },
    profile: { dealGuarantee: 'डील गारंटी', legacyContracts: 'पिछले सौदे' },
  },
  sw: {
    refresh: "Onyesha hali upya",
    title: 'Dhamana ya mpango',
    hint: 'Pesa unazotenga kulinda wanunuzi wako. Mipango na malipo ya mapema yanaweza kushikilia sehemu yake hadi yamalizike.',
    signedOut: { tag: 'Dhamana ya mpango', titlePrefix: 'Linda', titleAccent: 'wanunuzi wako', body: 'Tenga pesa kama dhamana ya mpango. Inalinda wanunuzi wako na inaweza kusaidia malipo ya mapema.', buttonLabel: 'Ingia' },
    rows: { inPlace: 'Imewekwa', held: 'Inashikiliwa na mipango', comingBack: "Utoaji unasubiri", ready: 'Tayari kuchukuliwa', earns: 'Inapata' },
    earnsValue: 'Kwa kiwango cha USYC, hulipwa na Karwan kwenye testnet',
    comingBackValue: '{amount} USDC tarehe {date}',
    readyValue: '{amount} USDC',
    notAvailable: 'Dhamana ya mpango haipatikani kwa sasa.',
    previous: { line: 'Una {amount} USDC kwenye mkataba uliopita.', link: 'Toa' },
    buttons: { putUp: 'Weka', takeOut: 'Toa', cancel: 'Ghairi kutoa', collect: 'Chukua' },
    amountLabel: 'Kiasi kwa USDC',
    sheets: {
      putUp: { title: 'Weka {amount} USDC', body: "Kiasi hiki kinaweza kuwa dhamana ya mikataba na malipo ya mapema. Utoaji unahitaji kusubiri siku {days}, kisha kukusanya fedha.", confirm: 'Weka' },
      takeOut: { title: 'Toa {amount} USDC', body: "Unaweza kukusanya kuanzia {date}. Lazima uzikusanye ili zirudi kwenye salio. Wakati wa kusubiri, kiasi hiki hakitumiki kama dhamana ya mikataba yako.", restart: 'Hii inaanzisha upya siku {days} kwa {total} USDC zote zinazorudi.', confirm: 'Toa' },
      cancel: { title: 'Baki na {amount} USDC', body: 'Inabaki kwenye dhamana yako na inalinda wanunuzi wako tena.', confirm: 'Baki nayo' },
      collect: { title: 'Chukua {amount} USDC', body: 'Inarudi kwenye salio lako.', confirm: 'Chukua' },
      busy: 'Inaendelea…',
      notNow: 'Si sasa',
    },
    errors: { amount: 'Weka kiasi zaidi ya 0.', overBalance: 'Salio lako ni {amount} USDC.', overFree: "Unaweza kuomba kutoa hadi {amount} USDC.", failed: "Matokeo hayakuweza kuthibitishwa. Onyesha dhamana upya na uangalie shughuli kabla ya kuwasilisha tena." },
    done: { putUp: 'Dhamana yako ya mpango imewekwa.', takeOut: "Utoaji umeombwa. Kusanya kuanzia {date}.", cancel: 'Imebaki. Inalinda wanunuzi wako tena.', collect: 'Imechukuliwa. Imerudi kwenye salio lako.' },
    legacy: {
      gate: { tag: 'Mikataba ya awali', titleBefore: 'Pesa kutoka', titleAccent: 'mikataba ya awali', body: 'Chochote ulicho nacho kutoka mkataba wa awali kwenye Karwan bado ni chako. Ingia ili ukione na ukirudishe.', button: 'Ingia' },
      title: 'Mikataba ya awali',
      hint: 'Pesa ambazo bado unazo kutoka mipango ya awali kwenye Karwan.',
      empty: 'Hakuna kinachosubiri kwenye mipango ya awali.',
      loading: 'Inatafuta mipango ya awali',
      olderDeals: 'Mipango ya zamani',
      guarantees: 'Dhamana za awali',
      asBuyer: 'Unanunua',
      asSeller: 'Unauza',
      withWho: 'Na {who}',
      funded: 'Pesa ziko kwenye mpango',
      disputed: 'Kuna tatizo lililo wazi',
      waitingBuyer: 'Inamsubiri mnunuzi',
      inPlace: 'Imewekwa',
      comingBackOn: "Kusanya kuanzia {date}",
      ready: 'Tayari kuchukuliwa',
      previousContract: 'Dhamana ya awali',
      heldByKarwan: 'Inashikiliwa na Karwan. Wasiliana na msaada na tutairudisha.',
      steps: { releaseFinal: 'Mlipe muuzaji', refund: 'Irudishe', requestWithdraw: 'Toa', cancelWithdraw: 'Baki nayo', claim: 'Chukua' },
      releaseWarning: 'Muuzaji analipwa na hili haliwezi kurudishwa nyuma.',
      done: 'Imekamilika. {amount} USDC.',
      failed: "Matokeo hayakuweza kuthibitishwa. Angalia shughuli na salio la sasa kabla ya kuwasilisha tena.",
    },
    profile: { dealGuarantee: 'Dhamana ya mpango', legacyContracts: 'Mikataba ya awali' },
  },
};
