export interface MoneyCopy {
  home: {
    balanceLabel: string;
    readyOnArc: string;
    movingOut: string;
    movingIn: string;
    add: string;
    move: string;
    send: string;
    empty: string;
    loadError: string;
    tryAgain: string;
    agentsTitle: string;
    agentsLine: string;
    agentsNotSetUp: string;
    setUpAgents: string;
    buyingAgent: string;
    sellingAgent: string;
    topUp: string;
    withdraw: string;
    recentTitle: string;
    recentEmpty: string;
    recentError: string;
    allActivity: string;
    statusPending: string;
    statusFailed: string;
    byNetworkTitle: string;
    inYourBalance: string;
    heldAnyNetwork: string;
    otherNetworks: string;
    proofTitle: string;
    walletAddress: string;
    buyingAgentAddress: string;
    sellingAgentAddress: string;
    networkLabel: string;
  };
  sheet: {
    titleTopUpBuyer: string;
    titleTopUpSeller: string;
    titleWithdrawBuyer: string;
    titleWithdrawSeller: string;
    titleSend: string;
    from: string;
    to: string;
    yourBalance: string;
    swap: string;
    recipientLabel: string;
    recipientPlaceholder: string;
    recipientCheck: string;
    recipientInvalid: string;
    recipientChecking: string;
    recipientContract: string;
    otherNetwork: string;
    amountLabel: string;
    available: string;
    quarter: string;
    half: string;
    max: string;
    timeSeconds: string;
    consequenceTopUpBuyer: string;
    consequenceTopUpSeller: string;
    consequenceWithdraw: string;
    consequenceSend: string;
    sendIrreversible: string;
    ctaTopUp: string;
    ctaWithdraw: string;
    ctaSend: string;
    ctaNoAmount: string;
    stepSigned: string;
    stepSent: string;
    stepConfirmed: string;
    progressLabel: string;
    doneTopUpBuyer: string;
    doneTopUpSeller: string;
    doneWithdraw: string;
    doneSend: string;
    reference: string;
    done: string;
    slow: string;
    checkAgain: string;
    reverted: string;
    failed: string;
    declined: string;
    tryAgain: string;
    short: string;
    addUsdc: string;
    close: string;
    confirmed: string;
  };
  cross: {
    titleAdd: string;
    titleMove: string;
    titleSend: string;
    titlePay: string;
    whereFrom: string;
    whereTo: string;
    fromWallet: string;
    walletEmpty: string;
    connectWallet: string;
    fromExchange: string;
    cardOrBank: string;
    comingSoon: string;
    moveNeedsWallet: string;
    yourWallet: string;
    recipientLabel: string;
    payTo: string;
    receiveAbout: string;
    feeUpTo: string;
    walletShowsFee: string;
    usuallySeconds: string;
    usuallyUnderMinute: string;
    ctaAdd: string;
    ctaMove: string;
    ctaSend: string;
    ctaPay: string;
    chooseSource: string;
    stepSignedWallet: string;
    stepSignedAccount: string;
    stepLeaving: string;
    stepArriving: string;
    stepInBalance: string;
    stepArrivedOn: string;
    elapsedSeconds: string;
    elapsedMinutes: string;
    slow: string;
    nothingLeft: string;
    stillMoving: string;
    checkAgain: string;
    tryAgain: string;
    leaveNote: string;
    another: string;
    done: string;
    history: string;
    faucet: string;
  };
  notify: {
    arrivedArc: string;
    reachedDestination: string;
  };
  settings: {
    soundsSwitch: string;
  };
  profile: {
    agentMoneyMoved: string;
    openMoneyHome: string;
  };
  fund: {
    line: string;
  };
}

