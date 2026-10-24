/// Sharing the full passport (view 29): the owner's share panel and what the
/// person who opens the link sees.
export interface PassportShareCopy {
  open: string;
  who: string;
  person: string;
  anyone: string;
  tag: string;
  howLong: string;
  day: string;
  week: string;
  create: string;
  creating: string;
  ready: string;
  readyPerson: string;
  copy: string;
  copied: string;
  send: string;
  live: string;
  anyoneRow: string;
  until: string;
  openedNone: string;
  openedOne: string;
  opened: string;
  stop: string;
  failed: string;
  needTag: string;
  sharedBy: string;
  ended: string;
  breadthOne: string;
  breadth: string;
}

const en: PassportShareCopy = {
  open: 'Share full record',
  who: 'Who can open it',
  person: 'One person',
  anyone: 'Anyone with the link',
  tag: 'Their Karwan tag',
  howLong: 'For how long',
  day: '24 hours',
  week: '7 days',
  create: 'Create link',
  creating: 'Creating',
  ready: 'Send this link. It shows everything on this page until {date}.',
  readyPerson: 'Only {tag} can open it, signed in, until {date}.',
  copy: 'Copy link',
  copied: 'Copied',
  send: 'Send',
  live: 'Shared now',
  anyoneRow: 'Anyone with the link',
  until: 'until {date}',
  openedNone: 'Not opened yet',
  openedOne: 'Opened once',
  opened: 'Opened {n} times',
  stop: 'Stop sharing',
  failed: 'The link could not be made. Try again.',
  needTag: 'Enter their Karwan tag.',
  sharedBy: 'Shared by {who} until {date}',
  ended: 'This share has ended, so you see the public passport.',
  breadthOne: 'Deals so far are with 1 person, so they count for {pct}% of their full value.',
  breadth: 'Deals so far are with {n} different people, so they count for {pct}% of their full value.',
};

const fr: PassportShareCopy = {
  open: 'Partager le dossier complet',
  who: 'Qui peut l’ouvrir',
  person: 'Une personne',
  anyone: 'Toute personne ayant le lien',
  tag: 'Son identifiant Karwan',
  howLong: 'Pendant combien de temps',
  day: '24 heures',
  week: '7 jours',
  create: 'Créer le lien',
  creating: 'Création',
  ready: 'Envoyez ce lien. Il montre toute cette page jusqu’au {date}.',
  readyPerson: 'Seul {tag} peut l’ouvrir, connecté, jusqu’au {date}.',
  copy: 'Copier le lien',
  copied: 'Copié',
  send: 'Envoyer',
  live: 'Partagé en ce moment',
  anyoneRow: 'Toute personne ayant le lien',
  until: 'jusqu’au {date}',
  openedNone: 'Pas encore ouvert',
  openedOne: 'Ouvert une fois',
  opened: 'Ouvert {n} fois',
  stop: 'Arrêter le partage',
  failed: 'Le lien n’a pas pu être créé. Réessayez.',
  needTag: 'Saisissez son identifiant Karwan.',
  sharedBy: 'Partagé par {who} jusqu’au {date}',
  ended: 'Ce partage est terminé, vous voyez donc le passeport public.',
  breadthOne: 'Les transactions sont avec 1 personne, elles comptent donc pour {pct} % de leur valeur.',
  breadth: 'Les transactions sont avec {n} personnes différentes, elles comptent donc pour {pct} % de leur valeur.',
};

const ar: PassportShareCopy = {
  open: 'مشاركة السجل الكامل',
  who: 'من يمكنه فتحه',
  person: 'شخص واحد',
  anyone: 'أي شخص لديه الرابط',
  tag: 'معرّفه على Karwan',
  howLong: 'لأي مدة',
  day: '24 ساعة',
  week: '7 أيام',
  create: 'إنشاء الرابط',
  creating: 'جارٍ الإنشاء',
  ready: 'أرسل هذا الرابط. يعرض كل ما في هذه الصفحة حتى {date}.',
  readyPerson: 'لا يفتحه إلا {tag} بعد تسجيل الدخول، حتى {date}.',
  copy: 'نسخ الرابط',
  copied: 'تم النسخ',
  send: 'إرسال',
  live: 'مُشارَك الآن',
  anyoneRow: 'أي شخص لديه الرابط',
  until: 'حتى {date}',
  openedNone: 'لم يُفتح بعد',
  openedOne: 'فُتح مرة واحدة',
  opened: 'فُتح {n} مرات',
  stop: 'إيقاف المشاركة',
  failed: 'تعذّر إنشاء الرابط. حاول مرة أخرى.',
  needTag: 'أدخل معرّفه على Karwan.',
  sharedBy: 'شاركه {who} حتى {date}',
  ended: 'انتهت هذه المشاركة، لذا ترى جواز السفر العام.',
  breadthOne: 'الصفقات حتى الآن مع شخص واحد، لذا تُحتسب بنسبة {pct}% من قيمتها الكاملة.',
  breadth: 'الصفقات حتى الآن مع {n} أشخاص مختلفين، لذا تُحتسب بنسبة {pct}% من قيمتها الكاملة.',
};

