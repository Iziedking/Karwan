export interface ChatTermsCopy {
  title: string;
  intro: string;
  version: string;
  sections: { heading: string; body: string }[];
}

/// Terms for the Karwan agent on WhatsApp, version chat-2026-10-10. The
/// English text is the one the owner approves; translations follow it.
const en: ChatTermsCopy = {
  title: 'The Karwan agent on WhatsApp',
  intro: 'These terms cover the free beta of the Karwan agent on WhatsApp. Accepting them in chat creates your Karwan account.',
  version: 'Version chat-2026-10-10',
  sections: [
    {
      heading: 'What the agent does',
      body: 'The agent registers what you sell or buy, checks your evidence, finds verified people for you, asks their agents about price, timeline and terms, and prepares deals. You decide. Every payment, release, cancellation and agreement is a step you confirm with a button.',
    },
    {
      heading: 'Your account and wallets',
      body: 'Your WhatsApp number is how you sign in. Karwan creates and holds three wallets for your account: one that identifies you, a buying balance and an earnings balance. Karwan signs for them only when you confirm a step. You can move your money out, or connect your own wallet, at any time.',
    },
    {
      heading: 'Escrow on Arc',
      body: 'Deals are held in escrow on Arc. On Arc mainnet the escrow is a beta that has not been audited, with a limit of 1,000 USDC per deal and 10,000 USDC across all open deals. Deals of 100 USDC and above need an ID check from both people first. Money in escrow goes only to the people in the deal or back to the buyer, by the rules both of you agreed.',
    },
    {
      heading: 'Verification',
      body: 'Your level is decided by published rules, never by a language model. Anything you only say about yourself counts for nothing until it is checked. Other agents can only find you once your work is verified. A fact that is no longer true can be revoked.',
    },
    {
      heading: 'What we keep',
      body: 'We keep your number, what you tell the agent, the results of each check and your deals. Invoices are read and then discarded: we keep only the details read from them and a fingerprint, so the same invoice cannot back two accounts. A past client’s number is used once, to ask them to confirm a job. Machines match people on these details; other people do not see them.',
    },
    {
      heading: 'Your public record',
      body: 'Your record at karwan.site/r/your-tag shows your name, level, tier, fixed reasons and the verified facts with their proof on Arc. It never shows your number, documents, amounts or the names of your clients. Facts written to Arc carry no personal data.',
    },
    {
      heading: 'Deleting your data',
      body: 'You can ask Karwan to delete your account, in chat or at karwan.site. We then delete what we hold off chain and revoke your facts on Arc. Facts already written stay readable as revoked, and they carry no personal data.',
    },
    {
      heading: 'Your rights',
      body: 'We process your data with your consent, under the Nigeria Data Protection Act 2023 and the other laws that apply to you, only to verify you and to match and run your deals. The full Karwan terms at karwan.site/terms also apply.',
    },
  ],
};

