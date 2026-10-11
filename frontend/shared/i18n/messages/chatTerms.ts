export interface ChatTermsCopy {
  title: string;
  intro: string;
  version: string;
  sections: { heading: string; body: string }[];
}

/// Terms for the Karwan agent in chat, version chat-2026-10-12 (Telegram).
/// The English text is the one the owner approves; translations follow it.
/// The version matches CHAT_TERMS_VERSION in backend/src/channels/identity.ts.
const en: ChatTermsCopy = {
  title: 'The Karwan agent in chat',
  intro: 'These terms cover the free beta of the Karwan agent on Telegram. Accepting them in chat creates your Karwan account.',
  version: 'Version chat-2026-10-12',
  sections: [
    {
      heading: 'What the agent does',
      body: 'The agent registers what you sell or buy, checks your evidence, finds verified people for you, asks their agents about price, timeline and terms, and prepares deals. You decide. Agreements, delivery and disputes are steps you confirm in chat. Every step that moves money, such as paying into escrow, releasing, withdrawing or cancelling a funded deal, opens a one-time Karwan link, and you confirm it on Karwan, where you see every figure first.',
    },
    {
      heading: 'Your account and wallets',
      body: 'Your Telegram account is how you sign in, so anyone who controls it can act as you. Turn on two-step verification in Telegram. Karwan creates and holds three wallets for your account: one that identifies you, a buying balance and an earnings balance. Karwan signs for them when you confirm a step, and for the automatic outcomes you agreed to: a refund after a missed deadline, a release after the review window, and the seller’s acceptance of a deal you funded. You can move your money out under the rules in the next section, or connect your own wallet.',
    },
    {
      heading: 'Money leaving your account',
      body: 'To protect you if someone else gets into your Telegram, money leaves your account only to an address you added with your World ID, which you link at the person check. A new address can receive money 24 hours after you add it, and the chat tells you the moment it is added. Up to 500 USDC can leave your account in any 24 hours, counting payments into escrow. If you have been away for more than 60 days, you confirm with your World ID before money moves again. Every payment out is announced in chat with a button that pauses all payments out, which only your World ID can undo.',
    },
    {
      heading: 'Escrow on Arc',
      body: 'Deals are held in escrow on Arc. On Arc mainnet the escrow is a beta that has not been audited, with a limit of 1,000 USDC per deal and 10,000 USDC across all open deals. Deals of 100 USDC and above are not open in this beta. After a delivery, the buyer has at least three days to review before money can be released. Money in escrow goes only to the people in the deal, back to the buyer, or to Karwan as the fee shown before you pay, by the rules both of you agreed. On Arc testnet, deals use test USDC.',
    },
    {
      heading: 'Verification',
      body: 'Your level is decided by published rules, never by a language model. Anything you only say about yourself counts for nothing until it is checked. A past client’s confirmation counts only when that client has passed the person check. Other agents can only find you once your work is verified. Facts expire, and an expired fact stops counting.',
    },
    {
      heading: 'What we keep',
      body: 'We keep your Telegram user id, what you tell the agent, the results of each check and your deals. Invoices are read and then discarded: we keep only the details read from them and a fingerprint, so the same invoice cannot back two accounts. A past client answers only if they open the link you send them, from their own account. Machines match people on these details; other people do not see them.',
    },
    {
      heading: 'Your public record',
      body: 'Your record at karwan.site/r/your-tag shows your name, level, tier, fixed reasons and the verified facts with their proof on Arc. It never shows your Telegram account, documents, amounts or the names of your clients. Facts written to Arc carry no personal data.',
    },
    {
      heading: 'Deleting your data',
      body: 'Ask Karwan to delete your account, in chat or at karwan.site, and we handle the request. Facts already written to Arc carry no personal data.',
    },
    {
      heading: 'Your rights',
      body: 'We process your data with your consent, under the Nigeria Data Protection Act 2023 and the other laws that apply to you, only to verify you and to match and run your deals. The full Karwan terms at karwan.site/terms also apply.',
    },
  ],
};

