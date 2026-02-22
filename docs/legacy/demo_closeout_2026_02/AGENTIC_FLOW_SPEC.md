# Agentic Flow Spec

## Intent
The north star is now explicit and governs all implementation choices:

Use Notion + Supabase + Vercel to run a cycle-scoped, safe, agentic collaboration lab where students brainstorm online around:

**"How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?"**

## Isolation Guarantee
All artifacts are cycle-scoped; team members can only read/write within cycles where they have an active membership; no endpoint may infer cycle.

## Trigger Model
- Commit-event only.
- Webhook ingest requires explicit `cycle_id`.
- Duplicate ingest returns deterministic replay payload; no re-run.
- Post-ingest handlers (cycle-scoped):
  - `team_intake` -> participant/membership sync
  - `research_inbox` -> source submission + thread + starter brief proposal

## Starter Brief Contract
- Input contract from source submission:
  - `url` (required)
  - `relevance_note` (required)
  - `submitted_by` (required)
- Generated proposal sections:
  - `what_this_source_says`
  - `how_it_connects_to_focus`
  - `next_angles` (3)
  - `provenance = Built only from: <URL>`
- Allowed generation context only:
  - submitted URL
  - bounded fetched content or provided excerpt
  - relevance note
  - cycle focus snapshot
- Disallowed:
  - cross-thread context
  - cross-cycle context
  - auto-publish behavior

## Guard Sequence (Protected Actions)
1. Resolve identity by email.
2. Require explicit `cycle_id`.
3. Enforce global halt and cycle halt switches.
4. Resolve participant global state (`participants`).
5. Resolve membership (`cycle_memberships`) for `(participant_id, cycle_id)`.
6. Enforce cycle state policy (`active|locked|archived`).
7. Validate resource belongs to same cycle (thread/source/brief/publish id checks).
8. Write protected action audit with deterministic reason code.

## Read Policy
- `active`: read/write allowed with role gates.
- `locked`: read allowed, writes/publish denied.
- `archived`: participant denied, operator/admin read-only.

## Replay Determinism
- Ingest idempotency key scopes to cycle.
- First successful payload is persisted.
- Replay returns persisted payload bytes/fields without regeneration.
- Publish uses protected-action idempotency key and replays stored transaction payload.

## Failure Modes
- Missing cycle: `CYCLE_NOT_SELECTED`
- No membership: `NO_MEMBERSHIP_FOR_CYCLE`
- Cross-cycle ID access: `CROSS_CYCLE_ACCESS_DENIED`
- Halted globally: `HALTED_GLOBAL`
- Halted per cycle: `HALTED_CYCLE`
- Locked cycle writes: `CYCLE_LOCKED`
- Archived participant read: `CYCLE_ARCHIVED`
