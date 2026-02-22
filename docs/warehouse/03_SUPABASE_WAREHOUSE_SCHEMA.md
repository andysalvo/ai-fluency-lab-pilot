# Supabase Warehouse Schema (v1)

## Design Goals
- append-only idea history
- idempotent ingest with safe replays
- non-blocking embeddings
- queryable operator views by cycle and day

## Table: `idea_entries`
One row per versioned idea submission.

Columns:
- `entry_version_id uuid primary key`
- `notion_page_id text not null`
- `version_no int not null`
- `participant_key text not null`
  Notes:
  - preferred: `notion_user:<created_by_id>`
  - fallback: `email:<canonical_email>`
- `organization_id text not null`
- `cycle_id text not null`
- `root_problem_version_id text not null`
- `focus_id text not null`
- `focus_text_snapshot text not null`
- `idea_text_raw text not null`
- `idea_text_norm text not null` (whitespace normalization only)
- `notion_last_edited_time timestamptz not null`
- `source_event_key text not null unique`
  Format: `notion_page_id:last_edited_time:sha256(idea_text_norm)`
- `created_at timestamptz not null default now()`

Constraints:
- `unique (notion_page_id, version_no)`
- FK `(organization_id, cycle_id)` -> `program_cycles(organization_id, cycle_id)`

Recommended indexes:
- `(cycle_id, created_at desc)`
- `(participant_key, created_at desc)`
- `(notion_page_id, version_no desc)`

## Table: `idea_embeddings`
One embedding row per `entry_version_id`.

Columns:
- `entry_version_id uuid primary key references idea_entries(entry_version_id)`
- `embedding_model text not null`
- `embedding_status text not null check (pending|processing|ready|failed)`
- `embedding_vector vector(1536) nullable`
- `error_code text nullable`
- `embedded_at timestamptz nullable`
- `updated_at timestamptz not null`

Operational rule:
- embedding writes are non-blocking for intake success

## Table: `event_ingest_log` (reused)
Webhook-level ingest audit + dedupe authority.

Columns (selected):
- `event_id uuid pk`
- `idempotency_key text unique`
- `source_table text`
- `source_record_id text` (Notion page id)
- `ingest_state text` (`received|validated|processed|failed|duplicate`)
- `details_json jsonb`
- `created_at`, `processed_at`

Operational rule:
- `warehouse_enqueue_idea_job(...)` is the only write path for the webhook handler.

## Table: `warehouse_idea_ingest_jobs`
Idempotent queue for async Notion fetch + version insert.

Columns (selected):
- `idempotency_key text unique`
- `notion_page_id text`
- `status text` (`queued|processing|done|ignored|failed`)
- `attempt_count int`, `next_attempt_at timestamptz`
- `last_error_code`, `last_error_message`

Recommended index:
- `(status, next_attempt_at asc, created_at asc)`

## View: `idea_entries_current`
Latest entry version per `notion_page_id`.

Purpose:
- fast current-state query while keeping append-only history

## View: `idea_embeddings_backfill`
Backfill queue source for `pending` and `failed` embedding rows.

## View: `idea_ops_daily_summary`
Daily counts by cycle and embedding status for operator health checks.
