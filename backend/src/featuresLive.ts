import { liveFeaturesFrom, type LiveFeatures } from './features.js';
import { work } from './work/workLive.js';
import { workRequests } from './work/workRequestsLive.js';

export const liveFeatures: LiveFeatures = liveFeaturesFrom({ work, workRequests });
