# Notion UX Spec (Pilot)

## Product Framing
The north star is now explicit and governs all implementation choices:

Use Notion + Supabase + Vercel to run a cycle-scoped, safe, agentic collaboration lab where students brainstorm online around:

**"How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?"**

## Team Surface (Visible)
- `AI Fluency Lab — Smeal`
  - `What We’re Working On`
  - `Research Inbox` (source intake)
  - `Research Threads`
  - `My Work` (thread + starter brief proposals)
  - `Lab Record`

## Operator Console (Private, Unlinked)
- `Team Intake` (membership sync source of truth)
- `Cycle Controls`
- `Audit View`

## Required DB/Property Notes
- Every operational record must include `cycle_id`.
- Source intake contract remains minimal:
  - `url` (required)
  - `relevance_note` (required, <=500 chars)
- Team intake contract:
  - `email` (required)
  - `role` (`student|moderator|facilitator|operator`)
  - `membership_state` (`invited|active|inactive|revoked`)
  - `credits` (integer >= 0)
- Notion permissions are convenience only.
- Server enforcement remains membership + cycle state checks.

## Permission Model
- Team members: visible team pages only.
- Operators/admins: operator console access.
- Security enforcement is always runtime-side, never Notion-only.
