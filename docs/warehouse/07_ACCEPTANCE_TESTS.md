# Acceptance Tests (Warehouse v1)

## Functional Tests
1. Student submits Notion form -> Notion row exists.
2. Ingest pipeline creates `idea_entries` row within 10 seconds.
3. Idempotency replay does not create duplicate version row.
4. Editing same Notion response creates `version_no + 1` row.
5. Embedding success marks row as `ready`.
6. Embedding failure still keeps submission row and marks `failed/pending`.

## Data Integrity Tests
1. `source_event_key` uniqueness enforced.
2. `idempotency_key` uniqueness enforced.
3. `idea_entries_current` returns latest version correctly.

## Analysis Tests
1. Similarity query returns nearest ideas for a probe vector.
2. Operator can query per-cycle and global datasets.

## Security Tests
1. Secret scan confirms no raw secrets in repo.
2. Runtime does not expose service credentials in logs.

## Operational Tests
1. Backfill script resolves pending/failed embeddings.
2. Failures return deterministic reason codes.
