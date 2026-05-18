import type { UserLocale } from '../db/profiles.js';

/// Tiny translation table for the highest-traffic Telegram event copy. Falls
/// back to English when the user has no locale set or when a key is missing
/// from the chosen locale. This is intentionally a thin slice; the full Phase
/// 2 i18n pass extends every notifier branch to read from this table.
///
/// To add a key: extend the English block with the new copy, then add the
/// translated string to each non-English locale.

type TgKey =
  | 'cancelProposedFromOther.mutual'
  | 'cancelProposedFromOther.platform'
  | 'cancelProposedFromSelf'
  | 'cancelDeclinedToProposer'
  | 'cancelDeclinedBySelf'
  | 'milestoneReleasedToSeller.first'
  | 'milestoneReleasedToSeller.final'
  | 'milestoneReleasedToBuyer.first'
  | 'milestoneReleasedToBuyer.final'
  | 'bidAcceptedToSeller'
  | 'bidAcceptedToBuyer'
  | 'reputationRecordedSuccessSeller'
  | 'reputationRecordedSuccessBuyer'
  | 'dealCancelled'
  | 'dealDeliveredToBuyer'
  | 'dealDeliveredToSeller'
  | 'openInKarwan';

const en: Record<TgKey, string> = {
  'cancelProposedFromOther.mutual':
    '*The {role} is proposing to cancel this deal* (mutual). Open the deal to accept or decline.',
  'cancelProposedFromOther.platform':
    '*The {role} flagged this deal as a platform misroute*. Open the deal to accept or decline.',
  'cancelProposedFromSelf':
    '*Cancellation proposed*. Waiting on the other party to accept or decline.',
  'cancelDeclinedToProposer':
    '*Your cancellation proposal was declined*. The deal continues as normal.',
  'cancelDeclinedBySelf':
    '*You declined the cancellation proposal*. The deal continues as normal.',
  'milestoneReleasedToSeller.first':
    '*First milestone released*. Funds are on their way to your agent wallet.',
  'milestoneReleasedToSeller.final':
    '*Final milestone released*. Funds are on their way to your agent wallet.',
  'milestoneReleasedToBuyer.first': '*First milestone released* to the seller.',
  'milestoneReleasedToBuyer.final': '*Final milestone released* to the seller.',
  'bidAcceptedToSeller':
    "*Your bid was accepted*. Escrow funds next; you'll get another note when it lands.",
  'bidAcceptedToBuyer': '*Bid accepted*. Escrow is being funded.',
  'reputationRecordedSuccessSeller':
    '*Reputation updated on chain* for a successful settlement. View your passport for the new score.',
  'reputationRecordedSuccessBuyer':
    '*Reputation recorded on chain* for a successful settlement.',
  'dealCancelled': '*Deal cancelled*.',
  'dealDeliveredToBuyer':
    '*Seller marked the work delivered*. Open the deal to verify and release.',
  'dealDeliveredToSeller':
    '*You marked the deal delivered*. The buyer review window is open.',
  'openInKarwan': 'Open in Karwan',
};

const ar: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    '*{role} يقترح إلغاء هذه الصفقة* (بالتراضي). افتح الصفقة للقبول أو الرفض.',
  'cancelProposedFromOther.platform':
    '*{role} أبلغ عن هذه الصفقة كخطأ توجيه من المنصة*. افتح الصفقة للقبول أو الرفض.',
  'cancelProposedFromSelf':
    '*تم اقتراح الإلغاء*. في انتظار الطرف الآخر للقبول أو الرفض.',
  'cancelDeclinedToProposer':
    '*تم رفض اقتراح الإلغاء*. تستمر الصفقة كالمعتاد.',
  'cancelDeclinedBySelf':
    '*لقد رفضت اقتراح الإلغاء*. تستمر الصفقة كالمعتاد.',
  'milestoneReleasedToSeller.first':
    '*تم الإفراج عن المرحلة الأولى*. الأموال في طريقها إلى محفظة وكيلك.',
  'milestoneReleasedToSeller.final':
    '*تم الإفراج عن المرحلة النهائية*. الأموال في طريقها إلى محفظة وكيلك.',
  'milestoneReleasedToBuyer.first': '*تم الإفراج عن المرحلة الأولى* إلى البائع.',
  'milestoneReleasedToBuyer.final': '*تم الإفراج عن المرحلة النهائية* إلى البائع.',
  'bidAcceptedToSeller':
    '*تم قبول عرضك*. تمويل الضمان قادم؛ ستصلك ملاحظة أخرى عند اكتماله.',
  'bidAcceptedToBuyer': '*تم قبول العرض*. يتم تمويل الضمان الآن.',
  'reputationRecordedSuccessSeller':
    '*تم تحديث السمعة على السلسلة* لتسوية ناجحة. اطّلع على جواز السمعة للنتيجة الجديدة.',
  'reputationRecordedSuccessBuyer':
    '*تم تسجيل السمعة على السلسلة* لتسوية ناجحة.',
  'dealCancelled': '*تم إلغاء الصفقة*.',
  'dealDeliveredToBuyer':
    '*وضع البائع علامة تم التسليم*. افتح الصفقة للتحقق والإفراج.',
  'dealDeliveredToSeller':
    '*لقد علّمت الصفقة كتم التسليم*. نافذة مراجعة المشتري مفتوحة.',
  'openInKarwan': 'افتح في كروان',
};

