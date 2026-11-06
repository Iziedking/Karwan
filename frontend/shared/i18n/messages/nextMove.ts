/// The next-move nudge (view 57): one line and one button per move.
/// {amount} is said in the person's currency, {days} and {count} are numbers.

export type NextMoveCopyKind =
  | 'dispute_statement'
  | 'approve_delivery'
  | 'answer_cancel'
  | 'answer_extension'
  | 'take_back'
  | 'fund_deal'
  | 'approve_match'
  | 'agree_terms'
  | 'choose_offer'
  | 'deliver_soon'
  | 'add_money'
  | 'first_post';

export interface NextMoveCopy {
  moves: Record<NextMoveCopyKind, { line: string; action: string }>;
  /// For "1 day" and "1 offer".
  deliverSoonOne: string;
  chooseOfferOne: string;
  close: string;
  label: string;
}

const en: NextMoveCopy = {
  moves: {
    dispute_statement: { line: 'A dispute needs your side of the story.', action: 'Add your statement' },
    approve_delivery: { line: 'Delivery is in for your {amount} deal. Check it and approve.', action: 'Check delivery' },
    answer_cancel: { line: 'The other side asked to cancel a deal.', action: 'Answer' },
    answer_extension: { line: 'The seller asked for more time.', action: 'Answer' },
    take_back: { line: 'The delivery date passed with nothing delivered.', action: 'See options' },
    fund_deal: { line: 'The seller agreed. Fund your {amount} deal to start it.', action: 'Review and fund' },
    approve_match: { line: 'Your agent found a match at {amount}. Approve or decline.', action: 'See the match' },
    agree_terms: { line: 'A buyer sent you a {amount} deal. Agree to start it.', action: 'See the deal' },
    choose_offer: { line: '{count} offers came in on your request.', action: 'Compare offers' },
    deliver_soon: { line: 'Your {amount} deal is due in {days} days.', action: 'Deliver' },
    add_money: { line: 'Add money so a deal can start.', action: 'Add money' },
    first_post: { line: 'Tell us what you need, or what you sell.', action: 'Start' },
  },
  deliverSoonOne: 'Your {amount} deal is due tomorrow.',
  chooseOfferOne: 'An offer came in on your request.',
  close: 'Close',
  label: 'Your next move',
};

const fr: NextMoveCopy = {
  moves: {
    dispute_statement: { line: 'Un litige attend votre version des faits.', action: 'Ajouter ma version' },
    approve_delivery: { line: 'La livraison de votre affaire de {amount} est arrivée. Vérifiez et approuvez.', action: 'Vérifier' },
    answer_cancel: { line: "L'autre partie demande d'annuler une affaire.", action: 'Répondre' },
    answer_extension: { line: 'Le vendeur demande plus de temps.', action: 'Répondre' },
    take_back: { line: 'La date de livraison est passée sans livraison.', action: 'Voir les options' },
    fund_deal: { line: "Le vendeur a accepté. Financez votre affaire de {amount} pour la lancer.", action: 'Vérifier et financer' },
    approve_match: { line: 'Votre agent a trouvé une offre à {amount}. Acceptez ou refusez.', action: "Voir l'offre" },
    agree_terms: { line: 'Un acheteur vous propose une affaire de {amount}. Acceptez pour commencer.', action: "Voir l'affaire" },
    choose_offer: { line: '{count} offres sont arrivées sur votre demande.', action: 'Comparer' },
    deliver_soon: { line: 'Votre affaire de {amount} est due dans {days} jours.', action: 'Livrer' },
    add_money: { line: "Ajoutez de l'argent pour qu'une affaire puisse commencer.", action: "Ajouter de l'argent" },
    first_post: { line: 'Dites-nous ce que vous cherchez, ou ce que vous vendez.', action: 'Commencer' },
  },
  deliverSoonOne: 'Votre affaire de {amount} est due demain.',
  chooseOfferOne: 'Une offre est arrivée sur votre demande.',
  close: 'Fermer',
  label: 'Votre prochaine étape',
};

