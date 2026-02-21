# 06 Research-Backed Learning Engine

## Intent
Translate established learning-science mechanisms into concrete runtime rules for the lab so student interaction is simple while learning signal quality is high.

## Canonical Inputs
1. Student article URL and initial open-ended response.
2. Thread-level prior turns and readiness history.
3. Root problem context and selected sub-question focus.
4. Current MCQ session coverage and fatigue signals.
5. Approved research library items when needed for grounding.

## Canonical Outputs
1. Adaptive question sequence that targets conceptual coverage and reasoning quality.
2. Immediate, criterion-linked formative feedback.
3. Transparent readiness evidence for claim/value/difference.
4. Student reflection state (`hold`, `shift`, `strengthen`, `split`) with rationale.

## Normative Rules
1. Each new thread MUST start with one open-ended elicitation before MCQs.
2. MCQ generation MUST use student context and root problem alignment.
3. The engine SHOULD target approximately 20 MCQs across the full thread journey.
4. MCQs MUST include plausible distractors and one best answer.
5. Feedback MUST be criterion-linked and specific, not generic praise.
6. Difficulty MUST adapt based on prior performance and uncertainty.
7. The system MUST allow skip with reason and continue progress.
8. The system MUST avoid hidden scoring displays that could discourage early-stage learners.

## Evidence-to-Mechanism Mapping
| Mechanism | Implementation Rule | Expected Benefit | Evidence Anchor |
|---|---|---|---|
| Open-ended elicitation | First prompt asks for personal interpretation before scoring | Surfaces prior knowledge and misconceptions | Chi et al. (self-explanation) |
| Retrieval practice | Revisit key ideas through spaced, short questions | Improves retention and transfer | Roediger and Karpicke |
| Formative feedback | Return reason-linked improvement prompts | Better next-step performance | Black and Wiliam; Hattie and Timperley |
| Adaptive sequencing | Select next MCQ by uncertainty + coverage gap | Reduces boredom and overload | ITS meta-analyses (VanLehn; Kulik and Fletcher) |
| Immediate coaching | One next action at each turn end | Sustains momentum | Intelligent tutoring literature |

## MCQ Generation Contract
1. Input bundle:
   - `thread_id`
   - latest student response
   - concept coverage map
   - target difficulty band
2. Output item schema:
   - `question_id`
   - `stem`
   - `options[A-D]`
   - `correct_option`
   - `rationale`
   - `concept_tag`
   - `difficulty`
3. Quality rules:
   - no trick phrasing
   - no duplicate stem within last 10 items
   - distractors must map to realistic misconception patterns
4. Progress rules:
   - stop current batch when fatigue signal threshold reached
   - resume in next session from saved coverage state

## State and Decision Logic
1. `learning_state`:
   - `elicitation`
   - `probe`
   - `consolidate`
   - `readiness_support`
2. Transition logic:
   1. `elicitation -> probe` after first committed reflection.
   2. `probe -> consolidate` when coverage threshold achieved.
   3. `consolidate -> readiness_support` when readiness nears pass boundary.
3. Adaptive selector:
   1. Score each candidate concept by `uncertainty * relevance_to_root_problem`.
   2. Select top concept not recently repeated.
   3. Emit one MCQ and one brief rationale.
4. Sparse-input fallback:
   - if article signal is weak, switch to foundational clarification prompts before advanced MCQs.

## Failure Modes and Recovery
1. Failure: generated MCQs are too difficult for early-stage students.
   - Recovery: reduce difficulty band and provide one worked example.
2. Failure: student gives minimal responses.
   - Recovery: ask narrower prompts and use optional multiple-choice scaffolds.
3. Failure: concept coverage stalls.
   - Recovery: rotate concept cluster and switch question format.
4. Failure: model hallucination in rationale.
   - Recovery: require source-linked rationale when external claims are made.

## Verification
1. Pass if each thread starts with open-ended elicitation before MCQ sequence.
2. Pass if MCQ logs show adaptive concept selection rather than fixed order.
3. Pass if feedback includes criterion-linked rationale in at least 95 percent of evaluated turns.
4. Pass if student can progress with skip codes without dead-end state.
5. Pass if readiness improvements correlate with targeted feedback cycles.

## Evidence
1. Chi, M. et al. on self-explanation effects in learning.
2. Roediger, H. and Karpicke, J. on retrieval practice benefits.
3. Black, P. and Wiliam, D. on formative assessment impact.
4. Hattie, J. and Timperley, H. on effective feedback structure.
5. VanLehn, K.; Kulik, J. and Fletcher, J. on intelligent tutoring effectiveness.
6. Automatic item generation literature for scalable assessment item creation.
