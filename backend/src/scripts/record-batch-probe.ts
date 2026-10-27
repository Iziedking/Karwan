/// Read-only proof that a person's Karwan record can be set up inside one of
/// their own Arc transactions through Multicall3From (view 27, decision 10).
/// Fresh throwaway keys stand in for the person and both agents; every call is
/// an eth_call, so nothing is sent and nothing needs funds.
///   node --import tsx src/scripts/record-batch-probe.ts
import { createPublicClient, decodeFunctionResult, encodeFunctionData, erc20Abi, http, parseAbi, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { BUYING_AGENT_LIMITS, KIND, bindingTypedData, registryAbi } from '../identity/suiteIdentity.js';

const RPC = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.io';
const CHAIN_ID = 5042002;
const MULTICALL3FROM: Hex = '0x522fAf9A91c41c443c66765030741e4AaCe147D0';
/// contracts/deployments/endgame-5042002.json, identity.
const REGISTRY: Hex = '0x5409e859E1604b6Efa01827CCd3d2D7aaB1e3D5D';
const USDC: Hex = '0x3600000000000000000000000000000000000000';

const multicallAbi = parseAbi([
  'struct Call3 { address target; bool allowFailure; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate3(Call3[] calls) returns (Result[])',
]);
const countAbi = parseAbi(['function identityCount() view returns (uint64)']);

type Call3 = { target: Hex; allowFailure: boolean; callData: Hex };
type Result = { success: boolean; returnData: Hex };

const client = createPublicClient({ transport: http(RPC) });

async function bindCall(agentKey: Hex, kind: number, identityId: bigint, deadline: bigint): Promise<Call3> {
  const agent = privateKeyToAccount(agentKey);
  const nowSecs = BigInt(Math.floor(Date.now() / 1000));
  const isAgent = kind === KIND.Agent;
  const expiry = isAgent ? nowSecs + 365n * 86_400n : 0n;
  const perPayment = isAgent ? BUYING_AGENT_LIMITS.perPayment : 0n;
  const total = isAgent ? BUYING_AGENT_LIMITS.total : 0n;
  const nonce = await client.readContract({ address: REGISTRY, abi: registryAbi, functionName: 'nonces', args: [agent.address] });
  const sig = await agent.signTypedData(
    bindingTypedData({ registry: REGISTRY, chainId: CHAIN_ID, identityId, wallet: agent.address, kind, expiry, perPayment, total, deadline, nonce }),
  );
  return {
    target: REGISTRY,
    allowFailure: true,
    callData: encodeFunctionData({ abi: registryAbi, functionName: 'bind', args: [agent.address, kind, expiry, perPayment, total, deadline, sig] }),
  };
}

const registerCall = (allowFailure: boolean): Call3 => ({
  target: REGISTRY,
  allowFailure,
  callData: encodeFunctionData({ abi: registryAbi, functionName: 'register' }),
});

const bindingRead = (wallet: Hex): Call3 => ({
  target: REGISTRY,
  allowFailure: true,
  callData: encodeFunctionData({ abi: registryAbi, functionName: 'bindingOf', args: [wallet] }),
});

async function simulate(from: Hex, calls: Call3[]): Promise<Result[]> {
  const { data } = await client.call({
    account: from,
    to: MULTICALL3FROM,
    data: encodeFunctionData({ abi: multicallAbi, functionName: 'aggregate3', args: [calls] }),
  });
  return [...decodeFunctionResult({ abi: multicallAbi, functionName: 'aggregate3', data: data! })];
}

function boundId(r: Result | undefined): bigint {
  if (!r?.success) return -1n;
  const [id] = decodeFunctionResult({ abi: registryAbi, functionName: 'bindingOf', data: r.returnData });
  return id;
}

const ok = (r: Result[], i: number) => r[i]?.success === true;

async function runCase(name: string, offset: bigint, deadlineFromNow: bigint, registerTwice: boolean, expect: (r: Result[], predicted: bigint) => boolean) {
  const person = privateKeyToAccount(generatePrivateKey());
  const buyerKey = generatePrivateKey();
  const sellerKey = generatePrivateKey();
  const count = await client.readContract({ address: REGISTRY, abi: countAbi, functionName: 'identityCount' });
  const predicted = count + 1n;
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + deadlineFromNow;
  const transfer: Call3 = {
    target: USDC,
    allowFailure: false,
    callData: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [person.address, 0n] }),
  };
  const calls: Call3[] = [
    transfer,
    registerCall(true),
    ...(registerTwice ? [registerCall(true)] : []),
    await bindCall(buyerKey, KIND.Agent, predicted + offset, deadline),
    await bindCall(sellerKey, KIND.Wallet, predicted + offset, deadline),
    bindingRead(privateKeyToAccount(buyerKey).address),
    bindingRead(privateKeyToAccount(sellerKey).address),
  ];
  const results = await simulate(person.address, calls);
  const passed = expect(results, predicted);
  const summary = results.map((r) => (r.success ? 'y' : 'n')).join('');
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${name}: identityCount ${count}, subcalls ${summary}, buyer bound to ${boundId(results.at(-2))}, seller bound to ${boundId(results.at(-1))}`);
  return { passed, calls, person: person.address };
}

const code = await client.getCode({ address: MULTICALL3FROM });
console.log(`chain ${await client.getChainId()}, Multicall3From ${code ? (code.length - 2) / 2 : 0} bytes`);

const right = await runCase('right number', 0n, 3_600n, false, (r, id) =>
  [0, 1, 2, 3].every((i) => ok(r, i)) && boundId(r[4]) === id && boundId(r[5]) === id);
await runCase('wrong number', 1n, 3_600n, false, (r) =>
  ok(r, 0) && ok(r, 1) && !ok(r, 2) && !ok(r, 3) && boundId(r[4]) === 0n && boundId(r[5]) === 0n);
await runCase('expired deadline', 0n, -60n, false, (r) => ok(r, 0) && ok(r, 1) && !ok(r, 2) && !ok(r, 3));
await runCase('register twice', 0n, 3_600n, true, (r, id) =>
  ok(r, 0) && ok(r, 1) && !ok(r, 2) && ok(r, 3) && ok(r, 4) && boundId(r[5]) === id);

const transferAlone = right.calls.slice(0, 1);
const gas = async (calls: Call3[]) =>
  client
    .estimateGas({ account: right.person, to: MULTICALL3FROM, data: encodeFunctionData({ abi: multicallAbi, functionName: 'aggregate3', args: [calls] }) })
    .catch((err: Error) => `n/a (${err.message.split('\n')[0]})`);
console.log(`gas: transfer alone ${await gas(transferAlone)}, transfer with the record ${await gas(right.calls.slice(0, 4))}`);