export const moneyCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', MoneyCopy> = {
  en: {
    home: {
      balanceLabel: 'USDC balance',
      readyOnArc: 'Ready to use on Arc',
      movingOut: '{amount} USDC on its way to {place}',
      movingIn: '{amount} USDC on its way from {place}',
      add: 'Add',
      move: 'Move',
      send: 'Send',
      empty: 'Add USDC to start.',
      loadError: "Balances didn't load. Your money is unaffected.",
      tryAgain: 'Try again',
      agentsTitle: 'Agents',
      agentsLine: 'What your agents can spend for you.',
      agentsNotSetUp: 'Your agents are not set up yet.',
      setUpAgents: 'Set up agents',
      buyingAgent: 'Buying agent',
      sellingAgent: 'Selling agent',
      topUp: 'Top up',
      withdraw: 'Withdraw',
      recentTitle: 'Recent money',
      recentEmpty: 'No money has moved yet.',
      recentError: "Recent money didn't load.",
      allActivity: 'All activity',
      statusPending: 'Sending',
      statusFailed: "Didn't go through",
      byNetworkTitle: 'By network',
      inYourBalance: 'In your balance',
      heldAnyNetwork: 'Held for any network',
      otherNetworks: 'In your wallet on other networks',
      proofTitle: 'Proof on Arc',
      walletAddress: 'Your wallet address',
      buyingAgentAddress: 'Buying agent address',
      sellingAgentAddress: 'Selling agent address',
      networkLabel: 'Network',
    },
    sheet: {
      titleTopUpBuyer: 'Top up buying agent',
      titleTopUpSeller: 'Top up selling agent',
      titleWithdrawBuyer: 'Withdraw from buying agent',
      titleWithdrawSeller: 'Withdraw from selling agent',
      titleSend: 'Send USDC',
      from: 'From',
      to: 'To',
      yourBalance: 'Your balance',
      swap: 'Switch between top up and withdraw',
      recipientLabel: 'Send to',
      recipientPlaceholder: 'Paste an Arc address',
      recipientCheck: 'Check it matches: {grouped}',
      recipientInvalid: "That isn't a complete address.",
      recipientChecking: 'Checking the address.',
      recipientContract: 'This is a contract address. Make sure it can receive USDC.',
      otherNetwork: 'Send to another network',
      amountLabel: 'Amount',
      available: 'Available {amount} USDC',
      quarter: '25%',
      half: '50%',
      max: 'Max',
      timeSeconds: 'Usually arrives in seconds.',
      consequenceTopUpBuyer: '{amount} USDC moves to your buying agent. You can withdraw it at any time.',
      consequenceTopUpSeller: '{amount} USDC moves to your selling agent. You can withdraw it at any time.',
      consequenceWithdraw: '{amount} USDC comes back to your balance.',
      consequenceSend: '{amount} USDC goes to the address above.',
      sendIrreversible: "Sending to an address can't be undone.",
      ctaTopUp: 'Top up {amount} USDC',
      ctaWithdraw: 'Withdraw {amount} USDC',
      ctaSend: 'Send {amount} USDC',
      ctaNoAmount: 'Enter an amount',
      stepSigned: 'Signed',
      stepSent: 'Sent',
      stepConfirmed: 'Confirmed',
      progressLabel: 'Progress',
      doneTopUpBuyer: '{amount} USDC is with your buying agent.',
      doneTopUpSeller: '{amount} USDC is with your selling agent.',
      doneWithdraw: '{amount} USDC is back in your balance.',
      doneSend: '{amount} USDC sent.',
      reference: 'Reference',
      done: 'Done',
      slow: 'Sent. Waiting for the network. Nothing is lost.',
      checkAgain: 'Check again',
      reverted: "It didn't go through. Your USDC is still in your balance.",
      failed: "It didn't go through. Nothing moved.",
      declined: 'You cancelled in your wallet. Nothing moved.',
      tryAgain: 'Try again',
      short: 'You need {amount} USDC more.',
      addUsdc: 'Add USDC',
      close: 'Close',
      confirmed: 'Confirmed',
    },
    cross: {
      titleAdd: 'Add USDC',
      titleMove: 'Move USDC',
      titleSend: 'Send USDC',
      titlePay: 'Pay {amount} USDC',
      whereFrom: 'Where from',
      whereTo: 'Where to',
      fromWallet: 'From your wallet',
      walletEmpty: 'No USDC found in your connected wallet.',
      connectWallet: 'Connect a wallet',
      fromExchange: 'From an exchange or another app',
      cardOrBank: 'Card or bank',
      comingSoon: 'Coming soon',
      moveNeedsWallet: 'Moving to your own wallet on another network needs a connected wallet. You can still send to any address.',
      yourWallet: 'Your wallet',
      recipientLabel: 'Recipient address',
      payTo: 'To {grouped}',
      receiveAbout: 'You receive about {amount} USDC on {chain}.',
      feeUpTo: 'Fee up to {amount} USDC.',
      walletShowsFee: 'Your wallet shows its network fee before you sign.',
      usuallySeconds: 'Usually takes a few seconds.',
      usuallyUnderMinute: 'Usually takes under a minute.',
      ctaAdd: 'Add {amount} USDC from {chain}',
      ctaMove: 'Move {amount} USDC to {chain}',
      ctaSend: 'Send {amount} USDC to {chain}',
      ctaPay: 'Pay {amount} USDC from {chain}',
      chooseSource: 'Choose where it comes from',
      stepSignedWallet: 'Signed in your wallet',
      stepSignedAccount: 'Sent from your balance',
      stepLeaving: 'Leaving {chain}',
      stepArriving: 'Arriving on {chain}',
      stepInBalance: 'In your balance',
      stepArrivedOn: 'Arrived on {chain}',
      elapsedSeconds: '{s} s so far',
      elapsedMinutes: '{m} min {s} s so far',
      slow: 'Taking longer than usual. Nothing is lost.',
      nothingLeft: "It didn't go through. Nothing left your wallet.",
      stillMoving: 'Your USDC left {chain} and is still on its way. Nothing is lost.',
      checkAgain: 'Check again',
      tryAgain: 'Try again',
      leaveNote: 'You can leave this page. We will tell you when it lands.',
      another: 'Start another',
      done: 'Done',
      history: 'Transfer history',
      faucet: 'Need test USDC? Get some from Circle.',
    },
    notify: {
      arrivedArc: '{amount} USDC arrived on Arc.',
      reachedDestination: '{amount} USDC reached its destination.',
    },
    settings: { soundsSwitch: 'Play a sound when money moves' },
    profile: {
      agentMoneyMoved: 'Top up and withdraw from your agents in your money home.',
      openMoneyHome: 'Open money home',
    },
    fund: { line: 'Top up your buying agent to continue.' },
  },
  ar: {
    home: {
      balanceLabel: 'رصيد USDC',
      readyOnArc: 'جاهز للاستخدام على Arc',
      movingOut: '{amount} USDC في الطريق إلى {place}',
      movingIn: '{amount} USDC في الطريق من {place}',
      add: 'إضافة',
      move: 'نقل',
      send: 'إرسال',
      empty: 'أضف USDC للبدء.',
      loadError: 'لم يتم تحميل الأرصدة. أموالك لم تتأثر.',
      tryAgain: 'حاول مرة أخرى',
      agentsTitle: 'الوكلاء',
      agentsLine: 'ما يمكن لوكلائك إنفاقه نيابةً عنك.',
      agentsNotSetUp: 'لم يتم إعداد وكلائك بعد.',
      setUpAgents: 'إعداد الوكلاء',
      buyingAgent: 'وكيل الشراء',
      sellingAgent: 'وكيل البيع',
      topUp: 'تعبئة',
      withdraw: 'سحب',
      recentTitle: 'آخر حركات الأموال',
      recentEmpty: 'لم تتحرك أي أموال بعد.',
      recentError: 'لم يتم تحميل آخر الحركات.',
      allActivity: 'كل النشاط',
      statusPending: 'قيد الإرسال',
      statusFailed: 'لم تكتمل',
      byNetworkTitle: 'حسب الشبكة',
      inYourBalance: 'في رصيدك',
      heldAnyNetwork: 'محفوظ لأي شبكة',
      otherNetworks: 'في محفظتك على شبكات أخرى',
      proofTitle: 'الإثبات على Arc',
      walletAddress: 'عنوان محفظتك',
      buyingAgentAddress: 'عنوان وكيل الشراء',
      sellingAgentAddress: 'عنوان وكيل البيع',
      networkLabel: 'الشبكة',
    },
    sheet: {
      titleTopUpBuyer: 'تعبئة وكيل الشراء',
      titleTopUpSeller: 'تعبئة وكيل البيع',
      titleWithdrawBuyer: 'السحب من وكيل الشراء',
      titleWithdrawSeller: 'السحب من وكيل البيع',
      titleSend: 'إرسال USDC',
      from: 'من',
      to: 'إلى',
      yourBalance: 'رصيدك',
      swap: 'التبديل بين التعبئة والسحب',
      recipientLabel: 'إرسال إلى',
      recipientPlaceholder: 'الصق عنوانًا على Arc',
      recipientCheck: 'تحقق من التطابق: {grouped}',
      recipientInvalid: 'هذا العنوان غير مكتمل.',
      recipientChecking: 'جارٍ التحقق من العنوان.',
      recipientContract: 'هذا عنوان عقد. تأكد من أنه يستطيع استلام USDC.',
      otherNetwork: 'الإرسال إلى شبكة أخرى',
      amountLabel: 'المبلغ',
      available: 'المتاح {amount} USDC',
      quarter: '25%',
      half: '50%',
      max: 'الحد الأقصى',
      timeSeconds: 'يصل عادةً خلال ثوانٍ.',
      consequenceTopUpBuyer: 'ينتقل {amount} USDC إلى وكيل الشراء. يمكنك سحبه في أي وقت.',
      consequenceTopUpSeller: 'ينتقل {amount} USDC إلى وكيل البيع. يمكنك سحبه في أي وقت.',
      consequenceWithdraw: 'يعود {amount} USDC إلى رصيدك.',
      consequenceSend: 'يذهب {amount} USDC إلى العنوان أعلاه.',
      sendIrreversible: 'لا يمكن التراجع عن الإرسال إلى عنوان.',
      ctaTopUp: 'تعبئة {amount} USDC',
      ctaWithdraw: 'سحب {amount} USDC',
      ctaSend: 'إرسال {amount} USDC',
      ctaNoAmount: 'أدخل مبلغًا',
      stepSigned: 'تم التوقيع',
      stepSent: 'تم الإرسال',
      stepConfirmed: 'تم التأكيد',
      progressLabel: 'التقدم',
      doneTopUpBuyer: 'أصبح {amount} USDC لدى وكيل الشراء.',
      doneTopUpSeller: 'أصبح {amount} USDC لدى وكيل البيع.',
      doneWithdraw: 'عاد {amount} USDC إلى رصيدك.',
      doneSend: 'تم إرسال {amount} USDC.',
      reference: 'المرجع',
      done: 'تم',
      slow: 'تم الإرسال. في انتظار الشبكة. لم يضِع شيء.',
      checkAgain: 'تحقق مرة أخرى',
      reverted: 'لم تكتمل العملية. ما زالت USDC في رصيدك.',
      failed: 'لم تكتمل العملية. لم يتحرك شيء.',
      declined: 'ألغيت العملية في محفظتك. لم يتحرك شيء.',
      tryAgain: 'حاول مرة أخرى',
      short: 'تحتاج إلى {amount} USDC إضافية.',
      addUsdc: 'إضافة USDC',
      close: 'إغلاق',
      confirmed: 'تم التأكيد',
    },
    cross: {
      titleAdd: 'إضافة USDC',
      titleMove: 'نقل USDC',
      titleSend: 'إرسال USDC',
      titlePay: 'دفع {amount} USDC',
      whereFrom: 'من أين',
      whereTo: 'إلى أين',
      fromWallet: 'من محفظتك',
      walletEmpty: 'لا توجد USDC في محفظتك المتصلة.',
      connectWallet: 'ربط محفظة',
      fromExchange: 'من منصة تداول أو تطبيق آخر',
      cardOrBank: 'بطاقة أو حساب بنكي',
      comingSoon: 'قريبًا',
      moveNeedsWallet: 'النقل إلى محفظتك على شبكة أخرى يتطلب محفظة متصلة. ما زال بإمكانك الإرسال إلى أي عنوان.',
      yourWallet: 'محفظتك',
      recipientLabel: 'عنوان المستلم',
      payTo: 'إلى {grouped}',
      receiveAbout: 'ستستلم نحو {amount} USDC على {chain}.',
      feeUpTo: 'رسوم تصل إلى {amount} USDC.',
      walletShowsFee: 'تعرض محفظتك رسوم الشبكة قبل التوقيع.',
      usuallySeconds: 'يستغرق عادةً بضع ثوانٍ.',
      usuallyUnderMinute: 'يستغرق عادةً أقل من دقيقة.',
      ctaAdd: 'إضافة {amount} USDC من {chain}',
      ctaMove: 'نقل {amount} USDC إلى {chain}',
      ctaSend: 'إرسال {amount} USDC إلى {chain}',
      ctaPay: 'دفع {amount} USDC من {chain}',
      chooseSource: 'اختر مصدر الأموال',
      stepSignedWallet: 'تم التوقيع في محفظتك',
      stepSignedAccount: 'أُرسل من رصيدك',
      stepLeaving: 'يغادر {chain}',
      stepArriving: 'يصل إلى {chain}',
      stepInBalance: 'في رصيدك',
      stepArrivedOn: 'وصل إلى {chain}',
      elapsedSeconds: 'مرّت {s} ث',
      elapsedMinutes: 'مرّت {m} د {s} ث',
      slow: 'يستغرق وقتًا أطول من المعتاد. لم يضِع شيء.',
      nothingLeft: 'لم تكتمل العملية. لم يغادر شيء محفظتك.',
      stillMoving: 'غادرت USDC {chain} وما زالت في الطريق. لم يضِع شيء.',
      checkAgain: 'تحقق مرة أخرى',
      tryAgain: 'حاول مرة أخرى',
      leaveNote: 'يمكنك مغادرة هذه الصفحة. سنخبرك عند الوصول.',
      another: 'تحويل آخر',
      done: 'تم',
      history: 'سجل التحويلات',
      faucet: 'تحتاج إلى USDC تجريبية؟ احصل عليها من Circle.',
    },
    notify: {
      arrivedArc: 'وصل {amount} USDC إلى Arc.',
      reachedDestination: 'وصل {amount} USDC إلى وجهته.',
    },
    settings: { soundsSwitch: 'تشغيل صوت عند تحرك الأموال' },
    profile: {
      agentMoneyMoved: 'عبّئ وكلاءك واسحب منهم من صفحة أموالك.',
      openMoneyHome: 'فتح صفحة الأموال',
    },
    fund: { line: 'عبّئ وكيل الشراء للمتابعة.' },
  },
  fr: {
    home: {
      balanceLabel: 'Solde USDC',
      readyOnArc: 'Prêt à l’emploi sur Arc',
      movingOut: '{amount} USDC en route vers {place}',
      movingIn: '{amount} USDC en route depuis {place}',
      add: 'Ajouter',
      move: 'Déplacer',
      send: 'Envoyer',
      empty: 'Ajoutez des USDC pour commencer.',
      loadError: 'Les soldes ne se sont pas chargés. Votre argent n’est pas affecté.',
      tryAgain: 'Réessayer',
      agentsTitle: 'Agents',
      agentsLine: 'Ce que vos agents peuvent dépenser pour vous.',
      agentsNotSetUp: 'Vos agents ne sont pas encore configurés.',
      setUpAgents: 'Configurer les agents',
      buyingAgent: 'Agent d’achat',
      sellingAgent: 'Agent de vente',
      topUp: 'Alimenter',
      withdraw: 'Retirer',
      recentTitle: 'Mouvements récents',
      recentEmpty: 'Aucun mouvement d’argent pour l’instant.',
      recentError: 'Les mouvements récents ne se sont pas chargés.',
      allActivity: 'Toute l’activité',
      statusPending: 'Envoi en cours',
      statusFailed: 'Non abouti',
      byNetworkTitle: 'Par réseau',
      inYourBalance: 'Dans votre solde',
      heldAnyNetwork: 'Disponible sur tous les réseaux',
      otherNetworks: 'Dans votre portefeuille sur d’autres réseaux',
      proofTitle: 'Preuve sur Arc',
      walletAddress: 'Adresse de votre portefeuille',
      buyingAgentAddress: 'Adresse de l’agent d’achat',
      sellingAgentAddress: 'Adresse de l’agent de vente',
      networkLabel: 'Réseau',
    },
    sheet: {
      titleTopUpBuyer: 'Alimenter l’agent d’achat',
      titleTopUpSeller: 'Alimenter l’agent de vente',
      titleWithdrawBuyer: 'Retirer de l’agent d’achat',
      titleWithdrawSeller: 'Retirer de l’agent de vente',
      titleSend: 'Envoyer des USDC',
      from: 'De',
      to: 'Vers',
      yourBalance: 'Votre solde',
      swap: 'Basculer entre alimenter et retirer',
      recipientLabel: 'Envoyer à',
      recipientPlaceholder: 'Collez une adresse Arc',
      recipientCheck: 'Vérifiez qu’elle correspond : {grouped}',
      recipientInvalid: 'Cette adresse est incomplète.',
      recipientChecking: 'Vérification de l’adresse.',
      recipientContract: 'C’est une adresse de contrat. Vérifiez qu’elle peut recevoir des USDC.',
      otherNetwork: 'Envoyer vers un autre réseau',
      amountLabel: 'Montant',
      available: 'Disponible : {amount} USDC',
      quarter: '25 %',
      half: '50 %',
      max: 'Max',
      timeSeconds: 'Arrive généralement en quelques secondes.',
      consequenceTopUpBuyer: '{amount} USDC vont à votre agent d’achat. Vous pouvez les retirer à tout moment.',
      consequenceTopUpSeller: '{amount} USDC vont à votre agent de vente. Vous pouvez les retirer à tout moment.',
      consequenceWithdraw: '{amount} USDC reviennent dans votre solde.',
      consequenceSend: '{amount} USDC partent vers l’adresse ci-dessus.',
      sendIrreversible: 'Un envoi à une adresse ne peut pas être annulé.',
      ctaTopUp: 'Alimenter de {amount} USDC',
      ctaWithdraw: 'Retirer {amount} USDC',
      ctaSend: 'Envoyer {amount} USDC',
      ctaNoAmount: 'Saisissez un montant',
      stepSigned: 'Signé',
      stepSent: 'Envoyé',
      stepConfirmed: 'Confirmé',
      progressLabel: 'Progression',
      doneTopUpBuyer: '{amount} USDC sont chez votre agent d’achat.',
      doneTopUpSeller: '{amount} USDC sont chez votre agent de vente.',
      doneWithdraw: '{amount} USDC sont de retour dans votre solde.',
      doneSend: '{amount} USDC envoyés.',
      reference: 'Référence',
      done: 'Terminé',
      slow: 'Envoyé. En attente du réseau. Rien n’est perdu.',
      checkAgain: 'Vérifier à nouveau',
      reverted: 'L’opération n’a pas abouti. Vos USDC sont toujours dans votre solde.',
      failed: 'L’opération n’a pas abouti. Rien n’a bougé.',
      declined: 'Vous avez annulé dans votre portefeuille. Rien n’a bougé.',
      tryAgain: 'Réessayer',
      short: 'Il vous manque {amount} USDC.',
      addUsdc: 'Ajouter des USDC',
      close: 'Fermer',
      confirmed: 'Confirmé',
    },
    cross: {
      titleAdd: 'Ajouter des USDC',
      titleMove: 'Déplacer des USDC',
      titleSend: 'Envoyer des USDC',
      titlePay: 'Payer {amount} USDC',
      whereFrom: 'Depuis',
      whereTo: 'Vers',
      fromWallet: 'Depuis votre portefeuille',
      walletEmpty: 'Aucun USDC trouvé dans votre portefeuille connecté.',
      connectWallet: 'Connecter un portefeuille',
      fromExchange: 'Depuis une plateforme d’échange ou une autre application',
      cardOrBank: 'Carte ou virement',
      comingSoon: 'Bientôt disponible',
      moveNeedsWallet: 'Déplacer vers votre propre portefeuille sur un autre réseau nécessite un portefeuille connecté. Vous pouvez toujours envoyer à n’importe quelle adresse.',
      yourWallet: 'Votre portefeuille',
      recipientLabel: 'Adresse du destinataire',
      payTo: 'À {grouped}',
      receiveAbout: 'Vous recevez environ {amount} USDC sur {chain}.',
      feeUpTo: 'Frais jusqu’à {amount} USDC.',
      walletShowsFee: 'Votre portefeuille affiche ses frais de réseau avant la signature.',
      usuallySeconds: 'Prend généralement quelques secondes.',
      usuallyUnderMinute: 'Prend généralement moins d’une minute.',
      ctaAdd: 'Ajouter {amount} USDC depuis {chain}',
      ctaMove: 'Déplacer {amount} USDC vers {chain}',
      ctaSend: 'Envoyer {amount} USDC vers {chain}',
      ctaPay: 'Payer {amount} USDC depuis {chain}',
      chooseSource: 'Choisissez la provenance',
      stepSignedWallet: 'Signé dans votre portefeuille',
      stepSignedAccount: 'Envoyé depuis votre solde',
      stepLeaving: 'Départ de {chain}',
      stepArriving: 'Arrivée sur {chain}',
      stepInBalance: 'Dans votre solde',
      stepArrivedOn: 'Arrivé sur {chain}',
      elapsedSeconds: '{s} s écoulées',
      elapsedMinutes: '{m} min {s} s écoulées',
      slow: 'Plus long que d’habitude. Rien n’est perdu.',
      nothingLeft: 'L’opération n’a pas abouti. Rien n’a quitté votre portefeuille.',
      stillMoving: 'Vos USDC ont quitté {chain} et sont toujours en route. Rien n’est perdu.',
      checkAgain: 'Vérifier à nouveau',
      tryAgain: 'Réessayer',
      leaveNote: 'Vous pouvez quitter cette page. Nous vous préviendrons à l’arrivée.',
      another: 'Faire un autre transfert',
      done: 'Terminé',
      history: 'Historique des transferts',
      faucet: 'Besoin d’USDC de test ? Obtenez-en auprès de Circle.',
    },
    notify: {
      arrivedArc: '{amount} USDC sont arrivés sur Arc.',
      reachedDestination: '{amount} USDC ont atteint leur destination.',
    },
    settings: { soundsSwitch: 'Jouer un son quand l’argent bouge' },
    profile: {
      agentMoneyMoved: 'Alimentez vos agents et retirez depuis votre espace argent.',
      openMoneyHome: 'Ouvrir l’espace argent',
    },
    fund: { line: 'Alimentez votre agent d’achat pour continuer.' },
  },
  hi: {
    home: {
      balanceLabel: 'USDC बैलेंस',
      readyOnArc: 'Arc पर इस्तेमाल के लिए तैयार',
      movingOut: '{amount} USDC {place} की ओर जा रहे हैं',
      movingIn: '{amount} USDC {place} से आ रहे हैं',
      add: 'जोड़ें',
      move: 'ले जाएँ',
      send: 'भेजें',
      empty: 'शुरू करने के लिए USDC जोड़ें।',
      loadError: 'बैलेंस लोड नहीं हुए। आपके पैसे पर कोई असर नहीं पड़ा।',
      tryAgain: 'फिर से कोशिश करें',
      agentsTitle: 'एजेंट',
      agentsLine: 'आपके एजेंट आपके लिए कितना खर्च कर सकते हैं।',
      agentsNotSetUp: 'आपके एजेंट अभी सेट अप नहीं हुए हैं।',
      setUpAgents: 'एजेंट सेट अप करें',
      buyingAgent: 'खरीद एजेंट',
      sellingAgent: 'बिक्री एजेंट',
      topUp: 'टॉप अप करें',
      withdraw: 'निकालें',
      recentTitle: 'हाल के लेन-देन',
      recentEmpty: 'अभी तक कोई पैसा नहीं चला है।',
      recentError: 'हाल के लेन-देन लोड नहीं हुए।',
      allActivity: 'पूरी गतिविधि',
      statusPending: 'भेजा जा रहा है',
      statusFailed: 'पूरा नहीं हुआ',
      byNetworkTitle: 'नेटवर्क के अनुसार',
      inYourBalance: 'आपके बैलेंस में',
      heldAnyNetwork: 'किसी भी नेटवर्क के लिए रखा गया',
      otherNetworks: 'दूसरे नेटवर्क पर आपके वॉलेट में',
      proofTitle: 'Arc पर प्रमाण',
      walletAddress: 'आपके वॉलेट का पता',
      buyingAgentAddress: 'खरीद एजेंट का पता',
      sellingAgentAddress: 'बिक्री एजेंट का पता',
      networkLabel: 'नेटवर्क',
    },
    sheet: {
      titleTopUpBuyer: 'खरीद एजेंट को टॉप अप करें',
      titleTopUpSeller: 'बिक्री एजेंट को टॉप अप करें',
      titleWithdrawBuyer: 'खरीद एजेंट से निकालें',
      titleWithdrawSeller: 'बिक्री एजेंट से निकालें',
      titleSend: 'USDC भेजें',
      from: 'से',
      to: 'को',
      yourBalance: 'आपका बैलेंस',
      swap: 'टॉप अप और निकासी के बीच बदलें',
      recipientLabel: 'किसे भेजें',
      recipientPlaceholder: 'Arc का पता पेस्ट करें',
      recipientCheck: 'मिलान जाँचें: {grouped}',
      recipientInvalid: 'यह पता अधूरा है।',
      recipientChecking: 'पता जाँचा जा रहा है।',
      recipientContract: 'यह एक कॉन्ट्रैक्ट का पता है। पक्का करें कि यह USDC ले सकता है।',
      otherNetwork: 'दूसरे नेटवर्क पर भेजें',
      amountLabel: 'राशि',
      available: 'उपलब्ध {amount} USDC',
      quarter: '25%',
      half: '50%',
      max: 'अधिकतम',
      timeSeconds: 'आम तौर पर कुछ सेकंड में पहुँचता है।',
      consequenceTopUpBuyer: '{amount} USDC आपके खरीद एजेंट के पास जाएँगे। आप इन्हें कभी भी निकाल सकते हैं।',
      consequenceTopUpSeller: '{amount} USDC आपके बिक्री एजेंट के पास जाएँगे। आप इन्हें कभी भी निकाल सकते हैं।',
      consequenceWithdraw: '{amount} USDC आपके बैलेंस में वापस आएँगे।',
      consequenceSend: '{amount} USDC ऊपर दिए पते पर जाएँगे।',
      sendIrreversible: 'किसी पते पर भेजा गया पैसा वापस नहीं लिया जा सकता।',
      ctaTopUp: '{amount} USDC टॉप अप करें',
      ctaWithdraw: '{amount} USDC निकालें',
      ctaSend: '{amount} USDC भेजें',
      ctaNoAmount: 'राशि दर्ज करें',
      stepSigned: 'साइन हुआ',
      stepSent: 'भेजा गया',
      stepConfirmed: 'पुष्टि हुई',
      progressLabel: 'प्रगति',
      doneTopUpBuyer: '{amount} USDC आपके खरीद एजेंट के पास है।',
      doneTopUpSeller: '{amount} USDC आपके बिक्री एजेंट के पास है।',
      doneWithdraw: '{amount} USDC आपके बैलेंस में वापस आ गए।',
      doneSend: '{amount} USDC भेजे गए।',
      reference: 'संदर्भ',
      done: 'हो गया',
      slow: 'भेज दिया गया। नेटवर्क का इंतज़ार है। कुछ भी खोया नहीं है।',
      checkAgain: 'फिर से जाँचें',
      reverted: 'यह पूरा नहीं हुआ। आपके USDC अभी भी आपके बैलेंस में हैं।',
      failed: 'यह पूरा नहीं हुआ। कुछ भी नहीं भेजा गया।',
      declined: 'आपने वॉलेट में रद्द कर दिया। कुछ भी नहीं भेजा गया।',
      tryAgain: 'फिर से कोशिश करें',
      short: 'आपको {amount} USDC और चाहिए।',
      addUsdc: 'USDC जोड़ें',
      close: 'बंद करें',
      confirmed: 'पुष्टि हुई',
    },
    cross: {
      titleAdd: 'USDC जोड़ें',
      titleMove: 'USDC ले जाएँ',
      titleSend: 'USDC भेजें',
      titlePay: '{amount} USDC चुकाएँ',
      whereFrom: 'कहाँ से',
      whereTo: 'कहाँ',
      fromWallet: 'आपके वॉलेट से',
      walletEmpty: 'आपके जुड़े वॉलेट में कोई USDC नहीं मिला।',
      connectWallet: 'वॉलेट जोड़ें',
      fromExchange: 'किसी एक्सचेंज या दूसरे ऐप से',
      cardOrBank: 'कार्ड या बैंक',
      comingSoon: 'जल्द आ रहा है',
      moveNeedsWallet: 'दूसरे नेटवर्क पर अपने वॉलेट में ले जाने के लिए जुड़ा हुआ वॉलेट चाहिए। आप फिर भी किसी भी पते पर भेज सकते हैं।',
      yourWallet: 'आपका वॉलेट',
      recipientLabel: 'प्राप्तकर्ता का पता',
      payTo: '{grouped} को',
      receiveAbout: 'आपको {chain} पर लगभग {amount} USDC मिलेंगे।',
      feeUpTo: 'शुल्क अधिकतम {amount} USDC।',
      walletShowsFee: 'साइन करने से पहले आपका वॉलेट नेटवर्क शुल्क दिखाता है।',
      usuallySeconds: 'आम तौर पर कुछ सेकंड लगते हैं।',
      usuallyUnderMinute: 'आम तौर पर एक मिनट से कम लगता है।',
      ctaAdd: '{chain} से {amount} USDC जोड़ें',
      ctaMove: '{amount} USDC {chain} पर ले जाएँ',
      ctaSend: '{amount} USDC {chain} पर भेजें',
      ctaPay: '{chain} से {amount} USDC चुकाएँ',
      chooseSource: 'चुनें कि पैसा कहाँ से आएगा',
      stepSignedWallet: 'आपके वॉलेट में साइन हुआ',
      stepSignedAccount: 'आपके बैलेंस से भेजा गया',
      stepLeaving: '{chain} से निकल रहा है',
      stepArriving: '{chain} पर पहुँच रहा है',
      stepInBalance: 'आपके बैलेंस में',
      stepArrivedOn: '{chain} पर पहुँच गया',
      elapsedSeconds: 'अब तक {s} सेकंड',
      elapsedMinutes: 'अब तक {m} मिनट {s} सेकंड',
      slow: 'सामान्य से ज़्यादा समय लग रहा है। कुछ भी खोया नहीं है।',
      nothingLeft: 'यह पूरा नहीं हुआ। आपके वॉलेट से कुछ नहीं गया।',
      stillMoving: 'आपके USDC {chain} से निकल चुके हैं और रास्ते में हैं। कुछ भी खोया नहीं है।',
      checkAgain: 'फिर से जाँचें',
      tryAgain: 'फिर से कोशिश करें',
      leaveNote: 'आप यह पेज छोड़ सकते हैं। पहुँचने पर हम आपको बताएँगे।',
      another: 'एक और भेजें',
      done: 'हो गया',
      history: 'ट्रांसफ़र इतिहास',
      faucet: 'टेस्ट USDC चाहिए? Circle से लें।',
    },
    notify: {
      arrivedArc: '{amount} USDC Arc पर पहुँच गए।',
      reachedDestination: '{amount} USDC अपनी मंज़िल पर पहुँच गए।',
    },
    settings: { soundsSwitch: 'पैसा चलने पर आवाज़ चलाएँ' },
    profile: {
      agentMoneyMoved: 'अपने मनी होम से एजेंट को टॉप अप करें और पैसे निकालें।',
      openMoneyHome: 'मनी होम खोलें',
    },
    fund: { line: 'जारी रखने के लिए अपने खरीद एजेंट को टॉप अप करें।' },
  },
  sw: {
    home: {
      balanceLabel: 'Salio la USDC',
      readyOnArc: 'Tayari kutumika kwenye Arc',
      movingOut: '{amount} USDC ziko njiani kwenda {place}',
      movingIn: '{amount} USDC ziko njiani kutoka {place}',
      add: 'Ongeza',
      move: 'Hamisha',
      send: 'Tuma',
      empty: 'Ongeza USDC ili uanze.',
      loadError: 'Salio halikupakia. Pesa zako haziathiriki.',
      tryAgain: 'Jaribu tena',
      agentsTitle: 'Mawakala',
      agentsLine: 'Kile ambacho mawakala wako wanaweza kutumia kwa niaba yako.',
      agentsNotSetUp: 'Mawakala wako bado hawajawekwa.',
      setUpAgents: 'Weka mawakala',
      buyingAgent: 'Wakala wa kununua',
      sellingAgent: 'Wakala wa kuuza',
      topUp: 'Jaza',
      withdraw: 'Toa',
      recentTitle: 'Miamala ya hivi karibuni',
      recentEmpty: 'Bado hakuna pesa zilizohamishwa.',
      recentError: 'Miamala ya hivi karibuni haikupakia.',
      allActivity: 'Shughuli zote',
      statusPending: 'Inatumwa',
      statusFailed: 'Haikukamilika',
      byNetworkTitle: 'Kwa mtandao',
      inYourBalance: 'Kwenye salio lako',
      heldAnyNetwork: 'Imehifadhiwa kwa mtandao wowote',
      otherNetworks: 'Kwenye pochi yako katika mitandao mingine',
      proofTitle: 'Uthibitisho kwenye Arc',
      walletAddress: 'Anwani ya pochi yako',
      buyingAgentAddress: 'Anwani ya wakala wa kununua',
      sellingAgentAddress: 'Anwani ya wakala wa kuuza',
      networkLabel: 'Mtandao',
    },
    sheet: {
      titleTopUpBuyer: 'Jaza wakala wa kununua',
      titleTopUpSeller: 'Jaza wakala wa kuuza',
      titleWithdrawBuyer: 'Toa kutoka kwa wakala wa kununua',
      titleWithdrawSeller: 'Toa kutoka kwa wakala wa kuuza',
      titleSend: 'Tuma USDC',
      from: 'Kutoka',
      to: 'Kwenda',
      yourBalance: 'Salio lako',
      swap: 'Badilisha kati ya kujaza na kutoa',
      recipientLabel: 'Tuma kwa',
      recipientPlaceholder: 'Bandika anwani ya Arc',
      recipientCheck: 'Hakikisha inalingana: {grouped}',
      recipientInvalid: 'Anwani hii haijakamilika.',
      recipientChecking: 'Inakagua anwani.',
      recipientContract: 'Hii ni anwani ya mkataba. Hakikisha inaweza kupokea USDC.',
      otherNetwork: 'Tuma kwenye mtandao mwingine',
      amountLabel: 'Kiasi',
      available: 'Inapatikana {amount} USDC',
      quarter: '25%',
      half: '50%',
      max: 'Yote',
      timeSeconds: 'Kwa kawaida hufika ndani ya sekunde chache.',
      consequenceTopUpBuyer: '{amount} USDC zinaenda kwa wakala wako wa kununua. Unaweza kuzitoa wakati wowote.',
      consequenceTopUpSeller: '{amount} USDC zinaenda kwa wakala wako wa kuuza. Unaweza kuzitoa wakati wowote.',
      consequenceWithdraw: '{amount} USDC zinarudi kwenye salio lako.',
      consequenceSend: '{amount} USDC zinaenda kwenye anwani iliyo juu.',
      sendIrreversible: 'Kutuma kwa anwani hakuwezi kutenduliwa.',
      ctaTopUp: 'Jaza {amount} USDC',
      ctaWithdraw: 'Toa {amount} USDC',
      ctaSend: 'Tuma {amount} USDC',
      ctaNoAmount: 'Weka kiasi',
      stepSigned: 'Imesainiwa',
      stepSent: 'Imetumwa',
      stepConfirmed: 'Imethibitishwa',
      progressLabel: 'Maendeleo',
      doneTopUpBuyer: '{amount} USDC ziko kwa wakala wako wa kununua.',
      doneTopUpSeller: '{amount} USDC ziko kwa wakala wako wa kuuza.',
      doneWithdraw: '{amount} USDC zimerudi kwenye salio lako.',
      doneSend: '{amount} USDC zimetumwa.',
      reference: 'Kumbukumbu',
      done: 'Imekamilika',
      slow: 'Imetumwa. Inasubiri mtandao. Hakuna kilichopotea.',
      checkAgain: 'Kagua tena',
      reverted: 'Haikufanikiwa. USDC zako bado ziko kwenye salio lako.',
      failed: 'Haikufanikiwa. Hakuna kilichohamishwa.',
      declined: 'Umeghairi kwenye pochi yako. Hakuna kilichohamishwa.',
      tryAgain: 'Jaribu tena',
      short: 'Unahitaji USDC {amount} zaidi.',
      addUsdc: 'Ongeza USDC',
      close: 'Funga',
      confirmed: 'Imethibitishwa',
    },
    cross: {
      titleAdd: 'Ongeza USDC',
      titleMove: 'Hamisha USDC',
      titleSend: 'Tuma USDC',
      titlePay: 'Lipa {amount} USDC',
      whereFrom: 'Kutoka wapi',
      whereTo: 'Kwenda wapi',
      fromWallet: 'Kutoka kwenye pochi yako',
      walletEmpty: 'Hakuna USDC kwenye pochi yako iliyounganishwa.',
      connectWallet: 'Unganisha pochi',
      fromExchange: 'Kutoka kwenye soko la kubadilishana au programu nyingine',
      cardOrBank: 'Kadi au benki',
      comingSoon: 'Inakuja hivi karibuni',
      moveNeedsWallet: 'Kuhamisha kwenda pochi yako kwenye mtandao mwingine kunahitaji pochi iliyounganishwa. Bado unaweza kutuma kwa anwani yoyote.',
      yourWallet: 'Pochi yako',
      recipientLabel: 'Anwani ya mpokeaji',
      payTo: 'Kwa {grouped}',
      receiveAbout: 'Utapokea takriban {amount} USDC kwenye {chain}.',
      feeUpTo: 'Ada hadi {amount} USDC.',
      walletShowsFee: 'Pochi yako inaonyesha ada ya mtandao kabla hujasaini.',
      usuallySeconds: 'Kwa kawaida huchukua sekunde chache.',
      usuallyUnderMinute: 'Kwa kawaida huchukua chini ya dakika moja.',
      ctaAdd: 'Ongeza {amount} USDC kutoka {chain}',
      ctaMove: 'Hamisha {amount} USDC kwenda {chain}',
      ctaSend: 'Tuma {amount} USDC kwenda {chain}',
      ctaPay: 'Lipa {amount} USDC kutoka {chain}',
      chooseSource: 'Chagua zinakotoka',
      stepSignedWallet: 'Imesainiwa kwenye pochi yako',
      stepSignedAccount: 'Imetumwa kutoka kwenye salio lako',
      stepLeaving: 'Inaondoka {chain}',
      stepArriving: 'Inafika {chain}',
      stepInBalance: 'Kwenye salio lako',
      stepArrivedOn: 'Imefika {chain}',
      elapsedSeconds: 'Sekunde {s} hadi sasa',
      elapsedMinutes: 'Dakika {m} sekunde {s} hadi sasa',
      slow: 'Inachukua muda mrefu kuliko kawaida. Hakuna kilichopotea.',
      nothingLeft: 'Haikufanikiwa. Hakuna kilichotoka kwenye pochi yako.',
      stillMoving: 'USDC zako zimeondoka {chain} na bado ziko njiani. Hakuna kilichopotea.',
      checkAgain: 'Kagua tena',
      tryAgain: 'Jaribu tena',
      leaveNote: 'Unaweza kuondoka kwenye ukurasa huu. Tutakujulisha zikifika.',
      another: 'Anzisha nyingine',
      done: 'Imekamilika',
      history: 'Historia ya uhamisho',
      faucet: 'Unahitaji USDC za majaribio? Zipate kutoka Circle.',
    },
    notify: {
      arrivedArc: '{amount} USDC zimefika kwenye Arc.',
      reachedDestination: '{amount} USDC zimefika zinakokwenda.',
    },
    settings: { soundsSwitch: 'Cheza sauti pesa zinapohamishwa' },
    profile: {
      agentMoneyMoved: 'Jaza na toa pesa za mawakala wako kwenye ukurasa wako wa pesa.',
      openMoneyHome: 'Fungua ukurasa wa pesa',
    },
    fund: { line: 'Jaza wakala wako wa kununua ili uendelee.' },
  },
};
