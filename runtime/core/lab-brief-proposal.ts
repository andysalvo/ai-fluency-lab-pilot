import type { LabBriefGenerationContent, StarterBriefRecord } from "./types.js";
import { cleanStudentNote, stripLeadingSemanticPrefix, toSentenceCap } from "./text-normalize.js";

export const LAB_BRIEF_PROPOSAL_CONTRACT_VERSION = "lab_brief_proposal_v2";
export const LAB_BRIEF_PROPOSAL_MODEL_NAME = "rule-based-deterministic";
function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toSentence(value: string, fallbackText: string): string {
  const normalized = stripLeadingSemanticPrefix(compact(value || ""));
  const fallback = stripLeadingSemanticPrefix(compact(fallbackText));
  return toSentenceCap(normalized || fallback, 22) || fallback;
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
  const combinedInsight = stripLeadingSemanticPrefix(asString(payload.combined_insight) ?? "");
  const tension = stripLeadingSemanticPrefix(asString(payload.tension_or_assumption) ?? "");
  const nextBestMove = stripLeadingSemanticPrefix(asString(payload.next_best_move) ?? "");
  const cleanedNote = cleanStudentNote(input.relevance_note).cleaned;

  return {
    what_it_is: toSentence(
      fallback(combinedInsight, "Build repeatable AI fluency habits through guided source-based reflection."),
      "Build repeatable AI fluency habits through guided source-based reflection.",
    ),
    why_it_matters: toSentence(
      cleanedNote,
      "Learners need short, structured prompts to move from vague reactions to usable ideas.",
    ),
    evidence: toSentence(
      fallback(
        tension,
        "tool speed can overpower real learning unless faculty routines keep reflection and evidence explicit",
      ),
      "Tool speed can overpower real learning unless faculty routines keep reflection and evidence explicit.",
    ),
    next_step: toSentence(
      fallback(nextBestMove, "What classroom routine best turns AI use into stronger reasoning habits over time?"),
      "What classroom routine best turns AI use into stronger reasoning habits over time?",
    ),
    confidence: input.confidence,
    model_name: LAB_BRIEF_PROPOSAL_MODEL_NAME,
    prompt_contract_version: LAB_BRIEF_PROPOSAL_CONTRACT_VERSION,
    golden_example_id: "smu_ai_edu_A",
  };
}
