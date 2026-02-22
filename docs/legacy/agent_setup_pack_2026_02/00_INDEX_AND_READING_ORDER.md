# 00 Index and Reading Order

## Intent
### Definitions (canonical terms)
- `commit-event`: explicit user commit action that can trigger orchestration.
- `protected action`: any server operation that can change runtime state or access governed data.
- `idempotency_key`: deterministic dedupe key for webhook ingest.
- `duplicate_skipped`: derived display label for an event stored with ingest state `duplicate` where execution is skipped.
- `replay`: operator-approved reprocessing of a previously failed event.
- `allowlist_state`: `allowlisted`, `active`, `suspended`, `revoked`.
- `login_state`: `never_logged_in`, `login_success`, `login_failed`, `login_blocked_not_allowlisted`, `login_blocked_suspended`, `login_blocked_revoked`.
- `publish_state`: `draft`, `readiness_blocked`, `ready_pending_confirmation`, `published`.
- `evidence bundle`: command log, diff, check output, and decision notes for one change slice.
- `operator override`: explicit human approval to perform an otherwise blocked high-risk action.

This file defines the canonical read order and decision precedence for the Agent OS Pack.

## Canonical Inputs
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/00_INDEX_AND_READING_ORDER.md` through `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/09_ACCEPTANCE_TESTS_SLO_AND_HANDOFF.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/PILOT_KEYS_INTAKE.md` for non-secret values and secret pointers.
3. Runtime dashboard truth from GitHub, Vercel, Supabase, and Notion.
4. Current branch and CI status.

## Canonical Outputs
1. Deterministic execution order for Agent OS operations.
2. Shared glossary for operators and collaborators.
3. Conflict-resolution policy for docs and implementation.
4. Repeatable evidence bundle requirements.

## Normative Rules
1. Agent OS Pack files are read in numeric order `00` to `09`.
2. Locked invariants from `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec` are never relaxed.
3. `supabase/.temp/*` is ignorable Supabase CLI cache and excluded from runtime readiness decisions.
4. Secrets are never committed; only pointer format is allowed.
5. Unknowns are written as `TODO` plus `How to determine`.
6. Login success does not grant runtime access; protected actions are checked server-side every time.

## State and Decision Logic
1. Start in `spec_loaded=false`.
2. Set `spec_loaded=true` only after files `00` through `09` are validated.
3. For each decision:
   1. Check if any locked invariant is affected.
   2. If affected, enforce invariant and reject conflicting change.
   3. If not affected, choose the lowest complexity option that preserves auditability.
4. For any missing value:
   - TODO: record unknown value.
   - How to determine: point to exact dashboard, API, or file location.

## Failure Modes and Recovery
1. Failure: conflicting instructions across docs.
   - Recovery: apply precedence of session directives, then `/docs/spec`, then this pack.
2. Failure: operator cannot trace a decision.
   - Recovery: require evidence bundle and linked record IDs before closing a task.
3. Failure: hidden dependency on local cache artifacts.
   - Recovery: ignore `supabase/.temp/*` and validate only cloud/runtime contracts.

## Verification
1. Pass if glossary terms are used consistently across all pack files.
2. Pass if all 10 pack files exist and are ordered `00` to `09`.
3. Pass if references to unknown values are marked with TODO and determination steps.
4. Pass if no rule in this file conflicts with locked invariants in `/docs/spec`.

## Evidence
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/00_INDEX_AND_READING_ORDER.md` defines canonical execution posture.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/01_PRODUCT_INTENT_AND_LOCKED_INVARIANTS.md` defines immutable constraints.
3. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/07_SECURITY_AUTH_ACCESS_AND_GOVERNANCE.md` defines access and secret handling rules.
