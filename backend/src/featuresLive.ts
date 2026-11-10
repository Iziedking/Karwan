import { config } from './config.js';
import { liveFeaturesFrom, type LiveFeatures } from './features.js';
import { work } from './work/workLive.js';
import { workRequests } from './work/workRequestsLive.js';

export const liveFeatures: LiveFeatures = liveFeaturesFrom({ work, workRequests, sellerAsked: config.SELLER_ASKED });
