# Startstreken

Results from Norwegian running races, with a profile per athlete. Next.js 16 + Prisma on Postgres (Supabase).

```bash
npm install
npm run dev          # http://localhost:3000
```

## Environment

| Variable | Needed for |
| --- | --- |
| `DATABASE_URL` | Postgres |
| `ADMIN_PASSWORD` | Login to `/admin/*`. Without it, admin is open in `next dev` and locked in production. |
| `ADMIN_SECRET` | Optional: separate key for signing admin sessions (defaults to `ADMIN_PASSWORD`). |
| `CRON_SECRET` | Lets the daily cron call `/api/cron/crawl` (Vercel sends it as `Authorization: Bearer …`). |
| `CRAWL_BUDGET_MS`, `CRAWL_LOOKBACK_DAYS` | Optional cron tuning (defaults 240 000 ms / 10 days). |
| `STRAVA_*`, `APP_URL` | Strava login. |

## Importing results

All imports go through one pipeline in `src/lib/import/`:

```
sources/{eqtiming,ultimate,raceresult}.ts   fetch + parse → NormalizedEvent (no DB access)
persist.ts                                  event/races/results, one transaction per race
athletes.ts                                 batched athlete matching (identity → name → new)
crawler.ts                                  discovery + queue processing
run.ts                                      importEvent(): fetch → persist → log → queue sync
```

**Manual:** `/admin/import` → paste a result-page link (or an id) → *Forhåndsvis* → *Importer*. Every
distance in the event is imported. Distances come from the source (EQ race km, Ultimate/RaceResult
labels), and gender/birth year are included when the source has them. For RaceResult, the key, lists
and contests are read automatically.

**Automatic:** once a day (`vercel.json`, 04:00 UTC) the crawler:

1. finds Norwegian running events from the last 10 days: EQ Timing (`/api/Events`, filtered by
   sport + country), RaceResult (event search, Norway + running) and Ultimate (front page list);
2. puts them in `import_queue`. Events already in the database are marked as imported;
   relays/uphill/other "maybe running" events wait under *Må vurderes*;
3. imports due events within the time budget, retries events without results every 12 h for up to
   21 days, and re-imports each new event once after 3 days to pick up corrections.

*Crawler & kø* in the admin has *Crawl nå*, *Prosesser kø*, historical backfill by date range, and
per-event import/approve/ignore. *Logg* shows every import and crawl run.

**Older Ultimate events:** Ultimate has no archive, country filter or dates, only sequential event
IDs. The *Ultimate-skanner* (under *Hent historikk…*, or `npm run crawl -- --scan-ultimate 5000-`)
checks each ID's number of Norwegian finishers. Events above the threshold go to *Må vurderes* with
an estimated date: taken from the title, from an earlier edition of the same race, or interpolated
from IDs you already have. Confirm the date, then approve.

**CLI** (no time limit, which suits big backfills). It reads `.env.local` / `.env`:

```bash
npm run crawl                                        # last 10 days + import the whole queue
npm run crawl -- --from 2024-01-01 --to 2024-12-31   # backfill a period
npm run crawl -- --import eqtiming:80410             # one event
npm run crawl -- --preview raceresult:258952         # parse only, no DB writes
```

Re-importing an event replaces its results but keeps admin edits (event name/date/place, race
names, distance overrides). Presets under *Presets* are applied on every import.

### Data maintenance

```bash
npx tsx --tsconfig tsconfig.json scripts/backfill-eq-distances.ts [--apply]   # fill in course lengths from EQ
npx tsx --tsconfig tsconfig.json scripts/fix-categories.ts [--apply]          # re-check 5K/10K/HM/M categories
```

Both do a dry run unless given `--apply`. `fix-categories` only changes a category on evidence: a known
distance, relay/trail/track wording, or an impossible time. It never touches admin overrides, presets or
para results.

### Database changes

The pipeline needs the tables in `prisma/sql/2026-09-28_import_pipeline.sql` (idempotent):

```bash
npx prisma db execute --file prisma/sql/2026-09-28_import_pipeline.sql --schema prisma/schema.prisma
npx prisma generate
```
