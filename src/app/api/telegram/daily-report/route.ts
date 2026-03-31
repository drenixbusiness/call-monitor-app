import { NextResponse } from 'next/server';
import { getShiftWindowISO, getReportDayRangeISO, getShiftHours } from '@/utils/leadShift';

/** Room for RC + Monday + multiple OpenAI calls (team + admin per deploy). */
export const maxDuration = 120;
import { getServerDeployAccount } from '@/lib/deployAccount';
import { WHITELIST_ACCOUNT1, WHITELIST_ACCOUNT2 } from '@/lib/whitelist';
import {
  HR_REPORT_RC_NAMES,
  TELEGRAM_REPORT_ROWS_ALL,
  filterBpAdminGroup,
  filterBpTeamGroup,
  filterJmAdminGroup,
  filterJmTeamGroup,
} from '@/lib/telegramReport';

/**
 * Team = worker Telegram groups (TELEGRAM_*_TEAM_CHAT_ID). Managers = head/admin groups
 * (TELEGRAM_*_HEAD_CHAT_ID / *_ADMIN_CHAT_ID).
 * Set to true to also post the team-scoped report to team chats; currently managers only.
 */
const SEND_DAILY_REPORT_TO_TEAM_TELEGRAM_GROUPS = false;

type UserStats = {
  name: string;
  talkMinutes: number;
  leadsTotal: number;
  leadsOnTime: number;
  leadsLate: number;
  callsConnected: number;
  callsMissed: number;
  leadsRejected: number;
  leadsFollowUp: number;
};

interface AIReportResult {
  dailyOutcome: string;
  advice: { name: string; advice: string }[];
}

