'use client';
// Manual CCTP V2 depositForBurn on Solana Devnet, signed by the user's own
// wallet (Phantom). This bypasses @circle-fin/adapter-solana-kit entirely: that
// adapter builds a sending-only signer from window.solana but signs the burn
// with partiallySignTransactionMessageWithSigners, which structurally ignores
// sending signers, so the fee-payer signature is never attached (Solana error
// #5663012) and no provider shim can reach the failing path.
//
// Everything below is verified byte-for-byte against Circle's published Anchor
// IDL (circlefin/solana-cctp-contracts, examples/target/idl/
// token_messenger_minter_v2.json) and the official example scripts
// (examples/v2/solana.ts + utils.ts): the instruction discriminator, the
// 18-account order (including the trailing __event_authority + program pair
// Anchor appends for event CPI), the borsh field order of
// DepositForBurnParams, and the PDA seed encodings (the remote-domain seed is
// the DECIMAL STRING of the domain, not bytes).
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { ARC_TESTNET, SOLANA_RPC_URL, SOLANA_USDC_MINT } from './config';

// Same program IDs on mainnet and devnet (Circle docs: cctp/references/solana-programs).
const MESSAGE_TRANSMITTER_V2 = new PublicKey('CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC');
const TOKEN_MESSENGER_MINTER_V2 = new PublicKey('CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe');
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

// Anchor discriminator for deposit_for_burn, from the published IDL.
const DEPOSIT_FOR_BURN_DISCRIMINATOR = Uint8Array.from([215, 60, 61, 46, 114, 55, 128, 176]);

const USDC_DECIMALS = 6;
// CCTP V2 Fast Transfer (soft finality). Matches the EVM paths.
const MIN_FINALITY_THRESHOLD_FAST = 1000;

const utf8 = (s: string) => new TextEncoder().encode(s);

