import { mondayGraphql } from '@/lib/mondayGraphql';
import { BOARD_TO_USER } from '@/lib/mondayBoards';
import {
  getLeadTiming,
  getCallTimeIntervalSeconds,
  formatCallTimeInterval,
  parseAsUSCentral,
} from '@/utils/leadShift';

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
  ownerLead: string;
  timing: ReturnType<typeof getLeadTiming>;
  callTimeInterval: string;
}

export type ParsedWorkspaceLead = {
  lead: MondayLead;
  boardName: string;
  countingOwner: string;
  /** Status column (first touch). */
  statusFirst: string;
  /** Status 2 when present, else same as merged display. */
  statusSecond: string;
};

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

/** Some boards (e.g. Ethan, Winston) name columns `Status'` / `Status 2'` instead of `Status` / `Status 2`. */
function normalizeColumnTitleForMatch(raw: string): string {
  return raw.trim().replace(/[''`´\u2019\u2018]+$/u, '');
}

function isPrimaryStatusTitle(raw: string): boolean {
  return normalizeColumnTitleForMatch(raw).toLowerCase() === 'status';
}

function isStatus2Title(raw: string): boolean {
  return normalizeColumnTitleForMatch(raw).toLowerCase() === 'status 2';
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

type MondayItem = {
  id: string;
  name?: string;
  created_at?: string;
  column_values?: {
    column?: { id?: string; title?: string };
    id?: string;
    type?: string;
    text?: string;
    value?: string;
  }[];
};

function tryParseItem(
  item: MondayItem,
  boardNameTrimmed: string,
  filterFrom: Date,
  filterTo: Date
): ParsedWorkspaceLead | null {
  const columns: Record<string, string> = {};
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

    const isPersonColumn =
      title.includes('person') ||
      title.includes('people') ||
      title.includes('assignee') ||
      (title.includes('owner') && !title.includes('lead')) ||
      col.type === 'people';
    if (isPersonColumn) continue;

    if (isStatus2Title(rawTitle)) statusFromStatus2 = val;
    else if (isPrimaryStatusTitle(rawTitle)) statusFromStatus = val;
    else if (title.includes('status') && val && col.type === 'status') statusFromAny = val;
    if (title.includes('company')) company = val;
    if (title === 'date' && !title.includes('contact')) {
      date = val;
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

  const mergedRaw = statusFromStatus2 || statusFromStatus || statusFromAny || '';
  const leadDate = leadDateParsed ?? parseDateColumn(date) ?? null;
  const createdAt = item.created_at ? new Date(item.created_at) : null;
  const dateForFilter = leadDate ?? createdAt;
  if (dateForFilter && (dateForFilter < filterFrom || dateForFilter > filterTo)) return null;

  const displayStatus = normalizeStatus(mergedRaw);
  const statusFirst = normalizeStatus(statusFromStatus || statusFromAny || '');
  const statusSecond = normalizeStatus(statusFromStatus2 || mergedRaw || statusFromStatus || statusFromAny || '');

  const leadArrival = leadDate ?? createdAt;
  const dateContactParsed =
    parseAsUSCentral(dateContact) ?? parseDateColumn(dateContact) ?? (dateContact ? new Date(dateContact) : null);
  const timing = getLeadTiming(leadArrival, dateContactParsed);
  const callTimeInterval = formatCallTimeInterval(getCallTimeIntervalSeconds(leadArrival, dateContactParsed));

  const boardOwner = BOARD_TO_USER[boardNameTrimmed] || '';
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

  return {
    lead,
    boardName: boardNameTrimmed,
    countingOwner,
    statusFirst,
    statusSecond,
  };
}

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

/**
 * Fetch and parse all items from given board names within [filterFrom, filterTo] by lead date.
 */
export async function fetchWorkspaceLeads(
  filterFrom: Date,
  filterTo: Date,
  boardNameAllowlist: string[]
): Promise<ParsedWorkspaceLead[]> {
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
  const boardsToFetch = allBoards.filter((b: { name: string }) =>
    boardNameAllowlist.some((n) => (b.name || '').trim() === n.trim())
  );

  const out: ParsedWorkspaceLead[] = [];

  for (const board of boardsToFetch) {
    let cursor: string | null = null;
    let items: MondayItem[] = [];

    do {
      let res: {
        data?: {
          boards?: { items_page?: { cursor?: string; items?: MondayItem[] } }[];
          next_items_page?: { cursor?: string; items?: MondayItem[] };
        };
      };
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

      const bname = (board.name || '').trim();
      for (const item of items) {
        const row = tryParseItem(item, bname, filterFrom, filterTo);
        if (row) out.push(row);
      }
    } while (cursor);

    await new Promise((r) => setTimeout(r, 300));
  }

  return out;
}