const fr: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    "*Le/la {role} propose d'annuler cette transaction* (mutuel). Ouvrez la transaction pour accepter ou refuser.",
  'cancelProposedFromOther.platform':
    "*Le/la {role} a signalé cette transaction comme une erreur de la plateforme*. Ouvrez la transaction pour accepter ou refuser.",
  'cancelProposedFromSelf':
    "*Annulation proposée*. En attente de la décision de l'autre partie.",
  'cancelDeclinedToProposer':
    "*Votre proposition d'annulation a été refusée*. La transaction se poursuit normalement.",
  'cancelDeclinedBySelf':
    "*Vous avez refusé la proposition d'annulation*. La transaction se poursuit normalement.",
  'milestoneReleasedToSeller.first':
    '*Première étape libérée*. Les fonds arrivent vers votre portefeuille agent.',
  'milestoneReleasedToSeller.final':
    '*Étape finale libérée*. Les fonds arrivent vers votre portefeuille agent.',
  'milestoneReleasedToBuyer.first': '*Première étape libérée* au vendeur.',
  'milestoneReleasedToBuyer.final': '*Étape finale libérée* au vendeur.',
  'bidAcceptedToSeller':
    "*Votre offre a été acceptée*. Le séquestre se finance ensuite; vous recevrez un autre message.",
  'bidAcceptedToBuyer': "*Offre acceptée*. Le séquestre est en cours de financement.",
  'reputationRecordedSuccessSeller':
    '*Réputation mise à jour on-chain* pour un règlement réussi. Consultez votre passeport.',
  'reputationRecordedSuccessBuyer':
    '*Réputation enregistrée on-chain* pour un règlement réussi.',
  'dealCancelled': '*Transaction annulée*.',
  'dealDeliveredToBuyer':
    "*Le vendeur a marqué le travail comme livré*. Ouvrez la transaction pour vérifier et libérer.",
  'dealDeliveredToSeller':
    "*Vous avez marqué la transaction comme livrée*. La fenêtre d'examen acheteur est ouverte.",
  'openInKarwan': 'Ouvrir dans Karwan',
};

