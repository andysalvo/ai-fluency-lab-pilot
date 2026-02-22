# 05 Tooling CLI and Runbook

## Intent
Define practical, low-risk operating steps for cockpit work in a cloud-first workflow.

## Canonical Inputs
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/agent_setup_pack/03_ARCHITECTURE_DECISION_AND_RATIONALE.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/08_DEPLOYMENT_OPERATIONS_AND_SCALING_RUNBOOK.md`.
3. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/PILOT_KEYS_INTAKE.md`.

## Canonical Outputs
1. Step-by-step operator runbook for everyday operations.
2. Safe CLI patterns for Codex and collaborators.
3. Ingress mode switch instructions with audit requirements.

## Normative Rules
1. All recurring operations must be executable from dashboards plus documented CLI commands.
2. Every operation that mutates governed state must generate audit evidence.
3. Ingress mode switch between Supabase and Vercel requires operator approval and evidence record.
4. CLI commands must not expose raw secrets in logs.
5. `supabase/.temp/*` is never treated as deployment or state evidence.

## State and Decision Logic
1. Daily operator sequence:
   1. Check auth/access dashboard.
   2. Check blocked readiness/publish items.
   3. Check webhook failure queue and duplicate rates.
   4. Check budget and model usage warnings.
2. Ingress mode switch sequence:
   1. Operator confirms reason for switch.
   2. Set active mode flag.
   3. Run webhook smoke test.
   4. Record switch evidence (who, when, why, result).
3. TODO: final location of mode switch control in ops UI.
   - How to determine: select one control surface (Vercel env toggle or Supabase config) and document it in release notes.

## Failure Modes and Recovery
1. Failure: operator cannot complete daily checks without engineering help.
   - Recovery: simplify runbook to dashboard-first actions and keep CLI optional.
2. Failure: mode switch executed without smoke test.
   - Recovery: auto-mark operation incomplete and require follow-up verification.
3. Failure: credentials accidentally echoed in command output.
   - Recovery: rotate impacted secret and redact stored logs.

## Verification
1. Pass if runbook steps are sequential and executable by non-coder operator.
2. Pass if mode switch runbook includes approval, test, and evidence capture.
3. Pass if secret-safe CLI rules are explicit.
4. Pass if no runbook step depends on `supabase/.temp/*` artifacts.

## Evidence
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/08_DEPLOYMENT_OPERATIONS_AND_SCALING_RUNBOOK.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/MoreContext/RELEASE_AND_SAFETY_WORKFLOW.md`.
