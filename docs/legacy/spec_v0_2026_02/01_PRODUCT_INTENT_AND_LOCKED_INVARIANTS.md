# 01 Product Intent and Locked Invariants

## Intent
Define exactly what AI Fluency Lab OS is building for pilot phase, what is in scope, and which constraints are non-negotiable.

## Canonical Inputs
1. Root problem statement from frozen scope docs.
2. Locked architecture decisions from frozen architecture docs.
3. Governance and access constraints from cloud operations docs.
4. Session directives specifying Notion-first runtime and minimal web glue.

## Canonical Outputs
1. Product objective and success orientation for pilot.
2. Locked invariants that all implementation layers must enforce.
3. Pilot scope boundaries and explicit non-goals.
4. Decision defaults for ambiguous feature requests.

## Normative Rules
1. Product objective MUST stay anchored to:
   - `How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?`
2. The system MUST be Notion-first for student and operator workflow; web/admin UI is supporting glue.
3. Locked invariants (MUST NOT change):
   1. No hidden cross-thread reads.
   2. No auto-publish.
   3. No auto-merge.
   4. Readiness gate is `2-of-3` (`claim`, `value`, `difference`) plus explicit confirmation.
   5. Trigger model is commit-event only.
   6. Access is allowlist + Google SSO.
   7. Credits decrement only on successful publish and never go negative.
4. System behavior MUST follow `system proposes, humans approve`.
5. Every thread and output MUST reference `root_problem_version_id`.
6. Pilot MUST remain usable by one operator and small cohort without custom engineering support.

## In Scope
1. Notion thread workflow for students and facilitators.
2. Local and system modes with explicit boundaries.
3. Adaptive prompting flow including open response and structured MCQ segments.
4. Output versioning with readiness gate.
5. Supabase run audit, state tracking, and permissions enforcement.
6. Google SSO + allowlist-based access control.
7. Deployment controls and rollback path.

## Out of Scope
1. Autonomous end-to-end orchestration without operator oversight.
2. Any hidden retrieval over non-opted-in student threads.
3. Production-scale multi-region optimization in pilot phase.
4. Auto-published cohort decisions.
5. Secret values stored in repository files.

## State and Decision Logic
1. `root_problem_status`:
   - `active` when inside lock window.
   - `revision_pending` at lock boundary or approved exception path.
2. `thread_governance_state`:
   - `compliant` if all locked invariants are preserved.
   - `blocked` if any invariant is violated.
3. Feature decision gate:
   1. If request conflicts with locked invariants, reject request.
   2. If request is compatible and lowers student friction, accept.
   3. If request increases operator complexity with no safety gain, defer.
4. Publish decision gate:
   1. Evaluate readiness.
   2. Require explicit user confirmation.
   3. On success, publish and decrement credit.
   4. On failure, do not decrement and return reason codes.

## Failure Modes and Recovery
1. Failure: pressure to bypass readiness for speed.
   - Recovery: enforce gate service-side; show unmet criteria and next actions.
2. Failure: student confusion from excessive workflow steps.
   - Recovery: keep frontstage minimal; move complexity to backend orchestration and ops tooling.
3. Failure: scope creep to unsupported autonomous behavior.
   - Recovery: mark as post-pilot proposal and preserve pilot invariant set.
4. Failure: root problem drift.
   - Recovery: enforce root lock window and moderator/facilitator revision path.

## Verification
1. Pass if all seven locked invariants are encoded in code-level tests and docs `05`, `07`, and `09`.
2. Pass if sample student journey can complete without leaving Notion for core learning flow.
3. Pass if blocked scenarios (non-allowlisted login, readiness failure) return deterministic outcomes.
4. Pass if outputs and audit records include `root_problem_version_id`.

## Evidence
1. Frozen pilot scope and architecture docs define root-problem-first and Notion-first constraints.
2. Governance constraints from cloud operations pack define access, trigger, and release boundaries.
3. Human-in-the-loop safety patterns are consistent with education and high-accountability system design guidance.