const ar: ChatTermsCopy = {
  title: 'وكيل Karwan في المحادثة',
  intro: 'تغطي هذه الشروط النسخة التجريبية المجانية من وكيل Karwan على تيليغرام. قبولها في المحادثة ينشئ حسابك على Karwan.',
  version: 'الإصدار chat-2026-10-12',
  sections: [
    { heading: 'ما يفعله الوكيل', body: 'يسجّل الوكيل ما تبيعه أو تشتريه، ويفحص أدلتك، ويجد لك أشخاصًا موثّقين، ويسأل وكلاءهم عن السعر والمدة والشروط، ويُعدّ الصفقات. القرار لك. الاتفاقات والتسليم والنزاعات خطوات تؤكدها في المحادثة. كل خطوة تنقل المال، مثل الدفع إلى الضمان أو التحرير أو السحب أو إلغاء صفقة مموّلة، تفتح رابطًا لمرة واحدة إلى Karwan، وتؤكدها على Karwan حيث ترى كل رقم أولًا.' },
    { heading: 'حسابك ومحافظك', body: 'حسابك على تيليغرام هو طريقة دخولك، لذا يمكن لأي شخص يتحكم فيه أن يتصرف باسمك. فعّل التحقق بخطوتين في تيليغرام. تنشئ Karwan لحسابك ثلاث محافظ وتحتفظ بها: واحدة تعرّفك، ورصيد للشراء، ورصيد للأرباح. توقّع Karwan عنها عندما تؤكد خطوة، وللنتائج التلقائية التي وافقت عليها: استرداد بعد فوات موعد، وتحرير بعد انتهاء مدة المراجعة، وقبول البائع لصفقة موّلتها. يمكنك سحب أموالك وفق القواعد في القسم التالي، أو ربط محفظتك الخاصة.' },
    { heading: 'المال الخارج من حسابك', body: 'لحمايتك إذا دخل شخص آخر إلى حسابك على تيليغرام، لا يخرج المال من حسابك إلا إلى عنوان أضفته عبر World ID الذي تربطه في فحص الشخص. يمكن للعنوان الجديد استلام المال بعد 24 ساعة من إضافته، وتخبرك المحادثة لحظة إضافته. يمكن أن يخرج من حسابك حتى 500 USDC خلال أي 24 ساعة، بما في ذلك الدفع إلى الضمان. إذا غبت أكثر من 60 يومًا، تؤكد عبر World ID قبل أن يتحرك المال من جديد. يُعلَن عن كل دفعة خارجة في المحادثة مع زر يوقف كل المدفوعات الخارجة، ولا يرفع الإيقاف إلا World ID الخاص بك.' },
    { heading: 'الضمان على Arc', body: 'تُحفظ الصفقات في ضمان على Arc. على شبكة Arc الرئيسية، الضمان نسخة تجريبية لم تُدقَّق، بحد 1,000 USDC لكل صفقة و10,000 USDC لكل الصفقات المفتوحة. الصفقات من 100 USDC فأكثر غير متاحة في هذه النسخة التجريبية. بعد التسليم، أمام المشتري ثلاثة أيام على الأقل للمراجعة قبل أن يمكن تحرير المال. المال في الضمان يذهب فقط إلى طرفي الصفقة، أو يعود إلى المشتري، أو إلى Karwan كرسوم تظهر قبل أن تدفع، وفق القواعد التي اتفقتما عليها. على شبكة Arc التجريبية، تستخدم الصفقات USDC تجريبية.' },
    { heading: 'التحقق', body: 'يُحدَّد مستواك بقواعد منشورة، ولا يحدده نموذج لغوي أبدًا. ما تقوله عن نفسك فقط لا يُحتسب حتى يُفحص. لا يُحتسب تأكيد عميل سابق إلا إذا اجتاز ذلك العميل فحص الشخص. لا يجدك الوكلاء الآخرون إلا بعد التحقق من عملك. للحقائق مدة صلاحية، والحقيقة المنتهية لا تُحتسب.' },
    { heading: 'ما نحتفظ به', body: 'نحتفظ بمعرّف مستخدمك على تيليغرام، وما تقوله للوكيل، ونتائج كل فحص، وصفقاتك. تُقرأ الفواتير ثم تُحذف: نحتفظ فقط بالتفاصيل المقروءة منها وببصمة، كي لا تدعم الفاتورة نفسها حسابين. لا يجيب العميل السابق إلا إذا فتح الرابط الذي ترسله له، من حسابه الخاص. تطابق الآلات بين الناس بهذه التفاصيل، ولا يراها الآخرون.' },
    { heading: 'سجلك العام', body: 'يعرض سجلك على karwan.site/r/your-tag اسمك ومستواك ورتبتك وأسبابًا ثابتة والحقائق الموثّقة مع إثباتها على Arc. لا يعرض أبدًا حسابك على تيليغرام أو مستنداتك أو المبالغ أو أسماء عملائك. الحقائق المكتوبة على Arc لا تحمل بيانات شخصية.' },
    { heading: 'حذف بياناتك', body: 'اطلب من Karwan حذف حسابك، في المحادثة أو على karwan.site، وسنتولى الطلب. الحقائق المكتوبة على Arc لا تحمل بيانات شخصية.' },
    { heading: 'حقوقك', body: 'نعالج بياناتك بموافقتك، بموجب قانون حماية البيانات النيجيري لعام 2023 والقوانين الأخرى التي تنطبق عليك، فقط للتحقق منك ولمطابقة صفقاتك وتنفيذها. تنطبق أيضًا شروط Karwan الكاملة على karwan.site/terms.' },
  ],
};