const ar: ChatTermsCopy = {
  title: 'وكيل Karwan على واتساب',
  intro: 'تغطي هذه الشروط النسخة التجريبية المجانية من وكيل Karwan على واتساب. قبولها في المحادثة ينشئ حسابك على Karwan.',
  version: 'الإصدار chat-2026-10-10',
  sections: [
    { heading: 'ما يفعله الوكيل', body: 'يسجّل الوكيل ما تبيعه أو تشتريه، ويفحص أدلتك، ويجد لك أشخاصًا موثّقين، ويسأل وكلاءهم عن السعر والمدة والشروط، ويُعدّ الصفقات. القرار لك. كل دفع أو تحرير أو إلغاء أو اتفاق خطوة تؤكدها بزر.' },
    { heading: 'حسابك ومحافظك', body: 'رقم واتساب الخاص بك هو طريقة دخولك. تنشئ Karwan لحسابك ثلاث محافظ وتحتفظ بها: واحدة تعرّفك، ورصيد للشراء، ورصيد للأرباح. لا توقّع Karwan عنها إلا عندما تؤكد خطوة. يمكنك سحب أموالك أو ربط محفظتك الخاصة في أي وقت.' },
    { heading: 'الضمان على Arc', body: 'تُحفظ الصفقات في ضمان على Arc. على شبكة Arc الرئيسية، الضمان نسخة تجريبية لم تُدقَّق بعد، بحد 1,000 USDC لكل صفقة و10,000 USDC لكل الصفقات المفتوحة. الصفقات من 100 USDC فأكثر تحتاج إلى فحص هوية من الطرفين أولًا. المال في الضمان يذهب فقط إلى طرفي الصفقة أو يعود إلى المشتري، وفق القواعد التي اتفقتما عليها.' },
    { heading: 'التحقق', body: 'يُحدَّد مستواك بقواعد منشورة، ولا يحدده نموذج لغوي أبدًا. ما تقوله عن نفسك فقط لا يُحتسب حتى يُفحص. لا يجدك الوكلاء الآخرون إلا بعد التحقق من عملك. يمكن إلغاء أي حقيقة لم تعد صحيحة.' },
    { heading: 'ما نحتفظ به', body: 'نحتفظ برقمك، وما تقوله للوكيل، ونتائج كل فحص، وصفقاتك. تُقرأ الفواتير ثم تُحذف: نحتفظ فقط بالتفاصيل المقروءة منها وببصمة، كي لا تدعم الفاتورة نفسها حسابين. يُستخدم رقم العميل السابق مرة واحدة لسؤاله عن تأكيد عمل. تطابق الآلات بين الناس بهذه التفاصيل، ولا يراها الآخرون.' },
    { heading: 'سجلك العام', body: 'يعرض سجلك على karwan.site/r/your-tag اسمك ومستواك ورتبتك وأسبابًا ثابتة والحقائق الموثّقة مع إثباتها على Arc. لا يعرض أبدًا رقمك أو مستنداتك أو المبالغ أو أسماء عملائك. الحقائق المكتوبة على Arc لا تحمل بيانات شخصية.' },
    { heading: 'حذف بياناتك', body: 'يمكنك أن تطلب من الوكيل حذف حسابك. عندها نحذف ما نحتفظ به خارج السلسلة ونلغي حقائقك على Arc. تبقى الحقائق المكتوبة قابلة للقراءة بصفتها ملغاة، ولا تحمل بيانات شخصية.' },
    { heading: 'حقوقك', body: 'نعالج بياناتك بموافقتك، وفق قانون حماية البيانات النيجيري لعام 2023 والقوانين الأخرى التي تنطبق عليك، فقط للتحقق منك ولمطابقة صفقاتك وتنفيذها. تنطبق أيضًا شروط Karwan الكاملة على karwan.site/terms.' },
  ],
};

const fr: ChatTermsCopy = {
  title: 'L’agent Karwan sur WhatsApp',
  intro: 'Ces conditions couvrent la version bêta gratuite de l’agent Karwan sur WhatsApp. Les accepter dans la conversation crée votre compte Karwan.',
  version: 'Version chat-2026-10-10',
  sections: [
    { heading: 'Ce que fait l’agent', body: 'L’agent enregistre ce que vous vendez ou achetez, vérifie vos preuves, trouve pour vous des personnes vérifiées, demande à leurs agents le prix, le délai et les conditions, et prépare les accords. Vous décidez. Chaque paiement, libération, annulation et accord est une étape que vous confirmez avec un bouton.' },
    { heading: 'Votre compte et vos portefeuilles', body: 'Votre numéro WhatsApp vous sert à vous connecter. Karwan crée et détient trois portefeuilles pour votre compte : un qui vous identifie, un solde d’achat et un solde de gains. Karwan ne signe pour eux que lorsque vous confirmez une étape. Vous pouvez retirer votre argent ou connecter votre propre portefeuille à tout moment.' },
    { heading: 'Séquestre sur Arc', body: 'Les accords sont détenus en séquestre sur Arc. Sur le réseau principal Arc, le séquestre est une bêta non auditée, limitée à 1 000 USDC par accord et 10 000 USDC pour l’ensemble des accords ouverts. Les accords de 100 USDC et plus exigent d’abord une vérification d’identité des deux parties. L’argent en séquestre va uniquement aux personnes de l’accord ou revient à l’acheteur, selon les règles que vous avez convenues.' },
    { heading: 'Vérification', body: 'Votre niveau est décidé par des règles publiées, jamais par un modèle de langage. Ce que vous dites seulement de vous ne compte pas tant que ce n’est pas vérifié. Les autres agents ne peuvent vous trouver qu’une fois votre travail vérifié. Un fait qui n’est plus vrai peut être révoqué.' },
    { heading: 'Ce que nous conservons', body: 'Nous conservons votre numéro, ce que vous dites à l’agent, les résultats de chaque vérification et vos accords. Les factures sont lues puis supprimées : nous gardons seulement les détails lus et une empreinte, afin qu’une même facture ne puisse pas appuyer deux comptes. Le numéro d’un ancien client sert une seule fois, pour lui demander de confirmer un travail. Des machines rapprochent les personnes sur ces détails ; les autres personnes ne les voient pas.' },
    { heading: 'Votre dossier public', body: 'Votre dossier sur karwan.site/r/your-tag affiche votre nom, votre niveau, votre rang, des raisons fixes et les faits vérifiés avec leur preuve sur Arc. Il n’affiche jamais votre numéro, vos documents, des montants ni le nom de vos clients. Les faits écrits sur Arc ne contiennent aucune donnée personnelle.' },
    { heading: 'Supprimer vos données', body: 'Vous pouvez demander à l’agent de supprimer votre compte. Nous supprimons alors ce que nous détenons hors chaîne et révoquons vos faits sur Arc. Les faits déjà écrits restent lisibles comme révoqués et ne contiennent aucune donnée personnelle.' },
    { heading: 'Vos droits', body: 'Nous traitons vos données avec votre consentement, selon la loi nigériane de 2023 sur la protection des données et les autres lois qui vous concernent, uniquement pour vous vérifier et pour rapprocher et exécuter vos accords. Les conditions complètes de Karwan sur karwan.site/terms s’appliquent aussi.' },
  ],
};

