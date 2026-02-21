-- Slice 2 runtime persistence bootstrap (pilot)
-- Purpose: back ingest dedupe, protected action audit, and ingress mode source-of-truth.

create extension if not exists pgcrypto;

create table if not exists public.event_ingest_log (
  event_id uuid primary key default gen_random_uuid(),
  source_record_id text not null,
  source_table text not null,
  event_type text not null,
  idempotency_key text not null unique,
  ingest_state text not null check (ingest_state in ('received', 'validated', 'processed', 'failed', 'duplicate')),
  error_code text,
  details_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists event_ingest_log_created_at_idx on public.event_ingest_log (created_at desc);

create table if not exists public.protected_action_audit (
  audit_id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('run_local', 'run_system', 'compare', 'publish', 'credit_adjust', 'scope_grant', 'admin_override')),
  actor_email text,
  allowlist_state text not null check (allowlist_state in ('allowlisted', 'active', 'suspended', 'revoked')),
  role text not null check (role in ('student', 'moderator', 'facilitator', 'operator')),
  allowed boolean not null,
  reason_code text not null,
  thread_id text,
  why text,
  linked_event_id uuid references public.event_ingest_log(event_id),
  linked_idempotency_key text,
  created_at timestamptz not null default now()
);

create index if not exists protected_action_audit_created_at_idx on public.protected_action_audit (created_at desc);
create index if not exists protected_action_audit_action_idx on public.protected_action_audit (action);

create table if not exists public.runtime_control (
  control_id smallint primary key check (control_id = 1),
  active_ingress_mode text not null check (active_ingress_mode in ('supabase_edge', 'vercel_fallback')),
  mode_updated_by text,
  mode_updated_reason text,
  updated_at timestamptz not null default now()
);

insert into public.runtime_control (control_id, active_ingress_mode, mode_updated_by, mode_updated_reason)
values (1, 'supabase_edge', 'slice2_migration', 'bootstrap default')
on conflict (control_id) do nothing;
