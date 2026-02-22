# Golden Examples (SMU Article)

This sprint adds deterministic, approved reference artifacts for generation quality using:
`https://learningsciences.smu.edu/blog/artificial-intelligence-in-education`

## What was added

- Frozen input packets:
  - `fixtures/golden_examples/smu_ai_edu/input_packet_A.json`
  - `fixtures/golden_examples/smu_ai_edu/input_packet_B.json`
- Approved Initial Thread Draft examples:
  - `fixtures/golden_examples/smu_ai_edu/approved_initial_thread_draft_A.json`
  - `fixtures/golden_examples/smu_ai_edu/approved_initial_thread_draft_B.json`
- Approved Lab Record examples:
  - `fixtures/golden_examples/smu_ai_edu/approved_lab_record_A.json`
  - `fixtures/golden_examples/smu_ai_edu/approved_lab_record_B_candidate.json`
- Contract:
  - `fixtures/golden_examples/GENERATION_CONTRACT.md`

## Locked generation contract

- Model: `gpt-4.1`
- Prompt versions:
  - `initial_thread_draft_v1`
  - `lab_record_v1`
- Runtime params:
  - `temperature=0`
  - `top_p=1`

## Why this matters

These artifacts define a concrete quality target so generated outputs are consistent, grounded, and auditable while preserving existing publish/readiness guards.