const hi: ChatTermsCopy = {
  title: 'WhatsApp पर Karwan एजेंट',
  intro: 'ये शर्तें WhatsApp पर Karwan एजेंट के मुफ़्त बीटा पर लागू होती हैं। चैट में इन्हें स्वीकार करने से आपका Karwan खाता बनता है।',
  version: 'संस्करण chat-2026-10-10',
  sections: [
    { heading: 'एजेंट क्या करता है', body: 'एजेंट दर्ज करता है कि आप क्या बेचते या खरीदते हैं, आपके प्रमाण जांचता है, आपके लिए सत्यापित लोग ढूंढता है, उनके एजेंटों से कीमत, समय और शर्तें पूछता है, और सौदे तैयार करता है। फ़ैसला आपका है। हर भुगतान, रिलीज़, रद्द करना और समझौता एक कदम है जिसे आप बटन से पक्का करते हैं।' },
    { heading: 'आपका खाता और वॉलेट', body: 'आपका WhatsApp नंबर ही आपका लॉगिन है। Karwan आपके खाते के लिए तीन वॉलेट बनाता और रखता है: एक जो आपकी पहचान है, एक खरीद शेष और एक कमाई शेष। Karwan उन पर तभी हस्ताक्षर करता है जब आप कोई कदम पक्का करते हैं। आप कभी भी अपना पैसा निकाल सकते हैं या अपना वॉलेट जोड़ सकते हैं।' },
    { heading: 'Arc पर एस्क्रो', body: 'सौदे Arc पर एस्क्रो में रखे जाते हैं। Arc मेननेट पर एस्क्रो एक बीटा है जिसका ऑडिट नहीं हुआ है, प्रति सौदा 1,000 USDC और सभी खुले सौदों में कुल 10,000 USDC की सीमा के साथ। 100 USDC और उससे अधिक के सौदों के लिए पहले दोनों पक्षों की पहचान जांच ज़रूरी है। एस्क्रो का पैसा केवल सौदे के लोगों को जाता है या ख़रीदार को लौटता है, आप दोनों के तय नियमों के अनुसार।' },
    { heading: 'सत्यापन', body: 'आपका स्तर प्रकाशित नियमों से तय होता है, कभी किसी भाषा मॉडल से नहीं। जो आप केवल अपने बारे में कहते हैं, वह जांचे जाने तक नहीं गिना जाता। दूसरे एजेंट आपको तभी ढूंढ सकते हैं जब आपका काम सत्यापित हो। जो तथ्य अब सही नहीं है उसे रद्द किया जा सकता है।' },
    { heading: 'हम क्या रखते हैं', body: 'हम आपका नंबर, आप एजेंट को जो बताते हैं, हर जांच के नतीजे और आपके सौदे रखते हैं। चालान पढ़े जाते हैं और फिर हटा दिए जाते हैं: हम केवल उनसे पढ़े गए विवरण और एक फ़िंगरप्रिंट रखते हैं, ताकि एक ही चालान दो खातों का समर्थन न कर सके। पिछले ग्राहक का नंबर एक बार, काम की पुष्टि पूछने के लिए, इस्तेमाल होता है। मशीनें इन विवरणों पर लोगों का मिलान करती हैं; दूसरे लोग इन्हें नहीं देखते।' },
    { heading: 'आपका सार्वजनिक रिकॉर्ड', body: 'karwan.site/r/your-tag पर आपका रिकॉर्ड आपका नाम, स्तर, श्रेणी, तय कारण और Arc पर प्रमाण के साथ सत्यापित तथ्य दिखाता है। यह कभी आपका नंबर, दस्तावेज़, रकम या आपके ग्राहकों के नाम नहीं दिखाता। Arc पर लिखे तथ्यों में कोई निजी डेटा नहीं होता।' },
    { heading: 'अपना डेटा हटाना', body: 'आप एजेंट से अपना खाता हटाने को कह सकते हैं। तब हम चेन से बाहर रखा डेटा हटाते हैं और Arc पर आपके तथ्य रद्द करते हैं। पहले लिखे तथ्य रद्द के रूप में पढ़े जा सकते हैं और उनमें कोई निजी डेटा नहीं होता।' },
    { heading: 'आपके अधिकार', body: 'हम आपकी सहमति से, नाइजीरिया डेटा संरक्षण अधिनियम 2023 और आप पर लागू अन्य क़ानूनों के तहत, केवल आपको सत्यापित करने और आपके सौदों का मिलान और संचालन करने के लिए आपका डेटा संसाधित करते हैं। karwan.site/terms पर Karwan की पूरी शर्तें भी लागू होती हैं।' },
  ],
};

