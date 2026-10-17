/// Said wherever someone posts in the market: posting lets the agents of
/// people on that request check their record (agentic market spec, O1).
export interface MarketReadsCopy {
  note: string;
  notice: string;
  dismiss: string;
}

type Locale = 'en' | 'fr' | 'ar' | 'hi' | 'sw';

export const marketReadsCopy: Record<Locale, MarketReadsCopy> = {
  en: {
    note: 'Agents of people you might deal with can check your Karwan record. They never see your messages or exact amounts.',
    notice: 'New: when you post, the agents of people you might deal with can check your Karwan record. Agents from other apps can only if you allow it in your profile.',
    dismiss: 'Got it',
  },
  fr: {
    note: "Les agents des personnes avec qui vous pourriez traiter peuvent consulter votre dossier Karwan. Ils ne voient jamais vos messages ni vos montants exacts.",
    notice: "Nouveau : quand vous publiez, les agents des personnes avec qui vous pourriez traiter peuvent consulter votre dossier Karwan. Les agents d'autres applications ne le peuvent que si vous l'autorisez dans votre profil.",
    dismiss: 'Compris',
  },
  ar: {
    note: 'يمكن لوكلاء الأشخاص الذين قد تتعامل معهم فحص سجلك في كاروان. لا يرون رسائلك أو مبالغك الدقيقة أبدًا.',
    notice: 'جديد: عندما تنشر، يمكن لوكلاء الأشخاص الذين قد تتعامل معهم فحص سجلك في كاروان. لا يمكن لوكلاء التطبيقات الأخرى ذلك إلا إذا سمحت به في ملفك.',
    dismiss: 'فهمت',
  },
  hi: {
    note: 'जिन लोगों से आप सौदा कर सकते हैं, उनके एजेंट आपका Karwan रिकॉर्ड जांच सकते हैं। वे आपके संदेश या सटीक रकम कभी नहीं देखते।',
    notice: 'नया: जब आप पोस्ट करते हैं, तो जिन लोगों से आप सौदा कर सकते हैं, उनके एजेंट आपका Karwan रिकॉर्ड जांच सकते हैं। दूसरे ऐप के एजेंट तभी जांच सकते हैं जब आप अपनी प्रोफ़ाइल में अनुमति दें।',
    dismiss: 'समझ गया',
  },
  sw: {
    note: 'Mawakala wa watu unaoweza kushughulika nao wanaweza kukagua rekodi yako ya Karwan. Kamwe hawaoni ujumbe wako wala kiasi kamili.',
    notice: 'Mpya: unapochapisha, mawakala wa watu unaoweza kushughulika nao wanaweza kukagua rekodi yako ya Karwan. Mawakala wa programu nyingine wanaweza tu ukiruhusu kwenye wasifu wako.',
    dismiss: 'Nimeelewa',
  },
};
