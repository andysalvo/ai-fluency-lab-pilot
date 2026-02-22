# Product Scope (Warehouse v1)

## Objective
Ship a Notion-first submission flow where each student idea becomes:
1. a durable row in Supabase
2. a versioned entry
3. an embedding for downstream analysis

## In Scope
- one Notion database (`Idea Intake`) with Form view
- one fixed focus question for cycle 1
- required idea text input (3-6 sentences)
- Notion webhook ingestion to Supabase
- append-only version rows for edits
- non-blocking embedding generation
- operator analysis queries in Supabase

## Out of Scope
- advanced student UX beyond Notion form
- autonomous model interventions in student flow
- cross-cycle inference features in UI
- replacing existing governed publish/readiness contracts

## Locked v1 Decisions
- `cycle_id = cycle_01`
- `focus_id = ai_fluency_root`
- identity = Notion `created_by` user id when available; fallback to email
- multiple submissions per student are allowed
- edits produce new versions

## Success Criteria
1. Students can submit in under 3 minutes.
2. New submissions appear in Supabase quickly and reliably.
3. Duplicate webhook deliveries do not produce duplicate versions.
4. Operator can query both cycle-specific and global idea sets.
