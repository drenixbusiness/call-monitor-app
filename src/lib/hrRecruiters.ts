/**
 * HR recruiters (Monday sidebar / legacy naming).
 * Safety users are not on Monday — see `telegramReport.ts` for Telegram RC lists.
 */

export const HR_RECRUITERS = [
  'Alex Chester',
  'Carla',
  'Fred',
  'Ethan',
  'Winston',
  'Tim',
  'Nick',
  'Simon',
  'Sam',
  'Oliver',
  'John',
] as const;

/** Monday API user param -> RC full name (for extension lookup) */
export const MONDAY_TO_RC_NAME: Record<string, string> = {
  'Alex Chester': 'Alex Chester',
  'Carla': 'Carla Connor',
  'Fred': 'Fred Royce',
  'Ethan': 'Ethan Parker',
  'Winston': 'Winston Smith',
  'Tim': 'Tim Baker',
  'Nick': 'Nick Allen',
  'Simon': 'Simon Cooper',
  'Sam': 'HR Sam',
  'Oliver': 'Oliver Clark',
  'John': 'John Brooks',
};
