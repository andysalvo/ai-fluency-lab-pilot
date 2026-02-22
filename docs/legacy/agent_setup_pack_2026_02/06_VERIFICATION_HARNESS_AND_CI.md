# 06 Verification Harness and CI

## Intent
Define deterministic pre-merge checks so cockpit changes are validated before merge.

## Canonical Inputs
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/scripts/verify.sh`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/.github/workflows/ci.yml`.
3. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/agent_setup_pack` file set.

## Canonical Outputs
1. Local verify output for each change slice.
2. CI pass/fail signal on pull requests to `dev` and `main`.
3. Structured reasons for verification failures.

## Normative Rules
1. Verification must fail if setup-pack file set is not exactly the required 10 names.
2. Verification must fail if required headers are missing or out of order.
3. Verification must fail on detected raw secret patterns.
4. Verification should run tests when available; otherwise it should explicitly skip with message.
5. CI must execute the same verify script used locally.

## State and Decision Logic
1. Verify status states:
   - `passed`
   - `failed_structure`
   - `failed_headers`
   - `failed_secrets`
   - `failed_tests`
2. CI workflow triggers on pull requests to `dev` and `main`.
3. If verification fails, merge is blocked until failure reason is resolved.
4. TODO: add optional markdown lint check once docs style is stabilized.
   - How to determine: confirm stable style rules and add a deterministic linter config.

## Failure Modes and Recovery
1. Failure: false positive secret detection.
   - Recovery: refine regex allowlist with explicit documented exception.
2. Failure: docs added with wrong header order.
   - Recovery: reorder headers to canonical sequence and rerun verify.
3. Failure: CI differs from local behavior.
   - Recovery: keep CI as shell call to local verify script only.

## Verification
1. Pass if local `scripts/verify.sh` exits `0`.
2. Pass if CI workflow exists and runs verify script on PRs to `dev` and `main`.
3. Pass if verify output includes explicit per-check pass/fail messages.
4. Pass if failure categories are clear and actionable.

## Evidence
1. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec/09_ACCEPTANCE_TESTS_SLO_AND_HANDOFF.md`.
2. `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/MoreContext/MINIMUM_TESTS_TO_RUN.md`.
