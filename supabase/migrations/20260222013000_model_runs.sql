create extension if not exists pgcrypto;

create table if not exists public.model_runs (
  run_id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  cycle_id text not null,
  root_problem_version_id text not null,
  thread_id text,
  participant_id uuid,
  action_type text not null check (action_type in ('guided_round', 'lab_brief_proposal')),
  provider text not null check (provider in ('deterministic', 'kimi')),
  model_name text not null,
  status text not null check (status in ('success', 'fallback')),
  prompt_contract_version text not null,
  latency_ms integer not null default 0,
  estimated_cost_usd numeric(12,6),
  fallback_reason text check (fallback_reason in ('TIMEOUT', 'RATE_LIMIT', 'SCHEMA', 'CAPACITY')),
  created_at timestamptz not null default timezone('utc', now()),
  constraint model_runs_cycle_fk
    foreign key (organization_id, cycle_id)
    references public.program_cycles (organization_id, cycle_id)
    on delete cascade,
  constraint model_runs_thread_fk
    foreign key (thread_id, cycle_id)
    references public.threads_runtime (thread_id, cycle_id)
    on delete cascade
);

create index if not exists model_runs_cycle_created_idx
  on public.model_runs (organization_id, cycle_id, created_at desc);

create index if not exists model_runs_status_idx
  on public.model_runs (status, provider, created_at desc);
