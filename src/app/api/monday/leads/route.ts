import { NextResponse } from 'next/server';
import { getServerDeployAccount } from '@/lib/deployAccount';
import { getMondayUsersForDeploy } from '@/lib/whitelist';
import { USER_BOARD_MAP, resolveCountingOwner, ownerMatchesUser } from '@/lib/mondayBoards';
import { getThisMonthRange } from '@/lib/mondayDateRange';
import { fetchWorkspaceLeads, type MondayLead } from '@/lib/mondayWorkspaceLeads';

export { MONDAY_USERS } from '@/lib/mondayBoards';

function mondayUserKeysForDeploy(): string[] {
  const deploy = getServerDeployAccount();
  if (deploy) return [...getMondayUsersForDeploy(deploy)] as string[];
  return Object.keys(USER_BOARD_MAP);
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

    const deploy = getServerDeployAccount();
    const allowedMonday = getMondayUsersForDeploy(deploy) as readonly string[];
    if (deploy && !allowedMonday.includes(userName)) {
      return NextResponse.json({ error: 'This user is not available on this deployment' }, { status: 403 });
    }

    const dateFromParam = searchParams.get('dateFrom');
    const dateToParam = searchParams.get('dateTo');
    const useCustomRange = dateFromParam && dateToParam;

    const boardNamesForDisplay = USER_BOARD_MAP[userName];
    const mondayKeys = mondayUserKeysForDeploy();
    const allBoardNames = mondayKeys.flatMap((k) => USER_BOARD_MAP[k] || []);
    const { from: monthFrom, to: monthTo } = getThisMonthRange();
    const filterFrom = useCustomRange ? new Date(dateFromParam!) : monthFrom;
    const filterTo = useCustomRange ? new Date(dateToParam!) : monthTo;

    const rows = await fetchWorkspaceLeads(filterFrom, filterTo, allBoardNames);

    const statusCounts: Record<string, number> = {
      'N/A': 0,
      'Processing': 0,
      'Not valid lead': 0,
      'Follow up': 0,
      'Not touched': 0,
      'Rejected': 0,
      'Other': 0,
    };

    for (const row of rows) {
      const countingOwner = resolveCountingOwner(row, userName);
      const displayStatus = row.lead.status;
      if (ownerMatchesUser(countingOwner, userName)) {
        const statusKey = Object.keys(statusCounts).includes(displayStatus) ? displayStatus : 'Other';
        statusCounts[statusKey] = (statusCounts[statusKey] || 0) + 1;
      }
    }

    const displayLeads: MondayLead[] = rows
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
