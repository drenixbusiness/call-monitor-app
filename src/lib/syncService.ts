import db from './db';

type Credentials = {
  clientId: string;
  clientSecret: string;
  jwt: string;
  account: string;
};

type SyncJob = {
  type: 'initial' | 'historical';
  dateFrom: string;
  dateTo: string;
  rangeName: string;
  account: string;
};

const globalAny = global as any;

if (!globalAny.syncState) {
  globalAny.syncState = {
    isProcessing: false,
    queue: [] as SyncJob[],
    lastRequestTime: 0,
    tokens: {} as Record<string, string>,
    credentialsMap: {} as Record<string, Credentials>,
    status: 'idle' as 'idle' | 'syncing' | 'ready',
    currentRange: '',
    completedRanges: [] as string[]
  };
}

const state = globalAny.syncState;
const DELAY_BETWEEN_REQUESTS = 1200;

export function getSyncStatus() {
  return {
    status: state.status,
    range: state.currentRange,
    isProcessing: state.isProcessing,
    completedRanges: state.completedRanges
  };
}

function buildJobs(account: string): SyncJob[] {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const sevenDays = new Date(now);
  sevenDays.setDate(sevenDays.getDate() - 7);

  const thirtyDays = new Date(now);
  thirtyDays.setDate(thirtyDays.getDate() - 30);

  const oneYear = new Date(now);
  oneYear.setFullYear(oneYear.getFullYear() - 1);

  return [
    { type: 'initial', dateFrom: todayStart.toISOString(), dateTo: now.toISOString(), rangeName: `today_${account}`, account },
    { type: 'historical', dateFrom: sevenDays.toISOString(), dateTo: todayStart.toISOString(), rangeName: `weekly_${account}`, account },
    { type: 'historical', dateFrom: thirtyDays.toISOString(), dateTo: sevenDays.toISOString(), rangeName: `monthly_${account}`, account },
    { type: 'historical', dateFrom: oneYear.toISOString(), dateTo: thirtyDays.toISOString(), rangeName: `yearly_${account}`, account },
  ];
}

export function initializeSync(credentials: Omit<Credentials, 'account'>) {
  // Account 1
  state.credentialsMap['account1'] = { ...credentials, account: 'account1' };
  state.queue = [];
  state.completedRanges = [];

  state.queue.push(...buildJobs('account1'));

  // Account 2 — hardcoded from env
  const rc2ClientId = process.env.RC2_CLIENT_ID;
  const rc2ClientSecret = process.env.RC2_CLIENT_SECRET;
  const rc2Jwt = process.env.RC2_JWT;

  if (rc2ClientId && rc2ClientSecret && rc2Jwt) {
    state.credentialsMap['account2'] = {
      clientId: rc2ClientId,
      clientSecret: rc2ClientSecret,
      jwt: rc2Jwt,
      account: 'account2'
    };
    state.queue.push(...buildJobs('account2'));
  }

  if (!state.isProcessing) {
    processQueue();
  }
}

async function getAccessToken(account: string): Promise<string> {
  if (state.tokens[account]) return state.tokens[account];
  const creds = state.credentialsMap[account];
  if (!creds) throw new Error(`No credentials for ${account}`);

  const { clientId, clientSecret, jwt } = creds;
  const encodedAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.append('assertion', jwt);

  const response = await fetch('https://platform.ringcentral.com/restapi/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${encodedAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) throw new Error(`Failed to obtain token for ${account}`);

  const data = await response.json();
  state.tokens[account] = data.access_token;
  return state.tokens[account];
}

async function processQueue() {
  if (state.queue.length === 0) {
    state.status = 'ready';
    state.currentRange = '';
    state.isProcessing = false;
    return;
  }

  state.isProcessing = true;
  state.status = 'syncing';

  const job = state.queue.shift()!;
  state.currentRange = job.rangeName;

  try {
    const token = await getAccessToken(job.account);
    let page = 1;
    let hasMorePages = true;
    let consecutive429s = 0;
    const baseRetryDelay = 60000;

    while (hasMorePages) {
      const timeSinceLast = Date.now() - state.lastRequestTime;
      if (timeSinceLast < DELAY_BETWEEN_REQUESTS) {
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS - timeSinceLast));
      }

      state.lastRequestTime = Date.now();
      const url = `https://platform.ringcentral.com/restapi/v1.0/account/~/call-log?view=Detailed&dateFrom=${job.dateFrom}&dateTo=${job.dateTo}&perPage=100&page=${page}`;

      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });

      if (res.status === 429) {
        consecutive429s++;
        const retryAfter = res.headers.get('retry-after') || res.headers.get('x-rate-limit-window');
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : baseRetryDelay * Math.pow(2, consecutive429s - 1);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      consecutive429s = 0;

      if (res.status === 401) {
        delete state.tokens[job.account];
        await getAccessToken(job.account);
        continue;
      }

      if (!res.ok) {
        console.error(`[Queue] API error ${res.status}`);
        break;
      }

      const data = await res.json();
      const records = data.records || [];

      for (const call of records) {
        try {
          const fromNum = call.from?.phoneNumber || call.from?.extensionNumber || '';
          const toNum = call.to?.phoneNumber || call.to?.extensionNumber || '';
          const extId = call.extension?.id || '';

          await db.prepare(`
            INSERT INTO calls 
            (id, call_id, from_number, to_number, direction, result, user_extension, start_time, duration, recording_url, account)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (id) DO NOTHING
          `).run([
            `${call.id}-${call.sessionId}`,
            call.id,
            fromNum,
            toNum,
            call.direction,
            call.result,
            extId,
            call.startTime,
            call.duration,
            call.recording?.contentUri || '',
            job.account
          ]);
        } catch (err) {
          console.error('[Queue] Failed to insert call:', err);
        }
      }

      hasMorePages = records.length === 100;
      page++;
    }

    state.completedRanges.push(job.rangeName);
  } catch (err) {
    console.error('[Queue] Error processing job:', err);
  }

  setTimeout(processQueue, 0);
}