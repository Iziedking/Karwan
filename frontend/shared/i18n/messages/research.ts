import type { Check, Payer, Role, Share, Signal } from '../../../features/research/researchForm';

export interface ResearchCopy {
  kicker: string;
  title: string;
  lead: string;
  step: string;
  pickAll: string;
  q1: string;
  roles: Record<Role, string>;
  q2: string;
  checks: Record<Check, string>;
  otherLabel: string;
  q3: string;
  trustLabel: string;
  fakeLabel: string;
  signals: Record<Signal, string>;
  q4: string;
  share: Record<Share, string>;
  q5: string;
  payer: Record<Payer, string>;
  payerNote: string;
  contactTitle: string;
  optional: string;
  contactPlaceholder: string;
  contactNote: string;
  send: string;
  sending: string;
  required: string;
  pickOne: string;
  fixAbove: string;
  failed: string;
  tooMany: string;
  thanksTitle: string;
  thanksBody: string;
  home: string;
}

const en: ResearchCopy = {
  kicker: 'Karwan research · 2 minutes',
  title: 'How do you know who to trust online before you deal with them?',
  lead: 'Five questions. No sign-up. Your answers are anonymous.',
  step: 'Question {n} of 5',
  pickAll: 'Pick all that apply',
  q1: 'Which describes you best?',
  roles: { seller: 'I sell my work or goods', buyer: 'I hire people or buy from them', both: 'I do both', platform: 'I run a marketplace or platform' },
  q2: 'Before you deal with someone new online, what do you check?',
  checks: {
    reviews: 'Reviews or star ratings',
    past_work: 'Samples of past work',
    vouch: 'Someone I know vouches for them',
    id: 'Their ID or business registration',
    test_job: 'A small test job first',
    nothing: 'Nothing, I take the risk',
    other: 'Something else',
  },
  otherLabel: 'What else do you check?',
  q3: 'Which do you trust most, and which is easiest to fake?',
  trustLabel: 'Trust most',
  fakeLabel: 'Easiest to fake',
  signals: { reviews: 'Reviews', past_work: 'Past work', vouch: 'Someone vouches', id: 'ID or registration', test_job: 'A test job' },
  q4: 'Would you let your good record follow you to other apps?',
  share: { yes: 'Yes, gladly', if_i_choose: 'Yes, if I choose what is shared', one_deal: 'Only for one deal at a time', no: 'No' },
  q5: 'When someone checks your record before a deal, who should pay for the check?',
  payer: { checker: 'The person checking', app: 'The app they use', free: 'No one, it should be free', not_sure: 'Not sure' },
  payerNote: 'You never pay to have your own record checked.',
  contactTitle: 'Can we follow up?',
  optional: 'Optional',
  contactPlaceholder: 'Email or WhatsApp number',
  contactNote: 'Only used to ask about your answers.',
  send: 'Send answers',
  sending: 'Sending',
  required: 'Choose an answer.',
  pickOne: 'Pick at least one.',
  fixAbove: 'Answer the questions marked above.',
  failed: "Your answers didn't send. Try again.",
  tooMany: 'Too many answers from this connection. Try again in an hour.',
  thanksTitle: 'Thank you',
  thanksBody: 'Your answers help us build a record people can trust.',
  home: 'Go to Karwan',
};

