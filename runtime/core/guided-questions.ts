import type { GuidedQuestionItemRecord, GuidedQuestionOption } from "./types.js";

export const GUIDED_ROUND_PROMPT_CONTRACT_VERSION = "guided_round_v1";
export const GUIDED_ROUND_MODEL_NAME = "rule-based-deterministic";

function short(value: string | undefined, fallback: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return fallback;
}

function makeOptions(a: string, b: string, c: string, d: string): GuidedQuestionOption[] {
  return [
    { code: "A", text: a },
    { code: "B", text: b },
    { code: "C", text: c },
    { code: "D", text: d },
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
  const sourceTakeaway = short(input.source_takeaway, "Use one specific point from your source.");
  const combinedInsight = short(input.combined_insight, "State one clear insight in plain language.");
  const tension = short(input.tension_or_assumption, "State one risk or assumption to test.");
  const nextMove = short(input.next_best_move, "Propose one measurable next step.");

  return [
    {
      ordinal: 1,
      prompt: `Which claim best captures your current thesis for this Focus? (${input.focus_snapshot})`,
      options: makeOptions(
        `Strong, specific claim tied to source: ${sourceTakeaway}`,
        `Clear claim but missing measurable scope`,
        `Interesting idea but still broad`,
        `I am not ready to state a claim yet`,
      ),
      recommended_option: "A",
    },
    {
      ordinal: 2,
      prompt: "What is the strongest value this idea creates for students?",
      options: makeOptions(
        "Improves durable judgment under changing AI tools",
        "Saves time but unclear learning impact",
        "Mostly novelty with unclear value",
        "Value is still undefined",
      ),
      recommended_option: "A",
    },
    {
      ordinal: 3,
      prompt: "What makes this different from normal classroom AI use?",
      options: makeOptions(
        `Specific difference tied to ${combinedInsight}`,
        "Some difference, but still similar to common workflows",
        "Difference is mostly wording, not behavior",
        "No clear difference yet",
      ),
      recommended_option: "A",
    },
    {
      ordinal: 4,
      prompt: "What would most likely break this idea?",
      options: makeOptions(
        `Known assumption/risk: ${tension}`,
        "Adoption friction from students and faculty",
        "Data quality and consistency risk",
        "Not sure yet",
      ),
      recommended_option: "A",
    },
    {
      ordinal: 5,
      prompt: "Which next experiment should happen this week?",
      options: makeOptions(
        `Run this concrete test: ${nextMove}`,
        "Run a lightweight pilot without measurement",
        "Collect opinions before testing",
        "Delay testing until next cycle",
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
    summary: `Round complete: ${score}/3 readiness signals currently present.`,
    readiness_signals: {
      claim,
      value,
      difference,
      score,
    },
  };
}
