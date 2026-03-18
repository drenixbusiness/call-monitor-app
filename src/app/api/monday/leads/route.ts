import { NextResponse } from 'next/server';

const MONDAY_API = 'https://api.monday.com/v2';

const USER_BOARD_MAP: Record<string, string[]> = {
  'Fred': ['New leads Fred', 'Follow up Fred'],
  'Alex Chester': ['New leads Alex', 'Follow up Alex'],
  'Ethan': ['New leads Ethan', 'Follow up Ethan'],
  'Winston': ['New leads Winston', 'Follow up Winston'],
  'Jessica': ['New leads Jessica', 'Follow up Jessica'],
};

export const MONDAY_USERS = ['Alex Chester', 'Fred', 'Ethan', 'Winston', 'Jessica'] as const;

/** Map board name -> user who owns that board (for Owner_lead fallback when empty) */
const BOARD_TO_USER: Record<string, string> = {};
for (const [user, boards] of Object.entries(USER_BOARD_MAP)) {
  for (const b of boards) {
    BOARD_TO_USER[b.trim()] = user;
  }
}

/** Check if ownerLead value matches this user (flexible: "Alex" matches "Alex Chester") */
function ownerMatchesUser(ownerLead: string, userName: string): boolean {
  const o = (ownerLead || '').trim().toLowerCase();
  const u = (userName || '').trim().toLowerCase();
  if (!o) return false;
  return u === o || u.startsWith(o + ' ') || o.startsWith(u.split(' ')[0] + ' ') || u.split(' ')[0] === o.split(' ')[0];
}

