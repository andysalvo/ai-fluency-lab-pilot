# CHANGELOG
- 2026-02-21: Added operator runbook and runtime flow with explicit allowlist/login/credit behavior.
- 2026-02-21: Normalized terminology to canonical `dev`/`prod` and state names used across the pack.
- 2026-02-21: Added explicit reference to matrix keys as canonical configuration source.

# Cloud Operations Model

## Objective
Run pilot entirely in hosted infrastructure with no critical local dependency.

## Hosted Components
1. Vercel Web (student/operator surfaces)
2. Vercel Admin dashboard (allowlist, roles, credits, status)
3. Supabase (auth, database, edge functions, audit/logging)
4. Notion (coordination and visible workflow)
5. OpenAI API (agent inference)
6. 1Password (secret source of truth)

## Canonical Config Source
All component IDs, URLs, and secret pointers must come from:
`CREDENTIALS_AND_IDS_MATRIX.md`

## Required Admin Dashboard Functions
1. Add participant email (single add)
2. Bulk import participant emails (CSV)
3. Assign role (`student`, `moderator`, `facilitator`)
4. Set allowlist state (`allowlisted`, `active`, `suspended`, `revoked`)
5. Set or adjust position credits
6. View participant + login state

## SSO Policy
1. Google SSO only
2. No fallback auth for pilot week
3. Pilot pauses until SSO smoke tests pass

## Runtime Data Flow (High-Level)
1. Student starts Google SSO login.
2. Backend checks allowlist state:
   - not found -> `login_blocked_not_allowlisted`
   - `suspended` -> `login_blocked_suspended`
   - `revoked` -> `login_blocked_revoked`
   - `allowlisted` or `active` -> continue
3. On first successful login, state becomes `active` and login state records `login_success`.
4. Student actions trigger commit events from thread interactions.
5. Supabase handlers run and write audit logs.
6. Output remains gated by readiness + human confirmation.
7. Credits decrement only on successful individual position publish.

## Single-Operator Daily Runbook
1. Preflight (5 min): check alerts, SSO health, sync health.
2. Access ops (5 min): process participant adds/suspensions/role fixes.
3. Session window (meeting/daily): monitor auth and critical errors.
4. End-of-day (10 min): verify budget status, unresolved incidents, and next-day blockers.

## Operational Guardrails
1. No hidden cross-thread reads
2. No auto-publish to outputs
3. No auto-merge threads
4. Commit-event triggers only
5. No local machine as runtime dependency
