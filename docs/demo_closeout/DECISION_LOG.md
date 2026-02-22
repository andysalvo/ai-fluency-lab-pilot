# Decision Log

## North-Star Statement (Locked)
The north star is now explicit and governs all implementation choices:

Use Notion + Supabase + Vercel to run a cycle-scoped, safe, agentic collaboration lab where students brainstorm online around:

**"How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?"**

## Final Sprint Decisions
- Decision: frontstage was restructured to a strict lab-only layout with four sections only: `What We’re Working On`, `Add a Source`, `My Work`, `Lab Record`.
- Decision: `Docs` and `Tasks` were removed from team-facing frontstage and kept as operator-only internal references.
- Decision: brand voice is now `professional + simple + human` for 17-21 users, with `Lab Team` language.
- Decision: final publish CTA language is `Add to Lab Record`.
- Decision: canonical frontstage title is `Applied AI Labs - AI Fluency at Smeal`.
- Decision: publish is allowed for `student` role on owned thread only, with server-side gates (`2-of-3` + explicit confirmation + credit check).
- Decision: Notion intake sync is webhook-first (`team_intake`) with explicit admin backfill endpoint for recovery.
- Decision: source commit-event path is `research_inbox` -> auto thread -> starter brief proposal -> visible surface update.
- Decision: starter brief uses `OpenAI + deterministic fallback` and always includes provenance label `Built only from: <URL>`.
- Decision: Supabase adapter is now the live-path implementation (no fail-fast stubs on pilot path).
- Decision: primary student intake is now guided software UI (`GET /submit`) to avoid direct Notion table interaction errors.
- Decision: guided submit API (`POST /api/sources/submit`) is cycle-scoped, idempotent, and still commit-event only.
- Decision: Google OAuth now supports production auth code exchange (`/api/auth/google/start` -> `/api/auth/callback/google`) with signed state.
- Decision: session cookie stores explicit active cycle context; runtime still re-checks membership and cycle state server-side every request.
- Decision: operator scale visibility added via `GET /api/operator/summary` (ingest/publish/blocked-code counts).

## Card Presentation Stabilization (Demo Safety)
- Decision: frontstage now renders through one `CardViewModel` mapping layer so thread artifacts are formatted consistently and can be tuned in one place.
- Decision: provenance and metadata remain required, but are collapsed under `Details` in both Vercel cards and Notion card blocks to keep primary reading flow focused.
- Decision: thread mutation endpoints (`/api/questions/round/start`, `/api/questions/answer`, `/api/lab-brief/propose`) now resolve through one orchestration guard path in `edge-entry.ts`.
- Decision: readiness logic is computed by `evaluateReadiness` only; guided-round logic now emits signals and defers reason-code evaluation to the canonical readiness module.
- Decision: Notion write-back is deterministic and best-effort idempotent (idempotency key lookup when available, title fallback) with non-blocking failure logging.

## Alternatives Rejected
- Rejected: default to "current cycle" from config.
  - Reason: creates ambiguous authority and hidden coupling between auth/session/runtime.
- Rejected: permissions driven from Notion visibility.
  - Reason: Notion is UX-only and cannot be security boundary.
- Rejected: open-ended autonomous publish behavior.
  - Reason: violates explicit human confirmation and credit safety invariants.

## Implementation Order
1. Schema + constraints
2. Runtime enforcement + reason codes
3. Hostile tests
4. Woah mechanics

## Deviations
- Logo asset was applied as `/branding/applied-ai-labs-logo.svg` for deterministic rendering in this environment.
- Notion sharing/membership remains one manual operator step by Notion platform design (cannot be fully API-automated for guests).
- Remaining deferred scope is documented in `REAL_VS_STUBBED.md`.
