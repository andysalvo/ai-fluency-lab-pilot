-- Idea Warehouse v1: Notion form intake -> versioned entries -> non-blocking embeddings.

create extension if not exists pgcrypto;
create extension if not exists vector;

-- Ensure the cycle exists for FK integrity without changing active-cycle semantics.
-- We keep it `draft` so it does not conflict with the "one active cycle" constraint.
insert into public.program_cycles (
  organization_id,
  cycle_id,
  root_problem_version_id,
  state,
  program_label,
  created_by,
  created_reason,
  focus_snapshot
)
values (
  'applied-ai-labs',
  'cycle_01',
  'pilot-v1',
  'draft',
  'AI Fluency Lab',
  'warehouse_migration',
  'bootstrap warehouse cycle scaffold (draft)',
  'How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?'
)
on conflict (organization_id, cycle_id) do nothing;

create table if not exists public.idea_entries (
  entry_version_id uuid primary key default gen_random_uuid(),
  notion_page_id text not null,
  version_no integer not null check (version_no >= 1),
  participant_key text not null,
  organization_id text not null,
  cycle_id text not null,
  root_problem_version_id text not null,
  focus_id text not null,
  focus_text_snapshot text not null,
  idea_text_raw text not null,
  idea_text_norm text not null,
  notion_last_edited_time timestamptz not null,
  source_event_key text not null unique,
  created_at timestamptz not null default now(),
  unique (notion_page_id, version_no),
  constraint idea_entries_cycle_fk
    foreign key (organization_id, cycle_id)
    references public.program_cycles (organization_id, cycle_id)
    on update cascade
    on delete restrict
);

create index if not exists idea_entries_cycle_created_idx
  on public.idea_entries (cycle_id, created_at desc);

create index if not exists idea_entries_participant_created_idx
  on public.idea_entries (participant_key, created_at desc);

create index if not exists idea_entries_notion_page_idx
  on public.idea_entries (notion_page_id, version_no desc);

create table if not exists public.idea_embeddings (
  entry_version_id uuid primary key references public.idea_entries(entry_version_id) on delete cascade,
  embedding_model text not null,
  embedding_status text not null check (embedding_status in ('pending', 'processing', 'ready', 'failed')),
  embedding_vector vector(1536),
  error_code text,
  embedded_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.idea_embeddings_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_idea_embeddings_set_updated_at on public.idea_embeddings;
create trigger trg_idea_embeddings_set_updated_at
before update on public.idea_embeddings
for each row
execute function public.idea_embeddings_set_updated_at();

create index if not exists idea_embeddings_status_updated_idx
  on public.idea_embeddings (embedding_status, updated_at asc);

create or replace view public.idea_entries_current as
select distinct on (notion_page_id)
  entry_version_id,
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
  source_event_key,
  created_at
from public.idea_entries
order by notion_page_id, version_no desc, notion_last_edited_time desc;

create or replace view public.idea_embeddings_backfill as
select
  e.entry_version_id,
  i.idea_text_norm,
  e.embedding_model,
  e.embedding_status,
  e.updated_at
from public.idea_embeddings e
join public.idea_entries i on i.entry_version_id = e.entry_version_id
where e.embedding_status in ('pending', 'failed');

create or replace view public.idea_ops_daily_summary as
select
  date_trunc('day', i.created_at) as day_bucket,
  i.cycle_id,
  e.embedding_status,
  count(*)::bigint as idea_count
from public.idea_entries i
left join public.idea_embeddings e on e.entry_version_id = i.entry_version_id
group by 1, 2, 3
order by 1 desc, 2 asc, 3 asc;
