# Supabase Warehouse Schema (v1)

## Design Goals
- append-only history
- idempotent ingest
- non-blocking embeddings
- easy operator querying

## Table: `idea_entries`
One row per versioned submission.

Columns:
- `entry_version_id uuid primary key`
- `notion_page_id text not null`
- `version_no int not null`
- `participant_key text not null`
- `cycle_id text not null`
- `focus_id text not null`
- `focus_text text not null`
- `idea_text_raw text not null`
- `idea_text_norm text not null`
- `notion_last_edited_time timestamptz not null`
- `source_event_key text not null unique`
- `created_at timestamptz not null default now()`

Recommended index:
- `(cycle_id, created_at desc)`
- `(participant_key, created_at desc)`
- `(notion_page_id, version_no desc)`

## Table: `idea_embeddings`
One embedding status row per `entry_version_id`.

Columns:
- `entry_version_id uuid primary key references idea_entries(entry_version_id)`
- `embedding_model text not null`
- `embedding_status text not null check (embedding_status in ('pending','ready','failed'))`
- `embedding_vector vector(1536)`
- `error_code text`
- `embedded_at timestamptz`

Recommended index:
- `ivfflat` index on `embedding_vector` (after enough rows)

## Table: `ingest_events`
Event log and dedupe authority.

Columns:
- `event_id uuid primary key default gen_random_uuid()`
- `idempotency_key text not null unique`
- `notion_page_id text not null`
- `status text not null check (status in ('received','processed','duplicate','failed'))`
- `error_code text`
- `created_at timestamptz not null default now()`

## View: `idea_entries_current`
Latest version per notion page.

Purpose:
- fast current-state query for operators while preserving full append-only history.
