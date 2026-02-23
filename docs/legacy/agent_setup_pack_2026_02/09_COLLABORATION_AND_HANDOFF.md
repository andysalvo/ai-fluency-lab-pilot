# 09 Collaboration and Handoff

## Intent
Define how Andy and collaborators operate the lab safely with clear handoff boundaries.

## Canonical Inputs
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/agent_setup_pack/02_OPERATOR_CONTRACT_AND_AUTONOMY_LEVEL.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/agent_setup_pack/04_NOTION_AS_CONTROL_PLANE.md`.
3. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/09_ACCEPTANCE_TESTS_SLO_AND_HANDOFF.md`.

## Canonical Outputs
1. Role-based collaboration model for pilot operation.
2. Handoff package definition for Codex-independent execution.
3. Separation policy between cockpit and construction work.

## Normative Rules
1. Cockpit work and construction work must use separate branches and PRs.
2. Collaborators are onboarded through Notion roles plus allowlist-controlled runtime access.
3. Handoff package must include runbooks, checks, and escalation contacts.
4. Operational decisions must be traceable to evidence bundles.
5. Construction branch work starts only after explicit operator instruction.

## State and Decision Logic
1. Collaboration lifecycle:
   - `onboarding`
   - `active`
   - `restricted`
   - `offboarded`
2. Cockpit versus construction separation:
   1. Cockpit branch contains governance/docs/verification controls.
   2. Construction branch contains product feature implementation.
   3. Construction branch is blocked until cockpit branch is merged.
3. TODO: finalize collaborator contact map and escalation schedule.
   - How to determine: collect owner/backup names and response windows in operator dashboard.

## Failure Modes and Recovery
1. Failure: collaborator executes construction work on cockpit branch.
   - Recovery: stop, split changes, and re-open on correct branch.
2. Failure: onboarding done in tooling but not reflected in Notion role records.
   - Recovery: reconcile role state and rerun access validation.
3. Failure: handoff relies on informal chat context.
   - Recovery: require written checklist and linked runbook artifacts.

## Verification
1. Pass if branch separation policy is explicit and enforceable.
2. Pass if collaborator onboarding and offboarding states are documented.
3. Pass if handoff package requirements are complete.
4. Pass if construction start is explicitly gated by operator instruction.

## Evidence
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/09_ACCEPTANCE_TESTS_SLO_AND_HANDOFF.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/08_DEPLOYMENT_OPERATIONS_AND_SCALING_RUNBOOK.md`.
