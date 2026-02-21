-- Cycle isolation first: cycle_id as hard boundary, identity vs membership split, and cycle-aware controls.

create extension if not exists pgcrypto;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'event_ingest_log' and column_name = 'program_cycle_id'
  ) then
    alter table public.event_ingest_log rename column program_cycle_id to cycle_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'protected_action_audit' and column_name = 'program_cycle_id'
  ) then
    alter table public.protected_action_audit rename column program_cycle_id to cycle_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'program_cycles' and column_name = 'program_cycle_id'
  ) then
    alter table public.program_cycles rename column program_cycle_id to cycle_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'program_cycles' and column_name = 'frozen_at'
  ) then
    alter table public.program_cycles rename column frozen_at to locked_at;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cycle_snapshots' and column_name = 'program_cycle_id'
  ) then
    alter table public.cycle_snapshots rename column program_cycle_id to cycle_id;
  end if;
end $$;

alter table if exists public.event_ingest_log
  add column if not exists cycle_id text;

update public.event_ingest_log
set cycle_id = coalesce(cycle_id, 'cycle-innovation-day-001')
where cycle_id is null;

alter table if exists public.event_ingest_log
  alter column cycle_id set not null,
  alter column cycle_id drop default;

alter table if exists public.protected_action_audit
  add column if not exists cycle_id text;

update public.protected_action_audit
set cycle_id = coalesce(cycle_id, 'cycle-innovation-day-001')
where cycle_id is null;

alter table if exists public.protected_action_audit
  alter column cycle_id set not null,
  alter column cycle_id drop default;

alter table if exists public.program_cycles
  add column if not exists focus_snapshot text not null default 'How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?';

update public.program_cycles
set state = 'locked'
where state = 'frozen';

alter table if exists public.program_cycles
  drop constraint if exists program_cycles_state_check;

alter table if exists public.program_cycles
  add constraint program_cycles_state_check check (state in ('draft', 'active', 'locked', 'archived'));

alter table if exists public.runtime_control
  add column if not exists global_protected_actions_halt boolean not null default false,
  add column if not exists halt_reason text;

create table if not exists public.cycle_control (
  organization_id text not null,
  cycle_id text not null,
  protected_actions_halt boolean not null default false,
  halt_reason text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, cycle_id),
  constraint cycle_control_cycle_fk
    foreign key (organization_id, cycle_id)
    references public.program_cycles (organization_id, cycle_id)
    on update cascade
    on delete cascade
);

