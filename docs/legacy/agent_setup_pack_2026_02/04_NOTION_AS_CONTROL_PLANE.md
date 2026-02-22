# 04 Notion as Control Plane

## Intent
### Definitions (canonical terms)
Use glossary terms from `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/agent_setup_pack/00_INDEX_AND_READING_ORDER.md`.

This file defines what the operator runs in Notion and what is enforced in cloud runtime systems.

## Canonical Inputs
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/03_NOTION_INFORMATION_ARCHITECTURE_AND_PAGE_TEMPLATES.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/04_RUNTIME_ARCHITECTURE_AND_DATA_MODEL.md`.
3. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/08_DEPLOYMENT_OPERATIONS_AND_SCALING_RUNBOOK.md`.
4. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/PILOT_KEYS_INTAKE.md`.

## Canonical Outputs
1. Platform responsibility map across Notion, GitHub, Vercel, and Supabase.
2. Webhook payload and audit-link contract.
3. Collaborator participation model for non-coder operations.

## Normative Rules
1. Notion is the primary control plane for operator and collaborator workflow.
2. GitHub is source of truth for code, policy docs, and CI evidence.
3. Supabase is runtime state, auth enforcement, and audit log source.
4. Vercel hosts required web surfaces only: SSO callback and minimal ops/admin UI.
5. Webhook payload fields are required:
   - `source_table`
   - `source_record_id`
   - `event_type`
   - `occurred_at`
   - `idempotency_key`
   - `signature`
   - `notion_workspace_id`
   - `notion_actor_email` (if available)
6. Commit-event and audit mapping must remain bidirectional:
   - Notion record -> event ID and idempotency key.
   - Runtime run ID -> linked Notion thread/output record.

## State and Decision Logic
1. Ownership boundaries:
   1. Notion owns operational records and human workflow.
   2. Supabase owns enforcement and immutable runtime logs.
   3. GitHub owns change history and CI results.
   4. Vercel owns required web ingress/callback surfaces.
2. Collaborator roles in Notion:
   1. `operator`: daily operations and approvals.
   2. `moderator`: governance controls and high-risk approvals.
   3. `facilitator`: learning flow support and moderation assistance.
3. TODO: final Notion DB IDs for pilot workspace.
   - How to determine: copy DB IDs from Notion URLs and fill `/PILOT_KEYS_INTAKE.md`.

## Failure Modes and Recovery
1. Failure: Notion event has incomplete payload.
   - Recovery: reject event with reason code and write failed ingest audit row.
2. Failure: runtime run cannot be traced back to Notion.
   - Recovery: block closure and require link fields before marking processed.
3. Failure: collaborator edits data outside role boundaries.
   - Recovery: enforce role-based checks at server action level and log denied action.

## Verification
1. Pass if responsibility boundaries are explicitly mapped to the four platforms.
2. Pass if required webhook payload fields are fully listed.
3. Pass if commit-event and runtime IDs are linked in both directions.
4. Pass if collaborator roles and allowed operations are documented.

## Evidence
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/03_NOTION_INFORMATION_ARCHITECTURE_AND_PAGE_TEMPLATES.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/04_RUNTIME_ARCHITECTURE_AND_DATA_MODEL.md`.
3. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/08_DEPLOYMENT_OPERATIONS_AND_SCALING_RUNBOOK.md`.
