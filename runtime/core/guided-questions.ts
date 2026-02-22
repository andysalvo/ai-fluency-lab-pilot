import type { GuidedQuestionItemRecord, GuidedQuestionOption } from "./types.js";

export const GUIDED_ROUND_PROMPT_CONTRACT_VERSION = "guided_round_v2";
export const GUIDED_ROUND_MODEL_NAME = "rule-based-deterministic";
const MAX_OPTION_WORDS = 14;

function short(value: string | undefined, fallback: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return fallback;
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

function makeOptions(a: string, b: string, c: string, d: string): GuidedQuestionOption[] {
  return [
    { code: "A", text: capWords(a, MAX_OPTION_WORDS) },
    { code: "B", text: capWords(b, MAX_OPTION_WORDS) },
    { code: "C", text: capWords(c, MAX_OPTION_WORDS) },
    { code: "D", text: capWords(d, MAX_OPTION_WORDS) },
  ];
}

export function generateGuidedRoundQuestions(input: {
  focus_snapshot: string;
  source_url: string;
  source_takeaway?: string;
  combined_insight?: string;
  tension_or_assumption?: string;
  next_best_move?: string;
}): Array<Pick<GuidedQuestionItemRecord, "ordinal" | "prompt" | "options" | "recommended_option">> {
  const sourceTakeaway = capWords(short(input.source_takeaway, "Use one clear source point."), 10);
  const combinedInsight = capWords(short(input.combined_insight, "State one clear insight."), 10);
  const tension = capWords(short(input.tension_or_assumption, "Name one key tension."), 10);
  const nextMove = capWords(short(input.next_best_move, "Ask one cohort-level question."), 10);

  return [
    {
      ordinal: 1,
      prompt: "What is your clearest core idea from this source?",
      options: makeOptions(
        `Claim: ${sourceTakeaway}`,
        "Clear idea, still broad.",
        "Interesting, but too vague.",
        "Not ready to state it.",
      ),
      recommended_option: "A",
    },
    {
      ordinal: 2,
      prompt: "What student pattern matters most right now?",
      options: makeOptions(
        "Students rush to answers, skip reflection.",
        "Students save time, learning gains unclear.",
        "Students engage, outcomes vary by class.",
        "Pattern is still unclear.",
      ),
      recommended_option: "A",
    },
    {
      ordinal: 3,
      prompt: "What key tension do we need to solve?",
      options: makeOptions(
        `Tension: ${tension}`,
        "Policy goals versus classroom reality.",
        "Innovation speed versus faculty comfort.",
        "Tension still unclear.",
      ),
      recommended_option: "A",
    },
    {
      ordinal: 4,
      prompt: "What should the lab team do next?",
      options: makeOptions(
        `Next move: ${combinedInsight}`,
        "Run optional workshops first.",
        "Wait for better tools.",
        "No clear move yet.",
      ),
      recommended_option: "A",
    },
    {
      ordinal: 5,
      prompt: "What should the cohort debate next?",
      options: makeOptions(
        `Debate: ${nextMove}`,
        "Prioritize policy over practice?",
        "Delay this to next term?",
        "Question is still unclear.",
      ),
      recommended_option: "A",
    },
  ];
}

function isPositive(option: GuidedQuestionItemRecord["selected_option"]): boolean {
  return option === "A" || option === "B";
}

export function summarizeGuidedRound(items: GuidedQuestionItemRecord[]): {
  summary: string;
  readiness_signals: {
    claim: boolean;
    value: boolean;
    difference: boolean;
    score: number;
  };
} {
  const byOrdinal = new Map(items.map((item) => [item.ordinal, item]));
  const claim = isPositive(byOrdinal.get(1)?.selected_option);
  const value = isPositive(byOrdinal.get(2)?.selected_option);
  const difference = isPositive(byOrdinal.get(3)?.selected_option);
  const score = [claim, value, difference].filter(Boolean).length;

  return {
    summary: `Round complete: ${score}/3 readiness signals. ${score >= 2 ? "Ready for quality check." : "Needs one more pass."}`,
    readiness_signals: {
      claim,
      value,
      difference,
      score,
    },
  };
}
