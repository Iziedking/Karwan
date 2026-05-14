import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const STORE_PATH = resolve(process.cwd(), 'data', 'profiles.json');

export type Role = 'buyer' | 'seller' | 'both';

export interface UserProfile {
  address: string;
  role: Role;
  displayName: string;
  createdAt: number;
  updatedAt: number;
  seller?: {
    skills: string[];
    bio: string;
    minBudgetUsdc: number;
    maxBudgetUsdc: number;
    minDeadlineDays: number;
    maxDeadlineDays: number;
  };
  buyer?: {
    maxBudgetUsdc: number;
    minDeadlineDays: number;
    maxDeadlineDays: number;
    bidCollectionSeconds: number;
    milestonePcts: number[];
  };
}

function ensureFile() {
  const dir = dirname(STORE_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(STORE_PATH)) writeFileSync(STORE_PATH, '{}', 'utf8');
}

function load(): Record<string, UserProfile> {
  ensureFile();
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Record<string, UserProfile>;
  } catch {
    return {};
  }
}

function save(store: Record<string, UserProfile>) {
  ensureFile();
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

export function getProfile(address: string): UserProfile | null {
  const key = address.toLowerCase();
  const store = load();
  return store[key] ?? null;
}

export function upsertProfile(input: Omit<UserProfile, 'createdAt' | 'updatedAt'>): UserProfile {
  const key = input.address.toLowerCase();
  const store = load();
  const existing = store[key];
  const now = Date.now();
  const next: UserProfile = {
    ...input,
    address: key,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  store[key] = next;
  save(store);
  return next;
}

export function listProfiles(): UserProfile[] {
  return Object.values(load());
}
