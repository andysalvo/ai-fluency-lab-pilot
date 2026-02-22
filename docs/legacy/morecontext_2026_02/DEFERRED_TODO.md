# CHANGELOG
- 2026-02-21: Added explicit top-line clarification that deferrals are intentional for fast pilot shipping and governed by re-enable triggers.

# DEFERRED_TODO

This is intentionally postponed to ship the pilot fast; re-enable triggers define when to harden.

| Deferred item | Risk of deferral | Trigger to re-enable | Owner role |
|---|---|---|---|
| Environment split (separate environments) | Less isolation for experiments | Pilot is stable for 1 full week | Operator |
| Full release ceremony/approval workflow | Higher chance of informal deploy mistakes | First external-facing pilot demo date is set | Final approver |
| Rollback ceremony drill | Slower incident response if deployment breaks | First major outage or before larger cohort launch | Operator |
| Advanced alerts (full incident routing) | Issues may be seen later | More than 10 active users or repeated incidents | Operator |
| Budget automation (hard-stop tooling beyond manual checks) | Cost can rise unexpectedly | Usage reaches 50% of monthly cap | Operator + facilitator |
| Load/performance tests | Unknown behavior under higher concurrency | Cohort grows above initial pilot size | Operator |
| Expanded UX/admin dashboard features | Manual ops burden remains higher | Baseline pilot tests pass consistently | Operator |
| Automated access reviews/secret rotation workflows | Security hygiene depends on manual process | Pilot moves beyond short-run test phase | Security owner |
