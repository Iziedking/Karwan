/// The pages under Profile (docs/architecture/83-profile-in-order.md):
/// sign-in and security in one page, where we reach you, and the parts of
/// Your agent.
export interface ProfilePagesCopy {
  security: {
    /// The row on Profile and the page title.
    title: string;
    howYouSignIn: string;
    email: string;
    wallet: string;
    signedInNow: string;
    passkeyOn: string;
    passkeyOff: string;
  };
  reach: { title: string; whatWeTell: string };
  agent: { doesForYou: string; reaches: string; itsMoney: string; agentMoney: string };
}

export const profilePagesCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', ProfilePagesCopy> = {
  en: {
    security: { title: 'Sign-in and security', howYouSignIn: 'How you sign in', email: 'Email', wallet: 'Wallet', signedInNow: 'Signed in now', passkeyOn: 'Passkey on', passkeyOff: 'No passkey' },
    reach: { title: 'Where we reach you', whatWeTell: 'What we tell you about' },
    agent: { doesForYou: 'What it does for you', reaches: 'Who it reaches', itsMoney: 'Its money', agentMoney: 'Agent money' },
  },
  fr: {
    security: { title: 'Connexion et sécurité', howYouSignIn: 'Comment vous vous connectez', email: 'E-mail', wallet: 'Portefeuille', signedInNow: 'Connecté en ce moment', passkeyOn: 'Clé d’accès activée', passkeyOff: 'Pas de clé d’accès' },
    reach: { title: 'Où nous vous joignons', whatWeTell: 'Ce que nous vous signalons' },
    agent: { doesForYou: 'Ce qu’il fait pour vous', reaches: 'Qui il contacte', itsMoney: 'Son argent', agentMoney: 'Argent de l’agent' },
  },
  ar: {
    security: { title: 'تسجيل الدخول والأمان', howYouSignIn: 'كيف تسجّل الدخول', email: 'البريد الإلكتروني', wallet: 'المحفظة', signedInNow: 'مسجّل الدخول الآن', passkeyOn: 'مفتاح المرور مفعّل', passkeyOff: 'لا يوجد مفتاح مرور' },
    reach: { title: 'أين نتواصل معك', whatWeTell: 'ما نخبرك به' },
    agent: { doesForYou: 'ما يفعله لك', reaches: 'من يتواصل معهم', itsMoney: 'ماله', agentMoney: 'مال الوكيل' },
  },
  hi: {
    security: { title: 'साइन-इन और सुरक्षा', howYouSignIn: 'आप कैसे साइन इन करते हैं', email: 'ईमेल', wallet: 'वॉलेट', signedInNow: 'अभी साइन इन', passkeyOn: 'पासकी चालू', passkeyOff: 'कोई पासकी नहीं' },
    reach: { title: 'हम आप तक कहाँ पहुँचते हैं', whatWeTell: 'हम आपको किस बारे में बताते हैं' },
    agent: { doesForYou: 'यह आपके लिए क्या करता है', reaches: 'यह किन तक पहुँचता है', itsMoney: 'इसका पैसा', agentMoney: 'एजेंट का पैसा' },
  },
  sw: {
    security: { title: 'Kuingia na usalama', howYouSignIn: 'Jinsi unavyoingia', email: 'Barua pepe', wallet: 'Pochi', signedInNow: 'Umeingia sasa', passkeyOn: 'Passkey imewashwa', passkeyOff: 'Hakuna passkey' },
    reach: { title: 'Tunapokufikia', whatWeTell: 'Tunachokuambia' },
    agent: { doesForYou: 'Anachokufanyia', reaches: 'Anaowafikia', itsMoney: 'Pesa zake', agentMoney: 'Pesa za wakala' },
  },
};

export function profilePagesFor(locale: string): ProfilePagesCopy {
  return profilePagesCopy[locale as keyof typeof profilePagesCopy] ?? profilePagesCopy.en;
}
