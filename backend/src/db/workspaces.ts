import { randomUUID } from 'node:crypto';
import {
  getProfile,
  upsertProfile,
  type TradeAvailability,
  type UserProfile,
  type Workspace,
  type WorkspaceKind,
} from './profiles.js';

export type WorkspaceRole = 'owner';

export interface WorkspaceMembership {
  workspaceId: string;
  address: string;
  role: WorkspaceRole;
  createdAt: number;
}

export interface WorkspaceView extends Workspace {
  membership: WorkspaceMembership;
}

const PERSONAL_PREFIX = 'personal:';
const BUSINESS_PREFIX = 'business:';

function personalWorkspace(profile: UserProfile): Workspace {
  const now = profile.createdAt || Date.now();
  return {
    id: `${PERSONAL_PREFIX}${profile.address.toLowerCase()}`,
    kind: 'personal',
    name: profile.displayName?.trim() || 'Personal workspace',
    status: 'active',
    ownerAddress: profile.address.toLowerCase(),
    walletAddress: profile.address.toLowerCase(),
    balanceScope: 'identity',
    createdAt: now,
    updatedAt: now,
  };
}

function legacyBusinessWorkspace(profile: UserProfile): Workspace {
  const now = Date.now();
  const companyName = profile.smeProfile?.companyName?.trim() || profile.displayName?.trim() || 'Business workspace';
  const status = profile.business?.status === 'verified' ? 'active' : 'setup';
  return {
    id: `${BUSINESS_PREFIX}${profile.address.toLowerCase()}`,
    kind: 'business',
    name: companyName,
    status,
    ownerAddress: profile.address.toLowerCase(),
    walletAddress: profile.address.toLowerCase(),
    balanceScope: 'identity',
    business: {
      legalName: companyName,
      verificationStatus: profile.business?.status === 'verified' ? 'verified' : profile.business?.status === 'submitted' ? 'submitted' : 'not_started',
      company: profile.smeProfile,
    },
    createdAt: profile.createdAt || now,
    updatedAt: now,
  };
}

function ownerMembership(workspace: Workspace, profile: UserProfile): WorkspaceMembership {
  return {
    workspaceId: workspace.id,
    address: profile.address.toLowerCase(),
    role: 'owner',
    createdAt: workspace.createdAt,
  };
}

export function withWorkspaceDefaults(profile: UserProfile): UserProfile {
  const existing = profile.workspaces ?? [];
  // A business onboarding choice is an identity boundary, not a request to
  // create a second profile. Legacy business fields are included so old
  // records migrate to one business workspace without manufacturing a
  // personal workspace with the company name.
  const isBusinessIdentity =
    profile.accountKind === 'business' ||
    profile.accountType === 'business' ||
    !!profile.smeProfile ||
    (profile.business?.status !== undefined && profile.business.status !== 'none');
  const personal = isBusinessIdentity
    ? undefined
    : existing.find((workspace) => workspace.kind === 'personal') ?? personalWorkspace(profile);
  const hasLegacyBusiness = isBusinessIdentity;
  const business = existing.find((workspace) => workspace.kind === 'business') ?? (hasLegacyBusiness ? legacyBusinessWorkspace(profile) : null);
  const workspaces = [
    ...(personal ? [personal] : []),
    ...(business ? [business] : []),
    ...existing.filter(
      (workspace) =>
        workspace.id !== personal?.id &&
        workspace.id !== business?.id &&
        !(isBusinessIdentity && workspace.kind === 'personal'),
    ),
  ];
  const memberships = workspaces.map((workspace) => existing.find((candidate) => candidate.id === workspace.id)?.membership ?? ownerMembership(workspace, profile));
  return {
    ...profile,
    workspaces,
    workspaceMemberships: memberships,
  };
}

export async function ensureWorkspacesForProfile(profile: UserProfile): Promise<{ profile: UserProfile; changed: boolean }> {
  const next = withWorkspaceDefaults(profile);
  const changed = JSON.stringify(next.workspaces) !== JSON.stringify(profile.workspaces) || JSON.stringify(next.workspaceMemberships) !== JSON.stringify(profile.workspaceMemberships);
  if (!changed) return { profile, changed: false };
  return { profile: await upsertProfile(next), changed: true };
}

export async function listWorkspaces(address: string): Promise<WorkspaceView[]> {
  const profile = await getProfile(address);
  if (!profile) return [];
  const ensured = await ensureWorkspacesForProfile(profile);
  return (ensured.profile.workspaces ?? []).map((workspace) => ({
    ...workspace,
    membership: ensured.profile.workspaceMemberships?.find((membership) => membership.workspaceId === workspace.id) ?? ownerMembership(workspace, ensured.profile),
  }));
}

