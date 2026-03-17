import { NextResponse } from 'next/server';
import { getShiftWindowISO, getReportDayRangeISO, getShiftHours } from '@/utils/leadShift';
import { WHITELIST_ACCOUNT1 } from '@/lib/whitelist';

type UserStats = {
  name: string;
  talkMinutes: number;
  leadsTotal: number;
  leadsOnTime: number;
  leadsLate: number;
  callsConnected: number;
  callsMissed: number;
  leadsRejected: number;
};

interface AIReportResult {
  dailyOutcome: string;
  advice: { name: string; advice: string }[];
}

async function fetchAIReport(
  statsList: UserStats[],
  totals: { talk: number; total: number; onTime: number; late: number; connected: number; missed: number; rejected: number }
): Promise<AIReportResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const userData = statsList
    .map(
      (s) =>
        `${s.name}: talk ${s.talkMinutes} min, leads ${s.leadsTotal} total (${s.leadsOnTime} on-time / ${s.leadsLate} late), calls ${s.callsConnected} connected / ${s.callsMissed} missed, rejected ${s.leadsRejected}`
    )
    .join('\n');

  const systemPrompt = `You are an HR advisor for phone recruiters. Based on their shift stats, provide:
1. A brief daily outcome summary (2-4 sentences): who worked, what they accomplished, notable patterns.
2. For each recruiter: 2-3 short, actionable tips. Focus on call handling, lead timing, and productivity. Be encouraging but specific. Keep each advice under 200 characters.

Respond ONLY with valid JSON in this exact format (no markdown, no code block):
{"dailyOutcome":"...","advice":[{"name":"Full Name","advice":"..."}]}`;

  const userPrompt = `Today's shift stats (9am-6pm CDT / 8am-5pm CST US Central). Team totals: talk ${totals.talk} min, leads ${totals.total} total (${totals.onTime} on-time / ${totals.late} late), calls ${totals.connected} connected / ${totals.missed} missed, rejected ${totals.rejected}.

Per recruiter:
${userData}

Return JSON only.`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      console.error('[telegram/daily-report] OpenAI error:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned) as AIReportResult;
    if (!parsed.dailyOutcome || !Array.isArray(parsed.advice)) return null;
    return parsed;
  } catch (err) {
    console.error('[telegram/daily-report] OpenAI fetch failed:', err);
    return null;
  }
}

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

