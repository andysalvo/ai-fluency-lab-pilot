# 01 Agent Charter and Locked Rules

## Intent
### Definitions (canonical terms)
Use definitions from `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/agent_setup_pack/00_INDEX_AND_READING_ORDER.md` as canonical.

This charter defines how Codex operates safely, audibly, and in thin slices.

## Canonical Inputs
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/01_PRODUCT_INTENT_AND_LOCKED_INVARIANTS.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/05_AGENT_ORCHESTRATION_AND_DECISION_LOGIC.md`.
3. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/07_SECURITY_AUTH_ACCESS_AND_GOVERNANCE.md`.
4. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/09_ACCEPTANCE_TESTS_SLO_AND_HANDOFF.md`.

## Canonical Outputs
1. Non-negotiable operating rules for Codex and collaborators.
2. Locked invariant checklist for every slice.
3. Evidence-first protocol for all changes.

## Normative Rules
1. Commit-event triggers only.
2. No hidden cross-thread reads without explicit scope and audit.
3. No auto-publish.
4. No auto-merge.
5. Readiness gate is `2-of-3` (`claim`, `value`, `difference`) plus explicit confirmation.
6. Access is allowlist plus Google SSO.
7. Credits decrement only on successful publish and never go negative.
8. Login success is not equivalent to access; every protected action re-checks allowlist and role server-side.
9. Work is delivered in thin slices with a required evidence bundle.
10. No committed raw secrets; pointers/placeholders only.

## State and Decision Logic
1. For each requested change:
   1. Map requested behavior against locked invariants.
   2. If conflicting, block and explain why in plain language.
   3. If compatible, implement smallest auditable slice.
2. For protected actions (`run_local`, `run_system`, `compare`, `publish`, `credit_adjust`, `scope_grant`, `admin_override`):
   1. Validate authenticated identity.
   2. Validate allowlist state.
   3. Validate role authorization.
   4. Write audit evidence before completion.
3. For unknowns:
   - TODO: mark unknown contract/value.
   - How to determine: cite exact source (dashboard, config key, API response).

## Failure Modes and Recovery
1. Failure: pressure to bypass invariant for speed.
   - Recovery: reject change and require explicit documented exception process.
2. Failure: action allowed by login-only check.
   - Recovery: block operation and enforce server guard on action path.
3. Failure: no evidence attached to change.
   - Recovery: mark slice incomplete and generate evidence bundle before approval.

## Verification
1. Pass if all 7 locked invariants are explicitly listed in this file.
2. Pass if protected-action server checks are defined for every action.
3. Pass if any unknown is represented as TODO plus determination method.
4. Pass if no rule here relaxes `/docs/spec` invariants.

## Evidence
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/01_PRODUCT_INTENT_AND_LOCKED_INVARIANTS.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/05_AGENT_ORCHESTRATION_AND_DECISION_LOGIC.md`.
3. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/07_SECURITY_AUTH_ACCESS_AND_GOVERNANCE.md`.
4. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/09_ACCEPTANCE_TESTS_SLO_AND_HANDOFF.md`.
