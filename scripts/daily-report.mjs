#!/usr/bin/env node
/**
 * Standalone daily report script for GitHub Actions.
 * Same logic as /api/telegram/daily-report. Fetches RC calls, Monday leads (via Vercel API), OpenAI, sends to Telegram.
 * No Vercel timeout - runs in GitHub Actions (up to 6 hours on free tier).
 */

const RC_TOKEN_URL = 'https://platform.ringcentral.com/restapi/oauth/token';
const RC_BASE = 'https://platform.ringcentral.com/restapi';
const RC_DELAY_MS = 800;
const RC_429_RETRY_MS = 65000;
const WHITELIST_ACCOUNT1 = ['Ethan Parker', 'Fred Royce', 'Tony Safety Department'];
const HR_RC_NAMES = new Set(['Ethan Parker', 'Fred Royce', 'Alex Chester', 'Winston Smith', 'Jessica Miller']);
const HR_RECRUITERS = [
  { rcName: 'Alex Chester', mondayUser: 'Alex Chester' },
  { rcName: 'Fred Royce', mondayUser: 'Fred' },
  { rcName: 'Ethan Parker', mondayUser: 'Ethan' },
  { rcName: 'Winston Smith', mondayUser: 'Winston' },
  { rcName: 'Jessica Miller', mondayUser: 'Jessica' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getCentralOffsetHours(year, month, day) {
  const getFirstSunday = (y, m) => {
    const first = new Date(Date.UTC(y, m, 1));
    return first.getUTCDay() === 0 ? 1 : 8 - first.getUTCDay();
  };
  const marchSecondSun = getFirstSunday(year, 2) + 7;
  const novFirstSun = getFirstSunday(year, 10);
  const d = new Date(Date.UTC(year, month, day));
  const dstStart = new Date(Date.UTC(year, 2, marchSecondSun));
  const dstEnd = new Date(Date.UTC(year, 10, novFirstSun));
  return d >= dstStart && d < dstEnd ? -5 : -6;
}

function getShiftHours(date) {
  const offset = getCentralOffsetHours(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return { start: offset === -5 ? 9 : 8, end: offset === -5 ? 18 : 17 };
}

function getShiftWindowISO(reportDate) {
  const y = reportDate.getUTCFullYear();
  const m = reportDate.getUTCMonth();
  const d = reportDate.getUTCDate();
  const offset = getCentralOffsetHours(y, m, d);
  const { start, end } = getShiftHours(reportDate);
  const startHour = start - offset;
  const endHour = end - 1 - offset;
  const from = new Date(Date.UTC(y, m, d, startHour, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, d, endHour, 59, 59, 999));
  return { from: from.toISOString(), to: to.toISOString() };
}

function getReportDayRangeISO(reportDate) {
  const y = reportDate.getUTCFullYear();
  const m = reportDate.getUTCMonth();
  const d = reportDate.getUTCDate();
  const offset = getCentralOffsetHours(y, m, d);
  const startHour = 0 - offset;
  const from = new Date(Date.UTC(y, m, d, startHour, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, d + 1, startHour, 0, 0, 0) - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Matches dashboard "March 18–19" (Tashkent UTC+5): Mar 18 00:00 to Mar 19 23:59 Tashkent = Mar 17 19:00 to Mar 19 18:59 UTC */
function getReportCallsRangeTashkentISO(reportDate) {
  const y = reportDate.getUTCFullYear();
  const m = reportDate.getUTCMonth();
  const d = reportDate.getUTCDate();
  const from = new Date(Date.UTC(y, m, d - 1, 19, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, d + 1, 18, 59, 59, 999));
  return { from: from.toISOString(), to: to.toISOString() };
}

async function getAccount1Token(clientId, clientSecret, jwt) {
  const encodedAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.append('assertion', jwt);
  const res = await fetch(RC_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${encodedAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  return res.ok ? data.access_token : null;
}

async function fetchAccount1Users(clientId, clientSecret, jwt) {
  const token = await getAccount1Token(clientId, clientSecret, jwt);
  if (!token) return [];
  const users = [];
  let url = `${RC_BASE}/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json();
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

async function fetchAccount2Users() {
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
    headers: { Authorization: `Basic ${encodedAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const tokenData = await tokenRes.json();
  const token = tokenRes.ok ? tokenData.access_token : null;
  if (!token) return [];
  const users = [];
  let url = `${RC_BASE}/v1.0/account/~/extension?type=User&status=Enabled&perPage=100&page=1`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json();
    const records = data.records || [];
    for (const u of records) {
      if (HR_RC_NAMES.has(u.name)) users.push({ id: String(u.id), name: u.name });
    }
    url = data.navigation?.nextPage?.uri || null;
  }
  return users;
}

async function fetchAIReport(statsList, totals) {
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
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        temperature: 0.7,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.dailyOutcome || !Array.isArray(parsed.advice)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function main() {
  const dateParam = process.env.REPORT_DATE;
  const skipAI = process.env.SKIP_AI === '1' || process.env.SKIP_AI === 'true';
  const appUrl = process.env.APP_URL || 'https://call-monitor-app.vercel.app';
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set');
    process.exit(1);
  }

  const now = new Date();
  let reportDate;
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

  const { from: callsFrom, to: callsTo } = getReportCallsRangeTashkentISO(reportDate);
  const { from: dayFrom, to: dayTo } = getReportDayRangeISO(reportDate);
  const callsFromDate = new Date(callsFrom);
  const callsToDate = new Date(callsTo);

  const rc1ClientId = process.env.RC_CLIENT_ID || process.env.NEXT_PUBLIC_RC_CLIENT_ID;
  const rc1ClientSecret = process.env.RC_CLIENT_SECRET || process.env.NEXT_PUBLIC_RC_CLIENT_SECRET;
  const rc1Jwt = process.env.RC_JWT || process.env.NEXT_PUBLIC_RC_JWT;

  const users = [];
  let acc1Count = 0;
  if (rc1ClientId && rc1ClientSecret && rc1Jwt) {
    const acc1Users = await fetchAccount1Users(rc1ClientId, rc1ClientSecret, rc1Jwt);
    acc1Count = acc1Users.length;
    users.push(...acc1Users);
  }
  const acc2Users = await fetchAccount2Users();
  users.push(...acc2Users);

  const callRecordsByExt = {};
  const fetchCallsForUser = async (extId, rcToken) => {
    const sessionMap = new Map();
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const url = `${RC_BASE}/v1.0/account/~/extension/${encodeURIComponent(extId)}/call-log?view=Detailed&type=Voice&dateFrom=${encodeURIComponent(callsFrom)}&dateTo=${encodeURIComponent(callsTo)}&page=${page}&perPage=100`;
      let res = await fetch(url, { headers: { Authorization: `Bearer ${rcToken}` } });
      if (res.status === 429) {
        await sleep(RC_429_RETRY_MS);
        res = await fetch(url, { headers: { Authorization: `Bearer ${rcToken}` } });
      }
      if (!res.ok) break;
      const data = await res.json();
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

  let rc1Token = null;
  if (rc1ClientId && rc1ClientSecret && rc1Jwt) {
    rc1Token = await getAccount1Token(rc1ClientId, rc1ClientSecret, rc1Jwt);
  }
  let rc2Token = null;
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
  await Promise.all(acc1UserList.map((u) => (rc1Token ? fetchCallsForUser(u.id, rc1Token) : Promise.resolve())));
  await sleep(RC_DELAY_MS);
  await Promise.all(acc2UserList.map((u) => (rc2Token ? fetchCallsForUser(u.id, rc2Token) : Promise.resolve())));

  const callRecords = [];
  for (const m of Object.values(callRecordsByExt)) {
    for (const rec of m.values()) callRecords.push(rec);
  }

  const normalizeExt = (id) => String(id).replace(/\.0$/, '');
  const statsByUser = {};
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

  const leadsHeaders = bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {};
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
      const leadsUrl = `${appUrl}/api/monday/leads?user=${encodeURIComponent(mondayUser)}&dateFrom=${encodeURIComponent(dayFrom)}&dateTo=${encodeURIComponent(dayTo)}`;
      const leadsRes = await fetch(leadsUrl, { headers: leadsHeaders });
      if (!leadsRes.ok) continue;
      const leadsData = await leadsRes.json();
      const leads = leadsData.leads || [];
      for (const lead of leads) {
        s.leadsTotal += 1;
        if (lead.timing === 'On time') s.leadsOnTime += 1;
        else if (lead.timing === 'Late') s.leadsLate += 1;
        if (lead.status === 'Rejected') s.leadsRejected += 1;
      }
      await sleep(300);
    } catch {
      // continue
    }
  }

  let totalTalk = 0;
  let totalLeads = 0;
  let totalOnTime = 0;
  let totalLate = 0;
  let totalConnected = 0;
  let totalMissed = 0;
  let totalRejected = 0;
  const statsList = [];
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

  const aiReport =
    skipAI
      ? null
      : await fetchAIReport(statsList, {
          talk: totalTalk,
          total: totalLeads,
          onTime: totalOnTime,
          late: totalLate,
          connected: totalConnected,
          missed: totalMissed,
          rejected: totalRejected,
        });

  const reportDateStr = reportDate.toISOString().slice(0, 10);
  const { start } = getShiftHours(reportDate);
  const shiftLabel = start === 9 ? '9am–6pm' : '8am–5pm';
  const adviceByName = aiReport ? Object.fromEntries(aiReport.advice.map((a) => [a.name, a.advice])) : {};

  let msg = `📊 *HR Daily Report — ${reportDateStr}*\n`;
  msg += `Shift: ${shiftLabel} US Central (7pm–4am Tashkent)\n\n`;
  for (const s of statsList) {
    msg += `👤 *${s.name}*\n`;
    msg += `   Talk: ${s.talkMinutes} min | Leads: ${s.leadsTotal} total (${s.leadsOnTime} on-time, ${s.leadsLate} late) | Calls: ${s.callsConnected} connected, ${s.callsMissed} missed | Rejected: ${s.leadsRejected}\n`;
    const adv = adviceByName[s.name];
    if (adv) msg += `\n   💡 *Advice:* ${adv}\n`;
    msg += `\n`;
  }
  if (aiReport) {
    msg += `📋 *Daily Outcome*\n${aiReport.dailyOutcome}\n\n`;
  }
  msg += `📈 *TOTAL (5 users)*\n`;
  msg += `   Talk: ${totalTalk} min | Leads: ${totalLeads} total (${totalOnTime} on-time, ${totalLate} late) | Calls: ${totalConnected} connected, ${totalMissed} missed | Rejected: ${totalRejected}`;

  const TELEGRAM_MAX_LENGTH = 4096;
  if (msg.length > TELEGRAM_MAX_LENGTH) {
    msg = msg.slice(0, TELEGRAM_MAX_LENGTH - 20) + '\n\n...[truncated]';
  }

  const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' }),
  });

  if (!sendRes.ok) {
    const err = await sendRes.text();
    console.error('Telegram send failed:', err);
    process.exit(1);
  }
  console.log('Report sent successfully');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
