/// The breakdown of the one balance on the balance page: where the total sits.
export interface BalanceSummaryCopy {
  total: string;
  onArc: string;
  otherChains: string;
  agents: string;
  forBuying: string;
  forSelling: string;
}

export const balanceSummaryCopy: Record<'en' | 'fr' | 'ar' | 'hi' | 'sw', BalanceSummaryCopy> = {
  en: { total: 'Total balance', onArc: 'In your wallet on Arc', otherChains: 'On other chains', agents: 'With your agents', forBuying: 'For buying', forSelling: 'For selling' },
  fr: { total: 'Solde total', onArc: 'Dans votre portefeuille sur Arc', otherChains: 'Sur d\'autres réseaux', agents: 'Chez vos agents', forBuying: 'Pour acheter', forSelling: 'Pour vendre' },
  ar: { total: 'إجمالي الرصيد', onArc: 'في محفظتك على Arc', otherChains: 'على شبكات أخرى', agents: 'لدى وكلائك', forBuying: 'للشراء', forSelling: 'للبيع' },
  hi: { total: 'कुल बैलेंस', onArc: 'Arc पर आपके वॉलेट में', otherChains: 'दूसरी चेन पर', agents: 'आपके एजेंटों के पास', forBuying: 'खरीदने के लिए', forSelling: 'बेचने के लिए' },
  sw: { total: 'Salio lote', onArc: 'Kwenye mkoba wako kwenye Arc', otherChains: 'Kwenye mitandao mingine', agents: 'Kwa mawakala wako', forBuying: 'Kwa kununua', forSelling: 'Kwa kuuza' },
};
