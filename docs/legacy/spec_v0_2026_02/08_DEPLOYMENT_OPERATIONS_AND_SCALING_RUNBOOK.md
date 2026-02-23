# 08 Deployment, Operations, and Scaling Runbook

## Intent
Define how to deploy, operate, monitor, and scale AI Fluency Lab OS in a way that works with Codex during build and without Codex during daily lab operations.

## Canonical Inputs
1. Runtime key/value map from `PILOT_KEYS_INTAKE.md` and canonical matrix docs.
2. Platform access to Supabase, Vercel, Notion integration, Google OAuth, and OpenAI.
3. Release and safety rules from cloud workflow docs.
4. Acceptance criteria and SLOs from doc `09`.

## Canonical Outputs
1. Repeatable deployment workflow with explicit gates.
2. Daily operating procedure for a single operator.
3. Incident and rollback procedure.
4. Scaling path from pilot cohort to multi-cohort operation.

## Normative Rules
1. Runtime operation MUST remain functional without Codex intervention.
2. Operator runbook MUST use explicit UI/API steps, not hidden agent memory.
3. `dev` deploy MAY be automatic; `prod` deploy MUST require approval.
4. Rollback procedure MUST be tested and documented.
5. Budget controls MUST include daily warning and monthly hard cap behavior.
6. Config source-of-truth MUST be a single matrix; no undocumented env vars.
7. Operational changes MUST preserve all locked invariants.

## Deployment Runbook

### Pilot Baseline (Single Environment)
1. Maintain environment tag as `pilot` for active operations.
2. Use canonical keys for Notion/Supabase/Vercel/OpenAI/SSO.
3. Deploy web/admin glue to Vercel project URL.
4. Deploy Supabase functions and schema migrations with linked project ref.

### Release Sequence
1. Preflight checks:
   - secrets resolve from pointers
   - webhook endpoint reachable
   - SSO callback works
2. Deploy runtime changes.
3. Run minimum tests.
4. Run full acceptance suite if schema/auth/orchestration changed.
5. Mark release status and archive evidence.

### Production-Style Control (When Enabled)
1. Prepare release summary and checks evidence.
2. Collect explicit approval action.
3. Deploy and run post-deploy smoke tests.
4. Mark `completed` or trigger rollback.

## Daily Operator Procedure (Codex-Independent)
1. Check login/access dashboard and incident alerts.
2. Review blocked readiness items and provide facilitation where needed.
3. Monitor publish events and credit balance anomalies.
4. Review sync/audit logs for failed events.
5. Confirm budget headroom and model usage trends.
6. Record notable governance events.

## Scaling Strategy
1. Phase A: single cohort pilot with one root problem and small participant count.
2. Phase B: multiple cohorts with cohort partition key on thread and output records.
3. Phase C: workspace-level partitioning while preserving same invariant and API contracts.
4. Scaling controls:
   - per-cohort rate limits
   - per-cohort budget monitors
   - per-cohort operator dashboards

## State and Decision Logic
1. Deployment state:
   - `prepared`
   - `deployed`
   - `verified`
   - `failed`
   - `rolled_back`
2. Incident severity logic:
   - `P0`: auth outage or platform outage -> immediate rollback consideration
   - `P1`: repeated sync failures -> same-window remediation
   - `P2`: budget warning or intermittent issues -> daily remediation
3. Rollback trigger:
   - if core flow smoke tests fail post-release, initiate rollback to last known-good release.

## Failure Modes and Recovery
1. Failure: deploy succeeds but auth flow breaks.
   - Recovery: rollback release; verify OAuth origin/redirect parity.
2. Failure: webhook ingestion backlog grows.
   - Recovery: inspect event failure codes, clear blocked keys, replay eligible events.
3. Failure: runaway model spend.
   - Recovery: enforce hard cap behavior and downgrade non-critical model actions.
4. Failure: operator dependence on Codex for daily tasks.
   - Recovery: ensure every recurring task has explicit runbook steps and dashboard checks.

## Verification
1. Pass if full student loop works after deploy (login, turn commit, readiness, publish behavior).
2. Pass if rollback can restore stable service within target window.
3. Pass if daily operator checklist can be executed without Codex prompts.
4. Pass if scaling simulation can run two cohorts with isolated data and unchanged invariants.
5. Pass if all configured env vars map to canonical key names only.

## Evidence
1. Cloud release and safety workflow defines approval, rollback, and alert expectations.
2. Operations model and test docs support single-operator pilot viability.
3. Progressive environment hardening is standard for moving from pilot to scalable operations.