const fr: ResearchCopy = {
  kicker: 'Recherche Karwan · 2 minutes',
  title: 'Comment savoir à qui faire confiance en ligne avant de traiter avec quelqu’un ?',
  lead: 'Cinq questions. Sans inscription. Vos réponses sont anonymes.',
  step: 'Question {n} sur 5',
  pickAll: 'Choisissez tout ce qui s’applique',
  q1: 'Qu’est-ce qui vous décrit le mieux ?',
  roles: { seller: 'Je vends mon travail ou des produits', buyer: 'J’engage des gens ou j’achète auprès d’eux', both: 'Les deux', platform: 'Je gère une place de marché ou une plateforme' },
  q2: 'Avant de traiter avec une nouvelle personne en ligne, que vérifiez-vous ?',
  checks: {
    reviews: 'Les avis ou les notes',
    past_work: 'Des exemples de travaux',
    vouch: 'Une personne que je connais se porte garante',
    id: 'Sa pièce d’identité ou son immatriculation',
    test_job: 'Une petite mission test d’abord',
    nothing: 'Rien, je prends le risque',
    other: 'Autre chose',
  },
  otherLabel: 'Que vérifiez-vous d’autre ?',
  q3: 'À quoi faites-vous le plus confiance, et qu’est-ce qui est le plus facile à falsifier ?',
  trustLabel: 'Le plus fiable',
  fakeLabel: 'Le plus facile à falsifier',
  signals: { reviews: 'Les avis', past_work: 'Les travaux passés', vouch: 'Une recommandation', id: 'Identité ou immatriculation', test_job: 'Une mission test' },
  q4: 'Laisseriez-vous votre bon historique vous suivre sur d’autres applications ?',
  share: { yes: 'Oui, volontiers', if_i_choose: 'Oui, si je choisis ce qui est partagé', one_deal: 'Seulement pour un accord à la fois', no: 'Non' },
  q5: 'Quand quelqu’un vérifie votre historique avant un accord, qui devrait payer cette vérification ?',
  payer: { checker: 'La personne qui vérifie', app: 'L’application qu’elle utilise', free: 'Personne, ce devrait être gratuit', not_sure: 'Je ne sais pas' },
  payerNote: 'Vous ne payez jamais pour la vérification de votre propre historique.',
  contactTitle: 'Pouvons-nous vous recontacter ?',
  optional: 'Facultatif',
  contactPlaceholder: 'E-mail ou numéro WhatsApp',
  contactNote: 'Utilisé uniquement pour vous poser des questions sur vos réponses.',
  send: 'Envoyer les réponses',
  sending: 'Envoi',
  required: 'Choisissez une réponse.',
  pickOne: 'Choisissez au moins une réponse.',
  fixAbove: 'Répondez aux questions signalées plus haut.',
  failed: 'Vos réponses n’ont pas été envoyées. Réessayez.',
  tooMany: 'Trop de réponses depuis cette connexion. Réessayez dans une heure.',
  thanksTitle: 'Merci',
  thanksBody: 'Vos réponses nous aident à bâtir un historique digne de confiance.',
  home: 'Aller sur Karwan',
};

const ar: ResearchCopy = {
  kicker: 'بحث Karwan · دقيقتان',
  title: 'كيف تعرف بمن تثق على الإنترنت قبل أن تتعامل معه؟',
  lead: 'خمسة أسئلة. بلا تسجيل. إجاباتك مجهولة الهوية.',
  step: 'السؤال {n} من 5',
  pickAll: 'اختر كل ما ينطبق',
  q1: 'ما الذي يصفك بشكل أفضل؟',
  roles: { seller: 'أبيع عملي أو بضائعي', buyer: 'أوظف أشخاصًا أو أشتري منهم', both: 'كلاهما', platform: 'أدير سوقًا أو منصة' },
  q2: 'قبل أن تتعامل مع شخص جديد على الإنترنت، ماذا تتحقق منه؟',
  checks: {
    reviews: 'المراجعات أو التقييمات',
    past_work: 'نماذج من أعمال سابقة',
    vouch: 'شخص أعرفه يزكيه',
    id: 'هويته أو تسجيل نشاطه التجاري',
    test_job: 'مهمة تجريبية صغيرة أولًا',
    nothing: 'لا شيء، أتحمل المخاطرة',
    other: 'شيء آخر',
  },
  otherLabel: 'ماذا تتحقق منه أيضًا؟',
  q3: 'بماذا تثق أكثر، وما الأسهل تزويرًا؟',
  trustLabel: 'الأكثر ثقة',
  fakeLabel: 'الأسهل تزويرًا',
  signals: { reviews: 'المراجعات', past_work: 'الأعمال السابقة', vouch: 'تزكية شخص', id: 'الهوية أو التسجيل', test_job: 'مهمة تجريبية' },
  q4: 'هل تسمح لسجلك الجيد بأن يرافقك إلى تطبيقات أخرى؟',
  share: { yes: 'نعم، بكل سرور', if_i_choose: 'نعم، إذا اخترت ما يُشارك', one_deal: 'فقط لصفقة واحدة في كل مرة', no: 'لا' },
  q5: 'عندما يتحقق أحد من سجلك قبل صفقة، من يجب أن يدفع مقابل التحقق؟',
  payer: { checker: 'الشخص الذي يتحقق', app: 'التطبيق الذي يستخدمه', free: 'لا أحد، يجب أن يكون مجانيًا', not_sure: 'لست متأكدًا' },
  payerNote: 'لا تدفع أبدًا مقابل التحقق من سجلك.',
  contactTitle: 'هل يمكننا التواصل معك لاحقًا؟',
  optional: 'اختياري',
  contactPlaceholder: 'البريد الإلكتروني أو رقم واتساب',
  contactNote: 'يُستخدم فقط للسؤال عن إجاباتك.',
  send: 'أرسل الإجابات',
  sending: 'جارٍ الإرسال',
  required: 'اختر إجابة.',
  pickOne: 'اختر إجابة واحدة على الأقل.',
  fixAbove: 'أجب عن الأسئلة المحددة أعلاه.',
  failed: 'لم تُرسل إجاباتك. حاول مرة أخرى.',
  tooMany: 'إجابات كثيرة من هذا الاتصال. حاول بعد ساعة.',
  thanksTitle: 'شكرًا لك',
  thanksBody: 'تساعدنا إجاباتك على بناء سجل يثق به الناس.',
  home: 'انتقل إلى Karwan',
};