const fr: ChatTermsCopy = {
  title: 'L’agent Karwan dans le chat',
  intro: 'Ces conditions couvrent la bêta gratuite de l’agent Karwan sur Telegram. Les accepter dans le chat crée votre compte Karwan.',
  version: 'Version chat-2026-10-12',
  sections: [
    { heading: 'Ce que fait l’agent', body: 'L’agent enregistre ce que vous vendez ou achetez, vérifie vos preuves, trouve pour vous des personnes vérifiées, demande à leurs agents le prix, le délai et les conditions, et prépare les deals. Vous décidez. Les accords, la livraison et les litiges sont des étapes que vous confirmez dans le chat. Chaque étape qui déplace de l’argent, comme payer l’escrow, libérer, retirer ou annuler un deal financé, ouvre un lien Karwan à usage unique, et vous la confirmez sur Karwan, où vous voyez chaque montant d’abord.' },
    { heading: 'Votre compte et vos portefeuilles', body: 'Votre compte Telegram sert à vous connecter : quiconque le contrôle peut agir en votre nom. Activez la vérification en deux étapes dans Telegram. Karwan crée et détient trois portefeuilles pour votre compte : un qui vous identifie, un solde d’achat et un solde de gains. Karwan signe pour eux quand vous confirmez une étape, et pour les issues automatiques que vous avez acceptées : un remboursement après un délai manqué, une libération après la période d’examen, et l’acceptation par le vendeur d’un deal que vous avez financé. Vous pouvez retirer votre argent selon les règles de la section suivante, ou connecter votre propre portefeuille.' },
    { heading: 'L’argent qui quitte votre compte', body: 'Pour vous protéger si quelqu’un d’autre accède à votre Telegram, l’argent ne quitte votre compte que vers une adresse que vous avez ajoutée avec votre World ID, que vous liez lors de la vérification de personne. Une nouvelle adresse peut recevoir de l’argent 24 heures après son ajout, et le chat vous prévient dès qu’elle est ajoutée. Jusqu’à 500 USDC peuvent quitter votre compte sur 24 heures, paiements vers l’escrow compris. Si vous êtes absent plus de 60 jours, vous confirmez avec votre World ID avant que l’argent ne bouge à nouveau. Chaque paiement sortant est annoncé dans le chat avec un bouton qui met en pause tous les paiements sortants, que seul votre World ID peut lever.' },
    { heading: 'L’escrow sur Arc', body: 'Les deals sont conservés dans un escrow sur Arc. Sur le mainnet Arc, l’escrow est une bêta qui n’a pas été auditée, avec une limite de 1 000 USDC par deal et de 10 000 USDC pour l’ensemble des deals ouverts. Les deals de 100 USDC et plus ne sont pas ouverts dans cette bêta. Après une livraison, l’acheteur dispose d’au moins trois jours d’examen avant que l’argent puisse être libéré. L’argent de l’escrow va seulement aux personnes du deal, revient à l’acheteur, ou va à Karwan comme frais affichés avant que vous payiez, selon les règles que vous avez acceptées tous les deux. Sur le testnet Arc, les deals utilisent des USDC de test.' },
    { heading: 'La vérification', body: 'Votre niveau est fixé par des règles publiées, jamais par un modèle de langage. Ce que vous dites seulement de vous ne compte pas tant que ce n’est pas vérifié. La confirmation d’un ancien client ne compte que si ce client a passé la vérification de personne. Les autres agents ne peuvent vous trouver qu’une fois votre travail vérifié. Les faits expirent, et un fait expiré ne compte plus.' },
    { heading: 'Ce que nous conservons', body: 'Nous conservons votre identifiant Telegram, ce que vous dites à l’agent, le résultat de chaque vérification et vos deals. Les factures sont lues puis supprimées : nous gardons seulement les informations lues et une empreinte, pour qu’une même facture ne puisse pas appuyer deux comptes. Un ancien client répond seulement s’il ouvre le lien que vous lui envoyez, depuis son propre compte. Des machines rapprochent les personnes à partir de ces informations ; les autres personnes ne les voient pas.' },
    { heading: 'Votre dossier public', body: 'Votre dossier sur karwan.site/r/your-tag montre votre nom, votre niveau, votre rang, des raisons fixes et les faits vérifiés avec leur preuve sur Arc. Il ne montre jamais votre compte Telegram, vos documents, des montants ou le nom de vos clients. Les faits écrits sur Arc ne contiennent aucune donnée personnelle.' },
    { heading: 'Supprimer vos données', body: 'Demandez à Karwan de supprimer votre compte, dans le chat ou sur karwan.site, et nous traitons la demande. Les faits déjà écrits sur Arc ne contiennent aucune donnée personnelle.' },
    { heading: 'Vos droits', body: 'Nous traitons vos données avec votre consentement, selon la loi nigériane de 2023 sur la protection des données et les autres lois qui s’appliquent à vous, uniquement pour vous vérifier et pour rapprocher et mener vos deals. Les conditions complètes de Karwan sur karwan.site/terms s’appliquent aussi.' },
  ],
};