const ar: NextMoveCopy = {
  moves: {
    dispute_statement: { line: 'نزاع ينتظر روايتك.', action: 'أضف روايتك' },
    approve_delivery: { line: 'وصل تسليم صفقتك بقيمة {amount}. راجعه ووافق.', action: 'راجع التسليم' },
    answer_cancel: { line: 'الطرف الآخر طلب إلغاء صفقة.', action: 'رد' },
    answer_extension: { line: 'البائع طلب وقتًا إضافيًا.', action: 'رد' },
    take_back: { line: 'مر موعد التسليم ولم يُسلَّم شيء.', action: 'اعرض الخيارات' },
    fund_deal: { line: 'وافق البائع. موّل صفقتك بقيمة {amount} لتبدأ.', action: 'راجع وموّل' },
    approve_match: { line: 'وجد وكيلك عرضًا بقيمة {amount}. وافق أو ارفض.', action: 'اعرض العرض' },
    agree_terms: { line: 'أرسل لك مشترٍ صفقة بقيمة {amount}. وافق لتبدأ.', action: 'اعرض الصفقة' },
    choose_offer: { line: 'وصلت {count} عروض على طلبك.', action: 'قارن العروض' },
    deliver_soon: { line: 'موعد صفقتك بقيمة {amount} بعد {days} أيام.', action: 'سلّم' },
    add_money: { line: 'أضف مالًا لتبدأ صفقة.', action: 'أضف مالًا' },
    first_post: { line: 'أخبرنا بما تحتاجه أو بما تبيعه.', action: 'ابدأ' },
  },
  deliverSoonOne: 'موعد صفقتك بقيمة {amount} غدًا.',
  chooseOfferOne: 'وصل عرض على طلبك.',
  close: 'إغلاق',
  label: 'خطوتك التالية',
};

const hi: NextMoveCopy = {
  moves: {
    dispute_statement: { line: 'एक विवाद में आपका पक्ष चाहिए।', action: 'अपना पक्ष लिखें' },
    approve_delivery: { line: 'आपकी {amount} की डील की डिलीवरी आ गई है। जाँचें और मंज़ूर करें।', action: 'डिलीवरी देखें' },
    answer_cancel: { line: 'दूसरी तरफ़ ने एक डील रद्द करने को कहा है।', action: 'जवाब दें' },
    answer_extension: { line: 'विक्रेता ने और समय माँगा है।', action: 'जवाब दें' },
    take_back: { line: 'डिलीवरी की तारीख़ निकल गई और कुछ नहीं आया।', action: 'विकल्प देखें' },
    fund_deal: { line: 'विक्रेता मान गया। शुरू करने के लिए अपनी {amount} की डील में पैसे डालें।', action: 'देखें और पैसे डालें' },
    approve_match: { line: 'आपके एजेंट को {amount} पर एक मैच मिला। मंज़ूर करें या मना करें।', action: 'मैच देखें' },
    agree_terms: { line: 'एक खरीदार ने आपको {amount} की डील भेजी है। शुरू करने के लिए मानें।', action: 'डील देखें' },
    choose_offer: { line: 'आपकी माँग पर {count} ऑफ़र आए हैं।', action: 'ऑफ़र मिलाएँ' },
    deliver_soon: { line: 'आपकी {amount} की डील {days} दिन में देनी है।', action: 'डिलीवर करें' },
    add_money: { line: 'पैसे जोड़ें ताकि डील शुरू हो सके।', action: 'पैसे जोड़ें' },
    first_post: { line: 'बताइए आपको क्या चाहिए, या आप क्या बेचते हैं।', action: 'शुरू करें' },
  },
  deliverSoonOne: 'आपकी {amount} की डील कल देनी है।',
  chooseOfferOne: 'आपकी माँग पर एक ऑफ़र आया है।',
  close: 'बंद करें',
  label: 'आपका अगला कदम',
};

const sw: NextMoveCopy = {
  moves: {
    dispute_statement: { line: 'Mzozo unasubiri upande wako wa hadithi.', action: 'Ongeza maelezo yako' },
    approve_delivery: { line: 'Bidhaa za mpango wako wa {amount} zimefika. Kagua na uidhinishe.', action: 'Kagua' },
    answer_cancel: { line: 'Upande mwingine umeomba kughairi mpango.', action: 'Jibu' },
    answer_extension: { line: 'Muuzaji ameomba muda zaidi.', action: 'Jibu' },
    take_back: { line: 'Tarehe ya kuwasilisha imepita bila chochote.', action: 'Ona chaguo' },
    fund_deal: { line: 'Muuzaji amekubali. Weka pesa kwenye mpango wako wa {amount} ili uanze.', action: 'Kagua na uweke pesa' },
    approve_match: { line: 'Wakala wako amepata mechi kwa {amount}. Kubali au kataa.', action: 'Ona mechi' },
    agree_terms: { line: 'Mnunuzi amekutumia mpango wa {amount}. Kubali ili uanze.', action: 'Ona mpango' },
    choose_offer: { line: 'Ofa {count} zimefika kwenye ombi lako.', action: 'Linganisha ofa' },
    deliver_soon: { line: 'Mpango wako wa {amount} unatakiwa baada ya siku {days}.', action: 'Wasilisha' },
    add_money: { line: 'Ongeza pesa ili mpango uweze kuanza.', action: 'Ongeza pesa' },
    first_post: { line: 'Tuambie unachohitaji, au unachouza.', action: 'Anza' },
  },
  deliverSoonOne: 'Mpango wako wa {amount} unatakiwa kesho.',
  chooseOfferOne: 'Ofa imefika kwenye ombi lako.',
  close: 'Funga',
  label: 'Hatua yako inayofuata',
};

export const nextMoveCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', NextMoveCopy> = { en, ar, fr, hi, sw };