const hi: ResearchCopy = {
  kicker: 'Karwan शोध · 2 मिनट',
  title: 'ऑनलाइन किसी से सौदा करने से पहले आप कैसे जानते हैं कि किस पर भरोसा करें?',
  lead: 'पाँच सवाल। कोई साइन-अप नहीं। आपके जवाब गुमनाम हैं।',
  step: 'सवाल {n} / 5',
  pickAll: 'जितने लागू हों सब चुनें',
  q1: 'आपका सबसे अच्छा वर्णन कौन-सा है?',
  roles: { seller: 'अपना काम या सामान बेचना', buyer: 'लोगों को काम पर रखना या उनसे खरीदना', both: 'दोनों', platform: 'मार्केटप्लेस या प्लेटफ़ॉर्म चलाना' },
  q2: 'ऑनलाइन किसी नए व्यक्ति से सौदा करने से पहले आप क्या जाँचते हैं?',
  checks: {
    reviews: 'रिव्यू या स्टार रेटिंग',
    past_work: 'पिछले काम के नमूने',
    vouch: 'मेरा कोई परिचित उनकी गारंटी देता है',
    id: 'उनकी आईडी या व्यवसाय पंजीकरण',
    test_job: 'पहले एक छोटा टेस्ट काम',
    nothing: 'कुछ नहीं, जोखिम उठाना',
    other: 'कुछ और',
  },
  otherLabel: 'आप और क्या जाँचते हैं?',
  q3: 'आप किस पर सबसे ज़्यादा भरोसा करते हैं, और किसे नकली बनाना सबसे आसान है?',
  trustLabel: 'सबसे भरोसेमंद',
  fakeLabel: 'नकली बनाना सबसे आसान',
  signals: { reviews: 'रिव्यू', past_work: 'पिछला काम', vouch: 'किसी की गारंटी', id: 'आईडी या पंजीकरण', test_job: 'टेस्ट काम' },
  q4: 'क्या आप अपने अच्छे रिकॉर्ड को दूसरे ऐप्स तक साथ ले जाने देंगे?',
  share: { yes: 'हाँ, खुशी से', if_i_choose: 'हाँ, अगर मैं चुनूँ कि क्या साझा हो', one_deal: 'एक समय में केवल एक सौदे के लिए', no: 'नहीं' },
  q5: 'जब कोई सौदे से पहले आपका रिकॉर्ड जाँचता है, तो उस जाँच का भुगतान किसे करना चाहिए?',
  payer: { checker: 'जाँच करने वाला व्यक्ति', app: 'वह ऐप जिसका वे उपयोग करते हैं', free: 'कोई नहीं, यह मुफ़्त होना चाहिए', not_sure: 'पक्का नहीं' },
  payerNote: 'अपने रिकॉर्ड की जाँच के लिए आप कभी भुगतान नहीं करते।',
  contactTitle: 'क्या हम आपसे बाद में संपर्क कर सकते हैं?',
  optional: 'वैकल्पिक',
  contactPlaceholder: 'ईमेल या WhatsApp नंबर',
  contactNote: 'केवल आपके जवाबों के बारे में पूछने के लिए।',
  send: 'जवाब भेजें',
  sending: 'भेजा जा रहा है',
  required: 'एक जवाब चुनें।',
  pickOne: 'कम से कम एक चुनें।',
  fixAbove: 'ऊपर चिह्नित सवालों के जवाब दें।',
  failed: 'आपके जवाब नहीं भेजे जा सके। फिर कोशिश करें।',
  tooMany: 'इस कनेक्शन से बहुत अधिक जवाब। एक घंटे बाद कोशिश करें।',
  thanksTitle: 'धन्यवाद',
  thanksBody: 'आपके जवाब हमें ऐसा रिकॉर्ड बनाने में मदद करते हैं जिस पर लोग भरोसा कर सकें।',
  home: 'Karwan पर जाएँ',
};

