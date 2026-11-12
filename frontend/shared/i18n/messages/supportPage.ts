/// Help and support in Profile (view 78): a help bot first, then a person,
/// and the person's own cases. Says "case", never "ticket".
export interface SupportPageCopy {
  title: string;
  intro: string;
  hours: string;
  askLabel: string;
  askPlaceholder: string;
  send: string;
  yourCases: string;
  noCases: string;
  states: { new: string; waiting_us: string; waiting_person: string; solved: string };
  kinds: { money_in_deal: string; transfer_missing: string; account: string; using_karwan: string; other: string };
  caseTitle: string;
  writeLabel: string;
  writePlaceholder: string;
  who: { person: string; teammate: string; bot: string; system: string };
  notFound: string;
  failed: string;
  profileRow: string;
  getHelp: string;
  aboutDeal: string;
  aboutTransfer: string;
}

export const supportPageCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', SupportPageCopy> = {
  en: {
    title: 'Help and support',
    intro: 'Ask a question or say what went wrong. A person from Karwan takes over when it needs one.',
    hours: 'People reply 8am to 10pm Lagos time, within 2 hours.',
    askLabel: 'Ask about Karwan or your account',
    askPlaceholder: 'Type your question',
    send: 'Send',
    yourCases: 'Your cases',
    noCases: 'No cases yet.',
    states: { new: 'Waiting for a reply', waiting_us: 'Waiting for a reply', waiting_person: 'Replied', solved: 'Solved' },
    kinds: { money_in_deal: 'Money held in a deal', transfer_missing: 'Transfer did not arrive', account: 'Account and sign-in', using_karwan: 'Using Karwan', other: 'Something else' },
    caseTitle: 'Case {ref}',
    writeLabel: 'Write to the team',
    writePlaceholder: 'Add anything that helps',
    who: { person: 'You', teammate: 'Karwan team', bot: 'Help bot', system: 'Karwan' },
    notFound: 'This case is not on your account.',
    failed: 'Not sent. Try again.',
    profileRow: 'Help and support',
    getHelp: 'Get help with this',
    aboutDeal: 'About my deal {ref}',
    aboutTransfer: 'About my transfer {ref}',
  },
  fr: {
    title: 'Aide et assistance',
    intro: 'Posez une question ou dites ce qui ne va pas. Une personne de Karwan prend le relais si besoin.',
    hours: 'Réponse de 8 h à 22 h, heure de Lagos, sous 2 heures.',
    askLabel: 'Une question sur Karwan ou votre compte',
    askPlaceholder: 'Écrivez votre question',
    send: 'Envoyer',
    yourCases: 'Vos demandes',
    noCases: 'Aucune demande pour le moment.',
    states: { new: 'En attente de réponse', waiting_us: 'En attente de réponse', waiting_person: 'Réponse reçue', solved: 'Résolue' },
    kinds: { money_in_deal: 'Argent bloqué dans un accord', transfer_missing: 'Transfert non arrivé', account: 'Compte et connexion', using_karwan: 'Utiliser Karwan', other: 'Autre chose' },
    caseTitle: 'Demande {ref}',
    writeLabel: "Écrire à l'équipe",
    writePlaceholder: 'Ajoutez ce qui peut aider',
    who: { person: 'Vous', teammate: 'Équipe Karwan', bot: "Robot d'aide", system: 'Karwan' },
    notFound: "Cette demande n'est pas sur votre compte.",
    failed: 'Non envoyé. Réessayez.',
    profileRow: 'Aide et assistance',
    getHelp: "Obtenir de l'aide",
    aboutDeal: 'À propos de mon accord {ref}',
    aboutTransfer: 'À propos de mon transfert {ref}',
  },
  ar: {
    title: 'المساعدة والدعم',
    intro: 'اطرح سؤالك أو أخبرنا بما حدث. يتولى شخص من Karwan الأمر عند الحاجة.',
    hours: 'يرد الفريق من 8 صباحًا إلى 10 مساءً بتوقيت لاغوس، خلال ساعتين.',
    askLabel: 'اسأل عن Karwan أو عن حسابك',
    askPlaceholder: 'اكتب سؤالك',
    send: 'إرسال',
    yourCases: 'طلباتك',
    noCases: 'لا توجد طلبات بعد.',
    states: { new: 'بانتظار الرد', waiting_us: 'بانتظار الرد', waiting_person: 'تم الرد', solved: 'تم الحل' },
    kinds: { money_in_deal: 'أموال محجوزة في صفقة', transfer_missing: 'لم يصل التحويل', account: 'الحساب وتسجيل الدخول', using_karwan: 'استخدام Karwan', other: 'أمر آخر' },
    caseTitle: 'الطلب {ref}',
    writeLabel: 'اكتب إلى الفريق',
    writePlaceholder: 'أضف ما قد يساعد',
    who: { person: 'أنت', teammate: 'فريق Karwan', bot: 'مساعد الدعم', system: 'Karwan' },
    notFound: 'هذا الطلب ليس في حسابك.',
    failed: 'لم يُرسل. حاول مرة أخرى.',
    profileRow: 'المساعدة والدعم',
    getHelp: 'احصل على مساعدة',
    aboutDeal: 'بخصوص صفقتي {ref}',
    aboutTransfer: 'بخصوص تحويلي {ref}',
  },
  hi: {
    title: 'मदद और सहायता',
    intro: 'सवाल पूछें या बताएं कि क्या गलत हुआ। ज़रूरत होने पर Karwan का कोई व्यक्ति आगे संभालता है।',
    hours: 'लागोस समय सुबह 8 से रात 10 बजे तक, 2 घंटे के भीतर जवाब।',
    askLabel: 'Karwan या अपने खाते के बारे में पूछें',
    askPlaceholder: 'अपना सवाल लिखें',
    send: 'भेजें',
    yourCases: 'आपके मामले',
    noCases: 'अभी कोई मामला नहीं।',
    states: { new: 'जवाब का इंतज़ार', waiting_us: 'जवाब का इंतज़ार', waiting_person: 'जवाब मिला', solved: 'हल हो गया' },
    kinds: { money_in_deal: 'डील में रुका पैसा', transfer_missing: 'ट्रांसफ़र नहीं पहुँचा', account: 'खाता और साइन-इन', using_karwan: 'Karwan का उपयोग', other: 'कुछ और' },
    caseTitle: 'मामला {ref}',
    writeLabel: 'टीम को लिखें',
    writePlaceholder: 'जो भी मदद करे, जोड़ें',
    who: { person: 'आप', teammate: 'Karwan टीम', bot: 'मदद बॉट', system: 'Karwan' },
    notFound: 'यह मामला आपके खाते में नहीं है।',
    failed: 'नहीं भेजा गया। फिर कोशिश करें।',
    profileRow: 'मदद और सहायता',
    getHelp: 'इसमें मदद लें',
    aboutDeal: 'मेरी डील {ref} के बारे में',
    aboutTransfer: 'मेरे ट्रांसफ़र {ref} के बारे में',
  },
  sw: {
    title: 'Msaada',
    intro: 'Uliza swali au eleza kilichoharibika. Mtu wa Karwan anachukua pale inapohitajika.',
    hours: 'Tunajibu saa 2 asubuhi hadi saa 4 usiku kwa saa za Lagos, ndani ya saa 2.',
    askLabel: 'Uliza kuhusu Karwan au akaunti yako',
    askPlaceholder: 'Andika swali lako',
    send: 'Tuma',
    yourCases: 'Kesi zako',
    noCases: 'Bado hakuna kesi.',
    states: { new: 'Inasubiri jibu', waiting_us: 'Inasubiri jibu', waiting_person: 'Imejibiwa', solved: 'Imetatuliwa' },
    kinds: { money_in_deal: 'Pesa iliyoshikiliwa kwenye mpango', transfer_missing: 'Uhamisho haujafika', account: 'Akaunti na kuingia', using_karwan: 'Kutumia Karwan', other: 'Kitu kingine' },
    caseTitle: 'Kesi {ref}',
    writeLabel: 'Andikia timu',
    writePlaceholder: 'Ongeza chochote kinachosaidia',
    who: { person: 'Wewe', teammate: 'Timu ya Karwan', bot: 'Roboti ya msaada', system: 'Karwan' },
    notFound: 'Kesi hii haipo kwenye akaunti yako.',
    failed: 'Haikutumwa. Jaribu tena.',
    profileRow: 'Msaada',
    getHelp: 'Pata msaada kuhusu hili',
    aboutDeal: 'Kuhusu mpango wangu {ref}',
    aboutTransfer: 'Kuhusu uhamisho wangu {ref}',
  },
};
