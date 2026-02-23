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
- Starter brief generation with provenance and deterministic fallback.
- Branded minimal Vercel home surface at `/`.
- Hostile and flow tests covering cycle boundaries + intake + publish safety.

## Stubbed / Deferred
- Full Google OAuth token exchange/verification is still simplified to request email flow for local/runtime tests.
- Notion page-property mapping is intentionally minimal and may require schema-specific extension for broader property sets.
- Cloud deploy wiring and live Notion webhook registration still require operator env setup steps.
- Operator analytics/digest layer is deferred (non-blocking to pilot loop).

## Minimum Next Delta to 5-Student Pilot
1. Apply latest migrations to linked Supabase project and deploy runtime to Vercel.
2. Configure Notion Team Intake DB and webhook fields exactly as runbook specifies.
3. Run `MINIMUM_TESTS_TO_RUN` against cloud URL with real allowlisted + blocked accounts.
4. Add dad email through Notion Team Intake and verify full publish loop.
5. Capture evidence bundle and snapshot for Innovation Day baseline cycle.