const hi: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    '*{role} इस सौदे को रद्द करने का प्रस्ताव दे रहा है* (आपसी)। स्वीकार या अस्वीकार करने के लिए सौदा खोलें।',
  'cancelProposedFromOther.platform':
    '*{role} ने इस सौदे को प्लेटफ़ॉर्म त्रुटि के रूप में चिह्नित किया*। स्वीकार या अस्वीकार करने के लिए खोलें।',
  'cancelProposedFromSelf':
    '*रद्दीकरण प्रस्तावित*। दूसरे पक्ष की स्वीकृति या अस्वीकृति का इंतज़ार है।',
  'cancelDeclinedToProposer':
    '*आपका रद्दीकरण प्रस्ताव अस्वीकृत हुआ*। सौदा सामान्य रूप से जारी रहेगा।',
  'cancelDeclinedBySelf':
    '*आपने रद्दीकरण प्रस्ताव अस्वीकार किया*। सौदा सामान्य रूप से जारी रहेगा।',
  'milestoneReleasedToSeller.first':
    '*पहली मील का पत्थर जारी*। राशि आपके एजेंट वॉलेट में आ रही है।',
  'milestoneReleasedToSeller.final':
    '*अंतिम मील का पत्थर जारी*। राशि आपके एजेंट वॉलेट में आ रही है।',
  'milestoneReleasedToBuyer.first': '*पहली मील का पत्थर जारी* विक्रेता को।',
  'milestoneReleasedToBuyer.final': '*अंतिम मील का पत्थर जारी* विक्रेता को।',
  'bidAcceptedToSeller':
    '*आपकी बोली स्वीकृत*। एस्क्रो आगे फंड होगा; उसकी सूचना अलग से मिलेगी।',
  'bidAcceptedToBuyer': '*बोली स्वीकृत*। एस्क्रो फंड हो रहा है।',
  'reputationRecordedSuccessSeller':
    '*प्रतिष्ठा ऑन-चेन अपडेट* सफल निपटान के लिए। पासपोर्ट पर नई स्कोर देखें।',
  'reputationRecordedSuccessBuyer':
    '*प्रतिष्ठा ऑन-चेन दर्ज* सफल निपटान के लिए।',
  'dealCancelled': '*सौदा रद्द*।',
  'dealDeliveredToBuyer':
    '*विक्रेता ने डिलीवरी चिह्नित की*। सत्यापन और रिलीज़ के लिए सौदा खोलें।',
  'dealDeliveredToSeller':
    '*आपने सौदा डिलीवर चिह्नित किया*। खरीदार समीक्षा विंडो खुली है।',
  'openInKarwan': 'Karwan में खोलें',
};

const sw: Partial<Record<TgKey, string>> = {
  'cancelProposedFromOther.mutual':
    '*{role} anapendekeza kufuta mkataba huu* (kwa makubaliano). Fungua mkataba kukubali au kukataa.',
  'cancelProposedFromOther.platform':
    '*{role} ameashiria mkataba kama hitilafu ya jukwaa*. Fungua kukubali au kukataa.',
  'cancelProposedFromSelf':
    '*Pendekezo la kufuta limewasilishwa*. Tunasubiri upande mwingine kukubali au kukataa.',
  'cancelDeclinedToProposer':
    '*Pendekezo lako la kufuta limekataliwa*. Mkataba unaendelea kawaida.',
  'cancelDeclinedBySelf':
    '*Umekataa pendekezo la kufuta*. Mkataba unaendelea kawaida.',
  'milestoneReleasedToSeller.first':
    '*Hatua ya kwanza imeachiliwa*. Fedha zinakuja kwenye pochi yako ya wakala.',
  'milestoneReleasedToSeller.final':
    '*Hatua ya mwisho imeachiliwa*. Fedha zinakuja kwenye pochi yako ya wakala.',
  'milestoneReleasedToBuyer.first': '*Hatua ya kwanza imeachiliwa* kwa muuzaji.',
  'milestoneReleasedToBuyer.final': '*Hatua ya mwisho imeachiliwa* kwa muuzaji.',
  'bidAcceptedToSeller':
    '*Toleo lako limekubaliwa*. Eskrowi inafuata; utapokea ujumbe mwingine.',
  'bidAcceptedToBuyer': '*Toleo limekubaliwa*. Eskrowi inafadhiliwa.',
  'reputationRecordedSuccessSeller':
    '*Sifa imesasishwa kwenye mnyororo* kwa malipo yenye mafanikio. Tazama pasi yako.',
  'reputationRecordedSuccessBuyer':
    '*Sifa imerekodiwa kwenye mnyororo* kwa malipo yenye mafanikio.',
  'dealCancelled': '*Mkataba umefutwa*.',
  'dealDeliveredToBuyer':
    '*Muuzaji ameashiria kazi imewasilishwa*. Fungua kuthibitisha na kuachilia.',
  'dealDeliveredToSeller':
    '*Umeashiria mkataba kuwa umewasilishwa*. Dirisha la mapitio la mnunuzi limefunguliwa.',
  'openInKarwan': 'Fungua katika Karwan',
};

const TABLES: Record<UserLocale, Partial<Record<TgKey, string>>> = {
  en,
  ar,
  fr,
  hi,
  sw,
};

export function tg(
  key: TgKey,
  locale: UserLocale | undefined,
  vars?: Record<string, string>,
): string {
  const table = TABLES[locale ?? 'en'];
  const raw = table[key] ?? en[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`);
}
