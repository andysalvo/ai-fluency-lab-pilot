# 07 Security, Secrets, and Access

## Intent
### Definitions (canonical terms)
Use glossary terms from `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/agent_setup_pack/00_INDEX_AND_READING_ORDER.md`.

This file defines access enforcement, secret handling, replay controls, and minimum audit evidence.

## Canonical Inputs
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/07_SECURITY_AUTH_ACCESS_AND_GOVERNANCE.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/04_RUNTIME_ARCHITECTURE_AND_DATA_MODEL.md`.
3. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/PILOT_KEYS_INTAKE.md`.

## Canonical Outputs
1. Server-side protected-action guard contract.
2. Replay contract with operator approval requirements.
3. Secret handling and incident response policy.
4. Required audit evidence schema for protected actions.

## Normative Rules
1. Secret values are never committed; pointer format only.
2. Login success is a session event, not an authorization bypass.
3. Server-side checks must run on every protected action.
4. Protected actions are exactly:
   - `run_local`
   - `run_system`
   - `compare`
   - `publish`
   - `credit_adjust`
   - `scope_grant`
   - `admin_override`
5. Each protected action requires:
   1. allowlist state check.
   2. role authorization check.
   3. audit row written with required evidence fields.
6. Replay is never automatic and always requires operator approval.
7. Stored ingest states are exactly:
   - `received`, `validated`, `processed`, `failed`, `duplicate`.
8. Replay is an operator-approved action with audit linkage, not a stored ingest enum state.
9. Minimum audit evidence required for every protected action:
   - who
   - when
   - what
   - why (required for overrides)
   - linked Notion record
   - linked event ID and `idempotency_key`

## State and Decision Logic
1. Authorization gate for each protected action:
   1. Resolve actor identity.
   2. Read current `allowlist_state`.
   3. Validate role against action policy.
   4. Deny with deterministic reason if any check fails.
2. Replay gate:
   1. Only events in `failed` state are replay-eligible.
   2. Operator approval and reason are required.
   3. Replay writes new audit row linked to original event.
3. TODO: finalize role matrix for each protected action in runtime policy table.
   - How to determine: map operator/moderator/facilitator permissions against `/docs/spec/07` and validate with acceptance tests.

## Failure Modes and Recovery
1. Failure: action authorized by frontend only.
   - Recovery: block action server-side and add missing guard path.
2. Failure: secret appears in repository or logs.
   - Recovery: rotate secret, purge exposure, and record incident.
3. Failure: replay executed without approval.
   - Recovery: mark incident, disable replay endpoint, and require governance review.
4. Failure: protected action has incomplete audit evidence.
   - Recovery: reject completion and require full evidence fields.

## Verification
1. Pass if all seven protected actions are listed and guarded.
2. Pass if login-success-not-access rule is explicit.
3. Pass if stored ingest states match spec and replay approval requirements are explicit.
4. Pass if minimum audit evidence fields are listed exactly.
5. Pass if no file includes raw secret values.

## Evidence
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/07_SECURITY_AUTH_ACCESS_AND_GOVERNANCE.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/04_RUNTIME_ARCHITECTURE_AND_DATA_MODEL.md`.
3. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/09_ACCEPTANCE_TESTS_SLO_AND_HANDOFF.md`.
