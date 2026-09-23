export interface EscrowDocsItem {
  label: string;
  body: string;
}

export interface EscrowDocsSection {
  heading: string;
  intro: string;
  items: EscrowDocsItem[];
}

export interface EscrowDocsCopy {
  nav: { label: string; blurb: string };
  eyebrow: string;
  title: string;
  status: string;
  intro: string;
  sections: EscrowDocsSection[];
  callout: { title: string; body: string };
}

export const escrowDocsCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', EscrowDocsCopy> = {
  en: {
    nav: { label: 'Escrow design', blurb: 'How the contract holds a deal' },
    eyebrow: 'Escrow architecture',
    title: 'How your deal is held',
    status: 'Mainnet design, in review. Not live yet. The testnet escrow today follows the same flow with short demo clocks.',
    intro:
      'Karwan never keeps deal money in an account of its own. The buyer pays into an escrow contract on Arc, and only the terms both sides agreed can release it. This page describes the escrow Karwan is preparing for mainnet.',
    sections: [
      {
        heading: 'Who holds what',
        intro: '',
        items: [
          { label: 'Your wallet.', body: 'Email accounts use a passkey smart wallet that only you can sign for. Web3 accounts use your own wallet.' },
          { label: 'Deal money.', body: 'Held by the escrow contract from funding to payout. Karwan cannot move it outside the rules on this page.' },
          { label: 'Agents.', body: 'Optional. An agent wallet is operated by Karwan and acts only inside the limits you set. You can always act on your deal directly from your own wallet.' },
        ],
      },
      {
        heading: 'The terms are the deal',
        intro:
          'Before anyone pays, both sides agree the terms. The contract stores them at funding, and the seller confirms the exact same terms on chain. Nobody can change them afterwards, Karwan included.',
        items: [
          { label: 'Price and milestones.', body: 'The amount, and how it splits into up to five payments.' },
          { label: 'Delivery date.', body: 'When each delivery is due, and a short grace period after it.' },
          { label: 'Review time.', body: 'How long the buyer has to check each delivery. It starts at delivery, or at arrival for physical goods.' },
          { label: 'More time.', body: 'How many times the buyer can extend the review, and by how much.' },
          { label: 'Final payment.', body: 'Whether the last payment can release when the review time ends, or needs the buyer. Large deals always need the buyer.' },
          { label: 'If the buyer goes quiet.', body: 'After a set time with no release and no dispute, the seller can be paid, so no deal stays stuck.' },
        ],
      },
      {
        heading: 'How a deal moves',
        intro: '',
        items: [
          { label: 'Agree.', body: 'State what you want, the price, the milestones and the clocks.' },
          { label: 'Fund.', body: 'The buyer pays into the contract. The seller confirms the terms.' },
          { label: 'Deliver.', body: 'The seller delivers and marks it. The review time starts.' },
          { label: 'Check.', body: 'A delivery check compares the delivery with the terms, and the buyer is alerted to check it too. The buyer can release, ask for more time, or dispute.' },
          { label: 'Paid.', body: 'The buyer releases, or the payment releases when the review time ends, as the terms say.' },
        ],
      },
      {
        heading: 'When there is a problem',
        intro: '',
        items: [
          { label: 'Automatic ruling.', body: 'Either side can open a dispute and the clocks stop. The dispute engine reads the terms, the dates and the delivery evidence, and proposes a split with its reason to both sides.' },
          { label: 'Time to appeal.', body: 'The proposal only takes effect after an appeal window. Either side can escalate it before then.' },
          { label: 'Admin review.', body: 'An escalated dispute goes to a person. One of four named reviewers signs the final ruling, and the reason is shared with both sides.' },
          { label: 'If nobody rules.', body: 'After the dispute timeout either side can close the dispute, and the deal continues from where it stopped. A delivery made on time is kept.' },
        ],
      },
      {
        heading: 'What Karwan admins can and cannot do',
        intro: '',
        items: [
          { label: 'Rule on escalated disputes.', body: 'Only by splitting the unpaid amount between the buyer and the seller of that deal.' },
          { label: 'Pause new deals.', body: 'In an emergency. A pause never blocks a release, a refund or a claim on a deal that already exists.' },
          { label: 'Change settings.', body: 'Fees (never above 10%), limits and reviewer addresses, through a multisig and a waiting period, and only for future deals.' },
          { label: 'Never.', body: 'Send deal money anywhere other than the deal’s own buyer and seller, the fee account, or a financier the seller chose.' },
        ],
      },
      {
        heading: 'Built to be checked',
        intro: '',
        items: [
          { label: 'Limits at launch.', body: 'Mainnet opens with a cap per deal and a cap on the total held, raised step by step.' },
          { label: 'Payouts cannot get stuck.', body: 'If a payment to one side fails, that share waits for them to withdraw, and the rest of the deal completes.' },
          { label: 'Tested against attacks.', body: 'Every known attack has a test the contract must pass. Invariant tests check that money is conserved and that every deal can end.' },
          { label: 'Audits.', body: 'Internal audit rounds before mainnet, and an external audit before the limits rise.' },
        ],
      },
    ],
    callout: {
      title: 'Testnet timings',
      body: 'On testnet, review times are 5 minutes so you can see a whole deal in one sitting. On mainnet, the review time is part of the terms you both agree before paying.',
    },
  },
  fr: {
    nav: { label: 'Conception du séquestre', blurb: 'Comment le contrat garde un accord' },
    eyebrow: 'Architecture du séquestre',
    title: 'Comment votre accord est gardé',
    status: 'Conception pour le réseau principal, en cours de revue. Pas encore en service. Le séquestre du réseau de test suit déjà le même parcours avec des délais courts de démonstration.',
    intro:
      'Karwan ne garde jamais l’argent d’un accord sur un compte à lui. L’acheteur paie dans un contrat de séquestre sur Arc, et seules les conditions acceptées par les deux parties peuvent le libérer. Cette page décrit le séquestre que Karwan prépare pour le réseau principal.',
    sections: [
      {
        heading: 'Qui détient quoi',
        intro: '',
        items: [
          { label: 'Votre portefeuille.', body: 'Les comptes par e-mail utilisent un portefeuille intelligent à clé d’accès que vous seul pouvez signer. Les comptes Web3 utilisent votre propre portefeuille.' },
          { label: 'L’argent de l’accord.', body: 'Détenu par le contrat de séquestre du paiement jusqu’au versement. Karwan ne peut pas le déplacer en dehors des règles de cette page.' },
          { label: 'Agents.', body: 'Facultatifs. Un portefeuille d’agent est géré par Karwan et n’agit que dans les limites que vous fixez. Vous pouvez toujours agir sur votre accord directement depuis votre propre portefeuille.' },
        ],
      },
      {
        heading: 'Les conditions sont l’accord',
        intro:
          'Avant tout paiement, les deux parties conviennent des conditions. Le contrat les enregistre au financement, et le vendeur confirme exactement les mêmes conditions sur la chaîne. Personne ne peut les modifier ensuite, Karwan compris.',
        items: [
          { label: 'Prix et étapes.', body: 'Le montant, et sa répartition en cinq paiements au plus.' },
          { label: 'Date de livraison.', body: 'La date de chaque livraison, et un court délai de grâce après elle.' },
          { label: 'Délai de vérification.', body: 'Le temps dont l’acheteur dispose pour vérifier chaque livraison. Il commence à la livraison, ou à l’arrivée pour les biens physiques.' },
          { label: 'Plus de temps.', body: 'Combien de fois l’acheteur peut prolonger la vérification, et de combien.' },
          { label: 'Dernier paiement.', body: 'Si le dernier paiement peut être libéré à la fin du délai de vérification, ou s’il faut l’acheteur. Les gros accords exigent toujours l’acheteur.' },
          { label: 'Si l’acheteur ne répond plus.', body: 'Après un délai fixé sans libération ni litige, le vendeur peut être payé, afin qu’aucun accord ne reste bloqué.' },
        ],
      },
      {
        heading: 'Le déroulement d’un accord',
        intro: '',
        items: [
          { label: 'Convenir.', body: 'Dites ce que vous voulez, le prix, les étapes et les délais.' },
          { label: 'Financer.', body: 'L’acheteur paie dans le contrat. Le vendeur confirme les conditions.' },
          { label: 'Livrer.', body: 'Le vendeur livre et le signale. Le délai de vérification commence.' },
          { label: 'Vérifier.', body: 'Une vérification compare la livraison aux conditions, et l’acheteur est prévenu pour vérifier lui aussi. L’acheteur peut libérer, demander plus de temps ou ouvrir un litige.' },
          { label: 'Payé.', body: 'L’acheteur libère, ou le paiement est libéré à la fin du délai de vérification, comme le prévoient les conditions.' },
        ],
      },
      {
        heading: 'En cas de problème',
        intro: '',
        items: [
          { label: 'Décision automatique.', body: 'Chaque partie peut ouvrir un litige, et les délais s’arrêtent. Le moteur de litiges lit les conditions, les dates et les preuves de livraison, puis propose une répartition motivée aux deux parties.' },
          { label: 'Délai d’appel.', body: 'La proposition ne s’applique qu’après un délai d’appel. Chaque partie peut la faire remonter avant ce terme.' },
          { label: 'Examen par un administrateur.', body: 'Un litige remonté est confié à une personne. L’un des quatre examinateurs désignés signe la décision finale, et le motif est communiqué aux deux parties.' },
          { label: 'Si personne ne décide.', body: 'Après le délai du litige, chaque partie peut clore le litige, et l’accord reprend là où il s’était arrêté. Une livraison faite à temps est conservée.' },
        ],
      },
      {
        heading: 'Ce que les administrateurs de Karwan peuvent faire ou non',
        intro: '',
        items: [
          { label: 'Trancher les litiges remontés.', body: 'Uniquement en répartissant le montant non versé entre l’acheteur et le vendeur de cet accord.' },
          { label: 'Suspendre les nouveaux accords.', body: 'En cas d’urgence. Une suspension ne bloque jamais une libération, un remboursement ou une réclamation sur un accord existant.' },
          { label: 'Modifier les réglages.', body: 'Frais (jamais plus de 10 %), limites et adresses des examinateurs, via un multisig et un délai d’attente, et seulement pour les accords futurs.' },
          { label: 'Jamais.', body: 'Envoyer l’argent d’un accord ailleurs qu’à l’acheteur et au vendeur de cet accord, au compte des frais, ou à un financeur choisi par le vendeur.' },
        ],
      },
      {
        heading: 'Conçu pour être vérifié',
        intro: '',
        items: [
          { label: 'Limites au lancement.', body: 'Le réseau principal ouvre avec un plafond par accord et un plafond sur le total détenu, relevés progressivement.' },
          { label: 'Les versements ne restent pas bloqués.', body: 'Si un paiement vers une partie échoue, sa part attend qu’elle la retire, et le reste de l’accord se termine.' },
          { label: 'Testé contre les attaques.', body: 'Chaque attaque connue a un test que le contrat doit réussir. Des tests d’invariants vérifient que l’argent est conservé et que chaque accord peut se terminer.' },
          { label: 'Audits.', body: 'Des audits internes avant le réseau principal, et un audit externe avant de relever les limites.' },
        ],
      },
    ],
    callout: {
      title: 'Délais sur le réseau de test',
      body: 'Sur le réseau de test, les délais de vérification sont de 5 minutes pour que vous puissiez voir un accord complet en une seule fois. Sur le réseau principal, le délai de vérification fait partie des conditions que vous acceptez tous les deux avant de payer.',
    },
  },
  ar: {
    nav: { label: 'تصميم الضمان', blurb: 'كيف يحفظ العقد الصفقة' },
    eyebrow: 'بنية الضمان',
    title: 'كيف تُحفظ صفقتك',
    status: 'تصميم للشبكة الرئيسية قيد المراجعة. لم يُطلق بعد. يتبع ضمان شبكة الاختبار اليوم المسار نفسه بمدد عرض قصيرة.',
    intro:
      'لا تحتفظ Karwan بأموال الصفقة في حساب خاص بها أبداً. يدفع المشتري إلى عقد ضمان على Arc، ولا يحرر المال إلا الشروط التي اتفق عليها الطرفان. تصف هذه الصفحة الضمان الذي تعدّه Karwan للشبكة الرئيسية.',
    sections: [
      {
        heading: 'من يحتفظ بماذا',
        intro: '',
        items: [
          { label: 'محفظتك.', body: 'حسابات البريد الإلكتروني تستخدم محفظة ذكية بمفتاح مرور لا يوقّع عليها غيرك. حسابات Web3 تستخدم محفظتك الخاصة.' },
          { label: 'مال الصفقة.', body: 'يحتفظ به عقد الضمان من الدفع حتى الصرف. لا تستطيع Karwan نقله خارج القواعد الواردة في هذه الصفحة.' },
          { label: 'الوكلاء.', body: 'اختياريون. تدير Karwan محفظة الوكيل، ولا تعمل إلا ضمن الحدود التي تضعها. يمكنك دائماً التصرف في صفقتك مباشرة من محفظتك الخاصة.' },
        ],
      },
      {
        heading: 'الشروط هي الصفقة',
        intro:
          'قبل أي دفع، يتفق الطرفان على الشروط. يسجلها العقد عند التمويل، ويؤكد البائع الشروط نفسها تماماً على السلسلة. لا يستطيع أحد تغييرها بعد ذلك، بما في ذلك Karwan.',
        items: [
          { label: 'السعر والمراحل.', body: 'المبلغ، وكيف يُقسّم إلى خمس دفعات كحد أقصى.' },
          { label: 'موعد التسليم.', body: 'موعد كل تسليم، ومهلة سماح قصيرة بعده.' },
          { label: 'مدة المراجعة.', body: 'الوقت المتاح للمشتري لفحص كل تسليم. تبدأ عند التسليم، أو عند الوصول في حالة السلع المادية.' },
          { label: 'وقت إضافي.', body: 'عدد المرات التي يمكن للمشتري فيها تمديد المراجعة، ومقدار كل تمديد.' },
          { label: 'الدفعة الأخيرة.', body: 'هل يمكن تحرير الدفعة الأخيرة عند انتهاء مدة المراجعة، أم تحتاج إلى المشتري. الصفقات الكبيرة تحتاج دائماً إلى المشتري.' },
          { label: 'إذا توقف المشتري عن الرد.', body: 'بعد مدة محددة دون تحرير أو نزاع، يمكن أن يُدفع للبائع، حتى لا تبقى أي صفقة عالقة.' },
        ],
      },
      {
        heading: 'كيف تسير الصفقة',
        intro: '',
        items: [
          { label: 'الاتفاق.', body: 'اذكر ما تريد، والسعر، والمراحل، والمدد.' },
          { label: 'التمويل.', body: 'يدفع المشتري إلى العقد. يؤكد البائع الشروط.' },
          { label: 'التسليم.', body: 'يسلّم البائع ويعلن ذلك. تبدأ مدة المراجعة.' },
          { label: 'الفحص.', body: 'يقارن فحص التسليم ما سُلّم بالشروط، ويُنبَّه المشتري ليفحص بنفسه أيضاً. يمكن للمشتري التحرير، أو طلب وقت إضافي، أو فتح نزاع.' },
          { label: 'الدفع.', body: 'يحرر المشتري المبلغ، أو يُحرَّر عند انتهاء مدة المراجعة، كما تنص الشروط.' },
        ],
      },
      {
        heading: 'عند وجود مشكلة',
        intro: '',
        items: [
          { label: 'حكم تلقائي.', body: 'يمكن لأي طرف فتح نزاع فتتوقف المدد. يقرأ محرك النزاعات الشروط والتواريخ وأدلة التسليم، ويقترح تقسيماً مع سببه على الطرفين.' },
          { label: 'مهلة الاستئناف.', body: 'لا يسري الاقتراح إلا بعد مهلة استئناف. يمكن لأي طرف رفعه للمراجعة قبل ذلك.' },
          { label: 'مراجعة المسؤول.', body: 'يذهب النزاع المرفوع إلى شخص. يوقّع أحد أربعة مراجعين معيّنين الحكم النهائي، ويُبلَّغ الطرفان بالسبب.' },
          { label: 'إذا لم يحكم أحد.', body: 'بعد انتهاء مهلة النزاع، يمكن لأي طرف إغلاقه، وتستأنف الصفقة من حيث توقفت. يُحتفظ بالتسليم الذي تم في موعده.' },
        ],
      },
      {
        heading: 'ما يستطيعه مسؤولو Karwan وما لا يستطيعونه',
        intro: '',
        items: [
          { label: 'الحكم في النزاعات المرفوعة.', body: 'فقط بتقسيم المبلغ غير المدفوع بين مشتري تلك الصفقة وبائعها.' },
          { label: 'إيقاف الصفقات الجديدة.', body: 'في حالات الطوارئ. لا يمنع الإيقاف أبداً تحرير مبلغ أو استرداده أو المطالبة به في صفقة قائمة.' },
          { label: 'تغيير الإعدادات.', body: 'الرسوم (لا تتجاوز 10% أبداً)، والحدود، وعناوين المراجعين، عبر محفظة متعددة التوقيع ومهلة انتظار، وللصفقات المستقبلية فقط.' },
          { label: 'أبداً.', body: 'إرسال مال الصفقة إلى أي جهة غير مشتري الصفقة وبائعها، أو حساب الرسوم، أو ممول اختاره البائع.' },
        ],
      },
      {
        heading: 'مصمم ليُفحص',
        intro: '',
        items: [
          { label: 'حدود عند الإطلاق.', body: 'تبدأ الشبكة الرئيسية بسقف لكل صفقة وسقف للمجموع المحفوظ، يُرفعان تدريجياً.' },
          { label: 'لا تعلق الدفعات.', body: 'إذا فشل دفع لأحد الطرفين، تنتظر حصته حتى يسحبها، وتكتمل بقية الصفقة.' },
          { label: 'مختبر ضد الهجمات.', body: 'لكل هجوم معروف اختبار يجب أن يجتازه العقد. وتتحقق اختبارات الثوابت من حفظ المال ومن أن كل صفقة يمكن أن تنتهي.' },
          { label: 'التدقيق.', body: 'جولات تدقيق داخلي قبل الشبكة الرئيسية، وتدقيق خارجي قبل رفع الحدود.' },
        ],
      },
    ],
    callout: {
      title: 'مدد شبكة الاختبار',
      body: 'على شبكة الاختبار، مدة المراجعة 5 دقائق لترى صفقة كاملة في جلسة واحدة. على الشبكة الرئيسية، مدة المراجعة جزء من الشروط التي يتفق عليها الطرفان قبل الدفع.',
    },
  },
  hi: {
    nav: { label: 'एस्क्रो डिज़ाइन', blurb: 'कॉन्ट्रैक्ट सौदे को कैसे रखता है' },
    eyebrow: 'एस्क्रो की संरचना',
    title: 'आपका सौदा कैसे सुरक्षित रहता है',
    status: 'मेननेट के लिए डिज़ाइन, समीक्षा में। अभी लाइव नहीं है। आज का टेस्टनेट एस्क्रो इसी क्रम पर छोटे डेमो समय के साथ चलता है।',
    intro:
      'Karwan सौदे का पैसा कभी अपने किसी खाते में नहीं रखता। खरीदार Arc पर एक एस्क्रो कॉन्ट्रैक्ट में भुगतान करता है, और उसे केवल वही शर्तें जारी कर सकती हैं जिन पर दोनों पक्ष सहमत हुए। यह पेज उस एस्क्रो का वर्णन करता है जिसे Karwan मेननेट के लिए तैयार कर रहा है।',
    sections: [
      {
        heading: 'किसके पास क्या है',
        intro: '',
        items: [
          { label: 'आपका वॉलेट।', body: 'ईमेल खाते पासकी वाले स्मार्ट वॉलेट का उपयोग करते हैं, जिस पर केवल आप हस्ताक्षर कर सकते हैं। Web3 खाते आपके अपने वॉलेट का उपयोग करते हैं।' },
          { label: 'सौदे का पैसा।', body: 'भुगतान से लेकर भुगतान जारी होने तक एस्क्रो कॉन्ट्रैक्ट में रहता है। Karwan इसे इस पेज के नियमों के बाहर नहीं हिला सकता।' },
          { label: 'एजेंट।', body: 'वैकल्पिक। एजेंट वॉलेट Karwan चलाता है और केवल आपकी तय सीमाओं के भीतर काम करता है। आप हमेशा अपने वॉलेट से सीधे अपने सौदे पर कार्रवाई कर सकते हैं।' },
        ],
      },
      {
        heading: 'शर्तें ही सौदा हैं',
        intro:
          'किसी भी भुगतान से पहले दोनों पक्ष शर्तें तय करते हैं। कॉन्ट्रैक्ट फंडिंग के समय उन्हें दर्ज करता है, और विक्रेता चेन पर बिल्कुल वही शर्तें पुष्टि करता है। इसके बाद कोई उन्हें नहीं बदल सकता, Karwan भी नहीं।',
        items: [
          { label: 'कीमत और चरण।', body: 'राशि, और वह अधिकतम पाँच भुगतानों में कैसे बँटती है।' },
          { label: 'डिलीवरी की तारीख।', body: 'हर डिलीवरी कब देनी है, और उसके बाद थोड़ी मोहलत।' },
          { label: 'जाँच का समय।', body: 'हर डिलीवरी जाँचने के लिए खरीदार के पास कितना समय है। यह डिलीवरी पर शुरू होता है, या भौतिक सामान के लिए पहुँचने पर।' },
          { label: 'अधिक समय।', body: 'खरीदार जाँच कितनी बार और कितना बढ़ा सकता है।' },
          { label: 'अंतिम भुगतान।', body: 'क्या अंतिम भुगतान जाँच का समय खत्म होने पर जारी हो सकता है, या उसके लिए खरीदार चाहिए। बड़े सौदों में हमेशा खरीदार चाहिए।' },
          { label: 'अगर खरीदार जवाब न दे।', body: 'तय समय तक न भुगतान जारी हो और न विवाद खुले, तो विक्रेता को भुगतान मिल सकता है, ताकि कोई सौदा अटका न रहे।' },
        ],
      },
      {
        heading: 'सौदा कैसे आगे बढ़ता है',
        intro: '',
        items: [
          { label: 'सहमति।', body: 'बताइए आपको क्या चाहिए, कीमत, चरण और समय।' },
          { label: 'फंडिंग।', body: 'खरीदार कॉन्ट्रैक्ट में भुगतान करता है। विक्रेता शर्तों की पुष्टि करता है।' },
          { label: 'डिलीवरी।', body: 'विक्रेता डिलीवर करता है और इसे दर्ज करता है। जाँच का समय शुरू होता है।' },
          { label: 'जाँच।', body: 'डिलीवरी जाँच डिलीवरी की तुलना शर्तों से करती है, और खरीदार को भी खुद जाँचने की सूचना मिलती है। खरीदार भुगतान जारी कर सकता है, अधिक समय माँग सकता है, या विवाद खोल सकता है।' },
          { label: 'भुगतान।', body: 'खरीदार भुगतान जारी करता है, या शर्तों के अनुसार जाँच का समय खत्म होने पर भुगतान जारी होता है।' },
        ],
      },
      {
        heading: 'जब कोई समस्या हो',
        intro: '',
        items: [
          { label: 'स्वचालित निर्णय।', body: 'कोई भी पक्ष विवाद खोल सकता है और समय रुक जाता है। विवाद इंजन शर्तें, तारीखें और डिलीवरी के सबूत पढ़ता है, और दोनों पक्षों को कारण सहित बँटवारे का प्रस्ताव देता है।' },
          { label: 'अपील का समय।', body: 'प्रस्ताव अपील की अवधि के बाद ही लागू होता है। उससे पहले कोई भी पक्ष इसे आगे बढ़ा सकता है।' },
          { label: 'एडमिन समीक्षा।', body: 'आगे बढ़ाया गया विवाद एक व्यक्ति के पास जाता है। चार नामित समीक्षकों में से एक अंतिम निर्णय पर हस्ताक्षर करता है, और कारण दोनों पक्षों को बताया जाता है।' },
          { label: 'अगर कोई निर्णय न दे।', body: 'विवाद की समय सीमा के बाद कोई भी पक्ष विवाद बंद कर सकता है, और सौदा वहीं से आगे बढ़ता है जहाँ रुका था। समय पर की गई डिलीवरी बनी रहती है।' },
        ],
      },
      {
        heading: 'Karwan के एडमिन क्या कर सकते हैं और क्या नहीं',
        intro: '',
        items: [
          { label: 'आगे बढ़ाए गए विवादों पर निर्णय।', body: 'केवल उस सौदे के खरीदार और विक्रेता के बीच बकाया राशि बाँटकर।' },
          { label: 'नए सौदे रोकना।', body: 'आपात स्थिति में। रोक कभी भी किसी मौजूदा सौदे में भुगतान जारी करने, रिफंड या दावे को नहीं रोकती।' },
          { label: 'सेटिंग बदलना।', body: 'फीस (कभी 10% से ज़्यादा नहीं), सीमाएँ और समीक्षकों के पते, मल्टीसिग और प्रतीक्षा अवधि के ज़रिए, और केवल भविष्य के सौदों के लिए।' },
          { label: 'कभी नहीं।', body: 'सौदे का पैसा उस सौदे के खरीदार और विक्रेता, फीस खाते, या विक्रेता के चुने फाइनेंसर के अलावा कहीं भेजना।' },
        ],
      },
      {
        heading: 'जाँचे जाने के लिए बना',
        intro: '',
        items: [
          { label: 'शुरुआत में सीमाएँ।', body: 'मेननेट हर सौदे पर एक सीमा और कुल रखी गई राशि पर एक सीमा के साथ शुरू होता है, जिन्हें धीरे-धीरे बढ़ाया जाता है।' },
          { label: 'भुगतान अटकते नहीं।', body: 'अगर किसी एक पक्ष को भुगतान विफल हो, तो उसका हिस्सा निकालने के लिए इंतज़ार करता है, और बाकी सौदा पूरा हो जाता है।' },
          { label: 'हमलों के विरुद्ध परखा गया।', body: 'हर ज्ञात हमले के लिए एक टेस्ट है जिसे कॉन्ट्रैक्ट को पास करना होता है। इनवेरिएंट टेस्ट जाँचते हैं कि पैसा सुरक्षित रहता है और हर सौदा समाप्त हो सकता है।' },
          { label: 'ऑडिट।', body: 'मेननेट से पहले आंतरिक ऑडिट के दौर, और सीमाएँ बढ़ाने से पहले बाहरी ऑडिट।' },
        ],
      },
    ],
    callout: {
      title: 'टेस्टनेट का समय',
      body: 'टेस्टनेट पर जाँच का समय 5 मिनट है, ताकि आप एक ही बार में पूरा सौदा देख सकें। मेननेट पर जाँच का समय उन शर्तों का हिस्सा है जिन पर आप दोनों भुगतान से पहले सहमत होते हैं।',
    },
  },
  sw: {
    nav: { label: 'Muundo wa escrow', blurb: 'Jinsi mkataba unavyoshikilia mpango' },
    eyebrow: 'Muundo wa escrow',
    title: 'Jinsi mpango wako unavyolindwa',
    status: 'Muundo wa mtandao mkuu, unakaguliwa. Bado haujaanza kutumika. Escrow ya mtandao wa majaribio leo inafuata mtiririko huo huo kwa muda mfupi wa maonyesho.',
    intro:
      'Karwan haiweki kamwe pesa za mpango katika akaunti yake yenyewe. Mnunuzi analipa kwenye mkataba wa escrow kwenye Arc, na ni masharti tu ambayo pande zote mbili zilikubaliana yanayoweza kuzitoa. Ukurasa huu unaeleza escrow ambayo Karwan inaiandaa kwa mtandao mkuu.',
    sections: [
      {
        heading: 'Nani anashikilia nini',
        intro: '',
        items: [
          { label: 'Wallet yako.', body: 'Akaunti za barua pepe zinatumia smart wallet ya passkey ambayo ni wewe tu unaweza kuitia sahihi. Akaunti za Web3 zinatumia wallet yako mwenyewe.' },
          { label: 'Pesa za mpango.', body: 'Zinashikiliwa na mkataba wa escrow tangu malipo hadi kutolewa. Karwan haiwezi kuzihamisha nje ya sheria za ukurasa huu.' },
          { label: 'Mawakala.', body: 'Ni hiari. Wallet ya wakala inaendeshwa na Karwan na inatenda ndani ya mipaka unayoweka tu. Unaweza kila wakati kutenda kwenye mpango wako moja kwa moja kutoka kwenye wallet yako.' },
        ],
      },
      {
        heading: 'Masharti ndiyo mpango',
        intro:
          'Kabla ya malipo yoyote, pande zote mbili zinakubaliana masharti. Mkataba unayahifadhi wakati wa kulipa, na muuzaji anathibitisha masharti yale yale kwenye mnyororo. Hakuna anayeweza kuyabadilisha baadaye, ikiwemo Karwan.',
        items: [
          { label: 'Bei na hatua.', body: 'Kiasi, na jinsi kinavyogawanywa katika malipo yasiyozidi matano.' },
          { label: 'Tarehe ya kuwasilisha.', body: 'Kila uwasilishaji unatakiwa lini, na muda mfupi wa ziada baada yake.' },
          { label: 'Muda wa kukagua.', body: 'Muda alionao mnunuzi kukagua kila uwasilishaji. Unaanza wakati wa kuwasilisha, au bidhaa inapofika kwa bidhaa halisi.' },
          { label: 'Muda zaidi.', body: 'Mara ngapi mnunuzi anaweza kuongeza muda wa kukagua, na kwa kiasi gani.' },
          { label: 'Malipo ya mwisho.', body: 'Kama malipo ya mwisho yanaweza kutolewa muda wa kukagua ukiisha, au yanahitaji mnunuzi. Mipango mikubwa huhitaji mnunuzi kila wakati.' },
          { label: 'Mnunuzi akinyamaza.', body: 'Baada ya muda uliowekwa bila kutoa malipo wala mgogoro, muuzaji anaweza kulipwa, ili mpango usikwame milele.' },
        ],
      },
      {
        heading: 'Jinsi mpango unavyoendelea',
        intro: '',
        items: [
          { label: 'Kukubaliana.', body: 'Eleza unachotaka, bei, hatua na muda.' },
          { label: 'Kulipa.', body: 'Mnunuzi analipa kwenye mkataba. Muuzaji anathibitisha masharti.' },
          { label: 'Kuwasilisha.', body: 'Muuzaji anawasilisha na kuweka alama. Muda wa kukagua unaanza.' },
          { label: 'Kukagua.', body: 'Ukaguzi wa uwasilishaji unalinganisha kilichowasilishwa na masharti, na mnunuzi anaarifiwa ili akague pia. Mnunuzi anaweza kutoa malipo, kuomba muda zaidi, au kufungua mgogoro.' },
          { label: 'Kulipwa.', body: 'Mnunuzi anatoa malipo, au malipo yanatolewa muda wa kukagua ukiisha, kama masharti yanavyosema.' },
        ],
      },
      {
        heading: 'Kunapokuwa na tatizo',
        intro: '',
        items: [
          { label: 'Uamuzi wa moja kwa moja.', body: 'Upande wowote unaweza kufungua mgogoro na muda unasimama. Injini ya migogoro inasoma masharti, tarehe na ushahidi wa uwasilishaji, na inapendekeza mgawanyo pamoja na sababu kwa pande zote mbili.' },
          { label: 'Muda wa kukata rufaa.', body: 'Pendekezo linaanza kutumika tu baada ya muda wa rufaa. Upande wowote unaweza kulipandisha kabla ya hapo.' },
          { label: 'Ukaguzi wa msimamizi.', body: 'Mgogoro uliopandishwa unaenda kwa mtu. Mmoja wa wakaguzi wanne waliotajwa anatia sahihi uamuzi wa mwisho, na sababu inaelezwa kwa pande zote mbili.' },
          { label: 'Kama hakuna anayeamua.', body: 'Baada ya muda wa mgogoro kuisha, upande wowote unaweza kufunga mgogoro, na mpango unaendelea pale ulipoishia. Uwasilishaji uliofanywa kwa wakati unabaki.' },
        ],
      },
      {
        heading: 'Wasimamizi wa Karwan wanaweza na hawawezi nini',
        intro: '',
        items: [
          { label: 'Kuamua migogoro iliyopandishwa.', body: 'Kwa kugawanya tu kiasi ambacho hakijalipwa kati ya mnunuzi na muuzaji wa mpango huo.' },
          { label: 'Kusimamisha mipango mipya.', body: 'Wakati wa dharura. Kusimamisha hakuzuii kamwe kutoa malipo, kurejesha pesa au kudai kwenye mpango uliopo.' },
          { label: 'Kubadilisha mipangilio.', body: 'Ada (kamwe si zaidi ya 10%), mipaka na anwani za wakaguzi, kupitia multisig na muda wa kusubiri, na kwa mipango ya baadaye tu.' },
          { label: 'Kamwe.', body: 'Kutuma pesa za mpango popote isipokuwa kwa mnunuzi na muuzaji wa mpango huo, akaunti ya ada, au mfadhili aliyechaguliwa na muuzaji.' },
        ],
      },
      {
        heading: 'Umejengwa ili ukaguliwe',
        intro: '',
        items: [
          { label: 'Mipaka mwanzoni.', body: 'Mtandao mkuu unaanza na kikomo kwa kila mpango na kikomo cha jumla inayoshikiliwa, vinavyoongezwa hatua kwa hatua.' },
          { label: 'Malipo hayakwami.', body: 'Malipo kwa upande mmoja yakishindwa, sehemu yake inasubiri aitoe, na sehemu iliyobaki ya mpango inakamilika.' },
          { label: 'Umejaribiwa dhidi ya mashambulizi.', body: 'Kila shambulizi linalojulikana lina jaribio ambalo mkataba lazima upite. Majaribio ya invariant yanahakikisha pesa zinahifadhiwa na kila mpango unaweza kuisha.' },
          { label: 'Ukaguzi.', body: 'Duru za ukaguzi wa ndani kabla ya mtandao mkuu, na ukaguzi wa nje kabla ya kuongeza mipaka.' },
        ],
      },
    ],
    callout: {
      title: 'Muda kwenye mtandao wa majaribio',
      body: 'Kwenye mtandao wa majaribio, muda wa kukagua ni dakika 5 ili uone mpango mzima kwa mara moja. Kwenye mtandao mkuu, muda wa kukagua ni sehemu ya masharti mnayokubaliana kabla ya kulipa.',
    },
  },
};
