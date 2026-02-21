# Decision Log

## North-Star Statement (Locked)
The north star is now explicit and governs all implementation choices:

Use Notion + Supabase + Vercel to run a cycle-scoped, safe, agentic collaboration lab where students brainstorm online around:

**"How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?"**

## Final Sprint Decisions
- Decision: publish is allowed for `student` role on owned thread only, with server-side gates (`2-of-3` + explicit confirmation + credit check).
- Decision: Notion intake sync is webhook-first (`team_intake`) with explicit admin backfill endpoint for recovery.
- Decision: source commit-event path is `research_inbox` -> auto thread -> starter brief proposal -> visible surface update.
- Decision: starter brief uses `OpenAI + deterministic fallback` and always includes provenance label `Built only from: <URL>`.
- Decision: Supabase adapter is now the live-path implementation (no fail-fast stubs on pilot path).

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
- None in this slice. Remaining deferred scope is documented in `REAL_VS_STUBBED.md`.
