// Proves Circle passkey recovery keeps the same wallet on Arc, end to end:
// a passkey wallet registers a recovery key, "loses" the passkey, recovers
// with a new one, and the new passkey then moves the funds back out.
//
// Throwaway: run on node-services in a temp dir, never with real user keys.
//   PHASE=setup   NETWORK=mainnet HOST=karwan.site K=<client key> npx tsx recovery-spike.mts
//     -> creates the test wallet, prints the address to fund, saves spike-state.json
//   PHASE=run     NETWORK=mainnet HOST=karwan.site K=<client key> RETURN_TO=<0x..> npx tsx recovery-spike.mts
//     -> registers recovery, recovers, checks the address, sends the balance to RETURN_TO
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient, createPublicClient, formatEther, http, toHex, type Hex } from 'viem';
import { createBundlerClient, toWebAuthnAccount } from 'viem/account-abstraction';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { arc, arcTestnet } from 'viem/chains';
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';

const NETWORK = process.env.NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const HOST = process.env.HOST ?? 'karwan.site';
const PHASE = process.env.PHASE ?? 'setup';
const STATE = 'spike-state.json';
(globalThis as any).window = { location: { hostname: HOST, origin: `https://${HOST}` } };
const { toCircleSmartAccount, toModularTransport, recoveryActions, modularWalletActions } = await import('@circle-fin/modular-wallets-core');

const chain = NETWORK === 'mainnet' ? { ...arc, testnet: false } : arcTestnet;
const rpc = NETWORK === 'mainnet' ? 'https://rpc.mainnet.arc.io' : 'https://rpc.testnet.arc.network';
const transport = toModularTransport(`https://modular-sdk.circle.com/v1/rpc/w3s/buidl/${NETWORK === 'mainnet' ? 'arc' : 'arcTestnet'}`, process.env.K!);
const client = createClient({ chain, transport });
const pc = createPublicClient({ chain, transport: http(rpc) });
const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url');

// Circle's bundler rejects viem's default fee estimate (priority fee of a few
// wei); it wants at least 1 gwei. Ask Circle for its own price instead.
const circle = client.extend(modularWalletActions as never) as unknown as {
  getUserOperationGasPrice: () => Promise<{ medium: { maxFeePerGas: string; maxPriorityFeePerGas: string } }>;
};
const userOperation = {
  estimateFeesPerGas: async () => {
    const { medium } = await circle.getUserOperationGasPrice();
    return { maxFeePerGas: BigInt(medium.maxFeePerGas), maxPriorityFeePerGas: BigInt(medium.maxPriorityFeePerGas) };
  },
};

type SoftKey = { id: string; priv: Hex };
function softPasskey({ id, priv }: SoftKey) {
  const key = Buffer.from(priv.slice(2), 'hex');
  const publicKey = toHex(p256.getPublicKey(key, false));
  const getFn = async (opts: any) => {
    const challenge = new Uint8Array(opts.publicKey.challenge);
    const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge: b64u(challenge), origin: `https://${HOST}`, crossOrigin: false }));
    const authData = new Uint8Array([...sha256(new TextEncoder().encode(HOST)), 0x05, 0, 0, 0, 0]);
    const digest = sha256(new Uint8Array([...authData, ...sha256(clientDataJSON)]));
    const sig = p256.sign(digest, key, { lowS: true, prehash: false }).toDERRawBytes();
    return { id, type: 'public-key', rawId: new Uint8Array([1]).buffer,
      response: { authenticatorData: authData.buffer, clientDataJSON: clientDataJSON.buffer, signature: sig.buffer, userHandle: null } } as any;
  };
  return { credential: { id, publicKey }, owner: toWebAuthnAccount({ credential: { id, publicKey }, rpId: HOST, getFn }) };
}
const newSoftKey = (id: string): SoftKey => ({ id, priv: toHex(p256.utils.randomPrivateKey()) });
const step = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); if (!ok) process.exitCode = 1; };

if (PHASE === 'setup') {
  const state = existsSync(STATE)
    ? JSON.parse(readFileSync(STATE, 'utf8'))
    : { original: newSoftKey('spike-original'), replacement: newSoftKey('spike-recovered'), recoveryKey: generatePrivateKey() };
  writeFileSync(STATE, JSON.stringify(state));
  const account = await toCircleSmartAccount({ client, owner: softPasskey(state.original).owner });
  console.log(`WALLET ${account.address} on ${NETWORK}. Send about 1 USDC to it, then run PHASE=run.`);
  process.exit(0);
}

