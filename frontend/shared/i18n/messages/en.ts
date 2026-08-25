// Source-of-truth schema. Other locales import the `Messages` type and supply
// the same shape with translated strings. Do NOT add `as const` here; that
// would lock each value to its English literal type and reject translations.
interface MessagesShape {
  common: {
    save: string;
    cancel: string;
    confirm: string;
    close: string;
    delete: string;
    signIn: string;
    signOut: string;
    continue: string;
    back: string;
    next: string;
    loading: string;
    error: string;
    success: string;
  };
  nav: {
    home: string;
    app: string;
    buyer: string;
    seller: string;
    activity: string;
    stake: string;
    profile: string;
    deals: string;
    market: string;
    finance: string;
    reputation: string;
    bridge: string;
    topUpWithdraw: string;
    topUpBlurb: string;
    smeTrades: string;
    trades: string;
    tradesGroupEyebrow: string;
    soonBadge: string;
    hints: {
      home: string;
      market: string;
      bridge: string;
      smeTrades: string;
      activity: string;
      stake: string;
      profile: string;
    };
    tradesDropdown: {
      buyerTitle: string;
      buyerSub: string;
      sellerTitle: string;
      sellerSub: string;
    };
    p2pHub: {
      eyebrow: string;
      title: string;
      lede: string;
    };
    menuOpenAria: string;
    menuCloseAria: string;
    preferencesAria: string;
    settingsAriaTitle: string;
    controlLabels: {
      theme: string;
      sound: string;
    };
    allSettings: string;
    help: string;
    back: string;
    backAria: string;
  };
  settings: {
    eyebrow: string;
    title: string;
    description: string;
    language: string;
    languageHint: string;
    theme: string;
    themeLight: string;
    themeDark: string;
    themeSystem: string;
    sound: string;
    soundOn: string;
    soundOff: string;
    notifications: string;
    notificationsHint: string;
    notificationsMute: string;
    privacy: string;
    privacyPublicPassport: string;
    dangerZone: string;
    accountDelete: string;
    accountDeleteHint: string;
    accountDeleteConfirm: string;
    fundedFallback: string;
    deletingButton: string;
    confirmDeleteYes: string;
    confirmDeleteNo: string;
    passkey: {
      rowLabel: string;
      rowHint: string;
      activeChip: string;
      addButton: string;
      addingButton: string;
      noBrowserSupport: string;
      errorCancelled: string;
      errorGeneric: string;
    };
  };
  onboarding: {
    languageStep: {
      eyebrow: string;
      title: string;
      description: string;
    };
    signUpTag: string;
    stepIndicator: string;
    profileProgress: string;
    accountTypeStep: {
      headlinePrefix: string;
      headlineAccent: string;
      description: string;
      individual: { eyebrow: string; title: string; body: string; tagline: string };
      business: { eyebrow: string; title: string; body: string; tagline: string };
      note: string;
    };
    businessProfileStep: {
      headlineAccent: string;
      companyEyebrow: string;
      companyLabel: string;
      companyHint: string;
      tradeEyebrow: string;
      goodsLabel: string;
      goodsHint: string;
      tradeTypeHint: string;
      tradeGoods: string;
      tradeServices: string;
      tradeBoth: string;
      categoriesLabel: string;
      aboutLabel: string;
      aboutHint: string;
      dealEyebrow: string;
      minLabel: string;
      maxLabel: string;
    };
    connectStep: {
      headlinePrefix: string;
      headlineAccent: string;
      bodyText: string;
      loginButton: string;
      fineprint: string;
    };
    roleStep: {
      headlinePrefix: string;
      headlineAccent: string;
      connectedAs: string;
      secureAccount: string;
      description: string;
      continueArrow: string;
      backArrow: string;
      cards: {
        seller: { eyebrow: string; title: string; body: string; tagline: string };
        buyer: { eyebrow: string; title: string; body: string; tagline: string };
        both: { eyebrow: string; title: string; body: string; tagline: string };
      };
      topBadge: string;
      selected: string;
    };
    profileStep: {
      headlinePrefix: string;
      headlineAccent: string;
      identity: {
        eyebrow: string;
        title: string;
        displayNameLabel: string;
        displayNameHint: string;
      };
      seller: {
        eyebrow: string;
        title: string;
        skillsLabel: string;
        skillsHint: string;
        skillSuggestions: {
          design: string;
          development: string;
          writing: string;
          logistics: string;
          sourcing: string;
          bookkeeping: string;
          translation: string;
          marketing: string;
        };
        bioLabel: string;
        bioHint: string;
        minBudgetLabel: string;
        minBudgetHint: string;
        maxBudgetLabel: string;
        maxBudgetHint: string;
        minDeadlineLabel: string;
        minDeadlineHint: string;
        maxDeadlineLabel: string;
        maxDeadlineHint: string;
      };
      buyer: {
        eyebrow: string;
        title: string;
        maxBudgetLabel: string;
        maxBudgetHint: string;
        bidWindowLabel: string;
        bidWindowHint: string;
        minDeadlineLabel: string;
        minDeadlineHint: string;
        maxDeadlineLabel: string;
        maxDeadlineHint: string;
        splitLabel: string;
        splitHint: string;
      };
      matching: {
        eyebrow: string;
        sellerTitle: string;
        sellerBody: string;
        buyerTitle: string;
        buyerBody: string;
        dealSizePresets: string;
        deliveryPresets: string;
        milestonePresets: string;
      };
      saving: string;
      submit: string;
      error: string;
      defaultDisplayName: string;
    };
    getReadyStep: {
      headlinePrefix: string;
      headlineAccent: string;
      body: string;
      checklist: string;
      doneBody: string;
      activate: string;
      activating: string;
      retry: string;
      continue: string;
      skip: string;
      error: string;
    };
    validation: {
      displayName: string;
      skills: string;
      bio: string;
      sellerMinBudget: string;
      sellerMaxBudget: string;
      sellerMinDeadline: string;
      sellerMaxDeadline: string;
      buyerMaxBudget: string;
      bidWindow: string;
      buyerMinDeadline: string;
      buyerMaxDeadline: string;
      splitEmpty: string;
      splitSum: string;
    };
  };
  account: {
    modal: {
      ariaDialog: string;
      ariaClose: string;
      balanceSuffix: string;
      balanceUnknownPrefix: string;
      copy: string;
      copied: string;
      signOut: string;
      signingOut: string;
      fundHint: string;
    };
    kind: {
      individual: string;
      business: string;
      verified: string;
      notVerified: string;
      titleIndividual: string;
      titleBusiness: string;
      titleVerified: string;
    };
    verification: {
      eyebrow: string;
      title: string;
      status: Record<'unverified' | 'pending' | 'verified' | 'rejected' | 'expired' | 'revoked', string>;
      body: Record<'unverified' | 'pending' | 'verified' | 'rejected' | 'expired' | 'revoked', string>;
      capabilities: {
        directDeals: string;
        matching: string;
        reputation: string;
        business: string;
        available: string;
        verificationRequired: string;
      };
      reviewBusiness: string;
      /// The account's own public passport: the page a counterparty or financier
      /// sees. It sits with the capability list because it is what those
      /// capabilities add up to.
      publicPassport: string;
    };
  };
  banners: {
    migration: {
      ariaLabel: string;
      eyebrow: string;
      openProfile: string;
      dismissAria: string;
    };
    legacy: {
      ariaLabel: string;
      eyebrowPrefix: string;
      closesSoonFallback: string;
      title: string;
      body: string;
      openRecovery: string;
      dismissAria: string;
      dismissTooltip: string;
    };
  };
  footer: {
    tagline: string;
    builtFor: string;
    columns: {
      product: string;
      network: string;
      socials: string;
    };
    productLinks: {
      buyer: string;
      seller: string;
      activity: string;
      howItWorks: string;
      docs: string;
      brand: string;
      terms: string;
      feedback: string;
      contact: string;
    };
    networkLinks: {
      arcDocs: string;
      circleDocs: string;
      explorer: string;
      faucet: string;
    };
    brand: {
      label: string;
    };
    status: {
      operational: string;
    };
    copyright: {
      entity: string;
      tagline: string;
    };
    heroClose: string;
    feedbackPrompt: {
      eyebrow: string;
      title: string;
      body: string;
      cta: string;
    };
    newsletter: {
      title: string;
      blurb: string;
      placeholder: string;
      cta: string;
      sending: string;
      success: string;
      error: string;
      invalid: string;
    };
  };
  notifications: {
    bell: {
      aria: string;
      sectionTag: string;
      markRead: string;
      clear: string;
      emptyTitle: string;
      emptyBody: string;
      openAction: string;
    };
    toast: {
      openAction: string;
      labels: {
        matchFound: string;
        escrowFunded: string;
        cancelProposed: string;
        topUpNeeded: string;
        nearMatch: string;
        briefExpired: string;
        defaultLabel: string;
      };
    };
  };
  confirm: {
    eyebrow: string;
    cancelDefault: string;
    backdropAria: string;
  };
  dealPanel: {
    managedLabel: string;
    managedBlurb: string;
    directLabel: string;
    directBlurb: string;
  };
  roleToggle: {
    ariaGroup: string;
    eyebrow: string;
    options: {
      buyer: { label: string; description: string };
      seller: { label: string; description: string };
      both: { label: string; description: string };
    };
    businessOptions: {
      buyer: { label: string; description: string };
      seller: { label: string; description: string };
      both: { label: string; description: string };
    };
    needBuyerDetails: string;
    needSellerDetails: string;
    saving: string;
    switchFailed: string;
  };
  profileNudge: {
    titleFragment: string;
    bodyFragment: string;
    cta: string;
    dismissAria: string;
  };
  hint: {
    triggerAria: string;
  };
  liveDot: {
    live: string;
    connecting: string;
    offline: string;
  };
  assistant: {
    launcherLabel: string;
    launcherAria: string;
    title: string;
    subtitle: string;
    placeholder: string;
    send: string;
    greeting: string;
    error: string;
    disclaimer: string;
    /// Live human-handoff strings. Required: while these were optional, every
    /// non-English locale simply never gained them and the widget fell back to
    /// the English inlined at the call site, silently and forever. Required
    /// makes tsc the thing that notices.
    humanButton: string;
    liveHeader: string;
    liveBanner: string;
    liveClosed: string;
    livePlaceholder: string;
    endChat: string;
    backToAssistant: string;
    operatorName: string;
  };
  countdown: {
    closed: string;
  };
  networkTicker: {
    eyebrows: {
      opened: string;
      completed: string;
      cancelled: string;
    };
    verbs: {
      opened: string;
      completed: string;
      cancelled: string;
    };
    subjects: {
      opened: string;
      completed: string;
      cancelled: string;
    };
    usdcDeal: string;
  };
  activity: {
    signInGate: {
      tag: string;
      body: string;
    };
    hero: {
      sectionTag: string;
      headlineTop: string;
      headlineAccent: string;
      description: string;
    };
    stream: {
      sectionTag: string;
      headlinePrefix: string;
      headlineAccent: string;
      description: string;
    };
    filters: {
      searchPlaceholder: string;
      clearSearchAria: string;
      clearFilters: string;
      actors: {
        buyer: string;
        seller: string;
        system: string;
      };
    };
    stats: {
      eyebrow: string;
      /// The counters count a WINDOW of recent events, not network totals, and
      /// the window slides as new events arrive. Saying so is what stops the
      /// numbers reading as totals that mysteriously change. {n} is the count.
      window: string;
      groups: {
        jobs: string;
        negotiation: string;
        settlement: string;
        bridge: string;
      };
      filtering: string;
      events: string;
    };
    myMoney: {
      /// Keyed by the `t` field the backend puts on each row. A row whose `t`
      /// is missing or unknown falls back to the English summary it shipped
      /// with, so historical rows keep rendering.
      text: {
        bridgeIn: string;
        bridgeOut: string;
        seededByKarwan: string;
        setupMove: string;
        agentWithdraw: string;
        agentTopUp: string;
        milestoneRelease: string;
        milestoneReleaseFinal: string;
        dealPayout: string;
        dealPayoutFinal: string;
        advanceFunded: string;
        advanceReceived: string;
        financingRepaid: string;
        deadlineReclaim: string;
        disputeReceived: string;
        cancelRefund: string;
        depositCredited: string;
        depositCreditedFrom: string;
        gatewayDeposit: string;
        gatewayFundAgent: string;
        gatewayCashOut: string;
        dealCashout: string;
        researchActivate: string;
        marketRead: string;
        staked: string;
        unstakeClaim: string;
        unstakeStart: string;
        unstakeCancel: string;
        yieldClaim: string;
        /// The daily distribution arriving. Not the same as claiming it out.
        yieldAccrued: string;
      };
      eyebrow: string;
      count: string;
      loading: string;
      empty: string;
      pending: string;
      failed: string;
      receipt: string;
      viewReceipt: string;
      receiptTitle: string;
      receiptReference: string;
      receiptAmount: string;
      receiptStatus: string;
      receiptDate: string;
      receiptProof: string;
      /// Label for the identifier a receipt falls back to when no Karwan
      /// reference was ever minted for the movement: the transaction it
      /// settled in.
      receiptTransaction: string;
      receiptReferenceNone: string;
      /// Shown in place of the export buttons for a viewer who may read a
      /// receipt but not share it. The payer is the one who issues proof of
      /// payment, which is how a bank statement works.
      receiptShareBuyerOnly: string;
      receiptHistorical: string;
      receiptExportPdf: string;
      receiptExportImage: string;
      receiptSharedNote: string;
      justNow: string;
      repeated: string;
      showAll: string;
      showLess: string;
    };
    allTime: {
      sectionTag: string;
      entryTitle: string;
      entryCta: string;
      headlineTop: string;
      headlineAccent: string;
      description: string;
      loadingTag: string;
      unscannedTag: string;
      unscannedBody: string;
      errorTag: string;
      errorBody: string;
      volumeLabel: string;
      txnsLabel: string;
      dealsLabel: string;
      releasedLabel: string;
      settledLabel: string;
      refundedLabel: string;
      feesLabel: string;
      contractsLabel: string;
      breakdownTag: string;
      colContract: string;
      colDeals: string;
      colFunded: string;
      liveTag: string;
      blockLabel: string;
      updatedNow: string;
      updatedAgo: string;
      settlementTag: string;
      financingTag: string;
      stakingTag: string;
      treasuryTag: string;
      registryTag: string;
      settlementBody: string;
      financingBody: string;
      stakingBody: string;
      advancedLabel: string;
      repaidLabel: string;
      financingsLabel: string;
      defaultsLabel: string;
      stakedLabel: string;
      slashedLabel: string;
      yieldLabel: string;
      jobsPostedLabel: string;
      currentTag: string;
      currentBody: string;
      custodiedLabel: string;
      liveCountLabel: string;
      colBalance: string;
      colStatus: string;
      colDeployed: string;
      colReplaced: string;
      colEvents: string;
      colMoved: string;
      statusLive: string;
      statusMissing: string;
      ledgerTag: string;
      ledgerBody: string;
      generationsOne: string;
      generationsMany: string;
      neverUsed: string;
      notApplicable: string;
      backToActivity: string;
    };
    view: {
      notSignedInEyebrow: string;
      notSignedInBody: string;
      everyone: string;
      onlyMine: string;
      moneyTag: string;
      moneyTitle: string;
      moneyShow: string;
      moneyHide: string;
      streamEyebrow: string;
      countZero: string;
      countRange: string;
      countHidden: string;
      pagerAria: string;
      prevAria: string;
      nextAria: string;
    };
  };
  profile: {
    signInGate: { tag: string; body: string };
    loadError: { tag: string; title: string; body: string };
    tabs: {
      identity: string;
      wallets: string;
      agents: string;
      stake: string;
      preferences: string;
    };
    hero: {
      sectionTag: string;
      fallbackName: string;
      publicPassport: string;
      updatedPrefix: string;
      editDetailsCta: string;
      editCompanyCta: string;
      setUpProfileCta: string;
    };
    agentStatus: {
      eyebrow: string;
      checking: string;
      walletsPrefix: string;
      walletsLive: string;
      walletsIdle: string;
      inactiveBody: string;
      buyerFallback: string;
      sellerFallback: string;
    };
    activation: {
      inactiveTag: string;
      inactiveHeadlinePrefix: string;
      inactiveHeadlineAccent: string;
      inactiveBody: string;
      cta: string;
    };
    accountType: {
      tag: string;
      headlinePrefix: string;
      headlineAccent: string;
      body: string;
    };
    agentProfiles: {
      tag: string;
      headlinePrefix: string;
      headlineAccent: string;
      body: string;
      headsUpEyebrow: string;
      headsUpBody: string;
      buyerEyebrow: string;
      sellerEyebrow: string;
      buyerFallback: string;
      sellerFallback: string;
      rows: {
        maxBudget: string;
        deadline: string;
        bidWindow: string;
        milestones: string;
        skills: string;
        supplies: string;
        bio: string;
        budget: string;
        delivery: string;
      };
      daysSuffix: string;
      editRanges: string;
    };
    noProfile: {
      tag: string;
      headlinePrefix: string;
      headlineAccent: string;
      body: string;
      cta: string;
    };
    holdings: {
      tag: string;
      headlinePrefix: string;
      headlineAccent: string;
      body: string;
    };
    agentTreasury: {
      tag: string;
      headlineFund: string;
      headlineWithdraw: string;
      body: string;
    };
    stake: {
      tag: string;
      headlinePrefix: string;
      headlineAccent: string;
      body: string;
    };
    preferences: {
      tag: string;
      headline: string;
      body: string;
    };
  };
  appHome: {
    settlementDeskEyebrow: string;
    backendOffline: {
      eyebrow: string;
      title: string;
      bodyPrefix: string;
      bodySuffix: string;
    };
    hero: {
      welcomeBack: string;
      description: string;
      postRequestCta: string;
      postOfferCta: string;
      viewActivityCta: string;
    };
    quickStart: {
      eyebrow: string;
      title: string;
      dismissAria: string;
      steps: {
        activate: { title: string; body: string; cta: string };
        post: { title: string; body: string; cta: string };
        settle: { title: string; body: string };
      };
    };
    heroAgentCard: {
      eyebrow: string;
      statePrefix: string;
      stateActive: string;
      stateBody: string;
      miniLabels: {
        running: string;
        settled: string;
        volume: string;
      };
    };
    threeDoors: {
      sectionTag: string;
      headlineTop: string;
      headlineBottom: string;
      description: string;
      buyerCard: { eyebrow: string; title: string; body: string };
      sellerCard: { eyebrow: string; title: string; body: string };
      activityCard: { eyebrow: string; title: string; body: string };
    };
    liveNetwork: {
      sectionTag: string;
      headlineTop: string;
      headlineBottomPrefix: string;
      headlineBottomAccent: string;
      fullFeed: string;
      stats: {
        totalDeals: string;
        directDeals: string;
        agentDeals: string;
        settled: string;
        usdcThrough: string;
        chain: string;
        directPlusAgent: string;
        arcTestnet: string;
      };
    };
    networkPulse: {
      sectionTag: string;
      headlinePrefix: string;
      headlineAccent: string;
    };
    yourBook: {
      sectionTag: string;
      headlinePrefix: string;
      headlineAccent: string;
    };
    briefVignette: {
      eyebrowPrefix: string;
      timeStamp: string;
      sampleBrief: string;
      daysBids: string;
    };
    bidVignette: {
      eyebrow: string;
      live: string;
      scoreSuffix: string;
      counter: string;
      eta: string;
    };
    streamVignette: {
      eyebrow: string;
      live: string;
      now: string;
    };
  };
  businessHome: {
    deskEyebrow: string;
    hero: {
      welcomeBack: string;
      description: string;
      openDeskCta: string;
      newTradeCta: string;
      directDealCta: string;
      postOfferCta: string;
      financierDeskCta: string;
      viewActivityCta: string;
    };
    status: {
      verified: string;
      underReview: string;
      finishVerification: string;
    };
    bookCard: {
      eyebrow: string;
      active: string;
      settled: string;
      volume: string;
    };
    analytics: {
      sectionTag: string;
      headlinePrefix: string;
      headlineAccent: string;
      description: string;
      tiles: { total: string; active: string; settled: string; volume: string };
      chartTitle: string;
      chartEmpty: string;
    };
    history: {
      sectionTag: string;
      headlinePrefix: string;
      headlineAccent: string;
    };
  };
  profileEmail: {
    headlineIndividual: string;
    headlineBusiness: string;
    add: string;
    change: string;
    remove: string;
    cancel: string;
    verifiedTag: string;
    currentLabel: string;
    descriptionIndividual: string;
    descriptionBusiness: string;
    manageNote: string;
    emailLabel: string;
    businessEmailLabel: string;
    sendCode: string;
    sending: string;
    sentNote: string;
    devCodeNote: string;
    codeLabel: string;
    verify: string;
    verifying: string;
    resend: string;
    errors: { emailRequired: string; codeShape: string };
  };
  deposit: {
    tag: string;
    addressLabel: string;
    acceptsLabel: string;
    copy: string;
    copied: string;
    qrAlt: string;
    watching: string;
    unavailable: string;
    fromTemplate: string;
    stages: { moving: string; arrived: string; stuck: string };
    groups: { evm: string; solana: string };
  };
  bridge: {
    signInGate: { tag: string; body: string };
    sectionTag: string;
    headlinePrefix: string;
    description: string;
    directions: {
      toArc: string;
      fromArc: string;
    };
  };
  statsTicker: {
    liveLabels: {
      directDealsOnChain: string;
      settledInFull: string;
      movedThroughEscrow: string;
    };
    staticItems: {
      arcTestnetLabel: string;
      circleLabel: string;
      erc8004Label: string;
    };
  };
  livePulse: {
    dealsToday: string;
    settled: string;
    usdcReleased: string;
  };
  heroFlow: {
    stages: {
      request: string;
      bid: string;
      counter: string;
      accept: string;
    };
    escrow: {
      idle: string;
      settling: string;
    };
    nodes: {
      buyerLabel: string;
      sellerLabel: string;
      agentSublabel: string;
    };
    caption: {
      buyerAgent: string;
      routesThroughEscrow: string;
      sellerAgent: string;
    };
  };
  dealsFeed: {
    tabs: {
      all: string;
      active: string;
      completed: string;
    };
    liveEyebrow: string;
    errorBody: string;
    empty: {
      noDealsTag: string;
      noMatchTag: string;
      promptAll: string;
      promptFilteredActive: string;
      promptFilteredCompleted: string;
    };
    pager: {
      pageOf: string;
      countSingle: string;
      countPlural: string;
      prevAria: string;
      nextAria: string;
    };
  };
  directDeal: {
    notConnected: string;
    preview: {
      eyebrow: string;
      unitMin: string;
      unitHr: string;
      unitDays: string;
      deliveryPctTemplate: string;
      verificationPctTemplate: string;
      directEscrow: string;
    };
    counterparty: {
      eyebrow: string;
      titleWallet: string;
      titleEmail: string;
      helperWallet: string;
      helperEmail: string;
      sendByEmailLabel: string;
      walletLabel: string;
      walletHint: string;
      walletPlaceholder: string;
      walletInvalid: string;
      walletSelfWarning: string;
      walletOrPaytagLabel: string;
      walletOrPaytagHint: string;
      walletOrPaytagPlaceholder: string;
      walletOrPaytagInvalid: string;
      paytagLooking: string;
      paytagNotFound: string;
      emailLabel: string;
      emailHint: string;
      emailPlaceholder: string;
      emailInvalid: string;
    };
    terms: {
      eyebrow: string;
      title: string;
      amountLabel: string;
      deadlineLabel: string;
      deadlineHint: string;
      deliveryPctLabel: string;
      deliveryPctHint: string;
      acceptanceWindowLabel: string;
      acceptanceWindowHint: string;
      presets: {
        oneHr: string;
        sixHr: string;
        dayOne: string;
        threeDays: string;
        sevenDays: string;
      };
    };
    deliverable: {
      eyebrow: string;
      title: string;
      termsLabel: string;
      termsHint: string;
      termsPlaceholder: string;
    };
    funding: {
      header: string;
      youFundLabel: string;
      sellerReceivesLabel: string;
      platformFeeLabel: string;
      footerTemplate: string;
    };
    trustedMatch: {
      eyebrow: string;
      body: string;
      sliderAria: string;
      pctCaption: string;
      stakeNoteTemplate: string;
    };
    submit: {
      opening: string;
      open: string;
      fundsCaption: string;
    };
    errorPrefix: string;
    deadlineUnitAria: string;
    unitPickerLabels: {
      min: string;
      hr: string;
      day: string;
    };
  };
  liveJob: {
    backToBuyer: string;
    backToSeller: string;
    managedDealTag: string;
    statusEyebrow: {
      positive: string;
      warning: string;
      accent: string;
      default: string;
      critical: string;
    };
    statusLabels: {
      escrowFundedTemplate: string;
      requestExpired: string;
      negotiationEnded: string;
      matchAwaitingTemplate: string;
      acceptedFunding: string;
      bidsNegotiatingOne: string;
      bidsNegotiatingMany: string;
      waitingOnSellers: string;
    };
    stats: {
      budget: string;
      bids: string;
      deadline: string;
      termsHash: string;
      statusLabel: string;
      escrowFunded: string;
      accepted: string;
      expired: string;
      ended: string;
    };
    brief: {
      eyebrow: string;
      trustedMatchBadge: string;
      trustedMatchTooltip: string;
    };
    expired: {
      eyebrow: string;
      bodyTemplate: string;
    };
    sections: {
      flow: string;
      bids: string;
    };
    settle: {
      escrowLive: {
        tag: string;
        title: string;
        bodyTemplate: string;
        cta: string;
      };
      negotiationEnded: {
        tag: string;
        title: string;
        body: string;
      };
      funding: {
        tag: string;
        stalledTag: string;
        title: string;
        stalledTitleTemplate: string;
        stalledBodyTemplate: string;
      };
      fundingSteps: {
        approveUsdc: string;
        fundEscrow: string;
      };
      locked: {
        tag: string;
        title: string;
        body: string;
      };
    };
    editSection: {
      tag: string;
      title: string;
      body: string;
      cta: string;
    };
    editModal: {
      tag: string;
      title: string;
      body: string;
      requestTextEyebrow: string;
      toleranceEyebrow: string;
      toleranceAria: string;
      toleranceFootTemplate: string;
      trustedMatchEyebrow: string;
      trustedMatchBody: string;
      saving: string;
      save: string;
      cancel: string;
    };
    cancelSection: {
      tag: string;
      title: string;
      body: string;
      cta: string;
      confirmBody: string;
      confirmYes: string;
      confirmYesBusy: string;
      confirmNo: string;
    };
    outOfReach: {
      tag: string;
      title: string;
      bodyTemplate: string;
      reconsiderHintTemplate: string;
      reconsiderCtaTemplate: string;
      reconsiderBusy: string;
      raiseCta: string;
      waitCta: string;
    };
  };
  nearMissCard: {
    eyebrow: string;
    remainingExpired: string;
    remainingHrMin: string;
    remainingHr: string;
    remainingMin: string;
    remainingSec: string;
    directionBelowFloor: string;
    directionAboveCap: string;
    askedBodyTemplate: string;
    otherBodySellerTemplate: string;
    otherBodyBuyerTemplate: string;
    proceedBusy: string;
    proceedCta: string;
    declineBusy: string;
    declineCta: string;
  };
  negotiationCard: {
    tag: string;
    roundTemplate: string;
    roundOfCapTemplate: string;
    states: {
      reviewing: { tag: string; headline: string; body: string };
      match_ready: { tag: string; headline: string; body: string };
      awaiting_user_review: { tag: string; headline: string; body: string };
      terms_changed: { tag: string; headline: string; body: string };
      paused_needs_approval: { tag: string; headline: string; body: string };
      reengagement_scheduled: { tag: string; headline: string; body: string };
      funding_ready: { tag: string; headline: string; body: string };
      settling: { tag: string; headline: string; body: string };
      completed: { tag: string; headline: string; body: string };
      temporarily_unavailable: { tag: string; headline: string; body: string };
      status_updating: { tag: string; headline: string; body: string };
    };
    nextActors: {
      buyer: string;
      seller: string;
      agents: string;
      platform: string;
      none: string;
    };
    offer: {
      initial: string;
      changed: string;
      unknown: string;
      updatedTemplate: string;
    };
    counterpartyTemplate: string;
    headlines: {
      agreedTemplate: string;
      ended: string;
      negotiating: string;
      awaiting: string;
    };
    subs: {
      awaiting: string;
      ended: string;
    };
    chips: {
      agreed: string;
      standing: string;
      buyer: string;
      seller: string;
    };
    timelineHide: string;
    timelineShow: string;
  };
  matchBanner: {
    approvedEyebrow: string;
    approvedBody: string;
    approvedCta: string;
    declinedEyebrow: string;
    declinedSellerView: string;
    declinedOtherView: string;
    pendingEyebrow: string;
    proposedTemplate: string;
    risk: {
      honeyTrap: string;
      lowball: string;
      spammy: string;
      newBuyer: string;
    };
    paidData: {
      label: string;
      template: string;
      txCta: string;
      evidenceCta?: string;
      providerLabel?: string;
      claimLabel?: string;
      impactShadow?: string;
    };
    screen: {
      label: string;
      template: string;
      txCta: string;
      payerCta: string;
    };
    business: {
      label: string;
      template: string;
    };
    topUp: {
      eyebrow: string;
      buyerTemplate: string;
      sellerBody: string;
    };
    approveCta: string;
    approveBusy: string;
    declineCta: string;
    declineReasonLabel: string;
    declineReasonPlaceholder: string;
    declineConfirmCta: string;
    declineConfirmBusy: string;
    declineCancelCta: string;
    buyerWaiting: string;
    outsideWaiting: string;
    counterparty: {
      buyerLabel: string;
      sellerLabel: string;
      viewProfile: string;
      creditPassport: string;
      onX: string;
      more: string;
      record: {
        noDeals: string;
        dealOne: string;
        dealsTemplate: string;
        settledTemplate: string;
        disputedTemplate: string;
      };
    };
  };
  profilePeek: {
    closeLabel: string;
    identityAriaBuyer: string;
    identityAriaSeller: string;
    profileAriaBuyer: string;
    profileAriaSeller: string;
    compactEyebrowBuyer: string;
    compactEyebrowSeller: string;
    fullEyebrowBuyer: string;
    fullEyebrowSeller: string;
    noDisplayName: string;
    copyAddress: string;
    copied: string;
    xNotConnected: string;
    loading: string;
    workRecord: {
      eyebrow: string;
      subtitle: string;
      loading: string;
      locked: string;
      empty: string;
      summaryTemplate: string;
      receiptTemplate: string;
      receiptRail: string;
      receiptView: string;
      receiptDeposit: string;
      receiptWallet: string;
      receiptEvidence?: string;
      receiptProvider?: string;
      receiptClaim?: string;
      receiptImpact?: string;
      buyerEyebrow: string;
      buyerSubtitle: string;
      buyerEmpty: string;
    };
  };
  listingDetail: {
    notFound: {
      tag: string;
      headline: string;
      body: string;
      backCta: string;
    };
    backToSeller: string;
    hero: {
      listingTag: string;
      statuses: {
        open: string;
        expired: string;
        matched: string;
        cancelled: string;
      };
      postedTemplate: string;
    };
    pitch: {
      sectionTag: string;
      headline: string;
      askingLabel: string;
      floorLabelTemplate: string;
      floorNote: string;
      sellerEyebrow: string;
      sellerLabel: string;
      sellerSelfLabel: string;
      selfSuffix: string;
    };
    state: {
      tags: {
        cancelled: string;
        expired: string;
        matched: string;
        scanning: string;
        open: string;
      };
      headlines: {
        cancelled: string;
        expired: string;
        matched: string;
        scanning: string;
        openBuyer: string;
      };
      windowClosesTemplate: string;
      cancelledBody: string;
      expiredMatchedBody: string;
      expiredUnmatchedBody: string;
      matchedBody: string;
      openMatchedCta: string;
      scanningBody: string;
      editCta: string;
      cancelCta: string;
      confirmCancelBody: string;
      confirmYes: string;
      confirmYesBusy: string;
      confirmNo: string;
      buyerBody: string;
      buyerCtaTemplate: string;
    };
    editModal: {
      tag: string;
      title: string;
      body: string;
      titleEyebrow: string;
      descriptionEyebrow: string;
      askingPriceEyebrow: string;
      priceWasTemplate: string;
      floorEyebrow: string;
      floorAria: string;
      floorFootTemplate: string;
      windowDaysEyebrow: string;
      windowReanchored: string;
      windowDefault: string;
      saving: string;
      save: string;
      cancel: string;
    };
  };
  postListing: {
    notConnected: string;
    preview: {
      eyebrow: string;
      acceptCaption: string;
      agentListening: string;
      floorTemplate: string;
      matchedCaption: string;
    };
    sectionWork: {
      eyebrow: string;
      title: string;
      titleLabel: string;
      titleHint: string;
      titlePlaceholder: string;
      descriptionLabel: string;
      descriptionHint: string;
      descriptionPlaceholder: string;
    };
    sectionPricing: {
      eyebrow: string;
      title: string;
      askingLabel: string;
      askingHint: string;
      acceptLabel: string;
      acceptHint: string;
      windowLabel: string;
      windowHint: string;
      windowUnitShort: {
        min: string;
        hr: string;
        day: string;
      };
      unitPickerAria: string;
      unitPickerLabels: {
        min: string;
        hr: string;
        day: string;
      };
    };
    intentWarning: {
      eyebrow: string;
      bodyPart1: string;
      bodyEmphNeed: string;
      bodyPart2: string;
      bodyEmphOffer: string;
      bodyPart3: string;
      postRequestLink: string;
      bodyPart4: string;
      submitEmph: string;
      bodyPart5: string;
    };
    submit: {
      posting: string;
      cta: string;
      fundsCaption: string;
    };
    watchingScanning: string;
    errors: {
      postFailedTemplate: string;
      activating: string;
      activateCta: string;
    };
    yourOffers: {
      eyebrow: string;
      allDismissed: string;
    };
    offerStatuses: {
      open: string;
      expired: string;
      matched: string;
      cancelled: string;
    };
    dismissTitle: string;
    dismissAriaTemplate: string;
    openAriaTemplate: string;
  };
  editDealModal: {
    tag: string;
    title: string;
    body: string;
    deadlineHintShort: string;
    acceptanceHintShort: string;
    deliveryHintShort: string;
    trustedMatchBodyShort: string;
    feeBreakdownTemplate: string;
    saving: string;
    save: string;
    cancel: string;
  };
  eventList: {
    empty: {
      cardTag: string;
      cardBody: string;
      timelineTag: string;
      timelineBody: string;
    };
    jobLabelCard: string;
    jobLabelTimeline: string;
    openLink: string;
    explorerTitle: string;
    chipLabels: {
      price: string;
      counter: string;
      confidence: string;
      score: string;
      skillMatch: string;
      offers: string;
      matched: string;
      reputation: string;
      bestRep: string;
      milestone: string;
      call: string;
      reason: string;
      where: string;
      amount: string;
      from: string;
      security: string;
    };
    sourceDomains: {
      ethereumSepolia: string;
      baseSepolia: string;
      unknownTemplate: string;
    };
    eventTexts: Record<string, string>;
    reasonLabels: Record<string, string>;
    scopeLabels: Record<string, string>;
  };
  /// COMPANY PROFILE band on /profile. The trade card a financier reads before
  /// they fund, so every label here is counterparty-facing.
  /// Trade vocabulary shared by the request form, the direct-deal form and the
  /// deal page. Incoterm CODES are an international standard and stay as they
  /// are in every locale; the gloss beside them is what needs translating.
  /// The financier desk. Money labels here are read while committing capital,
  /// so "you pay" and "you receive" must never be able to swap places in a
  /// translation: each side is its own key rather than one reused string.
  /// Screen-reader labels and hover titles for controls whose visible content
  /// is an icon or a glyph. Cross-cutting, so they live together rather than
  /// scattered through a dozen feature sections.
  /// The editable half of /profile.
  /// Copy that belongs to one page or one small panel and does not justify a
  /// section of its own. Grouped by the surface it appears on.
  pageBits: {
    stake: {
      networkYield: string;
      tokenizedTbills: string;
      verifiedYield: string;
      yourYield: string;
      earnedByYou: string;
      claimableByYou: string;
    };
    dealDetail: { tradeContext: string; anchoredDocuments: string; containerRefPlaceholder: string };
    sellerOffer: { privatePosition: string; trackRepayment: string };
    financierPanels: {
      yourPositions: string;
      expectedReturn: string;
      retiredContract: string;
      positionDetails: string;
      smeTrades: string;
      openFinancierDesk: string;
      loadingPosition: string;
    };
    newsletter: { noSuchIssue: string; couldNotLoadIssue: string; couldNotLoadArchive: string };
    assistant: { transferRef: string };
    /// Worked examples in the free-text composers. Translating them matters
    /// more than most copy: they are what a first-time user copies.
    examples: { brief: string; directDeal: string; scout: string; listing: string };
    supplyDesk: string;
    chooseHowDealStarts: string;
    /// Accessible name for one dot of a horizontal card rail. {n} of {total}.
    railDotTemplate: string;
    registerABusiness: string;
  };
  profileEdit: {
    displayName: string;
    minBudget: string;
    maxBudget: string;
    minDays: string;
    maxDays: string;
    asBuyer: string;
    milestoneSplit: string;
  };
  /// Verified-business registration band.
  registerBusiness: {
    legalCompanyName: string;
    documentType: string;
    businessRegistration: string;
    taxCertificate: string;
    eyebrow: string;
    title: string;
    loading: string;
    yourBusiness: string;
    loadError: string;
    sector: string;
    region: string;
    document: string;
    filePrivacy: string;
    fileSelected: string;
    status: Record<'none' | 'submitted' | 'verified' | 'rejected', string>;
    body: Record<'none' | 'submitted' | 'verified' | 'rejected', string>;
    actions: {
      start: string;
      resubmit: string;
      submit: string;
      submitting: string;
      cancel: string;
      openWorkflow: string;
      view: string;
      retry: string;
    };
    errors: { companyName: string; document: string; submit: string };
    page: {
      eyebrow: string;
      title: string;
      lede: string;
      signInBody: string;
      backToProfile: string;
      progressLabel: string;
      steps: { profile: string; evidence: string; review: string };
      evidenceLockedTitle: string;
      evidenceLockedBody: string;
    };
  };
  discovery: {
    navLabel: string;
    requestsAndOffers: string;
    businesses: string;
  };
  partnersBrowse: {
    sectionTag: string;
    headlineAccent: string;
    allSectors: string;
    regionPlaceholder: string;
    heroBody: string;
    pilotBody: string;
    directoryTitle: string;
    searchLabel: string;
    searchPlaceholder: string;
    sectorLabel: string;
    verifiedOnly: string;
    sortLabel: string;
    sortTrust: string;
    sortName: string;
    clear: string;
    resultsOne: string;
    resultsMany: string;
    refreshing: string;
    errorTitle: string;
    errorBody: string;
    retry: string;
    emptyTitle: string;
    emptyBody: string;
    identityVerified: string;
    identityNote: string;
    listedDetailsNote: string;
    supplies: string;
    markets: string;
    minimumOrder: string;
    leadTime: string;
    leadTimeTemplate: string;
    listedCertifications: string;
    viewTrustProfile: string;
    openDeal: string;
    signInToTrade: string;
    registerBusiness: string;
    pilotOnly: string;
  };
  /// Seller and financier only. The buyer never sees this channel, so the copy
  /// says so plainly rather than leaving it to be inferred.
  financingChat: {
    title: string;
    privateConversation: string;
    coordinateBody: string;
    startTitle: string;
    startBody: string;
    cancelReply: string;
    placeholder: string;
    closedTitle: string;
    closedBody: string;
  };
  financingWorkspace: {
    title: string;
    positionSummary: string;
    amountFinanced: string;
    expectedRepayment: string;
    sellerProtectionReserved: string;
    participants: string;
    dealProgress: string;
    currentStage: string;
  };
  a11y: {
    closeHistory: string;
    sectionNavigation: string;
    toggleTheme: string;
    inputMethod: string;
    dealType: string;
    newReply: string;
    cumulativeTradeVolume: string;
    businessDealViewOnly: string;
    cumulativeYieldDistributed: string;
    findBusinesses: string;
    fundFactoringAndPos: string;
    sendFeedback: string;
    turnOffTips: string;
  };
  financierDashboard: {
    sectionTag: string;
    headline: string;
    intro: string;
    tabs: { factor: string; po: string };
    soon: string;
    filters: { sector: string; region: string; regionPlaceholder: string; clear: string; allSectors: string };
    sellerTierTitle: string;
    sellerPassport: string;
    yourOffer: string;
    editOffer: string;
    makeOffer: string;
    emptyFactoring: { tag: string; body: string };
    emptyPo: { tag: string; body: string };
    close: string;
    signInToPost: string;
    signInToFund: string;
    working: string;
    switchToArc: string;
    offer: {
      faceValue: string;
      quickDiscount: string;
      customDiscount: string;
      customDiscountAria: string;
      invoiceFace: string;
      stillClaimable: string;
      youPayNow: string;
      youReceiveOnSettlement: string;
      yourSpread: string;
      sellerFloor: string;
      replaceOffer: string;
      postOffer: string;
      recipientUnavailable: string;
    };
    po: {
      repayOnPod: string;
      buyerOrAttester: string;
      fundLine: string;
      principal: string;
      repayOnSettlement: string;
      sellerProtection: string;
      repaymentDeadline: string;
      expectedDelivery: string;
      earliestRepayment: string;
      earliestNote: string;
      notDated: string;
      sellerReceivesNow: string;
      youReceiveOnSettlement: string;
      yourSpread: string;
      ifSettlementFallsShort: string;
    };
    extensions: {
      days7: string;
      days30: string;
      days45: string;
      shortCushion: string;
      standard: string;
      extended: string;
    };
  };
  tradeTerms: {
    sectionTitle: string;
    tradeType: string;
    types: { service: string; goods: string; mixed: string };
    incoterms: string;
    incotermsHint: string;
    incotermGloss: { EXW: string; FCA: string; FOB: string; CIF: string; DAP: string; DDP: string };
    paymentTerms: string;
    paymentTermsHint: string;
    paymentTermLabels: { immediate: string; net30: string; net60: string; net90: string };
    sourcingSector: string;
    sourcingSectorHint: string;
    sourcingRegion: string;
    sourcingRegionHint: string;
    sourcingRegionPlaceholder: string;
    counterpartyPlaceholder: string;
    counterpartyRegionPlaceholder: string;
    removeDocument: string;
    milestoneSplitAria: string;
  };
  smeCompany: {
    sectionTag: string;
    headline: string;
    loading: string;
    edit: string;
    addCompany: string;
    emptyBody: string;
    verificationRequired: string;
    saveError: string;
    save: string;
    saving: string;
    cancel: string;
    discovery: { label: string; body: string };
    repayment: {
      eyebrow: string;
      windowTemplate: string;
      onTimeRate: string;
      avgDaysToSettle: string;
      defaults: string;
      financingRepaid: string;
    };
    view: {
      name: string;
      sector: string;
      region: string;
      founded: string;
      size: string;
      regTaxId: string;
      markets: string;
      annualVolume: string;
      minOrder: string;
      leadTime: string;
      leadTimeTemplate: string;
      certifications: string;
      website: string;
    };
    form: {
      companyName: string;
      companyNamePlaceholder: string;
      companyNameHint: string;
      sector: string;
      region: string;
      regionPlaceholder: string;
      yearFounded: string;
      employeeBand: string;
      website: string;
      regTaxId: string;
      regTaxIdPlaceholder: string;
      primaryMarkets: string;
      primaryMarketsPlaceholder: string;
      annualVolume: string;
      minOrder: string;
      minOrderPlaceholder: string;
      leadTimeDays: string;
      leadTimePlaceholder: string;
      certifications: string;
      certificationsPlaceholder: string;
      hints: {
        companyName: string;
        sector: string;
        region: string;
        yearFounded: string;
        employeeBand: string;
        website: string;
        regTaxId: string;
        primaryMarkets: string;
        annualVolume: string;
        minOrder: string;
        leadTimeDays: string;
        certifications: string;
      };
    };
    sectors: {
      agriculture: string;
      textiles: string;
      electronics: string;
      logistics: string;
      manufacturing: string;
      services: string;
      other: string;
    };
    employeeBands: { micro: string; small: string; medium: string };
    volumeBands: {
      under100k: string;
      from100kTo1m: string;
      from1mTo10m: string;
      over10m: string;
    };
  };
  creditPassport: {
    eyebrow: string;
    fallbackName: string;
    copyAddressTitle: string;
    copyAddressIdle: string;
    copyAddressDone: string;
    invalid: {
      headline: string;
      body: string;
    };
    error: {
      headline: string;
      bodyTemplate: string;
    };
    scorePanel: {
      compositeScore: string;
      outOfTotal: string;
      nextTier: string;
      nextTierTemplate: string;
    };
    stats: {
      success: string;
      disputed: string;
      failed: string;
      activeStake: string;
      syncing: string;
      syncingTitle: string;
    };
    meta: {
      settled: string;
      tenure: string;
      tenureDaysSuffix: string;
    };
    /// Skills this wallet is verified to do. Present on the passport only when
    /// at least one verification is complete; there is no empty state, because
    /// "no verified skills" is not a fact worth a panel.
    skills: {
      eyebrow: string;
      caption: string;
      verifiedOn: string;
      expires: string;
    };
    factors: {
      eyebrow: string;
      scaleCaption: string;
      labels: {
        completion: string;
        stake: string;
        volume: string;
        tenure: string;
        activity: string;
        referral: string;
      };
    };
    footer: {
      disclaimer: string;
      verifiedLink: string;
    };
  };
  feedback: {
    hero: {
      tag: string;
      headline: string;
      body: string;
    };
    categories: {
      bug: { label: string; blurb: string };
      improvement: { label: string; blurb: string };
      other: { label: string; blurb: string };
      praise: { label: string; blurb: string };
    };
    fields: {
      categoryEyebrow: string;
      titleEyebrow: string;
      messageEyebrow: string;
      screenshotsEyebrowTemplate: string;
      whereEyebrow: string;
      contactEyebrow: string;
    };
    placeholders: {
      title: string;
      message: string;
      where: string;
      contact: string;
    };
    dropZone: {
      bodyBefore: string;
      chooseFiles: string;
      bodyAfter: string;
      formatLine: string;
      removeAria: string;
    };
    errors: {
      maxShotsTemplate: string;
      imageReadFailed: string;
      shortTitle: string;
      shortMessage: string;
      submitFailed: string;
    };
    submit: {
      sending: string;
      cta: string;
      noAccountNeeded: string;
      sendingAsTemplate: string;
    };
    success: {
      headline: string;
      body: string;
      sendAnother: string;
      backToApp: string;
    };
  };
  extensionRequest: {
    ariaLabel: string;
    tag: string;
    title: string;
    body: string;
    durationEyebrow: string;
    reasonEyebrow: string;
    reasonPlaceholder: string;
    presets: {
      sixHours: string;
      twelveHours: string;
      oneDay: string;
      threeDays: string;
      sevenDays: string;
    };
    errorFallback: string;
    sending: string;
    send: string;
    cancel: string;
  };
  fundAgentOptions: {
    eyebrow: string;
    wallet: { label: string; tooltip: string; web3Note: string };
    otherAgent: { labelSeller: string; labelBuyer: string; tooltip: string };
    gateway: { label: string; tooltip: string; fundCta: string; noRecipient: string };
    chain: { label: string; tooltip: string; cta: string; note: string };
    moveCta: string;
    moving: string;
    moved: string;
    moveFailed: string;
  };
  depositRails: {
    chooserAria: string;
    soon: string;
    direct: { tab: string; tag: string; title: string; blurb: string };
    gateway: { tab: string; tag: string; title: string; blurb: string };
    cctp: { tab: string; tag: string; title: string; blurb: string };
    onramp: {
      tab: string;
      tag: string;
      title: string;
      blurb: string;
      body: string;
      inLabel: string;
      outLabel: string;
    };
  };
  /// Why a wallet is not at the next tier yet. One block, used by the passport,
  /// the profile card and the stake page, because all three used to answer this
  /// question differently and all three were wrong when a ceiling was binding.
  tierProgress: {
    pointsTemplate: string;
    dealsTemplate: string;
    dealsOneTemplate: string;
    concentrationTemplate: string;
    topTier: string;
  };
  chatPanel: {
    withCounterpartyTemplate: string;
    telegramNote: string;
    loadError: string;
    emptyMessage: string;
    inputPlaceholder: string;
    sending: string;
    send: string;
  };
  liveBidsPanel: {
    empty: {
      title: string;
      body: string;
    };
    leadBadge: string;
    profileTitleTemplate: string;
    profileAriaTemplate: string;
    counter: string;
    eta: string;
    scoreOutOf: string;
  };
  listingsBrowse: {
    signInTag: string;
    signInBody: string;
    heroTag: string;
    heroHeadlinePart1: string;
    heroHeadlinePart2Prefix: string;
    heroAccent: string;
    heroBody: string;
    filters: {
      all: string;
      offers: string;
      briefs: string;
    };
    findTag: string;
    findTitle: string;
    findBody: string;
    searchLabel: string;
    searchPlaceholder: string;
    typeFilterLabel: string;
    scopeFilterLabel: string;
    scope: {
      all: string;
      services: string;
      business: string;
    };
    sortFilterLabel: string;
    sort: {
      newest: string;
      lowestPrice: string;
      highestPrice: string;
    };
    clearFilters: string;
    resultsOne: string;
    resultsMany: string;
    refreshing: string;
    retry: string;
    partial: {
      offers: string;
      requests: string;
      all: string;
    };
    sections: {
      personalTitle: string;
      personalNote: string;
      hiringTitle: string;
      hiringNote: string;
      businessTitle: string;
      businessNote: string;
      businessViewOnlyNote: string;
    };
    liveCaption: string;
    businessFilterNote: string;
    error: string;
    emptyAllTag: string;
    emptyAllBody: string;
    emptyFilteredTag: string;
    emptyFilteredTemplate: string;
    emptyFilteredTitle: string;
    emptyFilteredBody: string;
    card: {
      statusMatched: string;
      statusOffer: string;
      statusRequest: string;
      priceLabelAsking: string;
      priceLabelBudget: string;
      partyRoleSeller: string;
      partyRoleBuyer: string;
      selfSuffix: string;
      metaBidOne: string;
      metaBidsTemplate: string;
      metaAwaitingBids: string;
      priceUnitTemplate: string;
      matchedBefore: string;
      availableUntilTemplate: string;
      dueTemplate: string;
      individualSeller: string;
      businessSeller: string;
      individualBuyer: string;
      businessBuyer: string;
    };
  };
  agentWithdrawCard: {
    header: {
      eyebrow: string;
      title: string;
      subtitle: string;
    };
    agents: {
      buyer: string;
      seller: string;
      notConfigured: string;
      balanceLabel: string;
    };
    form: {
      fromEyebrow: string;
      amountEyebrow: string;
      availableTemplate: string;
      amountPlaceholder: string;
      destinationEyebrow: string;
      destinationPlaceholder: string;
      yourWalletHint: string;
      verify: {
        checking: string;
        verifiedEoa: string;
        contractDanger: string;
      };
    };
    submit: {
      signIn: string;
      sending: string;
      withdrawTemplate: string;
      agentFallback: string;
    };
    success: {
      message: string;
      referenceLabel: string;
    };
    errors: {
      invalidAddress: string;
      failedTag: string;
    };
  };
  unifiedBalanceCard: {
    eyebrow: string;
    tagline: string;
    modes: { add: string; fund: string; cashout: string };
    fromLabel: string;
    toAgentLabel: string;
    toChainLabel: string;
    sourceWallet: string;
    agents: { buyer: string; seller: string };
    amountLabel: string;
    destinationLabel: string;
    invalidAddress: string;
    submit: { add: string; fund: string; cashout: string; working: string };
    success: { added: string; funded: string; cashedOut: string };
    sweepCta: string;
    sweepDone: string;
  };
  bridgeCard: {
    title: string;
    cctpV2: string;
    arcTestnet: string;
    buyerAgentNotConfigured: string;
    inFlightTemplate: string;
    reassurance: string;
    connect: {
      cta: string;
      hint: string;
      useDeposit: string;
      useWallet: string;
    };
    solana: {
      eyebrow: string;
      blurb: string;
      conflictTemplate: string;
      needsSol: string;
      connect: string;
      connecting: string;
      install: string;
      connected: string;
      disconnect: string;
      getUsdc: string;
      getGas: string;
      copied: string;
    };
    eyebrow: {
      bridge: string;
      topUpAgent: string;
      sourceChain: string;
      amount: string;
      mintsTo: string;
      activity: string;
    };
    sourceChain: {
      sepoliaDomainTemplate: string;
      devnetAppKit: string;
      walletOnlyTag: string;
      walletOnlyTitle: string;
      circleOnlyTag: string;
      solanaCircleOnlyTitle: string;
    };
    amount: {
      balanceMaxTemplate: string;
      balanceTemplate: string;
      maxTitle: string;
    };
    submit: {
      bridgeFromTemplate: string;
      switchToTemplate: string;
      switchingToTemplate: string;
      starting: string;
      solanaNeedsCircle: string;
      connectWallet: string;
    };
    activity: {
      clearHistory: string;
      clearHistoryTitle: string;
      bridgeSingular: string;
      bridgePlural: string;
    };
    recipient: {
      eyebrowChoose: string;
      selfSummary: string;
      sendElsewhere: string;
      identityLabel: string;
      identityHint: string;
      buyerLabel: string;
      sellerLabel: string;
      customLabel: string;
      customPlaceholder: string;
      customWarning: string;
      notConfigured: string;
      verify: {
        checking: string;
        verifiedEoa: string;
        contractDanger: string;
        invalid: string;
      };
    };
    row: {
      stale: string;
      burnLabelTemplate: string;
      mintLabel: string;
      mintLabelOutTemplate: string;
      routeFromTemplate: string;
      routeToTemplate: string;
      stuckNote: string;
      recheckOnChain: string;
      retryFromStart: string;
      dismiss: string;
      elapsed: {
        secondsTemplate: string;
        minutesTemplate: string;
        hoursTemplate: string;
      };
      phase: {
        switchingTo: string;
        switchingChain: string;
        approving: string;
        burning: string;
        relaying: string;
        attesting: string;
        minting: string;
        done: string;
        error: string;
      };
      progress: {
        approve: string;
        burn: string;
        attest: string;
        mint: string;
      };
      steps: {
        approveTemplate: string;
        burnTemplate: string;
        circleAttestation: string;
        attestationHint: string;
        mintArc: string;
        mintToTemplate: string;
      };
      error: {
        errorBadge: string;
      };
    };
    circleFund: {
      badgeFunded: string;
      badgeFundToBridge: string;
      statusChecking: string;
      statusEmpty: string;
      statusFunded: string;
      statusSendUsdc: string;
      balanceHere: string;
      gas: string;
      sponsored: string;
      covered: string;
      needed: string;
      addressLabel: string;
      provisioning: string;
      copy: string;
      copied: string;
      getUsdc: string;
      requesting: string;
      testUsdcRequested: string;
      circleFaucet: string;
    };
    solanaFund: {
      addressLabel: string;
      provisioning: string;
      setupFailed: string;
      retry: string;
      note: string;
      copy: string;
      copied: string;
      faucet: string;
    };
    web3Fund: {
      eyebrowTemplate: string;
      descriptionTemplate: string;
      claimGasTemplate: string;
      getTestUsdc: string;
      requesting: string;
      testUsdcSentTemplate: string;
      copied: string;
    };
  };
  bridgeChooser: {
    poweredBy: string;
    transferHistory: string;
    cctp: { tag: string; title: string; protocol: string; blurb: string; nudge: string };
    gateway: { tag: string; title: string; protocol: string; blurb: string; nudge: string };
  };
  gatewaySteps: {
    build: string;
    sign: string;
    attest: string;
    land: string;
    view: string;
  };
  chainErrors: {
    declined: string;
    feeHeadroom: string;
    needsGas: string;
    notEnough: string;
    walletBusy: string;
    wrongChain: string;
    network: string;
    generic: string;
    /// Submitted and not confirmed yet. NEVER a failure: the money may well
    /// have moved, and a record marked failed here is a lie that outlives the
    /// transaction (see shared/chain/confirmTx.ts).
    pending: string;
    /// The chain ran it and rejected it. A real failure, distinct from the
    /// generic "did not go through".
    reverted: string;
  };
  gatewayTopUp: {
    cta: string;
    fundPool: string;
    moving: string;
    done: string;
    failed: string;
    availableTemplate: string;
    shortTemplate: string;
  };
  /// Letting an agent draw on the identity wallet's stake. The vault resolves
  /// an agent to its identity before reading a balance, but only once the pair
  /// is bound, and the identity's half of that handshake is a signature only
  /// the user can give.
  agentStakeBinding: {
    tag: string;
    title: string;
    body: string;
    foreignBody: string;
    cta: string;
    busyCta: string;
    doneCta: string;
    incomplete: string;
    failed: string;
  };
  gatewayCard: {
    connectCta: string;
    soonTag: string;
    soonBody: string;
    tag: string;
    title: string;
    confirmed: string;
    pending: string;
    empty: string;
    poolFrom: string;
    amount: string;
    maxTemplate: string;
    inWallet: string;
    cta: string;
    switchTemplate: string;
    switching: string;
    depositing: string;
    pooled: string;
    connect: string;
    failed: string;
    moveTag: string;
    moveTo: string;
    toCustom: string;
    moveCtaTemplate: string;
    toWallet: string;
    toBuyer: string;
    toSeller: string;
    moveCta: string;
    moving: string;
    moved: string;
    moveFailed: string;
    byChain: string;
    dismiss: string;
    viewTx: string;
    pulledTemplate: string;
    /// Step 01 of the way in. Step 02 reuses `moveCta`.
    stepAdd: string;
    /// The way out, where the destination is a choice.
    sendTag: string;
    /// Stands in for the chain picker on the way in, where Arc is the only
    /// destination.
    arcPinned: string;
    /// Nothing pooled, so there is nothing to move.
    outEmpty: string;
  };
  stakeCard: {
    eyebrow: {
      stake: string;
    };
    signedOut: {
      body: string;
    };
    summary: {
      usdcActive: string;
      syncing: string;
      syncingTitle: string;
      freeLabel: string;
      reservedLabel: string;
      reservedTitle: string;
      coolingLabel: string;
    };
    wrongNetwork: {
      eyebrow: string;
      body: string;
      switchButton: string;
    };
    vaultNotDeployed: {
      prefix: string;
      middle: string;
      suffix: string;
    };
    yield: {
      eyebrow: string;
      bodyPrefix: string;
      bodyMiddle: string;
    };
    depositForm: {
      label: string;
      max: string;
      maxTitleTemplate: string;
      maxTitleLoading: string;
      inputAria: string;
      submit: string;
      submitBusy: string;
      insufficientBalanceTemplate: string;
    };
    withdrawForm: {
      label: string;
      max: string;
      maxTitleFreeTemplate: string;
      maxTitleAllReserved: string;
      maxTitleNone: string;
      inputAria: string;
      submit: string;
      submitBusy: string;
      insufficientFreeTemplate: string;
      insufficientStakeTemplate: string;
    };
    confirm: {
      eyebrow: string;
      coolPrefix: string;
      coolMiddle: string;
      daysTemplate: string;
      roundedPrefix: string;
      roundedMiddle: string;
      smallestSingleTemplate: string;
      smallestMultiTemplate: string;
      roundedSuffix: string;
      disclaimerTemplate: string;
      cancel: string;
      confirm: string;
    };
    cooldownFooterTemplate: string;
    cooling: {
      label: string;
      usdcCooling: string;
      preparing: string;
      claimReady: string;
      claimInDaysHoursTemplate: string;
      claimInHoursMinutesTemplate: string;
      cancelTitle: string;
      cancelLabel: string;
      cancelling: string;
      claimLabel: string;
      claimBusy: string;
    };
    recent: {
      label: string;
      kinds: {
        deposit: string;
        request: string;
        cancel: string;
        claim: string;
      };
      failedFallback: string;
    };
    positionAction: {
      confirmRequestTemplate: string;
    };
    errors: {
      insufficientBalanceTemplate: string;
      insufficientFreeStakeTemplate: string;
      insufficientStakeTemplate: string;
      walletNotReady: string;
    };
  };
  directDealDetail: {
    hero: {
      eyebrow: string;
      openedTemplate: string;
    };
    agentResearch: {
      tag: string;
      buyerIntro: string;
      sellerIntro: string;
    };
    errorStates: {
      privateEyebrow: string;
      privateTitle: string;
      privateBody: string;
      privateCta: string;
      notFoundEyebrow: string;
      notFoundTitle: string;
      notFoundBody: string;
      notFoundCta: string;
      transientEyebrow: string;
      transientTitle: string;
      transientBody: string;
      transientCta: string;
      transientRetrying: string;
    };
    connectGate: {
      eyebrow: string;
      titleLead: string;
      titleAccent: string;
      body: string;
    };
    notPartyGate: {
      eyebrow: string;
      titleLead: string;
      titleAccent: string;
      body: string;
      ctaOpen: string;
      ctaHome: string;
    };
    legacyBanner: {
      eyebrow: string;
      title: string;
      body: string;
      cta: string;
    };
    parties: {
      cardLabel: string;
      buyer: string;
      seller: string;
      youSuffix: string;
    };
    funding: {
      cardLabel: string;
      dealAmount: string;
      buyerFunds: string;
      sellerReceives: string;
      platformFee: string;
      settlementCurrency: string;
      feePending: string;
      totalPending: string;
      quoteLoading: string;
      noLocalConversion: string;
      onDeliveryTemplate: string;
      onVerificationTemplate: string;
      protectedEyebrow: string;
    };
    fundingSafety: {
      settled: string;
      awaitingAcceptanceBuyer: string;
      awaitingAcceptanceSeller: string;
      awaitingFundingBuyer: string;
      awaitingFundingSeller: string;
      activeBuyer: string;
      activeSeller: string;
    };
    terms: {
      eyebrow: string;
      title: string;
      deadlineTemplate: string;
      noDeadline: string;
      deliveryProofLabel: string;
      deliveryHeldLabel: string;
      deliveryHeldBody: string;
      deliveryVerifyingLabel: string;
      deliveryVerifyingBody: string;
      deliveryReviewLabel: string;
      deliveryReviewBody: string;
      deliveryOkLabel: string;
      deliveryOkBody: string;
    };
    progress: {
      eyebrow: string;
      titleLead: string;
      titleAccent: string;
    };
    progressTrack: {
      opened: string;
      sellerApproved: string;
      accepted: string;
      delivered: string;
      firstReleasedTemplate: string;
      finalReleasedTemplate: string;
    };
    actions: {
      eyebrow: string;
      titleLead: string;
      titleAccent: string;
    };
    proposeBlock: {
      orEyebrow: string;
      disputeBody: string;
      cancelBody: string;
      disputeCta: string;
      cancelCta: string;
    };
    fundingTxLabel: string;
    refundTxLabel: string;
    settlementRecord: {
      title: string;
      body: string;
      loadingLabel: string;
      errorBody: string;
      retry: string;
      kinds: { escrow_funding: string; milestone_payout: string };
      states: {
        created: string;
        preparing: string;
        submitted: string;
        verifying: string;
        completed: string;
        needs_attention: string;
        cancelled: string;
      };
      nextLabel: string;
      next: {
        buyer: string;
        seller: string;
        counterparty: string;
        karwan: string;
        support: string;
        none: string;
      };
      copyReference: string;
      showProof: string;
      hideProof: string;
      legStates: {
        planned: string;
        submitted: string;
        confirmed: string;
        verified: string;
        failed: string;
      };
      providerReference: string;
      openProof: string;
      legacyTitle: string;
      legacyBody: string;
      legacyFunding: string;
      legacyRefund: string;
    };
    chat: {
      eyebrow: string;
      titleLead: string;
      titleAccent: string;
      body: string;
      counterpartySellerTemplate: string;
      counterpartyBuyerTemplate: string;
    };
    actionPanel: {
      settled: {
        releasedFromDispute: string;
        autoReleased: string;
        normal: string;
        financed: string;
        cashoutTemplate: string;
        settleTimeEyebrow: string;
        repeatDeal: string;
      };
      cancelled: {
        preAccept: string;
        unilateral: string;
        refundFromDisputePrefix: string;
        refundFromDisputePartialTailTemplate: string;
        refundFromDisputeFullTail: string;
        platformAttributedPrefix: string;
        mutualPrefix: string;
        mutualPartialTemplate: string;
        mutualFullTemplate: string;
        reasonEyebrow: string;
      };
      disputed: {
        intro: string;
        refundLabel: string;
        refundBody: string;
        refundBodyWithReservation: string;
        releaseLabel: string;
        releaseBody: string;
      };
      awaitingAcceptance: {
        sellerIntro: string;
        trustedMatchPrefix: string;
        trustedMatchMiddleTemplate: string;
        trustedMatchSuffix: string;
        acceptCta: string;
        acceptBusy: string;
        buyerWaiting: string;
        buyerWaitingInviteTemplate: string;
        editTermsCta: string;
        cancelCta: string;
        cancelBusy: string;
      };
      awaitingFunding: {
        /// Shown when the escrow already HOLDS the buyer's USDC and only
        /// activation is missing. Without it the page offers "Review and fund"
        /// for a total they have already paid, which is why a deal in this
        /// state sits untouched.
        heldIntro: string;
        activateCta: string;
        buyerIntro: string;
        sellerIntro: string;
        reviewCta: string;
        quoteBusy: string;
        retryQuoteCta: string;
        editTermsCta: string;
        cancelCta: string;
        cancelBusy: string;
      };
      awaitingDelivery: {
        sellerIntroTemplate: string;
        proofEyebrow: string;
        proofPlaceholder: string;
        markDeliveredCta: string;
        markDeliveredBusy: string;
        extensionTitlePending: string;
        extensionTitleAsk: string;
        extensionPendingCta: string;
        extensionRequestCta: string;
        buyerIntro: string;
        buyerNoDeadlineTail: string;
        buyerHasDeadlineTail: string;
        buyerDeadlinePassedNote: string;
        reclaimCta: string;
        reclaimBusy: string;
      };
      releaseBlocked: {
        buyerMismatch: string;
        sellerMismatch: string;
        noAgent: string;
      };
      awaitingFirstRelease: {
        buyerIntroTemplate: string;
        buyerAutoReleasePrefixTemplate: string;
        buyerAutoReleaseSuffix: string;
        buyerExpiredTemplate: string;
        releaseHeldNote: string;
        resubmitLabel: string;
        resubmitCta: string;
        resubmitBusy: string;
        releaseCtaTemplate: string;
        releaseBusy: string;
        appealCta: string;
        sellerWaitingTemplate: string;
        sellerOpenPrefix: string;
        sellerOpenSuffixTemplate: string;
        sellerExpiredTemplate: string;
      };
      awaitingFinalRelease: {
        buyerIntroTemplate: string;
        buyerResponseExpiredTemplate: string;
        buyerNoAppealTemplate: string;
        releaseCtaTemplate: string;
        releaseBusy: string;
        appealCta: string;
        sellerWaitingTemplate: string;
        sellerAppealOpenPrefix: string;
        sellerAppealOpenSuffixTemplate: string;
        sellerResponseExpiredTemplate: string;
        sellerBuyerResponded: string;
        sellerGracePrefix: string;
        sellerGraceSuffix: string;
        raiseAppealCta: string;
        raiseAppealBusy: string;
        openDisputeCta: string;
      };
      delayAppealResponder: {
        eyebrow: string;
        prefix: string;
        suffixTemplate: string;
        placeholder: string;
        submitCta: string;
        submitBusy: string;
      };
      pendingInvite: {
        eyebrow: string;
        bodyTemplate: string;
        copyCta: string;
        copied: string;
      };
      acceptanceCountdown: {
        openSellerPrefix: string;
        openSellerSuffix: string;
        openBuyerPrefix: string;
        openBuyerSuffix: string;
        expired: string;
      };
      extensionDuration: {
        dayTemplate: string;
        daysTemplate: string;
        hourTemplate: string;
        hoursTemplate: string;
      };
      extensionPending: {
        eyebrow: string;
        prefix: string;
        reasonPrefix: string;
        duration: {
          dayTemplate: string;
          daysTemplate: string;
          hourTemplate: string;
          hoursTemplate: string;
        };
      };
      extensionBuyerBanner: {
        eyebrow: string;
        requestPrefix: string;
        requestSuffix: string;
        reasonPrefix: string;
        newDeadlinePrefix: string;
        approveCta: string;
        approveBusy: string;
        declineCta: string;
        duration: {
          dayTemplate: string;
          daysTemplate: string;
          hourTemplate: string;
          hoursTemplate: string;
        };
      };
    };
    acceptConsentModal: {
      eyebrow: string;
      title: string;
      body: string;
      confirmCta: string;
      confirmBusy: string;
      cancelCta: string;
    };
    fundingConsentModal: {
      eyebrow: string;
      title: string;
      body: string;
      dealAmount: string;
      buyerFee: string;
      total: string;
      sellerReceives: string;
      settlement: string;
      noConversion: string;
      confirmCta: string;
      confirmBusy: string;
      cancelCta: string;
    };
    cancelProposalBanner: {
      kindReleaseToSeller: string;
      kindRefundBuyer: string;
      kindPlatformMisroute: string;
      kindMutualCancel: string;
      proposedTemplate: string;
      proposerBuyer: string;
      proposerSeller: string;
      byTemplate: string;
      reasonEyebrow: string;
      outcomeReleaseFromDispute: string;
      outcomeRefundFromDisputePartialTemplate: string;
      outcomeRefundFromDisputeFull: string;
      outcomePlatformPrefix: string;
      outcomeMutualPrefix: string;
      outcomePartialTemplate: string;
      outcomeFull: string;
      legacyCta: string;
      legacyNote: string;
      acceptReleaseCta: string;
      acceptRefundCta: string;
      confirmingBusy: string;
      declineDisputeCta: string;
      declineCancelCta: string;
      waitingNote: string;
    };
    proposeCancelModal: {
      eyebrowResolution: string;
      eyebrowCancellation: string;
      titleDispute: string;
      titleCancel: string;
      disputeBody: string;
      cancelBodyTemplate: string;
      cancelOutcomePartialTemplate: string;
      cancelOutcomeFull: string;
      kindEyebrowResolution: string;
      kindEyebrowKind: string;
      kindRefundBuyerLabel: string;
      kindRefundBuyerBody: string;
      kindRefundBuyerBodyWithReservation: string;
      kindReleaseSellerLabel: string;
      kindReleaseSellerBody: string;
      kindMutualLabel: string;
      kindMutualBody: string;
      kindPlatformLabel: string;
      kindPlatformBody: string;
      reasonEyebrow: string;
      reasonPlaceholder: string;
      submitCta: string;
      submitBusy: string;
      cancelCta: string;
    };
    errors: {
      insufficientBalanceTitle: string;
      insufficientBalanceBuyerPrefix: string;
      insufficientBalanceBuyerLink: string;
      insufficientBalanceSeller: string;
      insufficientGas: string;
      insufficientStakeTitle: string;
      insufficientStakeLink: string;
      insufficientStakeSuffix: string;
      acceptEscrowFailedTitle: string;
      approvalFailed: string;
      fundingFailed: string;
      quoteChanged: string;
    };
  };
  walletsPanel: {
    eyebrow: string;
    headline: string;
    intro: {
      circle: string;
      web3: string;
    };
    rows: {
      identity: {
        tag: string;
        title: string;
        purposeCircle: string;
        purposeWeb3: string;
      };
      buyer: {
        tag: string;
        title: string;
        purpose: string;
      };
      seller: {
        tag: string;
        title: string;
        purpose: string;
      };
      bridge: {
        tag: string;
        title: string;
        purpose: string;
        gasSecondaryTemplate: string;
      };
    };
    agentsNotCreated: string;
    faucetButton: {
      idle: string;
      busy: string;
    };
    copyAddress: {
      idle: string;
      copied: string;
    };
    bridgeActions: {
      topUpBase: string;
      requesting: string;
      ethereumGas: string;
    };
    chains: {
      baseSepolia: string;
      ethereumSepolia: string;
    };
    notes: {
      faucetCopied: string;
      faucetFallbackTemplate: string;
      gasRequestedTemplate: string;
    };
  };
  connectX: {
    connectCta: string;
    disabledTitle: string;
    redirecting: string;
    working: string;
    unlink: string;
    handleLabel: string;
    handlePlaceholder: string;
    save: string;
    saving: string;
    cancel: string;
    handleNote: string;
    errors: {
      bindFailed: string;
      accountTaken: string;
      handleTakenTemplate: string;
      invalidHandle: string;
    };
  };
  telegramConnect: {
    chatLabelTemplate: string;
    button: {
      brand: string;
      offBadge: string;
      linkedBadge: string;
      connectLabel: string;
      connectTitle: string;
      manageTitleTemplate: string;
      disabledTitle: string;
    };
    modal: {
      eyebrow: string;
      title: string;
      subheading: string;
      closeAria: string;
      startBody: string;
      generateCta: string;
      waitingBodyBefore: string;
      startWord: string;
      waitingBodyAfter: string;
      openTelegramCta: string;
      waitingNoteTitle: string;
      waitingNoteBody: string;
    };
    linkedCard: {
      label: string;
      linkedAtTemplate: string;
      unlinkCta: string;
    };
  };
  reputationBadge: {
    popoverAriaLabel: string;
    eyebrow: string;
    dealCountOneTemplate: string;
    dealCountManyTemplate: string;
    scoreMaxTemplate: string;
    unratedLabel: string;
    compositeFootnote: string;
    creditPassportLink: string;
    stats: {
      success: string;
      disputed: string;
      failed: string;
    };
    legacyTiers: {
      unrated: string;
      topTier: string;
      veteran: string;
      trusted: string;
      cautious: string;
      watchlist: string;
    };
  };
  arcFundCard: {
    agentBuyerLabel: string;
    agentSellerLabel: string;
    header: {
      eyebrow: string;
      title: string;
      subtitleCircle: string;
      subtitleWeb3: string;
      inFlightTemplate: string;
      refreshTitle: string;
      refresh: string;
      refreshing: string;
    };
    recipient: {
      eyebrow: string;
      notConfigured: string;
      balance: string;
    };
    amount: {
      eyebrow: string;
      availableTemplate: string;
    };
    submit: {
      signInToFund: string;
      switchingToArc: string;
      transferInProgress: string;
      switchToArc: string;
      sendToTemplate: string;
      agentFallback: string;
      activeNote: string;
    };
    activity: {
      eyebrow: string;
      transferOne: string;
      transferMany: string;
    };
    phase: {
      switching: string;
      signing: string;
      confirming: string;
      sending: string;
      /// Submitted and on chain, confirmation not seen yet. NOT a failure: the
      /// state exists because a confirmation watcher timing out was being shown
      /// to users as a failed transfer that had in fact settled.
      unconfirmed: string;
      /// Confirmed on chain, with Karwan's own record still catching up. A
      /// separate state from 'error' for the same reason 'unconfirmed' is: the
      /// money has moved, and the row must not read Failed.
      settling: string;
      done: string;
      error: string;
    };
    elapsed: {
      secondsTemplate: string;
      minutesTemplate: string;
      hoursMinutesTemplate: string;
    };
    row: {
      agentKeyBuyer: string;
      agentKeySeller: string;
      slow: string;
      viewOnArcscan: string;
      errorLabel: string;
      reference: string;
      recipient: string;
      txArc: string;
      stuckNote: string;
      retry: string;
      dismiss: string;
    };
  };
  landingPage: {
    tabs: { overview: string; howItWorks: string; flow: string; getStarted: string };
    /// Label on the cue that advances one row. Was a hardcoded English
    /// "Scroll" until the landing became a stack of panels.
    scrollCue: string;
    hero: {
      tag: string;
      titleLine1: string;
      titleLine2: string;
      titleAccent: string;
      body: string;
      ctaPrimary: string;
      ctaSecondary: string;
      footnote: string;
    };
    ecosystem: { tag: string };
    directDeals: {
      tag: string;
      title: string;
      body: string;
      tile1Title: string;
      tile1Body: string;
      tile2Title: string;
      tile2Body: string;
    };
    managedDeals: {
      tag: string;
      title: string;
      body: string;
      tile1Title: string;
      tile1Body: string;
      tile2Title: string;
      tile2Body: string;
    };
    howItWorks: {
      tag: string;
      titleStart: string;
      titleAccent: string;
      titleEnd: string;
      rail1Title: string;
      rail1Body: string;
      rail2Title: string;
      rail2Body: string;
      rail3Title: string;
      rail3Body: string;
    };
    flow: {
      tag: string;
      title: string;
      liveLabel: string;
      steps: {
        posted: { tag: string; label: string };
        bids: { tag: string; label: string };
        accept: { tag: string; label: string };
        escrow: { tag: string; label: string };
        deliver: { tag: string; label: string };
        settle: { tag: string; label: string };
      };
      kpis: {
        dealsLabel: string;
        settledLabel: string;
        volumeLabel: string;
      };
    };
    tradeLanes: {
      tag: string;
      titleStart: string;
      titleAccent: string;
      titleEnd: string;
      footnote: string;
      laneIdPrefix: string;
      toAria: string;
      avgPrefix: string;
      minutesUnit: string;
      cities: {
        lagos: string;
        dubai: string;
        nairobi: string;
        london: string;
        karachi: string;
        singapore: string;
        cairo: string;
        frankfurt: string;
        accra: string;
        newYork: string;
        darEsSalaam: string;
        mumbai: string;
      };
    };
    earlyTrades: {
      tag: string;
      title: string;
      footnote: string;
      cards: {
        buyerLagos: { role: string; city: string; title: string; unit: string; sub: string };
        sellerNairobi: { role: string; city: string; title: string; unit: string; sub: string };
        buyerKarachi: { role: string; city: string; title: string; unit: string; sub: string };
      };
    };
    getStarted: {
      tag: string;
      title: string;
      step1Title: string;
      step1Body: string;
      step2Title: string;
      step2Body: string;
      step3Title: string;
      step3Body: string;
    };
    finalCta: {
      tag: string;
      srLabel: string;
      title: string;
      body: string;
      ctaPrimary: string;
      ctaSecondary: string;
    };
  };
  legacyPage: {
    gate: {
      tag: string;
      titleBefore: string;
      titleAccent: string;
      titleAfter: string;
      body: string;
      button: string;
    };
    closed: { tag: string; title: string; body: string; home: string };
    hero: {
      tag: string;
      titleBefore: string;
      titleAccent: string;
      titleAfter: string;
      body: string;
      windowClosesIn: string;
      afterWindowNote: string;
    };
    stake: {
      tag: string;
      title: string;
      bodyBefore: string;
      stakeLink: string;
      bodyAfter: string;
      empty: { headline: string; body: string };
      stats: { active: string; cooling: string };
      wrongChain: string;
      groups: {
        activeTitleTemplate: string;
        startCooldownTemplate: string;
        signing: string;
      };
      coolingTitle: string;
      claimReady: string;
      claimInTemplate: string;
      cancelLink: string;
      claimingLabel: string;
      claimToWallet: string;
      txPrefix: string;
      confirmDialog: {
        titleTemplate: string;
        bodyTemplate: string;
        confirm: string;
      };
      errors: {
        walletNotReady: string;
        vaultNotConfiguredTemplate: string;
      };
    };
    deals: {
      tag: string;
      title: string;
      body: string;
      empty: { headline: string; body: string };
      noneOpen: string;
      openSectionTitle: string;
      pastSectionTitle: string;
      txPrefix: string;
      roles: { buyer: string; seller: string; both: string };
      stateLabels: {
        funded: string;
        settled: string;
        disputed: string;
        refunded: string;
        unknown: string;
      };
      row: {
        live: string;
        pastDeadline: string;
        delivered: string;
        notDelivered: string;
        cancelProposedByTemplate: string;
        noAction: string;
        genTemplate: string;
      };
      actions: {
        refundToBuyer: string;
        refunding: string;
        releaseToSeller: string;
        releasing: string;
        acceptCancellation: string;
        accepting: string;
        proposeCancellation: string;
        proposing: string;
      };
      dialogs: {
        refund: { titleTemplate: string; bodyTemplate: string; confirm: string };
        release: { titleTemplate: string; bodyTemplate: string; confirm: string };
        cancelPropose: { title: string; body: string; confirm: string };
        cancelAccept: { title: string; bodyTemplate: string; confirm: string };
        confirmFallback: string;
      };
      reasonPrompt: { label: string; placeholder: string };
      errors: { reasonRequired: string };
    };
  };
  cashoutPage: {
    signInGate: {
      tag: string;
      titleBefore: string;
      body: string;
      buttonLabel: string;
    };
    hero: {
      tag: string;
      titleBefore: string;
      earnedTemplate: string;
      loading: string;
      backToDeal: string;
    };
    loading: { label: string };
    errors: {
      couldNotLoad: string;
      couldNotLoadDeal: string;
      solanaRoadmap: string;
      withdrawFailed: string;
    };
    comingSoon: {
      tag: string;
      titleBefore: string;
      titleAccent: string;
      body: string;
      tileLabel: string;
      comingSoon: string;
    };
    notReady: {
      tag: string;
      titleBefore: string;
      titleAccent: string;
      titleAfter: string;
      body: string;
      cta: string;
    };
    legacy: { tag: string; body: string; cta: string };
    walletAccount: {
      tag: string;
      titleBefore: string;
      titleAccent: string;
      body: string;
      roadmap: string;
      bridgeFromWallet: string;
      sendOnArc: string;
    };
    withdraw: {
      tag: string;
      titleBefore: string;
      body: string;
      fromWalletLabel: string;
      fromWalletTooltip: string;
      whatIsThis: string;
      dealWalletLabel: string;
      dealWalletSub: string;
      buyerWalletLabel: string;
      buyerWalletSub: string;
      identityWalletLabel: string;
      identityWalletSub: string;
      identityWalletSubWeb3: string;
      web3IdentitySigns: string;
      web3IdentityConnect: string;
      connectWallet: string;
      active: string;
      notProvisioned: string;
      sourceBalance: string;
      fromDeal: string;
      destinationChain: string;
      recipientAddress: string;
      base58Placeholder: string;
      invalidAddress: string;
      amountLabel: string;
      max: string;
      overBalance: string;
      sendingOnArc: string;
      bridgingOut: string;
      sendTo: string;
      bridgeTo: string;
    };
    sent: {
      tag: string;
      titleAccent: string;
      body: string;
      viewTx: string;
      sendMore: string;
    };
    bridgeStage: {
      burning: string;
      burned: string;
      attested: string;
      minted: string;
      errored: string;
    };
    bridgeProgress: {
      tagBridged: string;
      tagFailed: string;
      tagBridging: string;
      accentArrived: string;
      accentErrored: string;
      accentBridging: string;
      bodyDone: string;
      bodyFailed: string;
      bodyInProgress: string;
      burnLabel: string;
      mintLabel: string;
      pending: string;
      retrying: string;
      couldNotCheck: string;
      sendMore: string;
      tryAgain: string;
    };
  };
  supplyPage: {
    signInGate: { tag: string; body: string };
    tag: string;
    notBusiness: { headline: string; cta: string };
    hero: {
      headlinePrefix: string;
      headlineAccent: string;
      lede: string;
      ctaPost: string;
      ctaPartners: string;
    };
    matchesHeadline: string;
  };
  sellerHub: {
    signInGate: { tag: string; body: string };
    hero: {
      tag: string;
      headlineLine1: string;
      headlineLine2Prefix: string;
      headlineAccent: string;
      lede: string;
      ctaPostOffer: string;
    };
    vignette: {
      agentControl: string;
      sellerAgent: string;
      statusActive: string;
      statusIdle: string;
      activeBlurb: string;
      idleBlurb: string;
      inAuction: string;
      counters: string;
      withinRange: string;
    };
    pendingMatchesHeadline: string;
    howItWorks: {
      tag: string;
      headlineLine1: string;
      headlineLine2Accent: string;
      lede: string;
    };
    steps: {
      s1: { title: string; body: string };
      s2: { title: string; body: string };
      s3: { title: string; body: string };
    };
    postOffer: {
      tag: string;
      headlineLine1: string;
      headlineLine2: string;
      lede: string;
    };
    activeBids: {
      tag: string;
      headline: string;
      lede: string;
      connectPrompt: string;
      errorMessage: string;
      emptyMessage: string;
    };
  };
  invitePage: {
    eyebrow: string;
    loading: { headline: string };
    unavailable: { headline: string; fallback: string };
    hero: {
      headlineBefore: string;
      headlineAccent: string;
      headlineAfter: string;
      intro: string;
    };
    deal: {
      eyebrow: string;
      termsLabel: string;
      onDelivery: string;
      onVerification: string;
      deadline: string;
      openEnded: string;
      claimBy: string;
    };
    sendCode: { intro: string; cta: string; busy: string };
    verifyCode: { intro: string; cta: string; busy: string; resend: string };
    claiming: { status: string };
    errors: { codeSixDigits: string };
  };
  buyerHub: {
    signInGate: { tag: string; body: string };
    hero: {
      sectionTag: string;
      headlineLine1: string;
      headlineLine2Prefix: string;
      headlineLine2Accent: string;
      description: string;
      openDealCta: string;
    };
    newDeal: {
      sectionTag: string;
      headline: string;
      description: string;
    };
    managedDeals: {
      sectionTag: string;
      headline: string;
      description: string;
      statesConnect: string;
      statesError: string;
      statesEmpty: string;
    };
    agentVignette: {
      eyebrow: string;
      titlePrefix: string;
      statusActive: string;
      statusIdle: string;
      bodyActive: string;
      bodyIdle: string;
      runningLabel: string;
      roundCapLabel: string;
      counterLabel: string;
    };
  };
  stakePage: {
    signedOut: {
      tag: string;
      titlePrefix: string;
      titleAccent: string;
      body: string;
      buttonLabel: string;
    };
    hero: {
      tag: string;
      line1Prefix: string;
      line1Accent: string;
      line2Prefix: string;
      line2Accent: string;
      body: string;
      mainnetNote: string;
    };
    position: {
      reputation: string;
      tier: string;
      toNextTemplate: string;
      dealOne: string;
      dealMany: string;
      /// Why the tier sits below what the score earned. Two ceilings, and the
      /// difference decides what you would do about it: one is lifted by
      /// finishing deals, the other by trading with different people. "Held
      /// until a deal settles" promised one settlement would lift it, which is
      /// wrong whenever more are needed and wrong entirely when concentration
      /// is the cap.
      cappedDeals: string;
      cappedConcentration: string;
      status: string;
      pts: string;
      topTier: string;
    };
    vault: { tag: string; heading: string };
    /// Shown only when this wallet still holds a position on a superseded
    /// vault, so a migration does not read as funds having vanished.
    legacyNudge: { body: string; link: string };
    ladder: {
      tag: string;
      headingPrefix: string;
      headingAccent: string;
      body: string;
      youBadge: string;
      unlock: {
        NEW: string;
        COLD: string;
        ESTABLISHED: string;
        STRONG: string;
        ELITE: string;
      };
    };
  };
  flowStepper: {
    steps: {
      posted: string;
      bidding: string;
      counter: string;
      accepted: string;
      escrow: string;
      milestones: string;
      settled: string;
    };
    terminal: { expired: string; ended: string; outOfReach: string };
  };
  agentShell: {
    role: { buyer: string; seller: string };
    status: { active: string; idle: string; offline: string };
    activate: {
      running: string;
      connectWallet: string;
      soonBadge: string;
      tooltip: string;
    };
  };
  profileTierCard: {
    eyebrow: string;
    scoreSuffix: string;
    toNext: string;
    topTier: string;
  };
  partnerLogos: { builtOn: string };
  jobsTable: {
    empty: { none: string; allDismissed: string };
    columns: { job: string; budget: string; deadline: string; status: string; open: string };
    status: {
      cancelled: string;
      expired: string;
      escrowFunded: string;
      accepted: string;
      bidOne: string;
      bidOther: string;
      open: string;
    };
    row: { openAria: string; openCta: string };
    dismiss: { title: string; ariaExpired: string; ariaCancelled: string; ariaFunded: string };
  };
  moneyStrip: {
    eyebrow: string;
    heldSafe: string;
    cells: {
      available: { label: string; hint: string };
      inEscrow: { label: string; hint: string };
      earned: { label: string; hint: string };
    };
  };
  bidsTable: {
    empty: { idle: string; dismissed: string };
    columns: { job: string; buyer: string; bid: string; rounds: string; status: string; open: string };
    status: { finalized: string; negotiating: string };
    row: { openJobAria: string; dismissTitle: string; dismissAria: string; open: string; abandon: string; abandonConfirm: string };
  };
  releaseMilestones: {
    button: { released: string; releasing: string; release: string };
    progress: { confirmed: string; settled: string };
  };
  errorHelp: {
    explainCta: string;
    explaining: string;
    whatHappened: string;
    whatToDo: string;
    failed: string;
  };
  languagePicker: {
    languageLabels: { en: string; ar: string; fr: string; hi: string; sw: string };
  };
  telegramConnectCard: {
    eyebrow: string;
    title: string;
    subtitle: string;
    linkedBadge: string;
    notConfiguredPrefix: string;
    notConfiguredAnd: string;
    idleDescription: string;
    connectCta: string;
    linkingPrefix: string;
    linkingSuffix: string;
    openTelegramCta: string;
    cancelCta: string;
    waitingTitle: string;
    waitingExpiry: string;
    telegramLabel: string;
    chatFallback: string;
    linkedAt: string;
    unlinkCta: string;
    emailNote: string;
  };
  balanceRail: {
    switch: { title: string; label: string; switching: string };
    address: { copied: string; copyTitle: string; copyAria: string };
  };
  inlineControls: {
    walletNotConnected: string;
    copyLabel: string;
    copiedLabel: string;
    copyTooltip: string;
    copyAddressTooltip: string;
  };
  docsShell: {
    sidebar: {
      eyebrow: string;
      sections: {
        overview: { label: string; blurb: string };
        agents: { label: string; blurb: string };
        deals: { label: string; blurb: string };
        disputes: { label: string; blurb: string };
        reputation: { label: string; blurb: string };
        bridge: { label: string; blurb: string };
        roadmap: { label: string; blurb: string };
        faq: { label: string; blurb: string };
      };
    };
    pager: { previous: string; next: string };
    figure: { videoComingSoon: string; screenshotComingSoon: string };
  };
  docsDisputesPage: {
    eyebrow: string;
    title: string;
    intro: string;
    policy: {
      liveTag: string;
      reviewWindow: string;
      appealGrace: string;
      buyerResponse: string;
      reclaimGrace: string;
      disputeTimeout: string;
      note: string;
    };
    buyerSilent: {
      heading: string;
      s1: { label: string; body: string };
      s2: { label: string; body: string };
      s3: { label: string; body: string };
    };
    sellerLate: {
      heading: string;
      s1: { label: string; body: string };
      s2: { label: string; body: string };
    };
    disputed: {
      heading: string;
      intro: string;
      s1: { label: string; body: string };
      s2: { label: string; body: string };
      s3: { label: string; body: string };
    };
    callout: { title: string; body: string };
  };
  docsIndexPage: {
    eyebrow: string;
    headline: string;
    intro: string;
    twoWays: {
      title: string;
      lede: string;
      direct: { label: string; body: string };
      matched: { label: string; body: string };
    };
    getStarted: {
      title: string;
      signIn: { label: string; body: string };
      fund: { label: string; body: string };
      open: { label: string; body: string };
    };
    next: {
      title: string;
      lede: string;
      cards: {
        agents: { title: string; blurb: string };
        deals: { title: string; blurb: string };
        reputation: { title: string; blurb: string };
        bridge: { title: string; blurb: string };
        roadmap: { title: string; blurb: string };
        faq: { title: string; blurb: string };
        x402: { title: string; blurb: string };
      };
    };
  };
  docsAgentsPage: {
    eyebrow: string;
    title: string;
    intro: string;
    howNegotiationRuns: {
      heading: string;
      auction: string;
      concession: string;
      privacy: string;
    };
    timelineFigure: { alt: string; caption: string };
    whyHuman: {
      heading: string;
      anchors: { label: string; body: string };
      reputation: { label: string; body: string };
      closes: { label: string; body: string };
      alternatives: { label: string; body: string };
    };
    approval: { title: string; body: string };
    guardrails: { heading: string; body: string };
    guardrailsFigure: { alt: string; caption: string };
  };
  docsBridgePage: {
    eyebrow: string;
    title: string;
    intro: string;
    supportedChains: { heading: string; body: string };
    bringingIn: {
      heading: string;
      steps: {
        pickSource: { label: string; body: string };
        approveBurn: { label: string; body: string };
        attestation: { label: string; body: string };
        mintArc: { label: string; body: string };
      };
    };
    figure: { alt: string; caption: string };
    callout: { title: string; body: string };
    cashout: {
      heading: string;
      body: string;
      options: {
        arcToArc: { label: string; body: string };
        crossChain: { label: string; body: string };
      };
    };
    emailPasskey: { heading: string; body: string };
    whyThisRail: { heading: string; body: string };
  };
  x402Page: {
    eyebrow: string;
    title: string;
    intro: string;
    endpoints: {
      heading: string;
      body: string;
      privacy: string;
      freeLabel: string;
      items: {
        intro: { name: string; returns: string };
        creditPassport: { name: string; returns: string };
        repaymentBehavior: { name: string; returns: string };
        concentration: { name: string; returns: string };
        documentAnchors: { name: string; returns: string };
      };
    };
    howToPay: {
      heading: string;
      body: string;
      steps: {
        deposit: { label: string; body: string };
        call: { label: string; body: string };
        retry: { label: string; body: string };
      };
    };
    example: { heading: string; body: string };
    sameChain: { title: string; body: string };
  };
  docsDealsPage: {
    eyebrow: string;
    title: string;
    intro: string;
    lifecycle: {
      heading: string;
      open: { label: string; body: string };
      acceptFund: { label: string; body: string };
      deliver: { label: string; body: string };
      release: { label: string; body: string };
      summary: string;
    };
    figures: {
      funded: { alt: string; caption: string };
      waiting: { alt: string; caption: string };
      delivered: { alt: string; caption: string };
      releaseFirst: { alt: string; caption: string };
      afterFirst: { alt: string; caption: string };
      settled: { alt: string; caption: string };
    };
    shareable: { heading: string; body: string };
    fee: { heading: string; body: string };
    review: { heading: string; body: string };
    stake: { heading: string; body1: string; body2: string };
    cashout: { heading: string; body: string };
    wrong: {
      heading: string;
      mutualCancel: { label: string; body: string };
      dispute: { label: string; body: string };
    };
    callout: { title: string; body: string };
  };
  docsFaqPage: {
    eyebrow: string;
    headline: string;
    intro: string;
    items: ReadonlyArray<{ q: string; a: string }>;
  };
  docsReputationPage: {
    eyebrow: string;
    title: string;
    intro: string;
    signals: {
      heading: string;
      lead: string;
      items: {
        stake: { label: string; body: string };
        deals: { label: string; body: string };
        volume: { label: string; body: string };
        tenure: { label: string; body: string };
        activity: { label: string; body: string };
      };
      penalty: string;
      referralPrefix: string;
      referralLink: string;
      referralSuffix: string;
    };
    tiers: {
      heading: string;
      lead: string;
      items: {
        new: string;
        cold: string;
        established: string;
        strong: string;
        elite: string;
      };
      breakpoints: string;
      figureAlt: string;
      figureCaption: string;
    };
    resistance: {
      heading: string;
      lead: string;
      volumeFarming: { heading: string; body: string };
      stakeAndRun: { heading: string; body: string };
      selfDealing: { heading: string; body: string };
      matchAndCancel: { heading: string; body: string };
      decay: { heading: string; body: string };
    };
    staking: {
      heading: string;
      body: string;
      cooldown: string;
      calloutTitle: string;
      calloutBody: string;
      figureAlt: string;
      figureCaption: string;
    };
  };
  docsRoadmapPage: {
    eyebrow: string;
    heading: string;
    intro: string;
    live: {
      title: string;
      items: {
        match: { title: string; body: string };
        negotiation: { title: string; body: string };
        stake: { title: string; body: string };
        passport: { title: string; body: string };
        shareable: { title: string; body: string };
        cashout: { title: string; body: string };
        vault: { title: string; body: string };
        factoring: { title: string; body: string };
        disputes: { title: string; body: string };
        symmetric: { title: string; body: string };
        verified: { title: string; body: string };
        escrowYield: { title: string; body: string };
        terms: { title: string; body: string };
        signin: { title: string; body: string };
        languages: { title: string; body: string };
        tours: { title: string; body: string };
      };
    };
    next: {
      title: string;
      skills: { title: string; body: string };
      fileDelivery: { title: string; body: string };
      referral: { title: string; body: string };
      mainnet: {
        title: string;
        items: {
          audit: { title: string; body: string };
          safe: { title: string; body: string };
          coverage: { title: string; body: string };
        };
      };
      reach: {
        title: string;
        body: string;
        items: {
          coverage: { title: string; body: string };
          handbook: { title: string; body: string };
        };
      };
    };
    callout: { title: string; body: string };
  };
  howItWorksPage: {
    header: { eyebrow: string; title: string; body: string };
    directDeal: {
      eyebrow: string; title: string; body: string;
      step1: { title: string; cta: string; bodyA: string; bodyB: string };
      step2: { title: string; body: string };
      step3: { title: string; body: string };
    };
    managedDeal: {
      eyebrow: string; title: string; body: string;
      step1: { title: string; bodyA: string; bodyB: string; bodyC: string };
      step2: { title: string; bodyA: string; bodyB: string };
      step3: { title: string; body: string };
    };
    contract: {
      eyebrow: string; title: string; bodyA: string; bodyB: string;
      step1: { actor: string; bodyA: string; bodyB: string };
      step2: { actor: string; body: string };
      step3: { actor: string; body: string };
      step4: { actor: string; bodyA: string; bodyB: string; bodyC: string };
      step5: { actor: string; body: string };
      step6: { actor: string; body: string };
    };
    stake: {
      eyebrow: string; title: string; body: string;
      step1: { title: string; bodyA: string; bodyB: string; bodyC: string };
      step2: { title: string; body: string };
      step3: { title: string; body: string };
    };
    stack: {
      eyebrow: string; title: string;
      usdc: string; dcw: string; cctp: string; appKit: string;
      gateway: string; arc: string; usyc: string;
    };
    roadmap: {
      eyebrow: string; title: string; body: string;
      fileDelivery: { title: string; body: string };
      referral: { title: string; body: string };
      mainnet: { title: string; body: string };
      i18n: { title: string; body: string };
    };
    faq: {
      eyebrow: string; title: string;
      q1: { q: string; a: string };
      q2: { q: string; a: string };
      q3: { q: string; a: string };
      q4: { q: string; a: string };
      q5: { q: string; a: string };
      q6: { q: string; a: string };
      q7: { q: string; a: string };
      q8: { q: string; a: string };
      q9: { q: string; a: string };
      q10: { q: string; a: string };
    };
    videoGuides: { eyebrow: string; title: string; body: string; badge: string };
    cta: { title: string; body: string; button: string; chainPrefix: string };
  };
  brandPage: {
    hero: { tag: string; headlineLead: string; headlineAccent: string; body: string };
    logo: {
      tag: string; headline: string; body: string;
      wordmarkOnDark: string; wordmarkOnLight: string; markOnDark: string;
    };
    palette: {
      tag: string; headline: string; body: string;
      brandLime: string; brandInk: string; creamSurface: string;
      brandLabel: string; copy: string; copied: string;
    };
    voice: {
      tag: string; headline: string; body: string;
      wordsWeUseLabel: string; wordsWeUseBody: string;
      wordsWeAvoidLabel: string; wordsWeAvoidBody: string;
    };
    partner: { tag: string; headline: string; body: string; partnerLabel: string };
    contact: { tag: string; headlineLead: string; headlineAccent: string; body: string; backHome: string };
  };
  termsPage: {
    eyebrow: string;
    headlineLead: string;
    headlineAccent: string;
    intro: string;
    preamble: string;
    s1: {
      title: string; lead: string;
      bullets: {
        deals: { label: string; body: string };
        settlement: { label: string; body: string };
        localCurrency: { label: string; body: string };
        invite: { label: string; body: string };
        moving: { label: string; body: string };
        reputation: { label: string; body: string };
        agents: { label: string; body: string };
        assistant: { label: string; body: string };
        staking: { label: string; body: string };
      };
      tail: string;
    };
    s2: {
      title: string; lead: string;
      ownWallet: { label: string; body: string };
      operated: { label: string; body: string };
      scope: string;
      contractLimit: string;
      why: string;
      research: string;
    };
    s3: {
      title: string; lead: string;
      bullets: {
        signin: { label: string; body: string };
        review: { label: string; body: string };
        deadlines: { label: string; body: string };
        offPlatform: { label: string; body: string };
        counterparty: { label: string; body: string };
        currency: { label: string; body: string };
      };
    };
    s4: {
      title: string; lead: string;
      bullets: {
        release: { label: string; body: string };
        autoRelease: { label: string; body: string };
        deadline: { label: string; body: string };
        cancel: { label: string; body: string };
        disputes: { label: string; body: string };
      };
      tail: string;
    };
    s5: {
      title: string; lead: string;
      bullets: {
        success: string; disputes: string; malicious: string; deadline: string; staking: string;
      };
      tail: string;
      agentWallet: string;
    };
    verification: {
      title: string;
      lead: string;
      individual: { label: string; body: string };
      individualStatus: string;
      business: { label: string; body: string };
      limits: { label: string; body: string };
      policy: string;
    };
    s6: {
      title: string; lead: string;
      bullets: {
        testnet: { label: string; body: string };
        contract: { label: string; body: string };
        depeg: { label: string; body: string };
        outage: { label: string; body: string };
        crossChain: { label: string; body: string };
        fiat: { label: string; body: string };
        compliance: { label: string; body: string };
        regulatory: { label: string; body: string };
      };
    };
    s7: {
      title: string; storeLead: string;
      store: { addresses: string; email: string; chats: string; reputation: string; business: string };
      notStoreLead: string;
      notStore: { keys: string; fiat: string };
      custody: string;
      tail: string;
    };
    s8: {
      title: string; lead: string;
      bullets: { age: string; lawful: string; address: string };
      changes: string;
      organisation: string;
    };
    s9: { title: string; body: string };
    footer: { version: string; updated: string };
  };
  adminFeedbackPage: {
    eyebrow: string;
    title: string;
    tokenPrompt: string;
    loading: string;
    emptyAll: string;
    emptyInFilter: string;
    actions: {
      setToken: string; refresh: string;
      markTriaged: string; markResolved: string; reopen: string;
    };
    filters: { all: string; new: string; triaged: string; resolved: string };
    statusLabels: { new: string; triaged: string; resolved: string };
    categoryLabels: { bug: string; improvement: string; praise: string; other: string };
    metaLabels: { where: string; wallet: string; contact: string; client: string };
    errors: {
      tokenRequired: string;
      tokenRejected: string;
      gateNotConfigured: string;
    };
    lightbox: { closeAria: string; imageAlt: string };
  };
  balancesCard: {
    eyebrow: string;
    signedOutBody: string;
    title: string;
    chainCountTemplate: string;
    refresh: string;
    refreshing: string;
    reveal: string;
    hide: string;
    tabs: {
      you: string;
      buyer: string;
      seller: string;
    };
    notConfigured: string;
    updatedTemplate: string;
    timeAgo: {
      justNow: string;
      secondsTemplate: string;
      minutesTemplate: string;
      hoursTemplate: string;
    };
  };
  jobPage: {
    loading: {
      tag: string;
      headline: string;
      body: string;
    };
    private: {
      tags: {
        negotiating: string;
        closed: string;
        default: string;
      };
      headlines: {
        negotiating: string;
        closed: string;
        default: string;
      };
      bodies: {
        negotiating: string;
        closed: string;
        default: string;
      };
      browseCta: string;
      postCta: string;
    };
    error: {
      notFoundTag: string;
      errorTag: string;
      notFoundHeadline: string;
      errorHeadline: string;
      notFoundBody: string;
      errorBody: string;
      backCta: string;
      activityCta: string;
    };
  };
  postJob: {
    notConnected: string;
    noBuyerProfile: {
      eyebrow: string;
      title: string;
      body: string;
      cta: string;
    };
    preview: {
      eyebrow: string;
      unitMinShort: string;
      unitHrShort: string;
      unitDaysShort: string;
      tolerancePrefix: string;
      ceilingPrefix: string;
      milestoneCaption: string;
    };
    sectionWork: {
      eyebrow: string;
      title: string;
      requestLabel: string;
      requestHint: string;
      requestPlaceholder: string;
    };
    sectionTerms: {
      eyebrow: string;
      title: string;
      budgetLabel: string;
      budgetHint: string;
      deadlineLabel: string;
      deadlineHint: string;
      toleranceLabel: string;
      toleranceHint: string;
    };
    trustedMatch: {
      eyebrow: string;
      body: string;
    };
    /// The custom-split option, beside Trusted match. Both were paragraphs on
    /// their card; the paragraph is a tooltip now and the card is one line.
    customSplit: {
      eyebrow: string;
      tooltip: string;
    };
    intentWarning: {
      eyebrow: string;
      bodyStart: string;
      bodyOffer: string;
      bodyMiddle: string;
      bodyNeed: string;
      bodyAfter: string;
      bodyLink: string;
      bodyAfterLink: string;
      bodyButtonRef: string;
      bodyTail: string;
    };
    submit: {
      submittingShort: string;
      waitingArcTemplate: string;
      waitingCircleTemplate: string;
      postOnChain: string;
      pendingHelper: string;
      feeCaption: string;
    };
    errors: {
      insufficientBalanceTitle: string;
      insufficientBalanceFallback: string;
      topUpCta: string;
      postFailedPrefix: string;
      activatingButton: string;
      activateCta: string;
    };
    deadlineUnitAria: string;
    unitPickerLabels: {
      min: string;
      hr: string;
      day: string;
    };
  };
  bridgeOut: {
    header: {
      eyebrow: string;
      title: string;
      subtitle: string;
    };
    reassurance: string;
    web3Fallback: string;
    form: {
      destinationEyebrow: string;
      amountEyebrow: string;
      fromArcCaption: string;
      faucetCta: string;
      faucetBusy: string;
      faucetSuccess: string;
      landsAtPrefix: string;
      recipientPlaceholder: string;
      yourWallet: string;
      addressInvalid: string;
      submitTemplate: string;
      sending: string;
    };
    activityEyebrow: string;
    clearActivity: string;
    dismissButton: string;
    srToRecipient: string;
    phases: {
      burning: string;
      waitingAttestation: string;
      mintingTemplate: string;
      done: string;
      error: string;
      submitting: string;
    };
  };
  onChainProof: {
    sectionTag: string;
    headlinePrefix: string;
    headlineAccent: string;
    description: string;
    blockPrefix: string;
    tiles: {
      escrowsFunded: { label: string; hint: string };
      settledInFull: { label: string; hint: string };
      disputesOpened: { label: string; hint: string };
      usdcFunded: { label: string; hint: string };
      usdcReleased: { label: string; hint: string };
      vaultDeposits: { label: string; hint: string };
    };
    smallStats: {
      milestoneReleases: string;
      reputationRecords: string;
      yieldPayouts: string;
      feesCollected: string;
    };
    sourceContracts: {
      eyebrow: string;
      labels: {
        escrow: string;
        vault: string;
        reputation: string;
        treasury: string;
        jobBoard: string;
      };
    };
    chart: {
      activityEyebrow: string;
      maxPerDay: string;
      loading: string;
      error: string;
      retry: string;
      empty: string;
      legend: {
        funded: string;
        settled: string;
        disputedOrRefunded: string;
      };
      tooltip: {
        funded: string;
        settled: string;
        disputedRefunded: string;
      };
    };
  };
  dealStage: {
    labels: {
      'awaiting-acceptance': string;
      'awaiting-funding': string;
      'awaiting-delivery': string;
      'awaiting-first-release': string;
      'awaiting-final-release': string;
      settled: string;
      cancelled: string;
      disputed: string;
    };
  };
  directDealList: {
    errorBody: string;
    empty: {
      noDealsTag: string;
      allDismissedTag: string;
      promptBuyer: string;
      promptSeller: string;
      promptBoth: string;
      promptAllDismissed: string;
    };
    roleEyebrow: {
      buying: string;
      selling: string;
    };
    counterpartyEyebrow: {
      seller: string;
      buyer: string;
    };
    swipe: {
      dismissReveal: string;
      dismissTitle: string;
      dismissAria: string;
    };
  };
  tierCelebration: {
    eyebrow: string;
    achievementPrefix: string;
    dismissAria: string;
    blurbs: {
      NEW: string;
      COLD: string;
      ESTABLISHED: string;
      STRONG: string;
      ELITE: string;
    };
  };
  pending: {
    matches: {
      sectionTag: string;
      inlineEyebrow: string;
      inlineSubtitle: string;
      headline: string;
      body: string;
      loadError: string;
      retry: string;
    };
    deals: {
      sectionTag: string;
      headline: string;
      body: string;
    };
    card: {
      roleBuyer: string;
      roleSeller: string;
      contextJob: string;
      contextDeal: string;
      unit: string;
      open: string;
      dueTemplate: string;
    };
    chips: {
      acceptToFund: string;
      agreeTerms: string;
      awaitingSeller: string;
      awaitingBuyer: string;
      reviewPriceChange: string;
      reviewFunding: string;
      markDelivered: string;
      waitingOnSeller: string;
      waitingOnBuyer: string;
      releaseFirst: string;
      releaseFinal: string;
    };
  };
  activation: {
    notice: {
      tag: string;
      headlines: { seller: string; buyer: string; both: string };
      bodies: { seller: string; buyer: string; both: string };
      cta: string;
    };
    gate: {
      loading: string;
      title: string;
      body: string;
      cta: string;
    };
    modal: {
      eyebrow: string;
      titleNew: string;
      titleActivated: string;
      namedBody: string;
      provisionBody: string;
      setupHint: string;
      fields: {
        buyerNameOptional: string;
        sellerNameOptional: string;
        buyerName: string;
        sellerName: string;
        buyerPlaceholder: string;
        sellerPlaceholder: string;
      };
      saveButton: string;
      savingButton: string;
      savedNote: string;
      activateButton: string;
      activatingButton: string;
      doneButton: string;
      notNowButton: string;
      errorSavePrefix: string;
      errorActivatePrefix: string;
    };
  };
  terms: {
    modal: {
      aria: string;
      eyebrow: string;
      title: string;
      openInTab: string;
      scrollPrompt: string;
      canAccept: string;
      accept: string;
      accepting: string;
    };
  };
  auth: {
    walletPill: {
      logIn: string;
      finishSignIn: string;
      wrongNetwork: string;
      networkTooltip: string;
      fallbackChain: string;
      switchToArc: string;
      switchingToArc: string;
    };
    signInGate: {
      defaultTag: string;
      heroTag: string;
      heroTitle: string;
      pageTitle: string;
      heroBody: string;
      pageBody: string;
      button: string;
      pillars: {
        protection: { title: string; body: string };
        milestones: { title: string; body: string };
        receipt: { title: string; body: string };
      };
    };
    modal: {
      aria: {
        dialog: string;
        close: string;
        back: string;
      };
      eyebrow: {
        welcome: string;
        email: string;
        signIn: string;
        createAccount: string;
      };
      title: {
        choosePath: string;
        signIn: string;
        askEmail: string;
        welcomeBack: string;
        createAccount: string;
        checkInbox: string;
      };
      subtitle: {
        choosePath: string;
        pickMethod: string;
        lookup: string;
        signingInAs: string;
        creatingAccount: string;
        codeSentTo: string;
      };
      entry: {
        newUser: string;
        newUserBody: string;
        returningUser: string;
        returningUserBody: string;
      };
      pickMethod: {
        continueEmail: string;
        connectWallet: string;
        continueWallet: string;
        preparingWallet: string;
        checkWallet: string;
        verifyingWallet: string;
        walletRetry: string;
        or: string;
        emailNotConfigured: string;
      };
      enterEmail: {
        label: string;
        placeholder: string;
        submit: string;
        submitBusy: string;
      };
      authStep: {
        passkeySignIn: string;
        passkeyCreate: string;
        passkeyVerifying: string;
        passkeySettingUp: string;
        sendCode: string;
        sendingCode: string;
        useCodeInstead: string;
        noPasskeyHint: string;
        noWebAuthnHint: string;
      };
      otp: {
        label: string;
        devChip: string;
        devTapToAutofill: string;
        devTooltip: string;
        resend: string;
        verify: string;
        verifyBusy: string;
      };
      errors: {
        invalidEmail: string;
        lookupFailed: string;
        passkeyCancelledSignIn: string;
        passkeyCancelledCreate: string;
        passkeyGeneric: string;
        otpSendFailed: string;
        codeMustBeSixDigits: string;
        codeRejected: string;
      };
    };
  };
}

export const en: MessagesShape = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    close: 'Close',
    delete: 'Delete',
    signIn: 'Sign in',
    signOut: 'Sign out',
    continue: 'Continue',
    back: 'Back',
    next: 'Next',
    loading: 'Loading',
    error: 'Error',
    success: 'Saved',
  },
  nav: {
    home: 'Home',
    app: 'App',
    buyer: 'Buyer',
    seller: 'Seller',
    activity: 'Activity',
    stake: 'Stake',
    profile: 'Profile',
    deals: 'Deals',
    market: 'Discover',
    finance: 'Finance',
    reputation: 'Reputation',
    bridge: 'Bridge',
    topUpWithdraw: 'Deposit / Withdraw',
    topUpBlurb: 'Move USDC in and out of Arc.',
    smeTrades: 'SME Trades',
    trades: 'Trade',
    tradesGroupEyebrow: 'P2P Trades',
    soonBadge: 'soon',
    hints: {
      home: 'Your home base. Deals, activity, and what to do next.',
      market: 'Browse open requests and offers from others.',
      bridge: 'Move USDC from another chain onto Arc.',
      smeTrades: 'Invoice factoring and PO financing on Arc. Opens to financiers after the first pilot.',
      activity: 'Live feed of every deal and settlement.',
      stake: 'Lock USDC to raise your reputation tier.',
      profile: 'Your wallets, agents, and reputation.',
    },
    tradesDropdown: {
      buyerTitle: 'Buyer desk',
      buyerSub: 'Post a request. Agents run the bidding.',
      sellerTitle: 'Seller desk',
      sellerSub: 'Post an offer. Take incoming deals.',
    },
    p2pHub: {
      eyebrow: 'P2P TRADES',
      title: 'Pick a desk',
      lede: 'Two ways in. Post a request and let agents run the bidding, or post an offer and take incoming deals.',
    },
    menuOpenAria: 'Open menu',
    menuCloseAria: 'Close menu',
    preferencesAria: 'Preferences',
    settingsAriaTitle: 'Settings',
    controlLabels: {
      theme: 'Theme',
      sound: 'Sound',
    },
    allSettings: 'All settings',
    help: 'Help and how it works',
    back: 'Back',
    backAria: 'Go back',
  },
  settings: {
    eyebrow: 'SETTINGS',
    title: 'Preferences',
    description: 'What Karwan has settled since the first deal.',
    language: 'Language',
    languageHint: 'Used for the app, notifications, and emails.',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    sound: 'Sound',
    soundOn: 'On',
    soundOff: 'Off',
    notifications: 'Notifications',
    notificationsHint: 'Mute all reach pipes (Telegram, X, email). Per-channel controls coming with the next update.',
    notificationsMute: 'Mute all notifications',
    privacy: 'Privacy',
    privacyPublicPassport: 'List me on the public Credit Passport board',
    dangerZone: 'Danger zone',
    accountDelete: 'Delete my off-chain profile',
    accountDeleteHint: 'Removes profile, settings, and risk tags. On-chain reputation is permanent and stays.',
    accountDeleteConfirm: 'Type DELETE to confirm',
    fundedFallback: 'Your agent wallets are funded. Deleting will not move them. Proceed anyway?',
    deletingButton: 'Deleting',
    confirmDeleteYes: 'Yes, delete',
    confirmDeleteNo: 'No, keep it',
    passkey: {
      rowLabel: 'Sign-in',
      rowHint: 'A passkey is faster than a code on every login and works offline.',
      activeChip: 'Passkey active',
      addButton: 'Add a passkey',
      addingButton: 'Setting up…',
      noBrowserSupport: 'This browser has no passkey support.',
      errorCancelled: 'Passkey setup cancelled. Try again any time.',
      errorGeneric: 'Could not add a passkey.',
    },
  },
  onboarding: {
    languageStep: {
      eyebrow: 'STEP 1',
      title: 'Pick your language',
      description: 'Choose your language. You can change it later in Settings.',
    },
    signUpTag: 'SIGN UP',
    stepIndicator: 'SIGN UP · STEP {step} OF {total}',
    profileProgress: 'Section {current} of {total}',
    accountTypeStep: {
      headlinePrefix: 'Set up your ',
      headlineAccent: 'account',
      description: 'Choose the account type that matches how you trade. Business verification can happen after setup.',
      individual: {
        eyebrow: 'PERSONAL',
        title: 'Individual',
        body: 'Buy services, sell your expertise, and settle deals under your own name.',
        tagline: 'For freelancers, consultants, and independent traders.',
      },
      business: {
        eyebrow: 'BUSINESS',
        title: 'Business',
        body: 'Operate as a company, manage both sides of trade, and access business tools after verification.',
        tagline: 'For registered companies and cross-border SMEs.',
      },
      note: 'Business verification happens after setup. You can begin using Karwan immediately.',
    },
    businessProfileStep: {
      headlineAccent: 'about your business',
      companyEyebrow: 'COMPANY',
      companyLabel: 'Company name',
      companyHint: 'Shown to counterparties on deals. Example: Lagos Textiles Ltd.',
      tradeEyebrow: 'WHAT YOU TRADE',
      goodsLabel: 'What does your business trade?',
      goodsHint: 'Comma-separated. Example: textiles, garments, cotton.',
      tradeTypeHint: 'Choose the commercial lane that best describes what your company supplies.',
      tradeGoods: 'Physical goods',
      tradeServices: 'Business services',
      tradeBoth: 'Goods + services',
      categoriesLabel: 'What can your business supply?',
      aboutLabel: 'What do you sell or deliver?',
      aboutHint: 'Describe the product or service, target buyer, markets served, and the result you deliver.',
      dealEyebrow: 'DEAL SIZE',
      minLabel: 'Typical min (USDC)',
      maxLabel: 'Typical max (USDC)',
    },
    connectStep: {
      headlinePrefix: 'Secure your ',
      headlineAccent: 'account',
      bodyText: 'Use email for the simplest setup. If you already use a compatible wallet, you can connect it instead.',
      loginButton: 'Sign in',
      fineprint: 'Your account stays yours. Add a passkey later for faster sign-in.',
    },
    roleStep: {
      headlinePrefix: 'How will you use ',
      headlineAccent: 'Karwan',
      connectedAs: 'Signed in as',
      secureAccount: 'Secure Karwan account',
      description: 'Choose what you want to do first. You can enable the other role later from your profile.',
      continueArrow: 'Continue →',
      backArrow: 'Back',
      cards: {
        seller: {
          eyebrow: 'TAKE WORK',
          title: 'Sell your services',
          body: 'Karwan watches relevant requests and prepares suitable matches. You decide which opportunities to pursue.',
          tagline: 'For freelancers, specialists, and service providers.',
        },
        buyer: {
          eyebrow: 'HIRE SOMEONE',
          title: 'Hire through Karwan',
          body: 'Post a request. Karwan compares suitable counterparties and terms. You approve who to work with.',
          tagline: 'For founders, teams, and procurement.',
        },
        both: {
          eyebrow: 'BOTH',
          title: 'Buy and sell',
          body: 'Manage requests and offers from one account. You approve every deal before anything moves.',
          tagline: 'Best for businesses and active marketplace users.',
        },
      },
      topBadge: 'RECOMMENDED',
      selected: 'selected',
    },
    profileStep: {
      headlinePrefix: 'Tell us a bit ',
      headlineAccent: 'about you',
      identity: {
        eyebrow: 'IDENTITY',
        title: 'About you',
        displayNameLabel: 'Display name',
        displayNameHint: 'Shown to counterparties on deals. Example: Alex · Frontend developer.',
      },
      seller: {
        eyebrow: 'TAKE WORK',
        title: 'Seller profile',
        skillsLabel: 'What can you deliver?',
        skillsHint: 'Choose suggestions or add your own. These shape which requests your agent ranks.',
        skillSuggestions: {
          design: 'Design',
          development: 'Software development',
          writing: 'Writing',
          logistics: 'Logistics',
          sourcing: 'Product sourcing',
          bookkeeping: 'Bookkeeping',
          translation: 'Translation',
          marketing: 'Marketing',
        },
        bioLabel: 'What do you sell or deliver?',
        bioHint: 'Be specific about the product or service, the buyer it helps, and the result you deliver.',
        minBudgetLabel: 'Min budget (USDC)',
        minBudgetHint: 'Smallest job you will take, in USDC. Requests below this stay out of your matches.',
        maxBudgetLabel: 'Max budget (USDC)',
        maxBudgetHint: 'Largest job you will take, in USDC. Requests priced above this are skipped.',
        minDeadlineLabel: 'Min deadline (days)',
        minDeadlineHint: 'Shortest delivery window you will accept. Jobs due sooner than this are skipped.',
        maxDeadlineLabel: 'Max deadline (days)',
        maxDeadlineHint: 'Longest delivery window you will commit to.',
      },
      buyer: {
        eyebrow: 'HIRE SOMEONE',
        title: 'Buyer profile',
        maxBudgetLabel: 'Max budget per job (USDC)',
        maxBudgetHint: 'The most you will pay for one job, in USDC. Karwan does not present terms above this limit.',
        bidWindowLabel: 'Offer window (sec)',
        bidWindowHint: 'Time Karwan gathers offers before presenting the strongest matches.',
        minDeadlineLabel: 'Min deadline (days)',
        minDeadlineHint: 'Shortest delivery time you would give a seller for a job.',
        maxDeadlineLabel: 'Max deadline (days)',
        maxDeadlineHint: 'Longest delivery time you would allow a seller for a job.',
        splitLabel: 'Milestone split',
        splitHint: 'Comma-separated percentages that total 100. Example: 50,50 or 30,40,30.',
      },
      matching: {
        eyebrow: 'AGENT MATCHING',
        sellerTitle: 'Your agent will prioritize work in this range',
        sellerBody: 'These limits shape every ranked match. You still review each request before anything moves.',
        buyerTitle: 'Your agent will shortlist offers inside these guardrails',
        buyerBody: 'Budget, timing, and payment stages are used to rank fit. You approve the final terms.',
        dealSizePresets: 'Common deal sizes',
        deliveryPresets: 'Common delivery windows',
        milestonePresets: 'Payment stages',
      },
      saving: 'Saving…',
      submit: 'Save profile →',
      error: 'We could not save your profile. Check your connection and try again.',
      defaultDisplayName: 'Karwan user {shortAddress}',
    },
    getReadyStep: {
      headlinePrefix: 'Ready to ',
      headlineAccent: 'begin',
      body: 'Enable matching so Karwan can surface suitable counterparties and prepare terms for your review. You approve every deal.',
      checklist: 'Matching workspace enabled',
      doneBody: 'Your workspace is ready. Complete verification when required, or start exploring counterparties.',
      activate: 'Enable matching →',
      activating: 'Preparing workspace…',
      retry: 'Try again',
      continue: 'View profile →',
      skip: 'Skip for now',
      error: 'Setup could not finish. Try again, or enable matching later from your profile.',
    },
    validation: {
      displayName: 'Add a display name.',
      skills: 'Add at least one skill.',
      bio: 'Write a short seller bio.',
      sellerMinBudget: 'Set a seller minimum budget above 0.',
      sellerMaxBudget: 'Seller max budget must exceed the min.',
      sellerMinDeadline: 'Seller minimum deadline must be at least 1 day.',
      sellerMaxDeadline: 'Seller max deadline must be at least the min.',
      buyerMaxBudget: 'Set a buyer max budget above 0.',
      bidWindow: 'Offer window must be at least 10 seconds.',
      buyerMinDeadline: 'Buyer minimum deadline must be at least 1 day.',
      buyerMaxDeadline: 'Buyer max deadline must be at least the min.',
      splitEmpty: 'Milestone split needs at least one number.',
      splitSum: 'Milestone split must add up to 100 (currently {sum}).',
    },
  },
  account: {
    modal: {
      ariaDialog: 'Account',
      ariaClose: 'Close',
      balanceSuffix: 'USDC on Arc',
      balanceUnknownPrefix: ',',
      copy: 'Copy',
      copied: 'Copied',
      signOut: 'Sign out',
      signingOut: 'Working',
      fundHint: 'Send testnet USDC to this address to fund your agent.',
    },
    kind: {
      individual: 'INDIVIDUAL',
      business: 'BUSINESS',
      verified: 'VERIFIED',
      notVerified: 'NOT VERIFIED',
      titleIndividual: 'Individual account',
      // Never let the badge imply a verification that has not happened.
      titleBusiness: 'Business account. Not verified yet.',
      titleVerified: 'Verified business account',
    },
    verification: {
      eyebrow: 'ACCOUNT CHECKS',
      title: 'Verification',
      status: {
        unverified: 'Not verified',
        pending: 'Under review',
        verified: 'Verified',
        rejected: 'Needs attention',
        expired: 'Expired',
        revoked: 'Revoked',
      },
      body: {
        unverified: 'Direct deals remain available. Verification may unlock matching, reputation, and business tools.',
        pending: 'Your evidence is being reviewed. You can continue with any available direct-deal actions.',
        verified: 'The submitted evidence passed the current review policy. This does not guarantee future performance.',
        rejected: 'The submitted evidence did not pass review. Check the business section before resubmitting.',
        expired: 'The previous verification is no longer current. Submit updated evidence to restore access.',
        revoked: 'This verification is no longer active. Contact support before relying on it.',
      },
      capabilities: {
        directDeals: 'Direct deals',
        matching: 'Counterparty matching',
        reputation: 'Reputation access',
        business: 'Business tools',
        available: 'Available',
        verificationRequired: 'Verification required',
      },
      reviewBusiness: 'Review business verification →',
      publicPassport: 'View public passport',
    },
  },
  banners: {
    migration: {
      ariaLabel: 'Infrastructure migration notice',
      eyebrow: 'HEADS UP',
      openProfile: 'Open profile',
      dismissAria: 'Dismiss banner',
    },
    legacy: {
      ariaLabel: 'Legacy contract recovery window',
      eyebrowPrefix: 'LEGACY · CLOSES IN',
      closesSoonFallback: 'soon',
      title: 'Migrated to a new contract. Unstake or finalize deals here.',
      body: 'Anything you staked or any deal still locked on the previous version stays yours. Open recovery to pull it out before the window closes.',
      openRecovery: 'Open recovery',
      dismissAria: 'Dismiss banner',
      dismissTooltip: 'Hide for this browser. Comes back if you clear storage. Window closes for everyone after the deadline.',
    },
  },
  footer: {
    tagline: 'Protected settlement for cross-border SME trade. Funds release in milestones after buyer review.',
    builtFor: 'BUILT FOR THE TRADE LANE',
    columns: {
      product: 'PRODUCT',
      network: 'ECOSYSTEM',
      socials: 'SOCIALS',
    },
    productLinks: {
      buyer: 'Buyer desk',
      seller: 'Seller desk',
      activity: 'Activity feed',
      howItWorks: 'How it works',
      docs: 'Documentation',
      brand: 'Press and brand',
      terms: 'Terms',
      feedback: 'Feedback',
      contact: 'Contact',
    },
    networkLinks: {
      arcDocs: 'Arc Docs',
      circleDocs: 'Circle Docs',
      explorer: 'Arc Testnet Explorer',
      faucet: 'USDC Faucet',
    },
    brand: {
      label: 'BRAND',
    },
    status: {
      operational: 'Operational',
    },
    copyright: {
      entity: '© 2026 KARWAN',
      tagline: 'cross-border settlement on USDC',
    },
    heroClose: 'settle in real time',
    feedbackPrompt: {
      eyebrow: 'FEEDBACK',
      title: 'What would make your next trade easier?',
      body: 'Share a friction point or an idea. Every note reaches the product team.',
      cta: 'Send feedback',
    },
    newsletter: {
      title: 'NEWSLETTER',
      blurb: 'Product updates and new corridors.',
      placeholder: 'you@example.com',
      cta: 'Subscribe',
      sending: 'Subscribing…',
      success: 'Thanks for subscribing.',
      error: 'Could not subscribe. Try again.',
      invalid: 'Enter a valid email.',
    },
  },
  notifications: {
    bell: {
      aria: 'Notifications',
      sectionTag: 'NOTIFICATIONS',
      markRead: 'Mark read',
      clear: 'Clear',
      emptyTitle: 'NOTHING YET',
      emptyBody: 'Deal matches, escrow events, and cancellation proposals land here as they happen.',
      openAction: 'OPEN',
    },
    toast: {
      openAction: 'OPEN',
      labels: {
        matchFound: 'MATCH FOUND',
        escrowFunded: 'ESCROW FUNDED',
        cancelProposed: 'CANCEL PROPOSED',
        topUpNeeded: 'TOP UP NEEDED',
        nearMatch: 'NEAR MATCH',
        briefExpired: 'BRIEF EXPIRED',
        defaultLabel: 'UPDATE',
      },
    },
  },
  confirm: {
    eyebrow: 'CONFIRM',
    cancelDefault: 'Cancel',
    backdropAria: 'Cancel',
  },
  dealPanel: {
    managedLabel: 'Find me a seller',
    managedBlurb: 'Post a request. Your agent runs the bidding. You wake up to a matched deal, ready for you to fund.',
    directLabel: 'I have a seller',
    directBlurb: 'You already agreed with a counterparty. Open an escrow naming their wallet, skip the auction.',
  },
  roleToggle: {
    ariaGroup: 'Account type',
    eyebrow: 'ROLE',
    options: {
      buyer: { label: 'Buyer', description: 'Post requests, accept bids' },
      seller: { label: 'Seller', description: 'Bid on requests, deliver work' },
      both: { label: 'Both', description: 'One profile, both sides' },
    },
    businessOptions: {
      buyer: { label: 'Source', description: 'Post requests, source goods and services' },
      seller: { label: 'Supply', description: 'Bid on requests, supply goods and services' },
      both: { label: 'Both', description: 'One company, source and supply' },
    },
    needBuyerDetails: 'Add buyer details first',
    needSellerDetails: 'Add seller details first',
    saving: 'Saving…',
    switchFailed: 'Could not switch role',
  },
  profileNudge: {
    titleFragment: 'Set up a profile',
    bodyFragment: 'to get a display name and build reputation faster. It stays optional. You can secure deals without one.',
    cta: 'Set up profile',
    dismissAria: 'Dismiss',
  },
  hint: {
    triggerAria: 'Details',
  },
  liveDot: {
    live: 'Live',
    connecting: 'Connecting',
    offline: 'Offline',
  },
  assistant: {
    launcherLabel: 'Ask',
    launcherAria: 'Ask the Karwan assistant',
    title: 'Karwan assistant',
    subtitle: 'Ask anything about Karwan',
    placeholder: 'Ask a question...',
    send: 'Send',
    greeting: 'Hi. Ask me anything, or just tell me what to do.',
    error: 'Something went wrong. Please try again.',
    disclaimer: 'Guidance only. The assistant cannot move funds or act on your account.',
    humanButton: 'Talk to a human',
    liveHeader: 'Live support',
    liveBanner: 'Connected to support. A person will reply here, usually within a few minutes.',
    liveClosed: 'This support chat is closed. The transcript was emailed to you.',
    livePlaceholder: 'Message support...',
    endChat: 'End chat',
    backToAssistant: 'Back to assistant',
    operatorName: 'Support',
  },
  countdown: {
    closed: 'closed',
  },
  networkTicker: {
    eyebrows: {
      opened: 'JUST OPENED',
      completed: 'JUST COMPLETED',
      cancelled: 'JUST CANCELLED',
    },
    verbs: {
      opened: 'opened a',
      completed: 'closed a',
      cancelled: 'cancelled a',
    },
    subjects: {
      opened: 'A buyer',
      completed: 'A seller',
      cancelled: 'A buyer',
    },
    usdcDeal: 'USDC DEAL',
  },
  activity: {
    signInGate: {
      tag: 'STREAM',
      body: 'Every deal moving across Karwan, live from Arc. Sign in to view the network stream and search by job ID.',
    },
    hero: {
      sectionTag: 'STREAM',
      headlineTop: 'Live',
      headlineAccent: 'Activity',
      description: 'Live from Arc Testnet. Each row deep-links to the explorer.',
    },
    stream: {
      sectionTag: 'EVENT STREAM',
      headlinePrefix: 'Audit the ',
      headlineAccent: 'chain',
      description: 'Full network event log.',
    },
    filters: {
      searchPlaceholder: 'Filter by job id…',
      clearSearchAria: 'Clear',
      clearFilters: 'Clear filters',
      actors: {
        buyer: 'Buyer',
        seller: 'Seller',
        system: 'System',
      },
    },
    stats: {
      eyebrow: 'NETWORK ACTIVITY',
      window: 'LAST {n} EVENTS',
      groups: {
        jobs: 'Jobs',
        negotiation: 'Negotiation',
        settlement: 'Settlement',
        bridge: 'Deposit / Withdraw',
      },
      filtering: '↳ filtering',
      events: 'events',
    },
    myMoney: {
      text: {
        bridgeIn: 'Deposited {amount} USDC from {chain}',
        bridgeOut: 'Withdrew {amount} USDC to {chain}',
        seededByKarwan: 'Karwan seeded your {agent} agent with {amount} USDC to cover its first transactions',
        setupMove: 'Moved {amount} USDC from your wallet into your {agent} agent at setup',
        agentWithdraw: 'Withdrew {amount} USDC from the {agent} agent wallet to {to}',
        agentTopUp: 'Topped up the {agent} agent wallet with {amount} USDC from the sign-in wallet',
        milestoneRelease: 'Released milestone {n} on deal {job} to the seller',
        milestoneReleaseFinal: 'Released milestone {n} on deal {job} to the seller (final release, deal settled)',
        dealPayout: 'Received payment for milestone {n} on deal {job}',
        dealPayoutFinal: 'Received the final payment on deal {job}. Deal settled',
        advanceFunded: 'Funded a {amount} USDC advance on {job}',
        advanceReceived: 'Received a {amount} USDC advance on {job}',
        financingRepaid: 'Repaid {amount} USDC on the financing for {job}',
        deadlineReclaim: 'Reclaimed {amount} USDC from the deal the seller did not deliver',
        disputeReceived: 'Received {amount} USDC from a resolved dispute',
        cancelRefund: 'Refunded {amount} USDC from a cancelled deal',
        depositCredited: 'Deposited {amount} USDC',
        depositCreditedFrom: 'Deposited {amount} USDC from {chain}',
        gatewayDeposit: 'Moved {amount} USDC from your {source} wallet into your balance',
        gatewayFundAgent: 'Funded the {agent} agent with {amount} USDC',
        gatewayCashOut: 'Cashed out {amount} USDC to {to} on {chain}',
        dealCashout: 'Cashed out {amount} USDC to {to}',
        researchActivate: 'Paid {amount} USDC to activate agent market research',
        marketRead: 'Your scout agent paid {amount} USDC for a market read on {keywords}',
        staked: 'Staked {amount} USDC',
        unstakeClaim: 'Claimed {amount} USDC of unstaked principal',
        unstakeStart: 'Started unstaking {amount} USDC',
        unstakeCancel: 'Cancelled unstaking {amount} USDC',
        yieldClaim: 'Claimed {amount} USDC of earned yield',
        yieldAccrued: 'Earned {amount} USDC of staking yield',
      },
      eyebrow: 'YOUR MONEY',
      count: '{n} MOVES',
      loading: 'Loading…',
      empty: 'Nothing yet. Money you add, send, or earn shows up here with a receipt.',
      pending: 'IN FLIGHT',
      failed: 'FAILED',
      receipt: 'RECEIPT',
      viewReceipt: 'VIEW RECEIPT',
      receiptTitle: 'Karwan receipt',
      receiptReference: 'KARWAN REFERENCE',
      receiptAmount: 'AMOUNT',
      receiptStatus: 'STATUS',
      receiptDate: 'DATE',
      receiptProof: 'NETWORK PROOF',
      receiptTransaction: 'TRANSACTION',
      receiptReferenceNone: 'Not recorded',
      receiptShareBuyerOnly: 'Only the buyer can share this receipt.',
      receiptHistorical: 'Completed before Karwan references were enabled. No reference was recorded for this movement.',
      receiptExportPdf: 'PRINT / SAVE PDF',
      receiptExportImage: 'DOWNLOAD IMAGE',
      receiptSharedNote: 'Share this receipt to show the movement details without exposing wallet addresses.',
      justNow: 'just now',
      repeated: '×{n}',
      showAll: 'SEE ALL',
      showLess: 'SHOW LESS',
    },
    allTime: {
      sectionTag: 'ALL TIME',
      entryTitle: 'All Karwan volume and transactions since day one',
      entryCta: 'SEE ALL TIME',
      headlineTop: 'Every deal',
      headlineAccent: 'since day one',
      description: 'Totals across every contract Karwan has deployed, retired ones included.',
      loadingTag: 'LOADING',
      unscannedTag: 'COMING SOON',
      unscannedBody: 'All-time totals arrive here shortly.',
      errorTag: 'UNAVAILABLE',
      errorBody: 'Try again in a moment.',
      volumeLabel: 'TOTAL VOLUME',
      txnsLabel: 'TRANSACTIONS',
      dealsLabel: 'DEALS FUNDED',
      releasedLabel: 'RELEASED USDC',
      settledLabel: 'SETTLED USDC',
      refundedLabel: 'REFUNDED USDC',
      feesLabel: 'FEES USDC',
      contractsLabel: 'CONTRACTS',
      breakdownTag: 'BY CONTRACT',
      colContract: 'CONTRACT',
      colDeals: 'DEALS',
      colFunded: 'VOLUME',
      liveTag: 'LIVE',
      blockLabel: 'BLOCK {block}',
      updatedNow: 'Updated just now',
      updatedAgo: 'Updated {n}s ago',
      settlementTag: 'SETTLEMENT',
      financingTag: 'TRADE FINANCE',
      stakingTag: 'STAKING',
      treasuryTag: 'TREASURY',
      registryTag: 'REGISTRIES',
      settlementBody: 'Buyers funding escrow, and money released as delivery was accepted.',
      financingBody: 'Financiers paying suppliers ahead of settlement, against an invoice or a purchase order.',
      stakingBody: 'Sellers locking capital behind their deals, and what a lost dispute took from it.',
      advancedLabel: 'CAPITAL ADVANCED',
      repaidLabel: 'ADVANCES REPAID',
      financingsLabel: 'ADVANCES',
      defaultsLabel: 'DEFAULTED',
      stakedLabel: 'STAKE LOCKED',
      slashedLabel: 'STAKE SLASHED',
      yieldLabel: 'YIELD CLAIMED',
      jobsPostedLabel: 'REQUESTS POSTED',
      currentTag: 'IN SERVICE NOW',
      currentBody: 'The contracts this deployment is wired to, with what each one holds. Read from the chain, refreshed daily.',
      custodiedLabel: 'HELD IN CONTRACTS',
      liveCountLabel: 'LIVE CONTRACTS',
      colBalance: 'HOLDS',
      colStatus: 'STATUS',
      colDeployed: 'DEPLOYED',
      colReplaced: 'REPLACED',
      colEvents: 'EVENTS',
      colMoved: 'MOVED',
      statusLive: 'LIVE',
      statusMissing: 'NO CODE',
      ledgerTag: 'EVERY GENERATION',
      ledgerBody: 'Each contract Karwan has deployed, grouped by what it does. Retired ones stay listed: their totals are part of the number above.',
      generationsOne: '1 generation',
      generationsMany: '{n} generations',
      neverUsed: 'Never used',
      notApplicable: 'n/a',
      backToActivity: 'BACK TO ACTIVITY',
    },
    view: {
      notSignedInEyebrow: 'NOT SIGNED IN',
      notSignedInBody: 'Sign in to watch every deal moving across Karwan. Search by job ID to follow a specific one.',
      everyone: 'All',
      onlyMine: 'Me',
      moneyTag: 'YOUR MONEY',
      moneyTitle: 'Transaction history',
      moneyShow: 'Open',
      moneyHide: 'Close',
      streamEyebrow: 'EVENT STREAM',
      countZero: '0 EVENTS',
      countRange: '{start}–{end} OF {total}',
      countHidden: '{n} HIDDEN',
      pagerAria: 'Activity pages',
      prevAria: 'Previous page',
      nextAria: 'Next page',
    },
  },
  profile: {
    signInGate: {
      tag: 'PROFILE',
      body: 'Sign in with email or wallet to manage your account, balances, and agents.',
    },
    loadError: {
      tag: 'PROFILE',
      title: 'Could not load profile',
      body: 'Try again in a moment.',
    },
    tabs: {
      identity: 'IDENTITY',
      wallets: 'WALLETS',
      agents: 'AGENTS',
      stake: 'STAKE',
      preferences: 'PREFERENCES',
    },
    hero: {
      sectionTag: 'ACCOUNT',
      fallbackName: 'Your account',
      publicPassport: 'Public passport ↗',
      updatedPrefix: 'Updated',
      editDetailsCta: 'Edit details',
      editCompanyCta: 'Edit company',
      setUpProfileCta: 'Set up profile',
    },
    agentStatus: {
      eyebrow: 'Agent status',
      checking: 'Checking…',
      walletsPrefix: 'Wallets',
      walletsLive: 'live',
      walletsIdle: 'idle',
      inactiveBody: 'Activate below to provision agent wallets.',
      buyerFallback: 'Buyer agent',
      sellerFallback: 'Seller agent',
    },
    activation: {
      inactiveTag: 'NOT ACTIVATED',
      inactiveHeadlinePrefix: 'Activate to ',
      inactiveHeadlineAccent: 'begin',
      inactiveBody: 'Activation provisions buyer and seller Circle wallets for this address.',
      cta: 'Activate agents',
    },
    accountType: {
      tag: 'ACCOUNT TYPE',
      headlinePrefix: 'Pick your ',
      headlineAccent: 'role',
      body: 'Switch any time. Run both at once.',
    },
    agentProfiles: {
      tag: 'AGENT PROFILES',
      headlinePrefix: 'Agent ',
      headlineAccent: 'ranges',
      body: 'Ranges agents respect on every request.',
      headsUpEyebrow: 'HEADS UP',
      headsUpBody: "this is saved, but your agents aren't active yet, so they won't bid or post. Activate above to put them to work.",
      buyerEyebrow: 'BUYER AGENT',
      sellerEyebrow: 'SELLER AGENT',
      buyerFallback: 'Buyer',
      sellerFallback: 'Seller',
      rows: {
        maxBudget: 'Max budget',
        deadline: 'Deadline',
        bidWindow: 'Bid window',
        milestones: 'Milestones',
        skills: 'Skills',
        supplies: 'Supplies',
        bio: 'Bio',
        budget: 'Budget',
        delivery: 'Delivery',
      },
      daysSuffix: 'days',
      editRanges: 'Edit ranges',
    },
    noProfile: {
      tag: 'NO PROFILE YET',
      headlinePrefix: 'Set one ',
      headlineAccent: 'up',
      body: 'A profile sets your display name and unlocks managed deals. Direct deals and agent wallets work without one.',
      cta: 'Set up profile',
    },
    holdings: {
      tag: 'HOLDINGS',
      headlinePrefix: 'Your ',
      headlineAccent: 'wallets',
      body: 'Wallet roles and balances',
    },
    agentTreasury: {
      tag: 'AGENT MONEY',
      headlineFund: 'Deposit',
      headlineWithdraw: 'Withdraw',
      body: 'Move USDC to the agent that runs your deals, and pull it back to yourself any time.',
    },
    stake: {
      tag: 'STAKE',
      headlinePrefix: 'Earn ',
      headlineAccent: 'reputation',
      body: 'Deposit USDC into KarwanVault. A deposit can contribute to reputation. The live position shows the withdrawal cooldown and claim time.',
    },
    preferences: {
      tag: 'PREFERENCES',
      headline: 'Reach pipes',
      body: 'Connect Telegram and X so the agent can ping you when a deal needs you.',
    },
  },
  appHome: {
    settlementDeskEyebrow: 'SETTLEMENT DESK',
    backendOffline: {
      eyebrow: 'BACKEND',
      title: 'Backend offline',
      bodyPrefix: "Couldn't reach the API at ",
      bodySuffix: ". This page picks up the moment it's back.",
    },
    hero: {
      welcomeBack: 'Welcome back,',
      description: 'Your settlement desk for requests, offers, approvals, and payments.',
      postRequestCta: 'Post a request →',
      postOfferCta: 'Post an offer →',
      viewActivityCta: 'View activity →',
    },
    quickStart: {
      eyebrow: 'NEW HERE',
      title: 'Three steps to your first deal',
      dismissAria: 'Dismiss quick start',
      steps: {
        activate: {
          title: 'Activate your agents',
          body: 'Give your buyer and seller agents a small spend allowance. They sign nothing without your approval.',
          cta: 'Activate →',
        },
        post: {
          title: 'Post a request or an offer',
          body: 'Say what you need or what you supply. Your agent runs the auction and brings back a match.',
          cta: 'Open the desks →',
        },
        settle: {
          title: 'Approve, then settle',
          body: 'Approve the match your agent reaches. Funds release in milestones as the work lands.',
        },
      },
    },
    heroAgentCard: {
      eyebrow: 'AGENT STATUS',
      statePrefix: 'Buyer and seller agents',
      stateActive: 'ready',
      stateBody: 'You approve every deal before funds move.',
      miniLabels: {
        running: 'Running',
        settled: 'Settled',
        volume: 'Volume',
      },
    },
    threeDoors: {
      sectionTag: 'WHERE TO START',
      headlineTop: 'One spine',
      headlineBottom: 'Three doors.',
      description: 'Same escrow. Same reputation. Three entry points.',
      buyerCard: {
        eyebrow: 'BUYER',
        title: 'Post a request',
        body: 'Say what you need. Agents collect bids and you choose.',
      },
      sellerCard: {
        eyebrow: 'SELLER',
        title: 'Take work',
        body: 'List what you offer and accept the deals that fit.',
      },
      activityCard: {
        eyebrow: 'ACTIVITY',
        title: 'Track deals',
        body: 'Watch every deal move from agreement to receipt.',
      },
    },
    liveNetwork: {
      sectionTag: 'LIVE NETWORK',
      headlineTop: 'Settled in',
      headlineBottomPrefix: 'real ',
      headlineBottomAccent: 'time',
      fullFeed: 'Full feed',
      stats: {
        totalDeals: 'Total deals',
        directDeals: 'Direct deals',
        agentDeals: 'Agent deals',
        settled: 'Settled in full',
        usdcThrough: 'Payment volume',
        chain: 'Payment network',
        directPlusAgent: 'Direct plus agent',
        arcTestnet: 'Live settlement records',
      },
    },
    networkPulse: {
      sectionTag: 'NETWORK PULSE',
      headlinePrefix: 'Trades, as they ',
      headlineAccent: 'land',
    },
    yourBook: {
      sectionTag: 'YOUR DEALS',
      headlinePrefix: 'Your ',
      headlineAccent: 'book',
    },
    briefVignette: {
      eyebrowPrefix: 'REQUEST ·',
      timeStamp: '2 min',
      sampleBrief: 'Spanish → Arabic legal translation. 14 pages.',
      daysBids: '· 5d · {bids} bids',
    },
    bidVignette: {
      eyebrow: 'LEAD',
      live: 'live',
      scoreSuffix: '/100',
      counter: 'counter {price} USDC',
      eta: 'ETA 4d',
    },
    streamVignette: {
      eyebrow: 'EVENT STREAM',
      live: 'live',
      now: 'now',
    },
  },
  businessHome: {
    deskEyebrow: 'TRADE DESK',
    hero: {
      welcomeBack: 'Welcome back,',
      description:
        'Your trade desk. Track every deal, draw working capital against your book, and settle cross-border in USDC.',
      openDeskCta: 'Open SME desk',
      newTradeCta: 'New trade',
      directDealCta: 'Direct deal',
      postOfferCta: 'Get found by buyers',
      financierDeskCta: 'Financier desk',
      viewActivityCta: 'View activity',
    },
    status: {
      verified: 'Verified business',
      underReview: 'Verification under review',
      finishVerification: 'Finish verification',
    },
    bookCard: {
      eyebrow: 'YOUR BOOK',
      active: 'Active',
      settled: 'Settled',
      volume: 'Volume',
    },
    analytics: {
      sectionTag: 'YOUR TRADES',
      headlinePrefix: 'Every deal in ',
      headlineAccent: 'one ledger',
      description:
        'Your full trade book at a glance. Volume, active deals, and what has settled, drawn straight from the chain.',
      tiles: {
        total: 'Total trades',
        active: 'Active',
        settled: 'Settled',
        volume: 'Volume',
      },
      chartTitle: 'Cumulative volume',
      chartEmpty: 'No trades yet. Your first deal charts here.',
    },
    history: {
      sectionTag: 'DEAL HISTORY',
      headlinePrefix: 'Your ',
      headlineAccent: 'deal history',
    },
  },
  profileEmail: {
    headlineIndividual: 'Email',
    headlineBusiness: 'Business email',
    add: 'Add email',
    change: 'Change',
    remove: 'Remove',
    cancel: 'Cancel',
    verifiedTag: 'Verified',
    currentLabel: 'Your email',
    descriptionIndividual: 'Add an email to get alerts on your deals and Karwan updates.',
    descriptionBusiness: 'Add a business email to get alerts on your deals and Karwan updates.',
    manageNote: 'This address gets alerts on your deals and Karwan updates. Remove it to switch to a different email.',
    emailLabel: 'Email address',
    businessEmailLabel: 'Business email',
    sendCode: 'Send code',
    sending: 'Sending…',
    sentNote: 'Code sent to {email}. Check your inbox.',
    devCodeNote: 'Dev code: {code}',
    codeLabel: '6-digit code',
    verify: 'Verify',
    verifying: 'Verifying…',
    resend: 'Resend',
    errors: { emailRequired: 'Enter an email address.', codeShape: 'Enter the 6-digit code.' },
  },
  deposit: {
    tag: '• [:DEPOSIT:]',
    addressLabel: 'Your address',
    acceptsLabel: 'Send from',
    copy: 'Copy address',
    copied: 'Copied',
    qrAlt: 'QR code of your deposit address',
    watching: 'Waiting for your deposit',
    unavailable: 'Deposits are being set up for your account. Check back in a moment.',
    fromTemplate: '+{amount} USDC from {chain}',
    stages: {
      moving: 'On its way',
      arrived: 'In your balance',
      stuck: 'Needs a retry',
    },
    groups: { evm: 'EVM chains', solana: 'Solana' },
  },
  bridge: {
    signInGate: {
      tag: 'ADD MONEY / CASH OUT',
      body: 'Adding money and cashing out is tied to your wallet. Sign in to continue.',
    },
    sectionTag: 'DEPOSIT / WITHDRAW',
    headlinePrefix: 'Move ',
    description: 'Deposit USDC from any chain, or withdraw to any wallet. Powered by Circle. Settles in seconds.',
    directions: {
      toArc: 'Deposit',
      fromArc: 'Withdraw',
    },
  },
  statsTicker: {
    liveLabels: {
      directDealsOnChain: 'DIRECT DEALS ON CHAIN',
      settledInFull: 'SETTLED IN FULL',
      movedThroughEscrow: 'MOVED THROUGH ESCROW',
    },
    staticItems: {
      arcTestnetLabel: 'CHAIN 5042002',
      circleLabel: 'USDC · CCTP · WALLETS',
      erc8004Label: 'PORTABLE REPUTATION',
    },
  },
  livePulse: {
    dealsToday: 'Deals today',
    settled: 'Settled',
    usdcReleased: 'USDC released',
  },
  heroFlow: {
    stages: {
      request: 'request',
      bid: 'bid',
      counter: 'counter',
      accept: 'accept',
    },
    escrow: {
      idle: 'Escrow',
      settling: 'Escrow · settling',
    },
    nodes: {
      buyerLabel: 'Buyer',
      sellerLabel: 'Seller',
      agentSublabel: 'agent',
    },
    caption: {
      buyerAgent: 'Buyer agent',
      routesThroughEscrow: 'USDC routes through escrow',
      sellerAgent: 'Seller agent',
    },
  },
  dealsFeed: {
    tabs: {
      all: 'All',
      active: 'Active',
      completed: 'Completed',
    },
    liveEyebrow: 'YOUR DEALS · LIVE ON ARC',
    errorBody: "Couldn't load the deals feed.",
    empty: {
      noDealsTag: 'NO DEALS YET',
      noMatchTag: 'NO MATCH',
      promptAll: 'Post a request or open a direct deal to see it here.',
      promptFilteredActive: 'No active deals on your book right now.',
      promptFilteredCompleted: 'No completed deals on your book right now.',
    },
    pager: {
      pageOf: 'Page {page} of {total}',
      countSingle: '{n} deal',
      countPlural: '{n} deals',
      prevAria: 'Previous page',
      nextAria: 'Next page',
    },
  },
  directDeal: {
    notConnected: 'Sign in to open a direct deal. Use the Log in pill in the nav.',
    preview: {
      eyebrow: 'DEAL PREVIEW',
      unitMin: 'min',
      unitHr: 'hr',
      unitDays: 'days',
      deliveryPctTemplate: '{n}% on delivery',
      verificationPctTemplate: '{n}% on verification',
      directEscrow: 'direct escrow',
    },
    counterparty: {
      eyebrow: 'COUNTERPARTY',
      titleWallet: 'Name the seller wallet.',
      titleEmail: 'Send the seller a shareable link.',
      helperWallet: 'Have their wallet address? Paste it. They sign in to that address to accept.',
      helperEmail: 'No wallet to hand? Send a link by email. They claim it, verify their address, and the escrow is ready. No signup needed.',
      sendByEmailLabel: 'Send by email',
      walletLabel: 'Seller address',
      walletHint: 'Their wallet. They sign in with the same address to accept and deliver.',
      walletPlaceholder: '0x...',
      walletInvalid: 'Not a valid 20-byte address.',
      walletSelfWarning: 'Seller must differ from your wallet.',
      walletOrPaytagLabel: 'Seller address or paytag',
      walletOrPaytagHint: 'Their wallet, or the paytag they gave you. Easier to remember than an address, and it keeps their email private.',
      walletOrPaytagPlaceholder: '0x... or @handle',
      walletOrPaytagInvalid: 'Not a valid address or paytag.',
      paytagLooking: 'Looking up...',
      paytagNotFound: 'No one holds that paytag. Check it with them, or use their address.',
      emailLabel: 'Seller email',
      emailHint: 'We email them a one-shot link. The deal sits idle until they claim. Nothing funds before then.',
      emailPlaceholder: 'them@work.com',
      emailInvalid: 'Not a valid email address.',
    },
    terms: {
      eyebrow: 'DEAL TERMS',
      title: 'Set the amount and release split.',
      amountLabel: 'Amount',
      deadlineLabel: 'Deadline (optional)',
      deadlineHint: 'When the seller must deliver by. Leave blank for open-ended (no time pressure, no unilateral cancel for late delivery). Max 180 days when set.',
      deliveryPctLabel: 'On delivery',
      deliveryPctHint: 'Slice released when seller marks delivered. Rest on your verification.',
      acceptanceWindowLabel: 'Seller has to accept within',
      acceptanceWindowHint: "If they don't, the deal auto-expires with no reputation hit on either side. You're free to re-shop.",
      presets: {
        oneHr: '1 hr',
        sixHr: '6 hr',
        dayOne: '24 hr',
        threeDays: '3 d',
        sevenDays: '7 d',
      },
    },
    deliverable: {
      eyebrow: 'DELIVERABLE',
      title: "What's being delivered.",
      termsLabel: 'Terms',
      termsHint: 'Visible to both parties on the deal page.',
      termsPlaceholder: 'e.g. Logo redesign with 2 revision rounds. Final files in SVG + PNG.',
    },
    funding: {
      header: 'FUNDING SUMMARY',
      youFundLabel: 'Deal amount',
      sellerReceivesLabel: 'Seller receives',
      platformFeeLabel: 'Platform fee',
      footerTemplate: 'The current fee and exact total appear after the seller agrees. Nothing is funded when you open this deal. Karwan settles in USDC; local-currency conversion is not included.',
    },
    trustedMatch: {
      eyebrow: '[:TRUSTED MATCH:]',
      body: "Seller has to stake USDC to accept. Slashed if they lose a dispute. Best for higher-value or one-shot deals you can't redo. Leave off for casual deals.",
      sliderAria: 'Required stake percentage',
      pctCaption: '% OF DEAL',
      stakeNoteTemplate: '↳ seller must stake {amount} USDC to accept',
    },
    submit: {
      opening: 'Opening deal...',
      open: 'Open deal',
      fundsCaption: '↳ sends terms for seller agreement; you fund only after reviewing the exact total',
    },
    errorPrefix: 'Could not open this deal. Review the details and try again.',
    deadlineUnitAria: 'Deadline unit',
    unitPickerLabels: {
      min: 'MIN',
      hr: 'HR',
      day: 'DAY',
    },
  },
  liveJob: {
    backToBuyer: 'BACK TO BUYER',
    backToSeller: 'BACK TO SELLER',
    managedDealTag: 'MANAGED DEAL',
    statusEyebrow: {
      positive: 'SETTLED',
      warning: 'IN PROGRESS',
      accent: 'LIVE',
      default: 'OPEN',
      critical: 'DECLINED',
    },
    statusLabels: {
      escrowFundedTemplate: 'Escrow funded · {amount}',
      requestExpired: 'Request expired',
      negotiationEnded: 'Negotiation ended',
      matchAwaitingTemplate: 'Match · {price} USDC · awaiting approval',
      acceptedFunding: 'Accepted · funding escrow',
      bidsNegotiatingOne: '1 bid · negotiating',
      bidsNegotiatingMany: '{n} bids · negotiating',
      waitingOnSellers: 'Waiting on seller agents',
    },
    stats: {
      budget: 'Budget',
      bids: 'Bids',
      deadline: 'Deadline',
      termsHash: 'Terms hash',
      statusLabel: 'Status',
      escrowFunded: 'Escrow funded',
      accepted: 'Accepted',
      expired: 'Expired',
      ended: 'Ended',
    },
    brief: {
      eyebrow: '[:REQUEST:]',
      trustedMatchBadge: '★ TRUSTED MATCH',
      trustedMatchTooltip: 'Buyer opted into Trusted Match. The agent loop weights seller reputation and stake above price; sellers must hold free stake to bid.',
    },
    expired: {
      eyebrow: 'Request expired · read only',
      bodyTemplate: 'Deadline {time}. The agent stopped tracking this request, no funds were ever moved. Open a new request to run another auction.',
    },
    sections: {
      flow: 'FLOW',
      bids: 'BIDS',
    },
    settle: {
      escrowLive: {
        tag: 'SETTLE',
        title: 'Escrow live',
        bodyTemplate: 'Escrow holds {amount}. Deal management has moved to its dedicated page.',
        cta: 'Open deal',
      },
      negotiationEnded: {
        tag: 'NEGOTIATION ENDED',
        title: 'No agreement',
        body: 'Your agent ended the negotiation. No terms agreed, no escrow funded. Post a fresh request with a higher budget or tolerance.',
      },
      funding: {
        tag: 'FUNDING ESCROW',
        stalledTag: 'FUNDING STALLED',
        title: 'Approve · fund',
        stalledTitleTemplate: 'Stalled · {time}',
        stalledBodyTemplate: 'Escrow has not funded in {time}.',
      },
      fundingSteps: {
        approveUsdc: 'APPROVE USDC',
        fundEscrow: 'FUND ESCROW',
      },
      locked: {
        tag: 'SETTLE',
        title: 'Locked after accept',
        body: 'Funds lock in escrow once the buyer agent accepts a final bid. Releases unlock after escrow funds.',
      },
    },
    editSection: {
      tag: 'EDIT',
      title: 'Adjust the terms',
      body: 'Update the request text, price tolerance, or trusted-match before a seller agent locks in a match. Budget and deadline stay locked because they live on chain.',
      cta: 'Edit request',
    },
    editModal: {
      tag: '[:EDIT REQUEST:]',
      title: 'Update terms',
      body: 'The agent picks up these changes on its next scan. Budget and deadline stay locked because they live on the JobBoard contract; cancel and re-post to change those.',
      requestTextEyebrow: '[:REQUEST TEXT:]',
      toleranceEyebrow: '[:PRICE TOLERANCE:]',
      toleranceAria: 'Price tolerance percent',
      toleranceFootTemplate: '↳ agent may accept counters up to your budget +{n}%',
      trustedMatchEyebrow: '[:TRUSTED MATCH:]',
      trustedMatchBody: "Weight seller reputation and stake above price. Bids gate on the seller\'s free stake covering the deal's insurance reservation. For higher-value or one-shot trades.",
      saving: 'Saving...',
      save: 'Save changes',
      cancel: 'Cancel',
    },
    cancelSection: {
      tag: 'OR',
      title: 'Pull this request',
      body: 'Posted by mistake or changed your mind? Pull the request now, before any seller agent locks in a match. Nothing funded yet, so the cancel is free.',
      cta: 'Cancel request',
      confirmBody: 'Pull this request? The agent stops scanning bids on it immediately. You can post a fresh one any time.',
      confirmYes: 'Yes, cancel',
      confirmYesBusy: 'Cancelling…',
      confirmNo: 'Keep request',
    },
    outOfReach: {
      tag: 'NO MATCH AT YOUR BUDGET',
      title: 'No match at your budget',
      bodyTemplate:
        'The closest offer needs about {floor} USDC, well above your {budget} USDC budget. Raise your budget toward {floor}, or keep waiting for a cheaper offer.',
      reconsiderHintTemplate:
        'You passed an offer at {price} USDC earlier. Nothing cheaper turned up, so you can bring it back.',
      reconsiderCtaTemplate: 'Reconsider the {price} offer',
      reconsiderBusy: 'Bringing it back…',
      raiseCta: 'Raise budget',
      waitCta: 'Keep waiting',
    },
  },
  nearMissCard: {
    eyebrow: 'Near match · your agent needs a call',
    remainingExpired: 'expired',
    remainingHrMin: '{h}h {m}m left',
    remainingHr: '{h}h left',
    remainingMin: '{m}m left',
    remainingSec: '{s}s left',
    directionBelowFloor: "that's {gap} below your floor of {limit}",
    directionAboveCap: "that's {gap} above your cap of {limit}",
    askedBodyTemplate: 'Karwan found you a deal, but {direction}. Proceed at this price, or pass and the agent keeps your range. Nothing moves until you decide.',
    otherBodySellerTemplate: "Your agent found a near-match at this price, just outside the seller's range. Waiting on them to proceed or pass.",
    otherBodyBuyerTemplate: "Your agent found a near-match at this price, just outside the buyer's range. Waiting on them to proceed or pass.",
    proceedBusy: 'Closing the deal…',
    proceedCta: 'Proceed at this price',
    declineBusy: 'Passing…',
    declineCta: 'Pass',
  },
  negotiationCard: {
    tag: 'NEGOTIATION',
    roundTemplate: 'Round {n}',
    roundOfCapTemplate: 'Round {n} of {cap}',
    states: {
      reviewing: {
        tag: 'REVIEWING',
        headline: 'Reviewing offers.',
        body: 'Agents are comparing active offers against your request.',
      },
      match_ready: {
        tag: 'MATCH READY',
        headline: 'Match found.',
        body: 'The current terms are ready. The seller reviews next.',
      },
      awaiting_user_review: {
        tag: 'REVIEW NEEDED',
        headline: 'Your review is needed.',
        body: 'Open the match to review the current offer before anything moves.',
      },
      terms_changed: {
        tag: 'TERMS CHANGED',
        headline: 'Terms changed.',
        body: 'Review the updated offer. Nothing moves until you confirm.',
      },
      paused_needs_approval: {
        tag: 'ACTION NEEDED',
        headline: 'Match paused.',
        body: 'Funding or security reserve needs attention before matching can continue.',
      },
      reengagement_scheduled: {
        tag: 'SEARCH CONTINUES',
        headline: 'Looking for a better fit.',
        body: 'Agents resume when a materially new offer is available.',
      },
      funding_ready: {
        tag: 'FUNDING READY',
        headline: 'Terms agreed.',
        body: 'Karwan is confirming funding before the deal opens.',
      },
      settling: {
        tag: 'SETTLING',
        headline: 'Settlement in progress.',
        body: 'Funding is protected while the deal moves to the next stage.',
      },
      completed: {
        tag: 'COMPLETED',
        headline: 'Settlement complete.',
        body: 'The confirmed result is available in the deal record.',
      },
      temporarily_unavailable: {
        tag: 'TEMPORARY HOLD',
        headline: 'Match temporarily unavailable.',
        body: 'Review the request before retrying. No settlement was started by this state.',
      },
      status_updating: {
        tag: 'STATUS UPDATING',
        headline: 'Status updating.',
        body: 'Karwan is reconciling the latest confirmed state. Retry only refreshes this view.',
      },
    },
    nextActors: {
      buyer: 'Buyer reviews next',
      seller: 'Seller reviews next',
      agents: 'Agents are reviewing',
      platform: 'Karwan is confirming',
      none: 'No action needed',
    },
    offer: {
      initial: 'INITIAL OFFER',
      changed: 'UPDATED OFFER',
      unknown: 'CURRENT OFFER',
      updatedTemplate: 'UPDATED {time}',
    },
    counterpartyTemplate: '{role} counterparty',
    headlines: {
      agreedTemplate: 'Agreed at {amount} USDC.',
      ended: 'Negotiation ended.',
      negotiating: 'Agents negotiating.',
      awaiting: 'Scanning for bids.',
    },
    subs: {
      awaiting: 'Seller agents are sizing up the request. The first bid lands here.',
      ended: 'No terms were agreed on this request.',
    },
    chips: {
      agreed: 'Agreed',
      standing: 'Standing',
      buyer: 'buyer',
      seller: 'seller',
    },
    timelineHide: 'Hide live timeline',
    timelineShow: 'View live timeline',
  },
  matchBanner: {
    approvedEyebrow: 'Seller accepted',
    approvedBody: 'The seller accepted your deal. Escrow is funded. Opening the live deal.',
    approvedCta: 'Open deal →',
    declinedEyebrow: 'Match declined',
    declinedSellerView: 'You declined this match. The job stays closed; the buyer can post a fresh brief.',
    declinedOtherView: 'The seller declined this match. Post a fresh brief to re-run the auction.',
    pendingEyebrow: 'Match found · awaiting approval',
    proposedTemplate: 'proposed {time}',
    risk: {
      honeyTrap: 'Risk flag · low rep, generous bid',
      lowball: 'Risk flag · lowball from unproven actor',
      spammy: 'Risk flag · counterparty unusually active',
      newBuyer: 'Heads up · buyer is new to the network',
    },
    paidData: {
      label: 'PAID VERIFICATION',
      template: 'Buyer agent paid {amount} to verify this seller\'s credit passport.',
      txCta: 'settlement',
      evidenceCta: 'evidence',
      providerLabel: 'provider',
      claimLabel: 'claim',
      impactShadow: 'legacy match unchanged',
    },
    screen: {
      label: 'COMPLIANCE SCREEN',
      template: 'Your agent paid {amount} on Base to run a sanctions and risk screen on the counterparty.',
      txCta: 'View payment',
      payerCta: 'View payer wallet',
    },
    business: {
      label: 'VERIFIED BUSINESS',
      template: 'Counterparty trades as a verified business.',
    },
    topUp: {
      eyebrow: 'Top up needed',
      buyerTemplate: 'Your agent agreed within your cap, but its wallet is short by {amount}. Top up your buyer agent so the seller can accept and escrow can fund.',
      sellerBody: 'The buyer agent needs a top-up before this can fund. The buyer has been prompted to add funds.',
    },
    approveCta: 'Accept match',
    approveBusy: 'Funding escrow…',
    declineCta: 'Decline',
    declineReasonLabel: 'Reason (optional)',
    declineReasonPlaceholder: 'Why are you declining this match?',
    declineConfirmCta: 'Confirm decline',
    declineConfirmBusy: 'Declining…',
    declineCancelCta: 'Cancel',
    buyerWaiting: 'Waiting for the seller to accept. Your agent will fund escrow automatically when they do. No action needed from you.',
    outsideWaiting: 'Waiting for the seller to accept this match.',
    counterparty: {
      buyerLabel: 'Buyer',
      sellerLabel: 'Seller',
      viewProfile: 'View profile',
      creditPassport: 'Credit passport',
      onX: 'On X',
      more: 'More',
      record: {
        noDeals: 'no deals yet',
        dealOne: '1 deal',
        dealsTemplate: '{n} deals',
        settledTemplate: '{n} settled',
        disputedTemplate: '{n} disputed',
      },
    },
  },
  profilePeek: {
    closeLabel: 'Close',
    identityAriaBuyer: 'buyer identity',
    identityAriaSeller: 'seller identity',
    profileAriaBuyer: 'buyer profile',
    profileAriaSeller: 'seller profile',
    compactEyebrowBuyer: '[:BUYER:]',
    compactEyebrowSeller: '[:SELLER:]',
    fullEyebrowBuyer: '[:BUYER PROFILE:]',
    fullEyebrowSeller: '[:SELLER PROFILE:]',
    noDisplayName: 'no display name set',
    copyAddress: 'Copy address',
    copied: 'Copied',
    xNotConnected: 'X not connected',
    loading: 'Loading',
    workRecord: {
      eyebrow: 'WORK RECORD',
      subtitle: 'Real deals this seller delivered. Private to you, not on the public passport.',
      loading: 'Loading work record…',
      locked: 'The agent did not pull a paid passport on this deal, so the full work record stays locked.',
      empty: 'No completed work on record yet.',
      summaryTemplate: '{total} deals · {clean} clean · {disputed} disputed · avg {avg}',
      receiptTemplate: 'Agent paid {amount} on Arc for this read',
      receiptRail: 'Gasless nanopayment. Settles on Arc through Circle Gateway batching.',
      receiptView: 'view ↗',
      receiptDeposit: 'funding ↗',
      receiptWallet: 'wallet ↗',
      receiptProvider: 'provider',
      receiptClaim: 'claim',
      receiptImpact: 'legacy match unchanged',
      buyerEyebrow: 'BUYER RECORD',
      buyerSubtitle: 'Real deals this buyer funded. Private to you, not on the public passport.',
      buyerEmpty: 'No funded deals on record yet.',
    },
  },
  listingDetail: {
    notFound: {
      tag: 'LISTING NOT FOUND',
      headline: "We couldn't load this offer",
      body: 'The link may be wrong, or the offer has been removed.',
      backCta: 'Back to seller desk',
    },
    backToSeller: 'Back to seller',
    hero: {
      listingTag: 'LISTING',
      statuses: {
        open: 'Open',
        expired: 'Expired',
        matched: 'Matched',
        cancelled: 'Cancelled',
      },
      postedTemplate: 'posted {time}',
    },
    pitch: {
      sectionTag: 'OFFER',
      headline: 'The pitch',
      askingLabel: 'Asking',
      floorLabelTemplate: 'Your floor ({n}% accept)',
      floorNote: '[:PRIVATE:] only you see this. Your agent uses it to steer counters.',
      sellerEyebrow: '[:SELLER:]',
      sellerLabel: 'Seller on Karwan',
      sellerSelfLabel: 'Your offer',
      selfSuffix: ' · you',
    },
    state: {
      tags: {
        cancelled: 'CANCELLED',
        expired: 'EXPIRED',
        matched: 'MATCHED',
        scanning: 'SCANNING',
        open: 'OPEN',
      },
      headlines: {
        cancelled: 'You called it off',
        expired: 'Offer window closed',
        matched: 'Request landed',
        scanning: 'Agent is watching',
        openBuyer: 'Open a deal',
      },
      windowClosesTemplate: 'Window closes {time}',
      cancelledBody: "You cancelled this offer. It no longer scans for matches and won't accept bids. Post a new offer if you want to offer again.",
      expiredMatchedBody: 'The matching window has closed. Your agent did match a request and bid on it, but the buyer did not accept before the window expired. Open the matched job to see how it played out, or post a new offer.',
      expiredUnmatchedBody: 'The matching window has closed. No bid landed in time. Post a new offer to put it back in front of buyer agents.',
      matchedBody: 'Your agent bid on a matching request. The auction continues on the job page.',
      openMatchedCta: 'Open matched job',
      scanningBody: 'The seller agent watches every request that lands. When one matches this offer and the price gap is crossable, it bids automatically. You will get a notification the moment that happens.',
      editCta: 'Edit this offer',
      cancelCta: 'Cancel this offer',
      confirmCancelBody: 'Cancel this offer? It drops out of every match scanner immediately. Cannot be undone. Post fresh if you change your mind.',
      confirmYes: 'Yes, cancel',
      confirmYesBusy: 'Cancelling...',
      confirmNo: 'Keep listed',
      buyerBody: 'This offer is open. Open a direct deal with this seller at the asking price. Payment is only requested after the seller accepts.',
      buyerCtaTemplate: 'Open a deal at {amount} USDC',
    },
    editModal: {
      tag: '[:EDIT OFFER:]',
      title: 'Fix the details',
      body: 'Edits apply right away. Active match scans use the new copy on their next pass.',
      titleEyebrow: '[:TITLE:]',
      descriptionEyebrow: '[:DESCRIPTION:]',
      askingPriceEyebrow: '[:ASKING PRICE USDC:]',
      priceWasTemplate: 'was {n} USDC',
      floorEyebrow: '[:PRICE FLOOR:]',
      floorAria: 'Negotiation max decrease percent',
      floorFootTemplate: '↳ agent rejects counters below {amount} USDC',
      windowDaysEyebrow: '[:WINDOW DAYS:]',
      windowReanchored: 'Window re-anchors from now when you save.',
      windowDefault: 'Days the listing stays open from today.',
      saving: 'Saving...',
      save: 'Save changes',
      cancel: 'Cancel',
    },
  },
  postListing: {
    notConnected: 'Sign in to post a listing. Use the Log in pill in the nav.',
    preview: {
      eyebrow: 'OFFER PREVIEW',
      acceptCaption: 'accept',
      agentListening: 'agent listening',
      floorTemplate: 'floor {amount} USDC',
      matchedCaption: 'matched to buyer requests',
    },
    sectionWork: {
      eyebrow: 'WHAT YOU OFFER',
      title: 'Describe the offer.',
      titleLabel: 'Title',
      titleHint: 'A short headline buyers see first.',
      titlePlaceholder: 'e.g. Spanish → Arabic legal translation',
      descriptionLabel: 'Description',
      descriptionHint: 'What you build, examples, turnaround. Your agent uses this to match requests.',
      descriptionPlaceholder: 'Describe your offer in detail. The agent uses this to match buyer requests.',
    },
    sectionPricing: {
      eyebrow: 'PRICING',
      title: 'Set your asking and the floor.',
      askingLabel: 'Asking price',
      askingHint: 'Your headline price. Your agent bids this on matched briefs.',
      acceptLabel: 'Accept decrease',
      acceptHint: 'How far below asking the agent may accept. 0 = strict at price.',
      windowLabel: 'Window',
      windowHint: 'How long the offer stays live before it auto-expires. Pick a unit for demo timing.',
      windowUnitShort: {
        min: 'MIN',
        hr: 'HRS',
        day: 'DAYS',
      },
      unitPickerAria: 'Window unit',
      unitPickerLabels: {
        min: 'MIN',
        hr: 'HR',
        day: 'DAY',
      },
    },
    intentWarning: {
      eyebrow: '[:WAIT. IS THIS AN OFFER OR A REQUEST?:]',
      bodyPart1: 'This reads like something you ',
      bodyEmphNeed: 'need',
      bodyPart2: ', not something you ',
      bodyEmphOffer: 'offer',
      bodyPart3: '. Offers are for sellers; requests (posted from the buyer desk) are for buyers. If you meant to find a backend engineer, ',
      postRequestLink: 'post a request instead',
      bodyPart4: '. Click ',
      submitEmph: 'Post offer',
      bodyPart5: ' again to publish as-is.',
    },
    submit: {
      posting: 'Posting…',
      cta: 'Post offer',
      fundsCaption: '↳ your agent scans open briefs and buyer profiles for a match',
    },
    watchingScanning: 'scanning open briefs for a match',
    errors: {
      postFailedTemplate: "Couldn't post: {error}",
      activating: 'Activating…',
      activateCta: 'Activate your agents here →',
    },
    yourOffers: {
      eyebrow: 'YOUR OFFERS',
      allDismissed: 'All terminal offers dismissed.',
    },
    offerStatuses: {
      open: 'Open',
      expired: 'Expired',
      matched: 'Matched',
      cancelled: 'Cancelled',
    },
    dismissTitle: 'Dismiss',
    dismissAriaTemplate: 'Dismiss {status} offer',
    openAriaTemplate: 'Open offer {title}',
  },
  editDealModal: {
    tag: '[:EDIT DEAL:]',
    title: 'Update terms',
    body: 'Changes save right away. The seller sees the new terms before accepting, and the acceptance window restarts so they can review.',
    deadlineHintShort: 'Leave blank for an open-ended deal. Max 180 days when set.',
    acceptanceHintShort: 'The acceptance clock restarts from now after you save.',
    deliveryHintShort: 'Slice the seller receives when they mark delivered. Rest on your verification.',
    trustedMatchBodyShort: 'Seller has to stake USDC to accept. Slashed if they lose a dispute. Leave off for casual deals.',
    feeBreakdownTemplate: 'You fund {funded} USDC · seller receives {seller} · platform fee {fee}',
    saving: 'Saving...',
    save: 'Save changes',
    cancel: 'Cancel',
  },
  eventList: {
    empty: {
      cardTag: 'TIMELINE EMPTY',
      cardBody: 'Awaiting the first on-chain event. Bids and matches will land here.',
      timelineTag: 'Timeline empty',
      timelineBody: 'Awaiting the first on-chain event. Seller scoring and bids will land here as the auction opens.',
    },
    jobLabelCard: 'JOB',
    jobLabelTimeline: 'job',
    openLink: 'OPEN →',
    explorerTitle: 'Open on Arc Testnet explorer',
    chipLabels: {
      price: 'Price',
      counter: 'Counter',
      confidence: 'Confidence',
      score: 'Score',
      skillMatch: 'Skill match',
      offers: 'Offers',
      matched: 'Matched',
      reputation: 'Reputation',
      bestRep: 'Best rep',
      milestone: 'Milestone',
      call: 'Call',
      reason: 'Reason',
      where: 'Where',
      amount: 'Amount',
      from: 'From',
      security: 'Security',
    },
    sourceDomains: {
      ethereumSepolia: 'Ethereum Sepolia',
      baseSepolia: 'Base Sepolia',
      unknownTemplate: 'domain {n}',
    },
    eventTexts: {
      // Two paths notice the same thing: the live agent path emits job.tracked,
      // the on-chain backfill emits job.posted. Same meaning to a reader.
      'job.posted': 'Job posted on chain',
      'job.tracked': 'Job posted on chain',
      'job.expired': 'Request expired with no match',
      'bid.scored': 'Buyer agent scored the bid',
      'bid.submitted': 'Seller submitted a bid',
      'counter.issued': 'Buyer agent issued a counter',
      'counter.response.submitted': 'Seller responded to the counter',
      'bid.accepted': 'Buyer accepted final terms',
      'escrow.approved': 'USDC approved for escrow',
      'escrow.funded': 'Escrow funded',
      'escrow.milestone.released': 'Milestone released',
      'escrow.settled': 'Deal settled',
      'agent.skipped': 'Seller skipped this request',
      'agent.declined': 'Agent ended negotiation',
      'agent.error': 'Agent hit an error',
      'agent.fallback': 'Agent used a backup decision',
      'agent.decision': 'Agent decision',
      'market.scanned': 'Market scanned',
      'deal.matched': 'Match found · awaiting approval',
      'deal.match.approved': 'Match approved · escrow funded',
      'deal.match.declined': 'Match declined',
      'listing.posted': 'Offer posted',
      'listing.matched': 'Offer matched a request',
      'listing.cancelled': 'Offer withdrawn',
      'listing.expired': 'Offer expired',
      'brief.cancelled': 'Request withdrawn',
      'bridge.burned': 'USDC burned on source chain',
      'bridge.attested': 'Circle attestation received',
      'bridge.minted': 'USDC minted on Arc',
      'bridge.error': 'Bridge hit an error',
      'reputation.recorded': 'Track record updated',
      'deal.direct.created': 'Direct deal opened and funded',
      'deal.accepted': 'Seller accepted the deal terms',
      'deal.delivered': 'Seller marked the work delivered',
      'deal.delivery.flagged': 'Delivery link flagged and held for review',
      'deal.delivery.cleared': 'Corrected delivery link cleared',
      'deal.review.started': 'Buyer review window opened',
      'deal.review.heartbeat': 'Buyer is still reviewing',
      'deal.auto_released': 'Final milestone auto-released',
      'deal.disputed': 'Deal moved to dispute',
      'deal.cancelled': 'Deal cancelled and refunded',
      'deal.cancel.proposed': 'Cancellation proposed',
      'deal.cancel.declined': 'Cancellation declined',
      'security.hold': 'Payment held for review',
      'security.hold.cleared': 'Review cleared, payment released',
      'security.attested': 'Delivery attested',
      'security.match.evaluated': 'Match checked for risk',
      'trade.document.anchored': 'Trade document anchored on chain',
      'trade.pod.accepted': 'Proof of delivery accepted',
      'factoring.offered': 'Invoice financing offered',
      'factoring.accepted': 'Invoice financing accepted',
      'factoring.rejected': 'Invoice financing declined',
      'factoring.settled': 'Invoice financing repaid',
      'factoring.defaulted': 'Invoice financing defaulted',
      'po.funded': 'PO financing advanced',
      'po.released': 'PO financing released',
      'po.repaid': 'PO financing repaid',
      'po.reclaimed': 'PO financing reclaimed',
      'po.defaulted': 'PO financing defaulted',
      'business.registration.submitted': 'Business registration submitted',
      'business.verified': 'Business verified',
      'business.rejected': 'Business registration declined',
      'vault.deposit': 'Stake added',
      'vault.withdraw.requested': 'Withdrawal requested, cool-down started',
      'vault.withdraw.cancelled': 'Withdrawal cancelled',
      'vault.claimed': 'Stake claimed',
      'vault.cooldown.completed': 'Cool-down finished',
      'yield.claimed': 'Yield claimed',
      'yield.credited': 'Yield earned',
      'gateway.deposited': 'Added to balance',
      'gateway.agent.funded': 'Agent funded',
      'gateway.cashed.out': 'Cashed out',
      'wallet.credited': 'Money in',
      'wallet.debited': 'Money out',
      'cashout.arc.completed': 'Withdrawal completed',
    },
    reasonLabels: {
      'llm-counter-over-budget': 'Price above ceiling',
      'no-keyword-match': 'Outside skills',
      'no-topical-overlap': 'Outside skills',
      'not-a-match': 'Not a match',
      'low-confidence-or-skip': 'Not a topical match',
      'buyer-reputation-too-low': 'Buyer reputation too low',
      'llm-price-out-of-range': 'Price out of range',
      'no-bids': 'No bids received',
      'no-counter-suggestion': 'No counter prepared',
      'price-gap-uncrossable': 'Price gap too wide',
      'budget-out-of-range': 'Outside budget range',
      'budget-below-seller-floor': 'Outside budget range',
      'deadline-out-of-range': 'Outside delivery window',
      'own-auction': 'Your own seller',
      'finance-lane-requires-business': 'Business sellers only',
      'insufficient-stake-trusted-match': 'Not enough stake for trusted match',
    },
    scopeLabels: {
      counterEvaluation: 'LLM counter-eval failed',
      bidEvaluation: 'LLM bid-eval failed',
      submitBid: 'On-chain submitBid failed',
      respondToCounter: 'On-chain counter-response failed',
      acceptBid: 'On-chain acceptBid failed',
      fundEscrow: 'On-chain fundEscrow failed',
      recordCompletion: 'Reputation record failed',
      JobPosted: 'JobPosted handler crashed',
      CounterOfferIssued: 'CounterOfferIssued handler crashed',
      BidSubmitted: 'BidSubmitted handler crashed',
    },
  },
  pageBits: {
    stake: {
      networkYield: 'NETWORK YIELD',
      tokenizedTbills: 'Tokenized T-bills',
      verifiedYield: 'Verified yield',
      yourYield: 'YOUR YIELD',
      earnedByYou: 'Earned by you',
      claimableByYou: 'Claimable by you',
    },
    dealDetail: {
      tradeContext: 'TRADE CONTEXT',
      anchoredDocuments: 'ANCHORED DOCUMENTS',
      containerRefPlaceholder: 'Container or waybill reference',
    },
    sellerOffer: {
      privatePosition: 'Private financing position',
      trackRepayment: 'Track repayment and speak privately with your financier.',
    },
    financierPanels: {
      yourPositions: 'Your positions',
      expectedReturn: 'Expected return',
      retiredContract: 'Opened on the previous PO contract, retired 2026-07-27. Settled off the desk.',
      positionDetails: 'position details',
      smeTrades: 'SME TRADES',
      openFinancierDesk: 'Open the financier desk',
      loadingPosition: 'Loading position\u2026',
    },
    newsletter: {
      noSuchIssue: 'No such issue',
      couldNotLoadIssue: 'Could not load this issue.',
      couldNotLoadArchive: 'Could not load the archive.',
    },
    assistant: { transferRef: 'Transfer ref' },
    examples: {
      brief: 'Example: I need a backend engineer to build an API endpoint. Budget 120 USDC, 2 days, plus or minus 15% on price, prefer a trusted seller.',
      directDeal: 'Example: 500 USDC to 0x1234...abcd for a landing page redesign, 7 days, 50/50 milestone split, trusted.',
      scout: '2,000 units custom packaging, Lagos to Dubai',
      listing: 'Example: Solidity audit for ERC-4626 vaults. 1500 USDC fixed, 7 days turnaround, plus or minus 20% on price, listing open for 14 days.',
    },
    supplyDesk: 'Supply desk',
    chooseHowDealStarts: 'Choose how the deal starts.',
    railDotTemplate: 'Show card {n} of {total}',
    registerABusiness: 'Register a business',
  },
  profileEdit: {
    displayName: 'Display name',
    minBudget: 'Min budget (USDC)',
    maxBudget: 'Max budget (USDC)',
    minDays: 'Min days',
    maxDays: 'Max days',
    asBuyer: 'As a buyer',
    milestoneSplit: 'Milestone split (must total 100)',
  },
  registerBusiness: {
    legalCompanyName: 'Legal company name',
    documentType: 'Document type',
    businessRegistration: 'Business registration',
    taxCertificate: 'Tax certificate',
    eyebrow: 'BUSINESS IDENTITY',
    title: 'Trade as a business',
    loading: 'Loading',
    yourBusiness: 'Your business',
    loadError: 'We could not load the current verification status. Your saved company details are unchanged.',
    sector: 'Business sector',
    region: 'Operating region',
    document: 'Supporting document',
    filePrivacy: 'Choose a clear PDF or image. The original stays on this device; keep it available if a reviewer requests it.',
    fileSelected: '{name} selected. The original stays on this device.',
    status: {
      none: 'Not submitted',
      submitted: 'Under review',
      verified: 'Verified',
      rejected: 'Needs attention',
    },
    body: {
      none: 'Complete your trade card, then provide business registration or tax evidence for review.',
      submitted: 'Your evidence is under review. You can keep using direct deals while Karwan checks the business identity.',
      verified: '{company} is verified. Counterparties can see the identity badge; this is not a performance guarantee.',
      rejected: 'The previous evidence could not be confirmed. Review the company details and submit a clearer document.',
    },
    actions: {
      start: 'Add evidence',
      resubmit: 'Review and resubmit',
      submit: 'Submit for review',
      submitting: 'Submitting…',
      cancel: 'Cancel',
      openWorkflow: 'Complete verification',
      view: 'View verification',
      retry: 'Try again',
    },
    errors: {
      companyName: 'Add the legal company name before submitting.',
      document: 'Attach a business registration or tax document.',
      submit: 'We could not submit this evidence. Check your connection and try again.',
    },
    page: {
      eyebrow: 'BUSINESS VERIFICATION',
      title: 'Build your verified trade card',
      lede: 'Complete the company details counterparties need, provide identity evidence, and follow the review from one place.',
      signInBody: 'Sign in with your business account to complete company verification.',
      backToProfile: 'Back to profile',
      progressLabel: 'Business verification progress',
      steps: { profile: 'Company profile', evidence: 'Business evidence', review: 'Review' },
      evidenceLockedTitle: 'Finish the company profile first',
      evidenceLockedBody: 'Add the legal company name, sector, and operating region. Saving those details unlocks evidence submission.',
    },
  },
  discovery: {
    navLabel: 'Discovery sections',
    requestsAndOffers: 'Requests and offers',
    businesses: 'Businesses',
  },
  partnersBrowse: {
    sectionTag: 'FIND PARTNERS',
    headlineAccent: 'business partner',
    allSectors: 'All sectors',
    regionPlaceholder: 'e.g. Dubai, or South Asia',
    heroBody: 'Browse real business profiles by sector, market, and location. Identity checks and trading history stay visible before you decide who to contact.',
    pilotBody: 'Business deal tools are currently available to approved pilot accounts. The directory and public trust profiles remain open to everyone.',
    directoryTitle: 'Browse business profiles',
    searchLabel: 'Search businesses',
    searchPlaceholder: 'Name, market, location, or certification',
    sectorLabel: 'Sector',
    verifiedOnly: 'Identity verified',
    sortLabel: 'Sort',
    sortTrust: 'Verified first',
    sortName: 'Name',
    clear: 'Clear filters',
    resultsOne: '1 business found',
    resultsMany: '{n} businesses found',
    refreshing: 'Refreshing directory',
    errorTitle: 'Business profiles are unavailable.',
    errorBody: 'We could not reach the directory. Your filters are preserved.',
    retry: 'Try again',
    emptyTitle: 'No businesses match these filters.',
    emptyBody: 'Clear a filter or search another market. Karwan will not invent a result when no profile matches.',
    identityVerified: 'Business identity verified',
    identityNote: 'Karwan reviewed the business identity. This is not a performance guarantee.',
    listedDetailsNote: 'Business-supplied profile details',
    supplies: 'Can supply',
    markets: 'Markets',
    minimumOrder: 'Minimum order',
    leadTime: 'Lead time',
    leadTimeTemplate: '{n} day lead time',
    listedCertifications: 'Listed certifications',
    viewTrustProfile: 'View trust profile',
    openDeal: 'Open a deal',
    signInToTrade: 'Sign in to trade',
    registerBusiness: 'Register a business',
    pilotOnly: 'Business trading pilot',
  },
  financingChat: {
    title: 'Seller \u2194 financier',
    privateConversation: 'Private conversation',
    coordinateBody: 'Coordinate financing and repayment here. This chat is not shared with the buyer.',
    startTitle: 'Start the financing conversation',
    startBody: 'Use this private space to confirm timing, delivery progress, and repayment questions.',
    cancelReply: 'Cancel reply',
    placeholder: 'Write a private message\u2026',
    closedTitle: 'Conversation closed.',
    closedBody: 'The full record remains available to the seller and financier.',
  },
  financingWorkspace: {
    title: 'Private financing workspace',
    positionSummary: 'Position summary',
    amountFinanced: 'Amount financed',
    expectedRepayment: 'Expected repayment',
    sellerProtectionReserved: 'Seller protection reserved',
    participants: 'Participants',
    dealProgress: 'Deal progress',
    currentStage: 'Current stage',
  },
  a11y: {
    closeHistory: 'Close history',
    sectionNavigation: 'Section navigation',
    toggleTheme: 'Toggle theme',
    inputMethod: 'Input method',
    dealType: 'Deal type',
    newReply: 'New reply',
    cumulativeTradeVolume: 'Cumulative trade volume',
    businessDealViewOnly: 'Business deal, view only',
    cumulativeYieldDistributed: 'Cumulative USDC distributed to stakers over time',
    findBusinesses: 'Find businesses to trade with, by sector and region',
    fundFactoringAndPos: 'Fund factoring and purchase orders',
    sendFeedback: 'Send feedback or report a bug',
    turnOffTips: 'Turn off tips everywhere. You can re-enable them in Settings.',
  },
  financierDashboard: {
    sectionTag: 'FINANCIER',
    headline: 'Fund real trade',
    intro: 'Browse SME invoices and POs open to early payout. Every deal carries a credit passport, an on-chain settlement path, and a verifiable repayment record.',
    tabs: { factor: 'Factor invoices', po: 'Fund POs' },
    soon: 'soon',
    filters: { sector: 'Sector', region: 'Region', regionPlaceholder: 'e.g. Lagos', clear: 'Clear', allSectors: 'All sectors' },
    sellerTierTitle: 'Seller reputation tier. Drives the discount floor and the stake the seller must post to take the advance.',
    sellerPassport: 'Seller passport',
    yourOffer: 'Your offer',
    editOffer: 'Edit offer',
    makeOffer: 'Make offer',
    emptyFactoring: {
      tag: 'NO OPEN FACTORING',
      body: 'Nothing to fund right now. Invoices appear here the moment a seller raises one on an accepted deal.',
    },
    emptyPo: {
      tag: 'NO OPEN PO LINES',
      body: 'Nothing to fund right now. Lines appear here as sellers draw against accepted purchase orders.',
    },
    close: 'Close',
    signInToPost: 'Sign in to post',
    signInToFund: 'Sign in to fund',
    working: 'Working…',
    switchToArc: 'Switch to Arc',
    offer: {
      faceValue: 'FACE VALUE',
      quickDiscount: 'Quick discount',
      customDiscount: 'Custom discount',
      customDiscountAria: 'Custom discount percent',
      invoiceFace: 'Invoice face',
      stillClaimable: 'Still claimable',
      youPayNow: 'You pay seller now',
      youReceiveOnSettlement: 'You receive on settlement',
      yourSpread: 'Your spread',
      sellerFloor: 'Seller will not go below',
      replaceOffer: 'Replace offer',
      postOffer: 'Post offer',
      recipientUnavailable: "This invoice's payout account could not be verified. Refresh the desk and try again.",
    },
    po: {
      repayOnPod: 'REPAY ON PoD',
      buyerOrAttester: 'BUYER OR ATTESTER',
      fundLine: 'Fund line',
      principal: 'Principal you fund',
      repayOnSettlement: 'Repay on settlement',
      sellerProtection: 'Seller protection',
      repaymentDeadline: 'Repayment deadline',
      expectedDelivery: 'Expected delivery',
      earliestRepayment: 'Earliest repayment',
      earliestNote: 'The earliest date follows the deal delivery deadline and includes seven days for buyer review and release.',
      notDated: 'Not dated',
      sellerReceivesNow: 'Seller receives now',
      youReceiveOnSettlement: 'You receive on settlement',
      yourSpread: 'Your spread',
      ifSettlementFallsShort: 'If settlement falls short',
    },
    extensions: {
      days7: '7 more days',
      days30: '30 more days',
      days45: '45 more days',
      shortCushion: 'Short cushion',
      standard: 'Standard',
      extended: 'Extended',
    },
  },
  tradeTerms: {
    sectionTitle: 'Goods or service',
    tradeType: 'Trade type',
    types: { service: 'SERVICE', goods: 'GOODS', mixed: 'MIXED' },
    incoterms: 'Incoterms 2020',
    incotermsHint: 'The trade-rule each side commits to.',
    incotermGloss: {
      EXW: 'Buyer collects from factory.',
      FCA: 'Seller delivers to a named carrier.',
      FOB: 'Seller loads on the named vessel.',
      CIF: 'Seller pays freight and insurance to port.',
      DAP: 'Seller delivers; buyer clears customs.',
      DDP: 'Seller delivers and clears customs.',
    },
    paymentTerms: 'Payment terms',
    paymentTermsHint: 'When the buyer pays after delivery.',
    paymentTermLabels: { immediate: 'IMMEDIATE', net30: 'NET 30', net60: 'NET 60', net90: 'NET 90' },
    sourcingSector: 'Sourcing sector',
    sourcingSectorHint: 'The kind of supplier you want. Your agent matches partners on this.',
    sourcingRegion: 'Sourcing region',
    sourcingRegionHint: 'Where you want to source from. Weighted in matching and shown to financiers.',
    sourcingRegionPlaceholder: 'e.g. South Asia, or Dubai, AE',
    counterpartyPlaceholder: 'e.g. Acme Imports Ltd',
    counterpartyRegionPlaceholder: 'e.g. Dubai, AE',
    removeDocument: 'Remove document',
    milestoneSplitAria: 'Milestone split percentages, comma separated',
  },
  smeCompany: {
    sectionTag: 'COMPANY PROFILE',
    headline: 'Trade card',
    loading: 'Loading',
    edit: 'Edit',
    addCompany: 'Add company',
    emptyBody: 'Add a company profile so financiers can review your sector and region before they fund.',
    verificationRequired: 'Add the company name, sector, and operating region to continue.',
    saveError: 'We could not save these company details. Check your connection and try again.',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    discovery: {
      label: 'List in partner discovery',
      body: 'Let other businesses find you by sector and region. You can still post, bid, and deal with this off.',
    },
    repayment: {
      eyebrow: '[:REPAYMENT BEHAVIOR:]',
      windowTemplate: 'last {count} deals',
      onTimeRate: 'On-time rate',
      avgDaysToSettle: 'Avg days to settle',
      defaults: 'Defaults',
      financingRepaid: 'Financing repaid',
    },
    view: {
      name: 'Name',
      sector: 'Sector',
      region: 'Region',
      founded: 'Founded',
      size: 'Size',
      regTaxId: 'Reg / Tax ID',
      markets: 'Markets',
      annualVolume: 'Annual volume',
      minOrder: 'Min order',
      leadTime: 'Lead time',
      leadTimeTemplate: '{days} days',
      certifications: 'Certifications',
      website: 'Website',
    },
    form: {
      companyName: 'Company name',
      companyNamePlaceholder: 'e.g. Lagos Exporter Co',
      companyNameHint: 'Editable to fix a misentry. Capped: once every 30 days, 5 lifetime.',
      sector: 'Sector',
      region: 'Region',
      regionPlaceholder: 'e.g. Lagos, Nigeria',
      yearFounded: 'Year founded',
      employeeBand: 'Employee band',
      website: 'Website',
      regTaxId: 'Reg / Tax ID',
      regTaxIdPlaceholder: 'e.g. trade-license / reg no.',
      primaryMarkets: 'Primary markets',
      primaryMarketsPlaceholder: 'e.g. MEASA, EU',
      annualVolume: 'Annual volume',
      minOrder: 'Min order',
      minOrderPlaceholder: 'e.g. 500 units, or $5k',
      leadTimeDays: 'Lead time (days)',
      leadTimePlaceholder: 'e.g. 21',
      certifications: 'Certifications',
      certificationsPlaceholder: 'e.g. ISO 9001, GOTS',
      hints: {
        companyName: 'Your registered business name shown on trade cards and documents.',
        sector: 'The primary industry buyers use to find your business.',
        region: 'Where your business operates or ships from.',
        yearFounded: 'The year your business began trading.',
        employeeBand: 'An approximate team-size signal for counterparties.',
        website: 'A public site where counterparties can learn about your business.',
        regTaxId: 'Your registration or tax identifier for business checks.',
        primaryMarkets: 'The regions or countries you currently serve.',
        annualVolume: 'Your approximate yearly trade volume in USDC.',
        minOrder: 'The smallest order your business normally accepts.',
        leadTimeDays: 'Typical days from agreement to delivery.',
        certifications: 'Relevant certifications or standards buyers should see.',
      },
    },
    sectors: {
      agriculture: 'Agriculture',
      textiles: 'Textiles',
      electronics: 'Electronics',
      logistics: 'Logistics',
      manufacturing: 'Manufacturing',
      services: 'Services',
      other: 'Other',
    },
    employeeBands: {
      micro: 'Micro (< 10)',
      small: 'Small (10–50)',
      medium: 'Medium (50–250)',
    },
    volumeBands: {
      under100k: 'Under $100k',
      from100kTo1m: '$100k – $1M',
      from1mTo10m: '$1M – $10M',
      over10m: 'Over $10M',
    },
  },
  creditPassport: {
    eyebrow: 'Credit passport',
    fallbackName: 'Karwan wallet',
    copyAddressTitle: 'Copy address',
    copyAddressIdle: 'copy',
    copyAddressDone: 'copied',
    invalid: {
      headline: 'Invalid address',
      body: 'A passport URL needs a full wallet address, like /credit-passport/0x1234…abcd.',
    },
    error: {
      headline: 'Could not load this passport',
      bodyTemplate: 'The on-chain record for {address} is unavailable right now. Try again in a moment.',
    },
    scorePanel: {
      compositeScore: 'Composite score',
      outOfTotal: 'of 1000',
      nextTier: 'Next tier',
      nextTierTemplate: '{tier} · +{delta}',
    },
    stats: {
      success: 'Success',
      disputed: 'Disputed',
      failed: 'Failed',
      activeStake: 'Active stake',
      syncing: 'syncing',
      syncingTitle: 'Scanning chain history. The total may still rise.',
    },
    meta: {
      settled: 'Settled',
      tenure: 'Tenure',
      tenureDaysSuffix: 'd',
    },
    skills: {
      eyebrow: 'Verified skills',
      caption: 'Checked by Karwan',
      verifiedOn: 'Verified {date}',
      expires: 'Renews {date}',
    },
    factors: {
      eyebrow: 'Score factors',
      scaleCaption: '0 to 100 each',
      labels: {
        completion: 'Completion',
        stake: 'Stake',
        volume: 'Volume',
        tenure: 'Tenure',
        activity: 'Activity',
        referral: 'Referral',
      },
    },
    footer: {
      disclaimer: 'Composite of deal history, stake, and tenure. Reputation is recorded on Arc and travels with the wallet across deals.',
      verifiedLink: 'Verified on Arc ↗',
    },
  },
  feedback: {
    hero: {
      tag: 'FEEDBACK',
      headline: 'Tell us what you hit',
      body: 'You are testing on Arc Testnet, so things will break. A bug, a rough edge, an idea, anything. Paste a screenshot straight in. It goes to the team the moment you send it.',
    },
    categories: {
      bug: { label: 'Bug', blurb: 'Something broke or behaved wrong' },
      improvement: { label: 'Improvement', blurb: 'An idea to make it better' },
      other: { label: 'Other', blurb: 'A question or general note' },
      praise: { label: 'Praise', blurb: 'Something you liked' },
    },
    fields: {
      categoryEyebrow: 'WHAT KIND OF FEEDBACK',
      titleEyebrow: 'TITLE',
      messageEyebrow: 'WHAT HAPPENED',
      screenshotsEyebrowTemplate: 'SCREENSHOTS ({n}/{max})',
      whereEyebrow: 'WHERE (OPTIONAL)',
      contactEyebrow: 'CONTACT (OPTIONAL)',
    },
    placeholders: {
      title: 'Short summary, e.g. Bridge stuck on attesting',
      message: 'What you did, what you expected, what happened instead. You can paste a screenshot right here.',
      where: 'Page or screen, e.g. /bridge on mobile',
      contact: 'Email or @handle to follow up',
    },
    dropZone: {
      bodyBefore: 'Paste, drop, or ',
      chooseFiles: 'choose files',
      bodyAfter: '.',
      formatLine: 'PNG or JPG, up to {n}',
      removeAria: 'Remove screenshot',
    },
    errors: {
      maxShotsTemplate: 'You can attach up to {n} screenshots.',
      imageReadFailed: 'One image could not be read. Try a PNG or JPG.',
      shortTitle: 'Add a short title (at least 3 characters).',
      shortMessage: 'Tell us a little more in the description.',
      submitFailed: 'Could not send feedback. Please try again.',
    },
    submit: {
      sending: 'Sending…',
      cta: 'Send feedback',
      noAccountNeeded: 'No account needed.',
      sendingAsTemplate: 'Sending as {address}',
    },
    success: {
      headline: 'Got it. Thank you',
      body: 'Your feedback reached the team. If you left a contact, we may follow up. Found something else? Send another.',
      sendAnother: 'Send another',
      backToApp: 'Back to app',
    },
  },
  extensionRequest: {
    ariaLabel: 'Request more delivery time',
    tag: '[:REQUEST EXTENSION:]',
    title: 'Ask the buyer for more time.',
    body: 'Pick how much more time you need. If they approve, the delivery deadline shifts by that amount.',
    durationEyebrow: '[:DURATION:]',
    reasonEyebrow: '[:REASON. OPTIONAL:]',
    reasonPlaceholder: 'A short note for the buyer.',
    presets: {
      sixHours: '+6 hours',
      twelveHours: '+12 hours',
      oneDay: '+1 day',
      threeDays: '+3 days',
      sevenDays: '+7 days',
    },
    errorFallback: 'Could not send the request.',
    sending: 'Sending…',
    send: 'Send request',
    cancel: 'Cancel',
  },
  fundAgentOptions: {
    eyebrow: 'FUND FROM',
    wallet: {
      label: 'Wallet balance',
      tooltip: 'Pays from the balance on your sign-in wallet. This is the shortest route when the money is already on Arc.',
      web3Note: 'Your wallet will ask you to approve the transfer.',
    },
    otherAgent: {
      labelSeller: 'Seller agent',
      labelBuyer: 'Buyer agent',
      tooltip: 'Moves USDC between your own two agent wallets. Both belong to you, so nothing leaves your account.',
    },
    gateway: {
      label: 'Pooled balance',
      tooltip: 'Spends from the balance you hold across chains. It settles on Arc without a bridge wait.',
      fundCta: 'Add to pooled balance',
      noRecipient: 'This agent has no wallet on record yet, so there is nowhere to send the money.',
    },
    chain: {
      label: 'Another chain',
      tooltip: 'Brings USDC over from another chain you hold it on. It arrives on Arc and lands in your balance.',
      cta: 'Open deposit',
      note: 'Deposits from another chain take a few minutes to arrive, so start this before you need the funds.',
    },
    moveCta: 'Move {amount} USDC',
    moving: 'Moving...',
    moved: 'Moved',
    moveFailed: 'That transfer did not go through. Try again.',
  },
  depositRails: {
    chooserAria: 'Choose how money moves',
    soon: 'SOON',
    direct: {
      tab: 'Direct',
      tag: 'DIRECT DEPOSIT',
      title: 'One address, any chain',
      blurb: 'Send USDC to this address from any chain you hold it on. It reaches Arc on its own and shows up as spendable.',
    },
    gateway: {
      tab: 'Gateway',
      tag: 'GATEWAY BALANCE',
      title: 'Hold across chains, spend on one',
      blurb: 'Keep one balance that spans chains and spend it wherever you need, on a single signature and with no bridge wait.',
    },
    cctp: {
      tab: 'Transfer',
      tag: 'CHAIN TRANSFER',
      title: 'Move between two chains',
      blurb: 'Burns on the chain you are sending from and mints on the one you are sending to. The right tool for a one-off move.',
    },
    onramp: {
      tab: 'Card & bank',
      tag: 'CARD AND BANK',
      title: 'Your local currency',
      blurb: 'Deposit, spend and withdraw in your local currency. Card or bank transfer, both ways.',
      body: 'Not open yet. Every other route here settles in USDC. This one converts your currency to USDC on the way in, and back on the way out.',
      inLabel: 'Buy USDC',
      outLabel: 'Cash out to a bank',
    },
  },
  tierProgress: {
    pointsTemplate: '{tier} · +{points}',
    dealsTemplate: '{tier} · {deals} more deals',
    dealsOneTemplate: '{tier} · 1 more deal',
    concentrationTemplate: '{tier} · needs varied counterparties',
    topTier: 'Top tier',
  },
  chatPanel: {
    withCounterpartyTemplate: '[:WITH {name}:]',
    telegramNote: 'Also delivered to Telegram when linked',
    loadError: 'Could not load chat history.',
    emptyMessage: 'No messages yet. Say hello.',
    inputPlaceholder: 'Write a message…',
    sending: 'Sending…',
    send: 'Send',
  },
  liveBidsPanel: {
    empty: {
      title: 'No bids yet.',
      body: 'The seller agent is scoring your request.',
    },
    leadBadge: 'Lead',
    profileTitleTemplate: "View {name}'s profile",
    profileAriaTemplate: 'View profile for {name}',
    counter: 'Counter',
    eta: 'ETA',
    scoreOutOf: '/100',
  },
  listingsBrowse: {
    signInTag: 'MARKETPLACE',
    signInBody: 'Live offers and requests matched to your profile. Sign in to watch both sides.',
    heroTag: 'MARKETPLACE',
    heroHeadlinePart1: 'What sellers offer.',
    heroHeadlinePart2Prefix: 'What buyers ',
    heroAccent: 'need',
    heroBody: 'Live offers and requests on Karwan. Matches are notified.',
    filters: {
      all: 'All',
      offers: 'Offers',
      briefs: 'Requests',
    },
    findTag: 'DISCOVER',
    findTitle: 'Find the right trade.',
    findBody: 'Search real requests and offers, then narrow by transaction type and price. Match proposals always require a person to review the terms.',
    searchLabel: 'Search requests and offers',
    searchPlaceholder: 'What do you need, sell, or deliver?',
    typeFilterLabel: 'Type',
    scopeFilterLabel: 'Market',
    scope: {
      all: 'All markets',
      services: 'Services',
      business: 'Business',
    },
    sortFilterLabel: 'Sort',
    sort: {
      newest: 'Newest',
      lowestPrice: 'Lowest price',
      highestPrice: 'Highest price',
    },
    clearFilters: 'Clear filters',
    resultsOne: '1 result',
    resultsMany: '{n} results',
    refreshing: 'Refreshing market',
    retry: 'Try again',
    partial: {
      offers: 'Offers could not be refreshed. Current requests are still shown.',
      requests: 'Requests could not be refreshed. Current offers are still shown.',
      all: 'The market could not be refreshed. Try again when your connection returns.',
    },
    sections: {
      personalTitle: 'Open trades',
      personalNote: 'Requests and offers from individuals.',
      hiringTitle: 'Businesses hiring',
      hiringNote: 'Service requests and offers involving a business.',
      businessTitle: 'Business trades',
      businessNote: 'Open trade-finance requests and offers.',
      businessViewOnlyNote: 'Visible here. A business account is required to act.',
    },
    liveCaption: 'LIVE FROM KARWAN',
    businessFilterNote: 'BUSINESS TRADES ONLY',
    error: "Couldn't load the marketplace.",
    emptyAllTag: 'EMPTY MARKET',
    emptyAllBody: 'No offers or requests yet. Post one to start the network.',
    emptyFilteredTag: 'NO MATCH',
    emptyFilteredTemplate: 'No {side} right now.',
    emptyFilteredTitle: 'No results match these filters.',
    emptyFilteredBody: 'Clear a filter or try a broader search. Karwan will not invent a result when nothing matches.',
    card: {
      statusMatched: 'MATCHED',
      statusOffer: 'OFFER',
      statusRequest: 'REQUEST',
      priceLabelAsking: 'asking',
      priceLabelBudget: 'budget',
      partyRoleSeller: 'SELLER',
      partyRoleBuyer: 'BUYER',
      selfSuffix: ' · you',
      metaBidOne: '1 bid',
      metaBidsTemplate: '{n} bids',
      metaAwaitingBids: 'awaiting bids',
      priceUnitTemplate: 'USDC {label}',
      matchedBefore: 'Matched before',
      availableUntilTemplate: 'Available {time}',
      dueTemplate: 'Due {time}',
      individualSeller: 'Individual seller',
      businessSeller: 'Business seller',
      individualBuyer: 'Individual buyer',
      businessBuyer: 'Business buyer',
    },
  },
  agentWithdrawCard: {
    header: {
      eyebrow: '[:CASH OUT:]',
      title: 'Cash out your agent',
      subtitle: 'Agent signs · settles on Arc',
    },
    agents: {
      buyer: 'Buyer agent',
      seller: 'Seller agent',
      notConfigured: 'not configured',
      balanceLabel: 'Balance',
    },
    form: {
      fromEyebrow: '[:FROM:]',
      amountEyebrow: '[:AMOUNT:]',
      availableTemplate: '{amount} available',
      amountPlaceholder: '0',
      destinationEyebrow: '[:DESTINATION:]',
      destinationPlaceholder: '0x...',
      yourWalletHint: 'Your wallet.',
      verify: {
        checking: 'Checking address on Arc',
        verifiedEoa: 'Wallet address verified',
        contractDanger: 'Contract address. Funds sent here may be locked. Double-check before withdrawing.',
      },
    },
    submit: {
      signIn: 'Sign in to cash out',
      sending: 'Sending on Arc...',
      withdrawTemplate: 'Cash out {agent}',
      agentFallback: 'agent',
    },
    success: {
      message: 'On its way.',
      referenceLabel: 'Karwan reference',
    },
    errors: {
      invalidAddress: 'Not a valid 20-byte address.',
      failedTag: 'CASH OUT FAILED',
    },
  },
  unifiedBalanceCard: {
    eyebrow: 'Unified balance',
    tagline: 'One balance. Fund either agent, or withdraw anywhere.',
    modes: { add: 'Deposit', fund: 'Fund agent', cashout: 'Withdraw' },
    fromLabel: 'From',
    toAgentLabel: 'To agent',
    toChainLabel: 'To chain',
    sourceWallet: 'Wallet',
    agents: { buyer: 'Buyer agent', seller: 'Seller agent' },
    amountLabel: 'Amount',
    destinationLabel: 'Destination address',
    invalidAddress: 'Enter a valid 0x address',
    submit: { add: 'Deposit', fund: 'Fund agent', cashout: 'Withdraw', working: 'Working…' },
    success: { added: 'Deposited to your balance.', funded: 'Agent funded.', cashedOut: 'Withdrawal started.' },
    sweepCta: 'Move all wallet USDC in',
    sweepDone: 'Swept into your balance.',
  },
  bridgeCard: {
    title: 'Deposit / Withdraw',
    cctpV2: 'POWERED BY CIRCLE',
    arcTestnet: 'Arc Testnet',
    buyerAgentNotConfigured: 'Buyer agent not configured.',
    inFlightTemplate: '{n} IN FLIGHT',
    reassurance: 'Your USDC lands on your Arc balance.',
    connect: {
      cta: 'Connect a wallet',
      hint: 'Bring USDC from any wallet. One signature moves it to your Arc balance.',
      useDeposit: 'Deposit without a wallet',
      useWallet: 'Use a wallet instead',
    },
    solana: {
      eyebrow: 'PAY WITH SOLANA',
      blurb: 'Connect your Solana wallet and sign the transfer there. Your USDC lands on Arc. No deposit address.',
      conflictTemplate: '{wallet} is handling Solana in this browser. Karwan needs Phantom for this transfer. Turn the other one off, or install Phantom.',
      needsSol: 'You need a little SOL to pay the Solana network fee. Get some free below, then try again.',
      connect: 'Connect Solana wallet',
      connecting: 'Connecting…',
      install: 'Install Phantom',
      connected: 'CONNECTED',
      disconnect: 'Disconnect',
      getUsdc: 'Get USDC',
      getGas: 'Get SOL gas',
      copied: 'Copied',
    },
    eyebrow: {
      bridge: '[:ADD MONEY / CASH OUT:]',
      topUpAgent: '[:ADD MONEY:]',
      sourceChain: '[:PAY WITH:]',
      amount: '[:AMOUNT:]',
      mintsTo: '[:SEND TO:]',
      activity: '[:ACTIVITY:]',
    },
    sourceChain: {
      sepoliaDomainTemplate: 'Sepolia · d{domain}',
      devnetAppKit: 'Devnet · d5',
      walletOnlyTag: 'Wallet only',
      walletOnlyTitle: 'Circle cannot sign on this chain. Connect a wallet to bridge from it.',
      circleOnlyTag: 'Circle only',
      solanaCircleOnlyTitle: 'Solana bridge runs through Circle App Kit. Sign in with a Circle account to use it.',
    },
    amount: {
      balanceMaxTemplate: 'Balance {amount} · MAX',
      balanceTemplate: 'Balance {amount}',
      maxTitle: 'Use full balance',
    },
    submit: {
      bridgeFromTemplate: 'Deposit from {chain}',
      switchToTemplate: 'Switch to {chain}',
      switchingToTemplate: 'Switching to {chain}…',
      starting: 'Starting…',
      solanaNeedsCircle: 'Solana needs a Circle account',
      connectWallet: 'Connect wallet to add money',
    },
    activity: {
      clearHistory: 'Clear history',
      clearHistoryTitle: 'Remove finished and failed bridges from your local history. Active bridges are kept.',
      bridgeSingular: 'TRANSFER',
      bridgePlural: 'TRANSFERS',
    },
    recipient: {
      eyebrowChoose: '[:CHOOSE RECIPIENT:]',
      selfSummary: 'Lands in your Arc wallet',
      sendElsewhere: 'Send to another wallet',
      identityLabel: 'Your wallet',
      identityHint: 'Identity',
      buyerLabel: 'Buyer agent',
      sellerLabel: 'Seller agent',
      customLabel: 'Custom',
      customPlaceholder: '0x...',
      customWarning: 'Send only to a wallet you control. Funds sent to the wrong address are gone.',
      notConfigured: 'not configured',
      verify: {
        checking: 'Checking address on Arc',
        verifiedEoa: 'Wallet address verified',
        contractDanger: 'Contract address. Sending here may lock your funds.',
        invalid: 'Not a 20-byte address',
      },
    },
    row: {
      stale: 'STALE',
      burnLabelTemplate: 'SENT · {chain}',
      mintLabel: 'ADDED · ARC',
      mintLabelOutTemplate: 'SENT · {chain}',
      routeFromTemplate: 'from {chain}',
      routeToTemplate: 'to {chain}',
      stuckNote: 'This bridge has been waiting far longer than the usual 10 to 19 minutes. The relay was likely interrupted, or the mint already landed and this card missed the event. Dismissing it only clears the card. The burn on chain and any mint are unaffected.',
      recheckOnChain: 'Recheck on chain',
      retryFromStart: 'Retry from start',
      dismiss: 'Dismiss',
      elapsed: {
        secondsTemplate: '{n}s',
        minutesTemplate: '{n}m',
        hoursTemplate: '{h}h {m}m',
      },
      phase: {
        switchingTo: 'Switching to {chain}',
        switchingChain: 'Switching chain',
        approving: 'Preparing',
        burning: 'Sending',
        relaying: 'Submitting',
        attesting: 'Confirming',
        minting: 'Finishing up',
        done: 'Added',
        error: 'Failed',
      },
      progress: {
        approve: 'Prepare',
        burn: 'Send',
        attest: 'Confirm',
        mint: 'Add',
      },
      steps: {
        approveTemplate: 'Prepare · {chain}',
        burnTemplate: 'Send · {chain}',
        circleAttestation: 'Confirming',
        attestationHint: 'USUALLY COMPLETES IN SECONDS',
        mintArc: 'Add to Arc',
        mintToTemplate: 'Add to {chain}',
      },
      error: {
        errorBadge: 'ERROR',
      },
    },
    circleFund: {
      badgeFunded: 'FUNDED',
      badgeFundToBridge: 'FUND TO ADD',
      statusChecking: 'Setting up…',
      statusEmpty: 'Send USDC here to add.',
      statusFunded: 'Ready to add.',
      statusSendUsdc: 'Send USDC here to add.',
      balanceHere: 'Balance here',
      gas: 'Gas',
      sponsored: 'Sponsored',
      covered: 'Covered',
      needed: 'Needed here',
      addressLabel: 'Your deposit address',
      provisioning: 'setting up…',
      copy: 'COPY',
      copied: 'COPIED',
      getUsdc: 'Get USDC',
      requesting: 'Requesting',
      testUsdcRequested: 'Test USDC requested. It lands here in about a minute.',
      circleFaucet: 'Circle faucet',
    },
    solanaFund: {
      addressLabel: 'Your Solana deposit address',
      provisioning: 'setting up…',
      setupFailed: 'Could not set up your Solana address. Tap to try again.',
      retry: 'Retry',
      note: 'Send USDC here. Keep a little SOL in it for the Solana network fee.',
      copy: 'COPY',
      copied: 'COPIED',
      faucet: 'Solana faucet',
    },
    web3Fund: {
      eyebrowTemplate: '[:FUND {chain} TO BRIDGE:]',
      descriptionTemplate: 'Sending from {name} costs a small fee, paid in {nativeSymbol}. Get some free from the faucet, then pull test USDC here.',
      claimGasTemplate: 'Claim {native} gas',
      getTestUsdc: 'Get test USDC',
      requesting: 'Requesting',
      testUsdcSentTemplate: 'Test USDC sent to your wallet on {name}. Lands in about a minute, then bridge.',
      copied: 'Copied',
    },
  },
  bridgeChooser: {
    poweredBy: 'POWERED BY CIRCLE',
    transferHistory: 'Transfer history',
    cctp: {
      tag: '[:ADD MONEY:]',
      title: 'Fund | Withdraw',
      protocol: 'CCTP',
      blurb: 'Fund your wallet from any chain.',
      nudge: 'Best for a one off transfer. Your money goes straight from one chain to another.',
    },
    gateway: {
      tag: '[:UNIFIED BALANCE:]',
      title: 'Unified balance across chains',
      protocol: 'GATEWAY',
      blurb: 'Pool USDC from any chain. Spend it on any chain.',
      nudge: 'Bring your USDC together from every chain into one balance, then send it anywhere. You never need another coin to pay the fee.',
    },
  },
  gatewaySteps: {
    build: 'Getting it ready',
    sign: 'Approve it in your wallet',
    attest: 'Circle is checking it',
    land: 'Money on its way',
    view: 'View',
  },
  chainErrors: {
    declined: 'You cancelled this in your wallet.',
    feeHeadroom: 'A small network fee comes out of this. Lower the amount a little.',
    needsGas: 'That chain charges a small fee in its own coin, and you have none. Get some, then try again.',
    notEnough: 'Not enough USDC for that amount. Lower it and try again.',
    walletBusy: 'Your wallet is still finishing something else. Wait a moment.',
    wrongChain: 'Your wallet is on the wrong network. Switch it, then try again.',
    network: 'Connection hiccup. Nothing moved. Try again in a moment.',
    generic: 'That did not go through. Nothing was charged. Try again.',
    pending: 'Sent. Waiting for the network to confirm it. Nothing is lost.',
    reverted: 'The network rejected this. Nothing was charged.',
  },
  gatewayTopUp: {
    cta: 'Fund from your balance',
    fundPool: 'Fund your balance',
    moving: 'Moving',
    done: 'Funded',
    failed: 'Funding failed.',
    availableTemplate: '{amount} pooled and ready.',
    shortTemplate: 'You have {have} pooled. This needs {need}.',
  },
  agentStakeBinding: {
    tag: 'AGENTS AND STAKE',
    title: 'Let your agents use your stake',
    body: 'Your agents hold no funds. Sign once so they can draw on the stake held by this wallet when a deal needs backing. Until you do, a deal that reserves stake cannot start.',
    foreignBody: 'One of your agents is already linked to a different wallet. That link cannot be moved. Contact support so it can be looked at.',
    cta: 'Sign to link',
    busyCta: 'Linking',
    doneCta: 'Linked',
    incomplete: 'The link did not finish. Try again in a moment.',
    failed: 'Could not link your agents. Try again.',
  },
  gatewayCard: {
    connectCta: 'Connect wallet',
    soonTag: 'CUSTODIAL RAIL',
    soonBody: 'Add USDC from your Karwan account. Your receipt reference appears as the movement is recorded.',
    tag: '[:GATEWAY BALANCE:]',
    title: 'One balance, any chain',
    confirmed: 'Confirmed',
    pending: 'Pending',
    empty: 'Nothing pooled yet.',
    poolFrom: 'Pool from',
    amount: 'Amount',
    maxTemplate: 'Max {amount}',
    inWallet: 'In wallet',
    cta: 'Pool USDC',
    switchTemplate: 'Switch to {chain}',
    switching: 'Switching',
    depositing: 'Pooling',
    pooled: 'Pooled. Confirming now.',
    connect: 'Connect a wallet to pool USDC.',
    failed: 'Pooling failed.',
    moveTag: '[:MOVE TO ARC:]',
    moveTo: 'Move to',
    toCustom: 'Custom address',
    moveCtaTemplate: 'Move to {chain}',
    toWallet: 'My wallet',
    toBuyer: 'Buyer agent',
    toSeller: 'Seller agent',
    moveCta: 'Move to Arc',
    moving: 'Moving',
    moved: 'Moved to Arc.',
    moveFailed: 'Move failed.',
    byChain: 'Balance by chain',
    dismiss: 'Dismiss',
    viewTx: 'View transaction',
    pulledTemplate: 'Pulled {chains}.',
    stepAdd: 'Pool',
    sendTag: '[:SEND FROM BALANCE:]',
    arcPinned: 'Lands on Arc, ready to spend.',
    outEmpty: 'Nothing to move yet. Pool USDC into this balance first.',
  },
  stakeCard: {
    eyebrow: {
      stake: 'STAKE',
    },
    signedOut: {
      body: 'Sign in to deposit USDC into KarwanVault. Stake earns reputation; the score grows your tier and softens the agent loop in your favor.',
    },
    summary: {
      usdcActive: 'USDC ACTIVE',
      syncing: 'syncing',
      syncingTitle: 'Scanning chain history. The total may still rise.',
      freeLabel: 'FREE',
      reservedLabel: 'RESERVED',
      reservedTitle: 'Locked against an active deal as buyer-side insurance. Releases on settle, slashes to the buyer on a dispute you lose.',
      coolingLabel: 'COOLING',
    },
    wrongNetwork: {
      eyebrow: 'WRONG NETWORK',
      body: 'Your wallet is on another network. Switch to Arc Testnet to stake.',
      switchButton: 'Switch to Arc',
    },
    vaultNotDeployed: {
      prefix: 'KarwanVault is not deployed on this environment. Set',
      middle: 'in',
      suffix: 'and restart the backend.',
    },
    yield: {
      eyebrow: 'LIVE YIELD',
      bodyPrefix: 'Idle stake accrues through',
      bodyMiddle: 'while it builds your reputation. You earn what it earns, credited daily.',
    },
    depositForm: {
      label: 'DEPOSIT',
      max: 'MAX',
      maxTitleTemplate: 'Wallet balance: {amount} USDC. Click to fill.',
      maxTitleLoading: 'Loading wallet balance…',
      inputAria: 'Deposit amount in USDC',
      submit: 'Deposit',
      submitBusy: 'Depositing…',
      insufficientBalanceTemplate: 'Insufficient balance. You have {amount} USDC.',
    },
    withdrawForm: {
      label: 'WITHDRAW',
      max: 'MAX',
      maxTitleFreeTemplate: 'Free stake: {amount} USDC. Click to fill. (Reserved stake stays locked until the deal settles.)',
      maxTitleAllReserved: 'All your active stake is reserved against open deals. It unlocks when those deals settle.',
      maxTitleNone: 'No active stake to withdraw',
      inputAria: 'Withdraw amount in USDC',
      submit: 'Withdraw',
      submitBusy: 'Cooling…',
      insufficientFreeTemplate: 'Insufficient free stake. You have {free} USDC free ({reserved} USDC reserved against open deals).',
      insufficientStakeTemplate: 'Insufficient stake. You have {free} USDC active.',
    },
    confirm: {
      eyebrow: 'CONFIRM WITHDRAWAL',
      coolPrefix: 'Cool',
      coolMiddle: 'for',
      daysTemplate: '{days} days',
      roundedPrefix: 'Rounded up from your',
      roundedMiddle: 'USDC request. The vault cools whole positions only, and your smallest matching position is',
      smallestSingleTemplate: '#{positionId} ({principal} USDC)',
      smallestMultiTemplate: '{count} positions',
      roundedSuffix: 'To cool less, deposit smaller amounts next time.',
      disclaimerTemplate: 'This stake stops earning reputation during the cool-down. Cancel anytime in the {days}-day window to resume earning with tenure intact.',
      cancel: 'Cancel',
      confirm: 'Confirm',
    },
    cooldownFooterTemplate: 'Withdrawal starts a {days}-day cool-down. After that the stake is claimable to your wallet.',
    cooling: {
      label: 'COOLING',
      usdcCooling: 'USDC COOLING',
      preparing: 'preparing cool-down',
      claimReady: 'claim ready',
      claimInDaysHoursTemplate: 'claim in {days}d {hours}h',
      claimInHoursMinutesTemplate: 'claim in {hours}h {minutes}m',
      cancelTitle: 'Cancel this withdrawal and put the stake back to Active. Tenure stays intact.',
      cancelLabel: '↶ cancel',
      cancelling: 'cancelling',
      claimLabel: 'Claim to wallet',
      claimBusy: 'Claiming…',
    },
    recent: {
      label: 'RECENT',
      kinds: {
        deposit: 'deposit',
        request: 'request',
        cancel: 'cancel',
        claim: 'claim',
      },
      failedFallback: 'failed',
    },
    positionAction: {
      confirmRequestTemplate: 'Start the {days}-day withdrawal cool-down on position #{positionId}? Stake stops earning reputation until you cancel or claim.',
    },
    errors: {
      insufficientBalanceTemplate: 'Insufficient balance. You have {amount} USDC.',
      insufficientFreeStakeTemplate: 'Insufficient free stake. You have {free} USDC free, {reserved} USDC reserved against open deals.',
      insufficientStakeTemplate: 'Insufficient stake. You have {free} USDC active.',
      walletNotReady: 'Wallet not ready. Reconnect and retry.',
    },
  },
  directDealDetail: {
    hero: {
      eyebrow: 'DIRECT DEAL',
      openedTemplate: 'opened {when}',
    },
    agentResearch: {
      tag: 'AGENT RESEARCH',
      buyerIntro:
        'Your agent researched this market before negotiating. It used the read to settle a fair price within your cap.',
      sellerIntro:
        'Your agent researched this market before negotiating. It used the read to price your service, never below your floor.',
    },
    errorStates: {
      privateEyebrow: 'PRIVATE DEAL',
      privateTitle: 'This deal is private',
      privateBody: 'Only its buyer and seller can see this deal. No one else sees what happens between two parties.',
      privateCta: 'Browse the market',
      notFoundEyebrow: 'DEAL NOT FOUND',
      notFoundTitle: 'We could not load this deal',
      notFoundBody: 'The link may be wrong, or your wallet may not be a party.',
      notFoundCta: 'Back to buyer desk',
      transientEyebrow: 'CANNOT REACH DEAL',
      transientTitle: 'We could not reach this deal right now',
      transientBody: 'Your deal is safe and still on chain. This is a network hiccup, not a lost deal. Give it a moment and try again.',
      transientCta: 'Try again',
      transientRetrying: 'Reaching deal',
    },
    connectGate: {
      eyebrow: 'PRIVATE DEAL',
      titleLead: 'Connect to',
      titleAccent: 'view',
      body: 'Deals are visible only to the buyer and seller. Connect the wallet that opened or accepted this deal.',
    },
    notPartyGate: {
      eyebrow: 'NOT A PARTY',
      titleLead: 'No open deals',
      titleAccent: 'here',
      body: "Switch wallets if you're meant to see this, or start a new deal.",
      ctaOpen: 'Open a deal',
      ctaHome: 'Back home',
    },
    legacyBanner: {
      eyebrow: 'PREVIOUS CONTRACT',
      title: 'This deal lives on an older escrow.',
      body: 'Finalize, refund, or cancel it from the recovery page.',
      cta: 'Open recovery',
    },
    parties: {
      cardLabel: 'Parties',
      buyer: 'Buyer',
      seller: 'Seller',
      youSuffix: 'you',
    },
    funding: {
      cardLabel: 'Funding summary',
      dealAmount: 'Deal amount',
      buyerFunds: 'Buyer funds',
      sellerReceives: 'Seller receives',
      platformFee: 'Platform fee',
      settlementCurrency: 'Settlement currency',
      feePending: 'Confirmed after seller agrees',
      totalPending: 'Not authorized yet',
      quoteLoading: 'Checking the current fee',
      noLocalConversion: 'Karwan settles this deal in USDC. Local-currency conversion is not included in this quote.',
      onDeliveryTemplate: 'On delivery · {pct}%',
      onVerificationTemplate: 'On verification · {pct}%',
      protectedEyebrow: 'PROTECTED',
    },
    fundingSafety: {
      settled: 'Settled on chain. The escrow paid out in full.',
      awaitingAcceptanceBuyer: 'Waiting for the seller to agree. No money has moved, and you will review the exact total before funding.',
      awaitingAcceptanceSeller: 'Agreeing confirms the terms. The buyer reviews the exact total and funds escrow afterward.',
      awaitingFundingBuyer: 'The seller agreed. No money has moved. Review the exact total before you fund escrow.',
      awaitingFundingSeller: 'You agreed to the terms. No buyer money has moved. Work starts after the buyer funds escrow.',
      activeBuyer: 'Your payment is locked in escrow on Arc. The seller is paid only as milestones clear, and only when you release.',
      activeSeller: "The buyer's payment is locked in escrow on Arc. It becomes yours as milestones clear. No one can pull it back on a whim.",
    },
    terms: {
      eyebrow: 'TERMS',
      title: 'The agreement',
      deadlineTemplate: 'Deadline {when}',
      noDeadline: 'No delivery deadline',
      deliveryProofLabel: 'Delivery proof',
      deliveryHeldLabel: 'Delivery proof held',
      deliveryHeldBody: 'Karwan flagged the delivery link and is holding it back until it is checked. Do not release escrow until it clears.',
      deliveryVerifyingLabel: 'Link under review',
      deliveryVerifyingBody: 'Karwan flagged your delivery link and is verifying it before the buyer can see it. They will see it once it clears.',
      deliveryReviewLabel: 'Check this meets your request',
      deliveryReviewBody: 'Your agent reviewed the delivery against your request and is not sure it fully matches. Open it and confirm before you release.',
      deliveryOkLabel: 'Reviewed, matches your request',
      deliveryOkBody: 'Your security agent checked the link and found the delivery matches your request. Funds stay in escrow until you release.',
    },
    progress: {
      eyebrow: 'PROGRESS',
      titleLead: 'Where this deal',
      titleAccent: 'stands',
    },
    progressTrack: {
      opened: 'Deal opened',
      sellerApproved: 'Seller agreed to terms',
      accepted: 'Buyer funded escrow',
      delivered: 'Seller marked delivered',
      firstReleasedTemplate: 'First {pct}% released',
      finalReleasedTemplate: 'Final {pct}% released',
    },
    actions: {
      eyebrow: 'NEXT MOVE',
      titleLead: 'What you can do',
      titleAccent: 'now',
    },
    proposeBlock: {
      orEyebrow: 'OR',
      disputeBody: 'Propose how this dispute resolves. Refund the buyer or release to the seller.',
      cancelBody: 'Need to call it off? Propose a cancellation. Your counterparty has to agree; no reputation hit if they do.',
      disputeCta: 'Propose resolution',
      cancelCta: 'Propose cancellation',
    },
    fundingTxLabel: 'FUNDING TX',
    refundTxLabel: 'REFUND TX',
    settlementRecord: {
      title: 'Settlement record',
      body: 'One reference follows each money movement from request to verified completion.',
      loadingLabel: 'Checking settlement records',
      errorBody: 'Settlement records are unavailable right now. Your deal details are unchanged.',
      retry: 'Try again',
      kinds: {
        escrow_funding: 'Escrow funding',
        milestone_payout: 'Milestone payout',
      },
      states: {
        created: 'Request recorded',
        preparing: 'Preparing payment',
        submitted: 'Payment submitted',
        verifying: 'Verifying completion',
        completed: 'Completed',
        needs_attention: 'Needs attention',
        cancelled: 'Cancelled',
      },
      nextLabel: 'Next',
      next: {
        buyer: 'Buyer action required',
        seller: 'Seller action required',
        counterparty: 'Counterparty action required',
        karwan: 'Karwan is checking the movement',
        support: 'Support review required',
        none: 'No action required',
      },
      copyReference: 'Copy settlement reference {reference}',
      showProof: 'Show proof',
      hideProof: 'Hide proof',
      legStates: {
        planned: 'Recorded',
        submitted: 'Submitted',
        confirmed: 'Receipt confirmed',
        verified: 'Effect verified',
        failed: 'Did not complete',
      },
      providerReference: 'Provider reference',
      openProof: 'Open proof',
      legacyTitle: 'EARLIER RECEIPT',
      legacyBody: 'This deal predates Karwan settlement references. Its original receipt remains available.',
      legacyFunding: 'Funding receipt',
      legacyRefund: 'Refund receipt',
    },
    chat: {
      eyebrow: 'CHAT',
      titleLead: 'Talk to your',
      titleAccent: 'counterparty',
      body: 'Per-deal thread. Mirrors to Telegram if connected.',
      counterpartySellerTemplate: 'seller {address}',
      counterpartyBuyerTemplate: 'buyer {address}',
    },
    actionPanel: {
      settled: {
        releasedFromDispute: 'Settled via dispute resolution. The buyer released the escrow to the seller.',
        autoReleased: 'Settled. The review window passed, so the final milestone released automatically. Reputation is recorded on chain.',
        normal: 'Settled. The seller has been paid in full and reputation is recorded on chain.',
        financed: 'Settled. The assigned receivable was paid to the financier and the financing record was closed on chain.',
        cashoutTemplate: 'Cash out {amount} USDC →',
        settleTimeEyebrow: 'settled on chain in',
        repeatDeal: 'Repeat this deal',
      },
      cancelled: {
        preAccept: 'Cancelled before funding. No money moved and neither side takes a reputation impact.',
        unilateral: 'Cancelled. The deadline passed without delivery, so the escrow was refunded to the buyer in full.',
        refundFromDisputePrefix: 'Closed via dispute resolution. {tail}',
        refundFromDisputePartialTailTemplate: 'The first {firstPct}% had already been released; the remaining {remainPct}% refunded to the buyer.',
        refundFromDisputeFullTail: 'The full escrow refunded to the buyer.',
        platformAttributedPrefix: 'Closed as a platform misroute by mutual agreement.',
        mutualPrefix: 'Closed by mutual agreement after an appeal.',
        mutualPartialTemplate: '{prefix} The first {firstPct}% had already been released to the seller, so the remaining {remainPct}% was refunded to the buyer. Reputation unaffected on either side.',
        mutualFullTemplate: '{prefix} No milestones had been released yet, so the full escrow was refunded to the buyer. Reputation unaffected on either side.',
        reasonEyebrow: 'REASON',
      },
      disputed: {
        intro: 'This deal is in dispute. The escrow is frozen on chain. To unfreeze it, one side proposes a resolution and the counterparty accepts.',
        refundLabel: 'Refund the buyer.',
        refundBody: 'Unreleased escrow returns to the buyer.',
        refundBodyWithReservation: 'Unreleased escrow returns to the buyer. If both sides agree the cancel, the seller keeps their reserved stake (no-fault); only an arbiter ruling against the seller slashes it to the buyer.',
        releaseLabel: 'Release to seller.',
        releaseBody: 'The seller is paid the full escrow.',
      },
      awaitingAcceptance: {
        sellerIntro: 'Review the terms. Agreeing confirms that you will deliver on them. The buyer reviews the exact total and funds escrow afterward.',
        trustedMatchPrefix: 'Trusted match. You need',
        trustedMatchMiddleTemplate: 'free in your stake to accept ({pct}% of {amount}).',
        trustedMatchSuffix: 'It releases back when the deal settles, or slashes to the buyer if you lose a dispute.',
        acceptCta: 'Agree to terms',
        acceptBusy: 'Recording agreement…',
        buyerWaiting: 'Waiting for the seller to agree. Nothing is funded yet. You can edit or cancel before they agree.',
        buyerWaitingInviteTemplate: 'Waiting for {email} to claim the invite link. Nothing is funded yet.',
        editTermsCta: 'Edit terms',
        cancelCta: 'Cancel deal',
        cancelBusy: 'Working…',
      },
      awaitingFunding: {
        buyerIntro: 'The seller agreed. Review the current fee and exact amount before you authorize escrow funding.',
        sellerIntro: 'You agreed to the terms. The buyer is reviewing the current fee and exact total. No funds are locked yet.',
        reviewCta: 'Review and fund',
        heldIntro: 'Your USDC is already held in escrow for this deal. Activation did not finish, so it is not live yet. Finishing it moves no money.',
        activateCta: 'Finish activation',
        quoteBusy: 'Checking current fee…',
        retryQuoteCta: 'Retry quote',
        editTermsCta: 'Edit terms',
        cancelCta: 'Cancel deal',
        cancelBusy: 'Working…',
      },
      awaitingDelivery: {
        sellerIntroTemplate: "Mark the work delivered when it's done. The buyer then releases the first {firstPct}%, and the rest once verified.",
        proofEyebrow: 'DELIVERY PROOF. OPTIONAL',
        proofPlaceholder: 'Link to the deliverable, a repo, a file, or a short note.',
        markDeliveredCta: 'Mark delivered',
        markDeliveredBusy: 'Confirming on Arc…',
        extensionTitlePending: 'Already requested. Waiting on the buyer.',
        extensionTitleAsk: 'Ask the buyer for more time.',
        extensionPendingCta: 'Extension pending',
        extensionRequestCta: 'Request extension',
        buyerIntro: 'Seller accepted. Waiting for delivery.',
        buyerNoDeadlineTail: 'No delivery deadline was set on this deal, so the seller can deliver whenever. Propose a mutual cancellation or open an appeal if you need to call it off.',
        buyerHasDeadlineTail: 'If they miss the deadline, you get the full escrow back automatically after a 24h grace. You can also reclaim it now.',
        buyerDeadlinePassedNote: 'Deadline passed without delivery. Reclaim the full escrow now, or leave it and the refund runs automatically after a 24h grace.',
        reclaimCta: 'Cancel & reclaim funds',
        reclaimBusy: 'Working…',
      },
      releaseBlocked: {
        buyerMismatch: 'Auto-release is paused. The delivery does not match your request. Review it, then release or appeal.',
        sellerMismatch: 'Auto-release is paused. The buyer has to review this delivery before any funds move. If they stall, appeal the deal.',
        noAgent: 'Auto-release is unavailable on this deal. Release manually, or appeal.',
      },
      awaitingFirstRelease: {
        buyerIntroTemplate: 'Seller marked delivered. Release the first {firstPct}% now. The remaining {remainPct}% releases once you verify.',
        buyerAutoReleasePrefixTemplate: 'Auto-releases the first {firstPct}% in',
        buyerAutoReleaseSuffix: "if you don't act.",
        buyerExpiredTemplate: 'Release window passed. The agent will release the first {firstPct}% shortly unless you act now.',
        releaseHeldNote: 'Auto-release is paused. Karwan flagged the delivery link and is verifying it. The release timer resumes once the link clears.',
        resubmitLabel: 'Submit a corrected link to clear the hold',
        resubmitCta: 'Submit corrected link',
        resubmitBusy: 'Re-scanning…',
        releaseCtaTemplate: 'Release first {firstPct}%',
        releaseBusy: 'Confirming on Arc…',
        appealCta: 'Appeal this deal',
        sellerWaitingTemplate: 'Delivered. Waiting for the buyer to release the first {firstPct}%.',
        sellerOpenPrefix: 'Buyer window:',
        sellerOpenSuffixTemplate: 'left. If it passes, the first {firstPct}% releases automatically.',
        sellerExpiredTemplate: 'Window passed. The agent will release the first {firstPct}% to you shortly.',
      },
      awaitingFinalRelease: {
        buyerIntroTemplate: 'First {firstPct}% released. Verify and release the next {rest}% when the work checks out.',
        buyerResponseExpiredTemplate: 'Response window passed. The agent will auto-release the next {rest}% to the seller shortly.',
        buyerNoAppealTemplate: "Take your time. The next {rest}% never releases automatically. Click below to verify and release once you've checked the work. If you stall too long the seller can raise a delay appeal.",
        releaseCtaTemplate: 'Verify & release next {rest}%',
        releaseBusy: 'Confirming on Arc…',
        appealCta: 'Appeal this deal',
        sellerWaitingTemplate: 'First {firstPct}% released. Waiting for the buyer to verify and release the next {rest}%.',
        sellerAppealOpenPrefix: 'Delay appeal raised. Buyer has',
        sellerAppealOpenSuffixTemplate: "to respond. If they don't, the next {rest}% auto-releases to you.",
        sellerResponseExpiredTemplate: 'Response window passed. The agent will release the next {rest}% to you shortly.',
        sellerBuyerResponded: 'Buyer responded to your last delay appeal:',
        sellerGracePrefix: 'Buyer is reviewing. You can raise a delay appeal in',
        sellerGraceSuffix: "if they don't release.",
        raiseAppealCta: 'Raise delay appeal',
        raiseAppealBusy: 'Submitting…',
        openDisputeCta: 'Open dispute instead',
      },
      delayAppealResponder: {
        eyebrow: 'SELLER RAISED A DELAY APPEAL',
        prefix: 'Reply with a reason in',
        suffixTemplate: 'or the next {rest}% releases automatically.',
        placeholder: 'Why are you still reviewing? Be specific.',
        submitCta: 'Respond to appeal',
        submitBusy: 'Submitting…',
      },
      pendingInvite: {
        eyebrow: 'SHARE THE INVITE',
        bodyTemplate: 'Send {email} this link. They open it, verify the email, and the deal binds to their wallet.',
        copyCta: 'Copy',
        copied: 'Copied',
      },
      acceptanceCountdown: {
        openSellerPrefix: 'You have',
        openSellerSuffix: 'to agree before the deal auto-expires.',
        openBuyerPrefix: "Seller's agreement window:",
        openBuyerSuffix: 'before the deal auto-expires (no funds moved, no reputation impact).',
        expired: 'The agreement window passed. The agent will mark this deal cancelled on the next check.',
      },
      extensionDuration: {
        dayTemplate: '{n} day',
        daysTemplate: '{n} days',
        hourTemplate: '{n} hour',
        hoursTemplate: '{n} hours',
      },
      extensionPending: {
        eyebrow: 'EXTENSION REQUEST PENDING',
        prefix: 'You asked the buyer for',
        reasonPrefix: 'Reason:',
        duration: {
          dayTemplate: '{n} day',
          daysTemplate: '{n} days',
          hourTemplate: '{n} hour',
          hoursTemplate: '{n} hours',
        },
      },
      extensionBuyerBanner: {
        eyebrow: 'SELLER ASKED FOR MORE TIME',
        requestPrefix: 'Seller is requesting',
        requestSuffix: 'to deliver.',
        reasonPrefix: 'Reason:',
        newDeadlinePrefix: 'New deadline if approved:',
        approveCta: 'Approve',
        approveBusy: 'Working…',
        declineCta: 'Decline',
        duration: {
          dayTemplate: '{n} day',
          daysTemplate: '{n} days',
          hourTemplate: '{n} hour',
          hoursTemplate: '{n} hours',
        },
      },
    },
    acceptConsentModal: {
      eyebrow: 'CIRCLE WALLETS',
      title: 'An agent wallet will be created',
      body: 'Agreeing may prepare a Circle agent wallet for your payouts. It does not move buyer money. The buyer reviews and funds escrow separately.',
      confirmCta: 'Set up and agree',
      confirmBusy: 'Setting up your wallet…',
      cancelCta: 'Not now',
    },
    fundingConsentModal: {
      eyebrow: 'FINAL REVIEW',
      title: 'Fund this deal',
      body: 'Review the exact amount below. Confirming authorizes only this total. If the fee changes first, Karwan stops and asks you to review again.',
      dealAmount: 'Deal amount',
      buyerFee: 'Your fee',
      total: 'Total to fund',
      sellerReceives: 'Seller receives',
      settlement: 'Settlement currency',
      noConversion: 'Karwan settles in USDC. Local-currency conversion is not included.',
      confirmCta: 'Confirm and fund',
      confirmBusy: 'Funding escrow…',
      cancelCta: 'Go back',
    },
    cancelProposalBanner: {
      kindReleaseToSeller: 'RELEASE TO SELLER',
      kindRefundBuyer: 'REFUND THE BUYER',
      kindPlatformMisroute: 'PLATFORM MISROUTE',
      kindMutualCancel: 'MUTUAL CANCEL',
      proposedTemplate: '{kind} PROPOSED',
      proposerBuyer: 'BUYER',
      proposerSeller: 'SELLER',
      byTemplate: 'BY {by}',
      reasonEyebrow: 'REASON',
      outcomeReleaseFromDispute: 'Accepting releases the full escrow to the seller.',
      outcomeRefundFromDisputePartialTemplate: 'Accepting refunds the remaining {remainPct}% to the buyer.',
      outcomeRefundFromDisputeFull: 'Accepting refunds the full escrow to the buyer.',
      outcomePlatformPrefix: 'Both sides agree the agent misrouted.',
      outcomeMutualPrefix: 'No reputation hit on either side if accepted.',
      outcomePartialTemplate: 'The first {firstPct}% has already been released to the seller; accepting refunds the remaining {remainPct}% to the buyer.',
      outcomeFull: 'Accepting refunds the full escrow to the buyer.',
      legacyCta: 'Accept on recovery',
      legacyNote: 'this deal is on an older contract',
      acceptReleaseCta: 'Agree & release',
      acceptRefundCta: 'Accept & refund',
      confirmingBusy: 'Confirming…',
      declineDisputeCta: 'Decline · stay in dispute',
      declineCancelCta: 'Decline · keep the deal',
      waitingNote: 'Waiting on counterparty to accept or decline.',
    },
    proposeCancelModal: {
      eyebrowResolution: 'PROPOSE RESOLUTION',
      eyebrowCancellation: 'PROPOSE CANCELLATION',
      titleDispute: 'Resolve the dispute',
      titleCancel: 'Call it off',
      disputeBody: 'Your counterparty has to accept. If they decline, the deal stays in dispute.',
      cancelBodyTemplate: 'Your counterparty has to agree. If they accept, {outcome}, with no reputation hit on either side. If they decline, the deal continues normally.',
      cancelOutcomePartialTemplate: 'the first {firstPct}% already paid stays with the seller and the remaining {remainPct}% refunds to the buyer',
      cancelOutcomeFull: 'the full escrow refunds to the buyer',
      kindEyebrowResolution: 'RESOLUTION',
      kindEyebrowKind: 'KIND',
      kindRefundBuyerLabel: 'Refund the buyer',
      kindRefundBuyerBody: 'Unreleased escrow returns to the buyer.',
      kindRefundBuyerBodyWithReservation: 'Unreleased escrow returns to the buyer. If both sides agree, the seller keeps their reserved stake (no-fault); only an arbiter ruling against the seller slashes it to the buyer.',
      kindReleaseSellerLabel: 'Release to seller',
      kindReleaseSellerBody: 'Seller is paid the full escrow.',
      kindMutualLabel: 'Mutual',
      kindMutualBody: "We've both decided to walk.",
      kindPlatformLabel: 'Platform misroute',
      kindPlatformBody: 'The agent matched us wrong.',
      reasonEyebrow: 'REASON',
      reasonPlaceholder: 'Plain language. The other side reads this in their banner.',
      submitCta: 'Send proposal',
      submitBusy: 'Proposing…',
      cancelCta: 'Not now',
    },
    errors: {
      insufficientBalanceTitle: 'Your account needs more USDC to fund this deal.',
      insufficientBalanceBuyerPrefix: 'Add funds to your buyer account, then try again.',
      insufficientBalanceBuyerLink: 'Fund agent',
      insufficientBalanceSeller: 'The buyer needs to add funds before escrow can start.',
      insufficientGas: 'Karwan could not cover the transaction cost. Try again shortly or contact support.',
      insufficientStakeTitle: 'The seller needs more available stake before this trusted deal can be funded.',
      insufficientStakeLink: 'Stake more',
      insufficientStakeSuffix: 'then return here and try again.',
      acceptEscrowFailedTitle: 'Escrow activation did not finish. The deal is not active. Retry is safe because existing funding is checked first.',
      approvalFailed: 'Karwan could not record the seller agreement. Try again.',
      fundingFailed: 'Karwan could not confirm escrow activation. The deal was not marked active. Retry is safe because Karwan checks the existing escrow before any new transfer.',
      quoteChanged: 'The fee changed before confirmation. Review the refreshed total before trying again.',
    },
  },
  walletsPanel: {
    eyebrow: '[:YOUR WALLETS:]',
    headline: 'One account. Several wallets',
    intro: {
      circle: 'Your account wallet is your starting point on Karwan. Agent and bridge wallets are provisioned for specific jobs, while balances can remain on the supported networks you use. Each wallet has one clear purpose.',
      web3: 'Your connected account wallet is your starting point on Karwan. Agent and bridge wallets are provisioned for specific jobs, while balances can remain on the supported networks you use. Each wallet has one clear purpose.',
    },
    rows: {
      identity: {
        tag: 'ACCOUNT WALLET',
        title: 'Account wallet',
        purposeCircle: 'Your account wallet. This is where your Karwan balance starts.',
        purposeWeb3: 'Your connected account wallet. This is your account on Karwan and the starting point for funding.',
      },
      buyer: {
        tag: 'AGENT WALLET',
        title: 'Buyer agent',
        purpose: 'Runs buyer-side deal actions and escrow funding. Manage it in the Agents tab.',
      },
      seller: {
        tag: 'AGENT WALLET',
        title: 'Seller agent',
        purpose: 'Runs seller-side deal actions and receives seller payouts. Manage it in the Agents tab.',
      },
      bridge: {
        tag: 'BRIDGE WALLET',
        title: 'Bridge wallet',
        purpose: 'Your address on Base or Ethereum for bringing USDC onto Arc. Send USDC here and Karwan bridges it to your Arc balance. It lives on that chain, so it holds a little ETH for gas there, not Arc USDC.',
        gasSecondaryTemplate: '{amount} ETH gas',
      },
    },
    agentsNotCreated: '[:AGENT WALLETS NOT READY:] Activate to create your buyer and seller agents.',
    faucetButton: {
      idle: 'Get USDC',
      busy: 'Opening',
    },
    copyAddress: {
      idle: 'Copy',
      copied: 'Copied',
    },
    bridgeActions: {
      topUpBase: 'Top up Base gas',
      requesting: 'Requesting',
      ethereumGas: 'Ethereum gas',
    },
    chains: {
      baseSepolia: 'Base Sepolia',
      ethereumSepolia: 'Ethereum Sepolia',
    },
    notes: {
      faucetCopied: "Address copied. On Circle's faucet, choose Arc Testnet and paste it to get USDC.",
      faucetFallbackTemplate: "On Circle's faucet, choose Arc Testnet and paste {addr} to get USDC.",
      gasRequestedTemplate: '{chain} gas and USDC requested. It lands in about a minute, then retry the bridge.',
    },
  },
  connectX: {
    connectCta: 'Connect X',
    disabledTitle: 'Connect your wallet first',
    redirecting: 'Redirecting',
    working: 'Working',
    unlink: 'Unlink',
    handleLabel: 'X handle',
    handlePlaceholder: 'karwan',
    save: 'Save',
    saving: 'Saving',
    cancel: 'Cancel',
    handleNote: 'Handle only. Karwan tags it on public milestones. We never post on your behalf without one of those triggers.',
    errors: {
      bindFailed: 'Could not bind your X account.',
      accountTaken: 'That X account is already connected to another Karwan account.',
      handleTakenTemplate: '@{handle} is already connected to another Karwan account.',
      invalidHandle: 'Use letters, numbers, or underscores. Up to 15 characters.',
    },
  },
  telegramConnect: {
    chatLabelTemplate: 'chat {chatId}',
    button: {
      brand: 'Telegram',
      offBadge: 'Off',
      linkedBadge: 'Linked',
      connectLabel: 'Connect Telegram',
      connectTitle: 'Connect Telegram for alerts',
      manageTitleTemplate: 'Manage Telegram link ({label})',
      disabledTitle: 'Telegram alerts are not configured on this server',
    },
    modal: {
      eyebrow: '[:TELEGRAM ALERTS:]',
      title: 'Push to your chat',
      subheading: 'Deals · chat · bridge state',
      closeAria: 'Close',
      startBody: 'One tap to open the bot, one more to confirm. Deal updates and chat messages reach you outside the app.',
      generateCta: 'Generate link',
      waitingBodyBefore: 'Open the bot in Telegram and tap ',
      startWord: 'Start',
      waitingBodyAfter: '. Karwan confirms the link automatically.',
      openTelegramCta: 'Open Telegram',
      waitingNoteTitle: 'Waiting for /start',
      waitingNoteBody: "Link expires in 10 minutes. Generate a fresh one if you don't use it.",
    },
    linkedCard: {
      label: 'Telegram',
      linkedAtTemplate: 'linked {date}',
      unlinkCta: 'Unlink',
    },
  },
  reputationBadge: {
    popoverAriaLabel: 'Reputation details',
    eyebrow: 'Reputation',
    dealCountOneTemplate: '{count} deal',
    dealCountManyTemplate: '{count} deals',
    scoreMaxTemplate: '/ {max}',
    unratedLabel: 'unrated',
    compositeFootnote: 'Composite of deal history, stake, and tenure. Recorded on-chain.',
    creditPassportLink: 'Credit passport ↗',
    stats: {
      success: 'Success',
      disputed: 'Disputed',
      failed: 'Failed',
    },
    legacyTiers: {
      unrated: 'Unrated',
      topTier: 'Top tier',
      veteran: 'Veteran',
      trusted: 'Trusted',
      cautious: 'Cautious',
      watchlist: 'Watchlist',
    },
  },
  arcFundCard: {
    agentBuyerLabel: 'Buyer agent',
    agentSellerLabel: 'Seller agent',
    header: {
      eyebrow: 'ADD MONEY',
      title: 'Top up your agent',
      subtitleCircle: 'Straight to your balance',
      subtitleWeb3: 'Single tx · settles in ~3s',
      inFlightTemplate: '{count} IN FLIGHT',
      refreshTitle: 'Refresh balances',
      refresh: 'Refresh',
      refreshing: 'Refreshing',
    },
    recipient: {
      eyebrow: 'RECIPIENT',
      notConfigured: 'not configured',
      balance: 'Balance',
    },
    amount: {
      eyebrow: 'AMOUNT',
      availableTemplate: '{amount} USDC available',
    },
    submit: {
      signInToFund: 'Sign in to add money',
      switchingToArc: 'Switching to Arc...',
      transferInProgress: 'Transfer in progress...',
      switchToArc: 'Switch to Arc',
      sendToTemplate: 'Add to {label}',
      agentFallback: 'agent',
      activeNote: 'One transfer at a time. Native transfers settle in nonce order.',
    },
    activity: {
      eyebrow: 'ACTIVITY',
      transferOne: 'TRANSFER',
      transferMany: 'TRANSFERS',
    },
    phase: {
      switching: 'Switching to Arc',
      signing: 'Sign in wallet',
      confirming: 'Confirming on Arc',
      unconfirmed: 'Submitted, awaiting confirmation',
      settling: 'Sent. Confirming with Karwan',
      sending: 'Transferring on Arc',
      done: 'Sent',
      error: 'Failed',
    },
    elapsed: {
      secondsTemplate: '{s}s',
      minutesTemplate: '{m}m',
      hoursMinutesTemplate: '{h}h {m}m',
    },
    row: {
      agentKeyBuyer: 'buyer',
      agentKeySeller: 'seller',
      slow: 'SLOW',
      viewOnArcscan: 'View on Arcscan',
      errorLabel: 'ERROR',
      reference: 'Karwan reference',
      recipient: 'Recipient',
      txArc: 'Tx · Arc',
      stuckNote: 'This transfer has not confirmed in a while. Likely a dropped tx. Retry to send a fresh one, or dismiss it.',
      retry: 'Retry',
      dismiss: 'Dismiss',
    },
  },
  landingPage: {
    tabs: { overview: 'OVERVIEW', howItWorks: 'WORKFLOW SUMMARY', flow: 'FLOW', getStarted: 'GET STARTED' },
    scrollCue: 'Scroll',
    hero: {
      tag: 'CROSS-BORDER DEALS',
      titleLine1: 'Agree.',
      titleLine2: 'Deliver.',
      titleAccent: 'Get paid.',
      body: 'Cross-border deals with protected milestone payments, buyer review, and a receipt both sides can verify.',
      ctaPrimary: 'Open Karwan',
      ctaSecondary: 'How it works',
      footnote: 'Built for global work',
    },
    ecosystem: { tag: 'BUILT ON' },
    directDeals: {
      tag: 'DIRECT DEALS',
      title: 'Bring your own counterparty.',
      body: "You already agreed elsewhere. Invite the seller, set the amount, and review the delivery stages. No auction.",
      tile1Title: "Invite the seller",
      tile1Body: "Send an invitation. The seller signs in, reviews the terms, and accepts before the deal begins.",
      tile2Title: 'Release in tranches',
      tile2Body: 'A slice releases on delivery, the rest once you verify. A review window auto-releases if you go quiet.',
    },
    managedDeals: {
      tag: 'MANAGED DEALS',
      title: 'No counterparty yet? Agents bid for you.',
      body: 'Describe what you need. Your agent compares offers inside the limits you set and brings the best match to you for approval.',
      tile1Title: "Agents negotiate",
      tile1Body: "Buyer and seller agents compare and revise offers inside the limits you set.",
      tile2Title: 'Your approval comes first',
      tile2Body: 'Nothing becomes active until you review and approve the final terms.',
    },
    howItWorks: {
      tag: 'HOW IT WORKS',
      titleStart: 'Three steps.',
      titleAccent: 'One',
      titleEnd: 'deal.',
      rail1Title: 'Agree on terms',
      rail1Body: 'Confirm the amount, deadline, delivery stages, and what counts as complete.',
      rail2Title: 'Review delivery',
      rail2Body: 'Payment stages become ready as work is delivered. Concerns go to human review.',
      rail3Title: 'Keep the receipt',
      rail3Body: 'Both sides receive a clear record of the agreement, delivery, and payment.',
    },
    flow: {
      tag: 'FLOW',
      title: 'A deal, end to end.',
      liveLabel: 'VISIBLE DEAL PROGRESS',
      steps: {
        posted: { tag: 'SHARED', label: 'Request shared' },
        bids: { tag: 'OFFERS', label: 'Offers compared' },
        accept: { tag: 'APPROVE', label: 'Buyer approves match' },
        escrow: { tag: 'PROTECT', label: 'Payment protected' },
        deliver: { tag: 'DELIVER', label: 'Seller submits work' },
        settle: { tag: 'PAID', label: 'Seller paid' },
      },
      kpis: {
        dealsLabel: 'DEALS ON THE RAIL',
        settledLabel: 'SETTLED',
        volumeLabel: 'SETTLED VOLUME',
      },
    },
    tradeLanes: {
      tag: 'TARGET NETWORK',
      titleStart: 'Where Karwan is built to move',
      titleAccent: 'volume',
      titleEnd: '.',
      footnote: 'Modeled future throughput across representative corridors. Targets, not current platform totals.',
      laneIdPrefix: 'LANE',
      toAria: 'to',
      avgPrefix: 'AVG',
      minutesUnit: 'MIN',
      cities: {
        lagos: 'LAGOS',
        dubai: 'DUBAI',
        nairobi: 'NAIROBI',
        london: 'LONDON',
        karachi: 'KARACHI',
        singapore: 'SINGAPORE',
        cairo: 'CAIRO',
        frankfurt: 'FRANKFURT',
        accra: 'ACCRA',
        newYork: 'NEW YORK',
        darEsSalaam: 'DAR ES SALAAM',
        mumbai: 'MUMBAI',
      },
    },
    earlyTrades: {
      tag: 'TARGET DEAL FLOWS',
      title: 'The scale Karwan is built to handle.',
      footnote: 'Modeled future scenarios showing the volume and automation Karwan is designed to support. Not current customer results.',
      cards: {
        buyerLagos: { role: 'BUYER', city: 'LAGOS', title: 'A Lagos buyer settles a Dubai logistics invoice in minutes', unit: 'USDC', sub: 'target volume · 3 milestones' },
        sellerNairobi: { role: 'SELLER', city: 'NAIROBI', title: 'A Nairobi seller agent bids 14 requests overnight and wins 3', unit: 'WON', sub: 'target automation' },
        buyerKarachi: { role: 'BUYER', city: 'KARACHI', title: 'A Karachi buyer resolves a disputed delivery without a chargeback', unit: 'CHARGEBACKS', sub: 'target outcome' },
      },
    },
    getStarted: {
      tag: 'GET STARTED',
      title: 'Three steps to a deal.',
      step1Title: 'Sign in',
      step1Body: 'Use email, passkey, or a compatible wallet. Karwan keeps one account across every deal.',
      step2Title: 'Set your ranges',
      step2Body: 'Buyer side, set budget, deadlines, milestone splits. Seller side, set skills, range, response time. Your agents read these on every match.',
      step3Title: 'Build your track record',
      step3Body: 'Complete deals reliably. Karwan shows the record that helps future counterparties trust your work.',
    },
    finalCta: {
      tag: 'OPEN A DEAL',
      srLabel: 'Get started',
      title: 'Open your first deal in about a minute.',
      body: 'Direct or agent-run, your call. Settlement in minutes, not weeks.',
      ctaPrimary: 'Open Karwan',
      ctaSecondary: 'Read how it works',
    },
  },
  legacyPage: {
    gate: {
      tag: 'LEGACY · RECOVERY',
      titleBefore: 'Reclaim from',
      titleAccent: 'previous',
      titleAfter: 'contracts',
      body: 'We redeployed our escrow and vault contracts. Funds and stake parked on the previous contracts stay yours. Sign in to see what you can reclaim.',
      button: 'Sign in to continue',
    },
    closed: {
      tag: 'RECOVERY WINDOW',
      title: 'Closed',
      body: "The 30-day recovery window has ended. The legacy contracts remain live on Arc and can still be called directly via the block explorer if you have funds locked. Reach out on Telegram if you need help and didn't get a chance to reclaim.",
      home: '← Home',
    },
    hero: {
      tag: 'LEGACY · RECOVERY OPEN',
      titleBefore: 'Reclaim from',
      titleAccent: 'previous',
      titleAfter: 'contracts',
      body: 'We moved our escrow and vault to new contracts. Anything you staked or any deal you funded on the previous contracts still belongs to you. This page lets you pull it out before the recovery window closes.',
      windowClosesIn: 'window closes in',
      afterWindowNote: '// AFTER THE WINDOW, THE LEGACY CONTRACTS STAY LIVE ON ARC AND CAN BE CALLED DIRECTLY VIA THE EXPLORER',
    },
    stake: {
      tag: 'LEGACY STAKE',
      title: 'Your stake',
      bodyBefore: 'Positions parked on the previous KarwanVault. Cool-down on this contract is 7 days. New deposits go to the current vault. Visit',
      stakeLink: '/stake',
      bodyAfter: 'for that.',
      empty: { headline: 'Nothing to recover.', body: 'No positions on the previous vault for this wallet.' },
      stats: { active: 'Active', cooling: 'Cooling' },
      wrongChain: 'Your wallet is on another network. Switch to Arc to sign legacy actions.',
      groups: {
        activeTitleTemplate: 'Gen {gen} active. Start cool-down to recover',
        startCooldownTemplate: 'Start {days}-day cool-down',
        signing: 'Signing…',
      },
      coolingTitle: 'Cooling. Claim once the countdown ends',
      claimReady: 'claim ready',
      claimInTemplate: 'claim in {days}d {hours}h',
      cancelLink: 'cancel',
      claimingLabel: 'Claiming…',
      claimToWallet: 'Claim to wallet',
      txPrefix: 'tx',
      confirmDialog: {
        titleTemplate: 'Cool {principal} USDC?',
        bodyTemplate: 'Starts the {days}-day cool-down on this legacy position. Once it elapses you can claim the principal back to your wallet. Cooling stake stops earning reputation until you cancel or claim.',
        confirm: 'Start cool-down',
      },
      errors: {
        walletNotReady: 'Wallet not ready. Reconnect and retry.',
        vaultNotConfiguredTemplate: 'Legacy vault for generation {generation} is not configured on this build.',
      },
    },
    deals: {
      tag: 'LEGACY DEALS',
      title: 'Pending escrow',
      body: 'Deals where USDC is still locked on the previous escrow. Buyer can refund (after the deadline) or release if the seller delivered. Either party can propose a mutual cancellation.',
      empty: { headline: 'No legacy deals.', body: 'You have no escrow records on the previous contract.' },
      noneOpen: 'No open legacy deals. Everything past settled or refunded.',
      openSectionTitle: 'Open. Actions available',
      pastSectionTitle: 'Past. Already settled or refunded',
      txPrefix: 'tx',
      roles: { buyer: 'buyer', seller: 'seller', both: 'both' },
      stateLabels: { funded: 'funded', settled: 'settled', disputed: 'disputed', refunded: 'refunded', unknown: 'unknown' },
      row: {
        live: 'live',
        pastDeadline: 'past deadline',
        delivered: 'delivered',
        notDelivered: 'not delivered',
        cancelProposedByTemplate: 'cancel proposed by {role}:',
        noAction: 'No action available for your role on this deal state.',
        genTemplate: 'GEN {n}',
      },
      actions: {
        refundToBuyer: 'Refund to buyer',
        refunding: 'Refunding…',
        releaseToSeller: 'Release to seller',
        releasing: 'Releasing…',
        acceptCancellation: 'Accept cancellation',
        accepting: 'Accepting…',
        proposeCancellation: 'Propose cancellation',
        proposing: 'Proposing…',
      },
      dialogs: {
        refund: {
          titleTemplate: 'Refund {amount} USDC to your wallet?',
          bodyTemplate: 'Cancels the deal on the legacy escrow and returns the full {amount} USDC to your wallet. Reputation is unchanged on this recovery path.',
          confirm: 'Refund to buyer',
        },
        release: {
          titleTemplate: 'Release {amount} USDC to the seller?',
          bodyTemplate: 'Settles the legacy escrow and pays the seller their {amount} USDC net of platform fees. Use this when the seller already delivered before the contract migration.',
          confirm: 'Release to seller',
        },
        cancelPropose: {
          title: 'Propose a mutual cancellation?',
          body: 'Sends a cancellation proposal to the other party. They have to accept before the deal cancels. Funds stay locked until they accept or you withdraw the proposal.',
          confirm: 'Send proposal',
        },
        cancelAccept: {
          title: 'Accept the proposed cancellation?',
          bodyTemplate: 'The other party proposed cancelling this deal. Accepting refunds you the full {amount} USDC and closes the legacy escrow.',
          confirm: 'Accept cancellation',
        },
        confirmFallback: 'Confirm',
      },
      reasonPrompt: { label: 'Reason (shared with the other party)', placeholder: 'No longer needed' },
      errors: { reasonRequired: 'Reason is required to propose a cancellation.' },
    },
  },
  cashoutPage: {
    signInGate: {
      tag: 'CASHOUT',
      titleBefore: 'Move your',
      body: 'Sign in to the account this deal settled on to withdraw.',
      buttonLabel: 'Sign in',
    },
    hero: {
      tag: 'CASHOUT',
      titleBefore: 'Move your',
      earnedTemplate: 'You earned {amount} on this deal. Send it to any wallet on Arc, or bridge to another chain.',
      loading: 'Loading your earnings…',
      backToDeal: 'back to deal',
    },
    loading: { label: 'Loading…' },
    errors: {
      couldNotLoad: 'could not load',
      couldNotLoadDeal: 'Could not load this deal.',
      solanaRoadmap: 'Solana withdraw is on the roadmap. Use Ethereum Sepolia or another EVM chain for now.',
      withdrawFailed: 'Withdraw failed',
    },
    comingSoon: {
      tag: 'COMING SOON',
      titleBefore: 'Cash out to',
      titleAccent: 'local currency',
      body: 'Direct off-ramp to NGN, KES, INR, AED and more.',
      tileLabel: 'Off-ramp',
      comingSoon: 'Coming soon',
    },
    notReady: {
      tag: 'NOT READY',
      titleBefore: "Deal isn’t",
      titleAccent: 'settled',
      titleAfter: 'yet',
      body: 'Come back once the buyer releases the final milestone.',
      cta: 'Open the deal',
    },
    legacy: {
      tag: 'LEGACY ESCROW',
      body: 'This deal settled on a legacy escrow contract. Cash out from the legacy surface.',
      cta: 'Open legacy surface',
    },
    walletAccount: {
      tag: 'WALLET ACCOUNT',
      titleBefore: 'Your USDC',
      titleAccent: 'already landed',
      body: 'The escrow released straight to your connected wallet on Arc. Use your wallet to bridge or send it elsewhere.',
      roadmap: 'In-product wallet withdraw is on the roadmap.',
      bridgeFromWallet: 'Bridge from wallet',
      sendOnArc: 'Send on Arc',
    },
    withdraw: {
      tag: 'WITHDRAW',
      titleBefore: 'Send your',
      body: 'Pick the source wallet, the destination chain, paste the address, set the amount.',
      fromWalletLabel: 'From wallet',
      fromWalletTooltip: 'Released escrow USDC lands on the deal wallet (your per-deal seller agent). Identity wallet is your main address. Switch to whichever currently holds the USDC you want to send.',
      whatIsThis: 'what is this?',
      dealWalletLabel: 'Deal wallet',
      dealWalletSub: 'Where the escrow released',
      buyerWalletLabel: 'Buyer wallet',
      buyerWalletSub: 'Your buyer agent',
      identityWalletLabel: 'Identity wallet',
      identityWalletSub: 'Your main address',
      identityWalletSubWeb3: 'Your connected wallet',
      web3IdentitySigns: 'You sign this withdraw in your own wallet.',
      web3IdentityConnect: 'Connect your wallet to withdraw from it.',
      connectWallet: 'Connect wallet',
      active: 'ACTIVE',
      notProvisioned: 'Not provisioned',
      sourceBalance: 'Source balance',
      fromDeal: 'From deal',
      destinationChain: 'Destination chain',
      recipientAddress: 'Recipient address',
      base58Placeholder: 'Base58 address',
      invalidAddress: "That doesn’t look like a valid {kind} address.",
      amountLabel: 'Amount (USDC)',
      max: 'Max',
      overBalance: 'Over the source wallet balance of {balance} USDC.',
      sendingOnArc: 'Sending on Arc…',
      bridgingOut: 'Bridging out…',
      sendTo: 'Send to {chain}',
      bridgeTo: 'Bridge to {chain}',
    },
    sent: {
      tag: 'SENT',
      titleAccent: 'on its way',
      body: 'Transfer confirmed on Arc.',
      viewTx: 'View tx {hash}',
      sendMore: 'Send more',
    },
    bridgeStage: {
      burning: 'Burning on Arc',
      burned: 'Waiting on Circle attestation',
      attested: 'Attested. Minting on destination',
      minted: 'Minted on destination',
      errored: 'Bridge errored',
    },
    bridgeProgress: {
      tagBridged: 'BRIDGED',
      tagFailed: 'BRIDGE FAILED',
      tagBridging: 'BRIDGING',
      accentArrived: 'arrived',
      accentErrored: 'errored',
      accentBridging: 'bridging',
      bodyDone: 'Mint confirmed on {chain}. The USDC is in the recipient address.',
      bodyFailed: 'Something went wrong on the way. The funds are still on the source side. Take a screenshot of this page and ping support.',
      bodyInProgress: "Burn on Arc submitted. Mint will land on {chain} once Circle’s attestation clears, usually under a minute on testnet.",
      burnLabel: 'Burn (Arc)',
      mintLabel: 'Mint ({chain})',
      pending: 'pending',
      retrying: 'Retrying status check…',
      couldNotCheck: 'Could not check status.',
      sendMore: 'Send more',
      tryAgain: 'Try again',
    },
  },
  supplyPage: {
    signInGate: { tag: 'SUPPLY', body: 'Sign in to publish what your company supplies.' },
    tag: 'SUPPLY',
    notBusiness: { headline: 'This is the company desk', cta: 'Your seller desk' },
    hero: {
      headlinePrefix: 'Publish what you ',
      headlineAccent: 'supply',
      lede: 'Buyers find you, or your agent finds them.',
      ctaPost: 'Post an offer',
      ctaPartners: 'Find partners →',
    },
    matchesHeadline: 'Matches waiting on you',
  },
  sellerHub: {
    signInGate: { tag: 'SELLER DESK', body: 'Offers and bids are keyed to your wallet. Sign in to set up the seller agent.' },
    hero: {
      tag: 'SELLER DESK',
      headlineLine1: 'Bids land',
      headlineLine2Prefix: 'while you',
      headlineAccent: 'sleep',
      lede: 'Listens for requests. Bids inside the ranges you set. Wake up to matched deals.',
      ctaPostOffer: 'Post an offer ↓',
    },
    vignette: {
      agentControl: 'Agent control',
      sellerAgent: 'Seller agent',
      statusActive: 'active',
      statusIdle: 'idle',
      activeBlurb: 'Watching requests. Scoring against skills. Bidding on match.',
      idleBlurb: 'Activate on profile to start bidding.',
      inAuction: 'In auction',
      counters: 'Counters',
      withinRange: 'within range',
    },
    pendingMatchesHeadline: 'Your bid matched',
    howItWorks: {
      tag: 'HOW IT WORKS',
      headlineLine1: 'Three loops',
      headlineLine2Accent: 'One agent.',
      lede: 'Every activated wallet runs a seller agent. Set skills and ranges on profile, post offers here to broadcast supply.',
    },
    steps: {
      s1: { title: 'Watches the chain', body: 'Listens for new requests on Arc as they post.' },
      s2: { title: 'Scores the request', body: 'Matches each request against your skills and ranges. Bids or skips.' },
      s3: { title: 'Bids, negotiates', body: 'Submits on chain. Replies to counters inside your range.' },
    },
    postOffer: {
      tag: 'POST WHAT YOU OFFER',
      headlineLine1: 'Standing offer',
      headlineLine2: 'Set the floor.',
      lede: 'Publish an offer at your asking price. Matches land in your inbox.',
    },
    activeBids: {
      tag: 'ACTIVE BIDS',
      headline: 'In the auction',
      lede: 'Bids placed on open requests. Counters reply automatically inside your range.',
      connectPrompt: 'Connect your wallet to see your active bids.',
      errorMessage: "Couldn't load your bids.",
      emptyMessage: 'No active bids. Post an offer to start scanning requests.',
    },
  },
  invitePage: {
    eyebrow: 'INVITE',
    loading: { headline: 'Loading' },
    unavailable: { headline: 'Not available', fallback: 'This invite is no longer valid.' },
    hero: {
      headlineBefore: 'A deal is ',
      headlineAccent: 'waiting',
      headlineAfter: ' for you',
      intro: "{inviter} opened a Karwan deal and shared the link with {email}. Verify the email is yours and the escrow is bound to your wallet. No app to install. No signup if you don't want one later.",
    },
    deal: {
      eyebrow: 'DEAL',
      termsLabel: '[:TERMS:]',
      onDelivery: 'On delivery',
      onVerification: 'On verification',
      deadline: 'Deadline',
      openEnded: 'Open-ended',
      claimBy: 'Claim by',
    },
    sendCode: {
      intro: 'We send a 6-digit code to {email}. Enter it on the next step and the escrow is bound to a Karwan wallet on Arc, all yours.',
      cta: 'Send code to my email',
      busy: 'Sending…',
    },
    verifyCode: {
      intro: "Enter the 6-digit code we just emailed to {email}. If you don't see it, check your spam folder.",
      cta: 'Verify and claim',
      busy: 'Verifying…',
      resend: 'Resend',
    },
    claiming: { status: 'Binding the escrow to your wallet…' },
    errors: { codeSixDigits: 'Code must be 6 digits.' },
  },
  buyerHub: {
    signInGate: { tag: 'BUYER DESK', body: 'Requests and direct deals are keyed to your wallet. Sign in to continue.' },
    hero: {
      sectionTag: 'BUYER DESK',
      headlineLine1: 'Run the auction',
      headlineLine2Prefix: 'Or name your',
      headlineLine2Accent: 'counterparty',
      description: 'Run an auction from a brief, or open a direct deal with a known counterparty.',
      openDealCta: 'Open a deal ↓',
    },
    newDeal: { sectionTag: 'NEW DEAL', headline: 'Open a deal', description: 'One transaction to escrow.' },
    managedDeals: {
      sectionTag: 'MANAGED DEALS',
      headline: 'Running auctions',
      description: 'Live auctions. Bids scored, one counter per round, escrow funded on accept.',
      statesConnect: 'Connect your wallet to see managed deals.',
      statesError: "Couldn’t load your managed deals.",
      statesEmpty: 'No managed deals yet. Post a request to start one.',
    },
    agentVignette: {
      eyebrow: 'Agent control',
      titlePrefix: 'Buyer agent',
      statusActive: 'active',
      statusIdle: 'idle',
      bodyActive: 'Scoring bids. One counter per round. Funding on accept.',
      bodyIdle: 'Activate on profile to start running auctions.',
      runningLabel: 'Running',
      roundCapLabel: 'Round cap',
      counterLabel: 'counter',
    },
  },
  stakePage: {
    signedOut: {
      tag: 'STAKE',
      titlePrefix: 'Earn',
      titleAccent: 'reputation',
      body: 'Deposit USDC into KarwanVault to support your reputation position. The product shows any enabled yield route separately from your stake.',
      buttonLabel: 'Log in to stake',
    },
    hero: {
      tag: 'STAKE',
      line1Prefix: 'Earn',
      line1Accent: 'reputation',
      line2Prefix: 'Earn',
      line2Accent: 'yield',
      body: 'Stake USDC to support your reputation position. Request a withdrawal when you need it. The live vault shows the cooldown and claim time.',
      mainnetNote: '// YIELD DEPENDS ON THE ENABLED ROUTE, CONTRACT STATE, AND CURRENT INSTRUMENT VALUE',
    },
    position: {
      reputation: 'Reputation',
      tier: 'Tier',
      toNextTemplate: 'To {tier}',
      dealOne: 'deal',
      dealMany: 'deals',
    cappedDeals: 'Settled deals decide this, not points',
    cappedConcentration: 'Varied counterparties decide this, not points',
      status: 'Status',
      pts: 'pts',
      topTier: 'Top tier',
    },
    vault: { tag: 'YOUR STAKE', heading: 'Vault' },
    legacyNudge: { body: 'You have {amount} USDC on the previous vault.', link: 'Recover it' },
    ladder: {
      tag: 'TIER LADDER',
      headingPrefix: 'What stake',
      headingAccent: 'unlocks',
      body: 'Reputation moves your tier. Tier changes how the agents negotiate for you.',
      youBadge: 'You',
      unlock: {
        NEW: 'New here. Agents add a small premium until you build a record.',
        COLD: 'Early track record. Agents ease the premium.',
        ESTABLISHED: 'Trusted profile. Standard terms across the desk.',
        STRONG: 'Preferred counterparty. Agents move faster, tighter spreads.',
        ELITE: 'Top tier. Agents accept first look within range, no auction.',
      },
    },
  },
  flowStepper: {
    steps: {
      posted: 'POSTED',
      bidding: 'BIDDING',
      counter: 'NEGOTIATING',
      accepted: 'ACCEPTED',
      escrow: 'ESCROW',
      milestones: 'MILESTONES',
      settled: 'SETTLED',
    },
    terminal: { expired: 'EXPIRED', ended: 'ENDED HERE', outOfReach: 'NO MATCH' },
  },
  agentShell: {
    role: { buyer: 'Buyer agent', seller: 'Seller agent' },
    status: { active: 'Active', idle: 'Idle', offline: 'Offline' },
    activate: {
      running: 'Agent running',
      connectWallet: 'Connect wallet',
      soonBadge: 'soon',
      tooltip: 'Wallet connect arrives in v1',
    },
  },
  profileTierCard: {
    eyebrow: '[:REPUTATION:]',
    scoreSuffix: '/ 1000',
    toNext: '{amount} to {tier}',
    topTier: 'Top tier',
  },
  partnerLogos: { builtOn: 'Built on' },
  jobsTable: {
    empty: {
      none: 'No jobs yet. Post a request and the seller agent will respond within seconds.',
      allDismissed: 'All cancelled deals dismissed.',
    },
    columns: { job: 'Job', budget: 'Budget', deadline: 'Deadline', status: 'Status', open: 'Open' },
    status: {
      cancelled: 'Cancelled',
      expired: 'Expired',
      escrowFunded: 'Escrow funded',
      accepted: 'Accepted',
      bidOne: '{count} bid',
      bidOther: '{count} bids',
      open: 'Open',
    },
    row: { openAria: 'Open deal {id}', openCta: 'Open' },
    dismiss: {
      title: 'Dismiss',
      ariaExpired: 'Dismiss this expired request',
      ariaCancelled: 'Dismiss this cancelled deal',
      ariaFunded: 'Dismiss this funded request',
    },
  },
  moneyStrip: {
    eyebrow: 'YOUR MONEY',
    heldSafe: 'Held safe on Arc · withdraw anytime',
    cells: {
      available: { label: 'Available', hint: 'Ready to spend' },
      inEscrow: { label: 'In escrow', hint: 'Locked and safe' },
      earned: { label: 'Earned', hint: 'Paid to you' },
    },
  },
  bidsTable: {
    empty: {
      idle: 'Idle. The agent is subscribed to JobPosted and will respond when a matching request lands.',
      dismissed: 'All finalized bids dismissed.',
    },
    columns: { job: 'Job', buyer: 'Buyer', bid: 'Bid', rounds: 'Rounds', status: 'Status', open: 'Open' },
    status: { finalized: 'Finalized', negotiating: 'Negotiating' },
    row: {
      openJobAria: 'Open job {id}',
      dismissTitle: 'Dismiss',
      dismissAria: 'Dismiss this finalized bid',
      abandon: 'Abandon',
      abandonConfirm: 'Confirm',
      open: 'Open',
    },
  },
  releaseMilestones: {
    button: {
      released: 'Released',
      releasing: 'Releasing milestone {current} of {total}…',
      release: 'Release {total} milestones',
    },
    progress: {
      confirmed: '{count} of {total} confirmed on chain.',
      settled: 'All milestones released. Escrow settled.',
    },
  },
  errorHelp: {
    explainCta: 'Explain this error',
    explaining: 'Reading…',
    whatHappened: 'What happened',
    whatToDo: 'What you can do',
    failed: 'Could not load an explanation.',
  },
  languagePicker: {
    languageLabels: { en: 'English', ar: 'Arabic', fr: 'French', hi: 'Hindi', sw: 'Swahili' },
  },
  telegramConnectCard: {
    eyebrow: 'TELEGRAM ALERTS',
    title: 'Push to your chat',
    subtitle: 'Deals · chat · bridge state',
    linkedBadge: 'LINKED',
    notConfiguredPrefix: 'Telegram alerts are not configured on this server. Ask the operator to set',
    notConfiguredAnd: 'and',
    idleDescription: 'One tap to open the bot, one more to confirm. Wallet stays in your browser.',
    connectCta: 'Connect Telegram',
    linkingPrefix: 'Open the bot in Telegram and tap',
    linkingSuffix: '. Karwan confirms automatically.',
    openTelegramCta: 'Open Telegram',
    cancelCta: 'Cancel',
    waitingTitle: 'Waiting for /start',
    waitingExpiry: 'Link expires in 10 minutes.',
    telegramLabel: 'Telegram',
    chatFallback: 'chat {id}',
    linkedAt: 'linked {date}',
    unlinkCta: 'Unlink',
    emailNote: 'Email alerts coming later',
  },
  balanceRail: {
    switch: {
      title: 'Your wallet is on the wrong network. Switch to Arc Testnet.',
      label: 'Switch to Arc',
      switching: 'Switching to Arc',
    },
    address: {
      copied: 'Copied',
      copyTitle: 'Click to copy {address}',
      copyAria: 'Copy address {address}',
    },
  },
  inlineControls: {
    walletNotConnected: 'Wallet not connected',
    copyLabel: 'copy',
    copiedLabel: 'copied',
    copyTooltip: 'Copy',
    copyAddressTooltip: 'Copy address',
  },
  docsShell: {
    sidebar: {
      eyebrow: 'DOCUMENTATION',
      sections: {
        overview: { label: 'Overview', blurb: 'What Karwan is and how the pieces fit.' },
        agents: { label: 'Agents', blurb: 'How the buyer and seller agents negotiate.' },
        deals: { label: 'Deals & Escrow', blurb: 'Both deal flows, milestones, settlement.' },
        disputes: { label: 'Disputes', blurb: 'Published timelines for every recovery path.' },
        reputation: { label: 'Reputation & Stake', blurb: 'The composite score and the vault.' },
        bridge: { label: 'Deposit / Withdraw', blurb: 'Move USDC in and out of Arc.' },
        roadmap: { label: 'Roadmap', blurb: 'Strong functionality shipping next.' },
        faq: { label: 'FAQs', blurb: 'Quick answers for first-time users.' },
      },
    },
    pager: { previous: 'Previous', next: 'Next' },
    figure: { videoComingSoon: 'video coming soon', screenshotComingSoon: 'screenshot coming soon' },
  },
  docsDisputesPage: {
    eyebrow: 'DISPUTES',
    title: 'Dispute process and timelines',
    intro: 'Every recovery path runs on a published clock, enforced by the escrow contract and the platform watcher, not by support tickets. The values below are read live from the platform config: the numbers you see are the numbers the watcher enforces.',
    policy: {
      liveTag: 'LIVE POLICY',
      reviewWindow: 'First review window',
      appealGrace: 'Delay appeal opens',
      buyerResponse: 'Buyer response window',
      reclaimGrace: 'Reclaim grace',
      disputeTimeout: 'Dispute backstop',
      note: 'Read from platform config at page load. Testnet values are short by design.',
    },
    buyerSilent: {
      heading: 'If the buyer goes quiet',
      s1: { label: 'Auto-release starts.', body: 'After delivery, the first milestone releases on its own once the review window of {reviewWindow} passes with no action. The final milestone never auto-releases on a silent timer.' },
      s2: { label: 'Raise a delay appeal.', body: 'Opens {appealGrace} after the last release. The buyer gets {buyerResponse} to respond.' },
      s3: { label: 'Auto-reclaim runs.', body: 'If the seller still has not delivered after the grace window, the platform submits the reclaim and the unreleased escrow returns to the buyer. The contract records the failed deadline and any reserved stake is handled there. We are still reviewing this process for the full mainnet mechanism. Send us feedback as you test the testnet.' },
    },
    sellerLate: {
      heading: 'If the seller misses the deadline',
      s1: { label: 'The buyer is alerted.', body: 'The moment the deadline passes without delivery, with one-click reclaim or extend.' },
      s2: { label: 'Auto-reclaim.', body: 'Still no delivery after {reclaimGrace} of grace and the escrow returns to the buyer in full. The miss lands on the seller reputation record.' },
    },
    disputed: {
      heading: 'If a deal is disputed',
      intro: 'A dispute freezes the escrow on chain. The deal then shows the resolution paths available under the current contract configuration.',
      s1: { label: 'Settle it between you.', body: 'Either side proposes a release or a refund. If the other side accepts, the escrow applies the agreed outcome on chain.' },
      s2: { label: 'Arbiter ruling.', body: 'The security council splits the escrow by percentage, on chain. The ruling text and the split are public on the deal record.' },
      s3: { label: 'The backstop.', body: 'If the configured dispute backstop expires, the contract applies its published outcome. The live disputes page is the source for the current timeout and recovery rule.' },
    },
    callout: { title: 'Nothing freezes forever', body: 'Funds sit in the escrow contract, not with Karwan. Every hold has a clock, every clock has an exit, and every exit is visible on Arc.' },
  },
  docsIndexPage: {
    eyebrow: 'OVERVIEW',
    headline: 'How Karwan works',
    intro: 'Karwan is a settlement workspace for person-to-person and business trade. USDC sits in milestone escrow on Arc while the work is delivered. The buyer reviews each release. Agents can find a counterparty and negotiate within the limits you set, then bring the terms back for your approval. Settled deals add to the account\'s on-chain reputation record. This guide explains the parts you can use today.',
    twoWays: {
      title: 'Two ways to open a deal',
      lede: 'Choose based on whether you already know who is on the other side.',
      direct: {
        label: 'Direct deal.',
        body: 'You already have a counterparty. Name their wallet or email, set the terms, and send them for agreement. After the seller agrees, you review the live fee and exact total before funding escrow.',
      },
      matched: {
        label: 'Agent-matched deal.',
        body: 'You need to find a counterparty. Post a request as a buyer or an offer as a seller. Your agent looks for a fit, negotiates inside your limits, and brings you a proposal to approve.',
      },
    },
    getStarted: {
      title: 'Start with the rail you need',
      signIn: {
        label: 'Sign in.',
        body: 'Sign in with a passkey, an email code, or your own wallet. Email and passkey accounts do not require a seed phrase.',
      },
      fund: {
        label: 'Fund your balance.',
        body: 'Bring testnet USDC to Arc through Deposit / Withdraw, or use the Arc faucet while testing.',
      },
      open: {
        label: 'Open a deal.',
        body: 'Post a request, publish an offer, name a counterparty by wallet or email, or browse the market. Fund only after you have reviewed the final terms.',
      },
    },
    next: {
      title: 'Where to go next',
      lede: 'Each section below covers one part of the platform in depth.',
      cards: {
        agents: { title: 'Agents', blurb: 'How your buyer and seller agents negotiate price and deadline.' },
        deals: { title: 'Deals and Escrow', blurb: 'The deal lifecycle from acceptance to settlement, plus cashout.' },
        reputation: { title: 'Reputation and Stake', blurb: 'How your score is built, how it resists gaming, and how staking lifts your tier.' },
        bridge: { title: 'Deposit / Withdraw', blurb: 'Move USDC in and out of Arc.' },
        roadmap: { title: 'Roadmap', blurb: 'What is live today and what is shipping next.' },
        faq: { title: 'FAQs', blurb: 'Quick answers to the questions new users ask first.' },
        x402: { title: 'Paid data endpoints', blurb: 'The x402 endpoints anyone can pay per call to read a credit passport or a repayment record.' },
      },
    },
  },
  docsAgentsPage: {
    eyebrow: 'AGENTS',
    title: 'Agents that work inside your limits',
    intro: 'When you post a request or offer, an agent searches for a fit and handles the negotiation. It works inside the limits you set and brings the proposed terms back to you. It is a matchmaker, not a spender. Money does not move until you approve.',
    howNegotiationRuns: {
      heading: 'How the negotiation moves',
      auction: 'Post a request and your buyer agent opens a short auction window. Seller agents bid. Your agent scores every bid on price, the seller\'s reputation, their completion rate, how long they have been on the platform, and how active they are. The best bids line up in a queue.',
      concession: 'Your agent starts with the strongest candidate. The negotiation can move in smaller steps as the terms get closer. If the candidate cannot land inside your range, the agent can continue with another match instead of forcing a bad deal.',
      privacy: 'Each agent only sees its own principal\'s range. The buyer agent knows the budget and the tolerance ceiling; the seller agent knows the asking price and the floor. Neither side ever reads the other\'s reservation. The two agents meet in the middle on a deterministic concession curve, with the current market median and recent counterparty reputation as shared, public references.',
    },
    timelineFigure: {
      alt: 'Activity timeline showing counter rounds between buyer and seller agents',
      caption: 'A live negotiation, round by round, in the deal timeline',
    },
    whyHuman: {
      heading: 'What the agent is trying to do',
      anchors: { label: 'It starts with a position.', body: 'The seller protects the floor they set. The buyer protects the budget they set. The agent looks for a workable middle ground.' },
      reputation: { label: 'It reads the record.', body: 'Settled-deal history and the available reputation signals help the agent judge how much caution a match needs.' },
      closes: { label: 'It can stop cleanly.', body: 'If the terms fit the limits you set, the agent can surface them for approval. If they do not, it ends the attempt instead of hiding the mismatch.' },
      alternatives: { label: 'It keeps looking.', body: 'If one negotiation fails, the agent can continue with another candidate when one is available.' },
    },
    approval: {
      title: 'YOU ALWAYS APPROVE',
      body: 'The agent negotiates, but it never funds an escrow on its own. When it reaches agreement, it surfaces a proposal. You review it and approve before any USDC moves.',
    },
    guardrails: {
      heading: 'Setting your guardrails',
      body: 'Your agent works inside the guardrails in your profile: budget or asking price, delivery window, and tolerance. It can propose terms inside those boundaries. It cannot approve or fund a deal for you.',
    },
    guardrailsFigure: {
      alt: 'The request form showing budget, deadline, and tolerance guardrails',
      caption: 'The guardrails your agent negotiates within',
    },
  },
  docsBridgePage: {
    eyebrow: 'DEPOSIT / WITHDRAW',
    title: 'Move USDC in and out of Arc',
    intro: 'Deals settle in USDC on Arc. Deposit and withdrawal options depend on your sign-in method and the transfer routes enabled in the product. Email and passkey accounts receive the deposit address shown in the app. Connected-wallet accounts choose a supported source route and sign the transfer themselves.',
    supportedChains: {
      heading: 'Supported chains',
      body: 'The Deposit / Withdraw screen lists the supported routes for your account. EVM and Solana addresses can differ because they use different address formats. Do not send a token or use a route that is not shown in the product.',
    },
    bringingIn: {
      heading: 'If you bring USDC from your own wallet',
      steps: {
        pickSource: { label: 'Pick the chain.', body: 'Choose where your USDC currently sits.' },
        approveBurn: { label: 'Sign the transfer.', body: 'You sign the transfer from your own wallet. The product shows the source route and confirmation state before you continue.' },
        attestation: { label: 'Wait for confirmation.', body: 'Wait for source-chain finality and the transfer service to report completion. Testnet timing can vary.' },
        mintArc: { label: 'Arrive on Arc.', body: 'The transfer status shows when the destination credit is available. Follow the current route instructions in the product.' },
      },
    },
    figure: {
      alt: 'The deposit card showing your address and the chains it accepts',
      caption: 'The deposit card: one address, a QR code, and the chains it accepts.',
    },
    callout: {
      title: '[:CONFIRMATION TAKES TIME ON TESTNET:]',
      body: 'Cross-chain transfers wait for source-chain finality and external confirmation. If a transfer remains pending, use the status and recheck controls in the product before starting another transfer.',
    },
    cashout: {
      heading: 'Getting paid out',
      body: 'After settlement, choose a destination from the routes available to your account.',
      options: {
        arcToArc: { label: 'Stay on Arc.', body: 'Send to an Arc address supported by the product. Network state and account configuration can affect availability and timing.' },
        crossChain: { label: 'Send to another chain.', body: 'Choose one of the cross-chain destinations currently shown in the product. The progress card reports each transfer stage. Destination-chain requirements and timing depend on the configured route.' },
      },
    },
    emailPasskey: {
      heading: 'If you sign in with email or a passkey',
      body: 'Your account shows the deposit address or addresses that apply to it. Copy the exact address and route shown before sending. Do not assume an address works across every chain or token.',
    },
    whyThisRail: {
      heading: 'What this transfer route does',
      body: 'The product uses the configured USDC transfer route to move supported funds between chains. The route, token contract, and transfer state shown in the product are the source of truth. Cross-chain transfers still depend on external networks and services.',
    },
  },
  x402Page: {
    eyebrow: 'PAID DATA API',
    title: 'Underwriting data, paid per call',
    intro: 'Karwan sells the same signals it uses to underwrite trade deals: the credit passport, repayment behaviour, counterparty concentration, and anchored trade documents. Financiers and agents pay per call in USDC over x402, settled in batches through Circle Gateway on Arc Testnet. A wallet with a Gateway deposit is the whole integration; there are no API keys and no subscriptions.',
    endpoints: {
      heading: 'Endpoints',
      body: 'Prices are in USDC per call. The directory endpoint is free and machine-readable, so an agent can discover the catalogue before paying.',
      privacy: 'Passport endpoints honor the owner\'s privacy setting. A hidden passport returns 404 and the caller is never charged for it.',
      freeLabel: 'free',
      items: {
        intro: {
          name: 'Directory',
          returns: 'Lists every paid endpoint with its price and what it returns.',
        },
        creditPassport: {
          name: 'Credit passport',
          returns: 'Composite reputation snapshot: score out of 1000, tier, term breakdown, settled-deal counts, concentration flags.',
        },
        repaymentBehavior: {
          name: 'Repayment behaviour',
          returns: 'Rolling ten-deal window: on-time rate, average days to settle, default count, last settlement.',
        },
        concentration: {
          name: 'Counterparty concentration',
          returns: 'Share of recent deals going to the top counterparty, with soft and hard risk flags and a per-counterparty histogram.',
        },
        documentAnchors: {
          name: 'Document anchors',
          returns: 'On-chain anchored document hashes for an invoice: kind, label, who anchored it, transaction hash.',
        },
      },
    },
    howToPay: {
      heading: 'How payment works',
      body: 'x402 is the HTTP 402 payment flow. Settlement runs through Circle Gateway, which batches many sub-cent payments into one on-chain transaction, so a half-cent call never pays a full transaction fee.',
      steps: {
        deposit: {
          label: 'Deposit once.',
          body: 'Put a small USDC balance into your Circle Gateway deposit on Arc Testnet. A few dollars covers hundreds of calls.',
        },
        call: {
          label: 'Call the endpoint.',
          body: 'A request without payment returns 402 with a PAYMENT-REQUIRED header describing the price, the asset, and where to pay.',
        },
        retry: {
          label: 'Sign and retry.',
          body: 'Your client signs a USDC authorization against the Gateway wallet and retries with a Payment-Signature header. The response carries the settlement transaction in a PAYMENT-RESPONSE header.',
        },
      },
    },
    example: {
      heading: 'Try it',
      body: 'The Circle x402 batching client handles the whole round-trip in one call:',
    },
    sameChain: {
      title: 'SAME CHAIN RULE',
      body: 'Gateway settles a payment on the chain where the deposit sits. To pay these endpoints, deposit on Arc Testnet; they accept eip155:5042002 only.',
    },
  },
  docsDealsPage: {
    eyebrow: 'DEALS AND ESCROW',
    title: 'From agreement to settlement',
    intro: 'Every deal uses milestone escrow on Arc. The buyer funds it, the seller delivers, and the buyer releases each milestone after review. The contract controls the release path. Read the live deal timers before you choose a deadline or open a dispute.',
    lifecycle: {
      heading: 'The lifecycle',
      open: { label: 'Open.', body: 'A buyer opens a direct deal or approves a proposal from the matching flow.' },
      acceptFund: { label: 'Agree, then fund.', body: 'The seller agrees to the terms first. The buyer then reviews the live fee and exact total before funding escrow. On a trusted deal, seller stake reserves only when funding is activated.' },
      deliver: { label: 'Deliver.', body: 'The seller marks delivery against proof the buyer can check. For goods, dispatch and arrival are separate events. The buyer reviews the proof before releasing a milestone.' },
      release: { label: 'Release.', body: 'The buyer releases the first milestone, then verifies and releases the rest. The escrow settles, the reservation returns to the seller\'s free stake, and the reputation registry records a clean outcome.' },
      summary: 'The deal page tracks every stage with a progress strip on top and a next-move panel below it, so both sides always know exactly where the deal is and what they can do.',
    },
    figures: {
      funded: { alt: 'Deal page after escrow funding, with the seller\'s mark-delivered action', caption: 'Escrow funded. The seller marks the work delivered.' },
      waiting: { alt: 'Deal page from the buyer\'s side while waiting for delivery', caption: 'The buyer waits for delivery, with cancel as a fallback.' },
      delivered: { alt: 'Deal page after delivery, the first milestone awaiting release', caption: 'Delivered. The first half is up for release.' },
      releaseFirst: { alt: 'Deal page with the buyer\'s release-first-milestone action', caption: 'The buyer releases the first half, or appeals.' },
      afterFirst: { alt: 'Deal page after the first release, the final milestone awaiting verification', caption: 'First half released. The buyer verifies and releases the rest.' },
      settled: { alt: 'Deal page in the settled state, fully paid', caption: 'Settled. The seller is paid in full and reputation is recorded on chain.' },
    },
    shareable: {
      heading: 'Shareable deal links',
      body: 'A buyer can point a direct deal at an email address instead of a wallet. Karwan sends a branded invite. The recipient opens the link, types the one-time code we just emailed, and a Circle wallet is provisioned in their browser. They accept the deal. The recipient claims the invite with the one-time code, reviews the terms, and accepts. Timing depends on email delivery and the recipient\'s actions.',
    },
    fee: {
      heading: 'The platform fee',
      body: 'Karwan takes a 1.5% platform fee on each deal, split evenly between buyer and seller. The fee collects on chain as each milestone releases. The buyer funds their half up front; the seller\'s half comes out of their payout.',
    },
    review: {
      heading: 'Review windows and auto-release',
      body: 'The deal shows live review and recovery timers so both sides can see what happens if one side stops responding. After the seller marks delivered, the buyer has a window to release the first milestone. Where the configured recovery path allows it, the first milestone can release after the buyer\'s review and appeal windows expire. The final milestone requires the buyer\'s explicit approval in the current flow. The buyer can extend the review window when they need more time. The live deal displays the review window that applies to that deal. On a goods deal it never expires while the shipment is still in transit, and agreed Net terms hold it open for the full term, because marking goods delivered means dispatched, not arrived.',
    },
    stake: {
      heading: 'Stake as deal insurance',
      body1: 'When the seller accepts a deal, a configurable portion of their free stake reserves against the deal amount. The active deal and accept panel show the reservation settings that apply. On a clean settlement, the reservation releases back to the seller\'s free stake. On a failed dispute, the reservation slashes to the buyer as insurance.',
      body2: 'This is what makes a seller\'s reputation more than a number. A buyer can read the seller\'s free-stake balance and know what is actually backing the deal.',
    },
    cashout: {
      heading: 'Cashing out after settlement',
      body: 'The Cashout page sends your settled USDC where you want it. Arc-to-Arc transfers are designed to settle quickly, subject to network state. Cross-chain transfers use the configured Circle transfer path. The progress card shows the stages reported by the service. Timing depends on source-chain finality and external infrastructure.',
    },
    wrong: {
      heading: 'If something goes wrong',
      mutualCancel: { label: 'Mutual cancel.', body: 'Either side can propose a cancellation. If the other accepts, the escrow refunds and neither side takes a reputation hit.' },
      dispute: { label: 'Dispute.', body: 'A buyer can open a dispute from the states allowed by the deal. The available contract resolution path is shown in the deal, and the outcome is recorded on chain.' },
    },
    callout: {
      title: 'ON ARC TESTNET TODAY',
      body: 'All deals on Karwan today settle in testnet USDC on Arc Testnet, which has no real value. Treasury yield through real Hashnote USYC is already live on testnet.',
    },
  },
  docsFaqPage: {
    eyebrow: 'FAQS',
    headline: 'Quick answers',
    intro: 'The questions new users ask first. If yours is not here, reach the team through the links in the footer.',
    items: [
      { q: 'How do I add testnet USDC?', a: 'Open Deposit / Withdraw and use the address or source route shown for your account. Copy the exact address, chain, and token shown before sending. Connected-wallet accounts sign their own transfers. The Arc faucet is available for supported test flows.' },
      { q: 'Do I need a crypto wallet?', a: 'No. You can sign in through the available email or passkey path. If you prefer self-custody, you can connect your own wallet.' },
      { q: 'Is this real money?', a: 'Karwan currently runs on Arc Testnet. Testnet USDC has no real-world cash value. Do not send real funds to a testnet address.' },
      { q: 'Does my counterparty need an account?', a: 'Not before you create a direct deal. You can address an invite to a supported wallet or email. The recipient must claim the invite, review the terms, and accept before the deal can continue.' },
      { q: 'What happens when negotiation fails?', a: 'No escrow funds. The request can end without an agreement, and the product shows the reason available from the matching flow. You can change your limits or post a new request.' },
      { q: 'Can I cancel a deal?', a: 'The deal page shows whether cancellation is available in its current state. A mutual cancellation follows the contract path shown to both parties. Read the proposed outcome before accepting it.' },
      { q: 'What if the seller does not deliver?', a: 'Use the recovery or dispute action shown on the deal. The available refund, release, timeout, and stake outcome depend on the contract state and current configuration.' },
      { q: 'What if the buyer is slow to release?', a: 'The deal shows the active review and appeal timers. The current flow requires explicit buyer approval for the final milestone. Any earlier recovery action follows the contract configuration shown on that deal.' },
      { q: 'What happens after a missed deadline?', a: 'The deal page shows the actions and grace period that apply. A deadline miss can affect the seller record when the contract records a failed outcome.' },
      { q: 'Do agents spend money?', a: 'Agents do not fund deals. Where paid research is enabled, an agent may use the separate research balance within its configured cap. The product should show the charge and the resulting data.' },
      { q: 'What is the difference between Individual and Business accounts?', a: 'Individual accounts use the Buyer and Seller desks. Business accounts use B2B Trades with Buyer Desk and Supply Desk. Business finance capabilities can be feature-gated.' },
      { q: 'Are individual skills verified?', a: 'Skills are self-declared unless the product shows a live verification state for that specific skill. The complete individual submission and reviewer workflow is not currently shipped.' },
      { q: 'What does business verification mean?', a: 'Where enabled, a business can submit registration or tax evidence through the business review path. A verified state does not prove licensing, solvency, performance, or safety. It can expire or be revoked.' },
      { q: 'How long does a deposit take?', a: 'Timing depends on the source chain and transfer service. Follow the status shown in Deposit / Withdraw. If a transfer is still pending, use the recheck control before sending another one.' },
      { q: 'How do I raise my reputation?', a: 'Reputation uses the inputs and tier requirements shown in your profile and the current reputation model. Settled outcomes matter. Reputation is not identity, skill, or business verification.' },
      { q: 'Does stake earn yield?', a: 'The Stake page separates the vault position from network and account yield. Yield depends on the enabled route, permissions, contract state, and instrument value. It is not guaranteed.' },
      { q: 'Where does settled money go?', a: 'The deal and wallet views show the destination account. Use Deposit / Withdraw for a supported transfer after settlement. Available routes depend on the live configuration.' },
      { q: 'Does Karwan custody funds?', a: 'Custody depends on the sign-in method and deal state. Connected-wallet users control their wallet. Email or passkey accounts use Circle-operated wallet infrastructure under the authority described in the Terms. Funded deal money is governed by the escrow contract.' },
    ],
  },
  docsReputationPage: {
    eyebrow: 'REPUTATION AND STAKE',
    title: 'Reputation records outcomes',
    intro: 'An account can build a reputation score from settled deal history and the other inputs shown in the product. The score follows the account that settled the deal. It is a record of outcomes, not a guarantee about the person or business behind the wallet.',
    signals: {
      heading: 'What moves your score',
      lead: 'The score uses the reputation inputs shown in the product and backend. No single number should be read as proof of identity, skill, licensing, or future performance.',
      items: {
        stake: { label: 'Locked stake.', body: 'USDC deposited in the vault. It can contribute to reputation and may be reserved as deal insurance when the active deal requires it.' },
        deals: { label: 'Settled deals.', body: 'Completed outcomes against your wallet, weighted by your success rate.' },
        volume: { label: 'Lifetime volume.', body: 'Total USDC moved through escrow. One huge deal does not dominate.' },
        tenure: { label: 'Tenure.', body: 'Time since the account registered. It is one input, not proof that the account has traded successfully.' },
        activity: { label: 'Activity.', body: 'Distinct days the wallet was active. Showing up over time matters, not raw deal count.' },
      },
      penalty: 'Negative deal outcomes and policy signals can reduce the score according to the active reputation model. Read the current reputation model for the inputs and limits in force.',
      referralPrefix: 'A sixth signal, referrals through real deals, joins the score on mainnet as a marketing rail. It is not live today, so it does not factor into your score yet.',
      referralLink: 'Read the roadmap entry',
      referralSuffix: '.',
    },
    tiers: {
      heading: 'The five tiers',
      lead: 'Your score buckets into one of five tiers. Your agent and your counterparty\'s agent both read the tier when scoring a match. A tier also has to be earned in settled deals: stake, tenure and activity all raise your score on their own, but they cannot carry a tier without completed work behind it. If deals are what is holding you back, your profile says so and tells you how many more you need.',
      items: {
        new: 'Fresh account with little or no settled history.',
        cold: 'Early history. Matching can apply the handling configured for this tier.',
        established: 'A settled record has started to form.',
        strong: 'A stronger settled record under the active reputation model.',
        elite: 'The highest reputation tier. It is still not a guarantee of performance.',
      },
      breakpoints: 'The product displays the breakpoints and tier requirements currently in force. Testnet settings are not a promise of future mainnet policy.',
      figureAlt: 'Reputation score and tier ladder on the profile page',
      figureCaption: 'Your score and tier on the profile page.',
    },
    resistance: {
      heading: 'Controls around the score',
      lead: 'Reputation systems usually fail because a determined user can find a cheap path to the top. Karwan\'s formula closes the most common ones by design.',
      volumeFarming: { heading: 'Volume farming', body: 'Posting many small deals with yourself does not pay off. The volume curve is concave, so each extra unit of volume contributes less than the one before. Counterparty spread is then checked separately: when most of your settled deals are with a single wallet, your tier is capped no matter what the score says. Trading in a circle cannot buy standing.' },
      stakeAndRun: { heading: 'Stake and run', body: 'A withdrawal follows the cooldown returned by the live vault. The position view shows the current state of every amount. Do not rely on a fixed number copied into documentation.' },
      selfDealing: { heading: 'Self-dealing', body: 'The on-chain reputation registry refuses to let an agent\'s owner rate their own agent. The constraint is enforced at the contract layer, not just in our application, so a determined user cannot bypass it by writing their own client. Running both sides through two wallets does not work either: concentration caps the tier, so a wallet whose record is one repeat partner cannot reach the tiers that reduce collateral.' },
      matchAndCancel: { heading: 'Match and cancel', body: 'Bidding on many requests and pulling out before settlement counts toward the cancellation penalty. The penalty hits in days, not months, so cycling through this pattern drops the score fast.' },
      decay: { heading: 'Decay on idleness', body: 'A once-strong wallet that goes silent for months is no longer trusted as currently strong. The decay term reduces the displayed score so agents weigh inactive history less. A returning user re-earns trust by completing a deal or two.' },
    },
    staking: {
      heading: 'Stake, reputation, and deal insurance',
      body: 'A vault deposit can contribute to reputation. When a deal requires collateral, the contract can reserve part of the seller\'s free stake against that deal. Settlement or dispute resolution determines what happens to the reservation.',
      cooldown: 'You can request a withdrawal from the vault. The live position shows the cooldown and when the funds become claimable. Reserved stake cannot be withdrawn until the related deal releases it.',
      calloutTitle: 'YIELD IS A SEPARATE READOUT',
      calloutBody: 'The Stake page separates protocol yield, your claimable yield, and the vault position. Yield depends on the enabled route, contract state, permissions, and current instrument value. It is not guaranteed by a reputation tier or verification badge.',
      figureAlt: 'The staking card showing deposit amount and cooldown state',
      figureCaption: 'Deposit, cooldown, and claim in one card.',
    },
  },
  docsRoadmapPage: {
    eyebrow: 'ROADMAP',
    heading: 'Current build and planned work',
    intro: 'Karwan runs on Arc Testnet today. This guide separates current product paths from work still in development. A roadmap item is not a live capability, eligibility decision, or delivery promise.',
    live: {
      title: 'Available in the current testnet build',
      items: {
        match: { title: 'Agent-assisted matching.', body: 'Buyer and seller flows can compare matches and negotiate inside account limits. Users review the resulting terms before funding.' },
        negotiation: { title: 'Market context for negotiation.', body: 'Where the paid research capability is enabled, the negotiation can use an external market read. The product should show when that data was used and what it cost.' },
        stake: { title: 'Stake as deal insurance.', body: "A portion of the seller\'s free stake reserves against every accepted deal. A failed dispute slashes that reservation to the buyer." },
        passport: { title: 'Credit-passport surface.', body: 'The repository contains a public credit-passport route. Availability and the fields returned depend on the enabled backend and privacy settings.' },
        shareable: { title: 'Shareable deal links.', body: 'Open a deal pointed at an email address. The recipient claims with a one-time code and a Circle wallet is provisioned in their browser.' },
        cashout: { title: 'Cashout after settlement.', body: 'Send settled USDC to any wallet on Arc, or withdraw to Ethereum, Base, Arbitrum, Optimism, Polygon, or Solana with an inline progress card.' },
        vault: { title: 'USYC yield paths.', body: 'The build contains protocol and account yield surfaces connected to configured USYC paths. Balances, permissions, distribution, and claimability depend on live contracts and chain state.' },
        factoring: { title: 'Business finance paths.', body: 'A financier advances against an invoice at a discount set by the seller\'s reputation tier, and the escrow records an irrevocable redirect so the repayment cannot be diverted. Purchase-order financing advances working capital against an accepted order and releases it when proof of delivery is anchored on chain. Both legs move native USDC.' },
        disputes: { title: 'Dispute resolution paths.', body: 'A dispute that survives the two sides talking goes to an arbiter, who splits the unreleased funds by basis points rather than picking a winner. The same ruling settles the seller\'s reserved stake in proportion to fault. A dead arbiter key can delay a deal but never trap it: after the timeout either party can push it to its default outcome.' },
        symmetric: { title: 'Both sides earn a record.', body: 'A settled deal credits the buyer and the seller on chain, not only the seller, and each side gains a distinct counterparty the first time a pair settles. Standing is value-weighted and counts distinct counterparties, so volume with one repeat partner cannot inflate a score.' },
        verified: { title: 'Verified deliverables.', body: 'A security agent scans every delivered link before the buyer sees it, and guards the in-app chat so a phishing or malware link cannot be sent in the first place. A flagged link pauses the deal\'s automatic release and routes both sides to resolve it. A confirmed bad link is a heavy hit to the sender\'s reputation.' },
        escrowYield: { title: 'Escrow yield path deployed.', body: 'The live escrow can sweep idle float through the treasury into USYC, capped at 80 percent, and pulls it back before every payout. The escrow\'s books stay pure USDC and always recover exactly what was swept, so principal is guaranteed whatever the token price does. No escrow balance has been swept yet.' },
        terms: { title: 'Terms and Conditions with versioned consent.', body: 'A public terms page and a first-signup consent gate that re-prompts when the version changes.' },
        signin: { title: 'Three sign-in paths.', body: 'Email and passkey, email one-time code, or a web3 wallet through Sign-In with Ethereum.' },
        languages: { title: 'Multi-language framework.', body: 'English, Arabic, French, Hindi, and Swahili across the most user-facing surfaces today.' },
        tours: { title: 'Guided coachmark tours.', body: 'Role-aware walkthroughs run once per page so new users learn the product as they use it.' },
      },
    },
    next: {
      title: 'Planned or incomplete',
      skills: { title: 'Individual skill verification', body: 'Individual skill claims are currently self-declared unless the product shows a live, skill-specific verification state. A future verification path may use external evidence or structured review. It will be scoped to the named skill and may expire or be revoked. Business verification is a separate account workflow for registration and tax evidence. Neither label guarantees licensing, solvency, performance, or safety.' },
      fileDelivery: { title: 'File delivery', body: 'Deliver work as a file rather than only a link, with the same scan pipeline. Built on Cloudflare R2 for speed and IPFS for tamper-evident, content-addressed delivery of confidential trade documents.' },
      referral: { title: 'Referral marketing rail (mainnet)', body: 'A growth surface that rewards users for bringing real counterparties on board. When you refer someone who registers through a completed deal with you, both wallets get a reputation lift on the new referral signal. Designed for mainnet, where every honest signup is a real customer rather than a faucet click. Sits behind a small anti-fraud check so the same wallet does not refer itself, and so repeating with the same counterparty does not stack indefinitely.' },
      mainnet: {
        title: 'Mainnet hardening',
        items: {
          audit: { title: 'External smart-contract audit', body: 'before any mainnet deployment.' },
          safe: { title: 'Safe multisig treasury', body: 'to replace the deployer address before the mainnet contracts hold real funds.' },
          coverage: { title: 'Higher test coverage', body: 'on the escrow and vault branches before audit.' },
        },
      },
      reach: {
        title: 'Reach',
        body: 'Karwan is built for cross-border service trade anywhere in the world. The early language roster covers several corridors where bank rails are slowest today, and new locales come on as the user base grows.',
        items: {
          coverage: { title: 'Full string coverage and Arabic right-to-left pass', body: 'across every page, not only the sign-in and notification surfaces.' },
          handbook: { title: 'Public handbook.', body: 'A hosted guide for buyers, sellers, financiers, and agent operators.' },
        },
      },
    },
    callout: {
      title: 'TESTNET TODAY',
      body: 'Everything live on Karwan runs on Arc Testnet, so testnet USDC has no real value. Treasury yield through real Hashnote USYC is already live on testnet.',
    },
  },
  howItWorksPage: {
    header: {
      eyebrow: 'Documentation',
      title: 'How Karwan works',
      body: 'Karwan secures USDC in escrow while a service is delivered. There are two ways to open a deal, one settlement spine underneath. This is the walkthrough: the flows, the on-chain calls, and the Circle products behind them. Every step is a real transaction on Arc Testnet.',
    },
    directDeal: {
      eyebrow: 'Direct deal',
      title: 'When you already have a counterparty',
      body: 'You agreed with someone off-platform. Karwan just secures the money while the work gets done.',
      step1: { title: 'Agree and fund', cta: 'Open buyer dashboard', bodyA: 'On ', bodyB: ', pick "I have a seller". Enter their wallet or email, the amount, deadline, and milestones. The seller agrees first. You then review the current fee and exact total before funding escrow.' },
      step2: { title: 'Seller delivers', body: 'Work starts only after the deal shows escrow funded. When the work is done, the seller marks it delivered, which unlocks your releases.' },
      step3: { title: 'Release in tranches', body: 'You release the first slice, then verify the work and release the rest. The escrow settles, the platform fee is collected, and the seller\'s reputation is recorded on chain.' },
    },
    managedDeal: {
      eyebrow: 'Managed deal',
      title: 'When you need an agent to find one',
      body: 'Post a request and the agents run the auction and negotiation for you.',
      step1: { title: 'Post a request', bodyA: 'On ', bodyB: ', pick "Find me a seller". Write what you need, set a budget and deadline. A ', bodyC: ' transaction lands on Arc in a few seconds.' },
      step2: { title: 'Agents negotiate', bodyA: 'The seller agent scores the request and calls ', bodyB: '. Your buyer agent ranks it, pulls a paid market read so its counter tracks real prices, negotiates within your limits, and accepts the best terms. Each step shows on the live timeline.' },
      step3: { title: 'Settle the deal', body: 'On acceptance, the buyer agent approves USDC and funds the escrow. When the work is done, release the milestones. Funds move to the seller in tranches.' },
    },
    contract: {
      eyebrow: 'Under the hood',
      title: 'The on-chain calls',
      bodyA: 'A managed deal walks the full path below. A direct deal skips straight to ',
      bodyB: ', naming the seller without an auction.',
      step1: { actor: 'Buyer agent · managed only', bodyA: 'Records the request on the JobBoard. Emits ', bodyB: ', the event seller agents subscribe to.' },
      step2: { actor: 'Both agents · managed only', body: 'The negotiation loop. Seller bids, buyer counters once, seller responds, buyer locks final terms.' },
      step3: { actor: 'Buyer agent', body: 'ERC-20 approval so KarwanEscrow can pull funds. The approval covers the deal amount plus the buyer\'s half of the platform fee.' },
      step4: { actor: 'Buyer agent', bodyA: 'Locks the deal amount with a milestone schedule. The contract pulls ', bodyB: ', stores what the seller nets and what the treasury collects. Emits ', bodyC: '.' },
      step5: { actor: 'Buyer', body: 'Releases one milestone. The seller gets their cut, the treasury gets its proportional slice of the 1.5% fee. The final milestone sweeps any remainder and marks the escrow settled.' },
      step6: { actor: 'Buyer agent', body: 'On settlement, records the outcome against the seller on KarwanReputation. ERC-8004 forbids self-rating, so the buyer rates the seller.' },
    },
    stake: {
      eyebrow: 'Stake to grow reputation',
      title: 'The reputation engine, end to end',
      body: 'Every wallet has a composite score in [0, 1000] derived from completed deals, locked stake, time on the platform, and a spam-detection penalty. The score binds to one of five tiers and gates how aggressively the agent loop negotiates on your behalf.',
      step1: { title: 'Deposit USDC', bodyA: 'On ', bodyB: ', deposit any amount into ', bodyC: '. No forced lock, no minimum tenure. The longer it sits, the more weight it carries in the formula.' },
      step2: { title: 'Climb tiers', body: '. Each tier unlocks specific agent behavior. ELITE sellers skip the auction; NEW buyers pay a premium that surfaces to the seller for human review before approval.' },
      step3: { title: 'Request a withdrawal', body: 'A withdrawal request enters the cooldown returned by the live vault. The position shows when the principal becomes claimable and whether the request can still be cancelled.' },
    },
    stack: {
      eyebrow: 'Circle stack',
      title: 'What we use, and where',
      usdc: 'The currency we settle in. Holds deal amounts, escrow balances, milestone payouts, the platform fee, and KarwanVault staking principal.',
      dcw: 'Every agent runs on an SCA wallet on Arc Testnet. The buyer agent funds escrows and releases milestones; the seller agent bids and negotiates. Identity DCWs sign vault deposits and withdrawals for Circle-auth users with no wallet popup.',
      cctp: 'Bidirectional USDC bridge across twelve chains: Ethereum, Base, Arbitrum, Optimism, Polygon, Avalanche, Unichain, Sei, Sonic, World Chain, and HyperEVM, plus Solana Devnet. Withdrawals run through Circle\'s Forwarding Service, so you cash out anywhere without holding that chain\'s gas token. Inbound deposits for an email or passkey account need none of this: Circle derives one address that serves every EVM chain, and the credit is triggered by the transaction webhook.',
      appKit: 'Circle\'s unified SDK for bridge, swap, send, and unified balance. The Circle Wallets adapter signs straight from our Developer-Controlled Wallets, so an email or passkey user bridges without ever seeing a wallet popup, and web3 users sign with their own wallet through the same SDK.',
      gateway: 'One pooled USDC balance across twelve chains. Deposit once, then spend to any chain from a single signature, with no chain switching and no source-chain gas. It is also the rail that settles the agents\' per-call payments.',
      arc: 'Chain 5042002. Blocks finalize in under a second. USDC is the native gas token, and the ERC-8004 identity and reputation registries are already deployed.',
      usyc: 'Trade capital is idle by nature, and money that sits should earn. The treasury holds real allowlisted Hashnote USYC on Arc Testnet through the standard ERC-4626 Teller interface, marked to the live on-chain oracle. Idle staking principal routes through the same operator-mediated path. The live escrow carries the same sweep path for funds left idle during long-dated trades, capped at 80 percent of float, though no escrow balance has been swept yet.',
    },
    roadmap: {
      eyebrow: 'Roadmap',
      title: 'Coming next',
      body: 'What ships after the current testnet build.',
      fileDelivery: { title: 'File delivery', body: 'Deliver work as a file rather than only a link, with the same scan pipeline behind it. Cloudflare R2 for speed, IPFS for tamper-evident, content-addressed delivery of confidential trade documents.' },
      referral: { title: 'Referral rail', body: 'A growth surface that rewards bringing real counterparties on board. Refer someone who settles a deal with you and both wallets gain on the referral signal. Built for mainnet, behind an anti-fraud check so a wallet cannot refer itself.' },
      mainnet: { title: 'Mainnet and wider corridors', body: 'An external contract audit and a multisig treasury before any mainnet deployment, then wider trade corridors and more source chains as the network grows.' },
      i18n: { title: 'Skill verification', body: 'Graded proof of work, so a seller who can show a real delivery record raises their skill-match score. Evidence stays separate from reputation, so proving a skill never hides a thin record.' },
    },
    faq: {
      eyebrow: 'FAQs',
      title: 'Common questions',
      q1: { q: 'What is the difference between a direct deal and an agent-matched deal?', a: 'A direct deal is for two parties who already know each other. You open an escrow naming the seller\'s wallet, or even an email address, and skip the auction. An agent-matched deal is for when you need a counterparty: you post a request as a buyer or an offer as a seller, and the agents run the matching and negotiation. Both use the same escrow, reputation, and settlement underneath.' },
      q2: { q: 'What is the platform fee?', a: '1.5% of the deal amount, split evenly between buyer and seller. The buyer funds the deal amount and their half of the fee; the seller nets the deal amount minus their half. The fee collects on chain as each milestone releases.' },
      q3: { q: 'Who controls my agent wallet, and how do I fund it?', a: 'Your agent wallet is a Circle Developer-Controlled Wallet whose owner is you. Karwan can sign on its behalf to negotiate while you sleep, but it never opens an escrow without your sign-off. You can sweep funds out of it at any time from the profile page. To fund a wallet while Karwan is on Arc Testnet, every wallet on the profile has a Get USDC button: it copies that wallet address and opens the Circle faucet so you claim test USDC in seconds, no bridging needed. Deposit is there for when you bring real USDC to Arc.' },
      q4: { q: 'Are the smart contracts deployed?', a: 'Yes. The escrow, vault, reputation, treasury, and job-board contracts are live on Arc Testnet (chain 5042002). The current addresses are in the public repository. Every event in the activity feed links to its transaction on the Arc explorer.' },
      q5: { q: 'How does the escrow release?', a: 'The buyer releases each milestone with a single click. The seller gets their share, the treasury gets the platform fee in proportion, and the final release marks the escrow settled. The final milestone always needs an explicit buyer click; it never auto-releases.' },
      q6: { q: 'What if a deal goes to dispute?', a: 'A buyer can dispute from the funded or delivered state. The escrow moves to a disputed state and either side can resolve through the contract. A refund returns the money to the buyer and slashes the seller\'s reserved stake to the buyer as insurance. A release sends the money to the seller. The outcome lands on both parties\' on-chain reputation record.' },
      q7: { q: 'What if a seller agent skips my agent-matched request?', a: 'The seller\'s profile has a budget and deadline range. If your request falls outside it, the agent skips and the timeline shows you why. If the agent is uncertain for any other reason, that is logged too, so the next move is never silent.' },
      q8: { q: 'Which corridors does this serve?', a: 'Karwan works for any cross-border service deal anywhere in the world. The early language roster covers several corridors where bank rails are slowest today, including the Gulf, North and West Africa, the Indian subcontinent, and East Africa, but the escrow, reputation, and agent layer is corridor-agnostic. New languages and corridors come on as the user base grows.' },
      q9: { q: 'Where does the agent reasoning run?', a: 'Every decision that touches money is handled by a deterministic rule set in the backend: budget and deadline bounds, topical match, stake requirements, reservation math. A language model only handles the parts that need judgement, such as whether two non-overlapping skill descriptions describe the same job, or how to phrase a counter. The reasoning calls on the critical path run on a model tuned for strict structured output, so a malformed response never stalls a live deal, and if the model goes offline the agent keeps working through its deterministic fallbacks. Your agent also remembers sellers you have closed clean deals with and gives a familiar, proven counterparty a small fair edge, never beating a clearly better or cheaper newcomer.' },
      q10: { q: 'How does Karwan keep delivery safe?', a: 'Work is usually handed over as a link, so a SecurityAgent scans every delivery proof before you open it, and it guards the in-app chat so a phishing or malware link cannot be sent to you in the first place. A flagged link pauses the deal\'s automatic release, notifies both sides, and routes you to resolve it together in chat. A confirmed bad link is a heavy hit to the sender\'s reputation. When a delivery is a file, it is shared through a link the agent can check rather than an unverified attachment.' },
    },
    videoGuides: { eyebrow: 'Video guides', title: 'Watch it in action', body: 'Short video walkthroughs of each flow are on the way. While they are in production, the in-app tour walks you through any page step by step. Open it from the Tour control at the bottom of the screen.', badge: 'Coming soon' },
    cta: { title: 'Try it on Arc Testnet', body: 'The dashboard runs both flows against real testnet contracts.', button: 'Launch app', chainPrefix: 'chain' },
  },
  brandPage: {
    hero: { tag: 'BRAND', headlineLead: 'The Karwan', headlineAccent: 'mark', body: 'The logo, the palette, the voice. Pull what you need to write about Karwan, embed it in a partner deck, or paint a co-mark. For deeper guidance, reach out at the contact below.' },
    logo: { tag: 'LOGO', headline: 'Three forms', body: 'Pick by surface. Mark for small spaces. Wordmark when there is room. Reserve clearspace equal to the stroke width on every side.', wordmarkOnDark: 'Wordmark on dark', wordmarkOnLight: 'Wordmark on light', markOnDark: 'Mark on dark' },
    palette: { tag: 'PALETTE', headline: 'Three brand constants', body: 'Lime is the only accent. Pair brand lime with one neutral. Never stack a second accent color on top.', brandLime: 'Brand lime', brandInk: 'Brand ink', creamSurface: 'Cream surface', brandLabel: 'BRAND', copy: 'Copy', copied: 'Copied' },
    voice: { tag: 'VOICE', headline: "Engineer's product memo", body: "Karwan's tone reads as infrastructural, not consumer. Bloomberg terminal energy. Have an opinion. Acknowledge limits. Vary rhythm. Never theatrical.", wordsWeUseLabel: 'WORDS WE USE', wordsWeUseBody: 'settlement, escrow, rail, deal, request, offer, milestone, release, slash, stake, reputation, passport, anchor, attest, financier, importer, exporter, working capital, cross-border, on-chain.', wordsWeAvoidLabel: 'WORDS WE AVOID', wordsWeAvoidBody: 'revolutionary, transformative, empowering, seamless, robust, world-class, cutting-edge, gig, freelance, platform, users, AI (we say "agents" with the specific job they do).' },
    partner: { tag: 'PARTNER CO-MARK', headline: 'Pair, do not enclose', body: "When co-marking with Arc, Circle, USYC, or another partner: same baseline as Karwan's wordmark, vertical hairline divider, equal optical weight. Never enclose two logos in the same container.", partnerLabel: 'Partner' },
    contact: { tag: 'PRESS AND PARTNERS', headlineLead: 'Reach', headlineAccent: 'out', body: 'Want a higher-resolution asset, a co-mark configuration we have not published, or a quote? Send a note.', backHome: 'Back home' },
  },
  termsPage: {
    eyebrow: 'TERMS',
    headlineLead: 'What you sign up',
    headlineAccent: 'for',
    intro: 'Karwan is currently in testnet. These terms set out how the service works, the risks of stablecoin settlement, and how your data is handled. Please read them in full before you accept.',
    preamble: 'These terms cover how Karwan works, what we do with your money, and what each side is responsible for. Signing in, posting a request, opening a deal, or staking means you accept them. Take a moment with them first.',
    s1: {
      title: '1. What Karwan offers',
      lead: 'Karwan is a settlement layer for cross-border work between businesses, freelancers, and individuals. The core pieces:',
      bullets: {
        deals: { label: 'Deals with escrow.', body: 'Open a deal directly with someone you already know, or post a request and let the market bid. Either way the money locks in a smart contract on Arc before work starts, and releases in milestones.' },
        settlement: { label: 'Settlement in USDC.', body: 'All movement inside Karwan is in USDC, a dollar stablecoin issued by Circle.' },
        localCurrency: { label: 'Local currency.', body: 'Karwan does not convert to or from your local currency inside the product today. Converting is your own decision, made outside Karwan. Local currency access is being enabled region by region. Where it becomes available, it is provided by a licensed partner under their own terms and their own identity checks, and what you can reach depends on the region your account is registered in. Nothing here is a commitment to a date or to a particular region.' },
        invite: { label: 'Invite by email.', body: 'You can open a deal with someone who has no account. They claim it from an emailed link with a one-time code, and get paid without ever installing a wallet.' },
        moving: { label: 'Moving money in and out.', body: 'Use the deposit and withdrawal routes shown in the product. Available networks and transfer paths depend on the current Circle configuration. Transfers within Arc are direct.' },
        reputation: { label: 'Reputation and the credit passport.', body: 'Your account carries a tier and a score built from settled deal history. Anyone with your address can read the on-chain part.' },
        agents: { label: 'Agents.', body: 'Optional buyer and seller agents find counterparties, score offers, and negotiate inside the limits you set. They negotiate. They do not move money on their own. Every movement is either approved by you or is one of the automatic outcomes in section 4.' },
        assistant: { label: 'The assistant.', body: 'An in-product AI assistant answers questions and can prepare actions for you. Anything that moves money is shown to you and needs your confirmation before it runs. You can ask it for a person at any point, which opens a support ticket.' },
        staking: { label: 'Staking.', body: 'You can lock USDC in the vault. It raises your tier and acts as deal insurance the escrow contract can draw on if you lose a dispute.' },
      },
      tail: 'Some of this is still rolling out. Business registration, invoice factoring, purchase-order financing, and the financier side are behind flags and are not available to every account. Anything labelled "coming soon" or shown behind a beta flag is not guaranteed to ship on a fixed date.',
    },
    s2: {
      title: '2. How your account is held',
      lead: 'Karwan settles in USDC. How your balance is held depends on how you signed in.',
      ownWallet: { label: 'If you connected your own wallet,', body: 'you hold it. You approve every movement yourself, and Karwan cannot move anything without you.' },
      operated: { label: 'If you signed in with email or a passkey,', body: 'Karwan opens an account for you on Circle\'s wallet infrastructure and operates it on your behalf. You do not manage credentials and you do not need to.' },
      scope: 'Operating it means something specific. Karwan can move your money only to carry out things you started: fund a deal you created, release a milestone you approved, return funds to you when a deal is cancelled or a deadline is missed, and complete the automatic outcomes described in section 4. Karwan cannot send your balance to anyone outside a deal you opened, cannot change a deal after both sides accept, and cannot move your funds to itself.',
      contractLimit: 'Once a deal is funded, the escrow contract on Arc governs where that money can go. That limit is enforced by the contract, not by our policy.',
      why: 'The automatic parts of Karwan exist because of this. A milestone that releases on its own after the review window, and a refund that returns to a buyer when a seller misses a deadline, both need an account that can act when neither side is online.',
      research: 'One exception is worth naming. If you activate paid market research, you pay once for a credit balance, and your agent spends from that balance on your behalf as it reads market data. That is the only place an agent spends without a fresh approval each time, and you can see the remaining balance on your profile.',
    },
    s3: {
      title: '3. What you are responsible for',
      lead: 'You take care of:',
      bullets: {
        signin: { label: 'Your sign-in.', body: 'Keep your passkey, your email access, or your connected wallet secure. Anyone who has them can act as you.' },
        review: { label: 'Reviewing what you receive.', body: 'Look at the deliverable before you release the final milestone. Once released, the funds are with the seller.' },
        deadlines: { label: 'The deadlines you set.', body: 'If you give the seller two days, you cannot claim breach before that period has passed. If you do not set a deadline, the deal stays open until one of you closes it.' },
        offPlatform: { label: 'Off-platform delivery.', body: 'If you and your counterparty agree to share files, links, or specs outside Karwan, we cannot help you recover funds released on those grounds.' },
        counterparty: { label: 'Who you deal with.', body: 'An individual skill can be self-declared and may not be verified. A business verification state covers only the submitted business evidence and enabled review path. Neither a badge nor a reputation tier confirms identity, licensing, solvency, performance, or safety.' },
        currency: { label: 'Currency.', body: 'Karwan does not convert currencies and does not apply an exchange rate. Amounts you enter are amounts in USDC. If local currency access reaches your region, the rate and the fee on that leg belong to the partner providing it, not to Karwan.' },
      },
    },
    s4: {
      title: '4. How a deal settles',
      lead: 'Once escrow is funded, these are the rules that move the money.',
      bullets: {
        release: { label: 'Milestone release.', body: 'The buyer releases each milestone. The final milestone always needs an explicit click from the buyer and never releases on a timer.' },
        autoRelease: { label: 'Automatic release.', body: 'Milestones before the final one release on their own once the review window has passed with no action from the buyer. The window is shown on the deal and lengthens for each later milestone.' },
        deadline: { label: 'A missed deadline.', body: 'When a delivery deadline passes with nothing delivered, the buyer is alerted and can reclaim or grant an extension. If nobody acts and the seller still has not delivered after the grace window, the escrow returns to the buyer automatically and the miss is recorded against the seller.' },
        cancel: { label: 'Cancelling.', body: 'A cancel both sides agree to refunds in full and carries no penalty. Staked funds reserved against the deal are released back to the seller.' },
        disputes: { label: 'Disputes.', body: 'A dispute freezes the unreleased escrow. The parties can agree a split themselves. If they do not, the configured arbiter can resolve the dispute by setting the release and refund proportions. The live deal and verified contract are the source of truth for the available path.' },
      },
      tail: 'The exact timings in force are published on the disputes page in the product, and they can change. That page shows the live values, not a copy of them.',
    },
    s5: {
      title: '5. Reputation and the agent',
      lead: 'Reputation is computed from settled deal history. The summary:',
      bullets: {
        success: 'Successful deals raise your score and can move you to a higher tier.',
        disputes: 'Disputes you lose reduce your score. Disputes you win do not.',
        malicious: 'A delivery confirmed as malicious drops your tier sharply.',
        deadline: 'A missed deadline that ends in a reclaim is recorded as a failure.',
        staking: 'Staking contributes to a higher tier and acts as deal insurance the escrow contract can draw on.',
      },
      tail: 'The full formula lives in the reputation model doc. Agents read the tier and apply tier-aware behaviour: a high tier gets priority and can skip the auction in some flows, a new account pays a premium on first deals. An agent never overrides the limits you set.',
      agentWallet: 'Reputation is written against the account that settled the deal. If you use an agent wallet, the record follows that wallet.',
    },
    verification: {
      title: '6. Verification and account status',
      lead: 'Verification is an account state. It is not a promise about the person or business behind the account.',
      individual: { label: 'Individual skills.', body: 'A skill listed on an individual profile is self-declared unless the named skill carries a verification state. The current individual skill-verification workflow is not fully available. A future enabled flow may request evidence tied to one named skill.' },
      individualStatus: 'A skill label applies only to the named skill and state shown. It can expire, be rejected, or be revoked. It does not transfer to another skill, account, wallet, or business.',
      business: { label: 'Business verification.', body: 'When enabled, a business can submit registration or tax evidence. The account may show unverified, pending, verified, rejected, expired, or revoked. A verified state means only that the enabled review path accepted the submitted evidence at the time shown.' },
      limits: { label: 'What verification does not prove.', body: 'Verification does not confirm identity, licensing for a transaction, solvency, future performance, the existence of goods or services, or that an account is safe to trade with.' },
      policy: 'The enabled policy may restrict matching, rated reputation, or business features for an unverified account. Direct deals remain available only where the policy shown in the product allows them.',
    },
    s6: {
      title: '7. Risk you carry',
      lead: 'Stablecoin work has real risks. The ones that apply here:',
      bullets: {
        testnet: { label: 'Karwan is on testnet right now.', body: 'You are not paid in real money. Deals on testnet have no legal weight. Testnet is a sandbox. Mainnet follows after the hardening pass.' },
        contract: { label: 'Smart-contract risk.', body: 'The escrow, vault, and reputation contracts on Arc were audited internally and are testnet quality. A bug, an exploit, or a misuse could result in lost funds.' },
        depeg: { label: 'USDC depeg or freeze.', body: 'USDC is issued by Circle. If Circle\'s banking partners come under stress, or a sanctioned address is involved, USDC can lose its peg or be frozen. Karwan cannot reverse this.' },
        outage: { label: 'Network outages.', body: 'Arc Testnet is a live testbed. If validators stall, RPC providers go down, or a chain reorg happens, your deal can pause or roll back.' },
        crossChain: { label: 'Cross-chain transfers.', body: 'Moving USDC between chains depends on infrastructure outside Karwan. A transfer can take longer than the product suggests, and a transfer that has left one chain but not yet arrived on another is not something Karwan can reverse.' },
        fiat: { label: 'No fiat conversion guarantee.', body: 'If you sell USDC for local currency today, that transaction is solely between you and whoever you sell it to. Where local currency access arrives inside Karwan, it runs on a licensed partner. Availability, limits, rates, and identity checks are set by that partner, can change, and can be withdrawn in a region without notice to you from us.' },
        compliance: { label: 'What is checked, and what is not.', body: 'Your money is protected by the escrow contract and every step is written to a record both sides can verify. What Karwan does not do today is screen the person on the other side: there are no sanctions, anti-money-laundering, or deal-level business identity checks. Individual skill labels are self-declared unless the product shows an enabled, skill-specific verification state. Business verification, where enabled, checks submitted registration or tax evidence through the stated review path; it does not prove licensing, solvency, performance, or safety. Verification can be pending, rejected, expired, or revoked. Choose who you work with the way you would anywhere else. Privacy-preserving counterparty screening is on the roadmap for mainnet. Where a licensed partner provides local currency access, that partner runs its own identity checks as part of their service.' },
        regulatory: { label: 'Geographic and regulatory compliance is yours.', body: 'Karwan does not check whether stablecoin payments are legal where you live. Some jurisdictions restrict stablecoin payments, agent-mediated work, or peer-to-peer escrow. You are responsible for knowing your own rules.' },
      },
    },
    s7: {
      title: '8. Privacy snapshot',
      storeLead: 'What we store:',
      store: {
        addresses: 'Addresses, on-chain activity, and off-chain deal records keyed by address.',
        email: 'Your email if you sign in by email or passkey, or if you verify one. Your X handle and your Telegram account if you connect them.',
        chats: 'Negotiation transcripts, deal messages, assistant conversations, and support tickets.',
        reputation: 'Reputation inputs: settled deal counts, dispute counts, staked balance, registration time.',
        business: 'Business details you submit for registration, including a hash of any document you upload. The document itself is hashed in your browser and is not sent to us.',
      },
      notStoreLead: 'What we do not store:',
      notStore: {
        keys: 'Signing credentials for a connected wallet. Those never leave your device.',
        fiat: 'Payment card data or bank account numbers. Where local currency access becomes available in your region, those details go to the licensed partner providing it and are handled under their privacy terms, not held by Karwan.',
      },
      custody: 'For accounts Karwan operates on your behalf, the signing capability is held in Circle\'s infrastructure under our control, as described in section 2. It is not stored by us as a key you or we could copy out.',
      tail: 'You can ask us to delete your account record from settings. Anything recorded on chain stays on chain. We cannot remove that.',
    },
    s8: {
      title: '9. Account and acceptance',
      lead: 'By accepting these terms in the product, you confirm:',
      bullets: {
        age: 'You are at least 18 years old, or the age of majority where you live.',
        lawful: 'You can lawfully enter contracts in your jurisdiction.',
        address: 'The account you signed in with is yours, or you have authority to act for the entity that owns it.',
      },
      changes: 'These terms may change. When a material change ships, the version number on this page is updated and the product asks you to accept the new version before you can post a request, open a deal, or stake. If you do not accept, you can still read your existing deals and reclaim escrow under the previous terms, but you cannot open new work.',
      organisation: 'If you are using the product through an organisation, you confirm that you have authority to bind that organisation to these terms.',
    },
    s9: { title: '10. Contact', body: 'The fastest channel is the in-product feedback link, or the assistant, which can open a support ticket for you. For matters that need a paper trail, email the address listed on karwan.site under "Contact". Every live chat and email opens a ticket with an id. Keep the id if you have one.' },
    footer: { version: 'Version', updated: 'Last updated' },
  },
  adminFeedbackPage: {
    eyebrow: 'OPERATOR',
    title: 'Feedback',
    tokenPrompt: 'Admin token (sent as X-Admin-Token):',
    loading: 'Loading',
    emptyAll: 'No feedback yet.',
    emptyInFilter: 'No feedback in "{filter}".',
    actions: { setToken: 'Set token', refresh: 'Refresh', markTriaged: 'Mark triaged', markResolved: 'Mark resolved', reopen: 'Reopen' },
    filters: { all: 'all', new: 'new', triaged: 'triaged', resolved: 'resolved' },
    statusLabels: { new: 'new', triaged: 'triaged', resolved: 'resolved' },
    categoryLabels: { bug: 'bug', improvement: 'improvement', praise: 'praise', other: 'other' },
    metaLabels: { where: 'Where', wallet: 'Wallet', contact: 'Contact', client: 'Client' },
    errors: {
      tokenRequired: 'Admin token required. Click "Set token" to enter it.',
      tokenRejected: 'Token rejected. Click "Set token" and re-enter it.',
      gateNotConfigured: 'Admin gate is not configured on the server (set ADMIN_API_TOKEN).',
    },
    lightbox: { closeAria: 'Close screenshot', imageAlt: 'feedback screenshot' },
  },
  balancesCard: {
    eyebrow: '[:HOLDINGS:]',
    signedOutBody: 'Sign in to see your USDC balances. Use the Log in pill in the nav.',
    title: 'USDC balances',
    chainCountTemplate: 'across {n} chains',
    refresh: 'Refresh',
    refreshing: 'Refreshing',
    reveal: 'Show',
    hide: 'Hide',
    tabs: {
      you: 'You',
      buyer: 'Buy agent',
      seller: 'Sell agent',
    },
    notConfigured: 'not configured',
    updatedTemplate: 'updated {time}',
    timeAgo: {
      justNow: 'just now',
      secondsTemplate: '{n}s ago',
      minutesTemplate: '{n}m ago',
      hoursTemplate: '{n}h ago',
    },
  },
  jobPage: {
    loading: {
      tag: 'LOADING JOB',
      headline: 'Fetching the request',
      body: 'Reading the live state from the buyer agent.',
    },
    private: {
      tags: {
        negotiating: 'IN NEGOTIATION',
        closed: 'CLOSED',
        default: 'COLLECTING BIDS',
      },
      headlines: {
        negotiating: 'This deal is private',
        closed: 'This request is closed',
        default: 'This request is collecting bids',
      },
      bodies: {
        negotiating: 'Two parties are settling this deal privately. You cannot see the negotiation. Post an offer so buyers or an agent can find you, or wait for another opportunity.',
        closed: 'This request is no longer open.',
        default: 'Only the buyer who posted this request can see its live auction. Post your own request, or list what you offer and let buyers come to you.',
      },
      browseCta: 'Browse the market',
      postCta: 'Post a request →',
    },
    error: {
      notFoundTag: 'REQUEST NOT TRACKED YET',
      errorTag: 'JOB ERROR',
      notFoundHeadline: 'We could not find this request',
      errorHeadline: 'Could not load this job',
      notFoundBody: 'The backend has no record of this jobId. If you just posted it, give the buyer agent a few more seconds to pick up the on-chain event and try refreshing. If it stays missing, the id may be wrong.',
      errorBody: 'The job id may be wrong, or the backend has not seen it.',
      backCta: 'Back to buyer desk',
      activityCta: 'See activity →',
    },
  },
  postJob: {
    notConnected: 'Sign in to post a deal. Log in pill is in the nav.',
    noBuyerProfile: {
      eyebrow: 'BUYER PROFILE',
      title: 'Set up a buyer profile.',
      body: 'Your agent uses it to score and counter bids inside your ranges.',
      cta: 'Set up profile →',
    },
    preview: {
      eyebrow: 'DEAL PREVIEW',
      unitMinShort: 'MIN',
      unitHrShort: 'HR',
      unitDaysShort: 'DAYS',
      tolerancePrefix: 'tolerance',
      ceilingPrefix: 'ceiling',
      milestoneCaption: 'milestone payments with buyer review',
    },
    sectionWork: {
      eyebrow: 'THE WORK',
      title: 'Describe what you need.',
      requestLabel: 'Request',
      requestHint: 'Outline scope, deliverables, must-haves. The seller agent reads this to decide whether to bid.',
      requestPlaceholder: 'e.g. 200 bags arabica green coffee, Lagos to Dubai. CIF, net 30. BoL on dispatch.',
    },
    sectionTerms: {
      eyebrow: 'TERMS',
      title: 'Set the auction guardrails.',
      budgetLabel: 'Budget',
      budgetHint: 'Target price. The agent negotiates from here within the tolerance.',
      deadlineLabel: 'Deadline',
      deadlineHint: "Sellers won't bid if it falls outside their delivery window. Choose min, hr, or days.",
      toleranceLabel: 'Tolerance',
      toleranceHint: 'How much above budget the agent may accept on a counter. 0 = strict.',
    },
    trustedMatch: {
      eyebrow: 'TRUSTED MATCH',
      body: "Agent prioritizes seller reputation and stake over price. Sellers with no stake cannot bid. Best for higher-value or one-shot deals you can't redo.",
    },
    customSplit: {
      eyebrow: 'CUSTOM MILESTONE SPLIT',
      tooltip: 'Sets how your payment releases in stages as work lands. Off, it pays half at the first milestone and half on delivery. Your stages must add up to 100.',
    },
    intentWarning: {
      eyebrow: 'WAIT. IS THIS A REQUEST OR AN OFFER?',
      bodyStart: 'This reads like something you ',
      bodyOffer: 'offer',
      bodyMiddle: ', not something you ',
      bodyNeed: 'need',
      bodyAfter: '. Requests are for buyers; offers (posted from the seller desk) are for sellers. If you meant to sell a service, ',
      bodyLink: 'post an offer instead',
      bodyAfterLink: '. Click ',
      bodyButtonRef: 'Post request',
      bodyTail: ' again to post the request as-is.',
    },
    submit: {
      submittingShort: 'Posting…',
      waitingArcTemplate: 'Finalizing your request… {seconds}s',
      waitingCircleTemplate: 'Still finalizing… {seconds}s',
      postOnChain: 'Post request',
      pendingHelper: 'Your request is being secured. The live request page opens when it is ready.',
      feeCaption: '↳ protected settlement in USDC',
    },
    errors: {
      insufficientBalanceTitle: 'Buyer agent short on USDC.',
      insufficientBalanceFallback: 'Buyer agent is short on USDC.',
      topUpCta: 'Deposit →',
      postFailedPrefix: "Couldn't post:",
      activatingButton: 'Activating…',
      activateCta: 'Activate your agents here →',
    },
    deadlineUnitAria: 'Deadline unit',
    unitPickerLabels: {
      min: 'MIN',
      hr: 'HR',
      day: 'DAY',
    },
  },
  bridgeOut: {
    header: {
      eyebrow: 'CASH OUT',
      title: 'Cash out',
      subtitle: 'Powered by Circle · fee covered',
    },
    reassurance: 'Karwan covers the network fee. Your money lands on the chain you choose.',
    web3Fallback: 'Bridging out from a web3 wallet signs the Arc burn yourself, which is coming soon. Use a Karwan email account to send out now.',
    form: {
      destinationEyebrow: 'DESTINATION',
      amountEyebrow: 'AMOUNT',
      fromArcCaption: 'FROM ARC',
      faucetCta: 'Need Arc USDC? Faucet →',
      faucetBusy: 'Requesting',
      faucetSuccess: 'Faucet requested. About 20 USDC lands on your Arc wallet in a minute.',
      landsAtPrefix: 'LANDS AT ·',
      recipientPlaceholder: '0x your address on the destination chain',
      yourWallet: 'Your wallet',
      addressInvalid: '• [:ERR:] not a valid address',
      submitTemplate: 'Cash out to {dest}',
      sending: 'Sending…',
    },
    activityEyebrow: 'ACTIVITY',
    clearActivity: 'Clear',
    dismissButton: 'Dismiss',
    srToRecipient: 'to {address}',
    phases: {
      burning: 'Sending',
      waitingAttestation: 'Confirming',
      mintingTemplate: 'Arriving at {dest}',
      done: 'Cashed out',
      error: 'Failed',
      submitting: 'Preparing',
    },
  },
  onChainProof: {
    sectionTag: 'PAYMENT PROOF',
    headlinePrefix: 'Receipts you can ',
    headlineAccent: 'verify',
    description: 'Every number below comes from live settlement records.',
    blockPrefix: 'Record range',
    tiles: {
      escrowsFunded: { label: 'Payments protected', hint: 'Deals funded and ready' },
      settledInFull: { label: 'Settled in full', hint: 'Buyer completed every release' },
      disputesOpened: { label: 'Disputes opened', hint: 'Either side requested review' },
      usdcFunded: { label: 'Payment volume protected', hint: 'Cumulative deal value' },
      usdcReleased: { label: 'Paid to sellers', hint: 'Completed payment releases' },
      vaultDeposits: { label: 'Seller reserves', hint: 'Funds backing seller commitments' },
    },
    smallStats: {
      milestoneReleases: 'Payment releases',
      reputationRecords: 'Track records updated',
      yieldPayouts: 'Reserve earnings paid',
      feesCollected: 'Platform revenue (USDC)',
    },
    sourceContracts: {
      eyebrow: 'SOURCE CONTRACTS',
      labels: {
        escrow: 'Escrow',
        vault: 'Vault',
        reputation: 'Reputation',
        treasury: 'Treasury',
        jobBoard: 'JobBoard',
      },
    },
    chart: {
      activityEyebrow: '30-DAY ACTIVITY',
      maxPerDay: 'MAX {max} / DAY',
      loading: 'Loading payment records',
      error: 'Payment records unavailable',
      retry: 'Retry',
      empty: 'No activity in the last 30 days yet',
      legend: {
        funded: 'Funded',
        settled: 'Settled',
        disputedOrRefunded: 'Disputed or refunded',
      },
      tooltip: {
        funded: 'Funded',
        settled: 'Settled',
        disputedRefunded: 'Disputed / refunded',
      },
    },
  },
  dealStage: {
    labels: {
      'awaiting-acceptance': 'Pending acceptance',
      'awaiting-funding': 'Ready to fund',
      'awaiting-delivery': 'Awaiting delivery',
      'awaiting-first-release': 'Delivered',
      'awaiting-final-release': 'Releasing',
      settled: 'Settled',
      cancelled: 'Cancelled',
      disputed: 'Disputed',
    },
  },
  directDealList: {
    errorBody: "Couldn't load direct deals.",
    empty: {
      noDealsTag: 'NO DEALS YET',
      allDismissedTag: 'ALL DISMISSED',
      promptBuyer: 'Deals you open land here.',
      promptSeller: 'Deals naming your wallet land here.',
      promptBoth: 'Deals you open or that name your wallet land here.',
      promptAllDismissed: 'Every deal in this list has been dismissed.',
    },
    roleEyebrow: {
      buying: 'BUYING',
      selling: 'SELLING',
    },
    counterpartyEyebrow: {
      seller: 'SELLER',
      buyer: 'BUYER',
    },
    swipe: {
      dismissReveal: 'Dismiss',
      dismissTitle: 'Dismiss',
      dismissAria: 'Dismiss this deal from the list',
    },
  },
  tierCelebration: {
    eyebrow: 'TIER UNLOCKED',
    achievementPrefix: 'You reached',
    dismissAria: 'Dismiss',
    blurbs: {
      NEW: 'Welcome aboard.',
      COLD: 'Your track record is taking shape.',
      ESTABLISHED: 'A solid, trusted profile.',
      STRONG: 'A preferred counterparty. Agents move faster for you.',
      ELITE: 'Top tier. Agents accept first look within range, no auction.',
    },
  },
  pending: {
    matches: {
      sectionTag: 'PENDING MATCHES',
      inlineEyebrow: 'PENDING MATCHES',
      inlineSubtitle: 'REVIEW BEFORE CONFIRMING',
      headline: 'Pending matches',
      body: 'An agent found a possible fit. Open it to review the price, timing, counterparty signals, and what confirmation will do.',
      loadError: 'We could not check your pending matches. Existing cards may be out of date.',
      retry: 'Try again',
    },
    deals: {
      sectionTag: 'OPEN DEALS',
      headline: 'Open deals',
      body: 'Live deals on your book. Green chips need a move from you. Grey chips are waiting on the other side.',
    },
    card: {
      roleBuyer: 'BUYER',
      roleSeller: 'SELLER',
      contextJob: 'JOB',
      contextDeal: 'DEAL',
      unit: 'USDC',
      open: 'OPEN',
      dueTemplate: 'DUE {date}',
    },
    chips: {
      acceptToFund: 'REVIEW MATCH',
      agreeTerms: 'AGREE TO TERMS',
      awaitingSeller: 'SELLER REVIEWING',
      awaitingBuyer: 'BUYER REVIEWING',
      reviewPriceChange: 'REVIEW PRICE CHANGE',
      reviewFunding: 'REVIEW FUNDING',
      markDelivered: 'MARK DELIVERED',
      waitingOnSeller: 'WAITING ON SELLER',
      waitingOnBuyer: 'WAITING ON BUYER',
      releaseFirst: 'RELEASE FIRST',
      releaseFinal: 'RELEASE FINAL',
    },
  },
  activation: {
    notice: {
      tag: 'NOT ACTIVATED',
      headlines: {
        seller: 'Activate to bid',
        buyer: 'Activate to post',
        both: 'Activate to begin',
      },
      bodies: {
        seller: 'A saved seller profile does not start an agent. Activate to let your seller agent bid on matching requests.',
        buyer: 'A saved buyer profile does not start an agent. Activate to post requests and run auctions.',
        both: 'A saved profile does not start an agent. Activate to let your agents bid and post on your behalf.',
      },
      cta: 'Activate agents',
    },
    gate: {
      loading: 'Checking your agent wallets…',
      title: 'Activate to open direct deals',
      body: 'Direct deals run on your own Circle agent wallets. Activate once to provision a buyer agent and a seller agent for this wallet.',
      cta: 'Activate agents',
    },
    modal: {
      eyebrow: 'Circle wallets',
      titleNew: 'Activate your agents',
      titleActivated: 'Your agents',
      namedBody: 'Give your agents names so deals read like your own desk. Leave a field blank to use the default.',
      provisionBody: 'Karwan provisions two Circle Developer-Controlled wallets for this wallet: a buyer agent that funds escrows and signs milestone releases, and a seller agent that receives payouts and can file an appeal. They sign every on-chain action, so you never have to hold gas or approve transactions one by one.',
      setupHint: 'One-time setup. You can rename your agents any time, and fund them from your Arc balance on the profile page.',
      fields: {
        buyerNameOptional: 'Buyer agent name (optional)',
        sellerNameOptional: 'Seller agent name (optional)',
        buyerName: 'Buyer agent name',
        sellerName: 'Seller agent name',
        buyerPlaceholder: 'Buyer agent',
        sellerPlaceholder: 'Seller agent',
      },
      saveButton: 'Save names',
      savingButton: 'Saving…',
      savedNote: 'Saved. Your agents are named.',
      activateButton: 'Activate agents',
      activatingButton: 'Provisioning wallets…',
      doneButton: 'Done',
      notNowButton: 'Not now',
      errorSavePrefix: "Couldn't save",
      errorActivatePrefix: 'Activation failed',
    },
  },
  terms: {
    modal: {
      aria: 'Karwan terms and conditions',
      eyebrow: 'TERMS AND CONDITIONS',
      title: 'Please review and accept to continue.',
      openInTab: 'Open in tab',
      scrollPrompt: 'Scroll to the end to accept',
      canAccept: 'You can accept now',
      accept: 'Accept version',
      accepting: 'Recording…',
    },
  },
  auth: {
    walletPill: {
      logIn: 'Sign in',
      finishSignIn: 'Finish sign in',
      wrongNetwork: 'Wrong network',
      networkTooltip: 'On {chain}. Tap to switch or manage.',
      fallbackChain: 'unknown network',
      switchToArc: 'Switch to Arc',
      switchingToArc: 'Switching…',
    },
    signInGate: {
      defaultTag: 'SIGN IN',
      heroTag: 'SECURE TRADE',
      heroTitle: 'Trade securely across borders',
      pageTitle: 'Sign in to continue',
      heroBody: 'Karwan secures each payment, releases it as agreed work is delivered, and keeps a receipt both sides can verify. Agents help find and assess counterparties. You approve the final terms.',
      pageBody: 'Sign in with email or wallet to continue securely across Karwan.',
      button: 'Sign in',
      pillars: {
        protection: {
          title: 'Payment protection',
          body: 'Funds are secured after both sides approve the terms.',
        },
        milestones: {
          title: 'Milestone release',
          body: 'Payments release in agreed parts as work is delivered.',
        },
        receipt: {
          title: 'Verifiable receipt',
          body: 'Every completed payment creates a receipt both sides can check.',
        },
      },
    },
    modal: {
      aria: {
        dialog: 'Sign in to Karwan',
        close: 'Close',
        back: 'Back',
      },
      eyebrow: {
        welcome: 'WELCOME',
        email: 'EMAIL',
        signIn: 'SIGN IN',
        createAccount: 'CREATE ACCOUNT',
      },
      title: {
        choosePath: 'How are you using Karwan today?',
        signIn: 'Sign in to Karwan',
        askEmail: "What's your email?",
        welcomeBack: 'Welcome back',
        createAccount: 'Create your account',
        checkInbox: 'Check your inbox',
      },
      subtitle: {
        choosePath: 'Start a new trade profile or continue with the account you already use.',
        pickMethod: 'Continue with email, or use a compatible wallet if you already have one.',
        lookup: "We'll check whether this email already has a Karwan account.",
        signingInAs: 'Signing in as',
        creatingAccount: 'Your secure account is created automatically.',
        codeSentTo: 'Code sent. Enter the 6 digits.',
      },
      entry: {
        newUser: "I'm new to Karwan",
        newUserBody: 'Create your trade profile and set the limits your agents must follow.',
        returningUser: 'I already have an account',
        returningUserBody: 'Sign in to continue your deals, matches, and payments.',
      },
      pickMethod: {
        continueEmail: 'Continue with email',
        connectWallet: 'Connect a wallet',
        continueWallet: 'Continue with wallet',
        preparingWallet: 'Preparing secure sign in…',
        checkWallet: 'Confirm in your wallet',
        verifyingWallet: 'Verifying…',
        walletRetry: "We couldn't finish sign in. Try again.",
        or: 'OR',
        emailNotConfigured: 'Email login is not configured on this backend.',
      },
      enterEmail: {
        label: 'Email',
        placeholder: 'you@example.com',
        submit: 'Continue',
        submitBusy: 'Checking…',
      },
      authStep: {
        passkeySignIn: 'Sign in with Passkey',
        passkeyCreate: 'Set up Passkey',
        passkeyVerifying: 'Verifying…',
        passkeySettingUp: 'Setting up…',
        sendCode: 'Send a code',
        sendingCode: 'Sending…',
        useCodeInstead: 'Use an email code instead',
        noPasskeyHint: 'No passkey on this account yet. Sign in with a code, set one up after.',
        noWebAuthnHint: "This browser doesn't support passkeys.",
      },
      otp: {
        label: '6-digit code',
        devChip: 'DEV',
        devTapToAutofill: 'Tap to autofill',
        devTooltip: 'Dev mode only. Hidden in production.',
        resend: 'Resend',
        verify: 'Verify',
        verifyBusy: 'Verifying…',
      },
      errors: {
        invalidEmail: 'Enter a valid email.',
        lookupFailed: "Couldn't check that email.",
        passkeyCancelledSignIn: 'Passkey prompt cancelled. Try again, or use a code.',
        passkeyCancelledCreate: 'Passkey setup cancelled. Try again, or use a code.',
        passkeyGeneric: 'Passkey ceremony failed.',
        otpSendFailed: "Couldn't send a code. Try again.",
        codeMustBeSixDigits: 'Code is 6 digits.',
        codeRejected: 'Code rejected.',
      },
    },
  },
};

export type Messages = MessagesShape;
