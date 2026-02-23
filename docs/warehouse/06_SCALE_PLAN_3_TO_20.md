# Scale Plan: 3 to 20 Students

## Phase A (3-5 students)
- verify Notion form completion rate
- verify ingest reliability
- verify embedding latency and retry behavior

## Phase B (6-12 students)
- validate duplicate and edit handling under realistic load
- add simple monitoring thresholds for failed ingest/embedding
- run weekly pattern summaries for operators

## Phase C (13-20 students)
- optimize query indexes for operator analysis
- stabilize backfill cadence for failures
- document operational handoff for at least one backup operator

## Scaling Constraints
- keep one fixed focus per cycle
- keep one form input paradigm
- avoid adding student-path complexity until data quality is stable

## Explicit Tradeoffs
1. One focus question improves comparability, but reduces topic breadth per cycle.
2. Append-only versioning improves auditability, but increases storage and query volume.
3. Operator-first analysis improves governance, but delays direct student-facing feedback loops.

## Exit Criteria to Expand Beyond 20
1. Ingest success rate >= 99%.
2. Duplicate handling proven under replay tests.
3. Embedding backlog can be cleared in bounded time.
4. Operator can generate cycle summary in under 30 minutes.
