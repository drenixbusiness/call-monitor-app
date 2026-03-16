import { NextResponse } from 'next/server';
import { WHITELIST_ACCOUNT2 } from '@/lib/whitelist';

/** Normalize name for flexible matching (case, extra spaces, "Last, First" format) */
function normalizeName(name: string): string {
  return (name || '').toLowerCase().replace(/[,.\s]+/g, ' ').trim().replace(/\s+/g, ' ');
}

/** Build set of normalized name variants: "Jessica Miller" -> {"jessica miller", "miller jessica"} */
function buildWhitelistSet(): Set<string> {
  const set = new Set<string>();
  for (const name of WHITELIST_ACCOUNT2) {
    const n = normalizeName(name);
    set.add(n);
    const parts = n.split(/\s+/);
    if (parts.length >= 2) set.add(parts.reverse().join(' ')); // "Miller, Jessica" -> "miller jessica"
  }
  return set;
}

export async function GET() {
  try {
    const clientId = process.env.RC2_CLIENT_ID;
    const clientSecret = process.env.RC2_CLIENT_SECRET;
    const jwt = process.env.RC2_JWT;

    if (!clientId || !clientSecret || !jwt) {
      console.error('[account2/users] Missing env: RC2_CLIENT_ID=', !!clientId, 'RC2_CLIENT_SECRET=', !!clientSecret, 'RC2_JWT=', !!jwt);
      return NextResponse.json({ users: [] });
    }

    // Get token for account 2
    const encodedAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const params = new URLSearchParams();
    params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    params.append('assertion', jwt);

    const tokenRes = await fetch('https://platform.ringcentral.com/restapi/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${encodedAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('[account2/users] Failed to get token:', tokenRes.status, errBody);
      return NextResponse.json({ users: [] });
    }

    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    // Paginate through all users (RingCentral may have >100 extensions)
    const whitelistSet = buildWhitelistSet();
    const allUsers: any[] = [];
    let url: string | null = 'https://platform.ringcentral.com/restapi/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1';
    while (url) {
      const usersRes: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!usersRes.ok) {
        const errBody = await usersRes.text();
        console.error('[account2/users] Failed to fetch users:', usersRes.status, errBody);
        break;
      }
      const usersData: { records?: any[]; navigation?: { nextPage?: { uri?: string } } } = await usersRes.json();
      const records = usersData.records || [];
      allUsers.push(...records);
      url = usersData.navigation?.nextPage?.uri || null;
    }

    const filtered = allUsers.filter((u: any) => whitelistSet.has(normalizeName(u.name)));
    return NextResponse.json({ users: filtered });
  } catch (err) {
    console.error('[account2/users] Error:', err);
    return NextResponse.json({ users: [] });
  }
}