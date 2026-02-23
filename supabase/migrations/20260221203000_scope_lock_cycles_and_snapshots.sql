-- Scope lock foundation: Applied AI Labs umbrella + AI Fluency Lab cycle partitioning.
-- Adds organization/program cycle lineage to operational tables and introduces cycle/snapshot lifecycle tables.

create extension if not exists pgcrypto;

alter table public.event_ingest_log
  add column if not exists organization_id text not null default 'applied-ai-labs',
  add column if not exists program_cycle_id text not null default 'cycle-innovation-day-001',
  add column if not exists root_problem_version_id text not null default 'pilot-v1';

create index if not exists event_ingest_log_org_cycle_idx
  on public.event_ingest_log (organization_id, program_cycle_id, created_at desc);

alter table public.protected_action_audit
  add column if not exists organization_id text not null default 'applied-ai-labs',
  add column if not exists program_cycle_id text not null default 'cycle-innovation-day-001',
  add column if not exists root_problem_version_id text not null default 'pilot-v1';

create index if not exists protected_action_audit_org_cycle_idx
  on public.protected_action_audit (organization_id, program_cycle_id, created_at desc);

create table if not exists public.program_cycles (
  organization_id text not null,
  program_cycle_id text not null,
  root_problem_version_id text not null,
  state text not null check (state in ('draft', 'active', 'frozen', 'archived')),
  program_label text not null default 'AI Fluency Lab',
  created_by text,
  created_reason text,
  activated_at timestamptz,
  frozen_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, program_cycle_id)
);

create unique index if not exists program_cycles_single_active_idx
  on public.program_cycles (organization_id)
  where state = 'active';

create index if not exists program_cycles_state_idx
  on public.program_cycles (organization_id, state, updated_at desc);

create table if not exists public.cycle_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  program_cycle_id text not null,
  snapshot_state text not null check (snapshot_state in ('started', 'completed', 'failed', 'verified')),
  requested_by text,
  reason text,
  manifest_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint cycle_snapshots_program_fk
    foreign key (organization_id, program_cycle_id)
    references public.program_cycles (organization_id, program_cycle_id)
    on update cascade
    on delete restrict
);

create index if not exists cycle_snapshots_org_cycle_idx
  on public.cycle_snapshots (organization_id, program_cycle_id, created_at desc);

create table if not exists public.cycle_snapshot_artifacts (
  artifact_id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.cycle_snapshots(snapshot_id) on delete cascade,
  artifact_name text not null,
  artifact_kind text not null check (artifact_kind in ('db_export', 'notion_export', 'config_manifest', 'evidence_index', 'embed_bundle')),
  storage_pointer text not null,
  checksum_sha256 text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists cycle_snapshot_artifacts_snapshot_name_uidx
  on public.cycle_snapshot_artifacts (snapshot_id, artifact_name);

insert into public.program_cycles (
  organization_id,
  program_cycle_id,
  root_problem_version_id,
  state,
  program_label,
  created_by,
  created_reason
)
values (
  'applied-ai-labs',
  'cycle-innovation-day-001',
  'pilot-v1',
  'active',
  'AI Fluency Lab',
  'scope_lock_migration',
  'bootstrap active cycle for pilot'
)
on conflict (organization_id, program_cycle_id) do nothing;
