alter table if exists public.model_runs
  drop constraint if exists model_runs_action_type_check;

alter table if exists public.model_runs
  add constraint model_runs_action_type_check
  check (action_type in ('starter_draft', 'guided_round', 'lab_brief_proposal'));