const sw: ChatTermsCopy = {
  title: 'Wakala wa Karwan kwenye WhatsApp',
  intro: 'Masharti haya yanahusu toleo la majaribio la bure la wakala wa Karwan kwenye WhatsApp. Kuyakubali kwenye mazungumzo kunaunda akaunti yako ya Karwan.',
  version: 'Toleo chat-2026-10-10',
  sections: [
    { heading: 'Wakala anafanya nini', body: 'Wakala anasajili unachouza au kununua, anakagua ushahidi wako, anakutafutia watu waliothibitishwa, anauliza mawakala wao kuhusu bei, muda na masharti, na anaandaa mikataba. Uamuzi ni wako. Kila malipo, kutoa fedha, kughairi na makubaliano ni hatua unayothibitisha kwa kitufe.' },
    { heading: 'Akaunti na pochi zako', body: 'Nambari yako ya WhatsApp ndiyo njia ya kuingia. Karwan inaunda na kushikilia pochi tatu za akaunti yako: moja inayokutambulisha, salio la kununua na salio la mapato. Karwan inazitia saini tu unapothibitisha hatua. Unaweza kutoa pesa zako au kuunganisha pochi yako mwenyewe wakati wowote.' },
    { heading: 'Escrow kwenye Arc', body: 'Mikataba inashikiliwa kwenye escrow kwenye Arc. Kwenye mtandao mkuu wa Arc, escrow ni toleo la majaribio ambalo halijakaguliwa, lenye kikomo cha USDC 1,000 kwa kila mkataba na USDC 10,000 kwa mikataba yote iliyo wazi. Mikataba ya USDC 100 na zaidi inahitaji ukaguzi wa kitambulisho kutoka pande zote mbili kwanza. Pesa kwenye escrow huenda kwa watu wa mkataba tu au kurudi kwa mnunuzi, kwa sheria mlizokubaliana.' },
    { heading: 'Uthibitisho', body: 'Kiwango chako kinaamuliwa kwa sheria zilizochapishwa, kamwe si kwa modeli ya lugha. Unachosema tu kuhusu wewe mwenyewe hakihesabiwi hadi kikaguliwe. Mawakala wengine wanaweza kukupata tu kazi yako ikishathibitishwa. Ukweli ambao si sahihi tena unaweza kufutwa.' },
    { heading: 'Tunachohifadhi', body: 'Tunahifadhi nambari yako, unachomwambia wakala, matokeo ya kila ukaguzi na mikataba yako. Ankara zinasomwa kisha zinafutwa: tunahifadhi tu maelezo yaliyosomwa na alama ya kipekee, ili ankara moja isiweze kuunga mkono akaunti mbili. Nambari ya mteja wa awali inatumika mara moja, kumuuliza athibitishe kazi. Mashine zinalinganisha watu kwa maelezo haya; watu wengine hawayaoni.' },
    { heading: 'Rekodi yako ya umma', body: 'Rekodi yako kwenye karwan.site/r/your-tag inaonyesha jina lako, kiwango, daraja, sababu zilizowekwa na ukweli uliothibitishwa pamoja na uthibitisho wake kwenye Arc. Haionyeshi kamwe nambari yako, nyaraka, kiasi cha pesa au majina ya wateja wako. Ukweli ulioandikwa kwenye Arc hauna data binafsi.' },
    { heading: 'Kufuta data yako', body: 'Unaweza kumwomba wakala afute akaunti yako. Kisha tunafuta tunachoshikilia nje ya mnyororo na kufuta ukweli wako kwenye Arc. Ukweli ulioandikwa tayari unabaki kusomeka kama uliofutwa, na hauna data binafsi.' },
    { heading: 'Haki zako', body: 'Tunachakata data yako kwa ridhaa yako, chini ya Sheria ya Ulinzi wa Data ya Nigeria ya 2023 na sheria nyingine zinazokuhusu, kwa ajili tu ya kukuthibitisha na kulinganisha na kuendesha mikataba yako. Masharti kamili ya Karwan kwenye karwan.site/terms pia yanatumika.' },
  ],
};

export const chatTermsCopy: Record<'en' | 'ar' | 'fr' | 'hi' | 'sw', ChatTermsCopy> = { en, ar, fr, hi, sw };
