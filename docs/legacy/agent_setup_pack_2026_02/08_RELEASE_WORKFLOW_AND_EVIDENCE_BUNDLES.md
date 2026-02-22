# 08 Release Workflow and Evidence Bundles

## Intent
Define release gates and evidence requirements for cockpit work and readiness signaling.

## Canonical Inputs
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/08_DEPLOYMENT_OPERATIONS_AND_SCALING_RUNBOOK.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/09_ACCEPTANCE_TESTS_SLO_AND_HANDOFF.md`.
3. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/.github/pull_request_template.md`.

## Canonical Outputs
1. Standard evidence bundle format for every cockpit slice.
2. Release readiness criteria and stop conditions.
3. Clear status language for operator updates.

## Normative Rules
1. Every slice must include: git diff, commands run, verify output, and summary.
2. No guessing is allowed; unknowns must be TODO plus determination method.
3. Protected invariants must be checked in PR checklist before merge.
4. No commit or merge occurs without operator approval.
5. Readiness label `READY TO BUILD LAB` is allowed only when all gate checks pass.

## State and Decision Logic
1. Release readiness states:
   - `not_ready`
   - `ready_to_review`
   - `ready_to_build_lab`
2. Gate for `ready_to_build_lab`:
   1. Exactly 10 setup-pack docs exist and verify passes.
   2. CI workflow exists and targets PRs to `dev` and `main`.
   3. `AGENTS.md` exists with hard rules and evidence policy.
   4. No secret-pattern violations.
3. TODO: define PR label taxonomy for cockpit versus construction slices.
   - How to determine: align with GitHub Project workflow and keep labels minimal.

## Failure Modes and Recovery
1. Failure: incomplete evidence bundle.
   - Recovery: hold status at `ready_to_review` until missing evidence is added.
2. Failure: unknowns silently assumed.
   - Recovery: convert each assumption to TODO plus determination step.
3. Failure: readiness declared early.
   - Recovery: revert status to `not_ready` and publish blocker list.

## Verification
1. Pass if evidence bundle schema is explicitly defined.
2. Pass if readiness gate criteria match technical checks.
3. Pass if TODO policy is explicit and repeatable.
4. Pass if approval-before-commit rule is explicit.

## Evidence
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/08_DEPLOYMENT_OPERATIONS_AND_SCALING_RUNBOOK.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/09_ACCEPTANCE_TESTS_SLO_AND_HANDOFF.md`.
