# 07 Security, Auth, Access, and Governance

## Intent
Define enforceable security and governance controls so the pilot is safe, auditable, and aligned with locked constraints while remaining operator-manageable.

## Canonical Inputs
1. Google OAuth credentials and URL settings:
   - `pilot.sso.google_client_id` (pointer)
   - `pilot.sso.google_client_secret` (pointer)
   - `pilot.sso.authorized_origins`
   - `pilot.sso.redirect_uris`
2. Participant and role data from runtime tables.
3. Secret pointers and operational metadata from 1Password matrix.
4. Release control requirements from cloud safety docs.

## Canonical Outputs
1. Deterministic access decisions for every login and action.
2. Enforced allowlist state machine with auditable transitions.
3. Secret-handling policy and evidence trail.
4. Governance guardrails for publish, promotion, and release actions.

## Normative Rules
1. Authentication MUST be Google SSO only for pilot operations.
2. Access MUST be allowlist-controlled; non-allowlisted users are blocked.
3. Allowed participant states are exactly:
   - `allowlisted`, `active`, `suspended`, `revoked`
4. Allowed login states are exactly:
   - `never_logged_in`, `login_success`, `login_failed`, `login_blocked_not_allowlisted`, `login_blocked_suspended`, `login_blocked_revoked`
5. Secret values MUST NOT be committed; only pointer format is permitted.
6. Cross-thread reads MUST require explicit opt-in scope and runtime provenance logs.
7. High-risk promotion actions MUST require moderator approval.
8. `prod` releases MUST require explicit approver evidence.

## Access and Role Model
1. Roles:
   - `student`
   - `moderator`
   - `facilitator`
   - `operator` (operational capability, may map to moderator/facilitator privileges by implementation)
2. Role boundaries:
   - students cannot self-grant credits or bypass readiness
   - moderators manage credits and governance approvals
   - facilitators co-own root revision decisions
   - final approver authorizes production release

## Allowlist State Machine
1. Valid transitions:
   1. `allowlisted -> active` on successful login.
   2. `allowlisted -> revoked` by operator.
   3. `active -> suspended` by operator.
   4. `suspended -> active` by operator.
   5. `active -> revoked` by operator.
   6. `revoked -> allowlisted` only via explicit re-add.
2. Invalid transitions MUST be rejected with `INVALID_STATE_TRANSITION`.

## Governance Controls
1. No hidden cross-thread reads.
2. No auto-publish.
3. No auto-merge.
4. Commit-event triggers only.
5. Readiness gate enforced server-side.
6. Credit decrement only after successful publish.

## State and Decision Logic
1. Login flow:
   1. Validate Google token.
   2. Lookup participant by email.
   3. If no participant, set `login_blocked_not_allowlisted` and deny.
   4. If `suspended`, set `login_blocked_suspended` and deny.
   5. If `revoked`, set `login_blocked_revoked` and deny.
   6. If `allowlisted` or `active`, allow and set `login_success`; promote `allowlisted` to `active` on first success.
2. Secret access flow:
   1. Resolve pointer at runtime.
   2. Inject into process environment only.
   3. Never persist secret value in logs or databases.
3. Release governance flow:
   1. Verify release evidence bundle.
   2. Require approver identity.
   3. Execute deployment or block with reason.

## Failure Modes and Recovery
1. Failure: OAuth redirect mismatch.
   - Recovery: align Google and Supabase/Vercel URLs exactly and re-test.
2. Failure: allowlisted user blocked unexpectedly.
   - Recovery: verify email exact match and current allowlist state.
3. Failure: secret leaked into logs or files.
   - Recovery: rotate secret immediately, purge exposure, and perform audit review.
4. Failure: unauthorized cross-thread read detected.
   - Recovery: block request, record incident, and review scope validation logic.

## Verification
1. Pass if non-allowlisted login is blocked with `login_blocked_not_allowlisted`.
2. Pass if first successful allowlisted login transitions to `active`.
3. Pass if suspended and revoked users are blocked with canonical login states.
4. Pass if repository scan detects no raw secrets.
5. Pass if release to `prod` is blocked without approval evidence.
6. Pass if every cross-thread read has scope and provenance entry.

## Evidence
1. Cloud operations and permissions docs define canonical state machine, login states, and release controls.
2. Least-privilege and auditability principles are consistent with standard secure operations guidance.
3. OAuth provider best practices require strict origin/redirect matching.
