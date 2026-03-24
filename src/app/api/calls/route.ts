import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getServerDeployAccount } from '@/lib/deployAccount';

function accountWhereSql(account: 'account1' | 'account2'): string {
  // Legacy rows may lack `account`; treat those as account1 (BP).
  if (account === 'account1') {
    return ` AND (account = 'account1' OR account IS NULL)`;
  }
  return ` AND account = 'account2'`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = searchParams.get('range') || 'all';
  const extensionIds = searchParams.get('extensionIds')?.split(',') || [];

  const deploy = getServerDeployAccount();
  let accountFilter: 'account1' | 'account2' | null = deploy;
  if (!accountFilter) {
    const q = searchParams.get('account');
    if (q === 'account1' || q === 'account2') accountFilter = q;
  }
  const accountSql = accountFilter ? accountWhereSql(accountFilter) : '';

  if (!extensionIds.length) {
    return NextResponse.json({ error: 'Missing extensionIds' }, { status: 400 });
  }

  const now = new Date();
  let dateFrom: Date | null = null;
  let dateTo: Date | null = null;

  if (range === 'daily') {
    dateFrom = new Date(now);
    dateFrom.setDate(now.getDate() - 1);
  } else if (range === 'weekly') {
    dateFrom = new Date(now);
    dateFrom.setDate(now.getDate() - 7);
  } else if (range === 'monthly') {
    dateFrom = new Date(now);
    dateFrom.setMonth(now.getMonth() - 1);
  } else if (range === 'yearly') {
    dateFrom = new Date(now);
    dateFrom.setFullYear(now.getFullYear() - 1);
  } else if (range === 'custom') {
    const from = searchParams.get('dateFrom');
    const to = searchParams.get('dateTo');
    if (from) dateFrom = new Date(from);
    if (to) dateTo = new Date(to);
  }

  const normalizeExtId = (id: string) => id.replace(/\.0$/, '');
  const normalizedIds = extensionIds.map(normalizeExtId);

  try {
    let rows: any[];

    if (dateFrom || dateTo) {
      const conditions: string[] = ['REPLACE(user_extension, \'.0\', \'\') = ANY($1::text[])'];
      const params: (string | string[])[] = [normalizedIds];
      let idx = 2;
      if (dateFrom) {
        conditions.push(`start_time >= $${idx}`);
        params.push(dateFrom.toISOString());
        idx++;
      }
      if (dateTo) {
        conditions.push(`start_time <= $${idx}`);
        params.push(dateTo.toISOString());
      }
      const query = `
        SELECT * FROM calls 
        WHERE ${conditions.join(' AND ')}${accountSql}
        ORDER BY (start_time::timestamptz) DESC NULLS LAST
      `;
      const result = await db.prepare(query).all(params as [string[], ...string[]]);
      rows = result;
    } else {
      const query = `
        SELECT * FROM calls 
        WHERE REPLACE(user_extension, '.0', '') = ANY($1::text[])${accountSql}
        ORDER BY (start_time::timestamptz) DESC NULLS LAST
      `;
      const result = await db.prepare(query).all([normalizedIds]);
      rows = result;
    }

    const MAX_PER_EXTENSION = 500;
    const perExtensionCount: Record<string, number> = {};

    const limitedRows = rows.filter((r: any) => {
      const ext = normalizeExtId(String(r.user_extension));
      const current = perExtensionCount[ext] ?? 0;
      if (current >= MAX_PER_EXTENSION) return false;
      perExtensionCount[ext] = current + 1;
      return true;
    });

    const records = limitedRows.map((r: any) => ({
      id: r.call_id,
      direction: r.direction,
      result: r.result,
      startTime: r.start_time,
      duration: r.duration,
      from: { phoneNumber: r.from_number },
      to: { phoneNumber: r.to_number },
      extension: { id: normalizeExtId(String(r.user_extension)) }
    }));

    return NextResponse.json({ records, total: records.length });
  } catch (error: any) {
    console.error('Database error:', error);
    return NextResponse.json({ error: 'Failed to fetch calls' }, { status: 500 });
  }
}
