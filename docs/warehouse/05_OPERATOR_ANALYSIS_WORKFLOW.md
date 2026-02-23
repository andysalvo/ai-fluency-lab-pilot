# Operator Analysis Workflow (v1)

## Operator Role in v1
Codex acts as an operator-side analyst, not a student copilot.

## Daily Workflow
1. Check ingestion health:
   - recent `ingest_events`
   - failed events and reasons
2. Check embedding health:
   - pending/failed counts
3. Run core analysis queries:
   - latest ideas for current cycle
   - nearest-neighbor ideas for a probe concept
   - repeated themes by simple clustering/tag review
4. Export summary for faculty or lab discussion.

## Core SQL Recipes
1. Latest ideas in cycle:
- query `idea_entries_current where cycle_id='cycle_01'`

2. Similarity search:
- cosine distance against `idea_embeddings.embedding_vector`

3. Contribution trend:
- submissions by day, participant, and cycle

## Governance Guardrails
- operator can analyze across entries
- student submissions remain attributable and versioned
- no hidden cross-cycle policy changes in v1
