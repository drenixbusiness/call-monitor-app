import { NextResponse } from 'next/server';
import { getServerDeployAccount } from '@/lib/deployAccount';
import { getMondayUsersForDeploy } from '@/lib/whitelist';
import { USER_BOARD_MAP, resolveCountingOwner, ownerMatchesUser } from '@/lib/mondayBoards';
import { resolveMainDashboardRange } from '@/lib/mondayDateRange';
import { fetchWorkspaceLeads, type MondayLead, type ParsedWorkspaceLead } from '@/lib/mondayWorkspaceLeads';
import { leadMatchesDeployCompany } from '@/lib/mondayCompanyFilter';

const STATUS_KEYS = ['N/A', 'Processing', 'Not valid lead', 'Follow up', 'Not touched', 'Rejected', 'Other'] as const;

/** Line / legend order (matches Monday-style widgets). */
const CHART_STATUS_ORDER = ['Not touched', 'Follow up', 'Rejected', 'N/A', 'Not valid lead', 'Processing', 'Other'] as const;

function emptyCounts(): Record<string, number> {
  return {
    'N/A': 0,
    Processing: 0,
    'Not valid lead': 0,
    'Follow up': 0,
    'Not touched': 0,
    Rejected: 0,
    Other: 0,
  };
}

function bump(counts: Record<string, number>, status: string) {
  const key = STATUS_KEYS.includes(status as (typeof STATUS_KEYS)[number]) ? status : 'Other';
  counts[key] = (counts[key] || 0) + 1;
}

function buildLineSeries(dayKeys: string[], byDay: Record<string, Record<string, number>>) {
  return CHART_STATUS_ORDER.map((status) => ({
    status,
    data: dayKeys.map((d) => byDay[d]?.[status] ?? 0),
  }));
}

type MainDashStats = {
  totalLeads: number;
  statusCounts: Record<string, number>;
  statusFirstCounts: Record<string, number>;
  statusSecondCounts: Record<string, number>;
  trendByDay: {
    labels: string[];
    firstTouchSeries: { status: string; data: number[] }[];
    secondTouchSeries: { status: string; data: number[] }[];
  };
};

function aggregateLeadRows(filtered: ParsedWorkspaceLead[]): MainDashStats {
  const statusCounts = emptyCounts();
  const statusFirstCounts = emptyCounts();
  const statusSecondCounts = emptyCounts();
  const byDayFirst: Record<string, Record<string, number>> = {};
  const byDaySecond: Record<string, Record<string, number>> = {};

  for (const row of filtered) {
    bump(statusCounts, row.lead.status);
    bump(statusFirstCounts, row.statusFirst);
    bump(statusSecondCounts, row.statusSecond);

    const dk = leadDayKey(row.lead);
    if (dk) {
      if (!byDayFirst[dk]) byDayFirst[dk] = emptyCounts();
      if (!byDaySecond[dk]) byDaySecond[dk] = emptyCounts();
      bump(byDayFirst[dk], row.statusFirst);
      bump(byDaySecond[dk], row.statusSecond);
    }
  }

  const dayKeys = [...new Set([...Object.keys(byDayFirst), ...Object.keys(byDaySecond)])].sort();
  return {
    totalLeads: filtered.length,
    statusCounts,
    statusFirstCounts,
    statusSecondCounts,
    trendByDay: {
      labels: dayKeys,
      firstTouchSeries: buildLineSeries(dayKeys, byDayFirst),
      secondTouchSeries: buildLineSeries(dayKeys, byDaySecond),
    },
  };
}

function leadDayKey(lead: MondayLead): string | null {
  if (lead.date) {
    const d = new Date(lead.date);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }
  if (lead.createdAt) {
    const d = new Date(lead.createdAt);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }
  return null;
}

function mondayUserKeysForDeploy(): string[] {
  const deploy = getServerDeployAccount();
  if (deploy) return [...getMondayUsersForDeploy(deploy)] as string[];
  return Object.keys(USER_BOARD_MAP);
}

export async function GET(request: Request) {
  try {
    if (!process.env.MONDAY_API_TOKEN) {
      return NextResponse.json({ error: 'MONDAY_API_TOKEN is not set' }, { status: 500 });
    }

    const deploy = getServerDeployAccount();
    const allowedMonday = getMondayUsersForDeploy(deploy) as readonly string[];

    const { searchParams } = new URL(request.url);
    const rawUser = (searchParams.get('user') || 'all').trim();
    const userParamLower = rawUser.toLowerCase();
    const dateFromParam = searchParams.get('dateFrom');
    const dateToParam = searchParams.get('dateTo');
    const presetParam = searchParams.get('preset');

    let filterFrom: Date;
    let filterTo: Date;
    try {
      ({ from: filterFrom, to: filterTo } = resolveMainDashboardRange(presetParam, dateFromParam, dateToParam));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid date range';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const mondayKeys = mondayUserKeysForDeploy();
    const allBoardNames = mondayKeys.flatMap((k) => USER_BOARD_MAP[k] || []);

    const rows = await fetchWorkspaceLeads(filterFrom, filterTo, allBoardNames);

    const userFilter =
      userParamLower === 'all' || rawUser === ''
        ? 'all'
        : allowedMonday.find((u) => u.toLowerCase() === userParamLower) ||
          Object.keys(USER_BOARD_MAP).find((u) => u.toLowerCase() === userParamLower);

    if (userParamLower !== 'all' && rawUser !== '' && !userFilter) {
      return NextResponse.json(
        { error: 'Invalid user. Use all or a Monday user name for this deployment.' },
        { status: 400 }
      );
    }

    if (deploy && userFilter && userFilter !== 'all' && !allowedMonday.includes(userFilter)) {
      return NextResponse.json({ error: 'This user is not available on this deployment' }, { status: 403 });
    }

    const companyFiltered = rows.filter((row) => leadMatchesDeployCompany(row.lead.company, deploy));

    const filtered =
      userFilter === 'all' || !userFilter
        ? companyFiltered
        : companyFiltered.filter((row) => {
            const co = resolveCountingOwner(row, userFilter);
            return ownerMatchesUser(co, userFilter);
          });

    const stats = aggregateLeadRows(filtered);
    const rangePayload = { from: filterFrom.toISOString(), to: filterTo.toISOString() };

    if (userFilter === 'all' || !userFilter) {
      const perUser: Record<string, { user: string; range: typeof rangePayload } & MainDashStats> = {};
      for (const u of allowedMonday) {
        const userRows = companyFiltered.filter((row) => {
          const co = resolveCountingOwner(row, u);
          return ownerMatchesUser(co, u);
        });
        const s = aggregateLeadRows(userRows);
        perUser[u] = {
          user: u,
          range: rangePayload,
          ...s,
        };
      }

      return NextResponse.json({
        user: 'all',
        range: rangePayload,
        ...stats,
        perUser,
      });
    }

    return NextResponse.json({
      user: userFilter,
      range: rangePayload,
      ...stats,
    });
  } catch (err: unknown) {
    console.error('[monday/main-dashboard] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