export async function getOwnedWorkspace(address: string, workspaceId: string): Promise<{ profile: UserProfile; workspace: Workspace; membership: WorkspaceMembership } | null> {
  const profile = await getProfile(address);
  if (!profile) return null;
  const ensured = await ensureWorkspacesForProfile(profile);
  const workspace = ensured.profile.workspaces?.find((candidate) => candidate.id === workspaceId);
  if (!workspace || workspace.ownerAddress !== address.toLowerCase()) return null;
  const membership = ensured.profile.workspaceMemberships?.find((candidate) => candidate.workspaceId === workspace.id) ?? ownerMembership(workspace, ensured.profile);
  return { profile: ensured.profile, workspace, membership };
}

export async function createBusinessWorkspace(address: string, input: { name: string }): Promise<WorkspaceView> {
  const profile = await getProfile(address);
  if (!profile) throw new Error('profile not found');
  const ensured = await ensureWorkspacesForProfile(profile);
  const existing = ensured.profile.workspaces?.find((workspace) => workspace.kind === 'business');
  if (existing) {
    return { ...existing, membership: ensured.profile.workspaceMemberships?.find((membership) => membership.workspaceId === existing.id) ?? ownerMembership(existing, ensured.profile) };
  }
  const now = Date.now();
  const workspace: Workspace = {
    id: `${BUSINESS_PREFIX}${randomUUID()}`,
    kind: 'business',
    name: input.name.trim(),
    status: 'setup',
    ownerAddress: profile.address.toLowerCase(),
    walletAddress: profile.address.toLowerCase(),
    balanceScope: 'identity',
    business: {
      legalName: input.name.trim(),
      verificationStatus: 'not_started',
    },
    createdAt: now,
    updatedAt: now,
  };
  const membership = ownerMembership(workspace, ensured.profile);
  const saved = await upsertProfile({
    ...ensured.profile,
    workspaces: [...(ensured.profile.workspaces ?? []), workspace],
    workspaceMemberships: [...(ensured.profile.workspaceMemberships ?? []), membership],
  });
  return { ...workspace, membership: saved.workspaceMemberships?.find((candidate) => candidate.workspaceId === workspace.id) ?? membership };
}

export async function updateBusinessWorkspace(address: string, workspaceId: string, input: { name?: string; company?: Partial<NonNullable<Workspace['business']>> }): Promise<WorkspaceView | null> {
  const owned = await getOwnedWorkspace(address, workspaceId);
  if (!owned || owned.workspace.kind !== 'business') return null;
  const updated: Workspace = {
    ...owned.workspace,
    ...(input.name?.trim() ? { name: input.name.trim() } : {}),
    ...(input.company && owned.workspace.business
      ? {
          business: {
            ...owned.workspace.business,
            ...input.company,
            legalName: input.company.legalName ?? owned.workspace.business.legalName,
            verificationStatus: input.company.verificationStatus ?? owned.workspace.business.verificationStatus,
          },
        }
      : {}),
    updatedAt: Date.now(),
  };
  const workspaces = (owned.profile.workspaces ?? []).map((workspace) => workspace.id === workspaceId ? updated : workspace);
  const saved = await upsertProfile({ ...owned.profile, workspaces });
  return { ...updated, membership: saved.workspaceMemberships?.find((candidate) => candidate.workspaceId === workspaceId) ?? owned.membership };
}

export async function listTradeAvailability(address: string, workspaceId: string): Promise<TradeAvailability[]> {
  const owned = await getOwnedWorkspace(address, workspaceId);
  if (!owned) return [];
  return owned.workspace.availability ?? [];
}

export async function saveTradeAvailability(address: string, workspaceId: string, input: Omit<TradeAvailability, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<TradeAvailability | null> {
  const owned = await getOwnedWorkspace(address, workspaceId);
  if (!owned || owned.workspace.kind !== 'business') return null;
  const now = Date.now();
  const current = owned.workspace.availability ?? [];
  const existing = input.id ? current.find((record) => record.id === input.id) : undefined;
  const record: TradeAvailability = {
    ...input,
    id: existing?.id ?? randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const availability = existing ? current.map((candidate) => candidate.id === record.id ? record : candidate) : [...current, record];
  const profile = await getProfile(address);
  if (!profile) return null;
  const workspaces = (profile.workspaces ?? []).map((workspace) => workspace.id === workspaceId ? { ...workspace, availability, updatedAt: now } : workspace);
  await upsertProfile({ ...profile, workspaces });
  return record;
}

export async function removeTradeAvailability(address: string, workspaceId: string, id: string): Promise<boolean> {
  const owned = await getOwnedWorkspace(address, workspaceId);
  if (!owned || owned.workspace.kind !== 'business') return false;
  const availability = (owned.workspace.availability ?? []).filter((record) => record.id !== id);
  if (availability.length === (owned.workspace.availability ?? []).length) return false;
  await upsertProfile({ ...owned.profile, workspaces: (owned.profile.workspaces ?? []).map((workspace) => workspace.id === workspaceId ? { ...workspace, availability, updatedAt: Date.now() } : workspace) });
  return true;
}

export function workspaceKindOf(workspace: Workspace | null | undefined): WorkspaceKind | null {
  return workspace?.kind ?? null;
}
