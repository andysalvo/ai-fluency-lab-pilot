# API Surface (Cycle-Isolation Slice)

## Core
- `GET /`
- `GET /submit`
- `GET /health`
- `POST /api/notion/webhook`
- `POST /api/sources/submit`
- `GET /api/auth/google/start`
- `POST /api/auth/callback/google`
- `POST /api/auth/logout`
- `POST /api/session/active-cycle/select`
- `POST /api/visible-surface`
- `POST /api/actions/readiness/evaluate`
- `POST /api/actions/publish`
- `GET /api/operator/summary`

## Admin
- `POST /api/admin/intake/backfill`
- `POST /api/admin/cycles/create`
- `POST /api/admin/cycles/bootstrap`
- `POST /api/admin/cycles/{cycle_id}/activate`
- `POST /api/admin/cycles/{cycle_id}/freeze`
- `POST /api/admin/cycles/{cycle_id}/snapshot`
- `POST /api/admin/cycles/{cycle_id}/export`
- `POST /api/admin/cycles/{cycle_id}/reset-next`

## Contract Highlights
- Protected/read-write actions require explicit `cycle_id`.
- Missing cycle returns deterministic denial code.
- Cross-cycle resource attempts are denied.
- Publish remains explicit and guarded (no auto-publish), and is transactional with non-negative credits.
- Guided intake (`/submit` -> `/api/sources/submit`) writes commit-events only and returns deterministic status.
- OAuth supports real Google auth code exchange via `/api/auth/google/start` + `/api/auth/callback/google`.
- Webhook commit-event routes:
  - `team_intake` -> membership sync
  - `research_inbox` -> source intake + starter brief proposal
