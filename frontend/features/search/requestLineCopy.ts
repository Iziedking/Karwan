import type { Messages } from '@/shared/i18n/messages/en';
import type { RequestLineState } from './requestView';

type StateKeys = keyof Messages['search']['request']['states'];

/// Which state headline a request line shows, shared by every list of requests.
export const LINE_COPY: Record<RequestLineState, StateKeys> = {
  funded: 'funded',
  cancelled: 'cancelled',
  expired: 'expired',
  declined: 'declined',
  matchFound: 'matchWaitingSellerBuyer',
  closing: 'closing',
  offersArriving: 'offersArriving',
  looking: 'looking',
};
