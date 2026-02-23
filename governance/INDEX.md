# Governance Index

## Folder Map
1. `governance/frozen_v1/`
   - Immutable frozen baseline for architecture, blueprint, pilot scope, and snapshot readme.
   - Use when auditing what was approved at freeze time.
2. `governance/enterprise_pack/`
   - Operator/governance runbook set (permissions, operations, safety, readiness, test scenarios, admin interfaces).
   - Use for ongoing platform operations and controls.
3. `governance/pilot_pack/`
   - Pilot-focused matrices, setup steps, minimum tests, and deferred list.
   - Use during pilot execution and quick operator bring-up.
4. `governance/templates/`
   - Reusable import/template artifacts.
   - Use for participant import and repeatable setup tasks.

## Recommended Usage Order
1. Start with `governance/frozen_v1/README.md` for baseline context.
2. Run `governance/enterprise_pack/PHASE_0_BOOTSTRAP_CHECKLIST.md`.
3. Fill/validate `governance/enterprise_pack/CREDENTIALS_AND_IDS_MATRIX.md` and `governance/pilot_pack/PILOT_ONLY_MATRIX.md`.
4. Execute `governance/pilot_pack/MINIMUM_TESTS_TO_RUN.md` and `governance/enterprise_pack/TEST_CASES_AND_SCENARIOS.md`.
5. Confirm go/no-go with `governance/enterprise_pack/BUILD_READY_EXIT_CRITERIA.md`.
