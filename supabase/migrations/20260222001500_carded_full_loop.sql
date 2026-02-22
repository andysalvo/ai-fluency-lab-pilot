-- Carded full-loop persistence for frontstage guided rounds + lab brief drafts.

create table if not exists public.guided_question_rounds (
  round_id uuid primary key default gen_random_uuid(),
  thread_id text not null,
  organization_id text not null,
  cycle_id text not null,
  root_problem_version_id text not null,
  participant_id uuid not null references public.participants(participant_id) on delete cascade,
  round_number integer not null check (round_number between 1 and 3),
  status text not null check (status in ('active', 'completed', 'maxed_out')),
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint guided_question_rounds_thread_fk
    foreign key (thread_id, cycle_id)
    references public.threads_runtime(thread_id, cycle_id)
    on delete cascade,
  unique (thread_id, cycle_id, round_number)
);

create index if not exists guided_question_rounds_cycle_idx
  on public.guided_question_rounds (cycle_id, thread_id);

create table if not exists public.guided_question_items (
  question_item_id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.guided_question_rounds(round_id) on delete cascade,
  thread_id text not null,
  organization_id text not null,
  cycle_id text not null,
  root_problem_version_id text not null,
  participant_id uuid not null references public.participants(participant_id) on delete cascade,
  ordinal integer not null check (ordinal between 1 and 5),
  prompt text not null,
  options_json jsonb not null,
  recommended_option text not null check (recommended_option in ('A', 'B', 'C', 'D')),
  selected_option text check (selected_option in ('A', 'B', 'C', 'D')),
  short_reason text,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guided_question_items_thread_fk
    foreign key (thread_id, cycle_id)
    references public.threads_runtime(thread_id, cycle_id)
    on delete cascade,
  unique (round_id, ordinal)
);

create index if not exists guided_question_items_round_idx
  on public.guided_question_items (round_id, ordinal);

create table if not exists public.lab_brief_drafts (
  draft_id uuid primary key default gen_random_uuid(),
  thread_id text not null,
  organization_id text not null,
  cycle_id text not null,
  root_problem_version_id text not null,
  participant_id uuid not null references public.participants(participant_id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'ready')),
  content_json jsonb not null default '{}'::jsonb,
  generation_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lab_brief_drafts_thread_fk
    foreign key (thread_id, cycle_id)
    references public.threads_runtime(thread_id, cycle_id)
    on delete cascade,
  unique (thread_id, cycle_id)
);

create index if not exists lab_brief_drafts_cycle_idx
  on public.lab_brief_drafts (cycle_id, thread_id);
