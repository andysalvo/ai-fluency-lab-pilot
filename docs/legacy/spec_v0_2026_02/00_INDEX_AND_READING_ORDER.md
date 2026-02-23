# 00 Index and Reading Order

## Intent
Define the canonical reading and decision order for AI Fluency Lab OS so a contextless agent or operator can execute the build and run plan without hidden assumptions.

## Canonical Inputs
1. Session directives in this repository conversation.
2. Frozen architecture pack:
   - `/Users/andysalvo_1/Documents/GitHub/student_ai_hub/frozen/v1_ai_fluency_lab_pilot_2026_02_20/README.md`
   - `/Users/andysalvo_1/Documents/GitHub/student_ai_hub/frozen/v1_ai_fluency_lab_pilot_2026_02_20/BUILD_BLUEPRINT_V2_BUILDABLE_REVIEWED.md`
   - `/Users/andysalvo_1/Documents/GitHub/student_ai_hub/frozen/v1_ai_fluency_lab_pilot_2026_02_20/ARCHITECTURE_DECISIONS.md`
   - `/Users/andysalvo_1/Documents/GitHub/student_ai_hub/frozen/v1_ai_fluency_lab_pilot_2026_02_20/PILOT_SCOPE.md`
3. Pilot-only cloud operations pack:
   - `/Users/andysalvo_1/Documents/GitHub/student_ai_hub/hub/docs/ai_fluency_lab_os/cloud_access_enablement_2026_02_21/`
   - `/Users/andysalvo_1/Documents/GitHub/student_ai_hub/hub/docs/ai_fluency_lab_os/cloud_access_enablement_2026_02_21/More/`
4. Runtime key map in this repo:
   - `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/PILOT_KEYS_INTAKE.md`

## Canonical Outputs
1. A deterministic read/execution order for all canonical specs.
2. A conflict-resolution policy that prevents governance drift.
3. A shared glossary for implementation and operations.
4. A zero-context execution checklist for a new operator or agent.

## Normative Rules
1. Exactly 10 canonical spec files exist under `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/` with names `00` to `09`.
2. If documents conflict, precedence is:
   1. Latest session directives.
   2. Frozen architecture docs.
   3. Pilot-only cloud ops docs.
   4. Legacy docs only when non-conflicting.
3. Locked invariants from the frozen and pilot packs MUST NOT be relaxed.
4. Secrets MUST be referenced only by pointer format (`Vault/Item#Field`) and MUST NOT be committed.
5. Any implementation decision not covered by these 10 files is invalid until documented as an additive decision record.

## Reading Order
1. `00_INDEX_AND_READING_ORDER.md`
2. `01_PRODUCT_INTENT_AND_LOCKED_INVARIANTS.md`
3. `03_NOTION_INFORMATION_ARCHITECTURE_AND_PAGE_TEMPLATES.md`
4. `04_RUNTIME_ARCHITECTURE_AND_DATA_MODEL.md`
5. `05_AGENT_ORCHESTRATION_AND_DECISION_LOGIC.md`
6. `07_SECURITY_AUTH_ACCESS_AND_GOVERNANCE.md`
7. `09_ACCEPTANCE_TESTS_SLO_AND_HANDOFF.md`
8. `02_STUDENT_EXPERIENCE_AND_NOTION_FRONTSTAGE.md`
9. `06_RESEARCH_BACKED_LEARNING_ENGINE.md`
10. `08_DEPLOYMENT_OPERATIONS_AND_SCALING_RUNBOOK.md`

## State and Decision Logic
1. Start in `spec_loaded=false`.
2. Set `spec_loaded=true` only after all 10 files are read in order.
3. For each decision:
   1. Determine if the decision touches a locked invariant.
   2. If yes, enforce invariant and reject incompatible change.
   3. If no, select the option that preserves Notion-first operations and lowest operational complexity.
4. For runtime configuration:
   1. Use key names from `PILOT_ONLY_MATRIX.md` and `PILOT_KEYS_INTAKE.md`.
   2. Resolve secrets from 1Password pointers only at runtime.
5. For release decisions:
   1. `dev` deploy may be automatic.
   2. `prod` deploy requires explicit approval evidence.

## Zero-Context Execution Workflow
1. Validate the 10-doc set exists and passes invariant text checks.
2. Fill non-secret runtime values and secret pointers.
3. Provision or verify Notion, Supabase, Vercel, Google SSO, OpenAI connectivity.
4. Apply schema and API contracts exactly as defined in docs `03` through `05`.
5. Enforce auth/governance from doc `07` before allowing student traffic.
6. Run minimum and full acceptance tests from doc `09`.
7. Open pilot to allowlisted users only.
8. Operate with runbook controls from doc `08`.

## Glossary
1. `commit-event`: an explicit user commit action that is allowed to trigger orchestration.
2. `readiness gate`: pass condition requiring at least 2 of 3 criteria (`claim`, `value`, `difference`) plus explicit confirmation.
3. `allowlist_state`: `allowlisted`, `active`, `suspended`, `revoked`.
4. `login_state`: `never_logged_in`, `login_success`, `login_failed`, `login_blocked_not_allowlisted`, `login_blocked_suspended`, `login_blocked_revoked`.
5. `root_problem_version_id`: active root problem statement identifier required on threads and outputs.
6. `publish_state`: runtime output lifecycle state defined in doc `05`.
7. `readiness_reason_code`: deterministic reason returned when readiness fails, defined in docs `05` and `09`.

## Failure Modes and Recovery
1. Failure: conflicting requirements across docs.
   - Recovery: apply precedence order; record conflict and chosen resolution in an additive change note.
2. Failure: missing runtime key value.
   - Recovery: block release; fill key in `PILOT_KEYS_INTAKE.md` and matrix source.
3. Failure: invariant text drift between docs.
   - Recovery: stop implementation and normalize wording to the canonical invariant set in doc `01`.

## Verification
1. Pass if exactly 10 files exist in `/docs/spec` with `00` to `09` names.
2. Pass if all files contain required sections:
   - `Intent`
   - `Canonical Inputs`
   - `Canonical Outputs`
   - `Normative Rules`
   - `State and Decision Logic`
   - `Failure Modes and Recovery`
   - `Verification`
   - `Evidence`
3. Pass if locked invariants appear unchanged across docs `01`, `05`, `07`, `09`.
4. Pass if no committed file contains a raw secret.

## Evidence
1. Frozen architecture and scope documents define invariant architecture and problem framing.
2. Cloud access pack defines operational states, release controls, and single-operator execution model.
3. RFC 2119 style normative language pattern (`MUST`, `MUST NOT`, `SHOULD`) improves implementation consistency for multi-author specs.
