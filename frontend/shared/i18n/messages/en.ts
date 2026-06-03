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
      logIn: 'Log in',
      wrongNetwork: 'Wrong network',
      networkTooltip: 'On {chain}. Tap to switch or manage.',
      fallbackChain: 'unknown network',
    },
    signInGate: {
      defaultTag: 'SIGN IN',
      heroTitle: 'Log in to enter',
      pageTitle: 'Sign in to continue',
      heroBody: 'Karwan identifies you by a wallet. Pick one via an EVM connector or have Circle provision one for you. The rest of the app unlocks.',
      pageBody: 'This page is keyed to your wallet. Sign in once and every surface picks you up.',
      button: 'Log in',
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
