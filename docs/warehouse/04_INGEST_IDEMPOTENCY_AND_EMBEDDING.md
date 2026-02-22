# Ingest, Idempotency, and Embedding Flow

## Runtime Flow
1. Receive Notion webhook.
2. Fetch authoritative page properties from Notion API.
3. Validate required fields (`Idea`, cycle/focus fields, created_by).
4. Build `idempotency_key` from page ID + last edited time.
5. Insert `ingest_events(status='received')`.
6. If duplicate key exists, return 200 with duplicate status.
7. Create new `idea_entries` version row.
8. Create `idea_embeddings` row as `pending`.
9. Attempt embedding generation with short timeout.
10. Update embedding status to `ready` or `failed`.
11. Mark ingest event as `processed` (or `failed` with reason).

## Idempotency Rules
- key authority: `idempotency_key` unique constraint
- duplicate delivery must be a safe no-op
- every accepted event has exactly one ingest event record

## Embedding Rules
- embedding failure must not fail submission ingest
- retries are allowed via operator backfill
- raw student text is not rewritten beyond whitespace normalization

## Backfill
Provide operator-triggered backfill for rows where:
- `embedding_status in ('pending','failed')`

Backfill must:
- be idempotent
- update only embedding fields
- never mutate original idea text
