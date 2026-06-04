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
    bridge: string;
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
    menuOpenAria: string;
    menuCloseAria: string;
    preferencesAria: string;
    settingsAriaTitle: string;
    controlLabels: {
      theme: string;
      sound: string;
    };
    allSettings: string;
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
      saving: string;
      submit: string;
      defaultDisplayName: string;
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
      groups: {
        jobs: string;
        negotiation: string;
        settlement: string;
        bridge: string;
      };
      filtering: string;
      events: string;
    };
    view: {
      notSignedInEyebrow: string;
      notSignedInBody: string;
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
      setUpProfileCta: string;
    };
    agentStatus: {
      eyebrow: string;
      checking: string;
      walletsPrefix: string;
      walletsLive: string;
      walletsIdle: string;
      activatedBody: string;
      inactiveBody: string;
      buyerFallback: string;
      sellerFallback: string;
    };
    activation: {
      activatedTag: string;
      inactiveTag: string;
      activatedHeadlinePrefix: string;
      activatedHeadlineAccent: string;
      inactiveHeadlinePrefix: string;
      inactiveHeadlineAccent: string;
      activatedBody: string;
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
        bio: string;
        budget: string;
        delivery: string;
      };
      daysSuffix: string;
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
    liveCaption: string;
    error: string;
    emptyAllTag: string;
    emptyAllBody: string;
    emptyFilteredTag: string;
    emptyFilteredTemplate: string;
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
    };
    submit: {
      signIn: string;
      sending: string;
      withdrawTemplate: string;
      agentFallback: string;
    };
    success: {
      message: string;
    };
    errors: {
      invalidAddress: string;
      failedTag: string;
    };
  };
  bridgeCard: {
    title: string;
    cctpV2: string;
    arcTestnet: string;
    buyerAgentNotConfigured: string;
    inFlightTemplate: string;
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
      circleOnlyTag: string;
      solanaCircleOnlyTitle: string;
    };
    amount: {
      balanceMaxTemplate: string;
      maxTitle: string;
    };
    submit: {
      bridgeFromTemplate: string;
      switchToTemplate: string;
      switchingToTemplate: string;
      solanaNeedsCircle: string;
      connectWallet: string;
    };
    activity: {
      clearHistory: string;
      clearHistoryTitle: string;
      bridgeSingular: string;
      bridgePlural: string;
    };
    row: {
      stale: string;
      burnLabelTemplate: string;
      mintLabel: string;
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
      gasSponsoredNote: string;
      addressLabel: string;
      provisioning: string;
      copy: string;
      copied: string;
      getUsdc: string;
      requesting: string;
      testUsdcRequested: string;
      circleFaucet: string;
    };
    appKitFund: {
      eyebrowTemplate: string;
      descriptionTemplate: string;
      addressLabelTemplate: string;
      provisioning: string;
      copy: string;
      copied: string;
      claimGasTemplate: string;
      getTestUsdc: string;
    };
    web3Fund: {
      eyebrowTemplate: string;
      descriptionTemplate: string;
      claimGasTemplate: string;
      getTestUsdc: string;
      requesting: string;
      testUsdcSentTemplate: string;
    };
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
      bodySuffix: string;
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
    errorStates: {
      privateEyebrow: string;
      privateTitle: string;
      privateBody: string;
      privateCta: string;
      notFoundEyebrow: string;
      notFoundTitle: string;
      notFoundBody: string;
      notFoundCta: string;
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
      buyerFunds: string;
      sellerReceives: string;
      platformFee: string;
      onDeliveryTemplate: string;
      onVerificationTemplate: string;
      protectedEyebrow: string;
    };
    fundingSafety: {
      settled: string;
      awaitingAcceptanceBuyer: string;
      awaitingAcceptanceSeller: string;
      activeBuyer: string;
      activeSeller: string;
    };
    terms: {
      eyebrow: string;
      title: string;
      deadlineTemplate: string;
      noDeadline: string;
      deliveryProofLabel: string;
    };
    progress: {
      eyebrow: string;
      titleLead: string;
      titleAccent: string;
    };
    progressTrack: {
      opened: string;
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
        cashoutTemplate: string;
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
      awaitingFirstRelease: {
        buyerIntroTemplate: string;
        buyerAutoReleasePrefixTemplate: string;
        buyerAutoReleaseSuffix: string;
        buyerExpiredTemplate: string;
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
      recipient: string;
      txArc: string;
      stuckNote: string;
      retry: string;
      dismiss: string;
    };
  };
  landingPage: {
    tabs: { overview: string; howItWorks: string; flow: string; getStarted: string };
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
        avgSettleLabel: string;
        avgSettleUnit: string;
        inFlightLabel: string;
        inFlightUnit: string;
        uptimeLabel: string;
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
      identityWalletLabel: string;
      identityWalletSub: string;
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
      status: string;
      pts: string;
      topTier: string;
    };
    vault: { tag: string; heading: string };
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
    terminal: { expired: string; ended: string };
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
    row: { openJobAria: string; dismissTitle: string; dismissAria: string; open: string };
  };
  releaseMilestones: {
    button: { released: string; releasing: string; release: string };
    progress: { confirmed: string; settled: string };
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
  balancesCard: {
    eyebrow: string;
    signedOutBody: string;
    title: string;
    chainCountTemplate: string;
    refresh: string;
    refreshing: string;
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
      addressInvalid: string;
      submitTemplate: string;
    };
    activityEyebrow: string;
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
      vaultClaims: string;
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
    };
    chips: {
      acceptToFund: string;
      awaitingSeller: string;
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
      wrongNetwork: string;
      networkTooltip: string;
      fallbackChain: string;
    };
    signInGate: {
      defaultTag: string;
      heroTitle: string;
      pageTitle: string;
      heroBody: string;
      pageBody: string;
      button: string;
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
        signIn: string;
        askEmail: string;
        welcomeBack: string;
        createAccount: string;
        checkInbox: string;
      };
      subtitle: {
        pickMethod: string;
        lookup: string;
        signingInAs: string;
        creatingAccount: string;
        codeSentTo: string;
      };
      pickMethod: {
        continueEmail: string;
        connectWallet: string;
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
    market: 'Market',
    bridge: 'Bridge',
    smeTrades: 'SME Trades',
    trades: 'Trades',
    tradesGroupEyebrow: 'Trades',
    soonBadge: 'soon',
    hints: {
      home: 'Your home base. Deals, activity, and what to do next.',
      market: 'Browse open requests and offers from others.',
      bridge: 'Move USDC from another chain onto Arc.',
      smeTrades: 'Karwan for institutional SME trades. Bring-your-own-agent settlement on Arc. Shipping after the first pilot.',
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
    menuOpenAria: 'Open menu',
    menuCloseAria: 'Close menu',
    preferencesAria: 'Preferences',
    settingsAriaTitle: 'Settings',
    controlLabels: {
      theme: 'Theme',
      sound: 'Sound',
    },
    allSettings: 'All settings',
  },
  settings: {
    eyebrow: 'SETTINGS',
    title: 'Preferences',
    description: 'Controls that follow you across deals.',
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
      description: 'You can change this any time from Settings.',
    },
    signUpTag: 'SIGN UP',
    stepIndicator: 'SIGN UP · STEP {step} OF {total}',
    connectStep: {
      headlinePrefix: 'Connect your ',
      headlineAccent: 'wallet',
      bodyText: 'Karwan identifies you by a wallet. Connect an EVM wallet, or sign in with email and Circle provisions one for you.',
      loginButton: 'Log in',
      fineprint: 'Wallet or email. Both land you with an Arc address.',
    },
    roleStep: {
      headlinePrefix: 'How will you use ',
      headlineAccent: 'Karwan',
      connectedAs: 'Connected as',
      description: 'How will you mostly use Karwan? Pick one. You can change this later.',
      continueArrow: 'Continue →',
      backArrow: 'Back',
      cards: {
        seller: {
          eyebrow: 'TAKE WORK',
          title: 'Bid as seller',
          body: 'Your seller agent watches the chain for jobs that match your skills and bids on your behalf.',
          tagline: 'Best for freelancers and SME service providers.',
        },
        buyer: {
          eyebrow: 'HIRE SOMEONE',
          title: 'Run the auction',
          body: 'Post requests. Your buyer agent ranks bids, negotiates within your terms, and locks the deal.',
          tagline: 'Best for founders, agencies, procurement.',
        },
        both: {
          eyebrow: 'BOTH',
          title: 'Hire and bid',
          body: 'Hire and take work from one account. Reputation compounds across both.',
          tagline: 'One identity, two roles. Recommended for SMEs.',
        },
      },
      topBadge: '★ TOP',
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
        skillsLabel: 'Skills',
        skillsHint: 'Comma-separated. Example: Next.js, Tailwind, copywriting.',
        bioLabel: 'Bio',
        bioHint: 'One or two sentences shown to buyers.',
        minBudgetLabel: 'Min budget (USDC)',
        minBudgetHint: 'Smallest job you will take, in USDC. Requests priced below this are filtered out before your agent bids.',
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
        maxBudgetHint: 'The most you will pay for one job, in USDC. Your agent never bids or settles above this.',
        bidWindowLabel: 'Bid window (sec)',
        bidWindowHint: 'Seconds your agent collects seller bids before it scores them and picks. 30 is fine for testing. Raise it to gather more bids.',
        minDeadlineLabel: 'Min deadline (days)',
        minDeadlineHint: 'Shortest delivery time you would give a seller for a job.',
        maxDeadlineLabel: 'Max deadline (days)',
        maxDeadlineHint: 'Longest delivery time you would allow a seller for a job.',
        splitLabel: 'Milestone split',
        splitHint: 'Comma-separated percentages that total 100. Example: 50,50 or 30,40,30.',
      },
      saving: 'Saving…',
      submit: 'Save & activate ↗',
      defaultDisplayName: 'Karwan user {shortAddress}',
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
      bidWindow: 'Bid window must be at least 10 seconds.',
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
    tagline: 'On-chain settlement and reputation rails for cross-border SME trade. USDC sits in milestone escrow on Arc while the work gets done.',
    builtFor: 'BUILT FOR THE TRADE LANE',
    columns: {
      product: 'PRODUCT',
      network: 'NETWORK',
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
    managedBlurb: 'Post a request. Your agent runs the bidding. You wake up to a settled deal.',
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
    usdcDeal: 'USDC DEAL',
  },
  activity: {
    signInGate: {
      tag: 'STREAM',
      body: 'Every deal moving across Karwan, live from Arc. Sign in to view the network stream and search by job ID.',
    },
    hero: {
      sectionTag: 'STREAM',
      headlineTop: 'Every event',
      headlineAccent: 'On chain.',
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
      groups: {
        jobs: 'Jobs',
        negotiation: 'Negotiation',
        settlement: 'Settlement',
        bridge: 'Bridge',
      },
      filtering: '↳ filtering',
      events: 'events',
    },
    view: {
      notSignedInEyebrow: 'NOT SIGNED IN',
      notSignedInBody: 'Sign in to watch every deal moving across Karwan. Search by job ID to follow a specific one.',
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
      body: 'Profiles are keyed to your wallet. Sign in to set up buyer and seller agents.',
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
      sectionTag: 'PROFILE',
      fallbackName: 'Your wallet',
      publicPassport: 'Public passport ↗',
      updatedPrefix: 'Updated',
      editDetailsCta: 'Edit details',
      setUpProfileCta: 'Set up profile',
    },
    agentStatus: {
      eyebrow: 'Agent status',
      checking: 'Checking…',
      walletsPrefix: 'Wallets',
      walletsLive: 'live',
      walletsIdle: 'idle',
      activatedBody: 'Buyer and seller wallets provisioned. Signing on chain.',
      inactiveBody: 'Activate below to provision agent wallets.',
      buyerFallback: 'Buyer agent',
      sellerFallback: 'Seller agent',
    },
    activation: {
      activatedTag: 'AGENT WALLETS',
      inactiveTag: 'NOT ACTIVATED',
      activatedHeadlinePrefix: 'Agents ',
      activatedHeadlineAccent: 'active',
      inactiveHeadlinePrefix: 'Activate to ',
      inactiveHeadlineAccent: 'begin',
      activatedBody: 'Buyer and seller wallets sign every on-chain action. Fund or withdraw below.',
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
        bio: 'Bio',
        budget: 'Budget',
        delivery: 'Delivery',
      },
      daysSuffix: 'days',
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
      body: 'Balances at a glance. Bridge USDC in and out from the Bridge tab.',
    },
    agentTreasury: {
      tag: 'AGENT TREASURY',
      headlineFund: 'Fund',
      headlineWithdraw: 'Withdraw',
      body: 'Top up the wallet that signs your deals. Sweep it back any time.',
    },
    stake: {
      tag: 'STAKE',
      headlinePrefix: 'Earn ',
      headlineAccent: 'reputation',
      body: 'Deposit USDC into KarwanVault. The longer it sits, the more reputation it earns. 7-day cool-down on withdrawal.',
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
      description: 'Agents run the auction. You approve the terms.',
      postRequestCta: 'Post a request →',
      postOfferCta: 'Post an offer →',
      viewActivityCta: 'View activity →',
    },
    heroAgentCard: {
      eyebrow: 'Agent control',
      statePrefix: 'Buyer agent',
      stateActive: 'active',
      stateBody: 'Scoring bids. One counter per round. Funding on accept.',
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
        body: 'Watch every deal settle live on Arc.',
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
        usdcThrough: 'USDC through escrow',
        chain: 'Chain',
        directPlusAgent: 'Direct plus agent',
        arcTestnet: 'Arc Testnet',
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
  bridge: {
    signInGate: {
      tag: 'BRIDGE',
      body: 'Bridging USDC in and out of Arc is keyed to your wallet. Sign in to continue.',
    },
    sectionTag: 'BRIDGE',
    headlinePrefix: 'Move ',
    description: 'Bring USDC to Arc from another chain, or send your Arc balance out. Native USDC over Circle CCTP. No wrapped tokens.',
    directions: {
      toArc: 'To Arc',
      fromArc: 'From Arc',
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
      header: 'FUNDING BREAKDOWN · 1.5% FEE, SPLIT EVENLY',
      youFundLabel: 'You fund',
      sellerReceivesLabel: 'Seller receives',
      platformFeeLabel: 'Platform fee',
      footerTemplate: '↳ {delivery}% on delivery · {verification}% on verification · funds when seller accepts',
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
      fundsCaption: '↳ funds when seller accepts',
    },
    errorPrefix: "Couldn't open deal:",
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
      trustedMatchBody: "Weight seller reputation and stake above price. Bids gate on the seller's free stake covering the deal's insurance reservation. For higher-value or one-shot trades.",
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
      buyerBody: 'This offer is open. Open a direct deal with this seller at the asking price. Escrow funds when they accept.',
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
    },
    sourceDomains: {
      ethereumSepolia: 'Ethereum Sepolia',
      baseSepolia: 'Base Sepolia',
      unknownTemplate: 'domain {n}',
    },
    eventTexts: {
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
      'bridge.burned': 'USDC burned on source chain',
      'bridge.attested': 'Circle attestation received',
      'bridge.minted': 'USDC minted on Arc',
      'bridge.error': 'Bridge hit an error',
      'reputation.recorded': 'Reputation recorded on chain',
      'deal.direct.created': 'Direct deal opened and funded',
      'deal.accepted': 'Seller accepted the deal terms',
      'deal.delivered': 'Seller marked the work delivered',
      'deal.review.started': 'Buyer review window opened',
      'deal.review.heartbeat': 'Buyer is still reviewing',
      'deal.auto_released': 'Final milestone auto-released',
      'deal.disputed': 'Deal moved to dispute',
      'deal.cancelled': 'Deal cancelled and refunded',
      'deal.cancel.proposed': 'Cancellation proposed',
      'deal.cancel.declined': 'Cancellation declined',
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
    factors: {
      eyebrow: 'Score factors',
      scaleCaption: '0 — 100 each',
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
    heroBody: 'Live offers and requests on Karwan. Matches land in your bell and Telegram.',
    filters: {
      all: 'All',
      offers: 'Offers',
      briefs: 'Requests',
    },
    liveCaption: 'LIVE FROM KARWAN',
    error: "Couldn't load the marketplace.",
    emptyAllTag: 'EMPTY MARKET',
    emptyAllBody: 'No offers or requests yet. Post one to start the network.',
    emptyFilteredTag: 'NO MATCH',
    emptyFilteredTemplate: 'No {side} right now.',
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
    },
  },
  agentWithdrawCard: {
    header: {
      eyebrow: '[:WITHDRAW:]',
      title: 'Sweep from agent',
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
    },
    submit: {
      signIn: 'Sign in to withdraw',
      sending: 'Sending on Arc...',
      withdrawTemplate: 'Withdraw from {agent}',
      agentFallback: 'agent',
    },
    success: {
      message: 'Withdrawal sent.',
    },
    errors: {
      invalidAddress: 'Not a valid 20-byte address.',
      failedTag: 'WITHDRAW FAILED',
    },
  },
  bridgeCard: {
    title: 'Bridge to Arc',
    cctpV2: 'CCTP V2',
    arcTestnet: 'Arc Testnet',
    buyerAgentNotConfigured: 'Buyer agent not configured.',
    inFlightTemplate: '{n} IN FLIGHT',
    eyebrow: {
      bridge: '[:BRIDGE:]',
      topUpAgent: '[:TOP UP AGENT:]',
      sourceChain: '[:SOURCE CHAIN:]',
      amount: '[:AMOUNT:]',
      mintsTo: '[:MINTS TO:]',
      activity: '[:ACTIVITY:]',
    },
    sourceChain: {
      sepoliaDomainTemplate: 'Sepolia · d{domain}',
      devnetAppKit: 'Devnet · App Kit',
      circleOnlyTag: 'Circle only',
      solanaCircleOnlyTitle: 'Solana bridge runs through Circle App Kit. Sign in with a Circle account to use it.',
    },
    amount: {
      balanceMaxTemplate: 'Balance {amount} · MAX',
      maxTitle: 'Use full balance',
    },
    submit: {
      bridgeFromTemplate: 'Bridge from {chain}',
      switchToTemplate: 'Switch to {chain}',
      switchingToTemplate: 'Switching to {chain}…',
      solanaNeedsCircle: 'Solana bridge needs a Circle account',
      connectWallet: 'Connect wallet to bridge',
    },
    activity: {
      clearHistory: 'Clear history',
      clearHistoryTitle: 'Remove finished and failed bridges from your local history. Active bridges are kept.',
      bridgeSingular: 'BRIDGE',
      bridgePlural: 'BRIDGES',
    },
    row: {
      stale: 'STALE',
      burnLabelTemplate: 'BURN · {chain}',
      mintLabel: 'MINT · ARC',
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
        approving: 'Approving USDC',
        burning: 'Burning',
        relaying: 'Submitting to relay',
        attesting: 'Waiting for attestation',
        minting: 'Minting on Arc',
        done: 'Bridged',
        error: 'Failed',
      },
      progress: {
        approve: 'Approve',
        burn: 'Burn',
        attest: 'Attest',
        mint: 'Mint',
      },
      steps: {
        approveTemplate: 'Approve · {chain}',
        burnTemplate: 'Burn · {chain}',
        circleAttestation: 'Circle attestation',
        attestationHint: '~10-19 MIN',
        mintArc: 'Mint · Arc',
      },
      error: {
        errorBadge: 'ERROR',
      },
    },
    circleFund: {
      badgeFunded: 'FUNDED',
      badgeFundToBridge: 'FUND TO BRIDGE',
      statusChecking: 'Checking your source-chain wallet…',
      statusEmpty: 'This wallet is empty. Send testnet USDC here, then bridge.',
      statusFunded: 'Funded. You can bridge now.',
      statusSendUsdc: 'Send USDC to this address first, then bridge.',
      balanceHere: 'Balance here',
      gas: 'Gas',
      sponsored: 'Sponsored',
      gasSponsoredNote: 'No ETH needed here. Karwan sponsors the gas for this burn, so you only fund USDC.',
      addressLabel: 'Your source-chain Circle address',
      provisioning: 'provisioning…',
      copy: 'COPY',
      copied: 'COPIED',
      getUsdc: 'Get USDC',
      requesting: 'Requesting',
      testUsdcRequested: 'Test USDC requested. It lands here in about a minute.',
      circleFaucet: 'Circle faucet',
    },
    appKitFund: {
      eyebrowTemplate: '[:FUND {chain} TO BRIDGE:]',
      descriptionTemplate: '{name} bridges through Circle App Kit. Karwan signs the burn from your dedicated {shortName} wallet, so you fund that address with USDC once and {nativeSymbol} for blockhash fees. Auto-drip is unreliable on devnet, so claim from the public faucets directly.',
      addressLabelTemplate: 'Your {chain} Circle address',
      provisioning: 'provisioning…',
      copy: 'COPY',
      copied: 'COPIED',
      claimGasTemplate: 'Claim {native} gas',
      getTestUsdc: 'Get test USDC',
    },
    web3Fund: {
      eyebrowTemplate: '[:FUND {chain} TO BRIDGE:]',
      descriptionTemplate: 'You sign the burn on {name}, so your wallet needs {nativeSymbol} for gas. Claim gas from the faucet, then pull test USDC here.',
      claimGasTemplate: 'Claim {native} gas',
      getTestUsdc: 'Get test USDC',
      requesting: 'Requesting',
      testUsdcSentTemplate: 'Test USDC sent to your wallet on {name}. Lands in about a minute, then bridge.',
    },
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
      eyebrow: 'MAINNET YIELD',
      bodyPrefix: 'On testnet the vault holds plain USDC. On mainnet the same stake routes through',
      bodyMiddle: 'and earns roughly',
      bodySuffix: 'APY while it builds your reputation.',
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
    errorStates: {
      privateEyebrow: 'PRIVATE DEAL',
      privateTitle: 'This deal is private',
      privateBody: 'Only its buyer and seller can see this deal. No one else sees what happens between two parties.',
      privateCta: 'Browse the market',
      notFoundEyebrow: 'DEAL NOT FOUND',
      notFoundTitle: 'We could not load this deal',
      notFoundBody: 'The link may be wrong, or your wallet may not be a party.',
      notFoundCta: 'Back to buyer desk',
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
      cardLabel: 'Funding · 1.5% fee, split evenly',
      buyerFunds: 'Buyer funds',
      sellerReceives: 'Seller receives',
      platformFee: 'Platform fee',
      onDeliveryTemplate: 'On delivery · {pct}%',
      onVerificationTemplate: 'On verification · {pct}%',
      protectedEyebrow: 'PROTECTED',
    },
    fundingSafety: {
      settled: 'Settled on chain. The escrow paid out in full.',
      awaitingAcceptanceBuyer: 'When the seller accepts, your payment locks in escrow on Arc. Released only as milestones clear, only when you say so.',
      awaitingAcceptanceSeller: "Accept and the buyer's payment locks in escrow on Arc. It becomes yours as you deliver.",
      activeBuyer: 'Your payment is locked in escrow on Arc. The seller is paid only as milestones clear, and only when you release.',
      activeSeller: "The buyer's payment is locked in escrow on Arc. It becomes yours as milestones clear. No one can pull it back on a whim.",
    },
    terms: {
      eyebrow: 'TERMS',
      title: 'The agreement',
      deadlineTemplate: 'Deadline {when}',
      noDeadline: 'No delivery deadline',
      deliveryProofLabel: 'Delivery proof',
    },
    progress: {
      eyebrow: 'PROGRESS',
      titleLead: 'Where this deal',
      titleAccent: 'stands',
    },
    progressTrack: {
      opened: 'Deal opened',
      accepted: 'Seller accepted · escrow funded',
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
        cashoutTemplate: 'Cash out {amount} USDC →',
      },
      cancelled: {
        preAccept: 'Cancelled. The buyer withdrew before the seller accepted, so no escrow was funded.',
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
        refundBodyWithReservation: 'Unreleased escrow returns to the buyer. Reserved stake slashes to the buyer too.',
        releaseLabel: 'Release to seller.',
        releaseBody: 'The seller is paid the full escrow.',
      },
      awaitingAcceptance: {
        sellerIntro: 'Review terms and the funding split. Accepting agrees to deliver on these terms and funds the escrow.',
        trustedMatchPrefix: 'Trusted match. You need',
        trustedMatchMiddleTemplate: 'free in your stake to accept ({pct}% of {amount}).',
        trustedMatchSuffix: 'It releases back when the deal settles, or slashes to the buyer if you lose a dispute.',
        acceptCta: 'Accept deal',
        acceptBusy: 'Confirming on Arc…',
        buyerWaiting: 'Waiting for the seller to accept. Nothing is funded yet. You can cancel anytime until they accept.',
        buyerWaitingInviteTemplate: 'Waiting for {email} to claim the invite link. Nothing is funded yet.',
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
        buyerHasDeadlineTail: 'If they miss the deadline, you can cancel and reclaim funds.',
        buyerDeadlinePassedNote: 'Deadline passed without delivery. Cancel to reclaim the full escrow.',
        reclaimCta: 'Cancel &amp; reclaim funds',
        reclaimBusy: 'Working…',
      },
      awaitingFirstRelease: {
        buyerIntroTemplate: 'Seller marked delivered. Release the first {firstPct}% now. The remaining {remainPct}% releases once you verify.',
        buyerAutoReleasePrefixTemplate: 'Auto-releases the first {firstPct}% in',
        buyerAutoReleaseSuffix: "if you don't act.",
        buyerExpiredTemplate: 'Release window passed. The agent will release the first {firstPct}% shortly unless you act now.',
        releaseCtaTemplate: 'Release first {firstPct}%',
        releaseBusy: 'Confirming on Arc…',
        appealCta: 'Appeal this deal',
        sellerWaitingTemplate: 'Delivered. Waiting for the buyer to release the first {firstPct}%.',
        sellerOpenPrefix: 'Buyer window:',
        sellerOpenSuffixTemplate: 'left. If it passes, the first {firstPct}% releases automatically.',
        sellerExpiredTemplate: 'Window passed. The agent will release the first {firstPct}% to you shortly.',
      },
      awaitingFinalRelease: {
        buyerIntroTemplate: 'First {firstPct}% released. Verify and release the remaining {rest}% to settle.',
        buyerResponseExpiredTemplate: 'Response window passed. The agent will auto-release the final {rest}% to the seller shortly.',
        buyerNoAppealTemplate: "Take your time. The final {rest}% never releases automatically. Click below to verify and release once you've checked the work. If you stall too long the seller can raise a delay appeal.",
        releaseCtaTemplate: 'Verify &amp; release final {rest}%',
        releaseBusy: 'Confirming on Arc…',
        appealCta: 'Appeal this deal',
        sellerWaitingTemplate: 'First {firstPct}% released. Waiting for the buyer to verify and release the final {rest}%.',
        sellerAppealOpenPrefix: 'Delay appeal raised. Buyer has',
        sellerAppealOpenSuffixTemplate: "to respond. If they don't, the final {rest}% auto-releases to you.",
        sellerResponseExpiredTemplate: 'Response window passed. The agent will release the final {rest}% to you shortly.',
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
        suffixTemplate: 'or the final {rest}% releases automatically.',
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
        openSellerSuffix: 'to accept before the deal auto-expires.',
        openBuyerPrefix: "Seller's window:",
        openBuyerSuffix: 'before the deal auto-expires (pre-accept, no rep hit).',
        expired: 'Acceptance window passed. The agent will mark this deal cancelled (pre-accept) on the next tick.',
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
      body: 'Accepting provisions a Circle agent wallet pair tied to your wallet. Buyer escrow funds against it. Your seller agent receives payouts. One-time setup.',
      confirmCta: 'Proceed &amp; accept',
      confirmBusy: 'Setting up your wallet…',
      cancelCta: 'Not now',
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
      acceptReleaseCta: 'Agree &amp; release',
      acceptRefundCta: 'Accept &amp; refund',
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
      kindRefundBuyerBodyWithReservation: 'Unreleased escrow returns to the buyer. Reserved stake slashes to the buyer too.',
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
      insufficientBalanceTitle: "Buyer agent doesn't have enough USDC on Arc.",
      insufficientBalanceBuyerPrefix: 'Top up the buyer agent from your profile, then the seller can accept.',
      insufficientBalanceBuyerLink: 'Fund agent',
      insufficientBalanceSeller: 'The buyer has been notified. Try accepting again once funded.',
      insufficientGas: "The buyer agent doesn't have enough native gas on Arc to send this transaction.",
      insufficientStakeTitle: "Your seller agent doesn't have enough free stake to backstop this deal.",
      insufficientStakeLink: 'Stake more',
      insufficientStakeSuffix: 'then return here to accept.',
      acceptEscrowFailedTitle: 'Could not accept the escrow on chain.',
    },
  },
  walletsPanel: {
    eyebrow: '[:YOUR WALLETS:]',
    headline: 'One account. Several wallets',
    intro: {
      circle: 'Created with your account. Funds settle into your identity wallet, then route to your agents. On Arc, USDC pays the gas, so only the bridge wallet holds ETH.',
      web3: 'Your connected wallet is your identity. Karwan provisions the agent and bridge wallets it runs for you, funded from it. On Arc, USDC pays the gas, so only the bridge wallet holds ETH.',
    },
    rows: {
      identity: {
        tag: 'IDENTITY',
        title: 'Identity wallet',
        purposeCircle: 'Your account wallet on Arc, funded at sign-up. The hub every other wallet draws from.',
        purposeWeb3: 'Your connected wallet, serving as your Arc identity. Fund the agents from here.',
      },
      buyer: {
        tag: 'BUYER AGENT',
        title: 'Buyer agent',
        purpose: 'Escrows USDC for the deals you buy. Top up under Agent treasury.',
      },
      seller: {
        tag: 'SELLER AGENT',
        title: 'Seller agent',
        purpose: 'Covers the Arc gas to accept and deliver on the deals you sell. Top up under Agent treasury.',
      },
      bridge: {
        tag: 'BRIDGE WALLET',
        title: 'Bridge wallet',
        purpose: 'Imports USDC from Base or Ethereum. It settles on that chain, so it holds ETH for gas, not Arc USDC.',
        gasSecondaryTemplate: '{amount} ETH gas',
      },
    },
    agentsNotCreated: '[:AGENTS NOT CREATED:] Activate to provision your buyer and seller agents.',
    faucetButton: {
      idle: 'Get USDC',
      busy: 'Opening',
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
      eyebrow: 'FUND AGENT',
      title: 'Top up on Arc',
      subtitleCircle: 'One click · backend signs',
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
      signInToFund: 'Sign in to fund',
      switchingToArc: 'Switching to Arc...',
      transferInProgress: 'Transfer in progress...',
      switchToArc: 'Switch to Arc',
      sendToTemplate: 'Send to {label}',
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
      recipient: 'Recipient',
      txArc: 'Tx · Arc',
      stuckNote: 'This transfer has not confirmed in a while. Likely a dropped tx. Retry to send a fresh one, or dismiss it.',
      retry: 'Retry',
      dismiss: 'Dismiss',
    },
  },
  landingPage: {
    tabs: { overview: 'OVERVIEW', howItWorks: 'WORKFLOW SUMMARY', flow: 'FLOW', getStarted: 'GET STARTED' },
    hero: {
      tag: 'SETTLEMENT NETWORK',
      titleLine1: 'Agree. Escrow.',
      titleLine2: 'Deliver.',
      titleAccent: 'Settle.',
      body: 'On-chain settlement rails for cross-border SME trade. USDC sits in milestone escrow on Arc. Releases as the work lands.',
      ctaPrimary: 'Launch app ↓',
      ctaSecondary: 'How it works →',
      footnote: 'Free on Arc Testnet. No mainnet funds.',
    },
    ecosystem: { tag: 'BUILT ON' },
    directDeals: {
      tag: 'DIRECT DEALS',
      title: 'Bring your own counterparty.',
      body: 'You already agreed off-platform. Name the wallet, set the amount, fund the escrow. No auction.',
      tile1Title: 'Name the wallet',
      tile1Body: 'Point the escrow at your counterparty. They sign in with that wallet, accept the terms, and deliver.',
      tile2Title: 'Release in tranches',
      tile2Body: 'A slice releases on delivery, the rest once you verify. A review window auto-releases if you go quiet.',
    },
    managedDeals: {
      tag: 'MANAGED DEALS',
      title: 'Or let an agent find one.',
      body: 'Post the request. Your agent watches the marketplace and surfaces matches. You approve, escrow funds, milestones release.',
      tile1Title: 'Agents negotiate',
      tile1Body: 'Buyer and seller agents bid and counter on chain, on their own, inside the ranges you set in your profile.',
      tile2Title: 'Escrow on acceptance',
      tile2Body: 'When terms land, the buyer agent funds the milestone escrow. Releases follow the same spine as a direct deal.',
    },
    howItWorks: {
      tag: 'THE RAILS',
      titleStart: 'Three rails.',
      titleAccent: 'One',
      titleEnd: 'deal.',
      rail1Title: 'Escrow in USDC',
      rail1Body: 'Funds settle in milestone tranches on Arc. The chain holds the math.',
      rail2Title: 'Milestone release',
      rail2Body: 'Releases trigger on signed delivery. Disputes route to human review, never to silence.',
      rail3Title: 'On-chain proof',
      rail3Body: 'Every state change emits an event. Audit, reputation, payouts read the same source.',
    },
    flow: {
      tag: 'FLOW',
      title: 'A deal, end to end.',
      liveLabel: 'LIVE ON ARC TESTNET',
      steps: {
        posted: { tag: 'POSTED', label: 'Request on chain' },
        bids: { tag: 'BIDS', label: 'Agents bid &amp; counter' },
        accept: { tag: 'ACCEPT', label: 'Buyer signs match' },
        escrow: { tag: 'ESCROW', label: 'USDC funded' },
        deliver: { tag: 'DELIVER', label: 'Seller marks delivered' },
        settle: { tag: 'SETTLE', label: 'Milestones release' },
      },
      kpis: {
        avgSettleLabel: 'AVG SETTLE',
        avgSettleUnit: 'MIN',
        inFlightLabel: 'USDC IN FLIGHT',
        inFlightUnit: 'M',
        uptimeLabel: 'UPTIME',
      },
    },
    tradeLanes: {
      tag: 'TRADE LANES',
      titleStart: 'The corridors, by',
      titleAccent: 'volume',
      titleEnd: '.',
      footnote: '24h on-chain. Rolling. Every lane settles on Arc.',
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
      tag: 'EARLY TRADES',
      title: "What's landing on the rail.",
      cards: {
        buyerLagos: { role: 'BUYER', city: 'LAGOS', title: 'Settled a Dubai logistics invoice in 4 minutes', unit: 'USDC', sub: 'paid in 3 milestones' },
        sellerNairobi: { role: 'SELLER', city: 'NAIROBI', title: 'Agent bid 14 requests while I slept, won 3', unit: 'WON', sub: 'zero manual touches' },
        buyerKarachi: { role: 'BUYER', city: 'KARACHI', title: 'Dispute window resolved with no chargeback', unit: 'DISPUTES', sub: 'last 90 days' },
      },
    },
    getStarted: {
      tag: 'GET STARTED',
      title: 'Three steps to a deal.',
      step1Title: 'Sign in',
      step1Body: 'Bring a web3 wallet or sign in with email &amp; passkey. Either way you get a Circle wallet. Your address is the key.',
      step2Title: 'Set your ranges',
      step2Body: 'Buyer side, set budget, deadlines, milestone splits. Seller side, set skills, range, response time. Your agents read these on every match.',
      step3Title: 'Stake to grow reputation',
      step3Body: 'Deposit USDC in the vault. The longer it sits, the more reputation you earn. On mainnet that same stake also earns yield through USYC. Withdrawals wait 7 days while the system runs fraud checks.',
    },
    finalCta: {
      tag: 'OPEN A DEAL',
      srLabel: 'Get started',
      title: 'Open your first deal in about a minute.',
      body: 'Direct or agent-run, your call. Every step is a real transaction on Arc Testnet.',
      ctaPrimary: 'Launch app ↓',
      ctaSecondary: 'Read how it works →',
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
      body: 'We upgraded our escrow and vault to v2.D. Anything you staked or any deal you funded on the previous contracts still belongs to you. This page lets you pull it out before the recovery window closes.',
      windowClosesIn: 'window closes in',
      afterWindowNote: '// AFTER THE WINDOW, THE LEGACY CONTRACTS STAY LIVE ON ARC AND CAN BE CALLED DIRECTLY VIA THE EXPLORER',
    },
    stake: {
      tag: 'LEGACY STAKE',
      title: 'Your stake',
      bodyBefore: 'Positions parked on the previous KarwanVault. Cool-down on this contract is 7 days. New deposits go to the v2.D vault. Visit',
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
      body: 'Direct off-ramp to NGN, KES, INR, AED and more. Powered by Circle.',
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
      identityWalletLabel: 'Identity wallet',
      identityWalletSub: 'Your main address',
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
      body: 'Deposit USDC into KarwanVault. The longer it sits, the more reputation it earns. On mainnet the same stake earns yield through Hashnote USYC.',
      buttonLabel: 'Log in to stake',
    },
    hero: {
      tag: 'STAKE',
      line1Prefix: 'Earn',
      line1Accent: 'reputation',
      line2Prefix: 'Earn',
      line2Accent: 'yield',
      body: 'Stake USDC. The longer it sits, the more reputation it earns. Withdraw any time. 7-day cool-down on the way out.',
      mainnetNote: '// ON MAINNET THIS STAKE ROUTES THROUGH HASHNOTE USYC FOR ~5% APY',
    },
    position: {
      reputation: 'Reputation',
      tier: 'Tier',
      toNextTemplate: 'To {tier}',
      status: 'Status',
      pts: 'pts',
      topTier: 'Top tier',
    },
    vault: { tag: 'YOUR STAKE', heading: 'Vault' },
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
    terminal: { expired: 'EXPIRED', ended: 'ENDED HERE' },
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
      inEscrow: { label: 'In escrow', hint: 'Locked &amp; safe' },
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
  balancesCard: {
    eyebrow: '[:HOLDINGS:]',
    signedOutBody: 'Sign in to see your USDC balances. Use the Log in pill in the nav.',
    title: 'USDC balances',
    chainCountTemplate: 'across {n} chains',
    refresh: 'Refresh',
    refreshing: 'Refreshing',
    tabs: {
      you: 'You',
      buyer: 'Buyer',
      seller: 'Seller',
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
      milestoneCaption: 'milestone escrow on Arc',
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
    intentWarning: {
      eyebrow: 'WAIT. IS THIS A REQUEST OR AN OFFER?',
      bodyStart: 'This reads like something you ',
      bodyOffer: 'offer',
      bodyMiddle: ', not something you ',
      bodyNeed: 'need',
      bodyAfter: '. Requests are for buyers; offers (posted from the seller desk) are for sellers. If you meant to sell a service, ',
      bodyLink: 'post an offer instead',
      bodyAfterLink: '. Click ',
      bodyButtonRef: 'Post on chain',
      bodyTail: ' again to post the request as-is.',
    },
    submit: {
      submittingShort: 'Submitting tx…',
      waitingArcTemplate: 'Waiting for Arc to confirm… {seconds}s',
      waitingCircleTemplate: 'Still waiting on Circle… {seconds}s',
      postOnChain: 'Post on chain',
      pendingHelper: 'Circle is broadcasting and confirming on Arc. Live job page opens when it lands.',
      feeCaption: '↳ tx fee paid in USDC',
    },
    errors: {
      insufficientBalanceTitle: 'Buyer agent short on USDC.',
      insufficientBalanceFallback: 'Buyer agent is short on USDC.',
      topUpCta: 'Top up via CCTP →',
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
      eyebrow: 'SEND OUT',
      title: 'Bridge from Arc',
      subtitle: 'CCTP V2 · gas sponsored',
    },
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
      addressInvalid: '• [:ERR:] not a valid address',
      submitTemplate: 'Send to {dest}',
    },
    activityEyebrow: 'ACTIVITY',
    dismissButton: 'Dismiss',
    srToRecipient: 'to {address}',
    phases: {
      burning: 'Burning on Arc',
      waitingAttestation: 'Waiting for attestation',
      mintingTemplate: 'Minting on {dest}',
      done: 'Sent',
      error: 'Failed',
      submitting: 'Submitting',
    },
  },
  onChainProof: {
    sectionTag: 'ON-CHAIN PROOF',
    headlinePrefix: 'Provable on ',
    headlineAccent: 'Arc',
    description: 'Every number below is read straight from the live contract events on Arc Testnet.',
    blockPrefix: 'Block',
    tiles: {
      escrowsFunded: { label: 'Escrows funded', hint: 'Deals locked on chain' },
      settledInFull: { label: 'Settled in full', hint: 'Buyer released, contract zeroed' },
      disputesOpened: { label: 'Disputes opened', hint: 'Either side raised the contract' },
      usdcFunded: { label: 'USDC funded', hint: 'Cumulative deal volume' },
      usdcReleased: { label: 'USDC released', hint: 'Milestones paid to sellers' },
      vaultDeposits: { label: 'Vault deposits', hint: 'Stake principal across positions' },
    },
    smallStats: {
      milestoneReleases: 'Milestone releases',
      reputationRecords: 'Reputation records',
      vaultClaims: 'Vault claims',
      feesCollected: 'Fees collected (USDC)',
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
      loading: 'Reading chain',
      error: 'Chain read failed',
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
      inlineSubtitle: 'OPEN ANY TO ACT',
      headline: 'Pending matches',
      body: "Open one to act. The seller accepts; the buyer's agent funds escrow automatically.",
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
    },
    chips: {
      acceptToFund: 'ACCEPT TO FUND',
      awaitingSeller: 'AWAITING SELLER',
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
      eyebrow: 'ONE-TIME GATE',
      title: 'Read this once. Then start.',
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
      wrongNetwork: 'Wrong network',
      networkTooltip: 'On {chain}. Tap to switch or manage.',
      fallbackChain: 'unknown network',
    },
    signInGate: {
      defaultTag: 'SIGN IN',
      heroTitle: 'Sign in to enter',
      pageTitle: 'Sign in to continue',
      heroBody: 'Karwan identifies you by a wallet. Pick one via an EVM connector or have Circle provision one for you. The rest of the app unlocks.',
      pageBody: 'This page is keyed to your wallet. Sign in once and every surface picks you up.',
      button: 'Sign in',
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
        signIn: 'Sign in to Karwan',
        askEmail: "What's your email?",
        welcomeBack: 'Welcome back',
        createAccount: 'Create your account',
        checkInbox: 'Check your inbox',
      },
      subtitle: {
        pickMethod: 'Karwan identifies you by a wallet. Pick a path. We provision the rest.',
        lookup: "We'll check if you already have an account and pick the right sign-in path.",
        signingInAs: 'Signing in as',
        creatingAccount: 'Your wallet is provisioned automatically.',
        codeSentTo: 'Code sent. Enter the 6 digits.',
      },
      pickMethod: {
        continueEmail: 'Continue with email',
        connectWallet: 'Connect a wallet',
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
