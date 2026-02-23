# 02 Operator Contract and Autonomy Level

## Intent
Define plain-language collaboration rules so Andy can direct Codex safely without engineering overhead.

## Canonical Inputs
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/agent_setup_pack/01_AGENT_CHARTER_AND_LOCKED_RULES.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/08_DEPLOYMENT_OPERATIONS_AND_SCALING_RUNBOOK.md`.
3. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/09_ACCEPTANCE_TESTS_SLO_AND_HANDOFF.md`.

## Canonical Outputs
1. Clear autonomy boundaries for Codex actions.
2. Approval checkpoints for high-impact operations.
3. Operator-friendly command and evidence expectations.

## Normative Rules
1. Codex may autonomously perform read, plan, and cockpit-safe edits on approved branch scope.
2. Codex must stop for approval before commit, merge, production release, or any destructive action.
3. Codex must explain outputs in plain language and include technical evidence.
4. No auto-publish and no auto-merge are always enforced.
5. Any ambiguity with product or policy impact is documented as TODO plus determination path.

## State and Decision Logic
1. Autonomy levels:
   1. `L1` read-only exploration: no approval needed.
   2. `L2` cockpit edits on active branch: allowed with evidence output.
   3. `L3` commits/PR merge/release: requires explicit operator approval.
2. Escalation conditions:
   1. Potential invariant violation.
   2. Secret exposure risk.
   3. Missing source-of-truth value.
3. TODO handling:
   - TODO: unknown value or unresolved operational choice.
   - How to determine: exact dashboard path or command to verify.

## Failure Modes and Recovery
1. Failure: operator overload from technical details.
   - Recovery: provide two outputs each turn: engineering evidence and plain-language summary.
2. Failure: work continues past approval boundary.
   - Recovery: stop immediately and require explicit approval before proceeding.
3. Failure: ambiguous request interpreted as implementation.
   - Recovery: first provide scoped intent summary and verify constraints from current docs.

## Verification
1. Pass if approval boundary is explicit for commit/merge/release.
2. Pass if output format requires both technical and plain-language sections.
3. Pass if TODO handling rules are defined and actionable.
4. Pass if autonomy levels are unambiguous.

## Evidence
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/08_DEPLOYMENT_OPERATIONS_AND_SCALING_RUNBOOK.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/09_ACCEPTANCE_TESTS_SLO_AND_HANDOFF.md`.
