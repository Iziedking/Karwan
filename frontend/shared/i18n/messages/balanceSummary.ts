/// The breakdown of the one balance on the balance page: what can be sent now,
/// what sits on other networks, and what the agents hold. Plain words, no chains.
export interface BalanceSummaryCopy {
  total: string;
  onArc: string;
  agents: string;
  forBuying: string;
  forSelling: string;
  /// Stake sits under the total, never in it: it is locked behind deals.
  staked: string;
  stakedNote: string;
}

export const balanceSummaryCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', BalanceSummaryCopy> = {
  en: { total: 'Total balance', onArc: 'Ready to send', agents: 'With your agents', forBuying: 'For buying', forSelling: 'For selling', staked: 'Savings pocket', stakedNote: 'Kept aside and earning. Not in your total.' },
  fr: { total: 'Solde total', onArc: 'Prêt à envoyer', agents: 'Chez vos agents', forBuying: 'Pour acheter', forSelling: 'Pour vendre', staked: 'Poche d’épargne', stakedNote: 'Mise de côté, elle rapporte. Non comptée dans le total.' },
  ar: { total: 'إجمالي الرصيد', onArc: 'جاهز للإرسال', agents: 'لدى وكلائك', forBuying: 'للشراء', forSelling: 'للبيع', staked: 'جيب الادخار', stakedNote: 'مُدَّخر ويربح. غير محسوب في الإجمالي.' },
  hi: { total: 'कुल बैलेंस', onArc: 'भेजने के लिए तैयार', agents: 'आपके एजेंटों के पास', forBuying: 'खरीदने के लिए', forSelling: 'बेचने के लिए', staked: 'बचत पॉकेट', stakedNote: 'अलग रखा है और कमाता है। कुल में नहीं गिना जाता।' },
  sw: { total: 'Salio lote', onArc: 'Tayari kutuma', agents: 'Kwa mawakala wako', forBuying: 'Kwa kununua', forSelling: 'Kwa kuuza', staked: 'Mfuko wa akiba', stakedNote: 'Imewekwa kando na inapata faida. Haimo kwenye jumla.' },
};
