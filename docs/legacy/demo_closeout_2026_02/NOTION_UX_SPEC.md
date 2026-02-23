# Notion UX Spec (Pilot)

## Product Framing
The north star is now explicit and governs all implementation choices:

Use Notion + Supabase + Vercel to run a cycle-scoped, safe, agentic collaboration lab where students brainstorm online around:

**"How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?"**

## Brand and Voice
- Brand: `Applied AI Labs`
- Frontstage title: `Applied AI Labs - AI Fluency at Smeal`
- Voice: professional, simple, human, low-jargon.
- Team term: `Lab Team`
- Publish CTA language: `Add to Lab Record`

## Frontstage Restructure (Applied)
Old frontstage:
- Root page mixed workspace blocks (`Docs`, `Tasks`, raw DB stack).

New frontstage:
- Dedicated page: `Applied AI Labs - AI Fluency at Smeal`
- Ordered sections only:
  1. `What We’re Working On`
  2. `Add a Source`
  3. `My Work`
  4. `Lab Record`
- `Docs` + `Tasks` removed from team-facing flow.

## Team Surface (Visible)
- `Applied AI Labs - AI Fluency at Smeal`
  - `What We’re Working On`
  - `Research Inbox` (source intake)
  - `My Work` (threads/turns + starter brief proposals)
  - `Lab Record`

## Operator Console (Private, Unlinked)
- `Team Intake` (membership sync source of truth)
- `Cycle Controls`
- `Audit View`
- `Archived Internal` (`Docs`, `Tasks`) links only

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

## Canonical URLs (Current)
- Frontstage: `https://www.notion.so/Applied-AI-Labs-AI-Fluency-at-Smeal-30e4c63befac81a6bccdee6c55253ece`
- Operator Console: `https://www.notion.so/Operator-Console-30e4c63befac8139bfb8c5184278b362`
