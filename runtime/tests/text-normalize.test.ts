import assert from "node:assert/strict";
import test from "node:test";
import { mapWorkspaceToCardStack } from "../frontstage/cards.js";
import {
  cleanSourceExcerpt,
  cleanStudentNote,
  stripLeadingSemanticPrefix,
  toOptionCap,
  toSentenceCap,
} from "../core/text-normalize.js";
import type { ThreadWorkspaceResponse } from "../core/types.js";

test("cleanStudentNote strips model-attribution boilerplate", () => {
  const raw =
    'Gemini said Based on the article from USC, here is a 2-3 sentence response you can use: Students need guided AI routines.';
  const result = cleanStudentNote(raw);

  assert.equal(result.cleaned.startsWith("Gemini said"), false);
  assert.equal(result.cleaned.toLowerCase().includes("here is a 2-3 sentence response"), false);
  assert.equal(result.cleaned.includes("Students need guided AI routines"), true);
  assert.equal(result.flags.length > 0, true);
});

test("stripLeadingSemanticPrefix removes repeated semantic labels", () => {
  assert.equal(
    stripLeadingSemanticPrefix("Core idea: Core idea: Build stronger AI fluency routines."),
    "Build stronger AI fluency routines.",
  );
  assert.equal(
    stripLeadingSemanticPrefix("Strategic implication: this needs one more pass."),
    "this needs one more pass.",
  );
});

test("cleanSourceExcerpt drops navigation boilerplate", () => {
  const raw = "AI is changing learning Skip to Content USC Today Open Site Navigation / Menu Search USC.";
  const cleaned = cleanSourceExcerpt(raw);

  assert.equal(cleaned.toLowerCase().includes("skip to content"), false);
  assert.equal(cleaned.toLowerCase().includes("open site navigation"), false);
  assert.equal(cleaned.toLowerCase().includes("menu search"), false);
  assert.equal(cleaned.toLowerCase().includes("ai is changing learning"), true);
});

test("sentence and option caps enforce word budgets", () => {
  const longSentence =
    "Core idea: students need repeated reflection loops, guided critique, and measurable routines to sustain AI fluency as tools keep shifting every semester.";
  const longOption =
    "Option text that is intentionally too long for the option budget and should be clipped cleanly by deterministic cap logic.";

  const sentence = toSentenceCap(longSentence, 22);
  const option = toOptionCap(longOption, 14);

  assert.equal(sentence.split(/\s+/).length <= 22, true);
  assert.equal(/[.!?]$/.test(sentence), true);
  assert.equal(option.split(/\s+/).length <= 14, true);
});

test("card mapper shows cleaned note by default and raw note in details", () => {
  const workspace: ThreadWorkspaceResponse = {
    ok: true,
    reason_code: "OK",
    organization_id: "applied-ai-labs",
    cycle_id: "cycle-001",
    root_problem_version_id: "pilot-v1",
    thread_id: "thread-001",
    publish_state: "not_ready",
    next_best_action: "Answer one quick question.",
    source: {
      source_submission_id: "src-1",
      thread_id: "thread-001",
      organization_id: "applied-ai-labs",
      cycle_id: "cycle-001",
      root_problem_version_id: "pilot-v1",
      participant_id: "p-1",
      raw_url: "https://example.com/article",
      canonical_url: "https://example.com/article",
      canonical_url_hash: "hash",
      canonicalizer_version: 1,
      relevance_note:
        "Gemini said Based on the article from USC, here is a 2-3 sentence response you can use: students need stronger classroom routines.",
      possible_duplicate: false,
      created_at: "2026-02-21T00:00:00.000Z",
    },
    starter_brief: {
      starter_brief_id: "sb-1",
      source_submission_id: "src-1",
      thread_id: "thread-001",
      organization_id: "applied-ai-labs",
      cycle_id: "cycle-001",
      root_problem_version_id: "pilot-v1",
      status: "ready",
      payload: {
        source_takeaway: "AI is changing how students learn.",
        student_note_takeaway: "Student pattern: students use AI quickly.",
        combined_insight: "Core idea: connect source reading to repeatable reasoning habits.",
        tension_or_assumption: "Key tension: speed versus depth.",
        next_best_move: "Cohort question: which routine should we test first?",
        provenance: "Built only from: https://example.com/article",
      },
      replay_payload: {},
      created_at: "2026-02-21T00:00:00.000Z",
      updated_at: "2026-02-21T00:00:00.000Z",
    },
  };

  const mapped = mapWorkspaceToCardStack(workspace, "Focus question");
  const sourceCard = mapped.cards.find((card) => card.id === "source");
  const insightCard = mapped.cards.find((card) => card.id === "agentic-guidance");

  assert.ok(sourceCard);
  assert.ok(insightCard);
  assert.equal(sourceCard.body_blocks.some((line) => line.toLowerCase().includes("gemini said")), false);
  assert.equal(sourceCard.details?.some((detail) => detail.key === "raw_note"), true);
  assert.equal(insightCard.body_blocks.some((line) => line.includes("Core idea: Core idea:")), false);
  assert.equal(insightCard.body_blocks.some((line) => line.includes("Cohort question: Cohort question:")), false);
});