const sw: ResearchCopy = {
  kicker: 'Utafiti wa Karwan · dakika 2',
  title: 'Unajuaje nani wa kumwamini mtandaoni kabla ya kufanya naye biashara?',
  lead: 'Maswali matano. Bila kujisajili. Majibu yako hayana jina.',
  step: 'Swali {n} kati ya 5',
  pickAll: 'Chagua yote yanayohusika',
  q1: 'Ni lipi linalokuelezea vizuri zaidi?',
  roles: { seller: 'Ninauza kazi yangu au bidhaa', buyer: 'Ninaajiri watu au kununua kutoka kwao', both: 'Yote mawili', platform: 'Ninaendesha soko au jukwaa' },
  q2: 'Kabla ya kufanya biashara na mtu mpya mtandaoni, unaangalia nini?',
  checks: {
    reviews: 'Maoni au nyota za ukadiriaji',
    past_work: 'Mifano ya kazi za awali',
    vouch: 'Mtu ninayemjua anamthibitisha',
    id: 'Kitambulisho chake au usajili wa biashara',
    test_job: 'Kazi ndogo ya majaribio kwanza',
    nothing: 'Hakuna, ninakubali hatari',
    other: 'Kitu kingine',
  },
  otherLabel: 'Unaangalia nini kingine?',
  q3: 'Unaamini nini zaidi, na ni kipi rahisi zaidi kughushi?',
  trustLabel: 'Ninaamini zaidi',
  fakeLabel: 'Rahisi kughushi',
  signals: { reviews: 'Maoni', past_work: 'Kazi za awali', vouch: 'Mtu anamthibitisha', id: 'Kitambulisho au usajili', test_job: 'Kazi ya majaribio' },
  q4: 'Je, ungeruhusu rekodi yako nzuri ikufuate kwenye programu nyingine?',
  share: { yes: 'Ndiyo, kwa furaha', if_i_choose: 'Ndiyo, nikichagua kinachoshirikiwa', one_deal: 'Kwa biashara moja tu kwa wakati', no: 'Hapana' },
  q5: 'Mtu anapoangalia rekodi yako kabla ya biashara, nani anapaswa kulipia ukaguzi huo?',
  payer: { checker: 'Mtu anayeangalia', app: 'Programu anayotumia', free: 'Hakuna, iwe bure', not_sure: 'Sina uhakika' },
  payerNote: 'Hulipii kamwe ukaguzi wa rekodi yako mwenyewe.',
  contactTitle: 'Tunaweza kuwasiliana nawe baadaye?',
  optional: 'Si lazima',
  contactPlaceholder: 'Barua pepe au namba ya WhatsApp',
  contactNote: 'Inatumika tu kukuuliza kuhusu majibu yako.',
  send: 'Tuma majibu',
  sending: 'Inatuma',
  required: 'Chagua jibu.',
  pickOne: 'Chagua angalau moja.',
  fixAbove: 'Jibu maswali yaliyowekwa alama hapo juu.',
  failed: 'Majibu yako hayakutumwa. Jaribu tena.',
  tooMany: 'Majibu mengi kutoka muunganisho huu. Jaribu tena baada ya saa moja.',
  thanksTitle: 'Asante',
  thanksBody: 'Majibu yako yanatusaidia kujenga rekodi ambayo watu wanaweza kuiamini.',
  home: 'Nenda Karwan',
};

export const researchCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', ResearchCopy> = { en, ar, fr, hi, sw };
