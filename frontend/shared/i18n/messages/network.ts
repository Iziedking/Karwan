export interface NetworkCopy {
  builtOnArc: string;
  poweredByArc: string;
  details: string;
  settlementNetwork: string;
  environment: string;
  testnet: string;
  mainnet: string;
  unknown: string;
  testnetNotice: string;
  mainnetNotice: string;
  unknownNotice: string;
  chainId: string;
  explorer: string;
  faucet: string;
}

export const networkCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', NetworkCopy> = {
  en: {
    builtOnArc: 'Built on Arc', poweredByArc: 'Powered by Arc', details: 'Network details',
    settlementNetwork: 'Settlement network', environment: 'Environment',
    testnet: 'Testnet', mainnet: 'Mainnet', unknown: 'Unverified',
    testnetNotice: 'This environment uses test USDC with no real monetary value. Do not send real funds to testnet addresses.',
    mainnetNotice: 'This environment uses real USDC. Check the network, token and recipient before confirming a transfer.',
    unknownNotice: 'The network environment could not be verified. Do not send funds until the network details are confirmed.',
    chainId: 'Chain ID', explorer: 'Arc explorer', faucet: 'Get test USDC',
  },
  ar: {
    builtOnArc: 'مبني على Arc', poweredByArc: 'بدعم من Arc', details: 'تفاصيل الشبكة',
    settlementNetwork: 'شبكة التسوية', environment: 'البيئة',
    testnet: 'شبكة الاختبار', mainnet: 'الشبكة الرئيسية', unknown: 'غير مؤكدة',
    testnetNotice: 'تستخدم هذه البيئة USDC تجريبية بلا قيمة مالية حقيقية. لا ترسل أموالاً حقيقية إلى عناوين شبكة الاختبار.',
    mainnetNotice: 'تستخدم هذه البيئة USDC حقيقية. تحقق من الشبكة والعملة والمستلم قبل تأكيد التحويل.',
    unknownNotice: 'تعذر التحقق من بيئة الشبكة. لا ترسل أموالاً حتى تتأكد من تفاصيل الشبكة.',
    chainId: 'معرّف الشبكة', explorer: 'مستكشف Arc', faucet: 'احصل على USDC تجريبية',
  },
  fr: {
    builtOnArc: 'Construit sur Arc', poweredByArc: 'Propulsé par Arc', details: 'Détails du réseau',
    settlementNetwork: 'Réseau de règlement', environment: 'Environnement',
    testnet: 'Réseau de test', mainnet: 'Réseau principal', unknown: 'Non vérifié',
    testnetNotice: 'Cet environnement utilise des USDC de test sans valeur monétaire réelle. N’envoyez pas de fonds réels aux adresses du réseau de test.',
    mainnetNotice: 'Cet environnement utilise de vrais USDC. Vérifiez le réseau, le jeton et le destinataire avant de confirmer un transfert.',
    unknownNotice: 'L’environnement réseau n’a pas pu être vérifié. N’envoyez pas de fonds avant de confirmer les détails du réseau.',
    chainId: 'Identifiant de chaîne', explorer: 'Explorateur Arc', faucet: 'Obtenir des USDC de test',
  },
  hi: {
    builtOnArc: 'Arc पर निर्मित', poweredByArc: 'Arc द्वारा संचालित', details: 'नेटवर्क विवरण',
    settlementNetwork: 'निपटान नेटवर्क', environment: 'परिवेश',
    testnet: 'टेस्टनेट', mainnet: 'मेननेट', unknown: 'अपुष्ट',
    testnetNotice: 'इस परिवेश में परीक्षण USDC का उपयोग होता है, जिसका कोई वास्तविक मौद्रिक मूल्य नहीं है। टेस्टनेट पतों पर वास्तविक धन न भेजें।',
    mainnetNotice: 'इस परिवेश में वास्तविक USDC का उपयोग होता है। हस्तांतरण की पुष्टि करने से पहले नेटवर्क, टोकन और प्राप्तकर्ता जाँचें।',
    unknownNotice: 'नेटवर्क परिवेश की पुष्टि नहीं हो सकी। नेटवर्क विवरण की पुष्टि होने तक धन न भेजें।',
    chainId: 'चेन आईडी', explorer: 'Arc एक्सप्लोरर', faucet: 'परीक्षण USDC प्राप्त करें',
  },
  sw: {
    builtOnArc: 'Imejengwa kwenye Arc', poweredByArc: 'Inaendeshwa na Arc', details: 'Maelezo ya mtandao',
    settlementNetwork: 'Mtandao wa malipo', environment: 'Mazingira',
    testnet: 'Mtandao wa majaribio', mainnet: 'Mtandao mkuu', unknown: 'Haijathibitishwa',
    testnetNotice: 'Mazingira haya yanatumia USDC ya majaribio isiyo na thamani halisi ya fedha. Usitume fedha halisi kwenye anwani za mtandao wa majaribio.',
    mainnetNotice: 'Mazingira haya yanatumia USDC halisi. Hakiki mtandao, tokeni na mpokeaji kabla ya kuthibitisha uhamisho.',
    unknownNotice: 'Mazingira ya mtandao hayajaweza kuthibitishwa. Usitume fedha hadi maelezo ya mtandao yathibitishwe.',
    chainId: 'Kitambulisho cha mnyororo', explorer: 'Kichunguzi cha Arc', faucet: 'Pata USDC ya majaribio',
  },
};
