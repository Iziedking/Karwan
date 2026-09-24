export interface ProtectionCopy {
  title: string;
  introduction: string;
  disclaimer: string;
  topics: Record<'escrow' | 'milestones' | 'disputes' | 'agents', { title: string; detail: string }>;
}

export const protectionCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', ProtectionCopy> = {
  en: {
    title: 'What happens to the payment',
    introduction: 'Agree the terms, fund the deal, review each delivery.',
    disclaimer: 'The signed agreement sets release and refund timing. Missing a deadline does not automatically refund a payment.',
    topics: {
      escrow: { title: 'A funded agreement', detail: 'See the USDC held for a deal alongside the terms both sides accepted.' },
      milestones: { title: 'Delivery by milestone', detail: 'Each stage names the work, amount and review point before payment is released.' },
      disputes: { title: 'A way to raise a dispute', detail: 'If delivery is contested, raise it from the deal so the terms and evidence can be reviewed.' },
      agents: { title: 'Your decision', detail: 'Agents can prepare checks and suggestions. You approve actions that move money.' },
    },
  },
  ar: {
    title: 'ماذا يحدث للدفعة',
    introduction: 'اتفقوا على الشروط، موّلوا الصفقة، وراجعوا كل تسليم.',
    disclaimer: 'تحدد الاتفاقية الموقعة مواعيد صرف الدفعات واستردادها. لا يؤدي تجاوز الموعد إلى استرداد تلقائي.',
    topics: {
      escrow: { title: 'اتفاقية ممولة', detail: 'اطّلع على مبلغ USDC المحتفظ به للصفقة بجانب الشروط التي وافق عليها الطرفان.' },
      milestones: { title: 'تسليم على مراحل', detail: 'تحدد كل مرحلة العمل والمبلغ ووقت المراجعة قبل صرف الدفعة.' },
      disputes: { title: 'طريقة لرفع النزاع', detail: 'إذا كان التسليم موضع خلاف، ارفع النزاع من الصفقة لمراجعة الشروط والأدلة.' },
      agents: { title: 'القرار لك', detail: 'يمكن للوكلاء إعداد الفحوص والاقتراحات. أنت توافق على الإجراءات التي تحرك الأموال.' },
    },
  },
  fr: {
    title: 'Ce qui arrive au paiement',
    introduction: 'Convenez des conditions, financez l’accord et examinez chaque livraison.',
    disclaimer: 'L’accord signé fixe les délais de versement et de remboursement. Une échéance manquée ne déclenche pas un remboursement automatique.',
    topics: {
      escrow: { title: 'Un accord financé', detail: 'Voyez les USDC retenus pour l’accord avec les conditions acceptées par les deux parties.' },
      milestones: { title: 'Livraison par étape', detail: 'Chaque étape précise le travail, le montant et le moment de l’examen avant le versement.' },
      disputes: { title: 'Signaler un litige', detail: 'Si la livraison est contestée, signalez-le depuis l’accord pour faire examiner les conditions et les preuves.' },
      agents: { title: 'Vous décidez', detail: 'Les agents peuvent préparer des vérifications et des suggestions. Vous approuvez les actions qui déplacent des fonds.' },
    },
  },
  hi: {
    title: 'भुगतान के साथ क्या होता है',
    introduction: 'शर्तें तय करें, सौदे में धन जमा करें और हर डिलीवरी की समीक्षा करें।',
    disclaimer: 'हस्ताक्षरित समझौता भुगतान जारी करने और वापसी का समय तय करता है। समय सीमा चूकने से अपने आप धन वापस नहीं होता।',
    topics: {
      escrow: { title: 'धन जमा किया गया समझौता', detail: 'दोनों पक्षों की स्वीकृत शर्तों के साथ सौदे के लिए रोकी गई USDC राशि देखें।' },
      milestones: { title: 'चरणों में डिलीवरी', detail: 'हर चरण में काम, राशि और भुगतान जारी होने से पहले समीक्षा का समय बताया जाता है।' },
      disputes: { title: 'विवाद उठाने का रास्ता', detail: 'डिलीवरी पर असहमति हो तो शर्तों और सबूतों की समीक्षा के लिए सौदे से विवाद उठाएँ।' },
      agents: { title: 'निर्णय आपका', detail: 'एजेंट जाँच और सुझाव तैयार कर सकते हैं। धन भेजने वाले कामों को आप मंज़ूरी देते हैं।' },
    },
  },
  sw: {
    title: 'Kinachotokea kwa malipo',
    introduction: 'Kubalianeni masharti, fadhilini mkataba, kisha kagueni kila kilichowasilishwa.',
    disclaimer: 'Makubaliano yaliyosainiwa huweka muda wa kutoa au kurudisha malipo. Kukosa tarehe ya mwisho hakurudishi fedha moja kwa moja.',
    topics: {
      escrow: { title: 'Makubaliano yaliyofadhiliwa', detail: 'Ona kiasi cha USDC kilichowekwa kwa mkataba pamoja na masharti yaliyokubaliwa na pande zote.' },
      milestones: { title: 'Uwasilishaji kwa hatua', detail: 'Kila hatua hutaja kazi, kiasi na wakati wa ukaguzi kabla malipo hayajatolewa.' },
      disputes: { title: 'Njia ya kuibua mgogoro', detail: 'Ikiwa uwasilishaji unapingwa, ibua mgogoro kwenye mkataba ili masharti na ushahidi vikaguliwe.' },
      agents: { title: 'Uamuzi ni wako', detail: 'Mawakala wanaweza kuandaa ukaguzi na mapendekezo. Unaidhinisha hatua zinazohamisha fedha.' },
    },
  },
};
