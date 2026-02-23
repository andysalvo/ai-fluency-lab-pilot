# 05 Agent Orchestration and Decision Logic

## Intent
Define exact orchestration behavior for local/system/compare modes, readiness evaluation, publish logic, and cross-thread governance boundaries.

## Canonical Inputs
1. Commit-event records from `Turns` and control changes from `Threads`.
2. Thread context, student inputs, and allowed scope metadata.
3. Runtime config for model allowlist (`pilot.openai.allowed_models`).
4. Access and state contracts from docs `01`, `04`, and `07`.

## Canonical Outputs
1. Deterministic run execution record per trigger event.
2. Assistant response payloads that obey prompt and governance policies.
3. Readiness evaluations with reason codes.
4. Publish outcome with explicit state and credit mutation rules.

## Normative Rules
1. Trigger model MUST be commit-event only.
2. Local mode MUST process student-owned thread context only.
3. System mode MUST run only when both flags are true:
   - `share_for_system=true`
   - `system_mode_enabled=true`
4. Compare mode MUST be on-demand only.
5. No orchestration step may auto-publish or auto-merge.
6. Cross-thread reads MUST require explicit scope and be logged.
7. Assistant prompts MUST map reasoning downstream from active root problem.
8. Each run MUST return provenance metadata for generated claims.

## Frozen Public Interfaces

### `evaluateReadiness(thread_id)`
Input:
1. `thread_id`

Output:
1. `state`: `locked` | `ready`
2. `reason_codes`: `readiness_reason_code[]`
3. `suggested_output_type`: `claim` | `finding` | `brief`
4. `position_readiness_hint`: `hold` | `shift` | `strengthen` | `split`

### `publishOutput(thread_id, output_type, confirmation_token)`
Input:
1. `thread_id`
2. `output_type`
3. `confirmation_token`

Output:
1. `publish_state`
2. `output_version_id`
3. `credit_delta`
4. `credit_balance_after`
5. `reason_codes`

### `logRunAudit(trigger_type, scope)`
Input:
1. `trigger_type`: `local_commit` | `system_commit` | `compare_on_demand`
2. `scope`: explicit thread scope object

Output:
1. `run_id`
2. `run_state`
3. `scope_digest`

## Canonical Enums
1. `publish_state`:
   - `draft`
   - `readiness_blocked`
   - `ready_pending_confirmation`
   - `published`
2. `readiness_reason_code`:
   - `RDC_MISSING_CLAIM`
   - `RDC_MISSING_VALUE`
   - `RDC_MISSING_DIFFERENCE`
   - `RDC_CONFIRMATION_MISSING`
   - `RDC_CREDIT_UNAVAILABLE`
   - `RDC_SCOPE_NOT_ALLOWED`

## Prompt Contract Boundaries
1. Allowed model set is explicit and environment-configured.
2. Prompt context must include:
   - current thread turns
   - root problem statement
   - allowed cross-thread summaries (if scoped)
3. Prompt context must exclude:
   - non-opted-in thread raw content
   - secrets or credentials
4. System responses must include:
   - concise reasoning
   - one next best action
   - optional one MCQ prompt when needed

## State and Decision Logic
1. Trigger router:
   1. Accept event if valid commit-event.
   2. Map to local/system/compare route.
   3. Enforce rate limits (debounce 30s, max 1 run/min/thread).
2. Readiness evaluator:
   1. Infer whether thread has clear claim.
   2. Infer whether value is explicit.
   3. Infer whether difference is explicit.
   4. Ready if at least 2 are true.
3. Publish logic:
   1. Run readiness evaluator.
   2. If not ready -> `readiness_blocked` with reason codes.
   3. If ready and no confirmation -> `ready_pending_confirmation`.
   4. If ready + confirmation + credit -> `published` and decrement credit by 1.
4. Cross-thread guard:
   1. If scope absent, deny cross-thread retrieval.
   2. If scope present, log provenance and continue.

## Failure Modes and Recovery
1. Failure: invalid trigger sequence from rapid edits.
   - Recovery: debounce and dedupe, return last accepted run id.
2. Failure: system mode runs on non-shared thread.
   - Recovery: hard-block with `RDC_SCOPE_NOT_ALLOWED`.
3. Failure: readiness false positives.
   - Recovery: include transparent reason codes and require explicit user confirmation.
4. Failure: publish executed without credit check.
   - Recovery: enforce publish through transactional API only.

## Verification
1. Pass if commit-event is the only trigger path to local/system execution.
2. Pass if compare runs only on explicit user action.
3. Pass if `publishOutput` cannot return `published` without confirmation.
4. Pass if `publishOutput` cannot return `published` when credit is zero.
5. Pass if cross-thread retrieval attempts without scope are blocked and logged.

## Evidence
1. Frozen architecture decisions define local/system/compare boundaries and commit-event trigger constraints.
2. Build blueprint defines readiness gate semantics and provenance expectations.
3. Human-in-the-loop publish controls align with safety patterns for high-accountability workflows.
