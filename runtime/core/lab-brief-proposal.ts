import type { LabBriefGenerationContent, StarterBriefRecord } from "./types.js";

export const LAB_BRIEF_PROPOSAL_CONTRACT_VERSION = "lab_brief_proposal_v2";
export const LAB_BRIEF_PROPOSAL_MODEL_NAME = "rule-based-deterministic";
const MAX_SENTENCE_WORDS = 22;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function capWords(value: string, maxWords: number): string {
  const normalized = compact(value);
  if (!normalized) {
    return "";
  }
  const words = normalized.split(" ");
  if (words.length <= maxWords) {
    return normalized;
  }
  return words.slice(0, maxWords).join(" ");
}

function toSentence(value: string, fallbackText: string): string {
  const candidate = compact(value || fallbackText);
  const first = candidate.split(/(?<=[.!?])\s+/)[0] ?? candidate;
  const capped = capWords(first, MAX_SENTENCE_WORDS);
  if (!capped) {
    return fallbackText;
  }
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
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
  const tension = asString(payload.tension_or_assumption);
  const nextBestMove = asString(payload.next_best_move);

  return {
    what_it_is: toSentence(
      fallback(combinedInsight, "Core idea: build repeatable AI fluency habits through guided source-based reflection."),
      "Core idea: build repeatable AI fluency habits through guided source-based reflection.",
    ),
    why_it_matters: toSentence(
      `Student pattern: ${input.relevance_note}`,
      "Student pattern: learners need short, structured prompts to move from vague reactions to usable ideas.",
    ),
    evidence: toSentence(
      `Key tension and implication: ${fallback(
        tension,
        "tool speed can overpower real learning unless faculty routines keep reflection and evidence explicit",
      )}`,
      "Key tension and implication: tool speed can overpower real learning unless faculty routines keep reflection and evidence explicit.",
    ),
    next_step: toSentence(
      fallback(nextBestMove, "Cohort question: what classroom routine best turns AI use into stronger reasoning habits over time?"),
      "Cohort question: what classroom routine best turns AI use into stronger reasoning habits over time?",
    ),
    confidence: input.confidence,
    model_name: LAB_BRIEF_PROPOSAL_MODEL_NAME,
    prompt_contract_version: LAB_BRIEF_PROPOSAL_CONTRACT_VERSION,
    golden_example_id: "smu_ai_edu_A",
  };
}
