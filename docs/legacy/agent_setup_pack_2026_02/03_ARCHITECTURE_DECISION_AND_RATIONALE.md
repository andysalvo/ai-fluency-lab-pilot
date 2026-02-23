# 03 Architecture Decision and Rationale

## Intent
### Definitions (canonical terms)
Use glossary terms from `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/agent_setup_pack/00_INDEX_AND_READING_ORDER.md`.

This file records the pilot architecture decision and enforcement points.

## Canonical Inputs
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/03_NOTION_INFORMATION_ARCHITECTURE_AND_PAGE_TEMPLATES.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/04_RUNTIME_ARCHITECTURE_AND_DATA_MODEL.md`.
3. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/05_AGENT_ORCHESTRATION_AND_DECISION_LOGIC.md`.
4. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/PILOT_KEYS_INTAKE.md`.

## Canonical Outputs
1. Chosen architecture for pilot operations.
2. Ingress, auth, and enforcement topology.
3. Deterministic idempotency and replay contract.

## Normative Rules
1. Chosen architecture is Option B: Supabase Edge Functions plus minimal Vercel surfaces plus Notion control plane.
2. Google SSO callback lives at Vercel endpoint `/api/auth/callback/google`.
3. Minimal ops/admin UI lives on Vercel and is operator-focused.
4. Webhook ingress mode is single-active:
   1. Primary mode: Supabase Edge endpoint.
   2. Fallback mode: Vercel endpoint.
   3. Never dual-write; only one mode active at a time.
5. Primary and fallback ingress paths must share identical idempotency and audit contracts.
6. Idempotency key is exactly:
   - `idempotency_key = sha256(source_table + ":" + source_record_id + ":" + event_type + ":" + occurred_at_rounded_to_second)`
   - This formula is the pilot default authority unless `/docs/spec` is explicitly updated with a different formula.
7. Collision policy is exactly:
   - if key already exists, set ingest state to `duplicate` and do not re-run.
   - `duplicate_skipped` may be used as a derived display label only.

## State and Decision Logic
1. Ingress mode state:
   - `supabase_primary`
   - `vercel_fallback`
2. Mode switching:
   1. Operator sets active mode.
   2. Incoming events are accepted only by active mode endpoint.
   3. Inactive mode endpoint rejects with deterministic reason code.
3. Stored ingest state machine:
   - `received` -> `validated` -> (`processed` | `failed` | `duplicate`).
4. Replay handling:
   - replay is an operator-approved action with audit linkage to the original event.
   - replay is not a stored ingest enum state.
5. Canonical source of truth for active ingress mode is `supabase.table.runtime_control.active_ingress_mode` (single pilot row).

## Failure Modes and Recovery
1. Failure: events sent to both ingress paths.
   - Recovery: enforce mode gate and reject inactive endpoint writes.
2. Failure: duplicate event creates second run.
   - Recovery: unique key check before orchestration; mark ingest state as `duplicate`.
3. Failure: fallback mode diverges from primary behavior.
   - Recovery: run shared contract tests against both endpoints before use.

## Verification
1. Pass if architecture notes include Supabase primary and Vercel fallback with no dual-write.
2. Pass if exact idempotency formula appears and collision policy is explicit.
3. Pass if SSO callback and admin surface locations are documented.
4. Pass if replay path includes approval and auditing requirements.

## Evidence
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/03_NOTION_INFORMATION_ARCHITECTURE_AND_PAGE_TEMPLATES.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/04_RUNTIME_ARCHITECTURE_AND_DATA_MODEL.md`.
3. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/05_AGENT_ORCHESTRATION_AND_DECISION_LOGIC.md`.
