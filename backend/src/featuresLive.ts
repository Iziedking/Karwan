import { agentSwitchOpen } from './agents/agentPower.js';
import { config } from './config.js';
import { liveFeaturesFrom, type LiveFeatures } from './features.js';
import { work } from './work/workLive.js';
import { workRequests } from './work/workRequestsLive.js';

export const liveFeatures: LiveFeatures = liveFeaturesFrom({
  work,
  workRequests,
  sellerAsked: config.SELLER_ASKED,
  agentSwitch: agentSwitchOpen({ sellerAsked: config.SELLER_ASKED, shortlist: config.SHORTLIST_MODE }),
});
