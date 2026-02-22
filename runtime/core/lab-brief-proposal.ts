import type { LabBriefGenerationContent, StarterBriefRecord } from "./types.js";

export const LAB_BRIEF_PROPOSAL_CONTRACT_VERSION = "lab_brief_proposal_v1";
export const LAB_BRIEF_PROPOSAL_MODEL_NAME = "rule-based-deterministic";

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function fallback(source: string | undefined, fallbackText: string): string {
  return source && source.length > 0 ? source : fallbackText;
}

export function proposeLabBriefFromThread(input: {
  focus_snapshot: string;
  source_url: string;
  relevance_note: string;
  starter_brief?: StarterBriefRecord;
  round_summary?: string;
  confidence?: string;
}): LabBriefGenerationContent {
  const payload = (input.starter_brief?.payload ?? {}) as Record<string, unknown>;
  const combinedInsight = asString(payload.combined_insight);
  const nextBestMove = asString(payload.next_best_move);

  return {
    what_it_is: fallback(
      combinedInsight,
      "A focused proposal that connects one source-backed idea to sustained AI fluency behavior.",
    ),
    why_it_matters: `This addresses the Focus by turning one article insight into repeatable student behavior under changing AI tools and norms.`,
    evidence: `Source: ${input.source_url}. Student note: ${input.relevance_note}`,
    next_step: fallback(nextBestMove, "Run a short pilot test and measure one clear behavior change."),
    confidence: input.confidence,
    model_name: LAB_BRIEF_PROPOSAL_MODEL_NAME,
    prompt_contract_version: LAB_BRIEF_PROPOSAL_CONTRACT_VERSION,
    golden_example_id: "smu_ai_edu_A",
  };
}
