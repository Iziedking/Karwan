import { randomBytes } from 'node:crypto';
import { createPublicClient, encodeAbiParameters, http, keccak256, parseAbi, parseAbiParameters, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/// A deal party's agent buying a dry run of the deal's agreed checks over x402:
/// it asks Karwan, receives the 402 price, signs a USDC authorization to the
/// fee contract, and follows the run until Chainlink's network answers on Arc.
///
///   CRE_DEMO_AGENT_KEY=0x... npx tsx src/scripts/cre-dry-run-agent.ts <family> <dealId> <branchSha> [pull]
///
/// KARWAN_API (default https://api.karwan.site) and ARC_RPC (default
/// https://rpc.testnet.arc.io) can be set. The key is read from the
/// environment and never printed.

const API = process.env.KARWAN_API ?? 'https://api.karwan.site';
const RPC = process.env.ARC_RPC ?? 'https://rpc.testnet.arc.io';
const EXPLORER = 'https://explorer.testnet.arc.io';
const CHAIN_ID = 5_042_002;
const POLL_MS = 15_000;
const GIVE_UP_MS = 30 * 60_000;

const [family = '', dealId = '', branchSha = '', pullArg] = process.argv.slice(2);
const key = process.env.CRE_DEMO_AGENT_KEY;
if (!/^0x[0-9a-fA-F]{40}$/.test(family) || !/^0x[0-9a-fA-F]{64}$/.test(dealId) || !/^[0-9a-f]{40}$/.test(branchSha)) {
  console.error('usage: cre-dry-run-agent.ts <family> <dealId> <branchSha> [pull]');
  process.exit(2);
}
if (!/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) {
  console.error('CRE_DEMO_AGENT_KEY is not set');
  process.exit(2);
}

const agent = privateKeyToAccount(key as Hex);
const arc = createPublicClient({ transport: http(RPC) });
const feesAbi = parseAbi(['function runs(bytes32 runId) view returns (address payer, uint64 openedAt, uint8 state, uint256 amount)']);
const usdcAbi = parseAbi(['function balanceOf(address) view returns (uint256)']);
const RUN_STATES = ['none', 'held', 'released to Karwan', 'refunded to the payer'];
const usd = (atomic: bigint) => `${(Number(atomic) / 1e6).toFixed(2)} USDC`;
const step = (n: number, text: string) => console.log(`\n${n}. ${text}`);
const line = (text: string) => console.log(`   ${text}`);
const url = `${API}/api/x402/cre/dry-run/${family}/${dealId}`;
const body = JSON.stringify({ branchSha, ...(pullArg ? { pull: Number(pullArg) } : {}) });
const headers = { 'content-type': 'application/json', 'x-karwan-payer': agent.address };

async function main() {
  console.log(`Agent ${agent.address} asks Karwan to run deal ${dealId.slice(0, 10)}…'s agreed checks on commit ${branchSha.slice(0, 8)}`);

  step(1, 'Ask for the dry run');
  const offer = await fetch(url, { method: 'POST', headers, body });
  if (offer.status !== 402) throw new Error(`expected a 402 price, got ${offer.status}: ${await offer.text()}`);
  const required = JSON.parse(Buffer.from(offer.headers.get('payment-required') ?? '', 'base64').toString('utf8')) as {
    accepts: { amount: string; asset: Address; payTo: Address; maxTimeoutSeconds: number }[];
  };
  const terms = required.accepts[0]!;
  line(`402 Payment Required: ${usd(BigInt(terms.amount))}, paid to the fee contract ${terms.payTo}`);
  line(`refundable by anyone after ${terms.maxTimeoutSeconds / 60} minutes without an answer from Chainlink`);
  line(`agent balance: ${usd(await arc.readContract({ address: terms.asset, abi: usdcAbi, functionName: 'balanceOf', args: [agent.address] }))}`);

  step(2, 'Sign a USDC ReceiveWithAuthorization to the fee contract');
  const authorization = {
    from: agent.address,
    to: terms.payTo,
    value: BigInt(terms.amount),
    validAfter: 0n,
    validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
    nonce: `0x${randomBytes(32).toString('hex')}` as Hex,
  };
  const signature = await agent.signTypedData({
    domain: { name: 'USDC', version: '2', chainId: CHAIN_ID, verifyingContract: terms.asset },
    types: {
      ReceiveWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'ReceiveWithAuthorization',
    message: authorization,
  });
  const runId = keccak256(encodeAbiParameters(parseAbiParameters('address, bytes32'), [agent.address, authorization.nonce]));
  line(`signed, run id ${runId}`);

  step(3, 'Pay and start the run');
  const payment = Buffer.from(JSON.stringify({
    x402Version: 2,
    accepted: { scheme: 'exact', network: `eip155:${CHAIN_ID}` },
    payload: {
      signature,
      authorization: Object.fromEntries(Object.entries(authorization).map(([k, v]) => [k, String(v)])),
    },
  })).toString('base64');
  const paid = await fetch(url, { method: 'POST', headers: { ...headers, 'payment-signature': payment }, body });
  const started = (await paid.json().catch(() => null)) as { runId?: string; poll?: string; error?: string } | null;
  if (paid.status !== 202 || !started?.runId) throw new Error(`the run did not start: ${paid.status} ${JSON.stringify(started)}`);
  line(`202 Accepted. Karwan relayed the payment to Arc and asked Chainlink CRE to run karwan-check`);
  const held = await arc.readContract({ address: terms.payTo, abi: feesAbi, functionName: 'runs', args: [runId] });
  line(`on Arc: ${usd(held[3])} ${RUN_STATES[held[2]]} for this run (${EXPLORER}/address/${terms.payTo})`);

  step(4, 'Wait for Chainlink\'s network: the replay runs on GitHub, then a signed answer reaches Arc');
  const from = Date.now();
  let lastState = '';
  while (Date.now() - from < GIVE_UP_MS) {
    const poll = (await (await fetch(`${API}${started.poll}`)).json().catch(() => null)) as Record<string, unknown> | null;
    const run = await arc.readContract({ address: terms.payTo, abi: feesAbi, functionName: 'runs', args: [runId] });
    const karwanState = (poll?.result as { state?: string } | undefined)?.state ?? (poll?.result ? 'answered' : 'unknown');
    const state = `Karwan: ${karwanState} · Arc: ${RUN_STATES[run[2]]}`;
    if (state !== lastState) line(`${new Date().toISOString().slice(11, 19)} ${state}`);
    lastState = state;
    if (run[2] === 2) {
      step(5, 'Answered');
      // Arc refuses log queries wider than 30,000 blocks.
      const latest = await arc.getBlockNumber();
      const releases = await arc.getContractEvents({
        address: terms.payTo,
        abi: parseAbi(['event Released(bytes32 indexed runId, bytes32 resultHash)']),
        eventName: 'Released',
        args: { runId },
        fromBlock: latest > 20_000n ? latest - 20_000n : 0n,
        toBlock: latest,
      }).catch(() => []);
      const tx = releases.at(-1)?.transactionHash;
      line(`Chainlink's network signed the result and the fee was released on Arc${tx ? `: ${EXPLORER}/tx/${tx}` : ''}`);
      const payload = (poll?.result as { payload?: { decision?: string } } | undefined)?.payload;
      if (payload?.decision) line(`decision: ${payload.decision}`);
      return;
    }
    if (run[2] === 3 || karwanState === 'unanswered' || karwanState === 'not-started') {
      line(`no answer: anyone can call refund(${runId}) on ${terms.payTo}`);
      process.exitCode = 1;
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  line('still waiting after 30 minutes');
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(`\nstopped: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