create table if not exists public.participants (
  participant_id uuid primary key default gen_random_uuid(),
  email_canonical text not null unique,
  global_state text not null check (global_state in ('active', 'blocked')),
  global_role text not null check (global_role in ('member', 'operator', 'admin')) default 'member',
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.cycle_memberships (
  participant_id uuid not null references public.participants(participant_id) on delete cascade,
  organization_id text not null,
  cycle_id text not null,
  role text not null check (role in ('student', 'moderator', 'facilitator', 'operator')),
  membership_state text not null check (membership_state in ('invited', 'active', 'inactive', 'revoked')),
  credits integer not null default 1 check (credits >= 0),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (participant_id, organization_id, cycle_id),
  constraint cycle_memberships_cycle_fk
    foreign key (organization_id, cycle_id)
    references public.program_cycles (organization_id, cycle_id)
    on update cascade
    on delete cascade
);

create unique index if not exists cycle_memberships_one_active_per_participant_idx
  on public.cycle_memberships (participant_id)
  where membership_state = 'active';

create table if not exists public.participant_session_context (
  participant_id uuid primary key references public.participants(participant_id) on delete cascade,
  active_cycle_id text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.threads_runtime (
  thread_id text not null,
  organization_id text not null,
  cycle_id text not null,
  root_problem_version_id text not null,
  owner_participant_id uuid not null references public.participants(participant_id) on delete restrict,
  status text not null check (status in ('processing', 'ready', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (thread_id, cycle_id),
  constraint threads_runtime_cycle_fk
    foreign key (organization_id, cycle_id)
    references public.program_cycles (organization_id, cycle_id)
    on update cascade
    on delete restrict
);

create unique index if not exists threads_runtime_thread_id_uidx
  on public.threads_runtime (thread_id);

create table if not exists public.source_submissions (
  source_submission_id uuid primary key default gen_random_uuid(),
  thread_id text not null,
  organization_id text not null,
  cycle_id text not null,
  root_problem_version_id text not null,
  participant_id uuid not null references public.participants(participant_id) on delete restrict,
  raw_url text not null,
  canonical_url text not null,
  canonical_url_hash text not null,
  canonicalizer_version smallint not null default 1,
  relevance_note text not null,
  possible_duplicate boolean not null default false,
  created_at timestamptz not null default now(),
  constraint source_submissions_thread_fk
    foreign key (thread_id, cycle_id)
    references public.threads_runtime (thread_id, cycle_id)
    on update cascade
    on delete cascade
);

create index if not exists source_submissions_cycle_canonical_idx
  on public.source_submissions (cycle_id, canonical_url_hash);

create table if not exists public.starter_briefs (
  starter_brief_id uuid primary key default gen_random_uuid(),
  source_submission_id uuid not null references public.source_submissions(source_submission_id) on delete cascade,
  thread_id text not null,
  organization_id text not null,
  cycle_id text not null,
  root_problem_version_id text not null,
  status text not null check (status in ('processing', 'ready', 'failed_fetch', 'failed_generation')),
  payload_json jsonb not null default '{}'::jsonb,
  replay_payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint starter_briefs_thread_fk
    foreign key (thread_id, cycle_id)
    references public.threads_runtime (thread_id, cycle_id)
    on update cascade
    on delete cascade
);

create table if not exists public.readiness_evaluations (
  readiness_eval_id uuid primary key default gen_random_uuid(),
  thread_id text not null,
  organization_id text not null,
  cycle_id text not null,
  root_problem_version_id text not null,
  participant_id uuid references public.participants(participant_id) on delete set null,
  readiness_claim boolean not null,
  readiness_value boolean not null,
  readiness_difference boolean not null,
  explicit_confirmation boolean not null,
  ready_to_publish boolean not null,
  reason_code text not null,
  created_at timestamptz not null default now(),
  constraint readiness_evaluations_thread_fk
    foreign key (thread_id, cycle_id)
    references public.threads_runtime (thread_id, cycle_id)
    on update cascade
    on delete cascade
);

create table if not exists public.lab_record_entries (
  lab_record_id uuid primary key default gen_random_uuid(),
  thread_id text not null,
  organization_id text not null,
  cycle_id text not null,
  root_problem_version_id text not null,
  participant_id uuid not null references public.participants(participant_id) on delete restrict,
  version integer not null check (version >= 1),
  content_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lab_record_entries_thread_fk
    foreign key (thread_id, cycle_id)
    references public.threads_runtime (thread_id, cycle_id)
    on update cascade
    on delete cascade,
  unique (thread_id, cycle_id, version)
);

create table if not exists public.action_response_replay (
  idempotency_key text primary key,
  action_type text not null,
  organization_id text not null,
  cycle_id text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.protected_action_audit
  add column if not exists participant_id uuid references public.participants(participant_id) on delete set null,
  add column if not exists membership_state text not null default 'inactive' check (membership_state in ('invited', 'active', 'inactive', 'revoked')),
  add column if not exists global_state text not null default 'active' check (global_state in ('active', 'blocked')),
  add column if not exists client_request_id text;

insert into public.cycle_control (organization_id, cycle_id, protected_actions_halt, updated_at)
select organization_id, cycle_id, false, now()
from public.program_cycles
on conflict (organization_id, cycle_id) do nothing;
