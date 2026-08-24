/// Bind every existing agent to the identity wallet that holds its stake.
///
/// Agent wallets hold no funds; everything owned sits on the identity wallet.
/// KarwanVault implements that, resolving an agent through `agentOwner` before
/// reading a balance, so `acceptEscrow` can ask about the seller AGENT and be
/// answered about the identity's stake.
///
/// The resolution needs a consented handshake, and only half of it was ever
/// wired: the agent's `registerOwner` was called, the identity's `approveAgent`
/// never was, so `registerOwner` reverted `AgentNotApproved` every time. It ran
/// fire-and-forget, so activation reported success while nothing bound. The
/// result is that NO agent on the platform is bound and no stake-backed deal has
/// ever been able to activate.
///
/// So every existing account needs the handshake, not just new ones. What this
/// can finish depends on whose signature the first half needs:
///
///   - email and passkey accounts: the identity is a wallet the backend signs
///     with, so both halves run here and the pair is bound when this exits.
///   - connected wallets: the approval is the user's signature and cannot be
///     forged, by design. They are counted and listed, and the card on /stake
///     collects it the next time they visit.
///
/// Read-only by default.
///
///   node dist/scripts/backfill-agent-bindings.js              (report)
///   node dist/scripts/backfill-agent-bindings.js --execute    (bind what it can)
///
/// Locally: npm run agents:bind

import { listAllAgentWallets } from '../db/agentWallets.js';
import { getUserByAddress } from '../db/users.js';
import { ensureSchema, pgEnabled } from '../db/client.js';
import { vault } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import { bindingStateFor, type AgentBindingState } from '../chain/agentBinding.js';
import { logger } from '../logger.js';

const execute = process.argv.includes('--execute');

interface Pair {
  role: 'buyer' | 'seller';
  walletId: string;
  agent: string;
}

async function stateOf(agent: string, identity: string): Promise<AgentBindingState> {
  try {
    const resolved = (await vault.read.resolveOwner([agent as `0x${string}`])) as string;
    return bindingStateFor({ agent, resolvedOwner: resolved, identity });
  } catch (err) {
    // A read that failed is not a binding that exists. `unbound` costs at worst
    // a redundant approval; `bound` would leave a deal that cannot activate.
    logger.warn({ agent, err: (err as Error).message }, 'binding read failed');
    return { kind: 'unknown' };
  }
}

async function main() {
  if (pgEnabled) await ensureSchema();

  const records = await listAllAgentWallets();
  console.log(`${records.length} account(s) with agents`);
  console.log(execute ? 'MODE: bind what can be bound' : 'MODE: report only, nothing will be sent');
  console.log('');

  let alreadyBound = 0;
  let bound = 0;
  let awaitingOwner = 0;
  let failed = 0;
  let unknown = 0;
  const unreadable: string[] = [];
  const foreign: string[] = [];
  const needSignature: string[] = [];

  for (const record of records) {
    const identity = record.userAddress.toLowerCase();
    const identityWalletId = getUserByAddress(identity)?.circleIdentityWalletId;
    const pairs: Pair[] = [
      { role: 'seller', walletId: record.sellerWalletId, agent: record.sellerAddress },
      { role: 'buyer', walletId: record.buyerWalletId, agent: record.buyerAddress },
    ].filter((pair): pair is Pair => !!pair.agent && !!pair.walletId);

    for (const pair of pairs) {
      const state = await stateOf(pair.agent, identity);

      if (state.kind === 'bound') {
        alreadyBound += 1;
        continue;
      }
      if (state.kind === 'unknown') {
        // Nothing is known about this pair, so it is not claimed as needing a
        // signature and nothing is sent for it. Fix the RPC and run again.
        unknown += 1;
        unreadable.push(`${identity} ${pair.role} ${pair.agent}`);
        continue;
      }
      if (state.kind === 'foreign') {
        // registerOwner refuses to move a binding, so this cannot be repaired
        // by sending anything. It is named so a person can look at it.
        foreign.push(`${identity} ${pair.role} ${pair.agent} -> ${state.owner}`);
        continue;
      }

      if (!identityWalletId) {
        // A connected wallet. Its approval is the user's signature and there is
        // nothing to send on their behalf; /stake collects it.
        awaitingOwner += 1;
        needSignature.push(`${identity} ${pair.role} ${pair.agent}`);
        continue;
      }

      if (!execute) {
        bound += 1;
        continue;
      }

      try {
        await executeContractCall(
          {
            walletId: identityWalletId,
            contractAddress: vault.address,
            abiFunctionSignature: 'approveAgent(address)',
            abiParameters: [pair.agent],
          },
          `vault.approveAgent(${pair.role} ${pair.agent})`,
        );
        await executeContractCall(
          {
            walletId: pair.walletId,
            contractAddress: vault.address,
            abiFunctionSignature: 'registerOwner(address)',
            abiParameters: [identity],
          },
          `vault.registerOwner(${pair.role} ${pair.agent})`,
        );
        // Confirm from the chain rather than from the fact the calls returned:
        // an ERC-4337 handleOps lands successfully while the userOp inside it
        // reverts, which is exactly how this went unnoticed the first time.
        const after = await stateOf(pair.agent, identity);
        if (after.kind === 'bound') {
          bound += 1;
          console.log(`bound   ${identity} ${pair.role}`);
        } else {
          failed += 1;
          console.log(`FAILED  ${identity} ${pair.role}: still ${after.kind} after both calls`);
        }
      } catch (err) {
        failed += 1;
        console.log(`FAILED  ${identity} ${pair.role}: ${(err as Error).message.split('\n')[0]}`);
      }
    }
  }

  console.log('');
  console.log('---');
  console.log(`${alreadyBound} already bound`);
  console.log(execute ? `${bound} bound now` : `${bound} bindable server-side`);
  console.log(`${awaitingOwner} waiting on the owner's signature (connected wallets)`);
  if (unknown > 0) {
    console.log(`${unknown} could not be read: the RPC did not answer, so nothing is known`);
  }
  if (failed > 0) console.log(`${failed} failed, listed above`);

  if (needSignature.length > 0) {
    console.log('');
    console.log('These need their owner to sign on /stake before a staked deal can activate:');
    for (const line of needSignature) console.log(`  ${line}`);
  }
  if (unreadable.length > 0) {
    console.log('');
    console.log('Unreadable. Fix the Arc RPC and run again before trusting the counts above:');
    for (const line of unreadable) console.log(`  ${line}`);
  }
  if (foreign.length > 0) {
    console.log('');
    console.log('Bound to a DIFFERENT identity. This cannot be moved, so look at each one:');
    for (const line of foreign) console.log(`  ${line}`);
  }
  if (!execute && bound > 0) console.log('\nRe-run with --execute to bind the server-side ones.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
