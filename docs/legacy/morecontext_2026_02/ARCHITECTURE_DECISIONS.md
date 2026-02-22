# Architecture Decisions (Frozen)

## Locked Decisions
1. Notion is the coordination surface.
2. Supabase is memory/logging/retrieval.
3. OpenAI powers assistant behavior.
4. System proposes; humans approve.
5. No hidden cross-thread reads without explicit opt-in.
6. No auto-publish outputs.
7. No auto-merge threads.
8. Readiness gate is 2-of-3.
9. Confidence bands with max 3 links/run.
10. Research layer is for behavior standards + auditability, not generic factual replacement.
11. Medium-risk requires 2 independent sources.
12. High-risk requires moderator approval before promotion.
13. Full Research Library visibility is allowed in pilot.
14. Local trigger uses Intent-Committed Auto.
15. System trigger is commit-event auto only when explicitly opted in and share-enabled.
16. Compare is on-demand.
17. Sync model is webhook-first with hourly polling reconciliation fallback.
18. Identity mapping uses Notion email + role allowlist.
19. Pilot runs with one active root problem statement at a time.
20. Root problem lock window is 2 weeks; revision occurs at boundary unless exception process is invoked.
21. All thread, output, and cohort artifacts must reference `root_problem_version_id`.
22. Individual Position publishes are credit-based (default 1), with moderator-granted increments.
23. Individual Positions require existing readiness + student confirmation (no bypass).
24. Cohort Position is published weekly as a human-approved synthesis artifact.
25. Position direction taxonomy is fixed for pilot: `hold`, `shift`, `strengthen`, `split`.
26. Position evolution is represented through immutable output versions and lineage pointers.
27. No new required datastore is introduced for Position Journey in V1.

## Explicit Forks Preserved
1. System trigger strictness.
2. Compare generation strategy.
3. Research input strictness.
4. High-risk moderation strictness.
5. Research visibility mode.
6. Root-problem exception path strictness.
7. Cohort approval strictness (single approver vs dual approver for selected classes).
8. Position credit policy granularity (per-thread vs per-student).