const RC_TOKEN_URL = 'https://platform.ringcentral.com/restapi/oauth/token';
const RC_BASE = 'https://platform.ringcentral.com/restapi';
const RC_DELAY_MS = 2500;
const RC_429_RETRY_MS = 65000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getAccount1Token(clientId: string, clientSecret: string, jwt: string): Promise<string | null> {
  const encodedAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.append('assertion', jwt);
  const res = await fetch(RC_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${encodedAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const data = await res.json();
  return res.ok ? data.access_token : null;
}

async function fetchAccount1Users(clientId: string, clientSecret: string, jwt: string): Promise<UserWithExt[]> {
  const token = await getAccount1Token(clientId, clientSecret, jwt);
  if (!token) return [];

  const users: UserWithExt[] = [];
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
    url = data.navigation?.nextPage?.uri || null;
  }
  return users;
}

async function fetchAccount2Users(): Promise<UserWithExt[]> {
  const clientId = process.env.RC2_CLIENT_ID;
  const clientSecret = process.env.RC2_CLIENT_SECRET;
  const jwt = process.env.RC2_JWT;
  if (!clientId || !clientSecret || !jwt) return [];

  const encodedAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.append('assertion', jwt);
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
  if (!token) return [];

  const users: UserWithExt[] = [];
  let url: string | null = `${RC_BASE}/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1`;
  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data: { records?: any[]; navigation?: { nextPage?: { uri?: string } } } = await res.json();
    const records = data.records || [];
    for (const u of records) {
      if (HR_RC_NAMES.has(u.name)) {
        users.push({ id: String(u.id), name: u.name });
      }
    }
    url = data.navigation?.nextPage?.uri || null
  }
  return users;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const debug = searchParams.get('debug') === '1';
  const dateParam = searchParams.get('date');

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return NextResponse.json(
      { error: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set' },
      { status: 500 }
    );
  }

  // Optional: require CRON_SECRET when invoked by Vercel Cron (skip for debug)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!debug && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const base =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

  // Report date: shift-aware. Bot sends at 4am Tashkent = 23:00 UTC. Before 23:00 UTC = previous day's report.
  // ?date=YYYY-MM-DD overrides. Shift/calls/leads always in US Central.
  const now = new Date();
  let reportDate: Date;
  if (dateParam) {
    reportDate = new Date(dateParam + 'T12:00:00Z');
  } else {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const d = now.getUTCDate();
    const hour = now.getUTCHours();
    if (hour < 23) {
      const prev = new Date(Date.UTC(y, m, d));
      prev.setUTCDate(prev.getUTCDate() - 1);
      reportDate = prev;
    } else {
      reportDate = new Date(Date.UTC(y, m, d));
    }
  }
  const { from: shiftFrom, to: shiftTo } = getShiftWindowISO(reportDate);
  const { from: dayFrom, to: dayTo } = getReportDayRangeISO(reportDate);

  const rc1ClientId = process.env.RC_CLIENT_ID || process.env.NEXT_PUBLIC_RC_CLIENT_ID;
  const rc1ClientSecret = process.env.RC_CLIENT_SECRET || process.env.NEXT_PUBLIC_RC_CLIENT_SECRET;
  const rc1Jwt = process.env.RC_JWT || process.env.NEXT_PUBLIC_RC_JWT;
  const users: UserWithExt[] = [];
  let acc1Count = 0;
  let acc2Count = 0;

  if (rc1ClientId && rc1ClientSecret && rc1Jwt) {
    const acc1Users = await fetchAccount1Users(rc1ClientId, rc1ClientSecret, rc1Jwt);
    acc1Count = acc1Users.length;
    users.push(...acc1Users);
  }

  const acc2Users = await fetchAccount2Users();
  acc2Count = acc2Users.length;
  users.push(...acc2Users);

  // Fetch calls directly from RingCentral (no DB dependency) - same as dashboard's Waiting view
  const callRecords: any[] = [];
  const shiftFromDate = new Date(shiftFrom);
  const shiftToDate = new Date(shiftTo);

  const fetchErrors: { extId: string; status?: number; error?: string }[] = [];
  const fetchCallsForUser = async (extId: string, token: string): Promise<void> => {
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const url = `${RC_BASE}/v1.0/account/~/extension/${encodeURIComponent(extId)}/call-log?view=Detailed&type=Voice&dateFrom=${encodeURIComponent(shiftFrom)}&dateTo=${encodeURIComponent(shiftTo)}&page=${page}&perPage=100`;
      let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 429) {
        await sleep(RC_429_RETRY_MS);
        res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      }
      if (!res.ok) {
        const errText = await res.text();
        fetchErrors.push({ extId, status: res.status, error: errText.slice(0, 200) });
        break;
      }
      const data: { records?: any[]; paging?: { page?: number; totalPages?: number } } = await res.json();
      const records = data.records || [];
      for (const c of records) {
        const startTime = c.startTime ? new Date(c.startTime) : null;
        if (!startTime || isNaN(startTime.getTime())) continue;
        if (startTime < shiftFromDate || startTime > shiftToDate) continue;
        if (c.result === 'Missed') {
          callRecords.push({ ...c, extension: { id: extId } });
        } else if ((c.result === 'Accepted' || c.result === 'Call connected') && (c.duration || 0) >= 20) {
          callRecords.push({ ...c, extension: { id: extId } });
        }
      }
      hasMore = records.length === 100;
      page++;
      if (page > 50) break;
    }
  };

  const rc1Token = rc1ClientId && rc1ClientSecret && rc1Jwt ? await getAccount1Token(rc1ClientId, rc1ClientSecret, rc1Jwt) : null;
  let rc2Token: string | null = null;
  if (process.env.RC2_CLIENT_ID && process.env.RC2_CLIENT_SECRET && process.env.RC2_JWT) {
    const enc = Buffer.from(`${process.env.RC2_CLIENT_ID}:${process.env.RC2_CLIENT_SECRET}`).toString('base64');
    const p = new URLSearchParams();
    p.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    p.append('assertion', process.env.RC2_JWT);
    const r = await fetch(RC_TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${enc}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: p.toString(),
    });
    const d = await r.json();
    rc2Token = r.ok ? d.access_token : null;
  }

  const acc1UserList = users.slice(0, acc1Count);
  const acc2UserList = users.slice(acc1Count);
  for (const u of acc1UserList) {
    if (rc1Token) {
      await fetchCallsForUser(u.id, rc1Token);
      await sleep(RC_DELAY_MS);
    }
  }
  for (const u of acc2UserList) {
    if (rc2Token) {
      await fetchCallsForUser(u.id, rc2Token);
      await sleep(RC_DELAY_MS);
    }
  }

  const allRecordsCount = callRecords.length;

  const normalizeExt = (id: string | number) => String(id).replace(/\.0$/, '');

  const statsByUser: Record<string, UserStats> = {};
  for (const u of users) {
    const key = normalizeExt(u.id);
    statsByUser[key] = {
      name: u.name,
      talkMinutes: 0,
      leadsTotal: 0,
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
        leadsTotal: 0,
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
        `${base}/api/monday/leads?user=${encodeURIComponent(mondayUser)}&dateFrom=${encodeURIComponent(dayFrom)}&dateTo=${encodeURIComponent(dayTo)}`
      );
      if (!leadsRes.ok) continue;
      const leadsData = await leadsRes.json();
      const leads = leadsData.leads || [];

      for (const lead of leads) {
        s.leadsTotal += 1;
        if (lead.timing === 'On time') s.leadsOnTime += 1;
        else if (lead.timing === 'Late') s.leadsLate += 1;
        if (lead.status === 'Rejected') s.leadsRejected += 1;
      }
      await sleep(400);
    } catch {
      // skip on error
    }
  }

  const reportDateStr = reportDate.toISOString().slice(0, 10);

  let totalTalk = 0;
  let totalLeads = 0;
  let totalOnTime = 0;
  let totalLate = 0;
  let totalConnected = 0;
  let totalMissed = 0;
  let totalRejected = 0;
  const statsList: UserStats[] = [];

  for (const { rcName } of HR_RECRUITERS) {
    const userEntry = users.find((u) => u.name === rcName);
    const key = userEntry ? normalizeExt(userEntry.id) : rcName;
    const s = statsByUser[key];
    if (!s) continue;
    totalTalk += s.talkMinutes;
    totalLeads += s.leadsTotal;
    totalOnTime += s.leadsOnTime;
    totalLate += s.leadsLate;
    totalConnected += s.callsConnected;
    totalMissed += s.callsMissed;
    totalRejected += s.leadsRejected;
    statsList.push(s);
  }

  const aiReport = await fetchAIReport(statsList, {
    talk: totalTalk,
    total: totalLeads,
    onTime: totalOnTime,
    late: totalLate,
    connected: totalConnected,
    missed: totalMissed,
    rejected: totalRejected,
  });

  const { start } = getShiftHours(reportDate);
  const shiftLabel = start === 9 ? '9am–6pm' : '8am–5pm';
  let msg = `📊 *HR Daily Report — ${reportDateStr}*\n`;
  msg += `Shift: ${shiftLabel} US Central (7pm–4am Tashkent)\n\n`;

  for (const s of statsList) {
    msg += `👤 *${s.name}*\n`;
    msg += `   Talk: ${s.talkMinutes} min | Leads: ${s.leadsTotal} total (${s.leadsOnTime} on-time, ${s.leadsLate} late) | Calls: ${s.callsConnected} connected, ${s.callsMissed} missed | Rejected: ${s.leadsRejected}\n\n`;
  }

  if (aiReport) {
    msg += `📋 *Daily Outcome*\n${aiReport.dailyOutcome}\n\n`;
    msg += `💡 *Advice*\n`;
    for (const { name, advice } of aiReport.advice) {
      msg += `👤 *${name}*: ${advice}\n\n`;
    }
  }

  msg += `📈 *TOTAL (5 users)*\n`;
  msg += `   Talk: ${totalTalk} min | Leads: ${totalLeads} total (${totalOnTime} on-time, ${totalLate} late) | Calls: ${totalConnected} connected, ${totalMissed} missed | Rejected: ${totalRejected}`;

  const TELEGRAM_MAX_LENGTH = 4096;
  if (msg.length > TELEGRAM_MAX_LENGTH) {
    msg = msg.slice(0, TELEGRAM_MAX_LENGTH - 20) + '\n\n...[truncated]';
  }

  if (debug) {
    return NextResponse.json({
      debug: true,
      hint: 'For manual trigger, add ?date=YYYY-MM-DD (e.g. ?date=2026-03-17) to report that day.',
      reportDate: reportDateStr,
      shiftWindow: { from: shiftFrom, to: shiftTo },
      leadDayRange: { from: dayFrom, to: dayTo },
      users: {
        account1: acc1Count,
        account2: acc2Count,
        total: users.length,
        extensionIds: users.map((u) => u.id),
      },
      tokens: {
        rc1: !!rc1Token,
        rc2: !!rc2Token,
      },
      calls: {
        fromRingCentral: allRecordsCount,
        fetchErrors: fetchErrors.length ? fetchErrors : undefined,
      },
      env: {
        hasRc1: !!(rc1ClientId && rc1ClientSecret && rc1Jwt),
        hasPostgres: !!process.env.POSTGRES_URL,
        hasMonday: !!process.env.MONDAY_API_TOKEN,
      },
      message: msg,
    });
  }

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
