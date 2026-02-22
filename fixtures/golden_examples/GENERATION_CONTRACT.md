# Generation Contract (Golden Examples)

## Intent
Define deterministic generation constraints for Initial Thread Draft and Lab Record outputs using approved SMU example packets.

## Scope
- Applies to cycle-scoped source intake and draft generation.
- Does not bypass readiness, confirmation, or publish guards.

## Locked Model and Params
- Primary reasoning model: `gpt-4.1`
- `temperature=0`
- `top_p=1`

## Prompt Contract Versions
- `initial_thread_draft_v1`
- `lab_record_v1`

## Allowed Input Context
1. canonical source URL
2. bounded source text snapshot
3. student relevance note
4. focus snapshot

No hidden cross-thread or cross-cycle context is allowed.

## Initial Thread Draft Schema
Required fields:
1. `source_takeaway`
2. `student_note_takeaway`
3. `combined_insight`
4. `tension_or_assumption`
5. `next_best_move`
6. `provenance`
7. `golden_example_id`
8. `prompt_contract_version`
9. `model_name`

## Lab Record Schema
Required fields:
1. `what_it_is`
2. `why_it_matters`
3. `evidence`
4. `next_step`
Optional:
1. `confidence`
Metadata required:
1. `golden_example_id`
2. `prompt_contract_version`
3. `model_name`

## Deterministic Normalization
- Trim whitespace.
- Enforce non-empty required fields.
- Apply sentence/length caps per field.
- Reject schema-invalid output and fall back to deterministic template.

## Approval Rule
Only approved examples (`smu_ai_edu_A`, `smu_ai_edu_B`) may be used as style anchors.
