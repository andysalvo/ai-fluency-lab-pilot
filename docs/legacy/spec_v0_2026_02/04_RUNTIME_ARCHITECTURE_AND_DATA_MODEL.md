# 04 Runtime Architecture and Data Model

## Intent
Define the Supabase-first runtime model, core tables, and transactional rules that enforce governance invariants and support scalable pilot operations.

## Canonical Inputs
1. Supabase configuration keys:
   - `pilot.supabase.project_url`
   - `pilot.supabase.project_ref`
   - `pilot.supabase.edge_base_url`
   - `pilot.supabase.anon_key` (pointer)
   - `pilot.supabase.service_role_key` (pointer)
2. Notion webhook events from doc `03`.
3. OpenAI runtime calls routed by orchestration logic in doc `05`.
4. Access and state contracts from doc `07`.

## Canonical Outputs
1. Deterministic runtime event processing state.
2. Durable participant, thread, run, and output records.
3. Audit-complete logs for governance and incident recovery.
4. Data model that supports pilot now and cohort partitioning later.

## Normative Rules
1. Supabase is the runtime system-of-record for state, logging, and retrieval.
2. All write-side operations MUST be idempotent.
3. Runtime MUST enforce non-negative credit balances.
4. Runtime MUST reject publish if readiness or confirmation conditions fail.
5. Runtime MUST enforce allowlist and login state checks before privileged actions.
6. Runtime MUST store provenance for cross-thread suggestions and reads.
7. No direct production table mutations outside approved interfaces.

## Core Table Contracts

### `participants`
Purpose: identity and access state mirror.
Columns:
1. `participant_id` (uuid, pk)
2. `email` (text, unique)
3. `role` (`student` | `moderator` | `facilitator`)
4. `allowlist_state` (`allowlisted` | `active` | `suspended` | `revoked`)
5. `login_state` (`never_logged_in` | `login_success` | `login_failed` | `login_blocked_not_allowlisted` | `login_blocked_suspended` | `login_blocked_revoked`)
6. `created_at`, `updated_at`

### `participant_credits`
Purpose: credit accounting per participant per root problem.
Columns:
1. `participant_id` (fk)
2. `root_problem_version_id` (text)
3. `credit_balance` (integer, check `>= 0`)
4. `last_adjust_reason` (text)
5. `updated_at`
Unique key: (`participant_id`, `root_problem_version_id`)

### `thread_runs`
Purpose: orchestration run records.
Columns:
1. `run_id` (uuid, pk)
2. `thread_id` (text)
3. `trigger_type` (`local_commit`, `system_commit`, `compare_on_demand`)
4. `run_state` (`queued`, `running`, `succeeded`, `failed`, `duplicate_skipped`)
5. `idempotency_key` (text, unique)
6. `scope_json` (jsonb, includes allowed thread ids)
7. `error_code` (text, nullable)
8. `started_at`, `finished_at`

### `readiness_evaluations`
Purpose: deterministic readiness outcomes.
Columns:
1. `evaluation_id` (uuid, pk)
2. `thread_id` (text)
3. `readiness_claim` (boolean)
4. `readiness_value` (boolean)
5. `readiness_difference` (boolean)
6. `is_ready` (boolean)
7. `reason_codes` (text[])
8. `evaluated_at`

### `outputs_log`
Purpose: immutable output version lineage.
Columns:
1. `output_version_id` (uuid, pk)
2. `output_id` (text)
3. `thread_id` (text)
4. `output_type` (`claim` | `finding` | `brief`)
5. `publish_state` (`draft`, `readiness_blocked`, `ready_pending_confirmation`, `published`)
6. `version_number` (integer)
7. `confirmation_token_id` (text, nullable)
8. `author_email` (text)
9. `root_problem_version_id` (text)
10. `created_at`

### `cross_thread_scope_log`
Purpose: explicit provenance for allowed cross-thread reads.
Columns:
1. `scope_id` (uuid, pk)
2. `run_id` (fk -> thread_runs)
3. `source_thread_id` (text)
4. `target_thread_id` (text)
5. `allowed_by` (text)
6. `justification` (text)
7. `created_at`

### `event_ingest_log`
Purpose: webhook processing and dedupe.
Columns:
1. `event_id` (uuid, pk)
2. `source_record_id` (text)
3. `source_table` (text)
4. `event_type` (text)
5. `idempotency_key` (text, unique)
6. `ingest_state` (`received`, `validated`, `processed`, `failed`, `duplicate`)
7. `created_at`, `processed_at`

### `mcq_sessions`
Purpose: adaptive question state per thread.
Columns:
1. `mcq_session_id` (uuid, pk)
2. `thread_id` (text)
3. `questions_served` (integer)
4. `target_questions` (integer default 20)
5. `coverage_json` (jsonb)
6. `fatigue_signal` (integer)
7. `updated_at`

## Runtime Interfaces (Data Layer View)
1. `evaluateReadiness(thread_id)` -> writes `readiness_evaluations`.
2. `publishOutput(thread_id, output_type, confirmation_token)` -> transactional write to `outputs_log` + credit decrement.
3. `logRunAudit(trigger_type, scope)` -> writes `thread_runs` and optional `cross_thread_scope_log`.

## State and Decision Logic
1. Event pipeline:
   1. Ingest webhook.
   2. Validate schema and signature.
   3. Dedupe by `idempotency_key`.
   4. Route by `trigger_type`.
   5. Execute orchestration.
   6. Persist run and outputs.
2. Publish transaction:
   1. Lock participant credit row.
   2. Recompute readiness from latest state.
   3. Check confirmation token validity.
   4. If ready + confirmed + credit available, publish and decrement.
   5. Else write blocked state without decrement.
3. Credit safety rule:
   - enforce by DB check constraint and transactional update guard (`credit_balance - 1 >= 0`).

## Failure Modes and Recovery
1. Failure: duplicate webhook causes re-run.
   - Recovery: unique `idempotency_key` constraints and duplicate skip state.
2. Failure: partial write across output and credit update.
   - Recovery: single database transaction with rollback on any failure.
3. Failure: stale allowlist state during login.
   - Recovery: read-through sync and enforce current participant state at auth callback.
4. Failure: schema drift between Notion and Supabase.
   - Recovery: run schema parity check and block deploy until corrected.

## Verification
1. Pass if all core tables exist with required constraints and enums.
2. Pass if duplicate `idempotency_key` insert is rejected.
3. Pass if concurrent publish attempts cannot drive credits negative.
4. Pass if blocked readiness attempts create `readiness_blocked` output state without credit decrement.
5. Pass if each run has auditable `thread_runs` record and optional scope log entries.

## Evidence
1. Frozen build blueprint specifies Supabase as memory/logging/retrieval with webhook-first sync.
2. Cloud operations pack defines canonical auth/access states and credit semantics.
3. Transaction + idempotency patterns are standard for reliable event-driven systems.
