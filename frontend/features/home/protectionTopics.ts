export const PROTECTION_TOPICS = ['escrow', 'milestones', 'disputes', 'agents'] as const;
export type ProtectionTopic = (typeof PROTECTION_TOPICS)[number];
