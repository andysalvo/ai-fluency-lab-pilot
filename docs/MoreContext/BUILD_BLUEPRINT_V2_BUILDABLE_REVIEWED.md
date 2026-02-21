# BUILD_BLUEPRINT_V2_BUILDABLE_REVIEWED.md

## 1) Purpose of This Reviewed Plan
This document is a **reviewed, buildable pilot plan** for using Notion + Supabase + OpenAI as an online mirror of Smeal AI Hub meetings.

It answers three questions:
1. Will the workflow reliably produce quality ideas, critique, synthesis, and decisions over multiple weeks?
2. Are the required automation items realistic with current Notion API + Supabase + OpenAI capabilities, without hidden assumptions?
3. Does the workflow move students downstream from one shared root problem while preserving direction and quality over time?

This is a pilot operating plan, not a full platform build.

---

## 2) Locked Constraints (Preserved)
1. No hidden cross-thread reads without explicit opt-in.
2. System proposes; humans approve.
3. No auto-publish to Outputs.
4. No auto-merge of threads.
5. Output gate is 2-of-3 readiness.
6. Confidence bands + max 3 link suggestions per run.
7. Research layer exists for behavior/evidence governance and auditability, not because the model lacks facts.
8. High-risk promotions require moderator approval.
9. Pilot must remain tomorrow-usable and Notion-first.
10. Root-problem-first framing is required: all thread reasoning must map downstream from the active root problem statement.
11. Position Journey is additive only and cannot bypass readiness, moderation, provenance, or trigger controls.

---

## 2.1) Root Problem Anchor (Locked)
1. The lab runs from one active root problem statement at a time.
2. Root statement lock window is 2 weeks.
3. Root revision is moderator/facilitator-controlled at lock boundary (or via explicit exception handling).
4. Every thread must reference `root_problem_version_id`.

---

## 3) Bottleneck Audit (Ranked, With Resolution Status)

| Rank | Bottleneck | Impact | Resolution in This Plan |
|---|---|---|---|
| 1 | Notion does not natively feel like chat | High | Use `Threads` + related `Turns` DB and a chat-style linked view in thread pages. |
| 2 | Auto-run can overfire on edits | High | `Intent-Committed Auto` trigger only (commit events), debounce 30s, max 1 run/min/thread. |
| 3 | Unsafe cross-thread reads | High | System mode reads only opt-in shared threads; scope logged per run. |
| 4 | Readiness “disable button” is unreliable in Notion UX | High | Gate-enforced click with structured unmet-criteria response block. |
| 5 | Guided MCQ flow can become form-like or ambiguous | High | Open-ended first, then strict MCQ grammar and skip-reason capture. |
| 6 | System mode timing/cost risk | Medium-High | System runs on commit events only if opt-in enabled; manual Run button still available. |
| 7 | Research ingestion can break on file parsing | Medium | Day-one requires URL or pasted markdown; file upload is optional best-effort only. |
| 8 | Provenance can overwhelm students | Medium | Compact source chips + expand-on-demand evidence panel. |
| 9 | Sync misses between Notion and Supabase | Medium | Webhook-first + idempotency + hourly reconciliation poll. |
| 10 | Role/authorship drift | Medium | Email + allowlist role mapping in Supabase. |

---

## 4) Buildable Day-One Notion Structure

### Required Databases
1. `Threads`
2. `Turns` (related to Threads; canonical turn log for automation and chat rendering)
3. `Outputs`
4. `Research Inbox`
5. `Research Library`

### Required Root Artifact
1. `Root Problem` page block (or lightweight register) with:
   - `root_problem_version_id`
   - `statement_text`
   - `lock_start_at`
   - `lock_end_at`
   - `owner`

### Optional
1. `Synthesis Proposals`

### Required Thread Page Layout
1. Thread Header (owner, stage, sharing status)
2. Chat View (linked `Turns` view filtered to this thread, sorted by time)
3. Guided Step Panel (current step + MCQ prompt)
4. Readiness Panel (3 checks)
5. Action Panel
   - Submit Turn
   - Run System (manual rerun)
   - Compare Local vs System
   - Log Output
   - Start New Thread from Output
   - Archive Snapshot
6. Next Inquiry
7. Position Journey strip:
   - latest Individual Position
   - latest Cohort Position pointer
   - directional change history (from output versions)

### Why `Turns` DB is required
It removes parsing ambiguity and provides reliable event triggers while preserving chat-like rendering in Notion.

---

## 5) Trigger Design (Exact)

## Local Mode Trigger
Runs when a commit event happens:
1. Student presses `Submit Turn`, or
2. Student submits valid guided MCQ response, or
3. Student advances stage with commit flag.

Does **not** run on raw text edits/autosave.

Controls:
1. Debounce 30 seconds.
2. Max 1 run/min/thread.

## System Mode Trigger
System execution occurs only when:
1. `share_for_system = true`, and
2. `system_mode_enabled = true`, and
3. commit event occurs.

Manual `Run System` button remains available for explicit rerun.

## Compare Trigger
1. On-demand only.
2. Compare block renders below the selected System run.
3. No auto-compare on Local runs.