const hi: ChatTermsCopy = {
  title: 'चैट में Karwan एजेंट',
  intro: 'ये शर्तें Telegram पर Karwan एजेंट के मुफ़्त बीटा पर लागू होती हैं। चैट में इन्हें स्वीकार करने से आपका Karwan खाता बनता है।',
  version: 'संस्करण chat-2026-10-12',
  sections: [
    { heading: 'एजेंट क्या करता है', body: 'एजेंट दर्ज करता है कि आप क्या बेचते या खरीदते हैं, आपके सबूत जाँचता है, आपके लिए सत्यापित लोग ढूँढता है, उनके एजेंटों से कीमत, समय और शर्तें पूछता है, और डील तैयार करता है। फ़ैसला आपका है। समझौते, डिलीवरी और विवाद ऐसे कदम हैं जिन्हें आप चैट में पुष्टि करते हैं। पैसा हिलाने वाला हर कदम, जैसे एस्क्रो में भुगतान, रिलीज़, निकासी या फ़ंड की गई डील रद्द करना, Karwan का एक बार का लिंक खोलता है, और आप उसे Karwan पर पुष्टि करते हैं, जहाँ आप पहले हर रकम देखते हैं।' },
    { heading: 'आपका खाता और वॉलेट', body: 'आपका Telegram खाता ही आपका साइन इन है, इसलिए जिसके पास उसका नियंत्रण है वह आपकी तरह काम कर सकता है। Telegram में दो-चरणीय सत्यापन चालू करें। Karwan आपके खाते के लिए तीन वॉलेट बनाता और रखता है: एक जो आपकी पहचान है, एक खरीद बैलेंस और एक कमाई बैलेंस। Karwan इनके लिए तब हस्ताक्षर करता है जब आप कोई कदम पुष्टि करते हैं, और उन स्वचालित नतीजों के लिए जिन पर आप सहमत हुए: समय सीमा चूकने पर रिफ़ंड, समीक्षा अवधि के बाद रिलीज़, और आपकी फ़ंड की गई डील को विक्रेता की स्वीकृति। आप अगले खंड के नियमों के अनुसार अपना पैसा निकाल सकते हैं, या अपना वॉलेट जोड़ सकते हैं।' },
    { heading: 'आपके खाते से निकलने वाला पैसा', body: 'अगर कोई और आपके Telegram में पहुँच जाए तो आपकी सुरक्षा के लिए, आपके खाते से पैसा केवल उसी पते पर जाता है जिसे आपने अपने World ID से जोड़ा हो, जिसे आप व्यक्ति जांच में जोड़ते हैं। नया पता जोड़ने के 24 घंटे बाद पैसा पा सकता है, और जोड़ते ही चैट आपको बताती है। किसी भी 24 घंटे में आपके खाते से 500 USDC तक निकल सकते हैं, एस्क्रो में भुगतान समेत। अगर आप 60 दिन से ज़्यादा दूर रहे हों, तो पैसा फिर से चलने से पहले आप अपने World ID से पुष्टि करते हैं। हर बाहर जाने वाले भुगतान की सूचना चैट में मिलती है, एक ऐसे बटन के साथ जो सभी बाहर जाने वाले भुगतान रोक देता है, और जिसे केवल आपका World ID हटा सकता है।' },
    { heading: 'Arc पर एस्क्रो', body: 'डील Arc पर एस्क्रो में रखी जाती हैं। Arc मेननेट पर एस्क्रो एक बीटा है जिसका ऑडिट नहीं हुआ है, जिसकी सीमा प्रति डील 1,000 USDC और सभी खुली डील्स के लिए 10,000 USDC है। 100 USDC और उससे ऊपर की डील इस बीटा में खुली नहीं हैं। डिलीवरी के बाद, पैसा रिलीज़ होने से पहले खरीदार के पास समीक्षा के लिए कम से कम तीन दिन होते हैं। एस्क्रो का पैसा केवल डील के लोगों को जाता है, खरीदार को लौटता है, या भुगतान से पहले दिखाई गई फ़ीस के रूप में Karwan को जाता है, उन नियमों से जिन पर आप दोनों सहमत हुए। Arc टेस्टनेट पर डील टेस्ट USDC का उपयोग करती हैं।' },
    { heading: 'सत्यापन', body: 'आपका स्तर प्रकाशित नियमों से तय होता है, कभी किसी भाषा मॉडल से नहीं। अपने बारे में केवल कही गई बात तब तक नहीं गिनी जाती जब तक जाँची न जाए। किसी पुराने क्लाइंट की पुष्टि तभी गिनी जाती है जब उस क्लाइंट ने व्यक्ति जाँच पास कर ली हो। आपका काम सत्यापित होने के बाद ही दूसरे एजेंट आपको ढूँढ सकते हैं। तथ्यों की अवधि समाप्त होती है, और समाप्त तथ्य नहीं गिना जाता।' },
    { heading: 'हम क्या रखते हैं', body: 'हम आपकी Telegram यूज़र आईडी, आप एजेंट को जो बताते हैं, हर जाँच के नतीजे और आपकी डील रखते हैं। इनवॉइस पढ़े जाते हैं और फिर हटा दिए जाते हैं: हम केवल उनसे पढ़े गए विवरण और एक फ़िंगरप्रिंट रखते हैं, ताकि एक ही इनवॉइस दो खातों का समर्थन न कर सके। पुराना क्लाइंट तभी जवाब देता है जब वह आपके भेजे लिंक को अपने खाते से खोलता है। मशीनें इन्हीं विवरणों पर लोगों को मिलाती हैं; दूसरे लोग इन्हें नहीं देखते।' },
    { heading: 'आपका सार्वजनिक रिकॉर्ड', body: 'karwan.site/r/your-tag पर आपका रिकॉर्ड आपका नाम, स्तर, टियर, तय कारण और Arc पर प्रमाण के साथ सत्यापित तथ्य दिखाता है। यह कभी आपका Telegram खाता, दस्तावेज़, रकम या आपके क्लाइंट्स के नाम नहीं दिखाता। Arc पर लिखे तथ्यों में कोई निजी डेटा नहीं होता।' },
    { heading: 'अपना डेटा हटाना', body: 'Karwan से अपना खाता हटाने को कहें, चैट में या karwan.site पर, और हम अनुरोध पर काम करते हैं। Arc पर पहले से लिखे तथ्यों में कोई निजी डेटा नहीं होता।' },
    { heading: 'आपके अधिकार', body: 'हम आपकी सहमति से, नाइजीरिया डेटा संरक्षण अधिनियम 2023 और आप पर लागू अन्य कानूनों के तहत, केवल आपको सत्यापित करने और आपकी डील मिलाने और चलाने के लिए आपका डेटा संसाधित करते हैं। karwan.site/terms पर Karwan की पूरी शर्तें भी लागू होती हैं।' },
  ],
};

