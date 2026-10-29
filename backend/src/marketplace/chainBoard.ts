import type { Address, Hex, Log } from 'viem';
import { jobBoardAbi } from '../chain/abis/jobBoard.js';
import { publicClient, watchEventsViaGetLogs } from '../chain/client.js';
import { jobBoard, readPostedJobId } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
import { config } from '../config.js';
import { boardStore } from '../db/marketBoard.js';
import { BoardError, createKarwanBoard, type BoardRequest, type ChainBoardReads, type MarketBoard } from './board.js';

/// The old request board, as every post, offer and counter used it before view
/// 40. Kept so `MARKET_BOARD=chain` can go back to it, and read for requests
/// posted there before the switch.

const WATCH_POLL_MS = 15_000;
const ZERO: Address = '0x0000000000000000000000000000000000000000';

export const chainBoardReads: ChainBoardReads = {
  async request(jobId) {
    const r = (await jobBoard.read.jobs([jobId])) as readonly [Address, bigint, bigint, string, number, Address, bigint, bigint];
    if (r[0] === ZERO) return null;
    return {
      buyer: r[0],
      budget: r[1],
      deadline: r[2],
      termsHash: r[3],
      state: r[4] as BoardRequest['state'],
      acceptedSeller: r[5],
      acceptedPrice: r[6],
      acceptedDeadline: r[7],
    };
  },
  async offer(jobId, seller) {
    const b = (await jobBoard.read.bids([jobId, seller])) as readonly [Address, bigint, bigint, boolean];
    return b[3] ? { price: b[1], deadline: b[2] } : null;
  },
  async counter(jobId, seller) {
    const c = (await jobBoard.read.counters([jobId, seller])) as readonly [bigint, bigint, boolean];
    return c[2] ? { price: c[0], deadline: c[1] } : null;
  },
};

export function createChainBoard(): MarketBoard {
  const send = async (walletId: string, sig: string, params: unknown[], label: string) =>
    (await executeContractCall({ walletId, contractAddress: jobBoard.address, abiFunctionSignature: sig, abiParameters: params as never }, label)).txHash;
  return {
    kind: 'chain',
    async postRequest(i) {
      const ref = await send(
        i.walletId,
        'postJob(bytes32,uint256,uint64,string)',
        [i.salt, i.budget.toString(), i.deadline.toString(), i.termsHash],
        `postJob(${i.salt})`,
      );
      // Trust the emitted id: a drifted stored agent address derives another one,
      // and no event means the inner call reverted.
      const jobId = await readPostedJobId(ref);
      if (!jobId) throw new BoardError('NoJobPosted');
      return { jobId: jobId as Hex, ref };
    },
    async placeOffer(i) {
      const ref = await send(i.walletId, 'submitBid(bytes32,uint256,uint64)', [i.jobId, i.price.toString(), i.deadline.toString()], `submitBid(${i.jobId})`);
      return { ref };
    },
    async counter(i) {
      const ref = await send(
        i.walletId,
        'counterOffer(bytes32,address,uint256,uint64)',
        [i.jobId, i.seller, i.price.toString(), i.deadline.toString()],
        `counterOffer(${i.jobId})`,
      );
      return { ref };
    },
    async respond(i) {
      const ref = await send(
        i.walletId,
        'respondToCounter(bytes32,bool,uint256,uint64)',
        [i.jobId, i.accept, i.price.toString(), i.deadline.toString()],
        `respondToCounter(${i.jobId})`,
      );
      return { ref };
    },
    async accept(i) {
      const ref = await send(i.walletId, 'acceptBid(bytes32,address)', [i.jobId, i.seller], `acceptBid(${i.jobId})`);
      return { ref };
    },
    read: (jobId) => chainBoardReads.request(jobId),
    async recentPosted({ blocks }) {
      const latest = await publicClient.getBlockNumber();
      return (await publicClient.getLogs({
        address: jobBoard.address,
        event: jobBoardAbi.find((x) => x.type === 'event' && x.name === 'JobPosted')! as never,
        fromBlock: latest > blocks ? latest - blocks : 0n,
        toBlock: latest,
      })) as unknown as Log[];
    },
    watch(event, onLogs, onError) {
      return watchEventsViaGetLogs({
        address: jobBoard.address,
        abi: jobBoardAbi,
        eventName: event,
        pollingInterval: WATCH_POLL_MS,
        onLogs: (logs: Log[]) => onLogs(logs),
        onError,
      });
    },
  };
}

let current: MarketBoard | null = null;

/// The board every request, offer and counter goes through.
export function marketBoard(): MarketBoard {
  current ??=
    config.MARKET_BOARD === 'chain'
      ? createChainBoard()
      : createKarwanBoard({ store: boardStore(), chain: chainBoardReads, now: () => Math.floor(Date.now() / 1000), pollMs: WATCH_POLL_MS });
  return current;
}