## Latency Target
1. Visible result target: under 30 seconds.
2. Median target: 8–15 seconds.
3. If over 30s: show Processing with `run_id`; complete asynchronously (no silent failure).

---

## 6) Agent Guidance Policy (Operationalized)

Each assistant turn follows:
1. Start open-ended.
2. Then ask one short MCQ to move step progression.
3. Present next-step options at turn end.

Valid MCQ student reply grammar:
1. `A`, `B`, `C`, or `D`
2. `A: <one sentence>`
3. `SKIP:<reason_code>` with optional note

If invalid format:
1. Assistant re-asks MCQ.

Soft-lock skip reason codes:
1. `R1 redundant`
2. `R2 need_more_info`
3. `R3 no_time`
4. `R4 disagree_with_framing`
5. `R5 other` (requires one sentence)

Cycle remains:
1. capture
2. critique
3. synthesize
4. next inquiry
5. archive

Downstream rule:
1. Assistant must explicitly tie each synthesize/next-inquiry step to the active root problem statement.
2. Assistant prompts for directional status at synthesize:
   - hold
   - shift
   - strengthen
   - split

---

## 7) Readiness Gate + Output Versioning (Exact)

## 2-of-3 Readiness
`Log Output` allowed only when at least 2 pass:
1. clear claim
2. clear value
3. clear difference

## Unlock UX
1. Log button is always visible.
2. Click runs backend validation.
3. If locked, system writes a structured “not ready yet” block with failed checks and next actions.
4. If ready, output draft flow opens.

## Output Types
1. claim
2. finding
3. brief

Type is suggested by system; student may override.

## Publish Requirements
1. Student confirmation required.
2. Author + source thread + timestamp + version required.
3. New edit = new immutable version.

## Pace Guard
1. Soft cap 3 publishes/day/thread.
2. Above cap allowed only with short override reason.
3. Cap is adjustable via pilot settings.

## Position Publish Credits (Individual)
1. Individual Position publishes are credit-based.
2. Default credits start at 1.
3. Moderators can grant additional credits.
4. Credit checks do not replace readiness checks; both must pass.

---

## 8) System Memory Feed Update (Exact)
System Memory feed is generated from:
1. Published output current versions.
2. Approved Research Library entries.
3. Confirmed medium/high confidence link suggestions.
4. Weekly approved Cohort Position artifact.

Feed cards include:
1. title/summary
2. why it matters
3. confidence band
4. compact source chips
5. expand-on-demand evidence pane
6. direction badge (hold/shift/strengthen/split)
7. root_problem_version_id

---

## 9) Research/Corpus Layer (Behavior + Governance)

## Purpose
Governs agent behavior, evidence standards, and auditability.

## Workflow
1. New `.md` file or URL enters Research Inbox.
2. Librarian Agent runs near real-time and proposes metadata.
3. Moderator approves/rejects.
4. Approved items move to Research Library.
5. Active items reviewed every 30 days.

## Risk-tiered Arbitration
1. Low-risk ideation: model/web allowed with labels.
2. Medium-risk claim: requires 2 independent sources.
3. High-risk claim: requires moderator approval before promotion.
4. High-risk includes policy/ethics/institutional guidance and anything promoted to shared Outputs/System Memory.

## Library Governance
1. Full student/moderator visibility.
2. 30-day review cadence.
3. Approval queue view with SLA tags and overdue highlighting (72-hour operational target).

---

## 10) Supabase Minimal Data Model (Lean, Buildable)

1. `users_allowlist`
- Why: map Notion email to pilot role/permissions and optional position-publish credit override.

2. `run_audit`
- Why: immutable run trace (mode, scope, latency, status, actor, decision path, root_problem_version_id).

3. `memory_items`
- Why: normalized retrieval units from approved outputs + approved research.

4. `output_versions`
- Why: append-only output history with provenance and journey metadata (`position_scope`, `position_direction`, `position_parent_output_id`, `root_problem_version_id`).

5. `link_suggestions`
- Why: confidence, source refs, and confirmation state for cross-thread links.

6. `sync_events`
- Why: webhook event status, idempotency, retry, reconciliation logs.

7. `pilot_settings`
- Why: adjustable controls (debounce, caps, limits, default_position_publish_credits, active_root_problem_version_id, root_lock_end_at) without code edits.

8. `turn_index` (minimal mirror of Notion Turns IDs/timestamps)
- Why: dedupe and idempotent run triggering from Notion events.

---

## 11) Interface Contracts (Planning Guardrails, No Implementation Code)

