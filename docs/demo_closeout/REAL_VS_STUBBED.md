# Real vs Stubbed

## Real Now
- Cycle isolation enforcement in runtime handlers (explicit `cycle_id` required).
- Identity/membership split (`participants` + `cycle_memberships` model and adapter flow).
- Active-cycle selection endpoint with one-active-membership behavior.
- Cross-cycle thread access denial checks in publish/readiness.
- Deterministic reason-code responses for blocked states.
- Supabase adapter live-path mappings for runtime tables and cycle controls.
- Publish transaction path via DB RPC with non-negative credit guarantees and idempotency replay.
- Notion intake sync:
  - `team_intake` commit-event -> participants/memberships upsert
  - `research_inbox` commit-event -> source + thread + starter brief proposal
- Guided intake flow:
  - `GET /submit` -> `POST /api/sources/submit`
  - server-side validation + commit-event processing + deterministic response
- Google OAuth auth-code flow:
  - `GET /api/auth/google/start`
  - `POST/GET /api/auth/callback/google`
  - signed session cookie with explicit cycle context
- Starter brief generation with provenance and deterministic fallback.
- Branded minimal Vercel home surface at `/`.
- Frontstage card presentation layer:
  - one workspace-to-cards mapper
  - visible top status callout + `next_best_action`
  - details/provenance collapsed by default
- Operator summary endpoint (`GET /api/operator/summary`) for cycle health + reason-code visibility.
- Hostile and flow tests covering cycle boundaries + intake + publish safety.

## Stubbed / Deferred
- Email-only login payload fallback remains for local test harness compatibility.
- Notion sharing/group permissions remain manual by platform constraints.
- Cloud deploy wiring and live Notion webhook registration still require operator env setup steps.
- Full operator digest write-back into Notion is deferred (summary endpoint is live now).
- Notion idempotency is best-effort:
  - uses idempotency property match when DB schema includes one
  - otherwise falls back to deterministic title match
  - full page-content patch/update path is deferred (current behavior is create-or-reuse)

## Minimum Next Delta to 5-Student Pilot
1. Apply latest migrations to linked Supabase project and deploy runtime to Vercel.
2. Configure Google OAuth env vars and callback URL in Google + Vercel.
3. Configure Notion Team Intake + Research Inbox DB sharing and webhook fields.
4. Run `MINIMUM_TESTS_TO_RUN` and full acceptance suite on cloud URL.
5. Add dad email through Team Intake and verify full loop twice.
