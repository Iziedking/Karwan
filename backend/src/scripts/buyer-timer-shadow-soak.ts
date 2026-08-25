import { runBuyerTimerShadowSoak } from '../agents/buyerTaskSoak.js';

const report = await runBuyerTimerShadowSoak();
console.log(JSON.stringify({
  mode: 'offline-read-only-shadow-soak',
  authoritativeTimers: 'legacy',
  financialFlagsChanged: false,
  report,
}, null, 2));
