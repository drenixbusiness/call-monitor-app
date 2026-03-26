import { NextResponse } from 'next/server';
import { getServerDeployAccount } from '@/lib/deployAccount';
import { getMondayUsersForDeploy } from '@/lib/whitelist';
import { USER_BOARD_MAP, resolveCountingOwner, ownerMatchesUser } from '@/lib/mondayBoards';
import { getThisMonthRange } from '@/lib/mondayDateRange';
import { fetchWorkspaceLeads, type MondayLead } from '@/lib/mondayWorkspaceLeads';
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
    const useCustomRange = dateFromParam && dateToParam;

    const { from: monthFrom, to: monthTo } = getThisMonthRange();
    const filterFrom = useCustomRange ? new Date(dateFromParam!) : monthFrom;
    const filterTo = useCustomRange ? new Date(dateToParam!) : monthTo;

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

    const filtered = rows.filter((row) => {
      if (!leadMatchesDeployCompany(row.lead.company, deploy)) return false;
      if (userFilter === 'all' || !userFilter) return true;
      const co = resolveCountingOwner(row, userFilter);
      return ownerMatchesUser(co, userFilter);
    });

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

    return NextResponse.json({
      user: userFilter === 'all' || !userFilter ? 'all' : userFilter,
      range: { from: filterFrom.toISOString(), to: filterTo.toISOString() },
      totalLeads: filtered.length,
      statusCounts,
      statusFirstCounts,
      statusSecondCounts,
      trendByDay: {
        labels: dayKeys,
        firstTouchSeries: buildLineSeries(dayKeys, byDayFirst),
        secondTouchSeries: buildLineSeries(dayKeys, byDaySecond),
      },
    });
  } catch (err: unknown) {
    console.error('[monday/main-dashboard] Error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
