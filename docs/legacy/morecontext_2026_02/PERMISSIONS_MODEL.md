# CHANGELOG
- 2026-02-21: Added explicit role matrix and least-privilege boundaries for service accounts and human operators.
- 2026-02-21: Added allowlist state machine and login state definitions used by admin interfaces and tests.
- 2026-02-21: Added canonical credit model rules to remove ambiguity around consumption and overrides.

# Permissions Model

## Principles
1. Least privilege by default.
2. `prod` actions require explicit approval authority.
3. Role grants are explicit and auditable.
4. All policy values map to keys in `CREDENTIALS_AND_IDS_MATRIX.md`.

## Service Account Permission Matrix
| Platform | `dev` Permission | `prod` Permission | Restricted Actions |
|---|---|---|---|
| Notion Integration | Read/write required pilot databases/pages | Read/write required pilot databases/pages | No access outside pilot pages/DBs |
| Supabase Service Identity | Project deploy/admin | Restricted deploy path with approval gate | No unmanaged direct table mutations in prod |
| Vercel Service Identity | Auto deploy on `dev` branch merges | Deploy only after manual prod approval | No direct bypass of approval gate |
| GitHub Service Identity | PR checks, merge automation on `dev` | Release candidate prep only | No direct forced pushes to `main` |
| Google OAuth Config Owner | Manage OAuth config for test and prod URLs | Manage OAuth config for prod URLs | No shared personal account ownership |

## Human Role Permissions
| Role | Allowed | Not Allowed |
|---|---|---|
| Final Prod Approver | Approve/reject prod releases, authorize rollback | Bypass release evidence checks |
| Facilitator | Co-own root revision decisions at lock boundary | Publish cohort artifact without required moderation path |
| Moderator | Grant/revoke credits, approve cohort promotions, enforce governance | Change deployment policies |
| Operator | Add/remove/suspend participants, run test suite, maintain alerts | Override locked architectural invariants |
| Student | Participate in threads and outputs under existing gates | Self-grant credits, publish bypassing readiness |

## Allowlist State Machine (Canonical)
States:
1. `allowlisted` - Email added, has not completed first successful login
2. `active` - Allowlisted and authenticated successfully
3. `suspended` - Temporarily blocked by operator
4. `revoked` - Access removed; re-entry requires explicit add action

Valid transitions:
1. `allowlisted -> active` on successful SSO login
2. `allowlisted -> revoked` by operator action
3. `active -> suspended` by operator action
4. `suspended -> active` by operator action
5. `active -> revoked` by operator action
6. `revoked -> allowlisted` only via explicit re-add by operator

## Login States (Canonical)
1. `never_logged_in`
2. `login_success`
3. `login_failed`
4. `login_blocked_not_allowlisted`
5. `login_blocked_suspended`
6. `login_blocked_revoked`

## Credit Model (Canonical)
1. Credits are tracked per participant per active `root_problem_version_id`.
2. Default student initial credit: `1`.
3. Moderator and facilitator initial credit default: `0` unless explicitly set.
4. Credit decrement occurs only on successful individual position publish.
5. No decrement occurs for failed readiness, canceled publish, or draft saves.
6. Credit balance must never go negative.

## Participant Access Policy
1. Admin allowlist only.
2. Any email domain is allowed if explicitly added by admin.
3. Default role on add: `student`.
4. Access is denied until allowlist state is at least `allowlisted`.
