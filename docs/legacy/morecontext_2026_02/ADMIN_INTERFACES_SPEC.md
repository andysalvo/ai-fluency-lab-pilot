# CHANGELOG
- 2026-02-21: Added canonical response envelope, error codes, and idempotency behavior for each interface.
- 2026-02-21: Added missing interface for allowlist state changes and clarified credit update semantics.
- 2026-02-21: Normalized CSV contract and comment-line handling for template compatibility with changelog rows.

# Admin Interfaces Specification (Additive)

## Scope
These interfaces are additive and do not change frozen governance constraints.

## Shared Response Envelope
All admin endpoints return:
```json
{
  "ok": true,
  "data": {},
  "error": null
}
```

Failure envelope:
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

## Canonical Enums
1. `role`: `student` | `moderator` | `facilitator`
2. `allowlist_state`: `allowlisted` | `active` | `suspended` | `revoked`
3. `login_state`: `never_logged_in` | `login_success` | `login_failed` | `login_blocked_not_allowlisted` | `login_blocked_suspended` | `login_blocked_revoked`

## 1) addParticipant
- Signature: `addParticipant(email, role="student", initial_credits=1)`
- Output: `participant_id`, `allowlist_state`, `role`, `credit_balance`, `status`
- Idempotency: duplicate email returns existing participant and `status="exists"`
- Validation:
  1. Email format valid
  2. Role in allowed enum
  3. `initial_credits` integer >= 0

## 2) bulkAddParticipants
- Signature: `bulkAddParticipants(csv_blob)`
- Output: `accepted_count`, `rejected_rows`
- CSV contract:
  1. Required columns: `email,role`
  2. Optional columns: `initial_credits,allowlist_state,notes`
  3. Lines starting with `#` are ignored
- Validation:
  1. Each row validated independently
  2. Rejected rows include `row_number` and `reason_code`

## 3) setParticipantCredits
- Signature: `setParticipantCredits(participant_id, credits_delta, reason)`
- Output: `participant_id`, `new_credit_balance`
- Validation:
  1. `reason` required
  2. `credits_delta` integer
  3. Resulting balance cannot be negative

## 4) setParticipantState
- Signature: `setParticipantState(participant_id, allowlist_state, reason)`
- Output: `participant_id`, `allowlist_state`
- Validation:
  1. State must be valid enum
  2. Transition must be allowed by state machine
  3. Reason required

## 5) listParticipants
- Signature: `listParticipants(filter)`
- Output: `rows`
- Filter fields:
  1. `role`
  2. `allowlist_state`
  3. `login_state`
  4. `created_after`

## 6) approveProdRelease
- Signature: `approveProdRelease(release_id, approver_id)`
- Output: `release_id`, `status`
- Validation:
  1. `approver_id` has final approver role
  2. Release summary attached
  3. Required checks passed

## 7) recordRootRevisionDecision
- Signature: `recordRootRevisionDecision(root_problem_version_id, decision_by, notes)`
- Output: `decision_record_id`, `status`
- Validation:
  1. Decision actor is facilitator or moderator
  2. Notes required
  3. Revision outside lock window requires `exception_flag=true`

## Standard Error Codes
1. `INVALID_EMAIL`
2. `INVALID_ROLE`
3. `INVALID_STATE_TRANSITION`
4. `INSUFFICIENT_PERMISSIONS`
5. `NEGATIVE_CREDIT_BALANCE`
6. `RELEASE_CHECKS_INCOMPLETE`
7. `MISSING_REQUIRED_FIELD`