const hi: PassportShareCopy = {
  open: 'पूरा रिकॉर्ड साझा करें',
  who: 'इसे कौन खोल सकता है',
  person: 'एक व्यक्ति',
  anyone: 'लिंक वाला कोई भी',
  tag: 'उनका Karwan टैग',
  howLong: 'कितने समय के लिए',
  day: '24 घंटे',
  week: '7 दिन',
  create: 'लिंक बनाएँ',
  creating: 'बन रहा है',
  ready: 'यह लिंक भेजें। यह {date} तक इस पेज की हर चीज़ दिखाता है।',
  readyPerson: '{date} तक केवल {tag} साइन इन करके इसे खोल सकते हैं।',
  copy: 'लिंक कॉपी करें',
  copied: 'कॉपी हो गया',
  send: 'भेजें',
  live: 'अभी साझा',
  anyoneRow: 'लिंक वाला कोई भी',
  until: '{date} तक',
  openedNone: 'अभी तक नहीं खोला गया',
  openedOne: 'एक बार खोला गया',
  opened: '{n} बार खोला गया',
  stop: 'साझा करना बंद करें',
  failed: 'लिंक नहीं बन सका। फिर कोशिश करें।',
  needTag: 'उनका Karwan टैग डालें।',
  sharedBy: '{who} ने {date} तक साझा किया',
  ended: 'यह साझा करना खत्म हो गया है, इसलिए आप सार्वजनिक पासपोर्ट देख रहे हैं।',
  breadthOne: 'अब तक के सौदे 1 व्यक्ति से हैं, इसलिए वे अपने पूरे मूल्य का {pct}% गिने जाते हैं।',
  breadth: 'अब तक के सौदे {n} अलग-अलग लोगों से हैं, इसलिए वे अपने पूरे मूल्य का {pct}% गिने जाते हैं।',
};

const sw: PassportShareCopy = {
  open: 'Shiriki rekodi kamili',
  who: 'Nani anaweza kuifungua',
  person: 'Mtu mmoja',
  anyone: 'Yeyote mwenye kiungo',
  tag: 'Lebo yake ya Karwan',
  howLong: 'Kwa muda gani',
  day: 'Saa 24',
  week: 'Siku 7',
  create: 'Unda kiungo',
  creating: 'Inaunda',
  ready: 'Tuma kiungo hiki. Kinaonyesha kila kitu kwenye ukurasa huu hadi {date}.',
  readyPerson: 'Ni {tag} pekee anayeweza kukifungua, akiwa ameingia, hadi {date}.',
  copy: 'Nakili kiungo',
  copied: 'Imenakiliwa',
  send: 'Tuma',
  live: 'Kinashirikiwa sasa',
  anyoneRow: 'Yeyote mwenye kiungo',
  until: 'hadi {date}',
  openedNone: 'Bado hakijafunguliwa',
  openedOne: 'Kimefunguliwa mara moja',
  opened: 'Kimefunguliwa mara {n}',
  stop: 'Acha kushiriki',
  failed: 'Kiungo hakikuweza kuundwa. Jaribu tena.',
  needTag: 'Weka lebo yake ya Karwan.',
  sharedBy: 'Kimeshirikiwa na {who} hadi {date}',
  ended: 'Ushirikiano huu umekwisha, kwa hivyo unaona pasipoti ya umma.',
  breadthOne: 'Mikataba hadi sasa ni na mtu 1, kwa hivyo inahesabiwa {pct}% ya thamani yake kamili.',
  breadth: 'Mikataba hadi sasa ni na watu {n} tofauti, kwa hivyo inahesabiwa {pct}% ya thamani yake kamili.',
};

export const passportShareCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', PassportShareCopy> = { en, ar, fr, hi, sw };
