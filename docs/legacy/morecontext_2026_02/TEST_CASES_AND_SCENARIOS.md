# CHANGELOG
- 2026-02-21: Expanded tests to cover allowlist state machine, login states, and credit model semantics.
- 2026-02-21: Added source-of-truth consistency checks so config drift is caught early.
- 2026-02-21: Added explicit pass criteria for single-operator readiness.

# Test Cases and Scenarios

## Test Execution Rule
Run all tests in `dev` before any `prod` release candidate is approved.

## A) Participant Access and State
1. Add one participant manually
   - Expected: participant exists, `allowlist_state=allowlisted`, `login_state=never_logged_in`
2. Successful first login for allowlisted participant
   - Expected: state transitions to `active`, login state `login_success`
3. Attempt login with non-allowlisted email
   - Expected: blocked with `login_blocked_not_allowlisted`
4. Suspend active participant and attempt login
   - Expected: blocked with `login_blocked_suspended`
5. Re-activate suspended participant and login
   - Expected: login succeeds with `login_success`
6. Revoke participant and attempt login
   - Expected: blocked with `login_blocked_revoked`

## B) Bulk Import
7. Import CSV with valid + invalid rows
   - Expected: valid rows accepted, invalid rows rejected with reason codes
8. Import CSV containing changelog/comment lines beginning with `#`
   - Expected: comment lines ignored

## C) Credit Model
9. Add student with default credits
   - Expected: `credit_balance=1`
10. Successful individual position publish
    - Expected: credit decrements by 1
11. Failed readiness publish attempt
    - Expected: credit unchanged
12. Credit decrement below zero attempt
    - Expected: blocked with `NEGATIVE_CREDIT_BALANCE`

## D) Deployment Controls
13. Merge to `dev` triggers auto deploy
    - Expected: deploy succeeds without manual intervention
14. `prod` deploy without approval
    - Expected: blocked
15. `prod` deploy with approval and required checks
    - Expected: deploy starts and status tracked

## E) Budget and Alerts
16. Simulate daily threshold breach
    - Expected: Slack + email warning sent
17. Simulate monthly cap breach
    - Expected: non-critical model actions blocked

## F) Sync and Governance
18. Notion -> Supabase sync event succeeds
    - Expected: event logged as success
19. Verify no hidden cross-thread reads
    - Expected: system reads only opt-in scope
20. Verify no auto-publish
    - Expected: output remains draft unless readiness passed + human confirmation
21. Verify no auto-merge
    - Expected: no merge occurs without explicit human action

## G) SSO
22. Google SSO smoke test
    - Expected: login works for allowlisted user
23. SSO misconfiguration
    - Expected: pilot marked blocked until fixed

## H) Rollback
24. Trigger rollback from failed `prod` deploy
    - Expected: previous stable version restored and incident recorded

## I) Source-of-Truth Consistency
25. Compare env var names used in runtime config with `CREDENTIALS_AND_IDS_MATRIX.md`
    - Expected: exact match, no undocumented env vars
26. Verify all required matrix keys are filled
    - Expected: no `TBD` for required items before pilot start
