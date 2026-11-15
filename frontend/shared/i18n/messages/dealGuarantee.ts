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
  /// The buyer's ask on a deal and the seller's answer (view 82).
  ask: {
    label: string;
    hintBuyer: string;
    from: string;
    term: string;
    asked: string;
    backed: string;
    hintSeller: string;
    back: string;
    confirmSeller: string;
    short: string;
  };
}

export const dealGuaranteeCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', DealGuaranteeCopy> = {
  en: {
    refresh: "Refresh status",
    title: 'Savings pocket',
    hint: 'Money you keep aside. It earns while it sits, and a buyer can ask you to back a deal with part of it until the deal ends.',
    signedOut: { tag: 'Savings pocket', titlePrefix: 'Protect your', titleAccent: 'buyers', body: 'Keep money aside in your savings pocket. It earns while it sits and can back your deals.', buttonLabel: 'Log in' },
    rows: { inPlace: 'In place', held: 'Held by deals', comingBack: "Withdrawal pending", ready: 'Ready to collect', earns: 'Earns' },
    earnsValue: 'At the US Treasury bill rate, paid by Karwan on testnet',
    comingBackValue: '{amount} USDC on {date}',
    readyValue: '{amount} USDC',
    notAvailable: 'The savings pocket is not available right now.',
    previous: { line: 'You have {amount} USDC on the previous contract.', link: 'Withdraw' },
    buttons: { putUp: 'Add to pocket', takeOut: 'Take out', cancel: 'Cancel withdrawal', collect: 'Collect' },
    amountLabel: 'Amount in USDC',
    sheets: {
      putUp: { title: 'Add {amount} USDC to your pocket', body: "This can back your deals and advances. Withdrawal requires a {days}-day waiting period, then collection.", confirm: 'Add' },
      takeOut: { title: 'Withdraw {amount} USDC', body: "Available to collect from {date}. You must collect it to return it to your balance. During the waiting period, this amount no longer backs your deals.", restart: 'This restarts the {days} days for all {total} USDC coming back.', confirm: 'Take out' },
      cancel: { title: 'Keep {amount} USDC', body: 'It stays in your savings pocket and can back your deals again.', confirm: 'Keep it' },
      collect: { title: 'Collect {amount} USDC', body: 'It goes back to your balance.', confirm: 'Collect' },
      busy: 'Working…',
      notNow: 'Not now',
    },
    errors: { amount: 'Enter an amount above 0.', overBalance: 'Your balance is {amount} USDC.', overFree: "You can request withdrawal of up to {amount} USDC.", failed: 'The result could not be confirmed. Refresh your savings pocket and check activity before submitting again.' },
    done: { putUp: 'Added to your savings pocket.', takeOut: "Withdrawal requested. Collect from {date}.", cancel: 'Kept. It can back your deals again.', collect: 'Collected. It is back in your balance.' },
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
    profile: { dealGuarantee: 'Savings pocket', legacyContracts: 'Earlier deals' },
    ask: {
      label: 'Ask for a deal guarantee',
      hintBuyer: 'A deal guarantee comes only from the seller’s savings pocket. If the deal goes wrong and the ruling is yours, you can be paid from it.',
      from: '{amount} from {name}’s savings pocket',
      term: 'Deal guarantee',
      asked: '{amount} · asked',
      backed: '{amount} · backed',
      hintSeller: 'A deal guarantee can only come from your savings pocket. It stays yours and keeps earning, and it frees when the deal ends well.',
      back: 'Back it from my pocket',
      confirmSeller: 'You agree to the deal and back a {amount} deal guarantee from your savings pocket. It frees when the deal ends well.',
      short: 'Your savings pocket is {amount} short for this deal guarantee. Add it in Profile, Savings pocket, then try again.',
    },
  },
  fr: {
    refresh: "Actualiser le statut",
    title: 'Poche d’épargne',
    hint: 'L’argent que vous mettez de côté. Il rapporte pendant qu’il attend, et un acheteur peut vous demander d’en garder une partie pour couvrir un accord jusqu’à sa fin.',
    signedOut: { tag: 'Poche d’épargne', titlePrefix: 'Protégez vos', titleAccent: 'acheteurs', body: 'Mettez de l’argent de côté dans votre poche d’épargne. Il rapporte pendant qu’il attend et peut couvrir vos accords.', buttonLabel: 'Se connecter' },
    rows: { inPlace: 'En place', held: 'Retenu par des accords', comingBack: "Retrait en attente", ready: 'Prêt à récupérer', earns: 'Rapporte' },
    earnsValue: 'Au taux des bons du Trésor américain, versé par Karwan sur le réseau de test',
    comingBackValue: '{amount} USDC le {date}',
    readyValue: '{amount} USDC',
    notAvailable: 'La poche d’épargne n’est pas disponible pour le moment.',
    previous: { line: 'Vous avez {amount} USDC sur le contrat précédent.', link: 'Retirer' },
    buttons: { putUp: 'Ajouter à la poche', takeOut: 'Retirer', cancel: 'Annuler le retrait', collect: 'Récupérer' },
    amountLabel: 'Montant en USDC',
    sheets: {
      putUp: { title: 'Ajouter {amount} USDC à votre poche', body: "Ce montant peut soutenir vos transactions et avances. Le retrait exige un délai de {days} jours, puis une récupération.", confirm: 'Ajouter' },
      takeOut: { title: 'Retirer {amount} USDC', body: "Disponible à récupérer à partir du {date}. Vous devez le récupérer pour le remettre sur votre solde. Pendant le délai, ce montant ne soutient plus vos transactions.", restart: 'Cela relance les {days} jours pour les {total} USDC en retour.', confirm: 'Retirer' },
      cancel: { title: 'Garder {amount} USDC', body: 'L’argent reste dans votre poche d’épargne et peut de nouveau couvrir vos accords.', confirm: 'Garder' },
      collect: { title: 'Récupérer {amount} USDC', body: 'L’argent revient sur votre solde.', confirm: 'Récupérer' },
      busy: 'En cours…',
      notNow: 'Pas maintenant',
    },
    errors: { amount: 'Saisissez un montant supérieur à 0.', overBalance: 'Votre solde est de {amount} USDC.', overFree: "Vous pouvez demander le retrait de {amount} USDC au maximum.", failed: 'Le résultat n’a pas pu être confirmé. Actualisez votre poche d’épargne et vérifiez l’activité avant de soumettre à nouveau.' },
    done: { putUp: 'Ajouté à votre poche d’épargne.', takeOut: "Retrait demandé. Récupérez à partir du {date}.", cancel: 'Gardé. Il peut de nouveau couvrir vos accords.', collect: 'Récupéré. L’argent est de retour sur votre solde.' },
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
    profile: { dealGuarantee: 'Poche d’épargne', legacyContracts: 'Accords précédents' },
    ask: {
      label: 'Demander une garantie de transaction',
      hintBuyer: 'Une garantie de transaction vient uniquement de la poche d’épargne du vendeur. Si l’accord tourne mal et que la décision vous est favorable, vous pouvez être payé avec.',
      from: '{amount} de la poche d’épargne de {name}',
      term: 'Garantie de transaction',
      asked: '{amount} · demandée',
      backed: '{amount} · couverte',
      hintSeller: 'Une garantie de transaction ne peut venir que de votre poche d’épargne. Elle reste à vous et continue de rapporter, et elle est libérée quand l’accord se termine bien.',
      back: 'La couvrir avec ma poche',
      confirmSeller: 'Vous acceptez l’accord et couvrez une garantie de transaction de {amount} avec votre poche d’épargne. Elle est libérée quand l’accord se termine bien.',
      short: 'Il manque {amount} dans votre poche d’épargne pour cette garantie. Ajoutez-les dans Profil, Poche d’épargne, puis réessayez.',
    },
  },
  ar: {
    refresh: "تحديث الحالة",
    title: 'جيب الادخار',
    hint: 'مال تضعه جانبًا. يربح وهو ينتظر، ويمكن للمشتري أن يطلب منك ضمان صفقة بجزء منه حتى تنتهي الصفقة.',
    signedOut: { tag: 'جيب الادخار', titlePrefix: 'احمِ', titleAccent: 'المشترين منك', body: 'ضع مالًا جانبًا في جيب الادخار. يربح وهو ينتظر ويمكن أن يضمن صفقاتك.', buttonLabel: 'تسجيل الدخول' },
    rows: { inPlace: 'قائم', held: 'محجوز للصفقات', comingBack: "السحب قيد الانتظار", ready: 'جاهز للاستلام', earns: 'العائد' },
    earnsValue: 'بسعر سندات الخزانة الأمريكية، تدفعه Karwan على الشبكة التجريبية',
    comingBackValue: '{amount} USDC في {date}',
    readyValue: '{amount} USDC',
    notAvailable: 'جيب الادخار غير متاح الآن.',
    previous: { line: 'لديك {amount} USDC على العقد السابق.', link: 'اسحبه' },
    buttons: { putUp: 'أضف إلى الجيب', takeOut: 'اسحب', cancel: 'إلغاء السحب', collect: 'استلام' },
    amountLabel: 'المبلغ بعملة USDC',
    sheets: {
      putUp: { title: 'أضف {amount} USDC إلى جيبك', body: "يمكن لهذا المبلغ دعم صفقاتك والسلف. يتطلب السحب انتظار {days} أيام، ثم تحصيل المبلغ.", confirm: 'أضف' },
      takeOut: { title: 'سحب {amount} USDC', body: "متاح للتحصيل من {date}. يجب تحصيله لإعادته إلى رصيدك. خلال الانتظار، لا يعود هذا المبلغ داعمًا لصفقاتك.", restart: 'هذا يعيد بدء الأيام الـ {days} لكامل {total} USDC العائدة.', confirm: 'اسحب' },
      cancel: { title: 'الإبقاء على {amount} USDC', body: 'يبقى في جيب الادخار ويمكن أن يضمن صفقاتك من جديد.', confirm: 'أبقِه' },
      collect: { title: 'استلام {amount} USDC', body: 'يعود إلى رصيدك.', confirm: 'استلام' },
      busy: 'جارٍ التنفيذ…',
      notNow: 'ليس الآن',
    },
    errors: { amount: 'أدخل مبلغا أكبر من 0.', overBalance: 'رصيدك {amount} USDC.', overFree: "يمكنك طلب سحب ما يصل إلى {amount} USDC.", failed: 'تعذر تأكيد النتيجة. حدّث جيب الادخار وتحقق من النشاط قبل تقديم الطلب مجددًا.' },
    done: { putUp: 'أُضيف إلى جيب الادخار.', takeOut: "تم طلب السحب. حصّل المبلغ من {date}.", cancel: 'تم الإبقاء عليه. يمكن أن يضمن صفقاتك من جديد.', collect: 'تم الاستلام. عاد إلى رصيدك.' },
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
    profile: { dealGuarantee: 'جيب الادخار', legacyContracts: 'الصفقات السابقة' },
    ask: {
      label: 'اطلب ضمان صفقة',
      hintBuyer: 'ضمان الصفقة يأتي فقط من جيب الادخار لدى البائع. إذا ساءت الصفقة وجاء الحكم لصالحك، يمكن أن يُدفع لك منه.',
      from: '{amount} من جيب الادخار لدى {name}',
      term: 'ضمان الصفقة',
      asked: '{amount} · مطلوب',
      backed: '{amount} · مضمون',
      hintSeller: 'ضمان الصفقة لا يأتي إلا من جيب الادخار لديك. يبقى لك ويستمر في الربح، ويُحرَّر عندما تنتهي الصفقة جيدًا.',
      back: 'اضمنه من جيبي',
      confirmSeller: 'توافق على الصفقة وتضمن ضمان صفقة بقيمة {amount} من جيب الادخار. يُحرَّر عندما تنتهي الصفقة جيدًا.',
      short: 'ينقص جيب الادخار {amount} لهذا الضمان. أضفه من الملف الشخصي، جيب الادخار، ثم حاول مجددًا.',
    },
  },
  hi: {
    refresh: "स्थिति रीफ़्रेश करें",
    title: 'बचत पॉकेट',
    hint: 'अलग रखा आपका पैसा। रखे रहने पर यह कमाता है, और कोई खरीदार आपसे सौदा खत्म होने तक इसके एक हिस्से से सौदे को सहारा देने को कह सकता है।',
    signedOut: { tag: 'बचत पॉकेट', titlePrefix: 'अपने खरीदारों को', titleAccent: 'सुरक्षित रखें', body: 'अपनी बचत पॉकेट में पैसा अलग रखें। रखे रहने पर यह कमाता है और आपके सौदों को सहारा दे सकता है।', buttonLabel: 'लॉग इन करें' },
    rows: { inPlace: 'लगा हुआ', held: 'डील में रुका', comingBack: "निकासी लंबित", ready: 'लेने के लिए तैयार', earns: 'कमाई' },
    earnsValue: 'अमेरिकी ट्रेज़री बिल की दर पर, टेस्टनेट पर Karwan द्वारा दिया जाता है',
    comingBackValue: '{date} को {amount} USDC',
    readyValue: '{amount} USDC',
    notAvailable: 'बचत पॉकेट अभी उपलब्ध नहीं है।',
    previous: { line: 'पिछले कॉन्ट्रैक्ट पर आपके {amount} USDC हैं।', link: 'निकालें' },
    buttons: { putUp: 'पॉकेट में जोड़ें', takeOut: 'निकालें', cancel: 'निकालना रद्द करें', collect: 'लें' },
    amountLabel: 'USDC में राशि',
    sheets: {
      putUp: { title: 'अपनी पॉकेट में {amount} USDC जोड़ें', body: "यह आपके सौदों और अग्रिमों के लिए गारंटी हो सकती है। निकासी के लिए {days} दिनों का इंतज़ार करना होगा, फिर राशि प्राप्त करनी होगी।", confirm: 'जोड़ें' },
      takeOut: { title: '{amount} USDC निकालें', body: "{date} से प्राप्त कर सकते हैं। राशि शेष में वापस लाने के लिए उसे प्राप्त करना होगा। इंतज़ार के दौरान यह राशि आपके सौदों की गारंटी नहीं रहती।", restart: 'इससे वापस आ रहे सभी {total} USDC के लिए {days} दिन फिर से शुरू होते हैं।', confirm: 'निकालें' },
      cancel: { title: '{amount} USDC रखें', body: 'यह आपकी बचत पॉकेट में रहता है और फिर से आपके सौदों को सहारा दे सकता है।', confirm: 'रखें' },
      collect: { title: '{amount} USDC लें', body: 'यह आपके बैलेंस में वापस जाता है।', confirm: 'लें' },
      busy: 'हो रहा है…',
      notNow: 'अभी नहीं',
    },
    errors: { amount: '0 से अधिक राशि डालें।', overBalance: 'आपका बैलेंस {amount} USDC है।', overFree: "आप अधिकतम {amount} USDC की निकासी का अनुरोध कर सकते हैं।", failed: 'परिणाम की पुष्टि नहीं हो सकी। दोबारा भेजने से पहले अपनी बचत पॉकेट रीफ़्रेश करें और गतिविधि देखें।' },
    done: { putUp: 'आपकी बचत पॉकेट में जोड़ा गया।', takeOut: "निकासी का अनुरोध भेजा गया। {date} से राशि प्राप्त करें।", cancel: 'रखा गया। यह फिर से आपके सौदों को सहारा दे सकता है।', collect: 'मिल गया। यह आपके बैलेंस में वापस है।' },
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
    profile: { dealGuarantee: 'बचत पॉकेट', legacyContracts: 'पिछले सौदे' },
    ask: {
      label: 'सौदा गारंटी माँगें',
      hintBuyer: 'सौदा गारंटी सिर्फ़ विक्रेता की बचत पॉकेट से आती है। अगर सौदा बिगड़े और फ़ैसला आपके पक्ष में हो, तो आपको इससे भुगतान हो सकता है।',
      from: '{name} की बचत पॉकेट से {amount}',
      term: 'सौदा गारंटी',
      asked: '{amount} · माँगी गई',
      backed: '{amount} · दी गई',
      hintSeller: 'सौदा गारंटी सिर्फ़ आपकी बचत पॉकेट से आ सकती है। यह आपकी रहती है और कमाती रहती है, और सौदा ठीक से खत्म होने पर खाली हो जाती है।',
      back: 'मेरी पॉकेट से दें',
      confirmSeller: 'आप सौदे पर सहमत होते हैं और अपनी बचत पॉकेट से {amount} की सौदा गारंटी देते हैं। सौदा ठीक से खत्म होने पर यह खाली हो जाती है।',
      short: 'इस गारंटी के लिए आपकी बचत पॉकेट में {amount} कम है। इसे प्रोफ़ाइल, बचत पॉकेट में जोड़ें, फिर दोबारा कोशिश करें।',
    },
  },
  sw: {
    refresh: "Onyesha hali upya",
    title: 'Mfuko wa akiba',
    hint: 'Pesa unazoweka kando. Zinapata faida zikiwa zimekaa, na mnunuzi anaweza kukuomba udhamini mkataba kwa sehemu yake hadi mkataba uishe.',
    signedOut: { tag: 'Mfuko wa akiba', titlePrefix: 'Linda', titleAccent: 'wanunuzi wako', body: 'Weka pesa kando kwenye mfuko wako wa akiba. Zinapata faida zikiwa zimekaa na zinaweza kudhamini mikataba yako.', buttonLabel: 'Ingia' },
    rows: { inPlace: 'Imewekwa', held: 'Inashikiliwa na mipango', comingBack: "Utoaji unasubiri", ready: 'Tayari kuchukuliwa', earns: 'Inapata' },
    earnsValue: 'Kwa kiwango cha hati za Hazina ya Marekani, hulipwa na Karwan kwenye mtandao wa majaribio',
    comingBackValue: '{amount} USDC tarehe {date}',
    readyValue: '{amount} USDC',
    notAvailable: 'Mfuko wa akiba haupatikani kwa sasa.',
    previous: { line: 'Una {amount} USDC kwenye mkataba uliopita.', link: 'Toa' },
    buttons: { putUp: 'Ongeza kwenye mfuko', takeOut: 'Toa', cancel: 'Ghairi kutoa', collect: 'Chukua' },
    amountLabel: 'Kiasi kwa USDC',
    sheets: {
      putUp: { title: 'Ongeza USDC {amount} kwenye mfuko wako', body: "Kiasi hiki kinaweza kuwa dhamana ya mikataba na malipo ya mapema. Utoaji unahitaji kusubiri siku {days}, kisha kukusanya fedha.", confirm: 'Ongeza' },
      takeOut: { title: 'Toa {amount} USDC', body: "Unaweza kukusanya kuanzia {date}. Lazima uzikusanye ili zirudi kwenye salio. Wakati wa kusubiri, kiasi hiki hakitumiki kama dhamana ya mikataba yako.", restart: 'Hii inaanzisha upya siku {days} kwa {total} USDC zote zinazorudi.', confirm: 'Toa' },
      cancel: { title: 'Baki na {amount} USDC', body: 'Zinabaki kwenye mfuko wako wa akiba na zinaweza kudhamini mikataba yako tena.', confirm: 'Baki nayo' },
      collect: { title: 'Chukua {amount} USDC', body: 'Inarudi kwenye salio lako.', confirm: 'Chukua' },
      busy: 'Inaendelea…',
      notNow: 'Si sasa',
    },
    errors: { amount: 'Weka kiasi zaidi ya 0.', overBalance: 'Salio lako ni {amount} USDC.', overFree: "Unaweza kuomba kutoa hadi {amount} USDC.", failed: 'Matokeo hayakuweza kuthibitishwa. Onyesha mfuko wako wa akiba upya na uangalie shughuli kabla ya kuwasilisha tena.' },
    done: { putUp: 'Zimeongezwa kwenye mfuko wako wa akiba.', takeOut: "Utoaji umeombwa. Kusanya kuanzia {date}.", cancel: 'Zimebaki. Zinaweza kudhamini mikataba yako tena.', collect: 'Imechukuliwa. Imerudi kwenye salio lako.' },
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
    profile: { dealGuarantee: 'Mfuko wa akiba', legacyContracts: 'Mikataba ya awali' },
    ask: {
      label: 'Omba dhamana ya mkataba',
      hintBuyer: 'Dhamana ya mkataba hutoka tu kwenye mfuko wa akiba wa muuzaji. Mkataba ukienda vibaya na uamuzi ukawa upande wako, unaweza kulipwa kutoka kwake.',
      from: '{amount} kutoka mfuko wa akiba wa {name}',
      term: 'Dhamana ya mkataba',
      asked: '{amount} · imeombwa',
      backed: '{amount} · imedhaminiwa',
      hintSeller: 'Dhamana ya mkataba inaweza kutoka tu kwenye mfuko wako wa akiba. Inabaki yako na inaendelea kupata faida, na huachiliwa mkataba ukiisha vizuri.',
      back: 'Idhamini kutoka mfuko wangu',
      confirmSeller: 'Unakubali mkataba na kudhamini dhamana ya mkataba ya {amount} kutoka mfuko wako wa akiba. Huachiliwa mkataba ukiisha vizuri.',
      short: 'Mfuko wako wa akiba umepungukiwa {amount} kwa dhamana hii. Iongeze kwenye Wasifu, Mfuko wa akiba, kisha ujaribu tena.',
    },
  },
};
