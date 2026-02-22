# CHANGELOG
- 2026-02-21: Added canonical terminology and state definitions (`dev`/`prod`, allowlist states, login states, credit model) to remove ambiguity.
- 2026-02-21: Declared one canonical source of truth for secrets/IDs (`CREDENTIALS_AND_IDS_MATRIX.md`) and linked all docs to it.
- 2026-02-21: Added a single-operator zero -> pilot-ready run order so execution can happen without guesswork.

# Cloud Access Enablement Pack (2026-02-21)

## Purpose
This pack operationalizes the cloud-only access model for the AI Fluency Lab pilot so one operator can go from zero setup to pilot-ready execution.

## Locked Choices (Implemented)
1. Secrets source of truth: `1Password Team Vault`
2. Access model: dedicated service accounts
3. Deployment rights: `dev` auto deploy, `prod` requires manual approval
4. Runtime stack: Supabase + Vercel
5. Access policy: admin allowlist, any email domain can be added
6. Auth policy: Google SSO only (pilot pauses until SSO works)
7. Spend controls: hard monthly cap + daily warning
8. Alerts: Slack + email

## Governance Invariants (Must Not Change)
1. No hidden cross-thread reads
2. No auto-publish
3. No auto-merge
4. Readiness gate remains 2-of-3
5. Trigger model remains commit-event only
6. Human approval required for cohort-level promotion

## Canonical Terminology
| Term | Canonical Value | Definition |
|---|---|---|
| Environment tags | `dev`, `prod` | Lowercase in code/config; title case only in prose. |
| Allowlist state | `allowlisted`, `active`, `suspended`, `revoked` | Participant access lifecycle states. |
| Login state | `never_logged_in`, `login_success`, `login_failed`, `login_blocked_not_allowlisted`, `login_blocked_suspended`, `login_blocked_revoked` | Latest auth outcome recorded for operations. |
| Credit model | Integer balance per participant per `root_problem_version_id` | Default student credits start at 1; decrement only on successful individual position publish. |
| Secret pointer format | `Vault/ItemName#FieldName` | Required format for all secret references in this repo. |
| Env var naming | `AI_LAB_<ENV>_<DOMAIN>_<KEY>` | Canonical environment variable naming convention. |

## Canonical Source of Truth
All required IDs, URLs, config values, and secret pointers are canonical in:
`CREDENTIALS_AND_IDS_MATRIX.md`

Rule:
1. If another doc conflicts with that matrix, the matrix wins.
2. Other docs should reference matrix keys, not duplicate raw values.

## Zero -> Pilot-Ready Operator Run Order
1. Complete `PHASE_0_BOOTSTRAP_CHECKLIST.md`.
2. Fill `CREDENTIALS_AND_IDS_MATRIX.md` with all required values/pointers.
3. Apply `PERMISSIONS_MODEL.md` exactly.
4. Configure runtime and access per `CLOUD_OPERATIONS_MODEL.md`.
5. Configure deploy safety and budget controls per `RELEASE_AND_SAFETY_WORKFLOW.md`.
6. Validate admin operations per `ADMIN_INTERFACES_SPEC.md`.
7. Execute all tests in `TEST_CASES_AND_SCENARIOS.md`.
8. Verify all gates in `BUILD_READY_EXIT_CRITERIA.md` and collect sign-off.

## Document Map
1. `PHASE_0_BOOTSTRAP_CHECKLIST.md` - one-time setup for accounts and vault
2. `CREDENTIALS_AND_IDS_MATRIX.md` - canonical IDs/config/secrets map
3. `PERMISSIONS_MODEL.md` - service and human permission model
4. `CLOUD_OPERATIONS_MODEL.md` - hosted architecture and daily ops
5. `RELEASE_AND_SAFETY_WORKFLOW.md` - deploy, rollback, budget, and alerts
6. `ADMIN_INTERFACES_SPEC.md` - additive admin interface contracts
7. `TEST_CASES_AND_SCENARIOS.md` - acceptance and smoke tests
8. `BUILD_READY_EXIT_CRITERIA.md` - final go/no-go gate
9. `participant_import_template.csv` - CSV bulk import template
