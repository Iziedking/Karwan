/// The Karwan record setting itself up with a person's own transaction (view 27,
/// decisions 10 and 11): one line after it happened, and the receipt line for
/// someone whose deal did not count.
export interface RecordOnTheWayCopy {
  done: string;
  nudge: string;
  nudgeButton: string;
}

export const recordOnTheWayCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', RecordOnTheWayCopy> = {
  en: {
    done: 'Your account is also set up for protected deals.',
    nudge: 'Count your next deals on your record.',
    nudgeButton: 'Count them',
  },
  fr: {
    done: 'Votre compte est aussi prêt pour les accords protégés.',
    nudge: 'Faites compter vos prochains accords dans votre historique.',
    nudgeButton: 'Les faire compter',
  },
  ar: {
    done: 'حسابك جاهز أيضًا للصفقات المحمية.',
    nudge: 'احتسب صفقاتك القادمة في سجلّك.',
    nudgeButton: 'احتسبها',
  },
  hi: {
    done: 'आपका खाता सुरक्षित सौदों के लिए भी तैयार हो गया है।',
    nudge: 'अपने अगले सौदे अपने रिकॉर्ड में गिनवाएँ।',
    nudgeButton: 'गिनवाएँ',
  },
  sw: {
    done: 'Akaunti yako pia iko tayari kwa mikataba iliyolindwa.',
    nudge: 'Hesabu mikataba yako ijayo kwenye rekodi yako.',
    nudgeButton: 'Zihesabu',
  },
};