async function fetchAIReport(
  statsList: UserStats[],
  totals: {
    talk: number;
    total: number;
    onTime: number;
    late: number;
    connected: number;
    missed: number;
    rejected: number;
    followUp: number;
  }
): Promise<AIReportResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const userData = statsList
    .map(
      (s) =>
        `${s.name}: talk ${s.talkMinutes} min, leads ${s.leadsTotal} total (${s.leadsOnTime} on-time / ${s.leadsLate} late, ${s.leadsFollowUp} follow-up), calls ${s.callsConnected} connected / ${s.callsMissed} missed, rejected ${s.leadsRejected}`
    )
    .join('\n');

  const systemPrompt = `You are an HR advisor for phone recruiters. Based on their shift stats, provide:
1. A brief daily outcome summary (2-4 sentences): who worked, what they accomplished, notable patterns.
2. For each recruiter: 2-3 short, actionable tips. Focus on call handling, lead timing, and productivity. Be encouraging but specific. Keep each advice under 200 characters.

Respond ONLY with valid JSON in this exact format (no markdown, no code block):
{"dailyOutcome":"...","advice":[{"name":"Full Name","advice":"..."}]}`;

  const exactNames = statsList.map((s) => s.name).join(', ');
  const userPrompt = `Today's shift stats (9am-6pm CDT / 8am-5pm CST US Central). Team totals: talk ${totals.talk} min, leads ${totals.total} total (${totals.onTime} on-time / ${totals.late} late, ${totals.followUp} follow-up), calls ${totals.connected} connected / ${totals.missed} missed, rejected ${totals.rejected}.

Per recruiter:
${userData}

In the JSON "advice" array, use these EXACT "name" strings (same spelling as above): ${exactNames}

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

function aggregateTotals(statsList: UserStats[]) {
  let totalTalk = 0;
  let totalLeads = 0;
  let totalOnTime = 0;
  let totalLate = 0;
  let totalConnected = 0;
  let totalMissed = 0;
  let totalRejected = 0;
  let totalFollowUp = 0;
  for (const s of statsList) {
    totalTalk += s.talkMinutes;
    totalLeads += s.leadsTotal;
    totalOnTime += s.leadsOnTime;
    totalLate += s.leadsLate;
    totalConnected += s.callsConnected;
    totalMissed += s.callsMissed;
    totalRejected += s.leadsRejected;
    totalFollowUp += s.leadsFollowUp;
  }
  return {
    talk: totalTalk,
    total: totalLeads,
    onTime: totalOnTime,
    late: totalLate,
    connected: totalConnected,
    missed: totalMissed,
    rejected: totalRejected,
    followUp: totalFollowUp,
  };
}

/** Match OpenAI advice rows to RC names (exact, then first/last name). */
function adviceForStatName(
  statsName: string,
  advice: { name: string; advice: string }[]
): string | undefined {
  const sn = statsName.trim().toLowerCase();
  for (const a of advice) {
    if (a.name.trim().toLowerCase() === sn) return a.advice;
  }
  const first = sn.split(/\s+/)[0] || '';
  for (const a of advice) {
    const an = a.name.trim().toLowerCase();
    if (an === first || sn.startsWith(an + ' ') || an.startsWith(first)) return a.advice;
  }
  return undefined;
}

function buildReportMessage(
  statsList: UserStats[],
  aiReport: AIReportResult | null,
  reportDateStr: string,
  shiftLabel: string,
  companyLabel: string
): string {
  const totals = aggregateTotals(statsList);

  let msg = `📊 *HR Daily Report — ${companyLabel} — ${reportDateStr}*\n`;
  msg += `Shift: ${shiftLabel} US Central (7pm–4am Tashkent)\n\n`;

  for (const s of statsList) {
    msg += `👤 *${s.name}*\n`;
    msg += `   Talk: ${s.talkMinutes} min | Leads: ${s.leadsTotal} total (${s.leadsOnTime} on-time, ${s.leadsLate} late, ${s.leadsFollowUp} follow-up) | Calls: ${s.callsConnected} connected, ${s.callsMissed} missed | Rejected: ${s.leadsRejected}\n`;
    const adv = aiReport ? adviceForStatName(s.name, aiReport.advice) : undefined;
    if (adv) msg += `\n   💡 *Advice:* ${adv}\n`;
    msg += `\n`;
  }

  if (aiReport) {
    msg += `📋 *Daily Outcome*\n${aiReport.dailyOutcome}\n\n`;
  }

  msg += `📈 *TOTAL (${statsList.length} users)*\n`;
  msg += `   Talk: ${totals.talk} min | Leads: ${totals.total} total (${totals.onTime} on-time, ${totals.late} late, ${totals.followUp} follow-up) | Calls: ${totals.connected} connected, ${totals.missed} missed | Rejected: ${totals.rejected}`;

  const TELEGRAM_MAX_LENGTH = 4096;
  if (msg.length > TELEGRAM_MAX_LENGTH) {
    msg = msg.slice(0, TELEGRAM_MAX_LENGTH - 20) + '\n\n...[truncated]';
  }
  return msg;
}

/**
 * Telegram returns HTTP 200 with {"ok":false,...} for many API errors — must parse JSON.
 * Supergroup upgrade: old group chat_id stops working; API returns migrate_to_chat_id — retry once.
 */
async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string
): Promise<{ ok: boolean; error?: string; migratedTo?: string }> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  let attemptChatId: string | number = chatId;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: attemptChatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
    const raw = await res.text();
    let data: {
      ok?: boolean;
      error_code?: number;
      description?: string;
      parameters?: { migrate_to_chat_id?: number };
    };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      return { ok: false, error: raw || `HTTP ${res.status}` };
    }
    if (data.ok === true) {
      return attempt > 0 ? { ok: true, migratedTo: String(attemptChatId) } : { ok: true };
    }

    const migrateId = data.parameters?.migrate_to_chat_id;
    if (
      attempt === 0 &&
      typeof migrateId === 'number' &&
      data.description?.toLowerCase().includes('supergroup')
    ) {
      console.warn('[telegram/daily-report] Supergroup migration, retrying with chat_id:', migrateId);
      attemptChatId = migrateId;
      continue;
    }
    return { ok: false, error: raw };
  }
  return { ok: false, error: 'Telegram send failed after migration retry' };
}

interface UserWithExt {
  id: string;
  name: string;
}

const RC_TOKEN_URL = 'https://platform.ringcentral.com/restapi/oauth/token';
const RC_BASE = 'https://platform.ringcentral.com/restapi';
const RC_DELAY_MS = 800;
const RC_429_RETRY_MS = 65000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getAccount1Token(
  clientId: string,
  clientSecret: string,
  jwt: string
): Promise<{ token: string | null; error?: string }> {
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
  if (res.ok) return { token: data.access_token };
  const err = data.error_description || data.error || JSON.stringify(data);
  return { token: null, error: String(err).slice(0, 200) };
}

/** Paginate extensions with a token; filter HR recruiters by whitelist for this RC tenant. */
async function fetchUsersFromToken(
  token: string,
  mode: 'account1' | 'account2' | 'legacy_rc1'
): Promise<UserWithExt[]> {
  const users: UserWithExt[] = [];
  let url: string | null = `${RC_BASE}/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1`;
  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data: { records?: any[]; navigation?: { nextPage?: { uri?: string } } } = await res.json();
    const records = data.records || [];
    for (const u of records) {
      if (!HR_REPORT_RC_NAMES.has(u.name)) continue;
      if (mode === 'account1' || mode === 'legacy_rc1') {
        if (!WHITELIST_ACCOUNT1.includes(u.name)) continue;
      } else {
        if (!WHITELIST_ACCOUNT2.includes(u.name)) continue;
      }
      users.push({ id: String(u.id), name: u.name });
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
      if (HR_REPORT_RC_NAMES.has(u.name) && WHITELIST_ACCOUNT2.includes(u.name)) {
        users.push({ id: String(u.id), name: u.name });
      }
    }
    url = data.navigation?.nextPage?.uri || null
  }
  return users;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const debug = searchParams.get('debug') === '1' || searchParams.get('debug') === 'true';
  const dateParam = searchParams.get('date');
  const skipAI = searchParams.get('skipAI') === '1' || searchParams.get('skipAI') === 'true';

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_BOT_TOKEN must be set' }, { status: 500 });
  }
  const telegramBotToken = token;

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
  /** One business shift in US Central (9am–6pm CDT / 8am–5pm CST). Must match RC stats — do not use the wide Tashkent calendar span here or missed/connected counts include neighboring days. */
  const { from: shiftFrom, to: shiftTo } = getShiftWindowISO(reportDate);
  const callsFrom = shiftFrom;
  const callsTo = shiftTo;
  const { from: dayFrom, to: dayTo } = getReportDayRangeISO(reportDate);

  const rc1ClientId = process.env.RC_CLIENT_ID || process.env.NEXT_PUBLIC_RC_CLIENT_ID;
  const rc1ClientSecret = process.env.RC_CLIENT_SECRET || process.env.NEXT_PUBLIC_RC_CLIENT_SECRET;
  const rc1Jwt = process.env.RC_JWT || process.env.NEXT_PUBLIC_RC_JWT;

  const rc1Result =
    rc1ClientId && rc1ClientSecret && rc1Jwt ? await getAccount1Token(rc1ClientId, rc1ClientSecret, rc1Jwt) : null;
  const rc1Token = rc1Result?.token ?? null;
  const rc1TokenError = rc1Result?.error;

  const deploy = getServerDeployAccount();
  const users: UserWithExt[] = [];
  let acc1Count = 0;
  let acc2Count = 0;

  if (deploy === 'account1') {
    if (rc1Token) {
      const u = await fetchUsersFromToken(rc1Token, 'account1');
      acc1Count = u.length;
      users.push(...u);
    }
  } else if (deploy === 'account2') {
    if (rc1Token) {
      const u = await fetchUsersFromToken(rc1Token, 'account2');
      acc2Count = u.length;
      users.push(...u);
    }
  } else {
    if (rc1Token) {
      const u = await fetchUsersFromToken(rc1Token, 'legacy_rc1');
      acc1Count = u.length;
      users.push(...u);
    }
    const acc2Users = await fetchAccount2Users();
    acc2Count = acc2Users.length;
    users.push(...acc2Users);
  }

  // Fetch calls from RingCentral for the shift window only (same instant bounds as shiftWindow)
  // Deduplicate by sessionId (RC returns multiple legs per call) - match dashboard behavior
  const callRecordsByExt: Record<string, Map<string, any>> = {};
  const callsFromDate = new Date(callsFrom);
  const callsToDate = new Date(callsTo);

  const fetchErrors: { extId: string; status?: number; error?: string }[] = [];
  const fetchCallsForUser = async (extId: string, token: string): Promise<void> => {
    const sessionMap = new Map<string, any>();
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const url = `${RC_BASE}/v1.0/account/~/extension/${encodeURIComponent(extId)}/call-log?view=Detailed&type=Voice&dateFrom=${encodeURIComponent(callsFrom)}&dateTo=${encodeURIComponent(callsTo)}&page=${page}&perPage=100`;
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
        if (startTime < callsFromDate || startTime > callsToDate) continue;
        const sessionKey = c.sessionId ?? c.id;
        const rec = { ...c, extension: { id: extId } };
        if (c.result === 'Missed') {
          if (!sessionMap.has(sessionKey)) sessionMap.set(sessionKey, rec);
        } else if (c.result === 'Accepted' || c.result === 'Call connected') {
          const existing = sessionMap.get(sessionKey);
          if (!existing || (c.duration || 0) > (existing.duration || 0)) sessionMap.set(sessionKey, rec);
        }
      }
      hasMore = records.length === 100;
      page++;
      if (page > 50) break;
    }
    callRecordsByExt[extId] = sessionMap;
  };

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
  /** JDM single-deploy: all users live under RC_* token (no RC2_*). */
  const tokenForAcc2Calls = deploy === 'account2' ? rc1Token : rc2Token;

  await Promise.all(
    acc1UserList.map((u) => (rc1Token ? fetchCallsForUser(u.id, rc1Token) : Promise.resolve()))
  );
  await sleep(RC_DELAY_MS);
  await Promise.all(
    acc2UserList.map((u) => (tokenForAcc2Calls ? fetchCallsForUser(u.id, tokenForAcc2Calls) : Promise.resolve()))
  );

  const callRecords: any[] = [];
  for (const m of Object.values(callRecordsByExt)) {
    for (const rec of m.values()) callRecords.push(rec);
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
      leadsFollowUp: 0,
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

  /** RC display name -> Monday API user param (null = no Monday boards; skip leads fetch). */
  const HR_RECRUITERS =
    deploy === 'account1'
      ? TELEGRAM_REPORT_ROWS_ALL.filter((r) => WHITELIST_ACCOUNT1.includes(r.rcName))
      : deploy === 'account2'
        ? TELEGRAM_REPORT_ROWS_ALL.filter((r) => WHITELIST_ACCOUNT2.includes(r.rcName))
        : [...TELEGRAM_REPORT_ROWS_ALL];

  const leadsDebug: Record<string, { count: number; ok: boolean; status?: number; error?: string }> = {};
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const leadsResults = await Promise.all(
    HR_RECRUITERS.map(async ({ rcName, mondayUser }) => {
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
          leadsFollowUp: 0,
        };
      }
      const s = statsByUser[key];
      if (mondayUser == null) {
        return { rcName, debug: { count: 0, ok: true } };
      }
      try {
        const leadsUrl = `${base}/api/monday/leads?user=${encodeURIComponent(mondayUser)}&dateFrom=${encodeURIComponent(dayFrom)}&dateTo=${encodeURIComponent(dayTo)}`;
        const leadsRes = await fetch(leadsUrl, {
          headers: bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : undefined,
        });
        if (!leadsRes.ok) {
          const errText = await leadsRes.text();
          return { rcName, debug: { count: 0, ok: false, status: leadsRes.status, error: errText.slice(0, 150) } };
        }
        const leadsData = await leadsRes.json();
        const leads = leadsData.leads || [];
        for (const lead of leads) {
          s.leadsTotal += 1;
          if (lead.timing === 'On time') s.leadsOnTime += 1;
          else if (lead.timing === 'Late') s.leadsLate += 1;
          if (lead.status === 'Rejected') s.leadsRejected += 1;
          const st = typeof lead.status === 'string' ? lead.status.trim() : '';
          const stLower = st.toLowerCase();
          if (
            st === 'Follow up' ||
            stLower === 'follow-up' ||
            /^follow\s*up$/i.test(st) ||
            (stLower.includes('follow') && stLower.includes('up'))
          ) {
            s.leadsFollowUp += 1;
          }
        }
        return { rcName, debug: { count: leads.length, ok: true } };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        return { rcName, debug: { count: 0, ok: false, error: String(msg).slice(0, 150) } };
      }
    })
  );
  for (const { rcName, debug } of leadsResults) leadsDebug[rcName] = debug;

  const reportDateStr = reportDate.toISOString().slice(0, 10);

  const statsList: UserStats[] = [];
  for (const { rcName } of HR_RECRUITERS) {
    const userEntry = users.find((u) => u.name === rcName);
    const key = userEntry ? normalizeExt(userEntry.id) : rcName;
    const s = statsByUser[key];
    if (!s) continue;
    statsList.push(s);
  }

  const bpFullStats = filterBpAdminGroup(statsList);
  const bpTeamWideStats = filterBpTeamGroup(statsList);
  const jmFullStats = filterJmAdminGroup(statsList);
  const jmTeamWideStats = filterJmTeamGroup(statsList);

  const { start } = getShiftHours(reportDate);
  const shiftLabel = start === 9 ? '9am–6pm' : '8am–5pm';

  const chatLegacy = process.env.TELEGRAM_CHAT_ID;
  const envBpTeam = process.env.TELEGRAM_BP_TEAM_CHAT_ID;
  /** Admin / head group — support TELEGRAM_*_HEAD_CHAT_ID (Vercel naming) or *_ADMIN_CHAT_ID */
  const envBpAdmin =
    process.env.TELEGRAM_BP_ADMIN_CHAT_ID || process.env.TELEGRAM_BP_HEAD_CHAT_ID;
  const envJmTeam = process.env.TELEGRAM_JM_TEAM_CHAT_ID;
  const envJmAdmin =
    process.env.TELEGRAM_JM_ADMIN_CHAT_ID || process.env.TELEGRAM_JM_HEAD_CHAT_ID;

  const buildTeamAiAndMessage = async (team: UserStats[], label: string) => {
    const totals = aggregateTotals(team);
    const ai = skipAI ? null : await fetchAIReport(team, totals);
    const text = buildReportMessage(team, ai, reportDateStr, shiftLabel, label);
    return { ai, text };
  };

  type SendItem = { key: string; chatId: string; stats: UserStats[]; label: string };

  async function runSends(items: SendItem[]): Promise<{ key: string; ok: boolean; error?: string; skipped?: boolean }[]> {
    const out: { key: string; ok: boolean; error?: string; skipped?: boolean }[] = [];
    for (const it of items) {
      if (!it.stats.length) {
        out.push({ key: it.key, ok: true, skipped: true });
        continue;
      }
      const { text } = await buildTeamAiAndMessage(it.stats, it.label);
      const sent = await sendTelegramMessage(telegramBotToken, it.chatId, text);
      out.push({ key: it.key, ok: sent.ok, error: sent.error });
    }
    return out;
  }

  if (debug) {
    const combinedTotals = aggregateTotals(statsList);
    const aiAll = skipAI ? null : await fetchAIReport(statsList, combinedTotals);
    const msgAll = buildReportMessage(statsList, aiAll, reportDateStr, shiftLabel, 'All companies');
    const { text: msgBpTeam } = await buildTeamAiAndMessage(bpTeamWideStats, 'BP (team)');
    const { text: msgBpAdmin } = await buildTeamAiAndMessage(bpFullStats, 'BP (admin)');
    const { text: msgJmTeam } = await buildTeamAiAndMessage(jmTeamWideStats, 'JM (team)');
    const { text: msgJmAdmin } = await buildTeamAiAndMessage(jmFullStats, 'JM (admin)');
    return NextResponse.json({
      debug: true,
      hint: 'Add ?date=YYYY-MM-DD for a specific day. Add ?skipAI=1 to skip AI (faster, avoids timeout).',
      reportDate: reportDateStr,
      shiftWindow: { from: shiftFrom, to: shiftTo },
      callsRange: { from: shiftFrom, to: shiftTo },
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
        rc1Error: rc1TokenError || undefined,
      },
      calls: {
        fromRingCentral: allRecordsCount,
        fetchErrors: fetchErrors.length ? fetchErrors : undefined,
      },
      leads: {
        dayRange: { from: dayFrom, to: dayTo },
        perUser: leadsDebug,
      },
      env: {
        hasRc1: !!(rc1ClientId && rc1ClientSecret && rc1Jwt),
        hasPostgres: !!process.env.POSTGRES_URL,
        hasMonday: !!process.env.MONDAY_API_TOKEN,
        hasOpenAI: !!process.env.OPENAI_API_KEY,
        telegram: {
          TELEGRAM_BP_TEAM_CHAT_ID: !!envBpTeam,
          TELEGRAM_BP_ADMIN_OR_HEAD_CHAT_ID: !!envBpAdmin,
          TELEGRAM_JM_TEAM_CHAT_ID: !!envJmTeam,
          TELEGRAM_JM_ADMIN_OR_HEAD_CHAT_ID: !!envJmAdmin,
          TELEGRAM_CHAT_ID: !!chatLegacy,
          VERCEL_AUTOMATION_BYPASS_SECRET: !!process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
        },
      },
      message: msgAll,
      messageBpTeam: msgBpTeam,
      messageBpAdmin: msgBpAdmin,
      messageJmTeam: msgJmTeam,
      messageJmAdmin: msgJmAdmin,
    });
  }

  /** BP-only deploy: team (no Fred) + admin (full BP). Fallback: TELEGRAM_CHAT_ID → one admin report. */
  if (deploy === 'account1') {
    const hasSplit = !!(envBpTeam || envBpAdmin);
    if (!hasSplit && !chatLegacy) {
      return NextResponse.json(
        {
          error:
            'Set TELEGRAM_BP_TEAM_CHAT_ID and/or TELEGRAM_BP_ADMIN_CHAT_ID, or TELEGRAM_CHAT_ID for a single BP admin report',
        },
        { status: 500 }
      );
    }
    if (!hasSplit && chatLegacy) {
      const results = await runSends([{ key: 'bp_legacy', chatId: chatLegacy, stats: bpFullStats, label: 'BP (admin)' }]);
      if (!results[0].ok) {
        return NextResponse.json({ error: 'Telegram send failed', details: results[0].error }, { status: 500 });
      }
      return NextResponse.json({ ok: true, sent: true, destinations: ['bp_legacy'] });
    }
    const items: SendItem[] = [];
    if (SEND_DAILY_REPORT_TO_TEAM_TELEGRAM_GROUPS && envBpTeam) {
      items.push({ key: 'bp_team', chatId: envBpTeam, stats: bpTeamWideStats, label: 'BP (team)' });
    }
    if (envBpAdmin) items.push({ key: 'bp_admin', chatId: envBpAdmin, stats: bpFullStats, label: 'BP (admin)' });
    if (items.length === 0) {
      return NextResponse.json(
        {
          error:
            'No manager Telegram chat configured, or only team chat is set while team sends are disabled. Set TELEGRAM_BP_HEAD_CHAT_ID (managers).',
        },
        { status: 500 }
      );
    }
    const results = await runSends(items);
    const failed = results.filter((r) => !r.ok && !r.skipped);
    if (failed.length > 0) {
      return NextResponse.json({ error: 'Telegram send failed', results }, { status: 500 });
    }
    return NextResponse.json({ ok: true, sent: true, destinations: items.map((i) => i.key) });
  }

  /** JM-only deploy: team (no Alex) + admin (full JM). Fallback: TELEGRAM_CHAT_ID → one admin report. */
  if (deploy === 'account2') {
    const hasSplit = !!(envJmTeam || envJmAdmin);
    if (!hasSplit && !chatLegacy) {
      return NextResponse.json(
        {
          error:
            'Set TELEGRAM_JM_TEAM_CHAT_ID and/or TELEGRAM_JM_ADMIN_CHAT_ID, or TELEGRAM_CHAT_ID for a single JM admin report',
        },
        { status: 500 }
      );
    }
    if (!hasSplit && chatLegacy) {
      const results = await runSends([{ key: 'jm_legacy', chatId: chatLegacy, stats: jmFullStats, label: 'JM (admin)' }]);
      if (!results[0].ok) {
        return NextResponse.json({ error: 'Telegram send failed', details: results[0].error }, { status: 500 });
      }
      return NextResponse.json({ ok: true, sent: true, destinations: ['jm_legacy'] });
    }
    const items: SendItem[] = [];
    if (SEND_DAILY_REPORT_TO_TEAM_TELEGRAM_GROUPS && envJmTeam) {
      items.push({ key: 'jm_team', chatId: envJmTeam, stats: jmTeamWideStats, label: 'JM (team)' });
    }
    if (envJmAdmin) items.push({ key: 'jm_admin', chatId: envJmAdmin, stats: jmFullStats, label: 'JM (admin)' });
    if (items.length === 0) {
      return NextResponse.json(
        {
          error:
            'No manager Telegram chat configured, or only team chat is set while team sends are disabled. Set TELEGRAM_JM_HEAD_CHAT_ID (managers).',
        },
        { status: 500 }
      );
    }
    const results = await runSends(items);
    const failed = results.filter((r) => !r.ok && !r.skipped);
    if (failed.length > 0) {
      return NextResponse.json({ error: 'Telegram send failed', results }, { status: 500 });
    }
    return NextResponse.json({ ok: true, sent: true, destinations: items.map((i) => i.key) });
  }

  /** Legacy (both companies): up to four sends. If none of the four env vars set, fall back to TELEGRAM_CHAT_ID combined. */
  const hasFourWay = !!(envBpTeam || envBpAdmin || envJmTeam || envJmAdmin);
  if (hasFourWay) {
    const items: SendItem[] = [];
    if (SEND_DAILY_REPORT_TO_TEAM_TELEGRAM_GROUPS && envBpTeam) {
      items.push({ key: 'bp_team', chatId: envBpTeam, stats: bpTeamWideStats, label: 'BP (team)' });
    }
    if (envBpAdmin) items.push({ key: 'bp_admin', chatId: envBpAdmin, stats: bpFullStats, label: 'BP (admin)' });
    if (SEND_DAILY_REPORT_TO_TEAM_TELEGRAM_GROUPS && envJmTeam) {
      items.push({ key: 'jm_team', chatId: envJmTeam, stats: jmTeamWideStats, label: 'JM (team)' });
    }
    if (envJmAdmin) items.push({ key: 'jm_admin', chatId: envJmAdmin, stats: jmFullStats, label: 'JM (admin)' });
    if (items.length === 0) {
      return NextResponse.json(
        {
          error:
            'No manager Telegram chats configured (TELEGRAM_BP_HEAD_CHAT_ID / TELEGRAM_JM_HEAD_CHAT_ID), or only team chats are set while team sends are disabled.',
        },
        { status: 500 }
      );
    }
    const results = await runSends(items);
    const failed = results.filter((r) => !r.ok && !r.skipped);
    if (failed.length > 0) {
      return NextResponse.json({ error: 'Telegram send failed for one or more groups', results }, { status: 500 });
    }
    return NextResponse.json({ ok: true, sent: true, destinations: items.map((i) => i.key) });
  }

  if (chatLegacy) {
    const combinedTotals = aggregateTotals(statsList);
    const aiAll = skipAI ? null : await fetchAIReport(statsList, combinedTotals);
    const msgAll = buildReportMessage(statsList, aiAll, reportDateStr, shiftLabel, 'All companies');
    const sent = await sendTelegramMessage(telegramBotToken, chatLegacy, msgAll);
    if (!sent.ok) {
      console.error('[telegram/daily-report] Send failed:', sent.error);
      return NextResponse.json({ error: 'Telegram send failed', details: sent.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, sent: true, destination: 'legacy_combined' });
  }

  return NextResponse.json(
    {
      error:
        'Set manager chats TELEGRAM_BP_HEAD_CHAT_ID and/or TELEGRAM_JM_HEAD_CHAT_ID (or TELEGRAM_CHAT_ID for one combined report). Team group sends are disabled in code (SEND_DAILY_REPORT_TO_TEAM_TELEGRAM_GROUPS).',
    },
    { status: 500 }
  );
}
