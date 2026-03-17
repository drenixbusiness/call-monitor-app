# Telegram Daily HR Recruiter Report Bot

## Overview

A Telegram bot that sends a daily summary of 5 HR recruiters (excluding 2 Safety users) every work day at **4:00 AM Tashkent time** (shift end). The report includes:

- **Per user:** Talk time (minutes), leads late/on-time, calls missed/connected, leads rejected
- **Daily outcome:** AI-generated summary of who worked and what they accomplished (requires `OPENAI_API_KEY`)
- **Advice:** AI-generated tips for each recruiter to finish their shift successfully (requires `OPENAI_API_KEY`)
- **Total:** Aggregate of all 5 users

---

## Step 1: Create the Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a name (e.g. `HR Daily Report`)
4. Choose a username (e.g. `hr_daily_report_bot`) — must end in `bot`
5. **Save the token** (e.g. `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)

---

## Step 2: Add Bot to Your Group & Get Chat ID

1. Create a Telegram group (or use existing) for HR reports
2. Add your bot to the group (search by username, add as member)
3. Send any message in the group (e.g. `hello`)
4. Open in browser:  
   `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
5. Find `"chat":{"id":-1234567890}` — that negative number is your **Chat ID**
6. **Save the Chat ID**

---

## Step 3: Environment Variables

Add to `.env.local` (and your hosting provider, e.g. Vercel):

```env
# Required for Telegram
TELEGRAM_BOT_TOKEN=7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_CHAT_ID=-1234567890

# Required for account1 users (Ethan, Fred) - same as your RingCentral app credentials
RC_CLIENT_ID=your_rc_client_id
RC_CLIENT_SECRET=your_rc_client_secret
RC_JWT=your_rc_jwt

# Already set for account2 (Winston, Alex, Jessica)
RC2_CLIENT_ID=...
RC2_CLIENT_SECRET=...
RC2_JWT=...

# Optional: restrict cron to authorized callers only
CRON_SECRET=your_random_secret_string

# Optional: AI-generated daily outcome and per-user advice (uses gpt-4o-mini)
OPENAI_API_KEY=sk-...
```

**Note:** `RC_CLIENT_ID`, `RC_CLIENT_SECRET`, `RC_JWT` are your main RingCentral app credentials (account1). If not set, the report will only include account2 users (Winston, Alex, Jessica) and will skip Ethan and Fred.

**Note:** If `OPENAI_API_KEY` is not set, the report will still be sent but without the "Daily Outcome" and "Advice" sections.

---

## Step 4: Timezone & Schedule

- **Tashkent** = UTC+5 (no DST)
- **4:00 AM Tashkent** = **23:00 UTC** (previous calendar day)
- Shift: 7pm–4am Tashkent = 8am–5pm US Central (same calendar day)
- Report at 4am covers the shift that just ended

**Cron expression (UTC):** `0 23 * * 1-6`  
(Run at 23:00 UTC, Mon–Sat; skip Sunday)

---

## Step 5: Data Sources & User Mapping

| Monday User | RC User (RingCentral) | Account |
|-------------|------------------------|---------|
| Alex Chester | Alex Chester | account2 |
| Fred | Fred Royce | account1 |
| Ethan | Ethan Parker | account1 |
| Winston | Winston Smith | account2 |
| Jessica | Jessica Miller | account2 |

**Excluded (Safety):** Tony Safety Department, Henry Safety Department

---

## Step 6: Implementation Checklist

1. **New API route** `POST /api/telegram/daily-report`
   - Fetches 5 HR users (extension IDs from account1 + account2)
   - Calls `/api/calls` with `range=custom&dateFrom=&dateTo=` for shift window (8am–5pm US Central)
   - Calls `/api/monday/leads?user=X` for each of Alex Chester, Fred, Ethan, Winston, Jessica
   - Computes: talk time (min), late/on-time leads, missed/connected calls, rejected leads
   - Sends formatted message via Telegram Bot API

2. **Monday API extension** (if needed)
   - Current Monday API returns "this month" only
   - For daily report, add optional `dateFrom` / `dateTo` query params to filter leads by lead arrival date

3. **Cron job**
   - Vercel: add `vercel.json` with `crons` pointing to `/api/telegram/daily-report`
   - Or external cron (e.g. cron-job.org) hitting your deployed URL daily at 23:00 UTC

4. **Shift date logic**
   - When cron runs at 23:00 UTC: report date = same UTC date (e.g. Mar 16 23:00 UTC → report for Mar 16 8am–5pm US Central)
   - US Central shift: 8am–5pm CST / 9am–6pm CDT

---

## Step 7: Report Message Format (Example)

```
📊 HR Daily Report — Mar 16, 2026
Shift: 8am–5pm US Central (7pm–4am Tashkent)

👤 Alex Chester
   Talk: 87 min | Leads: 12 on-time, 3 late | Calls: 45 connected, 2 missed | Rejected: 1

👤 Fred Royce
   Talk: 92 min | Leads: 8 on-time, 1 late | Calls: 38 connected, 1 missed | Rejected: 0
...

📋 Daily Outcome
[AI-generated summary of who worked and what they accomplished]

💡 Advice
👤 Alex Chester: [personalized tips]
👤 Fred Royce: [personalized tips]
...

📈 TOTAL (5 users)
   Talk: 412 min | Leads: 52 on-time, 8 late | Calls: 198 connected, 5 missed | Rejected: 3
```

---

## Step 8: Vercel Cron

The project includes `vercel.json` with the cron already configured. After deploying to Vercel:

1. Add all env vars in Vercel Project Settings → Environment Variables
2. (Optional) Set `CRON_SECRET` in Vercel — Vercel will send `Authorization: Bearer <CRON_SECRET>` when invoking the cron
3. The cron runs at **23:00 UTC** = **4:00 AM Tashkent** (Mon–Sat)

**Manual test:** `GET /api/telegram/daily-report` — if `CRON_SECRET` is set, add header: `Authorization: Bearer <your-secret>`

---

## Data Alignment with Dashboard

The Telegram bot uses the **same data logic** as the dashboard:

- **Calls:** Fetches `range=all` from `/api/calls`, then filters by shift window (8am–5pm US Central) and applies the same rules: Missed calls always count; connected calls (Accepted/Call connected) only count if duration ≥ 20 seconds.
- **Leads:** Uses full calendar day (00:00–23:59 US Central) for the report date when calling `/api/monday/leads`, matching the dashboard’s “today” filter for leads with date-only columns.

**Important:** The cron runs on the deployed app (e.g. Vercel). Ensure the dashboard is opened and synced on the **deployed URL** (not only localhost) so the database has recent call data when the cron runs.