function pda(seeds: Uint8Array[], programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

/// EVM address -> 32-byte mint recipient (12 zero bytes + 20 address bytes),
/// wrapped as a Pubkey the way Circle's examples do.
function evmAddressToPubkey(address: `0x${string}`): PublicKey {
  const hex = address.slice(2);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 20; i++) {
    bytes[12 + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new PublicKey(bytes);
}

/// Borsh-encode DepositForBurnParams in IDL field order:
/// amount u64 LE, destination_domain u32 LE, mint_recipient 32B,
/// destination_caller 32B, max_fee u64 LE, min_finality_threshold u32 LE.
function encodeDepositForBurnData(input: {
  amount: bigint;
  destinationDomain: number;
  mintRecipient: PublicKey;
  destinationCaller: PublicKey;
  maxFee: bigint;
  minFinalityThreshold: number;
}): Uint8Array {
  const data = new Uint8Array(8 + 8 + 4 + 32 + 32 + 8 + 4);
  const view = new DataView(data.buffer);
  data.set(DEPOSIT_FOR_BURN_DISCRIMINATOR, 0);
  view.setBigUint64(8, input.amount, true);
  view.setUint32(16, input.destinationDomain, true);
  data.set(input.mintRecipient.toBytes(), 20);
  data.set(input.destinationCaller.toBytes(), 52);
  view.setBigUint64(84, input.maxFee, true);
  view.setUint32(92, input.minFinalityThreshold, true);
  return data;
}

export interface SolanaBurnBuild {
  transaction: Transaction;
  /// Fresh keypair for the MessageSent event account. Must co-sign the tx
  /// (already partial-signed by build); its rent is paid by the owner.
  eventKeypair: Keypair;
  connection: Connection;
  blockhash: string;
  lastValidBlockHeight: number;
}

/// Build (and partial-sign with the event keypair) the depositForBurn
/// transaction that burns `amountUsdc` of devnet USDC from the owner's ATA,
/// targeting the Arc recipient. Phantom adds the owner/fee-payer signature.
export async function buildDepositForBurnTx(input: {
  owner: PublicKey;
  amountUsdc: number;
  mintRecipient: `0x${string}`;
}): Promise<SolanaBurnBuild> {
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
  const mint = new PublicKey(SOLANA_USDC_MINT);
  const owner = input.owner;
  const eventKeypair = Keypair.generate();

  const amount = BigInt(Math.round(input.amountUsdc * 10 ** USDC_DECIMALS));
  // Fast-transfer fee CAP (Circle charges the real fee <= this). Mirrors the
  // EVM paths: 1% of the amount with a 0.01 USDC floor.
  const maxFee = BigInt(Math.round(Math.max(0.01, input.amountUsdc * 0.01) * 10 ** USDC_DECIMALS));

  const tmm = TOKEN_MESSENGER_MINTER_V2;
  const senderAuthority = pda([utf8('sender_authority')], tmm);
  const burnTokenAccount = pda(
    [owner.toBytes(), TOKEN_PROGRAM.toBytes(), mint.toBytes()],
    ASSOCIATED_TOKEN_PROGRAM,
  );
  const denylistAccount = pda([utf8('denylist_account'), owner.toBytes()], tmm);
  const messageTransmitter = pda([utf8('message_transmitter')], MESSAGE_TRANSMITTER_V2);
  const tokenMessenger = pda([utf8('token_messenger')], tmm);
  // Seed is the destination domain as a DECIMAL STRING (per Circle's examples).
  const remoteTokenMessenger = pda(
    [utf8('remote_token_messenger'), utf8(String(ARC_TESTNET.domain))],
    tmm,
  );
  const tokenMinter = pda([utf8('token_minter')], tmm);
  const localToken = pda([utf8('local_token'), mint.toBytes()], tmm);
  const eventAuthority = pda([utf8('__event_authority')], tmm);

  const data = encodeDepositForBurnData({
    amount,
    destinationDomain: ARC_TESTNET.domain,
    mintRecipient: evmAddressToPubkey(input.mintRecipient),
    // Zero = any caller may submit receiveMessage on Arc (our backend relay).
    destinationCaller: PublicKey.default,
    maxFee,
    minFinalityThreshold: MIN_FINALITY_THRESHOLD_FAST,
  });

  // Account order is the IDL's, exactly.
  const keys = [
    { pubkey: owner, isSigner: true, isWritable: false },
    { pubkey: owner, isSigner: true, isWritable: true }, // event_rent_payer
    { pubkey: senderAuthority, isSigner: false, isWritable: false },
    { pubkey: burnTokenAccount, isSigner: false, isWritable: true },
    { pubkey: denylistAccount, isSigner: false, isWritable: false },
    { pubkey: messageTransmitter, isSigner: false, isWritable: true },
    { pubkey: tokenMessenger, isSigner: false, isWritable: false },
    { pubkey: remoteTokenMessenger, isSigner: false, isWritable: false },
    { pubkey: tokenMinter, isSigner: false, isWritable: false },
    { pubkey: localToken, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: true },
    { pubkey: eventKeypair.publicKey, isSigner: true, isWritable: true },
    { pubkey: MESSAGE_TRANSMITTER_V2, isSigner: false, isWritable: false },
    { pubkey: TOKEN_MESSENGER_MINTER_V2, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: eventAuthority, isSigner: false, isWritable: false },
    { pubkey: TOKEN_MESSENGER_MINTER_V2, isSigner: false, isWritable: false }, // program
  ];

  const instruction = new TransactionInstruction({
    programId: tmm,
    keys,
    data: data as unknown as Buffer,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const transaction = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight });
  transaction.add(instruction);
  // The MessageSent event account must co-sign; Phantom then adds the owner's
  // fee-payer signature on top of this partial signature.
  transaction.partialSign(eventKeypair);

  return { transaction, eventKeypair, connection, blockhash, lastValidBlockHeight };
}

/// Wait until the burn signature is confirmed (or the blockhash expires).
export async function confirmBurn(build: SolanaBurnBuild, signature: string): Promise<void> {
  const res = await build.connection.confirmTransaction(
    { signature, blockhash: build.blockhash, lastValidBlockHeight: build.lastValidBlockHeight },
    'confirmed',
  );
  if (res.value.err) {
    throw new Error(`Solana burn failed on chain: ${JSON.stringify(res.value.err)}`);
  }
}
