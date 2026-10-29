/// The breakdown of the one balance on the balance page: what can be sent now,
/// what sits on other networks, and what the agents hold. Plain words, no chains.
export interface BalanceSummaryCopy {
  total: string;
  onArc: string;
  otherChains: string;
  agents: string;
  forBuying: string;
  forSelling: string;
  /// Stake sits under the total, never in it: it is locked behind deals.
  staked: string;
  stakedNote: string;
}

export const balanceSummaryCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', BalanceSummaryCopy> = {
  en: { total: 'Total balance', onArc: 'Ready to send', otherChains: 'On other networks', agents: 'With your agents', forBuying: 'For buying', forSelling: 'For selling', staked: 'Deal guarantee', stakedNote: 'Protects your buyers. Not in your total.' },
  fr: { total: 'Solde total', onArc: 'Prêt à envoyer', otherChains: 'Sur d\'autres réseaux', agents: 'Chez vos agents', forBuying: 'Pour acheter', forSelling: 'Pour vendre', staked: 'Garantie de transaction', stakedNote: 'Protège vos acheteurs. Non comptée dans le total.' },
  ar: { total: 'إجمالي الرصيد', onArc: 'جاهز للإرسال', otherChains: 'على شبكات أخرى', agents: 'لدى وكلائك', forBuying: 'للشراء', forSelling: 'للبيع', staked: 'ضمان الصفقة', stakedNote: 'يحمي المشترين منك. غير محسوب في الإجمالي.' },
  hi: { total: 'कुल बैलेंस', onArc: 'भेजने के लिए तैयार', otherChains: 'दूसरे नेटवर्क पर', agents: 'आपके एजेंटों के पास', forBuying: 'खरीदने के लिए', forSelling: 'बेचने के लिए', staked: 'डील गारंटी', stakedNote: 'आपके खरीदारों की रक्षा करती है। कुल में शामिल नहीं।' },
  sw: { total: 'Salio lote', onArc: 'Tayari kutuma', otherChains: 'Kwenye mitandao mingine', agents: 'Kwa mawakala wako', forBuying: 'Kwa kununua', forSelling: 'Kwa kuuza', staked: 'Dhamana ya mpango', stakedNote: 'Inawalinda wanunuzi wako. Haimo kwenye jumla.' },
};
