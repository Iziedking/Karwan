import type { DealRecordWay } from '../../../core/api';

/// A finished deal's signed record (view 94, Figma 382:570): on the deal page,
/// in the share sheet, and on the page a shared link opens.
export interface DealRecordCopy {
  title: string;
  /// Behind the (i): what the record is and who sees it.
  intro: string;
  agreed: string;
  held: string;
  confirmed: string;
  released: string;
  signed: string;
  agreedLine: string;
  bothOn: string;
  heldLine: string;
  stage: string;
  toYou: string;
  toSeller: string;
  backToYou: string;
  backToBuyer: string;
  fee: string;
  viewOnArc: string;
  signedBy: string;
  notRecorded: string;
  /// On the last payout's receipt.
  seeRecord: string;
  writing: string;
  share: string;
  sheetTitle: string;
  sheetLine: string;
  copy: string;
  copied: string;
  stop: string;
  failed: string;
  buyer: string;
  seller: string;
  sharedByBuyer: string;
  sharedBySeller: string;
  signatureHolds: string;
  signatureFails: string;
  notFound: string;
  ways: Record<DealRecordWay, string>;
}

type Locale = 'en' | 'fr' | 'ar' | 'hi' | 'sw';

export const dealRecordCopy: Record<Locale, DealRecordCopy> = {
  en: {
    title: 'Deal record',
    intro: 'When a deal ends, Karwan writes one signed record from what the deal did: what was agreed, the money held, how the work was confirmed and what was released. Both sides see it. You can share it by a link and take the link back.',
    agreed: 'Agreed',
    held: 'Money held',
    confirmed: 'Work confirmed',
    released: 'Released',
    signed: 'Signed',
    agreedLine: '{price} USDC for {title}',
    bothOn: 'both sides on {date}',
    heldLine: '{amount} USDC from {date}',
    stage: 'Stage {n}',
    toYou: '{amount} USDC to you',
    toSeller: '{amount} USDC to the seller',
    backToYou: '{amount} USDC back to you',
    backToBuyer: '{amount} USDC back to the buyer',
    fee: '{amount} USDC fee',
    viewOnArc: 'View on Arc',
    signedBy: 'Signed by Karwan',
    notRecorded: 'Not recorded',
    seeRecord: 'See the deal record',
    writing: 'Karwan writes the signed record of this deal within the hour.',
    share: 'Share the record',
    sheetTitle: 'Share this deal record',
    sheetLine: 'Whoever has the link sees the record with names and Karwan tags, never wallet addresses. You can stop sharing any time.',
    copy: 'Copy link',
    copied: 'Copied',
    stop: 'Stop sharing',
    failed: 'That did not go through. Try again in a moment.',
    buyer: 'Buyer',
    seller: 'Seller',
    sharedByBuyer: 'Shared by the buyer',
    sharedBySeller: 'Shared by the seller',
    signatureHolds: 'The signature checks out. Karwan wrote this record.',
    signatureFails: 'The signature does not check out. Do not rely on this record.',
    notFound: 'This link is not live. Whoever shared it may have stopped sharing.',
    ways: {
      buyer_confirmed: 'The buyer confirmed it',
      handover_code: 'Handover code at delivery',
      buyer_silent: 'The buyer did not respond in time',
      dispute: 'Decided in a dispute',
      review_window: 'Released when the review time ended',
      cancelled_by_both: 'Both sides cancelled it',
      refunded: 'Refunded to the buyer',
      not_recorded: 'Not recorded',
    },
  },
  fr: {
    title: 'Relevé de l’accord',
    intro: 'Quand un accord se termine, Karwan rédige un relevé signé à partir de ce que l’accord a fait : ce qui a été convenu, l’argent bloqué, la façon dont le travail a été confirmé et ce qui a été versé. Les deux parties le voient. Vous pouvez le partager par un lien et retirer ce lien.',
    agreed: 'Convenu',
    held: 'Argent bloqué',
    confirmed: 'Travail confirmé',
    released: 'Versé',
    signed: 'Signé',
    agreedLine: '{price} USDC pour {title}',
    bothOn: 'les deux parties le {date}',
    heldLine: '{amount} USDC depuis le {date}',
    stage: 'Étape {n}',
    toYou: '{amount} USDC pour vous',
    toSeller: '{amount} USDC au vendeur',
    backToYou: '{amount} USDC remboursés à vous',
    backToBuyer: '{amount} USDC remboursés à l’acheteur',
    fee: '{amount} USDC de frais',
    viewOnArc: 'Voir sur Arc',
    signedBy: 'Signé par Karwan',
    notRecorded: 'Non enregistré',
    seeRecord: 'Voir le relevé de l’accord',
    writing: 'Karwan rédige le relevé signé de cet accord dans l’heure.',
    share: 'Partager le relevé',
    sheetTitle: 'Partager ce relevé',
    sheetLine: 'Toute personne ayant le lien voit le relevé avec les noms et les identifiants Karwan, jamais les adresses de portefeuille. Vous pouvez arrêter le partage à tout moment.',
    copy: 'Copier le lien',
    copied: 'Copié',
    stop: 'Arrêter le partage',
    failed: 'Cela n’a pas abouti. Réessayez dans un instant.',
    buyer: 'Acheteur',
    seller: 'Vendeur',
    sharedByBuyer: 'Partagé par l’acheteur',
    sharedBySeller: 'Partagé par le vendeur',
    signatureHolds: 'La signature est valide. Karwan a rédigé ce relevé.',
    signatureFails: 'La signature n’est pas valide. Ne vous fiez pas à ce relevé.',
    notFound: 'Ce lien n’est plus actif. La personne qui l’a partagé a peut-être arrêté le partage.',
    ways: {
      buyer_confirmed: 'L’acheteur l’a confirmé',
      handover_code: 'Code de remise à la livraison',
      buyer_silent: 'L’acheteur n’a pas répondu à temps',
      dispute: 'Tranché lors d’un litige',
      review_window: 'Libéré à la fin du délai de vérification',
      cancelled_by_both: 'Annulé par les deux parties',
      refunded: 'Remboursé à l’acheteur',
      not_recorded: 'Non enregistré',
    },
  },
  ar: {
    title: 'سجل الصفقة',
    intro: 'عندما تنتهي الصفقة، يكتب Karwan سجلًا موقّعًا واحدًا مما جرى فيها: ما اتُّفق عليه، والمال المحتجز، وكيف أُكّد العمل، وما صُرف. يراه الطرفان. يمكنك مشاركته برابط واسترداد الرابط.',
    agreed: 'المتفق عليه',
    held: 'المال المحتجز',
    confirmed: 'تأكيد العمل',
    released: 'المصروف',
    signed: 'التوقيع',
    agreedLine: '{price} USDC مقابل {title}',
    bothOn: 'وافق الطرفان في {date}',
    heldLine: '{amount} USDC منذ {date}',
    stage: 'المرحلة {n}',
    toYou: '{amount} USDC لك',
    toSeller: '{amount} USDC للبائع',
    backToYou: '{amount} USDC أُعيدت إليك',
    backToBuyer: '{amount} USDC أُعيدت إلى المشتري',
    fee: 'رسوم {amount} USDC',
    viewOnArc: 'عرض على Arc',
    signedBy: 'وقّعه Karwan',
    notRecorded: 'غير مسجّل',
    seeRecord: 'عرض سجل الصفقة',
    writing: 'يكتب Karwan السجل الموقّع لهذه الصفقة خلال ساعة.',
    share: 'مشاركة السجل',
    sheetTitle: 'مشاركة سجل الصفقة',
    sheetLine: 'من لديه الرابط يرى السجل بالأسماء ومعرّفات Karwan، ولا يرى عناوين المحافظ أبدًا. يمكنك إيقاف المشاركة في أي وقت.',
    copy: 'نسخ الرابط',
    copied: 'تم النسخ',
    stop: 'إيقاف المشاركة',
    failed: 'لم يتم ذلك. حاول مرة أخرى بعد لحظة.',
    buyer: 'المشتري',
    seller: 'البائع',
    sharedByBuyer: 'شاركه المشتري',
    sharedBySeller: 'شاركه البائع',
    signatureHolds: 'التوقيع صحيح. Karwan كتب هذا السجل.',
    signatureFails: 'التوقيع غير صحيح. لا تعتمد على هذا السجل.',
    notFound: 'هذا الرابط غير نشط. ربما أوقف من شاركه المشاركة.',
    ways: {
      buyer_confirmed: 'أكّده المشتري',
      handover_code: 'رمز التسليم عند الاستلام',
      buyer_silent: 'لم يردّ المشتري في الوقت المحدد',
      dispute: 'حُسم في نزاع',
      review_window: 'صُرف عند انتهاء مدة المراجعة',
      cancelled_by_both: 'ألغاه الطرفان',
      refunded: 'أُعيد إلى المشتري',
      not_recorded: 'غير مسجّل',
    },
  },
  hi: {
    title: 'सौदे का रिकॉर्ड',
    intro: 'सौदा खत्म होने पर Karwan उसी से एक हस्ताक्षरित रिकॉर्ड लिखता है: क्या तय हुआ, कितना पैसा रोका गया, काम की पुष्टि कैसे हुई और क्या जारी हुआ। दोनों पक्ष इसे देखते हैं। आप इसे लिंक से साझा कर सकते हैं और लिंक वापस ले सकते हैं।',
    agreed: 'तय हुआ',
    held: 'रोका गया पैसा',
    confirmed: 'काम की पुष्टि',
    released: 'जारी हुआ',
    signed: 'हस्ताक्षर',
    agreedLine: '{title} के लिए {price} USDC',
    bothOn: 'दोनों पक्ष {date} को',
    heldLine: '{date} से {amount} USDC',
    stage: 'चरण {n}',
    toYou: '{amount} USDC आपको',
    toSeller: '{amount} USDC विक्रेता को',
    backToYou: '{amount} USDC आपको वापस',
    backToBuyer: '{amount} USDC खरीदार को वापस',
    fee: '{amount} USDC शुल्क',
    viewOnArc: 'Arc पर देखें',
    signedBy: 'Karwan द्वारा हस्ताक्षरित',
    notRecorded: 'दर्ज नहीं',
    seeRecord: 'सौदे का रिकॉर्ड देखें',
    writing: 'Karwan इस सौदे का हस्ताक्षरित रिकॉर्ड एक घंटे के भीतर लिखता है।',
    share: 'रिकॉर्ड साझा करें',
    sheetTitle: 'यह सौदे का रिकॉर्ड साझा करें',
    sheetLine: 'जिसके पास लिंक है वह नाम और Karwan टैग के साथ रिकॉर्ड देखता है, वॉलेट पते कभी नहीं। आप कभी भी साझा करना बंद कर सकते हैं।',
    copy: 'लिंक कॉपी करें',
    copied: 'कॉपी हो गया',
    stop: 'साझा करना बंद करें',
    failed: 'यह नहीं हो सका। थोड़ी देर में फिर कोशिश करें।',
    buyer: 'खरीदार',
    seller: 'विक्रेता',
    sharedByBuyer: 'खरीदार ने साझा किया',
    sharedBySeller: 'विक्रेता ने साझा किया',
    signatureHolds: 'हस्ताक्षर सही है। यह रिकॉर्ड Karwan ने लिखा है।',
    signatureFails: 'हस्ताक्षर सही नहीं है। इस रिकॉर्ड पर भरोसा न करें।',
    notFound: 'यह लिंक सक्रिय नहीं है। साझा करने वाले ने शायद साझा करना बंद कर दिया है।',
    ways: {
      buyer_confirmed: 'खरीदार ने पुष्टि की',
      handover_code: 'डिलीवरी पर हैंडओवर कोड',
      buyer_silent: 'खरीदार ने समय पर जवाब नहीं दिया',
      dispute: 'विवाद में तय हुआ',
      review_window: 'समीक्षा का समय खत्म होने पर जारी हुआ',
      cancelled_by_both: 'दोनों पक्षों ने रद्द किया',
      refunded: 'खरीदार को वापस किया गया',
      not_recorded: 'दर्ज नहीं',
    },
  },
  sw: {
    title: 'Rekodi ya mpango',
    intro: 'Mpango unapoisha, Karwan huandika rekodi moja iliyosainiwa kutokana na kilichofanyika: kilichokubaliwa, pesa iliyoshikiliwa, jinsi kazi ilivyothibitishwa na kilicholipwa. Pande zote mbili zinaiona. Unaweza kuishiriki kwa kiungo na kukirudisha.',
    agreed: 'Kilichokubaliwa',
    held: 'Pesa iliyoshikiliwa',
    confirmed: 'Kazi kuthibitishwa',
    released: 'Kilicholipwa',
    signed: 'Sahihi',
    agreedLine: 'USDC {price} kwa {title}',
    bothOn: 'pande zote mbili tarehe {date}',
    heldLine: 'USDC {amount} tangu {date}',
    stage: 'Hatua {n}',
    toYou: 'USDC {amount} kwako',
    toSeller: 'USDC {amount} kwa muuzaji',
    backToYou: 'USDC {amount} zimerudishwa kwako',
    backToBuyer: 'USDC {amount} zimerudishwa kwa mnunuzi',
    fee: 'ada ya USDC {amount}',
    viewOnArc: 'Tazama kwenye Arc',
    signedBy: 'Imesainiwa na Karwan',
    notRecorded: 'Haijarekodiwa',
    seeRecord: 'Tazama rekodi ya mpango',
    writing: 'Karwan huandika rekodi iliyosainiwa ya mpango huu ndani ya saa moja.',
    share: 'Shiriki rekodi',
    sheetTitle: 'Shiriki rekodi hii ya mpango',
    sheetLine: 'Yeyote mwenye kiungo anaona rekodi kwa majina na lebo za Karwan, kamwe si anwani za pochi. Unaweza kuacha kushiriki wakati wowote.',
    copy: 'Nakili kiungo',
    copied: 'Imenakiliwa',
    stop: 'Acha kushiriki',
    failed: 'Haikufanikiwa. Jaribu tena baada ya muda mfupi.',
    buyer: 'Mnunuzi',
    seller: 'Muuzaji',
    sharedByBuyer: 'Imeshirikiwa na mnunuzi',
    sharedBySeller: 'Imeshirikiwa na muuzaji',
    signatureHolds: 'Sahihi ni sahihi. Karwan iliandika rekodi hii.',
    signatureFails: 'Sahihi si sahihi. Usitegemee rekodi hii.',
    notFound: 'Kiungo hiki hakifanyi kazi. Aliyekishiriki huenda ameacha kushiriki.',
    ways: {
      buyer_confirmed: 'Mnunuzi alithibitisha',
      handover_code: 'Msimbo wa makabidhiano wakati wa kupokea',
      buyer_silent: 'Mnunuzi hakujibu kwa wakati',
      dispute: 'Iliamuliwa katika mzozo',
      review_window: 'Ilitolewa muda wa ukaguzi ulipoisha',
      cancelled_by_both: 'Pande zote mbili ziliughairi',
      refunded: 'Imerudishwa kwa mnunuzi',
      not_recorded: 'Haijarekodiwa',
    },
  },
};
