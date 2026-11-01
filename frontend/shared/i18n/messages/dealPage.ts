/// The deal page for every kind (view 44, Batch 5): the steps, this moment,
/// Checked by Karwan, the release sheet and the finished deal.
export interface DealPageCopy {
  steps: {
    agreed: string;
    paidIn: string;
    delivered: string;
    onTheWay: string;
    arrived: string;
    handedOver: string;
    paidOut: string;
    stage: string;
    cancelled: string;
    refunded: string;
    hoursSent: string;
    prizeIn: string;
    entries: string;
    winners: string;
  };
  stageLine: { delivered: string; paidOut: string };
  stepsLabel: string;
  split: string;
  yourMove: string;
  waitingOn: string;
  moment: {
    fund: string;
    deliver: string;
    release: string;
    accept: string;
    claim: string;
    waitFund: string;
    waitDeliver: string;
    waitRelease: string;
    waitAccept: string;
  };
  checkedTitle: string;
  compared: { work: string; goods: string; handover: string };
  result: { matches: string; gap: string; checking: string; held: string; unverified: string };
  askChanges: string;
  changesDraft: string;
  release: {
    title: string;
    to: string;
    for: string;
    deal: string;
    heldBy: string;
    heldValue: string;
    checked: string;
    cannotUndo: string;
    primary: string;
    notYet: string;
  };
  sendDelivery: string;
  doneTitle: string;
  getReceipt: string;
  paidYou: string;
  inBalance: string;
  ratedYou: string;
  yourRecord: string;
  answerProposal: string;
  whichWay: string;
  refundBuyer: string;
  paySeller: string;
  outcomeRefund: string;
  outcomePay: string;
  askRelease: string;
  askReleaseBody: string;
  askReleaseSend: string;
  answerAppeal: string;
  answerAppealBody: string;
  answerAppealSend: string;
  checkAgain: string;
  earlierEscrow: string;
  openEarlier: string;
}

