# Notion Form Specification (Cycle 1)

## Workspace Structure
- student-facing frontstage page: `Applied AI Labs — Cycle 01: AI Fluency at Smeal`
- submit target: Notion Form view of `Idea Intake` (Form name: `Submit Idea`)
- operator-only page (private, unlinked): `Operator Console (Warehouse v1)`

## Frontstage Page Copy (Student View)
Above the fold blocks (exact order):
1. **H1:** `Applied AI Labs`
2. **Subhead:** `We’re collecting high-signal ideas for one focus question this cycle.`
3. **Focus callout (verbatim):**
   `How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?`
4. **Button/link:** `Submit an Idea` (links to the `Submit Idea` form view)
5. **Instruction line:** `3–6 sentences. Concrete beats broad. Submit more than once if your thinking evolves.`

## Form UX Copy
Title: `Submit an Idea`
Prompt: `3–6 sentences. What should Penn State do (or try) to build durable AI fluency?`
Support text: `Submit more than once if your thinking evolves.`

## Notion Database: `Idea Intake`
Required student field:
- `Idea` (rich text or long text)

Optional field (recommended for guests):
- `Email` (email)

System/prefilled fields:
- `Cycle ID` (`cycle_01`) (stored value; cycle state remains managed in Supabase)
- `Focus ID` (`ai_fluency_root`)
- `Focus Question` (fixed text for cycle 1)
- `Created time` (Notion system)
- `Last edited time` (Notion system)
- `Created by` (Notion system)
- `Created by ID` (Notion user id, preferred identity key)
- `Created by Email` (fallback identity key)

## Sharing Model (3–20, guests supported)
1. Share the **frontstage page** to cohort emails (Notion Share).
2. Share **Operator Console** only to operator emails.
3. Guests can submit:
   - if `Created by ID` exists, we attribute to `notion_user:<id>`
   - otherwise, ask them to provide optional `Email` (or the entry is ignored, never anonymous)

## Behavioral Rules
1. Students do not edit database views directly.
2. Form submissions are the canonical intake mode.
3. Form allows multiple submissions.
4. If a response is edited later, pipeline stores it as a new version.
5. If identity is missing (guest without email), the submission is ignored (never anonymous ingestion).

## Operations Notes
- sharing and workspace permissions are managed in Notion
- security and enforcement remain server-side in runtime/Supabase
- webhook ingestion is hosted in Supabase Edge Functions (enqueue-only); workers fetch Notion and generate embeddings asynchronously