| Contract | Input | Output |
|---|---|---|
| `runLocalAssistant` | `thread_id`, `prompt` | `response`, `source_refs`, `readiness_hint` |
| `runSystemAssistant` | `thread_id`, `prompt`, `scope` | `response`, `source_refs`, `link_suggestions`, `cohort_position_candidate` |
| `evaluateReadiness` | `thread_id` | `state(locked/ready)`, `reason_codes`, `suggested_output_type`, `position_readiness_hint` |
| `checkPositionCredits` | `author_id`, `root_problem_version_id` | `allowed`, `remaining_credits` |
| `logOutput` | `thread_id`, `output_type`, `text`, `why_it_matters`, `author_confirm`, `position_scope`, `position_direction`, `position_parent_output_id?`, `root_problem_version_id` | `output_id`, `version` |
| `publishCohortPosition` | `selected_output_ids`, `root_problem_version_id`, `approver_id` | `cohort_output_id`, `version`, `source_refs` |
| `suggestLinks` | `thread_id` | `up_to_3_links`, `confidence_bands`, `source_refs` |
| `ingestResearchMd` | `inbox_id` | `metadata_proposal`, `quality_flags`, `tier_suggestion` |
| `approveResearchEntry` | `inbox_id`, `moderator_id` | `library_entry_id`, `active_status` |
| `recordModerationDecision` | `item_id`, `decision`, `moderator_id` | `decision_record_id` |

---

## 12) Must-Automate Feasibility Review

| Must Automate Item | Buildable with Current Stack? | Concrete Mechanism |
|---|---|---|
| Local auto runs | Yes | Commit events from Turns/Thread actions -> webhook -> run queue with debounce/rate cap. |
| System runs after explicit opt-in | Yes | Gate on `share_for_system` + `system_mode_enabled`; same commit pipeline. |
| Readiness gate logic | Yes | `evaluateReadiness` on click; return pass/fail + reason codes. |
| Output metadata + versioning | Yes | `logOutput` writes immutable version and updates current pointer. |
| Confidence bands + max-3 links | Yes | Retrieval/scoring layer writes filtered suggestions before display. |
| Run audit logging | Yes | `run_audit` write on every run state transition. |
| Research Inbox parsing | Yes | Near real-time Librarian pipeline from Inbox entries (URL/paste markdown). |

No hidden requirement was identified that blocks the pilot if these mechanisms are used.

---

## 13) End-to-End 48-Hour Demo (Revalidated)

1. Create 3 Threads.
2. Submit at least one committed turn in each (Local auto runs).
3. Enable system sharing on at least 1 thread.
4. Trigger system run via commit event or manual Run System.
5. Generate on-demand compare block.
6. Log at least 2 outputs via readiness gate.
7. Mark at least 1 output as Individual Position (direction labeled).
8. Publish 1 weekly Cohort Position from opt-in shared outputs with human approval.
9. Revise one position output to create version 2 (visible directional evolution).
10. Ingest one research item through Inbox -> Librarian -> Moderator -> Library.
11. Complete one archive snapshot and next inquiry update.

Demo success checks:
1. No hidden cross-thread reads.
2. No output published without readiness + student confirmation.
3. Low-confidence links suppressed.
4. High-risk promotion blocked pending moderation.
5. Thread continuity evidence captured in stage history.
6. Every published position references the active `root_problem_version_id`.
7. Credit limit enforcement works (default 1; moderator override works).

---

## 14) Remaining Risks as Explicit Decision Forks

## Fork A: System Trigger Strictness
1. A1 (current): commit-event auto when opt-in enabled
2. A2: manual-only system runs for tighter cost control

## Fork B: Compare Generation
1. B1 (current): on-demand compare
2. B2: auto compare after each system run

## Fork C: Research Input Strictness
1. C1 (current): URL or pasted markdown required; file optional
2. C2: require file + URL once ops maturity improves

## Fork D: High-Risk Moderation
1. D1 (current): single moderator approval
2. D2: dual moderator approval for selected policy classes

## Fork E: Student Access to Raw Research
1. E1 (current): full access
2. E2: summary-first with raw access optional

## Fork F: Root Problem Revision Governance
1. F1 (current): revise at 2-week lock boundary with moderator/facilitator sign-off
2. F2: emergency revision path with explicit incident record

---

## 15) OPS_INPUTS.md (Minimal, Non-Secret Only)

## Non-Secret IDs/URLs Required
1. Notion Workspace URL
2. Notion Root Pilot Page URL
3. Notion DB IDs:
   - Threads
   - Turns
   - Outputs
   - Research Inbox
   - Research Library
   - (optional) Synthesis Proposals
4. Notion Webhook Endpoint URL (your backend)
5. Supabase Project URL
6. Supabase Project Ref
7. Supabase Edge Function Base URL
8. GitHub Repo URL
9. Allowed domain rule (for pilot users), e.g. `@psu.edu`
10. Notion page URL for `Cohort Position Journey` view
11. Notion template URL/ID for thread-level `My Position Journey` view

## Secret Pointers Only (No Secrets Here)
1. Notion Integration Token -> stored in 1Password: `Vault/ItemName`
2. Notion Webhook Signing Secret -> stored in 1Password: `Vault/ItemName`
3. Supabase Service Role Key -> stored in 1Password: `Vault/ItemName`
4. Supabase DB Password -> stored in 1Password: `Vault/ItemName`
5. OpenAI API Key -> stored in 1Password: `Vault/ItemName`
6. GitHub PAT (if needed) -> stored in 1Password: `Vault/ItemName`

## Operations Contacts (Non-Secret)
1. Moderator roster (emails)
2. Facilitator email
3. On-call ops contact
4. SLA owner for 72-hour moderation queue
5. Cohort Position approver roster (emails)