const state = JSON.parse(readFileSync(STATE, 'utf8')) as { original: SoftKey; replacement: SoftKey; recoveryKey: Hex };

if (PHASE === 'sweep') {
  // Send what is left to RETURN_TO with the recovered passkey, keeping only this operation's gas.
  const recovered = await toCircleSmartAccount({ client, owner: softPasskey(state.replacement).owner });
  const sweeper = createBundlerClient({ account: recovered, chain, transport, userOperation });
  const balance = await pc.getBalance({ address: recovered.address });
  const keep = 12_000_000_000_000_000n; // 0.012 USDC covers one call
  const value = balance > keep ? balance - keep : 0n;
  const hash = await sweeper.sendUserOperation({ account: recovered, calls: [{ to: process.env.RETURN_TO as Hex, value }] });
  const sent = await sweeper.waitForUserOperationReceipt({ hash });
  step('sweep the rest', sent.success, `${formatEther(value)} USDC tx=${sent.receipt.transactionHash} gas=${formatEther(sent.actualGasCost)}`);
  console.log('left in test wallet', formatEther(await pc.getBalance({ address: recovered.address })), 'USDC');
  process.exit(process.exitCode ?? 0);
}
const first = softPasskey(state.original);
const account = await toCircleSmartAccount({ client, owner: first.owner });
const start = await pc.getBalance({ address: account.address });
step('wallet is funded', start > 0n, `${formatEther(start)} USDC at ${account.address}`);
if (start === 0n) process.exit(1);

const bundler = createBundlerClient({ account, chain, transport, userOperation }).extend(recoveryActions as never) as any;
const recoveryEoa = privateKeyToAccount(state.recoveryKey);
const regHash = await bundler.registerRecoveryAddress({ account, recoveryAddress: recoveryEoa.address });
const reg = await bundler.waitForUserOperationReceipt({ hash: regHash });
step('register recovery address', reg.success, `gas=${formatEther(reg.actualGasCost)} USDC tx=${reg.receipt.transactionHash}`);

const viaRecovery = await toCircleSmartAccount({ client, owner: recoveryEoa });
step('recovery key resolves to the same wallet', viaRecovery.address.toLowerCase() === account.address.toLowerCase(), viaRecovery.address);
const probe = `karwan recovery check ${Date.now()}`;
step('recovery key signature verifies on-chain (ERC-1271)', await pc.verifyMessage({ address: account.address, message: probe, signature: await viaRecovery.signMessage({ message: probe }) }));

const second = softPasskey(state.replacement);
const recBundler = createBundlerClient({ account: viaRecovery, chain, transport, userOperation }).extend(recoveryActions as never) as any;
const execHash = await recBundler.executeRecovery({ account: viaRecovery, credential: second.credential });
const exec = await recBundler.waitForUserOperationReceipt({ hash: execHash });
step('execute recovery with a new passkey', exec.success, `gas=${formatEther(exec.actualGasCost)} USDC tx=${exec.receipt.transactionHash}`);

const recovered = await toCircleSmartAccount({ client, owner: second.owner });
step('new passkey resolves to the same wallet', recovered.address.toLowerCase() === account.address.toLowerCase(), recovered.address);
const msg = `karwan sign-in ${Date.now()}`;
step('new passkey signature verifies on-chain', await pc.verifyMessage({ address: account.address, message: msg, signature: await recovered.signMessage({ message: msg }) }));

const returnTo = process.env.RETURN_TO as Hex | undefined;
if (returnTo) {
  const sweepBundler = createBundlerClient({ account: recovered, chain, transport, userOperation });
  const balance = await pc.getBalance({ address: account.address });
  const keep = 50_000_000_000_000_000n; // 0.05 USDC left for this operation's gas
  const value = balance > keep ? balance - keep : 0n;
  const hash = await sweepBundler.sendUserOperation({ account: recovered, calls: [{ to: returnTo, value }] });
  const sent = await sweepBundler.waitForUserOperationReceipt({ hash });
  step('recovered passkey moves the funds back', sent.success, `${formatEther(value)} USDC to ${returnTo} tx=${sent.receipt.transactionHash}`);
}
process.exit(process.exitCode ?? 0);
