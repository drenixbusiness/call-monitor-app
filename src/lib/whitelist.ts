import type { RcDeployAccount } from '@/lib/deployAccount';

/** Shared user whitelists - must stay in sync across dashboard, sync, account2 APIs */
export const WHITELIST_ACCOUNT1: readonly string[] = [
  'Ethan Parker',
  'Fred Royce',
  'HR Sam',
  'Nick Allen',
  'Tony Safety Department',
];
export const WHITELIST_ACCOUNT2: readonly string[] = [
  'Alex Chester',
  'Winston Smith',
  'Isaac Taylor',
  'Simon Cooper',
  'Tim Baker',
  'Henry Safety Department',
];

/** Monday Leads sidebar names per deploy (must match USER_BOARD_MAP keys in api/monday/leads). */
export const MONDAY_USERS_ACCOUNT1: readonly string[] = ['Fred', 'Ethan', 'Nick', 'HR Sam'];
export const MONDAY_USERS_ACCOUNT2: readonly string[] = ['Alex Chester', 'Winston', 'Simon Cooper', 'Tim Baker'];

/** Combined list (dual-mode / legacy); order kept for stable UI colors. */
export const MONDAY_USERS_ALL: readonly string[] = ['Alex Chester', 'Fred', 'Ethan', 'Winston', 'Simon Cooper', 'Tim Baker', 'Nick', 'Sam'];

export function getMondayUsersForDeploy(deploy: RcDeployAccount | null): readonly string[] {
  if (deploy === 'account1') return MONDAY_USERS_ACCOUNT1;
  if (deploy === 'account2') return MONDAY_USERS_ACCOUNT2;
  return MONDAY_USERS_ALL;
}