# HR Daily Report – GitHub Actions

The daily report runs in GitHub Actions (no Vercel timeout). Same data as the API route: RC calls, Monday leads, OpenAI, Telegram.

## Required GitHub Secrets

Add these in **Settings → Secrets and variables → Actions**:

| Secret | Required | Description |
|--------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | From @BotFather |
| `TELEGRAM_CHAT_ID` | Yes | Chat or group ID |
| `RC_CLIENT_ID` | Yes | RingCentral Account 1 |
| `RC_CLIENT_SECRET` | Yes | RingCentral Account 1 |
| `RC_JWT` | Yes | RingCentral Account 1 |
| `RC2_CLIENT_ID` | Yes | RingCentral Account 2 |
| `RC2_CLIENT_SECRET` | Yes | RingCentral Account 2 |
| `RC2_JWT` | Yes | RingCentral Account 2 |
| `OPENAI_API_KEY` | Yes | For AI outcome/advice |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Yes* | Copy from Vercel → Deployment Protection → Bypass. Needed so the script can call your `/api/monday/leads` |
| `APP_URL` | No | Default: `https://call-monitor-app.vercel.app` |

\* Required if Vercel Authentication / Deployment Protection is enabled. Otherwise the script cannot fetch Monday leads from your Vercel API.

## Schedule

- **Automatic:** Mon–Sat at 23:00 UTC (4am Tashkent)
- **Manual:** Actions → HR Daily Report → Run workflow (optional: `date`, `skip_ai`)

## Data

- **RC calls:** Fetched directly from RingCentral (same logic as API)
- **Monday leads:** Fetched via your Vercel `/api/monday/leads` (same data as dashboard)
- **AI:** Same OpenAI prompt as API route

No data is reduced or changed.
