const MONDAY_API = 'https://api.monday.com/v2';

export async function mondayGraphql(query: string, variables?: Record<string, unknown>) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new Error('MONDAY_API_TOKEN is not set');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(MONDAY_API, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Monday API HTTP ${res.status}: ${JSON.stringify(data)}`);
    }
    if (data.errors?.length) {
      const msg = data.errors.map((e: { message?: string }) => e.message).filter(Boolean).join('; ');
      throw new Error(`Monday API: ${msg || JSON.stringify(data.errors)}`);
    }
    return data;
  } catch (err: unknown) {
    clearTimeout(timeout);
    if (err instanceof Error) {
      if (err.name === 'AbortError') throw new Error('Monday API timeout (30s). Check network.');
      if (err.message.includes('fetch failed'))
        throw new Error('Cannot reach Monday API. Check internet, firewall, or try a different network.');
    }
    throw err;
  }
}
