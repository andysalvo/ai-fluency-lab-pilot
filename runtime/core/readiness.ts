import type { ReadinessEvaluateInput, ReadinessEvaluateResponse } from "./types.js";

export function evaluateReadiness(input: ReadinessEvaluateInput): ReadinessEvaluateResponse {
  const passed_criteria: Array<"claim" | "value" | "difference"> = [];
  if (input.claim) {
    passed_criteria.push("claim");
  }
  if (input.value) {
    passed_criteria.push("value");
  }
  if (input.difference) {
    passed_criteria.push("difference");
  }

  const missing_criteria = (["claim", "value", "difference"] as const).filter((item) => !passed_criteria.includes(item));
  const score = passed_criteria.length;
  const criteriaReady = score >= 2;
  const confirmationReady = input.explicit_confirmation === true;

  let reason_code: ReadinessEvaluateResponse["reason_code"];
  if (criteriaReady && confirmationReady) {
    reason_code = "READY";
  } else if (criteriaReady && !confirmationReady) {
    reason_code = "NEEDS_CONFIRMATION";
  } else if (!criteriaReady && confirmationReady) {
    reason_code = "INSUFFICIENT_CRITERIA";
  } else {
    reason_code = "INSUFFICIENT_CRITERIA_AND_CONFIRMATION";
  }

  return {
    organization_id: input.organization_id,
    program_cycle_id: input.program_cycle_id,
    root_problem_version_id: input.root_problem_version_id,
    ready_to_publish: criteriaReady && confirmationReady,
    score,
    passed_criteria,
    missing_criteria: [...missing_criteria],
    explicit_confirmation: confirmationReady,
    reason_code,
  };
}
