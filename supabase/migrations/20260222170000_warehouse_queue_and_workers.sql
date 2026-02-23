-- Warehouse v1: fast webhook enqueue + async workers (Notion fetch + embeddings)

create extension if not exists pgcrypto;

-- Queue table for ingest jobs (idempotent, retryable).
create table if not exists public.warehouse_idea_ingest_jobs (
  job_id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  notion_page_id text not null,
  source_table text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  organization_id text not null,
  cycle_id text not null,
  root_problem_version_id text not null,
  status text not null check (status in ('queued', 'processing', 'done', 'ignored', 'failed')) default 'queued',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists warehouse_idea_jobs_queue_idx
  on public.warehouse_idea_ingest_jobs (status, next_attempt_at asc, created_at asc);

create index if not exists warehouse_idea_jobs_notion_idx
  on public.warehouse_idea_ingest_jobs (notion_page_id, created_at desc);

create or replace function public.warehouse_jobs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_warehouse_jobs_set_updated_at on public.warehouse_idea_ingest_jobs;
create trigger trg_warehouse_jobs_set_updated_at
before update on public.warehouse_idea_ingest_jobs
for each row
execute function public.warehouse_jobs_set_updated_at();

-- Allow an explicit processing state for embeddings (worker claims).
do $$
declare
  constraint_name text;
begin
  select c.conname
  into constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'idea_embeddings'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%embedding_status%';

  if constraint_name is not null then
    execute format('alter table public.idea_embeddings drop constraint %I', constraint_name);
  end if;
end $$;

alter table if exists public.idea_embeddings
  add constraint idea_embeddings_embedding_status_check
  check (embedding_status in ('pending', 'processing', 'ready', 'failed'));

create index if not exists idea_embeddings_status_updated_processing_idx
  on public.idea_embeddings (embedding_status, updated_at asc);

-- Enqueue: validate -> dedupe -> persist -> enqueue, without external calls.
-- Returns (deduped, event_id, job_id).
create or replace function public.warehouse_enqueue_idea_job(
  p_idempotency_key text,
  p_source_table text,
  p_source_record_id text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_organization_id text,
  p_cycle_id text,
  p_root_problem_version_id text
)
returns table (
  deduped boolean,
  event_id uuid,
  job_id uuid
)
language plpgsql
security definer
as $$
declare
  inserted_event_id uuid;
  existing_event_id uuid;
  inserted_job_id uuid;
begin
  inserted_event_id := null;
  existing_event_id := null;

  -- Insert if new; concurrent requests become safe no-ops (no unique_violation).
  insert into public.event_ingest_log (
    source_record_id,
    source_table,
    event_type,
    idempotency_key,
    ingest_state,
    created_at,
    processed_at,
    details_json,
    organization_id,
    cycle_id,
    root_problem_version_id
  ) values (
    p_source_record_id,
    p_source_table,
    p_event_type,
    p_idempotency_key,
    'processed',
    now(),
    now(),
    jsonb_build_object('warehouse_enqueued', true),
    p_organization_id,
    p_cycle_id,
    p_root_problem_version_id
  )
  on conflict (idempotency_key) do nothing
  returning public.event_ingest_log.event_id into inserted_event_id;

  if inserted_event_id is null then
    -- Dedupe on event_ingest_log.idempotency_key (unique).
    select e.event_id into existing_event_id
    from public.event_ingest_log e
    where e.idempotency_key = p_idempotency_key
    limit 1;
  end if;

  insert into public.warehouse_idea_ingest_jobs (
    idempotency_key,
    notion_page_id,
    source_table,
    event_type,
    occurred_at,
    organization_id,
    cycle_id,
    root_problem_version_id,
    status,
    next_attempt_at
  ) values (
    p_idempotency_key,
    p_source_record_id,
    p_source_table,
    p_event_type,
    p_occurred_at,
    p_organization_id,
    p_cycle_id,
    p_root_problem_version_id,
    'queued',
    now()
  )
  on conflict (idempotency_key) do update
    set next_attempt_at = least(public.warehouse_idea_ingest_jobs.next_attempt_at, excluded.next_attempt_at),
        status = 'queued'
    where public.warehouse_idea_ingest_jobs.status = 'failed'
  returning public.warehouse_idea_ingest_jobs.job_id into inserted_job_id;

  if inserted_job_id is null then
    select j.job_id into inserted_job_id
    from public.warehouse_idea_ingest_jobs j
    where j.idempotency_key = p_idempotency_key
    limit 1;
  end if;

  if inserted_event_id is not null then
    update public.event_ingest_log
    set details_json = coalesce(details_json, '{}'::jsonb) || jsonb_build_object('job_id', inserted_job_id)
    where event_id = inserted_event_id;
  end if;

  return query select (inserted_event_id is null), coalesce(inserted_event_id, existing_event_id), inserted_job_id;
end;
$$;

-- Claim a batch of queued jobs for processing (SKIP LOCKED).
create or replace function public.warehouse_claim_idea_ingest_jobs(
  p_limit integer,
  p_worker text
)
returns setof public.warehouse_idea_ingest_jobs
language sql
security definer
as $$
  with target as (
    select job_id
    from public.warehouse_idea_ingest_jobs
    where status = 'queued'
      and next_attempt_at <= now()
    order by next_attempt_at asc, created_at asc
    limit greatest(p_limit, 0)
    for update skip locked
  )
  update public.warehouse_idea_ingest_jobs j
  set status = 'processing',
      locked_at = now(),
      locked_by = p_worker,
      attempt_count = j.attempt_count + 1,
      last_error_code = null,
      last_error_message = null
  where j.job_id in (select job_id from target)
  returning j.*;
$$;

-- Transaction-safe versioning insert for idea entries.
create or replace function public.insert_idea_entry_version(
  p_notion_page_id text,
  p_participant_key text,
  p_organization_id text,
  p_cycle_id text,
  p_root_problem_version_id text,
  p_focus_id text,
  p_focus_text_snapshot text,
  p_idea_text_raw text,
  p_idea_text_norm text,
  p_notion_last_edited_time timestamptz,
  p_source_event_key text
)
returns public.idea_entries
language plpgsql
security definer
as $$
declare
  existing public.idea_entries%rowtype;
  inserted public.idea_entries%rowtype;
  next_version integer;
begin
  perform pg_advisory_xact_lock(hashtext(p_notion_page_id));

  select * into existing
  from public.idea_entries
  where source_event_key = p_source_event_key
  limit 1;

  if found then
    return existing;
  end if;

  select coalesce(max(version_no), 0) + 1 into next_version
  from public.idea_entries
  where notion_page_id = p_notion_page_id;

  insert into public.idea_entries (
    notion_page_id,
    version_no,
    participant_key,
    organization_id,
    cycle_id,
    root_problem_version_id,
    focus_id,
    focus_text_snapshot,
    idea_text_raw,
    idea_text_norm,
    notion_last_edited_time,
    source_event_key
  ) values (
    p_notion_page_id,
    next_version,
    p_participant_key,
    p_organization_id,
    p_cycle_id,
    p_root_problem_version_id,
    p_focus_id,
    p_focus_text_snapshot,
    p_idea_text_raw,
    p_idea_text_norm,
    p_notion_last_edited_time,
    p_source_event_key
  )
  returning * into inserted;

  return inserted;
end;
$$;

-- Claim embeddings for processing (SKIP LOCKED).
create or replace function public.warehouse_claim_embeddings(
  p_limit integer,
  p_worker text
)
returns table (
  entry_version_id uuid,
  idea_text_norm text,
  embedding_model text
)
language sql
security definer
as $$
  with target as (
    select e.entry_version_id
    from public.idea_embeddings e
    where e.embedding_status in ('pending', 'failed')
    order by e.updated_at asc
    limit greatest(p_limit, 0)
    for update skip locked
  ),
  claimed as (
    update public.idea_embeddings e
    set embedding_status = 'processing',
        updated_at = now(),
        error_code = null
    where e.entry_version_id in (select entry_version_id from target)
    returning e.entry_version_id, e.embedding_model
  )
  select c.entry_version_id, i.idea_text_norm, c.embedding_model
  from claimed c
  join public.idea_entries i on i.entry_version_id = c.entry_version_id;
$$;

-- Simple ops views.
create or replace view public.warehouse_idea_jobs_backlog as
select
  status,
  count(*)::bigint as job_count,
  min(next_attempt_at) as next_due_at,
  max(created_at) as newest_job_at
from public.warehouse_idea_ingest_jobs
group by 1
order by 1;

create or replace view public.warehouse_embeddings_backlog as
select
  embedding_status,
  count(*)::bigint as embedding_count,
  min(updated_at) as oldest_updated_at,
  max(updated_at) as newest_updated_at
from public.idea_embeddings
group by 1
order by 1;
