# Ingest, Idempotency, and Embedding Flow

## Runtime Flow
1. Receive Notion webhook (Supabase Edge Function).
2. Validate minimal payload.
3. Dedupe by `event_ingest_log.idempotency_key`.
4. Persist `event_ingest_log` row.
5. Enqueue one job into `warehouse_idea_ingest_jobs`.
6. Return 200 quickly (no Notion fetch, no OpenAI calls).
7. Worker fetches authoritative Notion page properties.
8. Worker validates required fields (`Idea`, author identity).
9. Worker builds `source_event_key` from page ID + last edited time + `sha256(idea_text_norm)`.
10. Worker persists new `idea_entries` version row (transaction-safe).
11. Worker upserts `idea_embeddings` as `pending`.
12. Embedding worker claims pending/failed rows, computes embeddings, updates status to `ready` or `failed`.

## Idempotency Rules
- key authority: `source_event_key` unique constraint on `idea_entries`
- duplicate delivery must be a safe no-op
- every accepted event has exactly one ingest event record
- required-field misses are marked `ignored` (not failed)

## Concurrency Safety (Bursty Delivery)
- Webhook handler performs a single DB RPC (`warehouse_enqueue_idea_job`) so request time stays bounded.
- DB-level uniqueness provides hard safety:
  - `event_ingest_log.idempotency_key` prevents duplicate events.
  - `warehouse_idea_ingest_jobs.idempotency_key` prevents duplicate jobs.
  - `idea_entries.source_event_key` prevents duplicate versions.
- RPCs are written to avoid `unique_violation` races under concurrent delivery (conflicts become deduped no-ops).

## Webhook Authorization (Minimal, Practical)
- If `PILOT_NOTION_WEBHOOK_SECRET` is set in Supabase function env, the webhook must provide it:
  - either as request header `x-webhook-secret`
  - or as JSON field `signature`
- If the secret is not set, the webhook endpoint is open; do not run it publicly without a secret.

## Embedding Rules
- embedding failure must not fail submission ingest
- retries are allowed via operator backfill
- raw student text is not rewritten beyond whitespace normalization
- embeddings are processed asynchronously by a worker (no embedding calls in webhook request path)

## Backfill
Provide operator-triggered backfill for rows where:
- `embedding_status in ('pending','failed')`

Backfill must:
- be idempotent
- update only embedding fields
- never mutate original idea text
