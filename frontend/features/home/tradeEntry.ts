import type { Locale } from '@/shared/i18n/locales';

export const tradeEntryRoutes = (business: boolean) => ({
  sell: business ? '/supply' : '/seller#post-listing',
  buy: business ? '/partners' : '/buyer?mode=managed#new-deal',
  agreement: business ? '/buyer?mode=direct#bring-a-deal' : '/buyer?mode=direct#new-deal',
});

type Copy = { title: string; body: string; sell: string; sellBody: string; buy: string; buyBody: string;
  agreement: string; scope: string; tools: string; options: string; buyTitle: string; sellTitle: string; businessBuyBody: string };

export const TRADE_ENTRY_COPY: Record<Locale, Copy> = {
  en: {
    options: 'Optional request settings',
    title: 'What would you like to trade?',
    body: 'Tell Karwan what you need or offer. Review the match and agree the deal before payment.',
    sell: 'Find customers', sellBody: 'List your product or service so buyers on Karwan can find you.',
    buy: 'Find something to buy', buyBody: 'Describe what you need, your budget and your deadline.',
    businessBuyBody: 'Browse what businesses offer on Karwan, then agree a deal.',
    agreement: 'I already have an agreement',
    scope: 'Matching starts within Karwan. Finding customers across other websites is planned.',
    tools: 'Balance and optional research', buyTitle: 'What do you need?', sellTitle: 'What do you offer?',
  },
  fr: {
    options: 'Réglages facultatifs de la demande',
    title: 'Que souhaitez-vous échanger ?',
    body: 'Dites à Karwan ce que vous cherchez ou proposez. Examinez la mise en relation et convenez des conditions avant de payer.',
    sell: 'Trouver des clients', sellBody: 'Publiez votre produit ou service pour que les acheteurs sur Karwan vous trouvent.',
    buy: 'Trouver quoi acheter', buyBody: 'Décrivez votre besoin, votre budget et votre échéance.',
    businessBuyBody: 'Parcourez les offres des entreprises sur Karwan, puis convenez d’un accord.',
    agreement: 'J’ai déjà un accord',
    scope: 'Les mises en relation se font sur Karwan. La recherche de clients sur d’autres sites est prévue.',
    tools: 'Solde et recherche facultative', buyTitle: 'De quoi avez-vous besoin ?', sellTitle: 'Que proposez-vous ?',
  },
  ar: {
    options: 'إعدادات الطلب الاختيارية',
    title: 'ماذا تريد أن تتاجر؟',
    body: 'أخبر Karwan بما تحتاجه أو تقدمه. راجع الطرف المقترح واتفق على الصفقة قبل الدفع.',
    sell: 'ابحث عن عملاء', sellBody: 'اعرض منتجك أو خدمتك ليجدك المشترون على Karwan.',
    buy: 'ابحث عما تشتريه', buyBody: 'صف ما تحتاجه وحدد ميزانيتك وموعد التسليم.',
    businessBuyBody: 'تصفح عروض الشركات على Karwan، ثم اتفق على صفقة.',
    agreement: 'لدي اتفاق بالفعل',
    scope: 'تبدأ المطابقة داخل Karwan. البحث عن عملاء عبر مواقع أخرى ضمن الخطط المستقبلية.',
    tools: 'الرصيد والبحث الاختياري', buyTitle: 'ماذا تحتاج؟', sellTitle: 'ماذا تقدم؟',
  },
  hi: {
    options: 'अनुरोध की वैकल्पिक सेटिंग',
    title: 'आप क्या खरीदना या बेचना चाहते हैं?',
    body: 'Karwan को बताएं कि आपको क्या चाहिए या आप क्या देते हैं। भुगतान से पहले मिलान देखें और सौदे की शर्तें तय करें।',
    sell: 'ग्राहक खोजें', sellBody: 'अपना उत्पाद या सेवा सूचीबद्ध करें ताकि Karwan के खरीदार आपको खोज सकें।',
    buy: 'खरीदने के लिए खोजें', buyBody: 'अपनी ज़रूरत, बजट और समय सीमा बताएं।',
    businessBuyBody: 'Karwan पर व्यवसायों की पेशकश देखें, फिर सौदे की शर्तें तय करें।',
    agreement: 'मेरा समझौता पहले से है',
    scope: 'मिलान अभी Karwan के भीतर होता है। दूसरी वेबसाइटों पर ग्राहक खोजना भविष्य की योजना है।',
    tools: 'शेष राशि और वैकल्पिक शोध', buyTitle: 'आपको क्या चाहिए?', sellTitle: 'आप क्या देते हैं?',
  },
  sw: {
    options: 'Mipangilio ya hiari ya ombi',
    title: 'Ungependa kununua au kuuza nini?',
    body: 'Iambie Karwan unachohitaji au unachotoa. Kagua mlingano na ukubaliane kuhusu biashara kabla ya malipo.',
    sell: 'Tafuta wateja', sellBody: 'Orodhesha bidhaa au huduma yako ili wanunuzi wa Karwan wakupate.',
    buy: 'Tafuta cha kununua', buyBody: 'Eleza unachohitaji, bajeti yako na tarehe ya mwisho.',
    businessBuyBody: 'Angalia bidhaa na huduma za biashara kwenye Karwan, kisha ukubaliane kuhusu biashara.',
    agreement: 'Tayari nina makubaliano',
    scope: 'Ulinganishaji unaanza ndani ya Karwan. Kutafuta wateja kwenye tovuti nyingine kumepangwa.',
    tools: 'Salio na utafiti wa hiari', buyTitle: 'Unahitaji nini?', sellTitle: 'Unatoa nini?',
  },
};
