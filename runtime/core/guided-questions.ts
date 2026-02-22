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
  const sourceTakeaway = capWords(short(input.source_takeaway, "Use one clear source point."), 12);
  const combinedInsight = capWords(short(input.combined_insight, "State one clear insight."), 12);
  const tension = capWords(short(input.tension_or_assumption, "Name one key tension."), 12);
  const nextMove = capWords(short(input.next_best_move, "Ask one cohort-level question."), 12);

  return [
    {
      ordinal: 1,
      prompt: `Sentence 1 of 5 (Core idea): which claim fits this focus best?`,
      options: makeOptions(
        `Clear core claim tied to source: ${sourceTakeaway}`,
        "Clear claim, but still broad.",
        "Interesting direction, but too vague.",
        "Not ready to state a claim.",
      ),
      recommended_option: "A",
    },
    {
      ordinal: 2,
      prompt: "Sentence 2 of 5 (Student pattern): what pattern do students show now?",
      options: makeOptions(
        "Students rush for answers without reflection.",
        "Students save time, but learning gains are unclear.",
        "Students engage, but outcomes vary too much.",
        "Pattern is still unclear.",
      ),
      recommended_option: "A",
    },
    {
      ordinal: 3,
      prompt: "Sentence 3 of 5 (Key tension): what tension matters most here?",
      options: makeOptions(
        `Learning depth vs shortcut use: ${tension}`,
        "Policy goals vs classroom reality.",
        "Innovation pace vs faculty comfort.",
        "Tension still unclear.",
      ),
      recommended_option: "A",
    },
    {
      ordinal: 4,
      prompt: "Sentence 4 of 5 (Strategic implication): what should leaders do next?",
      options: makeOptions(
        `Set a repeatable class routine around: ${combinedInsight}`,
        "Run optional workshops first.",
        "Wait for better tools.",
        "No clear strategic move yet.",
      ),
      recommended_option: "A",
    },
    {
      ordinal: 5,
      prompt: "Sentence 5 of 5 (Cohort question): what should the group debate?",
      options: makeOptions(
        `Best cohort question: ${nextMove}`,
        "Should we prioritize policy over practice?",
        "Should we delay until next term?",
        "Question still unclear.",
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
