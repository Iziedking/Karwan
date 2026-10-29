/// Agents that always answer (view 41): where a request stands for the person
/// who posted it, and the question card a seller answers on the request page.
export interface AgentQuestionsCopy {
  /// {fit}, {offered} and {asked} are counts of sellers.
  reachOne: string;
  reachMany: string;
  nobodyTitle: string;
  nobodyBody: string;
  copyLink: string;
  copied: string;
  cardTitle: string;
  /// {budget}, {limit}, {price} and {their} are USDC amounts; {days} and {due}
  /// are day counts already worded with dayOne or days.
  noWay: string;
  belowFloor: string;
  aboveUsual: string;
  time: string;
  place: string;
  askFirst: string;
  counter: string;
  dayOne: string;
  days: string;
  offer: string;
  changePrice: string;
  notForMe: string;
  take: string;
  hold: string;
  waiting: string;
  failed: string;
}

export const agentQuestionsCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', AgentQuestionsCopy> = {
  en: {
    reachOne: 'One seller fits so far: {offered} offered, {asked} checking the price.',
    reachMany: '{fit} sellers fit so far: {offered} offered, {asked} checking the price.',
    nobodyTitle: 'Nobody on Karwan sells this yet',
    nobodyBody: 'Your agent keeps looking and tells you the moment someone fits. Know a seller? Send them the link and they can offer here.',
    copyLink: 'Copy the link',
    copied: 'Link copied',
    cardTitle: 'Your agent has a question',
    noWay: 'The budget is {budget} USDC. You have not told your agent how you sell this yet. Offer {price} USDC, ready in {days}?',
    belowFloor: 'The budget is {budget} USDC, under your lowest of {limit} USDC. Offer {price} USDC?',
    aboveUsual: 'The budget is {budget} USDC, above your usual {limit} USDC. Offer {price} USDC?',
    time: 'It is due in {due}. You usually take {limit}. Offer {price} USDC in {days}?',
    place: 'This request is outside where you deliver. Offer {price} USDC anyway?',
    askFirst: 'Your agent would offer {price} USDC, ready in {days}. Send it?',
    counter: 'The buyer offers {their} USDC. Your lowest is {limit} USDC. Take it, or hold at {price} USDC?',
    dayOne: '1 day',
    days: '{n} days',
    offer: 'Offer {price} USDC',
    changePrice: 'Change the price',
    notForMe: 'Not for me',
    take: 'Take {their} USDC',
    hold: 'Hold at {price} USDC',
    waiting: 'Nothing is sent until you answer.',
    failed: 'That did not go through. Try again.',
  },
  fr: {
    reachOne: 'Un vendeur correspond pour le moment : {offered} a fait une offre, {asked} vérifie le prix.',
    reachMany: '{fit} vendeurs correspondent pour le moment : {offered} ont fait une offre, {asked} vérifient le prix.',
    nobodyTitle: 'Personne ne vend encore cela sur Karwan',
    nobodyBody: 'Votre agent continue de chercher et vous prévient dès que quelqu’un correspond. Vous connaissez un vendeur ? Envoyez-lui le lien et il pourra faire une offre ici.',
    copyLink: 'Copier le lien',
    copied: 'Lien copié',
    cardTitle: 'Votre agent a une question',
    noWay: 'Le budget est de {budget} USDC. Vous n’avez pas encore dit à votre agent comment vous vendez cela. Offrir {price} USDC, prêt en {days} ?',
    belowFloor: 'Le budget est de {budget} USDC, sous votre minimum de {limit} USDC. Offrir {price} USDC ?',
    aboveUsual: 'Le budget est de {budget} USDC, au-dessus de votre prix habituel de {limit} USDC. Offrir {price} USDC ?',
    time: 'Échéance dans {due}. Vous prenez d’habitude {limit}. Offrir {price} USDC en {days} ?',
    place: 'Cette demande est hors de votre zone de livraison. Offrir {price} USDC quand même ?',
    askFirst: 'Votre agent offrirait {price} USDC, prêt en {days}. L’envoyer ?',
    counter: 'L’acheteur propose {their} USDC. Votre minimum est {limit} USDC. Accepter, ou tenir à {price} USDC ?',
    dayOne: '1 jour',
    days: '{n} jours',
    offer: 'Offrir {price} USDC',
    changePrice: 'Changer le prix',
    notForMe: 'Pas pour moi',
    take: 'Accepter {their} USDC',
    hold: 'Tenir à {price} USDC',
    waiting: 'Rien n’est envoyé avant votre réponse.',
    failed: 'Cela n’a pas abouti. Réessayez.',
  },
  ar: {
    reachOne: 'بائع واحد يناسب الطلب حتى الآن: {offered} قدّم عرضًا، {asked} يتحقق من السعر.',
    reachMany: '{fit} بائعين يناسبون الطلب حتى الآن: {offered} قدّموا عروضًا، {asked} يتحققون من السعر.',
    nobodyTitle: 'لا أحد يبيع هذا على كروان بعد',
    nobodyBody: 'يواصل وكيلك البحث ويخبرك فور أن يناسب أحد طلبك. تعرف بائعًا؟ أرسل له الرابط ليقدم عرضه هنا.',
    copyLink: 'انسخ الرابط',
    copied: 'تم نسخ الرابط',
    cardTitle: 'لدى وكيلك سؤال',
    noWay: 'الميزانية {budget} USDC. لم تخبر وكيلك بعد كيف تبيع هذا. هل تقدم عرضًا بـ {price} USDC، جاهزًا خلال {days}؟',
    belowFloor: 'الميزانية {budget} USDC، أقل من حدك الأدنى {limit} USDC. هل تقدم عرضًا بـ {price} USDC؟',
    aboveUsual: 'الميزانية {budget} USDC، أعلى من سعرك المعتاد {limit} USDC. هل تقدم عرضًا بـ {price} USDC؟',
    time: 'الموعد خلال {due}. عادةً تستغرق {limit}. هل تقدم عرضًا بـ {price} USDC خلال {days}؟',
    place: 'هذا الطلب خارج نطاق توصيلك. هل تقدم عرضًا بـ {price} USDC على أي حال؟',
    askFirst: 'سيعرض وكيلك {price} USDC، جاهزًا خلال {days}. هل نرسله؟',
    counter: 'يعرض المشتري {their} USDC. حدك الأدنى {limit} USDC. تقبل، أو تثبت على {price} USDC؟',
    dayOne: 'يوم واحد',
    days: '{n} أيام',
    offer: 'قدّم عرضًا بـ {price} USDC',
    changePrice: 'غيّر السعر',
    notForMe: 'ليس لي',
    take: 'اقبل {their} USDC',
    hold: 'اثبت على {price} USDC',
    waiting: 'لا يُرسل شيء قبل أن تجيب.',
    failed: 'لم يتم ذلك. حاول مرة أخرى.',
  },
  hi: {
    reachOne: 'अब तक एक विक्रेता मेल खाता है: {offered} ने ऑफ़र दिया, {asked} कीमत देख रहा है।',
    reachMany: 'अब तक {fit} विक्रेता मेल खाते हैं: {offered} ने ऑफ़र दिया, {asked} कीमत देख रहे हैं।',
    nobodyTitle: 'Karwan पर अभी कोई यह नहीं बेचता',
    nobodyBody: 'आपका एजेंट खोजता रहता है और जैसे ही कोई मेल खाए, आपको बताता है। किसी विक्रेता को जानते हैं? उन्हें लिंक भेजें, वे यहाँ ऑफ़र दे सकते हैं।',
    copyLink: 'लिंक कॉपी करें',
    copied: 'लिंक कॉपी हो गया',
    cardTitle: 'आपके एजेंट का एक सवाल है',
    noWay: 'बजट {budget} USDC है। आपने अभी एजेंट को नहीं बताया कि आप यह कैसे बेचते हैं। {price} USDC का ऑफ़र दें, {days} में तैयार?',
    belowFloor: 'बजट {budget} USDC है, आपके न्यूनतम {limit} USDC से कम। {price} USDC का ऑफ़र दें?',
    aboveUsual: 'बजट {budget} USDC है, आपके सामान्य {limit} USDC से ऊपर। {price} USDC का ऑफ़र दें?',
    time: 'यह {due} में चाहिए। आप आम तौर पर {limit} लेते हैं। {days} में {price} USDC का ऑफ़र दें?',
    place: 'यह अनुरोध आपके डिलीवरी क्षेत्र से बाहर है। फिर भी {price} USDC का ऑफ़र दें?',
    askFirst: 'आपका एजेंट {price} USDC का ऑफ़र देगा, {days} में तैयार। भेजें?',
    counter: 'खरीदार {their} USDC दे रहा है। आपका न्यूनतम {limit} USDC है। लें, या {price} USDC पर रहें?',
    dayOne: '1 दिन',
    days: '{n} दिन',
    offer: '{price} USDC का ऑफ़र दें',
    changePrice: 'कीमत बदलें',
    notForMe: 'मेरे लिए नहीं',
    take: '{their} USDC लें',
    hold: '{price} USDC पर रहें',
    waiting: 'आपके जवाब से पहले कुछ नहीं भेजा जाता।',
    failed: 'यह नहीं हो पाया। फिर कोशिश करें।',
  },
  sw: {
    reachOne: 'Muuzaji mmoja analingana hadi sasa: {offered} ametoa ofa, {asked} anaangalia bei.',
    reachMany: 'Wauzaji {fit} wanalingana hadi sasa: {offered} wametoa ofa, {asked} wanaangalia bei.',
    nobodyTitle: 'Hakuna anayeuza hiki kwenye Karwan bado',
    nobodyBody: 'Wakala wako anaendelea kutafuta na atakuambia mara mtu atakapolingana. Unamjua muuzaji? Mtumie kiungo na anaweza kutoa ofa hapa.',
    copyLink: 'Nakili kiungo',
    copied: 'Kiungo kimenakiliwa',
    cardTitle: 'Wakala wako ana swali',
    noWay: 'Bajeti ni {budget} USDC. Bado hujamwambia wakala wako jinsi unavyouza hiki. Toa ofa ya {price} USDC, tayari baada ya {days}?',
    belowFloor: 'Bajeti ni {budget} USDC, chini ya kiwango chako cha chini cha {limit} USDC. Toa ofa ya {price} USDC?',
    aboveUsual: 'Bajeti ni {budget} USDC, juu ya bei yako ya kawaida ya {limit} USDC. Toa ofa ya {price} USDC?',
    time: 'Inahitajika baada ya {due}. Kawaida unachukua {limit}. Toa ofa ya {price} USDC baada ya {days}?',
    place: 'Ombi hili liko nje ya eneo unalofikisha. Toa ofa ya {price} USDC hata hivyo?',
    askFirst: 'Wakala wako angetoa ofa ya {price} USDC, tayari baada ya {days}. Itume?',
    counter: 'Mnunuzi anatoa {their} USDC. Kiwango chako cha chini ni {limit} USDC. Kubali, au shikilia {price} USDC?',
    dayOne: 'siku 1',
    days: 'siku {n}',
    offer: 'Toa ofa ya {price} USDC',
    changePrice: 'Badilisha bei',
    notForMe: 'Si kwangu',
    take: 'Kubali {their} USDC',
    hold: 'Shikilia {price} USDC',
    waiting: 'Hakuna kinachotumwa hadi ujibu.',
    failed: 'Hiyo haikufaulu. Jaribu tena.',
  },
};
