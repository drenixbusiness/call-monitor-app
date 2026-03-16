import { NextResponse } from 'next/server';
import { getShiftWindowISO } from '@/utils/leadShift';
import { WHITELIST_ACCOUNT1 } from '@/lib/whitelist';

/** HR recruiter RC names (exclude Safety) */
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

async function fetchAccount1Users(base: string, clientId: string, clientSecret: string, jwt: string): Promise<UserWithExt[]> {
  const tokenRes = await fetch(`${base}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret, jwt }),
  });
  const tokenData = await tokenRes.json();
  const token = tokenRes.ok ? tokenData.access_token : null;
  if (!token) return [];

  const users: UserWithExt[] = [];
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
  return users;
}

export async function GET(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return NextResponse.json(
      { error: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set' },
      { status: 500 }
    );
  }

  // Optional: require CRON_SECRET when invoked by Vercel Cron
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const base =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  // Report date: when cron runs at 23:00 UTC, use that UTC date for shift (8am–5pm US Central)
  const now = new Date();
  const reportDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const { from: dateFrom, to: dateTo } = getShiftWindowISO(reportDate);

  const rc1ClientId = process.env.RC_CLIENT_ID || process.env.NEXT_PUBLIC_RC_CLIENT_ID;
  const rc1ClientSecret = process.env.RC_CLIENT_SECRET || process.env.NEXT_PUBLIC_RC_CLIENT_SECRET;
  const rc1Jwt = process.env.RC_JWT || process.env.NEXT_PUBLIC_RC_JWT;
  const users: UserWithExt[] = [];

  if (rc1ClientId && rc1ClientSecret && rc1Jwt) {
    const acc1Users = await fetchAccount1Users(base, rc1ClientId, rc1ClientSecret, rc1Jwt);
    users.push(...acc1Users);
  }

  const acc2Res = await fetch(`${base}/api/account2/users`);
  if (acc2Res.ok) {
    const acc2Data = await acc2Res.json();
    const acc2 = (acc2Data.users || [])
      .filter((u: any) => HR_RC_NAMES.has(u.name))
      .map((u: any) => ({ id: String(u.id), name: u.name }));
    users.push(...acc2);
  }

  const extIds = users.map((u) => u.id);

  let callRecords: any[] = [];
  if (extIds.length > 0) {
    const callsRes = await fetch(
      `${base}/api/calls?range=custom&extensionIds=${extIds.join(',')}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`
    );
    const callsData = callsRes.ok ? await callsRes.json() : {};
    callRecords = callsData.records || [];
  }

  const normalizeExt = (id: string | number) => String(id).replace(/\.0$/, '');

  type UserStats = {
    name: string;
    talkMinutes: number;
    leadsOnTime: number;
    leadsLate: number;
    callsConnected: number;
    callsMissed: number;
    leadsRejected: number;
  };

  const statsByUser: Record<string, UserStats> = {};
  for (const u of users) {
    const key = normalizeExt(u.id);
    statsByUser[key] = {
      name: u.name,
      talkMinutes: 0,
      leadsOnTime: 0,
      leadsLate: 0,
      callsConnected: 0,
      callsMissed: 0,
      leadsRejected: 0,
    };
  }

  for (const c of callRecords) {
    const extId = normalizeExt(c.extension?.id || '');
    const s = statsByUser[extId];
    if (!s) continue;
    if (c.result === 'Missed') s.callsMissed += 1;
    else if (c.result === 'Accepted' || c.result === 'Call connected') s.callsConnected += 1;
    s.talkMinutes += Math.floor((c.duration || 0) / 60);
  }

  /** All 5 HR recruiters: RC display name -> Monday API user param. Include all even if RC missing. */
  const HR_RECRUITERS: { rcName: string; mondayUser: string }[] = [
    { rcName: 'Alex Chester', mondayUser: 'Alex Chester' },
    { rcName: 'Fred Royce', mondayUser: 'Fred' },
    { rcName: 'Ethan Parker', mondayUser: 'Ethan' },
    { rcName: 'Winston Smith', mondayUser: 'Winston' },
    { rcName: 'Jessica Miller', mondayUser: 'Jessica' },
  ];

  for (const { rcName, mondayUser } of HR_RECRUITERS) {
    const userEntry = users.find((u) => u.name === rcName);
    const key = userEntry ? normalizeExt(userEntry.id) : rcName;
    if (!statsByUser[key]) {
      statsByUser[key] = {
        name: rcName,
        talkMinutes: 0,
        leadsOnTime: 0,
        leadsLate: 0,
        callsConnected: 0,
        callsMissed: 0,
        leadsRejected: 0,
      };
    }
    const s = statsByUser[key];

    try {
      const leadsRes = await fetch(
        `${base}/api/monday/leads?user=${encodeURIComponent(mondayUser)}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`
      );
      if (!leadsRes.ok) continue;
      const leadsData = await leadsRes.json();
      const leads = leadsData.leads || [];

      for (const lead of leads) {
        if (lead.timing === 'On time') s.leadsOnTime += 1;
        else if (lead.timing === 'Late') s.leadsLate += 1;
        if (lead.status === 'Rejected') s.leadsRejected += 1;
      }
    } catch {
      // skip on error
    }
  }

  const reportDateStr = reportDate.toISOString().slice(0, 10);
  let msg = `📊 *HR Daily Report — ${reportDateStr}*\n`;
  msg += `Shift: 8am–5pm US Central (7pm–4am Tashkent)\n\n`;

  let totalTalk = 0;
  let totalOnTime = 0;
  let totalLate = 0;
  let totalConnected = 0;
  let totalMissed = 0;
  let totalRejected = 0;

  for (const { rcName } of HR_RECRUITERS) {
    const userEntry = users.find((u) => u.name === rcName);
    const key = userEntry ? normalizeExt(userEntry.id) : rcName;
    const s = statsByUser[key];
    if (!s) continue;
    totalTalk += s.talkMinutes;
    totalOnTime += s.leadsOnTime;
    totalLate += s.leadsLate;
    totalConnected += s.callsConnected;
    totalMissed += s.callsMissed;
    totalRejected += s.leadsRejected;
    msg += `👤 *${s.name}*\n`;
    msg += `   Talk: ${s.talkMinutes} min | Leads: ${s.leadsOnTime} on-time, ${s.leadsLate} late | Calls: ${s.callsConnected} connected, ${s.callsMissed} missed | Rejected: ${s.leadsRejected}\n\n`;
  }

  msg += `📈 *TOTAL (5 users)*\n`;
  msg += `   Talk: ${totalTalk} min | Leads: ${totalOnTime} on-time, ${totalLate} late | Calls: ${totalConnected} connected, ${totalMissed} missed | Rejected: ${totalRejected}`;

  const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: msg,
      parse_mode: 'Markdown',
    }),
  });

  if (!sendRes.ok) {
    const err = await sendRes.text();
    console.error('[telegram/daily-report] Send failed:', err);
    return NextResponse.json({ error: 'Telegram send failed', details: err }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: true });
}
