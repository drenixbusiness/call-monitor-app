import { NextResponse } from 'next/server';
import { getShiftWindowISO, getReportDayRangeISO } from '@/utils/leadShift';
import { WHITELIST_ACCOUNT1 } from '@/lib/whitelist';

const HR_RC_NAMES = new Set([
  'Ethan Parker',
  'Fred Royce',
  'Alex Chester',
  'Winston Smith',
  'Jessica Miller',
]);

interface UserWithExt {
  id: string;
  name: string;
}

export async function GET() {
  try {
    const base =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const now = new Date();
    const reportDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const { from: shiftFrom, to: shiftTo } = getShiftWindowISO(reportDate);
    const { from: dayFrom, to: dayTo } = getReportDayRangeISO(reportDate);

    const rc1ClientId = process.env.RC_CLIENT_ID || process.env.NEXT_PUBLIC_RC_CLIENT_ID;
    const rc1ClientSecret = process.env.RC_CLIENT_SECRET || process.env.NEXT_PUBLIC_RC_CLIENT_SECRET;
    const rc1Jwt = process.env.RC_JWT || process.env.NEXT_PUBLIC_RC_JWT;

    let acc1Count = 0;
    let acc2Count = 0;
    const users: UserWithExt[] = [];

    if (rc1ClientId && rc1ClientSecret && rc1Jwt) {
      try {
        const tokenRes = await fetch(`${base}/api/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: rc1ClientId, clientSecret: rc1ClientSecret, jwt: rc1Jwt }),
        });
        const tokenData = await tokenRes.json();
        const token = tokenRes.ok ? tokenData.access_token : null;
        if (token) {
          let nextUrl = `${base}/api/rc/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1`;
          while (nextUrl) {
            const res = await fetch(nextUrl, { headers: { 'x-rc-auth': token } });
            if (!res.ok) break;
            const data = await res.json();
            const records = data.records || [];
            for (const u of records) {
              if (WHITELIST_ACCOUNT1.includes(u.name) && HR_RC_NAMES.has(u.name)) {
                users.push({ id: String(u.id), name: u.name });
              }
            }
            nextUrl = data.navigation?.nextPage?.uri
              ? data.navigation.nextPage.uri.replace('https://platform.ringcentral.com/restapi', `${base}/api/rc`)
              : '';
          }
        }
        acc1Count = users.length;
      } catch (e) {
        console.error('[telegram/debug] Account1 error:', e);
      }
    }

    try {
      const acc2Res = await fetch(`${base}/api/account2/users`);
      if (acc2Res.ok) {
        const acc2Data = await acc2Res.json();
        const acc2 = (acc2Data.users || [])
          .filter((u: any) => HR_RC_NAMES.has(u.name))
          .map((u: any) => ({ id: String(u.id), name: u.name }));
        acc2Count = acc2.length;
        users.push(...acc2);
      }
    } catch (e) {
      console.error('[telegram/debug] Account2 error:', e);
    }

    const extIds = users.map((u) => u.id);
    let allRecordsCount = 0;
    let afterFilterCount = 0;

    if (extIds.length > 0) {
      try {
        const callsRes = await fetch(`${base}/api/calls?range=all&extensionIds=${extIds.join(',')}`);
        const callsData = callsRes.ok ? await callsRes.json() : {};
        const allRecords = callsData.records || [];
        allRecordsCount = allRecords.length;
        const shiftFromDate = new Date(shiftFrom);
        const shiftToDate = new Date(shiftTo);
        for (const c of allRecords) {
          const startTime = c.startTime ? new Date(c.startTime) : null;
          if (!startTime || isNaN(startTime.getTime())) continue;
          if (startTime < shiftFromDate || startTime > shiftToDate) continue;
          if (c.result === 'Missed') afterFilterCount++;
          else if ((c.result === 'Accepted' || c.result === 'Call connected') && (c.duration || 0) >= 20) afterFilterCount++;
        }
      } catch (e) {
        console.error('[telegram/debug] Calls error:', e);
      }
    }

    return NextResponse.json({
      debug: true,
      reportDate: reportDate.toISOString().slice(0, 10),
      shiftWindow: { from: shiftFrom, to: shiftTo },
      leadDayRange: { from: dayFrom, to: dayTo },
      users: {
        account1: acc1Count,
        account2: acc2Count,
        total: users.length,
        extensionIds: extIds,
      },
      calls: {
        allFromDb: allRecordsCount,
        afterShiftFilter: afterFilterCount,
      },
      env: {
        hasRc1: !!(rc1ClientId && rc1ClientSecret && rc1Jwt),
        hasPostgres: !!process.env.POSTGRES_URL,
        hasMonday: !!process.env.MONDAY_API_TOKEN,
      },
    });
  } catch (err) {
    console.error('[telegram/debug] Error:', err);
    return NextResponse.json(
      { error: 'Debug failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
