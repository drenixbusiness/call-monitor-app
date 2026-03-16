import { NextResponse } from 'next/server';
import db from '@/lib/db';

const RC_BASE = 'https://platform.ringcentral.com/restapi';
const DELAY_BETWEEN_REQUESTS_MS = 1200;
const MAX_PAGES = 200;
const TARGET_PER_EXTENSION = 500;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const globalAny = global as any;
if (!globalAny.syncRunning) globalAny.syncRunning = false;

async function syncAccount(
  token: string,
  extensionIds: string[],
  account: string,
  perExtensionInserted: Record<string, number>,
  lastRequestTime: { value: number }
): Promise<number> {
  let totalInserted = 0;

  const doFetchWithDelay = async (url: string, headers: HeadersInit) => {
    const now = Date.now();
    const elapsed = now - lastRequestTime.value;
    if (elapsed < DELAY_BETWEEN_REQUESTS_MS) {
      await sleep(DELAY_BETWEEN_REQUESTS_MS - elapsed);
    }
    lastRequestTime.value = Date.now();
    return fetch(url, { headers });
  };

  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  const dateFrom = oneYearAgo.toISOString();
  const dateTo = now.toISOString();
  const baseRetryDelayMs = 60_000;

  for (const extId of extensionIds) {
    let page = 1;
    let hasMore = true;
    let consecutive429s = 0;

    while (hasMore && page <= MAX_PAGES) {
      const url = `${RC_BASE}/v1.0/account/~/extension/${encodeURIComponent(extId)}/call-log?view=Detailed&type=Voice&perPage=100&page=${page}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`;

      let res = await doFetchWithDelay(url, { Authorization: `Bearer ${token}` });

      if (res.status === 429) {
        consecutive429s += 1;
        const retryAfter = res.headers.get('retry-after') || res.headers.get('x-rate-limit-window');
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : baseRetryDelayMs * Math.pow(2, consecutive429s - 1);
        await sleep(waitMs);
        res = await doFetchWithDelay(url, { Authorization: `Bearer ${token}` });
      } else {
        consecutive429s = 0;
      }

      if (!res.ok) {
        const errBody = await res.text();
        console.error('[sync] RingCentral call-log error for ext', extId, res.status, errBody);
        break;
      }

      const data = await res.json();
      const records = (data.records || []) as any[];

      for (const c of records) {
        try {
          const from = c.from?.phoneNumber || c.from?.extensionNumber || '';
          const to = c.to?.phoneNumber || c.to?.extensionNumber || '';

          await db.prepare(`
            INSERT INTO calls 
            (id, call_id, from_number, to_number, direction, result, user_extension, start_time, duration, recording_url, account)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (call_id) DO NOTHING
          `).run([
            `${c.id}-${c.sessionId}`,
            c.id,
            from,
            to,
            c.direction,
            c.result,
            extId,
            c.startTime,
            c.duration,
            c.recording?.contentUri || '',
            account
          ]);

          perExtensionInserted[extId] = (perExtensionInserted[extId] || 0) + 1;
          totalInserted += 1;
        } catch (err) {
          console.error('[sync] Failed to insert call:', err);
        }
      }

      if ((perExtensionInserted[extId] || 0) >= TARGET_PER_EXTENSION) {
        hasMore = false;
      } else {
        hasMore = records.length === 100;
      }

      page++;
    }

    await sleep(2000);
  }

  return totalInserted;
}

async function getTokenForAccount2(): Promise<string | null> {
  const clientId = process.env.RC2_CLIENT_ID;
  const clientSecret = process.env.RC2_CLIENT_SECRET;
  const jwt = process.env.RC2_JWT;

  if (!clientId || !clientSecret || !jwt) return null;

  const encodedAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.append('assertion', jwt);

  const res = await fetch('https://platform.ringcentral.com/restapi/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${encodedAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    console.error('[sync] Failed to get token for account2');
    return null;
  }

  const data = await res.json();
  return data.access_token;
}

async function getExtensionsForAccount(token: string): Promise<string[]> {
  const { WHITELIST_ACCOUNT2 } = await import('@/lib/whitelist');
  const res = await fetch(`${RC_BASE}/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return [];
  const data = await res.json();
  const records = data.records || [];
  return records
    .filter((u: any) => WHITELIST_ACCOUNT2.includes(u.name))
    .map((u: any) => String(u.id));
}

export async function POST(request: Request) {
  const { token, extensionIds } = await request.json();

  if (!token || !extensionIds?.length) {
    return NextResponse.json({ error: 'Missing token or extensionIds' }, { status: 400 });
  }

  if (globalAny.syncRunning) {
    return NextResponse.json({ status: 'already_running' });
  }

  const normalizeExtId = (id: string | number) => String(id).replace(/\.0$/, '');
  const extIdStrings = extensionIds.map(normalizeExtId);

  globalAny.syncRunning = true;

  let totalInserted = 0;
  const perExtensionInserted: Record<string, number> = {};
  const lastRequestTime = { value: 0 };

  try {
    // Sync account 1
    const inserted1 = await syncAccount(token, extIdStrings, 'account1', perExtensionInserted, lastRequestTime);
    totalInserted += inserted1;

    // Sync account 2
    const token2 = await getTokenForAccount2();
    if (!token2) {
      console.log('[sync] Account 2: No token (missing RC2_* env vars or token failed)');
    } else {
      const extIds2 = await getExtensionsForAccount(token2);
      console.log('[sync] Account 2: Found', extIds2.length, 'extensions to sync');
      if (extIds2.length > 0) {
        const inserted2 = await syncAccount(token2, extIds2, 'account2', perExtensionInserted, lastRequestTime);
        totalInserted += inserted2;
        console.log('[sync] Account 2: Inserted', inserted2, 'calls');
      }
    }
  } finally {
    globalAny.syncRunning = false;
  }

  return NextResponse.json({
    status: 'done',
    inserted: totalInserted,
    perExtensionInserted,
  });
}