export const dealPageCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', DealPageCopy> = {
  en: {
    steps: {
      agreed: 'Agreed', paidIn: 'Paid in', delivered: 'Delivered', onTheWay: 'On the way', arrived: 'Arrived', handedOver: 'Handed over',
      paidOut: 'Paid out', stage: 'Stage {n}', cancelled: 'Cancelled', refunded: 'Refunded', hoursSent: 'Hours sent', prizeIn: 'Prize in',
      entries: 'Entries', winners: 'Winners',
    },
    stageLine: { delivered: 'Delivered', paidOut: 'Paid out' },
    stepsLabel: 'Steps of this deal',
    split: '{paid} USDC paid to {name} · {held} USDC held by Karwan',
    yourMove: 'Your move',
    waitingOn: 'Waiting on {name}',
    moment: {
      fund: 'Pay in {amount} USDC so {name} can start.',
      deliver: 'Send what you made when it is ready.',
      release: '{name} delivered. Check it and release the payment.',
      accept: '{name} sent you these terms.',
      claim: 'The review time is over. Claim your payment.',
      waitFund: '{name} pays in next.',
      waitDeliver: '{name} is working on it.',
      waitRelease: '{name} is checking your delivery.',
      waitAccept: '{name} has your terms.',
    },
    checkedTitle: 'Checked by Karwan',
    compared: {
      work: 'Compared what was delivered with what you agreed',
      goods: 'Compared the photos and tracking with what you agreed',
      handover: 'Compared the handover with what you agreed',
    },
    result: { matches: 'Matches what you agreed', gap: 'Does not match yet', checking: 'Checking now', held: 'Paused for a safety check', unverified: 'Could not be checked' },
    askChanges: 'Ask for changes',
    changesDraft: 'Here is what needs changing: ',
    release: {
      title: 'Release {amount} USDC to {name}?',
      to: 'To',
      for: 'For',
      deal: 'Deal',
      heldBy: 'Held by',
      heldValue: 'Karwan, until you release',
      checked: 'Checked by Karwan',
      cannotUndo: 'This cannot be undone.',
      primary: 'Release {amount} USDC',
      notYet: 'Not yet',
    },
    sendDelivery: 'Send delivery',
    doneTitle: 'Done',
    getReceipt: 'Get receipt',
    paidYou: '+{amount} USDC',
    inBalance: 'Now in your Karwan balance',
    ratedYou: '{name} rated you {stars}',
    yourRecord: 'Your record',
    answerProposal: 'Answer the proposal',
    whichWay: 'Which way',
    refundBuyer: 'Refund the buyer',
    paySeller: 'Pay the seller',
    outcomeRefund: '{amount} USDC goes back to the buyer.',
    outcomePay: '{amount} USDC goes to the seller.',
    askRelease: 'Ask them to release',
    askReleaseBody: '{name} has to release the next payment or say why not. If they do not answer in time, it is released to you.',
    askReleaseSend: 'Send the ask',
    answerAppeal: 'Say why you have not released',
    answerAppealBody: '{name} asked you to release the next payment. Say why you are still checking, or it is released to them.',
    answerAppealSend: 'Send your answer',
    checkAgain: 'Check it again',
    earlierEscrow: 'This deal finishes in Earlier deals',
    openEarlier: 'Open Earlier deals',
  },
  fr: {
    steps: {
      agreed: 'Accepté', paidIn: 'Payé', delivered: 'Livré', onTheWay: 'En route', arrived: 'Arrivé', handedOver: 'Remis en main propre',
      paidOut: 'Versé', stage: 'Étape {n}', cancelled: 'Annulé', refunded: 'Remboursé', hoursSent: 'Heures envoyées', prizeIn: 'Prix versé',
      entries: 'Participations', winners: 'Gagnants',
    },
    stageLine: { delivered: 'Livré', paidOut: 'Versé' },
    stepsLabel: 'Étapes de cette transaction',
    split: '{paid} USDC versés à {name} · {held} USDC gardés par Karwan',
    yourMove: 'À vous',
    waitingOn: 'En attente de {name}',
    moment: {
      fund: 'Payez {amount} USDC pour que {name} commence.',
      deliver: 'Envoyez votre travail quand il est prêt.',
      release: '{name} a livré. Vérifiez puis libérez le paiement.',
      accept: '{name} vous a envoyé ces conditions.',
      claim: 'Le délai de vérification est passé. Réclamez votre paiement.',
      waitFund: '{name} paie ensuite.',
      waitDeliver: '{name} y travaille.',
      waitRelease: '{name} vérifie votre livraison.',
      waitAccept: '{name} a reçu vos conditions.',
    },
    checkedTitle: 'Vérifié par Karwan',
    compared: {
      work: 'Livraison comparée à ce que vous avez convenu',
      goods: 'Photos et suivi comparés à ce que vous avez convenu',
      handover: 'Remise comparée à ce que vous avez convenu',
    },
    result: { matches: 'Conforme à ce que vous avez convenu', gap: 'Pas encore conforme', checking: 'Vérification en cours', held: 'En pause pour un contrôle de sécurité', unverified: 'N’a pas pu être vérifié' },
    askChanges: 'Demander des modifications',
    changesDraft: 'Voici ce qu’il faut modifier : ',
    release: {
      title: 'Libérer {amount} USDC pour {name} ?',
      to: 'À',
      for: 'Pour',
      deal: 'Transaction',
      heldBy: 'Gardé par',
      heldValue: 'Karwan, jusqu’à ce que vous libériez',
      checked: 'Vérifié par Karwan',
      cannotUndo: 'Cette action est définitive.',
      primary: 'Libérer {amount} USDC',
      notYet: 'Pas encore',
    },
    sendDelivery: 'Envoyer la livraison',
    doneTitle: 'Terminé',
    getReceipt: 'Obtenir le reçu',
    paidYou: '+{amount} USDC',
    inBalance: 'Maintenant sur votre solde Karwan',
    ratedYou: '{name} vous a noté {stars}',
    yourRecord: 'Votre historique',
    answerProposal: 'Répondre à la proposition',
    whichWay: 'Dans quel sens',
    refundBuyer: 'Rembourser l’acheteur',
    paySeller: 'Payer le vendeur',
    outcomeRefund: '{amount} USDC retournent à l’acheteur.',
    outcomePay: '{amount} USDC vont au vendeur.',
    askRelease: 'Lui demander de libérer',
    askReleaseBody: '{name} doit libérer le prochain paiement ou dire pourquoi. Sans réponse à temps, il vous est versé.',
    askReleaseSend: 'Envoyer la demande',
    answerAppeal: 'Dire pourquoi vous n’avez pas libéré',
    answerAppealBody: '{name} vous demande de libérer le prochain paiement. Dites pourquoi vous vérifiez encore, sinon il lui est versé.',
    answerAppealSend: 'Envoyer votre réponse',
    checkAgain: 'Vérifier à nouveau',
    earlierEscrow: 'Cette transaction se termine dans Accords précédents',
    openEarlier: 'Ouvrir Accords précédents',
  },
  ar: {
    steps: {
      agreed: 'تم الاتفاق', paidIn: 'تم الدفع', delivered: 'تم التسليم', onTheWay: 'في الطريق', arrived: 'وصل', handedOver: 'تم التسليم يدًا بيد',
      paidOut: 'تم الصرف', stage: 'المرحلة {n}', cancelled: 'أُلغي', refunded: 'تم الاسترداد', hoursSent: 'أُرسلت الساعات', prizeIn: 'تم دفع الجائزة',
      entries: 'المشاركات', winners: 'الفائزون',
    },
    stageLine: { delivered: 'تم التسليم', paidOut: 'تم الصرف' },
    stepsLabel: 'خطوات هذه الصفقة',
    split: 'صُرف {paid} USDC إلى {name} · تحتفظ كاروان بـ {held} USDC',
    yourMove: 'دورك',
    waitingOn: 'بانتظار {name}',
    moment: {
      fund: 'ادفع {amount} USDC ليبدأ {name}.',
      deliver: 'أرسل ما أنجزته عندما يكون جاهزًا.',
      release: 'سلّم {name}. تحقق منه ثم اصرف الدفعة.',
      accept: 'أرسل لك {name} هذه الشروط.',
      claim: 'انتهى وقت المراجعة. اطلب دفعتك.',
      waitFund: '{name} يدفع بعد ذلك.',
      waitDeliver: '{name} يعمل عليه.',
      waitRelease: '{name} يتحقق من تسليمك.',
      waitAccept: 'وصلت شروطك إلى {name}.',
    },
    checkedTitle: 'تحققت منه كاروان',
    compared: {
      work: 'قورن ما سُلّم بما اتفقتما عليه',
      goods: 'قورنت الصور والتتبع بما اتفقتما عليه',
      handover: 'قورن التسليم بما اتفقتما عليه',
    },
    result: { matches: 'يطابق ما اتفقتما عليه', gap: 'لا يطابق بعد', checking: 'جارٍ التحقق', held: 'متوقف لفحص أمان', unverified: 'تعذّر التحقق' },
    askChanges: 'اطلب تعديلات',
    changesDraft: 'هذا ما يحتاج إلى تعديل: ',
    release: {
      title: 'صرف {amount} USDC إلى {name}؟',
      to: 'إلى',
      for: 'مقابل',
      deal: 'الصفقة',
      heldBy: 'يحتفظ به',
      heldValue: 'كاروان، حتى تصرفه',
      checked: 'تحققت منه كاروان',
      cannotUndo: 'لا يمكن التراجع عن هذا.',
      primary: 'اصرف {amount} USDC',
      notYet: 'ليس بعد',
    },
    sendDelivery: 'أرسل التسليم',
    doneTitle: 'تم',
    getReceipt: 'احصل على الإيصال',
    paidYou: '+{amount} USDC',
    inBalance: 'أصبح الآن في رصيدك في كاروان',
    ratedYou: 'قيّمك {name} بـ {stars}',
    yourRecord: 'سجلّك',
    answerProposal: 'الرد على الاقتراح',
    whichWay: 'أي اتجاه',
    refundBuyer: 'إعادة المال للمشتري',
    paySeller: 'الدفع للبائع',
    outcomeRefund: 'تعود {amount} USDC إلى المشتري.',
    outcomePay: 'تذهب {amount} USDC إلى البائع.',
    askRelease: 'اطلب منه الإفراج',
    askReleaseBody: 'على {name} الإفراج عن الدفعة التالية أو ذكر السبب. إن لم يرد في الوقت المحدد، تُدفع لك.',
    askReleaseSend: 'أرسل الطلب',
    answerAppeal: 'اذكر لماذا لم تُفرج',
    answerAppealBody: 'طلب منك {name} الإفراج عن الدفعة التالية. اذكر لماذا ما زلت تراجع، وإلا تُدفع له.',
    answerAppealSend: 'أرسل ردك',
    checkAgain: 'تحقق مرة أخرى',
    earlierEscrow: 'تنتهي هذه الصفقة في الصفقات السابقة',
    openEarlier: 'افتح الصفقات السابقة',
  },
  hi: {
    steps: {
      agreed: 'सहमति', paidIn: 'भुगतान हुआ', delivered: 'डिलीवर हुआ', onTheWay: 'रास्ते में', arrived: 'पहुँच गया', handedOver: 'हाथ में सौंपा',
      paidOut: 'भुगतान जारी', stage: 'चरण {n}', cancelled: 'रद्द', refunded: 'वापस हुआ', hoursSent: 'घंटे भेजे', prizeIn: 'इनाम जमा',
      entries: 'प्रविष्टियाँ', winners: 'विजेता',
    },
    stageLine: { delivered: 'डिलीवर हुआ', paidOut: 'भुगतान जारी' },
    stepsLabel: 'इस डील के चरण',
    split: '{paid} USDC {name} को दिए गए · {held} USDC Karwan के पास',
    yourMove: 'आपकी बारी',
    waitingOn: '{name} का इंतज़ार',
    moment: {
      fund: '{amount} USDC का भुगतान करें ताकि {name} काम शुरू कर सकें।',
      deliver: 'तैयार होने पर अपना काम भेजें।',
      release: '{name} ने डिलीवर कर दिया है। जाँचें और भुगतान जारी करें।',
      accept: '{name} ने आपको ये शर्तें भेजी हैं।',
      claim: 'जाँच का समय खत्म हो गया है। अपना भुगतान लें।',
      waitFund: 'अब {name} भुगतान करेंगे।',
      waitDeliver: '{name} इस पर काम कर रहे हैं।',
      waitRelease: '{name} आपकी डिलीवरी जाँच रहे हैं।',
      waitAccept: '{name} को आपकी शर्तें मिल गई हैं।',
    },
    checkedTitle: 'Karwan ने जाँचा',
    compared: {
      work: 'डिलीवरी की तुलना तय की गई बात से की गई',
      goods: 'फ़ोटो और ट्रैकिंग की तुलना तय की गई बात से की गई',
      handover: 'सौंपने की तुलना तय की गई बात से की गई',
    },
    result: { matches: 'तय की गई बात से मेल खाता है', gap: 'अभी मेल नहीं खाता', checking: 'अभी जाँच हो रही है', held: 'सुरक्षा जाँच के लिए रुका है', unverified: 'जाँच नहीं हो सकी' },
    askChanges: 'बदलाव माँगें',
    changesDraft: 'यह बदलना है: ',
    release: {
      title: '{name} को {amount} USDC जारी करें?',
      to: 'किसे',
      for: 'किसके लिए',
      deal: 'डील',
      heldBy: 'कौन रखता है',
      heldValue: 'Karwan, जब तक आप जारी न करें',
      checked: 'Karwan ने जाँचा',
      cannotUndo: 'इसे वापस नहीं लिया जा सकता।',
      primary: '{amount} USDC जारी करें',
      notYet: 'अभी नहीं',
    },
    sendDelivery: 'डिलीवरी भेजें',
    doneTitle: 'पूरा हुआ',
    getReceipt: 'रसीद पाएँ',
    paidYou: '+{amount} USDC',
    inBalance: 'अब आपके Karwan बैलेंस में',
    ratedYou: '{name} ने आपको {stars} दिए',
    yourRecord: 'आपका रिकॉर्ड',
    answerProposal: 'प्रस्ताव का जवाब दें',
    whichWay: 'किस तरफ़',
    refundBuyer: 'खरीदार को पैसे लौटाएँ',
    paySeller: 'विक्रेता को भुगतान करें',
    outcomeRefund: '{amount} USDC खरीदार को वापस जाते हैं.',
    outcomePay: '{amount} USDC विक्रेता को जाते हैं.',
    askRelease: 'उनसे रिलीज़ करने को कहें',
    askReleaseBody: '{name} को अगला भुगतान रिलीज़ करना है या कारण बताना है. समय पर जवाब न मिलने पर यह आपको मिल जाता है.',
    askReleaseSend: 'अनुरोध भेजें',
    answerAppeal: 'बताएँ कि आपने रिलीज़ क्यों नहीं किया',
    answerAppealBody: '{name} ने आपसे अगला भुगतान रिलीज़ करने को कहा है. बताएँ कि आप अभी भी क्यों जाँच रहे हैं, नहीं तो यह उन्हें मिल जाएगा.',
    answerAppealSend: 'अपना जवाब भेजें',
    checkAgain: 'फिर से जाँचें',
    earlierEscrow: 'यह डील पिछले सौदे में पूरी होती है',
    openEarlier: 'पिछले सौदे खोलें',
  },
  sw: {
    steps: {
      agreed: 'Mmekubaliana', paidIn: 'Imelipwa', delivered: 'Imewasilishwa', onTheWay: 'Iko njiani', arrived: 'Imefika', handedOver: 'Imekabidhiwa',
      paidOut: 'Imelipwa kwa muuzaji', stage: 'Hatua ya {n}', cancelled: 'Imeghairiwa', refunded: 'Imerudishwa', hoursSent: 'Saa zimetumwa', prizeIn: 'Zawadi imewekwa',
      entries: 'Washiriki', winners: 'Washindi',
    },
    stageLine: { delivered: 'Imewasilishwa', paidOut: 'Imelipwa kwa muuzaji' },
    stepsLabel: 'Hatua za mpango huu',
    split: 'USDC {paid} zimelipwa kwa {name} · USDC {held} zinashikiliwa na Karwan',
    yourMove: 'Zamu yako',
    waitingOn: 'Inasubiri {name}',
    moment: {
      fund: 'Lipa USDC {amount} ili {name} aanze.',
      deliver: 'Tuma ulichotengeneza kikiwa tayari.',
      release: '{name} amewasilisha. Kiangalie kisha uachilie malipo.',
      accept: '{name} amekutumia masharti haya.',
      claim: 'Muda wa kukagua umekwisha. Dai malipo yako.',
      waitFund: '{name} atalipa sasa.',
      waitDeliver: '{name} anaifanyia kazi.',
      waitRelease: '{name} anakagua uwasilishaji wako.',
      waitAccept: '{name} amepokea masharti yako.',
    },
    checkedTitle: 'Imekaguliwa na Karwan',
    compared: {
      work: 'Kilichowasilishwa kimelinganishwa na mlichokubaliana',
      goods: 'Picha na ufuatiliaji vimelinganishwa na mlichokubaliana',
      handover: 'Ukabidhiano umelinganishwa na mlichokubaliana',
    },
    result: { matches: 'Kinalingana na mlichokubaliana', gap: 'Bado hakilingani', checking: 'Inakaguliwa sasa', held: 'Imesimamishwa kwa ukaguzi wa usalama', unverified: 'Haikuweza kukaguliwa' },
    askChanges: 'Omba mabadiliko',
    changesDraft: 'Hiki ndicho kinachohitaji kubadilishwa: ',
    release: {
      title: 'Uachilie USDC {amount} kwa {name}?',
      to: 'Kwa',
      for: 'Kwa ajili ya',
      deal: 'Mpango',
      heldBy: 'Inashikiliwa na',
      heldValue: 'Karwan, hadi uiachilie',
      checked: 'Imekaguliwa na Karwan',
      cannotUndo: 'Hili haliwezi kutenduliwa.',
      primary: 'Achilia USDC {amount}',
      notYet: 'Bado',
    },
    sendDelivery: 'Tuma uwasilishaji',
    doneTitle: 'Imekamilika',
    getReceipt: 'Pata risiti',
    paidYou: '+USDC {amount}',
    inBalance: 'Sasa iko kwenye salio lako la Karwan',
    ratedYou: '{name} amekupa {stars}',
    yourRecord: 'Rekodi yako',
    answerProposal: 'Jibu pendekezo',
    whichWay: 'Upande gani',
    refundBuyer: 'Mrudishie mnunuzi',
    paySeller: 'Mlipe muuzaji',
    outcomeRefund: '{amount} USDC zinarudi kwa mnunuzi.',
    outcomePay: '{amount} USDC zinaenda kwa muuzaji.',
    askRelease: 'Mwombe atoe malipo',
    askReleaseBody: '{name} lazima atoe malipo yanayofuata au aseme kwa nini. Asipojibu kwa wakati, yanatolewa kwako.',
    askReleaseSend: 'Tuma ombi',
    answerAppeal: 'Sema kwa nini hujatoa malipo',
    answerAppealBody: '{name} amekuomba utoe malipo yanayofuata. Sema kwa nini bado unakagua, la sivyo yanatolewa kwake.',
    answerAppealSend: 'Tuma jibu lako',
    checkAgain: 'Kagua tena',
    earlierEscrow: 'Mpango huu unakamilika katika Mikataba ya awali',
    openEarlier: 'Fungua Mikataba ya awali',
  },
};
