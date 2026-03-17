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

const RC_TOKEN_URL = 'https://platform.ringcentral.com/restapi/oauth/token';
const RC_BASE = 'https://platform.ringcentral.com/restapi';

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
    let tokenError: string | null = null;
    let account2Error: string | null = null;
    let account2RawCount = 0;
    let account2UserNames: string[] = [];

    if (rc1ClientId && rc1ClientSecret && rc1Jwt) {
      try {
        const encodedAuth = Buffer.from(`${rc1ClientId}:${rc1ClientSecret}`).toString('base64');
        const params = new URLSearchParams();
        params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
        params.append('assertion', rc1Jwt);
        const tokenRes = await fetch(RC_TOKEN_URL, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${encodedAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });
        const tokenData = await tokenRes.json();
        const token = tokenRes.ok ? tokenData.access_token : null;
        if (!tokenRes.ok) {
          tokenError = tokenData.error || tokenData.error_description || `HTTP ${tokenRes.status}`;
        }
        if (token) {
          let url: string | null = `${RC_BASE}/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1`;
          while (url) {
            const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) break;
            const data: { records?: any[]; navigation?: { nextPage?: { uri?: string } } } = await res.json();
            const records = data.records || [];
            for (const u of records) {
              if (WHITELIST_ACCOUNT1.includes(u.name) && HR_RC_NAMES.has(u.name)) {
                users.push({ id: String(u.id), name: u.name });
              }
            }
            acc1Count = users.length;
            url = data.navigation?.nextPage?.uri || null;
          }
        }
      } catch (e) {
        tokenError = e instanceof Error ? e.message : String(e);
        console.error('[telegram/debug] Account1 error:', e);
      }
    }

    try {
      const rc2ClientId = process.env.RC2_CLIENT_ID;
      const rc2ClientSecret = process.env.RC2_CLIENT_SECRET;
      const rc2Jwt = process.env.RC2_JWT;
      if (rc2ClientId && rc2ClientSecret && rc2Jwt) {
        const encodedAuth = Buffer.from(`${rc2ClientId}:${rc2ClientSecret}`).toString('base64');
        const params = new URLSearchParams();
        params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
        params.append('assertion', rc2Jwt);
        const tokenRes = await fetch(RC_TOKEN_URL, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${encodedAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });
        const tokenData = await tokenRes.json();
        const token = tokenRes.ok ? tokenData.access_token : null;
        if (!tokenRes.ok) {
          account2Error = tokenData.error || tokenData.error_description || `HTTP ${tokenRes.status}`;
        } else if (token) {
          const allAcc2: UserWithExt[] = [];
          let url: string | null = `${RC_BASE}/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1`;
          while (url) {
            const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) break;
            const data: { records?: any[]; navigation?: { nextPage?: { uri?: string } } } = await res.json();
            const records = data.records || [];
            for (const u of records) {
              allAcc2.push({ id: String(u.id), name: u.name });
            }
            url = data.navigation?.nextPage?.uri || null;
          }
          account2RawCount = allAcc2.length;
          account2UserNames = allAcc2.map((u) => u.name);
          const acc2 = allAcc2.filter((u) => HR_RC_NAMES.has(u.name));
          acc2Count = acc2.length;
          users.push(...acc2);
        }
      }
    } catch (e) {
      account2Error = e instanceof Error ? e.message : String(e);
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
      errors: {
        tokenError: tokenError || undefined,
        account2Error: account2Error || undefined,
      },
      account2RawCount,
      account2UserNames,
    });
  } catch (err) {
    console.error('[telegram/debug] Error:', err);
    return NextResponse.json(
      { error: 'Debug failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