async function mondayGraphql(query: string, variables?: Record<string, unknown>) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error('MONDAY_API_TOKEN is not set');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(MONDAY_API, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Monday API HTTP ${res.status}: ${JSON.stringify(data)}`);
    }
    if (data.errors?.length) {
      const msg = data.errors.map((e: { message?: string }) => e.message).filter(Boolean).join('; ');
      throw new Error(`Monday API: ${msg || JSON.stringify(data.errors)}`);
    }
    return data;
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error) {
      if (err.name === 'AbortError') throw new Error('Monday API timeout (30s). Check network.');
      if (err.message.includes('fetch failed'))
        throw new Error('Cannot reach Monday API. Check internet, firewall, or try a different network.');
    }
    throw err;
  }
}

/** This month's range in US Central. Start of 1st 00:00 to end of last day 23:59:59. */
function getThisMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = new Date(Date.UTC(y, m, 1, 6, 0, 0, 0));
  const to = new Date(Date.UTC(y, m + 1, 1, 5, 59, 59, 999));
  return { from, to };
}

function parseDateFromColumn(col: { text?: string; value?: string }): Date | null {
  const text = col.text?.trim();
  const val = col.value;
  if (text) {
    const d = new Date(text);
    if (!isNaN(d.getTime())) return d;
  }
  if (val) {
    try {
      const v = typeof val === 'string' ? JSON.parse(val) : val;
      const dateStr = v?.date ?? v?.startDate ?? v?.start_date;
      if (dateStr) {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) return d;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function parseDateColumn(val: string): Date | null {
  if (!val || !val.trim()) return null;
  const s = val.trim();
  try {
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed;
  } catch {
    // ignore
  }
  try {
    const v = JSON.parse(s);
    const dateStr = v?.date ?? v?.startDate;
    if (dateStr) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return d;
    }
  } catch {
    // ignore
  }
  return null;
}

const STATUS_VALUES = ['Not touched', 'Follow up', 'Rejected', 'N/A', 'Not valid lead', 'Processing'] as const;

function getColumnValue(col: { column?: { title?: string }; text?: string; value?: string; type?: string }): string {
  if (col.text) return String(col.text).trim();
  if (col.value) {
    try {
      const v = typeof col.value === 'string' ? JSON.parse(col.value) : col.value;
      const raw = v?.label ?? v?.text ?? v?.name ?? v?.status_label ?? String(col.value ?? '');
      return String(raw).trim();
    } catch {
      return String(col.value ?? '').trim();
    }
  }
  return '';
}

function normalizeStatus(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return 'Not touched';
  if (STATUS_VALUES.includes(s as (typeof STATUS_VALUES)[number])) return s;
  const lower = s.toLowerCase();
  if (lower.includes('n/a') || lower === 'na') return 'N/A';
  if (lower.includes('process')) return 'Processing';
  if (lower.includes('not valid') || lower.includes('invalid')) return 'Not valid lead';
  if (lower.includes('follow')) return 'Follow up';
  if (lower.includes('not touch') || lower.includes('not called')) return 'Not touched';
  if (lower.includes('reject')) return 'Rejected';
  return 'Other';
}

import { getLeadTiming, getCallTimeIntervalSeconds, formatCallTimeInterval, parseAsUSCentral, type LeadTimingResult } from '@/utils/leadShift';

export interface MondayLead {
  id: string;
  name: string;
  createdAt: string;
  columns: Record<string, string>;
  status: string;
  company: string;
  date: string;
  platform: string;
  position: string;
  type: string;
  state: string;
  number: string;
  email: string;
  note: string;
  dateContact: string;
  /** Original owner (empty = board owner). Used for stats: leads count toward owner, not board. */
  ownerLead: string;
  /** Computed: On time / Late / Pending (interval > 10 min during shift = Late) */
  timing: LeadTimingResult;
  /** Call time interval from effective SLA start to date contacted (e.g. "5m 30s"). — if not contacted. */
  callTimeInterval: string;
}

export async function GET(request: Request) {
  try {
    const token = process.env.MONDAY_API_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'MONDAY_API_TOKEN is not set' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const userName = searchParams.get('user');
    if (!userName || !USER_BOARD_MAP[userName]) {
      return NextResponse.json({ error: 'Invalid user. Use: Alex Chester, Fred, Ethan, Winston, Jessica' }, { status: 400 });
    }

    const dateFromParam = searchParams.get('dateFrom');
    const dateToParam = searchParams.get('dateTo');
    const useCustomRange = dateFromParam && dateToParam;

    const boardNamesForDisplay = USER_BOARD_MAP[userName];
    const allBoardNames = Object.values(USER_BOARD_MAP).flat();
    const { from: monthFrom, to: monthTo } = getThisMonthRange();
    const filterFrom = useCustomRange ? new Date(dateFromParam!) : monthFrom;
    const filterTo = useCustomRange ? new Date(dateToParam!) : monthTo;

    const boardsQuery = `
      query {
        boards(limit: 100) {
          id
          name
        }
      }
    `;
    const boardsRes = await mondayGraphql(boardsQuery);
    const allBoards = boardsRes?.data?.boards || [];
    // Fetch ALL users' boards so we can count transferred leads (e.g. Alex's leads in Jessica's board)
    const boardsToFetch = allBoards.filter((b: { name: string }) =>
      allBoardNames.some((n) => (b.name || '').trim() === n.trim())
    );

    const itemsPageFields = `
      id
      name
      created_at
      column_values {
        id
        type
        text
        value
        column { id title }
      }
    `;

    const boardsItemsQuery = `
      query($boardId: ID!) {
        boards(ids: [$boardId]) {
          id
          name
          items_page(limit: 500) {
            cursor
            items { ${itemsPageFields} }
          }
        }
      }
    `;

    const nextItemsQuery = `
      query($cursor: String!) {
        next_items_page(limit: 500, cursor: $cursor) {
          cursor
          items { ${itemsPageFields} }
        }
      }
    `;

    const allLeads: { lead: MondayLead; boardName: string }[] = [];
    const statusCounts: Record<string, number> = {
      'N/A': 0,
      'Processing': 0,
      'Not valid lead': 0,
      'Follow up': 0,
      'Not touched': 0,
      'Rejected': 0,
      'Other': 0,
    };

    type MondayItem = { id: string; name?: string; created_at?: string; column_values?: { column?: { id?: string; title?: string }; id?: string; type?: string; text?: string; value?: string }[] };

    for (const board of boardsToFetch) {
      let cursor: string | null = null;
      let items: MondayItem[] = [];

      do {
        let res: { data?: { boards?: { items_page?: { cursor?: string; items?: MondayItem[] } }[]; next_items_page?: { cursor?: string; items?: MondayItem[] } } };
        if (!cursor) {
          res = await mondayGraphql(boardsItemsQuery, { boardId: board.id });
          const page = res?.data?.boards?.[0]?.items_page;
          items = page?.items || [];
          cursor = page?.cursor || null;
        } else {
          res = await mondayGraphql(nextItemsQuery, { cursor });
          const page = res?.data?.next_items_page;
          items = page?.items || [];
          cursor = page?.cursor || null;
        }

        for (const item of items) {
        const columns: Record<string, string> = {};
        let status = '';
        let company = '';
        let date = '';
        let platform = '';
        let position = '';
        let type = '';
        let state = '';
        let number = '';
        let email = '';
        let note = '';
        let dateContact = '';
        let ownerLead = '';
        let leadDateParsed: Date | null = null;

        let statusFromStatus2 = '';
        let statusFromStatus = '';
        let statusFromAny = '';
        for (const col of item.column_values || []) {
          const title = (col.column?.title || '').toLowerCase();
          const rawTitle = (col.column?.title || '').trim();
          const val = getColumnValue(col);
          columns[col.column?.title || col.column?.id || ''] = val;

          // Only use explicit Status columns - NEVER Person/People/Assignee (but allow Owner_lead)
          const isPersonColumn = title.includes('person') || title.includes('people') || title.includes('assignee') || (title.includes('owner') && !title.includes('lead')) || col.type === 'people';
          if (isPersonColumn) continue;

          if (rawTitle === 'Status 2' || title === 'status 2') statusFromStatus2 = val;
          else if (rawTitle === 'Status' || title === 'status') statusFromStatus = val;
          else if (title.includes('status') && val && col.type === 'status') statusFromAny = val;
          if (title.includes('company')) company = val;
          if (title === 'date' && !title.includes('contact')) {
            date = val;
            // Lead arrival: prefer raw value (date+time) for accurate US Central parsing
            let rawDateStr = '';
            try {
              const v = typeof col.value === 'string' ? JSON.parse(col.value) : col.value;
              const d = v?.date ?? v?.startDate ?? v?.start_date ?? '';
              const t = v?.time ?? v?.startTime ?? '';
              rawDateStr = d && t ? `${d}T${t}` : d || val || '';
            } catch {
              rawDateStr = val || '';
            }
            leadDateParsed = parseAsUSCentral(rawDateStr) ?? parseDateFromColumn(col) ?? parseDateColumn(val);
          }
          if (title.includes('platform')) platform = val;
          if (title.includes('position')) position = val;
          if (title === 'type') type = val;
          if (title.includes('state')) state = val;
          if (title.includes('number') || title === 'phone') number = val;
          if (title.includes('email')) email = val;
          if (title.includes('note')) note = val;
          if (title.includes('date contact') || title.includes('datecontact')) dateContact = val;
          if (title.includes('owner') && title.includes('lead')) ownerLead = val;
        }
        status = statusFromStatus2 || statusFromStatus || statusFromAny || '';

        // Filter by "Date" column (lead date) - NOT "Date contacted". Fall back to created_at if Date is empty.
        const leadDate = leadDateParsed ?? parseDateColumn(date) ?? null;
        const createdAt = item.created_at ? new Date(item.created_at) : null;
        const dateForFilter = leadDate ?? createdAt;
        if (dateForFilter && (dateForFilter < filterFrom || dateForFilter > filterTo)) continue;

        const displayStatus = normalizeStatus(status || '');
        const leadArrival = leadDate ?? createdAt;
        const dateContactParsed = parseAsUSCentral(dateContact) ?? parseDateColumn(dateContact) ?? (dateContact ? new Date(dateContact) : null);
        const timing = getLeadTiming(leadArrival, dateContactParsed);
        const callTimeInterval = formatCallTimeInterval(getCallTimeIntervalSeconds(leadArrival, dateContactParsed));

        const boardOwner = BOARD_TO_USER[board.name?.trim() || ''] || userName;
        const countingOwner = ownerLead.trim() ? ownerLead.trim() : boardOwner;

        const lead: MondayLead = {
          id: item.id,
          name: item.name || '',
          createdAt: item.created_at || '',
          columns,
          status: displayStatus,
          company: company || '',
          date,
          platform,
          position,
          type,
          state,
          number,
          email,
          note,
          dateContact,
          ownerLead: ownerLead.trim(),
          timing,
          callTimeInterval,
        };

        allLeads.push({ lead, boardName: board.name?.trim() || '' });

        // Stats count toward the original owner (Owner_lead or board owner), not the board viewer
        const countsForThisUser = ownerMatchesUser(countingOwner, userName);
        if (countsForThisUser) {
          const statusKey = Object.keys(statusCounts).includes(displayStatus) ? displayStatus : 'Other';
          statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;
        }
        }

      } while (cursor);

      await new Promise((r) => setTimeout(r, 300));
    }

    // Display: only leads from this user's boards. Stats: already filtered by countingOwner
    const displayLeads = allLeads
      .filter(({ boardName }) => boardNamesForDisplay.some((n) => n.trim() === boardName))
      .map(({ lead }) => lead);

    return NextResponse.json({
      user: userName,
      totalLeads: displayLeads.length,
      totalCountedLeads: Object.values(statusCounts).reduce((a, b) => a + b, 0),
      statusCounts,
      leads: displayLeads,
    });
  } catch (err: unknown) {
    console.error('[monday/leads] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
