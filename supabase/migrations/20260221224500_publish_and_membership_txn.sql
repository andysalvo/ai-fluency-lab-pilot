-- Adds transactional helpers for one-active-membership switching and publish credit safety.

create or replace function public.activate_membership_txn(
  p_participant_id uuid,
  p_organization_id text,
  p_cycle_id text,
  p_updated_at timestamptz default now()
)
returns public.cycle_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.cycle_memberships;
begin
  update public.cycle_memberships
  set membership_state = 'inactive',
      updated_at = p_updated_at
  where participant_id = p_participant_id
    and organization_id = p_organization_id
    and membership_state = 'active'
    and cycle_id <> p_cycle_id;

  update public.cycle_memberships
  set membership_state = 'active',
      updated_at = p_updated_at
  where participant_id = p_participant_id
    and organization_id = p_organization_id
    and cycle_id = p_cycle_id
    and membership_state <> 'revoked'
  returning * into v_target;

  return v_target;
end;
$$;

create or replace function public.publish_lab_record_txn(
  p_idempotency_key text,
  p_organization_id text,
  p_cycle_id text,
  p_root_problem_version_id text,
  p_participant_id uuid,
  p_role text,
  p_thread_id text,
  p_claim boolean,
  p_value boolean,
  p_difference boolean,
  p_explicit_confirmation boolean,
  p_content_json jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_cycle public.program_cycles;
  v_membership public.cycle_memberships;
  v_thread public.threads_runtime;
  v_ready_count integer;
  v_next_version integer;
  v_created_record public.lab_record_entries;
begin
  select payload_json
    into v_payload
  from public.action_response_replay
  where idempotency_key = p_idempotency_key
    and action_type = 'publish';

  if v_payload is not null then
    return v_payload;
  end if;

  select *
    into v_cycle
  from public.program_cycles
  where organization_id = p_organization_id
    and cycle_id = p_cycle_id;

  if v_cycle is null then
    v_payload := jsonb_build_object(
      'ok', false,
      'reason_code', 'NO_MEMBERSHIP_FOR_CYCLE',
      'replayed', false
    );

    insert into public.action_response_replay (idempotency_key, action_type, organization_id, cycle_id, payload_json)
    values (p_idempotency_key, 'publish', p_organization_id, p_cycle_id, v_payload)
    on conflict do nothing;

    select payload_json into v_payload from public.action_response_replay where idempotency_key = p_idempotency_key;
    return v_payload;
  end if;

  if v_cycle.state = 'archived' then
    v_payload := jsonb_build_object(
      'ok', false,
      'reason_code', 'CYCLE_ARCHIVED',
      'replayed', false
    );
    insert into public.action_response_replay (idempotency_key, action_type, organization_id, cycle_id, payload_json)
    values (p_idempotency_key, 'publish', p_organization_id, p_cycle_id, v_payload)
    on conflict do nothing;
    select payload_json into v_payload from public.action_response_replay where idempotency_key = p_idempotency_key;
    return v_payload;
  end if;

  if v_cycle.state <> 'active' then
    v_payload := jsonb_build_object(
      'ok', false,
      'reason_code', 'CYCLE_LOCKED',
      'replayed', false
    );
    insert into public.action_response_replay (idempotency_key, action_type, organization_id, cycle_id, payload_json)
    values (p_idempotency_key, 'publish', p_organization_id, p_cycle_id, v_payload)
    on conflict do nothing;
    select payload_json into v_payload from public.action_response_replay where idempotency_key = p_idempotency_key;
    return v_payload;
  end if;

  select *
    into v_thread
  from public.threads_runtime
  where thread_id = p_thread_id
    and cycle_id = p_cycle_id
    and organization_id = p_organization_id;

  if v_thread is null then
    v_payload := jsonb_build_object(
      'ok', false,
      'reason_code', 'CROSS_CYCLE_ACCESS_DENIED',
      'replayed', false
    );
    insert into public.action_response_replay (idempotency_key, action_type, organization_id, cycle_id, payload_json)
    values (p_idempotency_key, 'publish', p_organization_id, p_cycle_id, v_payload)
    on conflict do nothing;
    select payload_json into v_payload from public.action_response_replay where idempotency_key = p_idempotency_key;
    return v_payload;
  end if;

  if p_role = 'student' and v_thread.owner_participant_id <> p_participant_id then
    v_payload := jsonb_build_object(
      'ok', false,
      'reason_code', 'ROLE_DENY',
      'replayed', false
    );
    insert into public.action_response_replay (idempotency_key, action_type, organization_id, cycle_id, payload_json)
    values (p_idempotency_key, 'publish', p_organization_id, p_cycle_id, v_payload)
    on conflict do nothing;
    select payload_json into v_payload from public.action_response_replay where idempotency_key = p_idempotency_key;
    return v_payload;
  end if;

  select *
    into v_membership
  from public.cycle_memberships
  where participant_id = p_participant_id
    and organization_id = p_organization_id
    and cycle_id = p_cycle_id
  for update;

  if v_membership is null or v_membership.membership_state <> 'active' then
    v_payload := jsonb_build_object(
      'ok', false,
      'reason_code', 'NO_MEMBERSHIP_FOR_CYCLE',
      'replayed', false
    );
    insert into public.action_response_replay (idempotency_key, action_type, organization_id, cycle_id, payload_json)
    values (p_idempotency_key, 'publish', p_organization_id, p_cycle_id, v_payload)
    on conflict do nothing;
    select payload_json into v_payload from public.action_response_replay where idempotency_key = p_idempotency_key;
    return v_payload;
  end if;

  v_ready_count := (case when p_claim then 1 else 0 end)
    + (case when p_value then 1 else 0 end)
    + (case when p_difference then 1 else 0 end);

  if v_ready_count < 2 then
    v_payload := jsonb_build_object(
      'ok', false,
      'reason_code', 'INSUFFICIENT_CRITERIA',
      'replayed', false
    );
    insert into public.action_response_replay (idempotency_key, action_type, organization_id, cycle_id, payload_json)
    values (p_idempotency_key, 'publish', p_organization_id, p_cycle_id, v_payload)
    on conflict do nothing;
    select payload_json into v_payload from public.action_response_replay where idempotency_key = p_idempotency_key;
    return v_payload;
  end if;

  if not p_explicit_confirmation then
    v_payload := jsonb_build_object(
      'ok', false,
      'reason_code', 'NEEDS_CONFIRMATION',
      'replayed', false
    );
    insert into public.action_response_replay (idempotency_key, action_type, organization_id, cycle_id, payload_json)
    values (p_idempotency_key, 'publish', p_organization_id, p_cycle_id, v_payload)
    on conflict do nothing;
    select payload_json into v_payload from public.action_response_replay where idempotency_key = p_idempotency_key;
    return v_payload;
  end if;

  if v_membership.credits <= 0 then
    v_payload := jsonb_build_object(
      'ok', false,
      'reason_code', 'CREDIT_INSUFFICIENT',
      'replayed', false,
      'credit_balance_after', v_membership.credits,
      'credit_delta', 0
    );
    insert into public.action_response_replay (idempotency_key, action_type, organization_id, cycle_id, payload_json)
    values (p_idempotency_key, 'publish', p_organization_id, p_cycle_id, v_payload)
    on conflict do nothing;
    select payload_json into v_payload from public.action_response_replay where idempotency_key = p_idempotency_key;
    return v_payload;
  end if;

  insert into public.readiness_evaluations (
    thread_id,
    organization_id,
    cycle_id,
    root_problem_version_id,
    participant_id,
    readiness_claim,
    readiness_value,
    readiness_difference,
    explicit_confirmation,
    ready_to_publish,
    reason_code
  )
  values (
    p_thread_id,
    p_organization_id,
    p_cycle_id,
    p_root_problem_version_id,
    p_participant_id,
    p_claim,
    p_value,
    p_difference,
    p_explicit_confirmation,
    true,
    'READY'
  );

  select coalesce(max(version), 0) + 1
    into v_next_version
  from public.lab_record_entries
  where organization_id = p_organization_id
    and cycle_id = p_cycle_id
    and thread_id = p_thread_id;

  insert into public.lab_record_entries (
    thread_id,
    organization_id,
    cycle_id,
    root_problem_version_id,
    participant_id,
    version,
    content_json
  )
  values (
    p_thread_id,
    p_organization_id,
    p_cycle_id,
    p_root_problem_version_id,
    p_participant_id,
    v_next_version,
    coalesce(p_content_json, '{}'::jsonb)
  )
  returning * into v_created_record;

  update public.cycle_memberships
  set credits = credits - 1,
      updated_at = now()
  where participant_id = p_participant_id
    and organization_id = p_organization_id
    and cycle_id = p_cycle_id;

  update public.threads_runtime
  set status = 'published',
      updated_at = now()
  where thread_id = p_thread_id
    and cycle_id = p_cycle_id
    and organization_id = p_organization_id;

  select *
    into v_membership
  from public.cycle_memberships
  where participant_id = p_participant_id
    and organization_id = p_organization_id
    and cycle_id = p_cycle_id;

  v_payload := jsonb_build_object(
    'ok', true,
    'reason_code', 'OK',
    'replayed', false,
    'credit_delta', -1,
    'credit_balance_after', v_membership.credits,
    'lab_record_id', v_created_record.lab_record_id,
    'organization_id', v_created_record.organization_id,
    'cycle_id', v_created_record.cycle_id,
    'root_problem_version_id', v_created_record.root_problem_version_id,
    'thread_id', v_created_record.thread_id,
    'participant_id', v_created_record.participant_id,
    'version', v_created_record.version,
    'content_json', v_created_record.content_json,
    'created_at', v_created_record.created_at
  );

  insert into public.action_response_replay (idempotency_key, action_type, organization_id, cycle_id, payload_json)
  values (p_idempotency_key, 'publish', p_organization_id, p_cycle_id, v_payload)
  on conflict do nothing;

  select payload_json into v_payload from public.action_response_replay where idempotency_key = p_idempotency_key;
  return v_payload;
end;
$$;
