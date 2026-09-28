-- Import pipeline: discovery queue, crawl log and richer import log.
--
-- Idempotent — safe to run more than once. Run it in the Supabase SQL editor, or:
--   npx prisma db execute --file prisma/sql/2026-09-28_import_pipeline.sql --schema prisma/schema.prisma
-- then `npx prisma generate`.

-- Sources used by the importers (no-op if they already exist).
insert into public.sources (slug, name) values
  ('eqtiming',   'EQ Timing'),
  ('ultimate',   'Ultimate LIVE'),
  ('raceresult', 'RaceResult'),
  ('racedays',   'Racedays')
on conflict (slug) do nothing;

-- ── Discovery queue ─────────────────────────────────────────────────────────
-- One row per event seen at a timing provider. The crawler fills it; the queue
-- processor imports rows once the event has taken place and results exist.
create table if not exists public.import_queue (
  id               uuid primary key default gen_random_uuid(),
  source_slug      text not null,
  source_event_id  text not null,
  name             text,
  event_date       date,
  location         text,
  country          text,
  sport            text,
  -- running | maybe | irrelevant — decided automatically at discovery
  relevance        text not null default 'running',
  -- pending | importing | imported | waiting | no_results | failed | ignored
  status           text not null default 'pending',
  -- null = follow relevance (only "running" is imported automatically),
  -- true = approved by an admin, false = never import automatically
  approved         boolean,
  attempts         integer not null default 0,
  last_error       text,
  next_attempt_at  timestamptz not null default now(),
  last_attempt_at  timestamptz,
  locked_at        timestamptz,
  imported_at      timestamptz,
  refresh_at       timestamptz,
  result_count     integer,
  event_id         uuid references public.events(id) on delete set null,
  meta             jsonb,
  discovered_at    timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (source_slug, source_event_id)
);

create index if not exists import_queue_due_idx
  on public.import_queue (status, next_attempt_at);
create index if not exists import_queue_date_idx
  on public.import_queue (event_date desc);

-- ── Crawl log ───────────────────────────────────────────────────────────────
create table if not exists public.crawl_runs (
  id           uuid primary key default gen_random_uuid(),
  trigger      text not null,                -- cron | manual | backfill | cli
  status       text not null default 'started',
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  stats        jsonb,
  error        text
);

create index if not exists crawl_runs_started_idx
  on public.crawl_runs (started_at desc);

-- ── Import log (existing table, previously unused) ──────────────────────────
alter table public.import_runs add column if not exists trigger  text;
alter table public.import_runs add column if not exists event_id uuid;
alter table public.import_runs add column if not exists stats    jsonb;

create index if not exists import_runs_started_idx
  on public.import_runs (started_at desc);
