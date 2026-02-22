# 09 Acceptance Tests, SLO, and Handoff

## Intent
Define objective go-live checks, reliability targets, and handoff steps so the pilot can run safely and repeatedly without reliance on Codex.

## Canonical Inputs
1. Test definitions from pilot minimum tests and scenario suites.
2. Runtime state and logs from Notion, Supabase, and Vercel.
3. Auth and governance rules from docs `01`, `05`, and `07`.
4. Release and operations runbook from doc `08`.

## Canonical Outputs
1. Binary go/no-go pilot decision.
2. Test evidence package with pass/fail records.
3. SLO dashboard targets for ongoing operation.
4. Operator handoff checklist for Codex-independent execution.

## Normative Rules
1. Pilot MUST NOT be declared online until all minimum tests pass.
2. A failed invariant test is a stop-ship condition.
3. Publish and credit tests MUST run on each release affecting orchestration.
4. Test evidence MUST include timestamps and operator identity.
5. Handoff MUST include explicit recurring operator tasks and escalation paths.
6. Any production-style release MUST include approval evidence and rollback readiness.

## Minimum Test Suite (Required)
1. Non-allowlisted login is blocked (`login_blocked_not_allowlisted`).
2. Allowlisted user can log in (`login_success`).
3. First successful login transitions `allowlisted -> active`.
4. Credit decrement behavior:
   - successful publish decrements by 1
   - failed readiness does not decrement
   - balance never negative

## Full Acceptance Suite (Required Before Scale Expansion)
1. Suspended user blocked with `login_blocked_suspended`.
2. Revoked user blocked with `login_blocked_revoked`.
3. Readiness gate pass/fail behavior is deterministic (`2-of-3 + confirmation`).
4. No hidden cross-thread reads without explicit scope.
5. No auto-publish path present.
6. No auto-merge path present.
7. Notion webhook replay does not duplicate run execution.
8. Compare mode is on-demand only.
9. Commit-event is only auto-trigger path.
10. Deploy guardrails enforce approval requirement where configured.
11. End-to-end student journey completes from URL intake to publish-or-block outcome.
12. Source-of-truth config integrity (no undocumented required env var).

## Service Level Objectives (Pilot)
1. Auth success path availability: `>= 99.0%` during scheduled operating windows.
2. Commit-event to visible response:
   - p50: `<= 15s`
   - p95: `<= 45s`
3. Webhook processing success rate: `>= 99.5%` excluding duplicates.
4. Critical invariant violation count: `0` per release.
5. Rollback recovery for release-induced outage: `<= 15 minutes` to stable flow.

## Handoff Package (Run Without Codex)
1. Canonical 10-doc spec pack in `/docs/spec`.
2. Filled runtime key map with pointers for secrets.
3. Operator runbook with daily checklist and incident actions.
4. Test checklist templates with expected outcomes.
5. Contact map for operator, moderator, and approver.

## State and Decision Logic
1. `release_readiness_state`:
   - `not_tested`
   - `minimum_passed`
   - `acceptance_passed`
   - `blocked`
2. Decision gate:
   1. If any minimum test fails -> `blocked`.
   2. If all minimum pass and no invariant failures -> `minimum_passed`.
   3. If full suite passes and SLO probes are healthy -> `acceptance_passed`.
3. Pilot online decision:
   - allow only when `minimum_passed` at minimum, and no stop-ship findings.

## Failure Modes and Recovery
1. Failure: inconsistent test execution across operators.
   - Recovery: use fixed test case IDs and exact pass criteria from this document.
2. Failure: SLO breach without escalation.
   - Recovery: trigger incident severity workflow and assign owner.
3. Failure: missing handoff details creates operational dependency on builder.
   - Recovery: require complete handoff package before scale expansion.
4. Failure: go-live declared despite failing invariant checks.
   - Recovery: immediately pause pilot and remediate before reopening.

## Verification
1. Pass if test evidence exists for each minimum and acceptance test case.
2. Pass if stop-ship rules are explicitly checked and none are triggered.
3. Pass if SLO probes are instrumented and visible to operator.
4. Pass if an operator can execute one full day checklist without Codex assistance.
5. Pass if release evidence includes approver identity and rollback readiness proof.

## Evidence
1. Minimum tests and expanded scenario docs define canonical pass/fail behavior.
2. Release and safety workflow defines approval and rollback evidence requirements.
3. SLO-based operation is standard for reliable service management and repeatable pilot execution.
