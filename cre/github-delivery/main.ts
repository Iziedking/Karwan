import { Runner } from '@chainlink/cre-sdk';
import { configSchema, initWorkflow } from './workflow.js';

export async function main() {
  const runner = await Runner.newRunner({ configSchema });
  await runner.run(initWorkflow);
}

main();
