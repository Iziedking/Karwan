import { getContract, type Address } from 'viem';
import { config } from '../config.js';
import { publicClient } from './client.js';
import { jobBoardAbi } from './abis/jobBoard.js';
import { escrowAbi } from './abis/escrow.js';
import { reputationAbi } from './abis/reputation.js';

function required(name: string, value: string | undefined): Address {
  if (!value) throw new Error(`${name} is not set in .env`);
  return value as Address;
}

export const jobBoard = getContract({
  address: required('KARWAN_JOBBOARD_ADDR', config.KARWAN_JOBBOARD_ADDR),
  abi: jobBoardAbi,
  client: publicClient,
});

export const escrow = getContract({
  address: required('KARWAN_ESCROW_ADDR', config.KARWAN_ESCROW_ADDR),
  abi: escrowAbi,
  client: publicClient,
});

export const reputation = getContract({
  address: required('KARWAN_REPUTATION_ADDR', config.KARWAN_REPUTATION_ADDR),
  abi: reputationAbi,
  client: publicClient,
});

export const usdc = required('USDC_ADDR', config.USDC_ADDR);
export const identityRegistry = required('IDENTITY_REGISTRY_ADDR', config.IDENTITY_REGISTRY_ADDR);