const sw: ChatTermsCopy = {
  title: 'Wakala wa Karwan kwenye mazungumzo',
  intro: 'Masharti haya yanahusu toleo la majaribio la bure la wakala wa Karwan kwenye Telegram. Kuyakubali kwenye mazungumzo kunaunda akaunti yako ya Karwan.',
  version: 'Toleo chat-2026-10-12',
  sections: [
    { heading: 'Wakala anafanya nini', body: 'Wakala anasajili unachouza au kununua, anakagua ushahidi wako, anakutafutia watu waliothibitishwa, anauliza mawakala wao kuhusu bei, muda na masharti, na anaandaa mikataba. Uamuzi ni wako. Makubaliano, uwasilishaji na migogoro ni hatua unazothibitisha kwenye mazungumzo. Kila hatua inayohamisha pesa, kama kulipa kwenye escrow, kutoa, kutoa pesa au kughairi mkataba uliofadhiliwa, inafungua kiungo cha Karwan cha mara moja, na unaithibitisha kwenye Karwan, ambapo unaona kila kiasi kwanza.' },
    { heading: 'Akaunti na pochi zako', body: 'Akaunti yako ya Telegram ndiyo njia ya kuingia, kwa hiyo yeyote anayeidhibiti anaweza kutenda kama wewe. Washa uthibitisho wa hatua mbili kwenye Telegram. Karwan inaunda na kushikilia pochi tatu za akaunti yako: moja inayokutambulisha, salio la kununua na salio la mapato. Karwan inazitia saini unapothibitisha hatua, na kwa matokeo ya moja kwa moja uliyokubali: kurejeshewa pesa baada ya tarehe ya mwisho kupita, kutolewa baada ya muda wa ukaguzi, na muuzaji kukubali mkataba uliofadhili. Unaweza kutoa pesa zako kwa kufuata sheria za sehemu inayofuata, au kuunganisha pochi yako mwenyewe.' },
    { heading: 'Pesa zinazotoka kwenye akaunti yako', body: 'Ili kukulinda mtu mwingine akiingia kwenye Telegram yako, pesa hutoka kwenye akaunti yako kwenda tu kwenye anwani uliyoongeza kwa World ID yako, unayoiunganisha kwenye ukaguzi wa mtu. Anwani mpya inaweza kupokea pesa saa 24 baada ya kuiongeza, na mazungumzo yanakuarifu mara inapoongezwa. Hadi USDC 500 zinaweza kutoka kwenye akaunti yako ndani ya saa 24 zozote, ikiwemo malipo kwenye escrow. Ukiwa haupo kwa zaidi ya siku 60, unathibitisha kwa World ID yako kabla pesa hazijasonga tena. Kila malipo yanayotoka yanatangazwa kwenye mazungumzo pamoja na kitufe kinachosimamisha malipo yote yanayotoka, ambacho World ID yako pekee inaweza kuondoa.' },
    { heading: 'Escrow kwenye Arc', body: 'Mikataba inashikiliwa kwenye escrow kwenye Arc. Kwenye mtandao mkuu wa Arc, escrow ni toleo la majaribio ambalo halijakaguliwa, lenye kikomo cha USDC 1,000 kwa kila mkataba na USDC 10,000 kwa mikataba yote iliyo wazi. Mikataba ya USDC 100 na zaidi haijafunguliwa kwenye toleo hili la majaribio. Baada ya uwasilishaji, mnunuzi ana angalau siku tatu za kukagua kabla pesa haijatolewa. Pesa kwenye escrow huenda kwa watu wa mkataba tu, hurudi kwa mnunuzi, au huenda kwa Karwan kama ada inayoonyeshwa kabla ya kulipa, kwa sheria mlizokubaliana. Kwenye testnet ya Arc, mikataba inatumia USDC za majaribio.' },
    { heading: 'Uthibitisho', body: 'Kiwango chako kinaamuliwa kwa sheria zilizochapishwa, kamwe si kwa modeli ya lugha. Unachosema tu kuhusu wewe mwenyewe hakihesabiwi hadi kikaguliwe. Uthibitisho wa mteja wa awali unahesabiwa tu mteja huyo akiwa amepita ukaguzi wa mtu. Mawakala wengine wanaweza kukupata tu kazi yako ikishathibitishwa. Ukweli una muda wake, na ukweli uliokwisha muda hauhesabiwi.' },
    { heading: 'Tunachohifadhi', body: 'Tunahifadhi kitambulisho chako cha Telegram, unachomwambia wakala, matokeo ya kila ukaguzi na mikataba yako. Ankara zinasomwa kisha zinafutwa: tunahifadhi tu maelezo yaliyosomwa na alama ya kipekee, ili ankara moja isiweze kuunga mkono akaunti mbili. Mteja wa awali anajibu tu akifungua kiungo unachomtumia, kutoka kwenye akaunti yake mwenyewe. Mashine zinalinganisha watu kwa maelezo haya; watu wengine hawayaoni.' },
    { heading: 'Rekodi yako ya umma', body: 'Rekodi yako kwenye karwan.site/r/your-tag inaonyesha jina lako, kiwango, daraja, sababu zilizowekwa na ukweli uliothibitishwa pamoja na uthibitisho wake kwenye Arc. Haionyeshi kamwe akaunti yako ya Telegram, nyaraka, kiasi cha pesa au majina ya wateja wako. Ukweli ulioandikwa kwenye Arc hauna data binafsi.' },
    { heading: 'Kufuta data yako', body: 'Iombe Karwan ifute akaunti yako, kwenye mazungumzo au kwenye karwan.site, na tunashughulikia ombi hilo. Ukweli ulioandikwa tayari kwenye Arc hauna data binafsi.' },
    { heading: 'Haki zako', body: 'Tunachakata data yako kwa ridhaa yako, chini ya Sheria ya Ulinzi wa Data ya Nigeria ya 2023 na sheria nyingine zinazokuhusu, kwa ajili tu ya kukuthibitisha na kulinganisha na kuendesha mikataba yako. Masharti kamili ya Karwan kwenye karwan.site/terms pia yanatumika.' },
  ],
};

export const chatTermsCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', ChatTermsCopy> = { en, ar, fr, hi, sw };
