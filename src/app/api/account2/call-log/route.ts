import { NextRequest, NextResponse } from 'next/server';

const RC_BASE = 'https://platform.ringcentral.com/restapi';

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccount2Token(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const clientId = process.env.RC2_CLIENT_ID;
  const clientSecret = process.env.RC2_CLIENT_SECRET;
  const jwt = process.env.RC2_JWT;

  if (!clientId || !clientSecret || !jwt) {
    console.error('[account2/call-log] Missing RC2_CLIENT_ID, RC2_CLIENT_SECRET, or RC2_JWT');
    throw new Error('Account 2 not configured');
  }

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
    cachedToken = null;
    tokenExpiry = 0;
    const errBody = await tokenRes.text();
    console.error('[account2/call-log] Token failed:', tokenRes.status, errBody);
    throw new Error(`Token failed: ${tokenRes.status} ${errBody}`);
  }

  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;
  if (!token) throw new Error('No access token in response');
  cachedToken = token;
  tokenExpiry = Date.now() + (tokenData.expires_in || 3600) * 1000 * 0.9;
  return token;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const extensionId = searchParams.get('extensionId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const page = searchParams.get('page') || '1';
    const perPage = searchParams.get('perPage') || '1000';

    if (!extensionId || !dateFrom || !dateTo) {
      return NextResponse.json({ error: 'Missing extensionId, dateFrom, or dateTo' }, { status: 400 });
    }

    const token = await getAccount2Token();

    const url = `${RC_BASE}/v1.0/account/~/extension/${encodeURIComponent(extensionId)}/call-log?view=Detailed&type=Voice&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}&page=${page}&perPage=${perPage}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('[account2/call-log] Error:', res.status, errBody);
      return NextResponse.json({ error: 'Failed to fetch call log', records: [] });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[account2/call-log] Error:', err);
    const status = err.message?.includes('Token failed') ? 502 : 500;
    return NextResponse.json({ error: err.message || 'Internal error', records: [] }, { status });
  }
}