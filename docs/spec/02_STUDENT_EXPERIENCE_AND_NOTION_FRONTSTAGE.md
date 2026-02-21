# 02 Student Experience and Notion Frontstage

## Intent
Specify the exact student-facing experience so freshmen can use the lab with minimal instruction while backend rigor remains high.

## Canonical Inputs
1. Student profile (`student_id`, role, allowlist state, available credits).
2. Active root problem context (`root_problem_version_id`, statement text).
3. Student-provided article URL.
4. Thread history and prior accepted outputs in the same thread.
5. System policy constraints from docs `01`, `05`, and `07`.

## Canonical Outputs
1. A clear, humane, chat-like progression in Notion.
2. Structured student signals:
   - open-ended response
   - adaptive MCQ responses
   - reflection delta (`hold` / `shift` / `strengthen` / `split`)
3. Readiness status and guided next actions.
4. Optional publish action when gate and confirmation requirements are met.

## Normative Rules
1. Student flow MUST begin with article URL intake only (no mandatory file upload).
2. The first agent response MUST be open-ended and non-judgmental.
3. Agent language MUST be plain and direct for ages 17-21.
4. The system MUST hide operational complexity from the student surface.
5. MCQ flow MUST be adaptive and target approximately 20 questions over a full journey, not necessarily in a single turn.
6. Students MUST be able to skip an MCQ using a valid skip reason code.
7. Readiness and publish requirements MUST remain explicit and unskippable.
8. The student MUST see why a publish is blocked, with concrete next steps.
9. The student MUST retain authorship visibility for outputs and version history.

## Interaction Contract
1. Article intake prompt:
   - `Paste one article URL you want to think through.`
2. First elicitation prompt shape:
   - `What is one idea from this article that feels important, uncertain, or controversial to you?`
3. MCQ response grammar:
   - `A`, `B`, `C`, `D`
   - `A: <one sentence>`
   - `SKIP:<reason_code>`
4. Skip reason codes:
   - `R1 redundant`
   - `R2 need_more_info`
   - `R3 no_time`
   - `R4 disagree_with_framing`
   - `R5 other` (requires one sentence)

## State and Decision Logic
1. Student thread states:
   - `intake_pending`
   - `elicitation_active`
   - `mcq_cycle_active`
   - `readiness_candidate`
   - `publish_ready`
   - `published`
2. Transition rules:
   1. `intake_pending -> elicitation_active` on valid URL.
   2. `elicitation_active -> mcq_cycle_active` after first open response commit-event.
   3. `mcq_cycle_active -> readiness_candidate` when signal threshold met (sufficient claim/value/difference evidence).
   4. `readiness_candidate -> publish_ready` when `2-of-3` passes and confirmation token obtained.
   5. `publish_ready -> published` on successful publish transaction.
3. Adaptive questioning policy:
   1. Select next question by uncertainty and coverage gaps.
   2. Avoid repeated wording within last 3 MCQs.
   3. Cap per single session to reduce fatigue; continue in future sessions.

## Failure Modes and Recovery
1. Failure: student cannot parse task language.
   - Recovery: fallback prompt template with one concrete example.
2. Failure: article URL is broken or inaccessible.
   - Recovery: ask for alternative URL or a 3-sentence manual summary.
3. Failure: MCQ fatigue.
   - Recovery: allow skip codes; summarize progress and suggest next short step.
4. Failure: repeated invalid response formatting.
   - Recovery: show one-line valid examples and offer quick reply buttons in Notion template text.
5. Failure: readiness remains blocked repeatedly.
   - Recovery: provide one targeted improvement prompt mapped to failed criterion.

## Verification
1. Pass if first-time student can submit URL and receive first meaningful agent prompt in under 60 seconds.
2. Pass if a student can complete at least one full cycle (open response + MCQ + readiness feedback) without external guidance.
3. Pass if blocked publish explains unmet criteria and does not decrement credit.
4. Pass if each student output clearly links to thread and root problem context.
5. Pass if at least one session demonstrates adaptive MCQ selection based on prior responses.

## Evidence
1. Self-explanation literature supports asking learners to explain and justify ideas before evaluation.
2. Retrieval-practice findings support repeated, low-friction questioning over one-time assessment.
3. Formative feedback research supports immediate, criterion-linked feedback instead of opaque scoring.
4. Cognitive load guidance supports frontstage simplicity with backstage complexity management.
