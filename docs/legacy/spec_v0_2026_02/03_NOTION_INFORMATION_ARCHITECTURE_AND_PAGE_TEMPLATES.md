# 03 Notion Information Architecture and Page Templates

## Intent
Define the exact Notion information architecture, database contracts, and page templates that make the lab usable as a chat-like student workflow and reliable orchestration source.

## Canonical Inputs
1. Notion workspace and root page references:
   - `pilot.notion.workspace_url`
   - `pilot.notion.root_page_url`
2. Required database IDs:
   - `pilot.notion.db_threads_id`
   - `pilot.notion.db_turns_id`
   - `pilot.notion.db_outputs_id`
   - `pilot.notion.db_research_inbox_id`
   - `pilot.notion.db_research_library_id`
3. Integration credentials:
   - `pilot.notion.integration_token` (pointer)
   - `pilot.notion.webhook_secret` (pointer)
4. Webhook endpoint:
   - `pilot.notion.webhook_endpoint_url`

## Canonical Outputs
1. Stable Notion page and database layout for pilot operations.
2. Deterministic property schema for thread/turn/output events.
3. Chat-like student page template backed by structured database records.
4. Webhook event origins for commit-event orchestration.

## Normative Rules
1. Notion is the coordination surface; all student interactions MUST be representable through `Threads` + `Turns`.
2. `Turns` database MUST be the canonical turn log used for triggering automation.
3. Triggering MUST occur only on explicit commit-event actions, never raw text autosave.
4. Every thread and output record MUST carry `root_problem_version_id`.
5. Thread sharing for system mode MUST be explicit (`share_for_system=true`); no implicit global read.
6. Required page/database artifacts MUST be shared with the Notion integration.
7. Notion pages MUST NOT store raw secrets.

## Required Root Page Structure
1. `Root Problem` section:
   - current statement text
   - `root_problem_version_id`
   - lock window start/end
   - revision owner
2. `Student Threads` linked view (source: `Threads`).
3. `Cohort Position Journey` linked view (source: `Outputs`, filtered by cohort artifacts).
4. `Research Operations` section linking `Research Inbox` and `Research Library`.

## Required Databases and Properties

### `Threads`
1. `thread_id` (title or text, unique)
2. `student_email` (email/text)
3. `owner_user_id` (text)
4. `stage` (select: intake, critique, synthesize, next_inquiry, archived)
5. `share_for_system` (checkbox)
6. `system_mode_enabled` (checkbox)
7. `root_problem_version_id` (text)
8. `latest_readiness_state` (select: locked, ready)
9. `latest_publish_state` (select: draft, published, blocked)

### `Turns`
1. `turn_id` (title or text, unique)
2. `thread_ref` (relation -> Threads)
3. `role` (select: student, assistant, system)
4. `turn_type` (select: open_response, mcq, feedback, compare, system_summary)
5. `commit_event` (checkbox)
6. `committed_at` (datetime)
7. `payload_hash` (text)
8. `idempotency_key` (text)
9. `root_problem_version_id` (text)

### `Outputs`
1. `output_id` (title or text, unique)
2. `thread_ref` (relation -> Threads)
3. `output_type` (select: claim, finding, brief)
4. `publish_state` (select: draft, readiness_blocked, ready_pending_confirmation, published)
5. `version_number` (number)
6. `readiness_claim` (checkbox)
7. `readiness_value` (checkbox)
8. `readiness_difference` (checkbox)
9. `confirmation_received` (checkbox)
10. `root_problem_version_id` (text)
11. `author_email` (email/text)
12. `published_at` (datetime)

### `Research Inbox`
1. `research_item_id`
2. `source_url`
3. `submission_type` (url, pasted_text)
4. `risk_tier` (low, medium, high)
5. `review_status` (pending, accepted, rejected)
6. `submitted_by`

### `Research Library`
1. `library_item_id`
2. `source_url`
3. `summary`
4. `confidence_band` (low, medium, high)
5. `approval_status` (approved, blocked)
6. `approved_by`
7. `approved_at`

## Template Design

### Thread Page Template (Required)
1. Header block: owner, stage, share/system toggles.
2. Chat linked view: `Turns` filtered to current thread and sorted ascending by `committed_at`.
3. Action row with explicit commit buttons:
   - `Submit Turn`
   - `Run System`
   - `Compare Local vs System`
   - `Log Output`
4. Readiness panel with three checks and status block.
5. Position strip with latest directional state (`hold`, `shift`, `strengthen`, `split`).

### Operator Review Template (Required)
1. Participant and allowlist context.
2. Latest readiness failures and reasons.
3. Publish attempts and credit movement log.
4. Audit trace links.

## Webhook Event Origins
1. `Turns` insert/update where `commit_event=true`.
2. `Threads` update where `system_mode_enabled` or `share_for_system` changes.
3. `Outputs` update where publish attempt initiated.

Webhook payload MUST include:
1. `source_table`
2. `source_record_id`
3. `event_type`
4. `idempotency_key`
5. `occurred_at`

## State and Decision Logic
1. Event intake state:
   - `received`
   - `validated`
   - `deduplicated`
   - `processed`
   - `failed`
2. Dedupe rule:
   - if `idempotency_key` already processed, mark as duplicate and skip execution.
3. Trigger acceptance:
   - process only if event corresponds to approved commit-event origin.
4. If thread is not share-enabled, system mode execution is blocked.

## Failure Modes and Recovery
1. Failure: missing DB property expected by runtime.
   - Recovery: apply schema patch and rerun property verification checklist.
2. Failure: webhook replay causing duplicate runs.
   - Recovery: enforce idempotency key uniqueness in runtime logs.
3. Failure: integration loses access to page or DB.
   - Recovery: re-share root page and all required databases; run access verification script.
4. Failure: students edit unstructured blocks only.
   - Recovery: train on commit buttons and map raw content into `Turns` with operator helper.

## Verification
1. Pass if all five required databases exist and IDs match runtime config keys.
2. Pass if each required property exists with expected type.
3. Pass if commit-event action creates a `Turns` record with `commit_event=true`.
4. Pass if webhook payload includes `idempotency_key` and is accepted once.
5. Pass if a thread can be fully reconstructed from `Threads` + `Turns` + `Outputs` relations.

## Evidence
1. Frozen build blueprint defines `Threads` + `Turns` architecture to remove parsing ambiguity.
2. Notion API webhook and database contracts support event-driven processing when schemas are explicit.
3. Event idempotency is a standard reliability control for webhook-driven systems.
