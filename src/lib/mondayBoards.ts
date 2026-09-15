/** Monday board names per recruiter (must match Monday workspace). */
export const USER_BOARD_MAP: Record<string, string[]> = {
  Fred: ['New leads Fred', 'Follow up Fred'],
  'Alex Chester': ['New leads Alex', 'Follow up Alex'],
  Ethan: ['New leads Ethan', 'Follow up Ethan'],
  Winston: ['New leads Winston', 'Follow up Winston'],
  'Simon Cooper': ['New leads Simon', 'Follow up Simon'],
  'Tim Baker': ['New leads Tim', 'Follow up Tim'],
  Nick: ['New leads Nick', 'Follow up Nick'],
  Sam: ['New leads Sam', 'Follow up Sam'],
};

export const MONDAY_USERS = ['Alex Chester', 'Fred', 'Ethan', 'Winston', 'Simon Cooper', 'Tim Baker', 'Nick', 'Sam'] as const;

export const BOARD_TO_USER: Record<string, string> = {};
for (const [user, boards] of Object.entries(USER_BOARD_MAP)) {
  for (const b of boards) {
    BOARD_TO_USER[b.trim()] = user;
  }
}

export function ownerMatchesUser(ownerLead: string, userName: string): boolean {
  const o = (ownerLead || '').trim().toLowerCase();
  const u = (userName || '').trim().toLowerCase();
  if (!o) return false;
  return u === o || u.startsWith(o + ' ') || o.startsWith(u.split(' ')[0] + ' ') || u.split(' ')[0] === o.split(' ')[0];
}

/** Same as inline leads API: Owner_lead or board owner, else requesting user when board is unknown. */
export function resolveCountingOwner(
  row: { lead: { ownerLead: string }; boardName: string },
  requestUserName: string
): string {
  const o = row.lead.ownerLead.trim();
  if (o) return o;
  return BOARD_TO_USER[row.boardName.trim()] || requestUserName;
}
