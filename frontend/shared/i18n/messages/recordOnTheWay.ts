/// The Karwan record setting itself up with a person's own transaction (view 27,
/// decisions 10 and 11): one line after it happened, and the receipt line for
/// someone whose deal did not count.
export interface RecordOnTheWayCopy {
  done: string;
  nudge: string;
  nudgeButton: string;
  /// The nudge on Home while the record is not on yet (owner notes, 3 Nov 2026).
  homeTitle: string;
  homeBody: string;
  homeButton: string;
}

export const recordOnTheWayCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', RecordOnTheWayCopy> = {
  en: {
    done: 'Your account is also set up for protected deals.',
    nudge: 'Count your next deals on your record.',
    nudgeButton: 'Count them',
    homeTitle: 'Turn on your record',
    homeBody: 'Every deal you finish counts. About a minute.',
    homeButton: 'Turn on',
  },
  fr: {
    done: 'Votre compte est aussi prêt pour les accords protégés.',
    nudge: 'Faites compter vos prochains accords dans votre historique.',
    nudgeButton: 'Les faire compter',
    homeTitle: 'Activez votre historique',
    homeBody: 'Chaque accord terminé compte. Une minute.',
    homeButton: 'Activer',
  },
  ar: {
    done: 'حسابك جاهز أيضًا للصفقات المحمية.',
    nudge: 'احتسب صفقاتك القادمة في سجلّك.',
    nudgeButton: 'احتسبها',
    homeTitle: 'فعّل سجلّك',
    homeBody: 'كل صفقة تُنهيها تُحتسب. دقيقة واحدة.',
    homeButton: 'فعّل',
  },
  hi: {
    done: 'आपका खाता सुरक्षित सौदों के लिए भी तैयार हो गया है।',
    nudge: 'अपने अगले सौदे अपने रिकॉर्ड में गिनवाएँ।',
    nudgeButton: 'गिनवाएँ',
    homeTitle: 'अपना रिकॉर्ड चालू करें',
    homeBody: 'हर पूरा सौदा गिना जाता है। एक मिनट।',
    homeButton: 'चालू करें',
  },
  sw: {
    done: 'Akaunti yako pia iko tayari kwa mikataba iliyolindwa.',
    nudge: 'Hesabu mikataba yako ijayo kwenye rekodi yako.',
    nudgeButton: 'Zihesabu',
    homeTitle: 'Washa rekodi yako',
    homeBody: 'Kila mpango unaomaliza unahesabiwa. Dakika moja.',
    homeButton: 'Washa',
  },
};
