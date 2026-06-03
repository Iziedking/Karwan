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
