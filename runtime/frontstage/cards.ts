import type {
  CardStackViewModel,
  CardStatusChip,
  CardViewModel,
  GuidedQuestionOption,
  StarterBriefRecord,
  ThreadWorkspaceResponse,
} from "../core/types.js";

const STUDENT_FOCUS_LINE = "How can students stay fluent with AI as tools and norms keep changing?";

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function addIfPresent(lines: string[], label: string, value: unknown): void {
  const text = asString(value);
  if (text) {
    lines.push(`${label}: ${text}`);
  }
}

function detailIfPresent(key: string, value: unknown): { key: string; value: string } | null {
  const text = asString(value);
  if (!text) {
    return null;
  }
  return { key, value: text };
}

function toStarter(starter: StarterBriefRecord | undefined): Record<string, unknown> {
  if (!starter || !starter.payload || typeof starter.payload !== "object") {
    return {};
  }

  return starter.payload;
}

function mapStatusChip(workspace: ThreadWorkspaceResponse): CardStatusChip {
  if (workspace.publish_state === "published") {
    return "ready";
  }

  if (!workspace.source) {
    return "blocked";
  }

  if (!workspace.starter_brief || workspace.starter_brief.status !== "ready") {
    return "info";
  }

  if (workspace.readiness?.ready_to_publish) {
    return "ready";
  }

  return "needs_refinement";
}

function statusLabel(statusChip: CardStatusChip): string {
  if (statusChip === "ready") {
    return "✅ Ready";
  }

  if (statusChip === "blocked") {
    return "⛔ Blocked";
  }

  if (statusChip === "needs_refinement") {
    return "⚠ Needs refinement";
  }

  return "ℹ In progress";
}

function readinessMissingText(reasonCode: string | undefined): string {
  if (!reasonCode) {
    return "Run readiness check to see what is still missing.";
  }

  if (reasonCode === "NEEDS_CONFIRMATION") {
    return "All criteria are met; explicit confirmation is still required.";
  }

  if (reasonCode === "INSUFFICIENT_CRITERIA") {
    return "At least one criterion (claim/value/difference) is still missing.";
  }

  if (reasonCode === "INSUFFICIENT_CRITERIA_AND_CONFIRMATION") {
    return "Criteria and confirmation are both incomplete.";
  }

  return `Current readiness reason: ${reasonCode}.`;
}

function buildFocusCard(workspace: ThreadWorkspaceResponse, focusSnapshot: string): CardViewModel {
  return {
    id: "focus",
    title: "Focus",
    status_chip: "info",
    body_blocks: [focusSnapshot, STUDENT_FOCUS_LINE],
    details: [
      { key: "cycle_id", value: workspace.cycle_id },
      { key: "thread_id", value: workspace.thread_id },
    ],
  };
}

function buildSourceCard(workspace: ThreadWorkspaceResponse): CardViewModel {
  if (!workspace.source) {
    return {
      id: "source",
      title: "Source",
      status_chip: "blocked",
      body_blocks: ["No source submission found for this thread yet."],
      bullets: ["Use Add a Source to submit URL + note.", "After submit, the Initial Thread Draft appears automatically."],
    };
  }

  return {
    id: "source",
    title: "Source",
    status_chip: "ready",
    body_blocks: [workspace.source.raw_url, workspace.source.relevance_note],
    details: [
      { key: "canonical_url", value: workspace.source.canonical_url },
      { key: "possible_duplicate", value: workspace.source.possible_duplicate ? "true" : "false" },
      { key: "source_submission_id", value: workspace.source.source_submission_id },
    ],
  };
}

function buildDraftCard(workspace: ThreadWorkspaceResponse): CardViewModel {
  if (!workspace.starter_brief) {
    return {
      id: "initial-thread-draft",
      title: "Initial Thread Draft",
      status_chip: "info",
      body_blocks: ["Starter draft appears after source processing completes."],
      bullets: ["Submit a source URL + note first.", "Refresh this thread after processing."],
    };
  }

  if (workspace.starter_brief.status !== "ready") {
    return {
      id: "initial-thread-draft",
      title: "Initial Thread Draft",
      status_chip: "info",
      body_blocks: ["Starter draft is processing for this thread."],
      details: [{ key: "starter_brief_status", value: workspace.starter_brief.status }],
    };
  }

  const starterPayload = toStarter(workspace.starter_brief);
  const bodyBlocks: string[] = [];
  addIfPresent(bodyBlocks, "Source takeaway", starterPayload.source_takeaway);
  addIfPresent(bodyBlocks, "Your note takeaway", starterPayload.student_note_takeaway);
  addIfPresent(bodyBlocks, "Combined insight", starterPayload.combined_insight);
  addIfPresent(bodyBlocks, "Tension/assumption", starterPayload.tension_or_assumption);
  addIfPresent(bodyBlocks, "Next best move", starterPayload.next_best_move);
  if (bodyBlocks.length === 0) {
    bodyBlocks.push("Draft was generated but core sections are missing. Regenerate from this thread.");
  }

  const details = [
    detailIfPresent("provenance", starterPayload.provenance),
    detailIfPresent("model_name", starterPayload.model_name),
    detailIfPresent("prompt_contract_version", starterPayload.prompt_contract_version),
    detailIfPresent("golden_example_id", starterPayload.golden_example_id),
    { key: "starter_brief_status", value: workspace.starter_brief.status },
  ].filter((item): item is { key: string; value: string } => item !== null);

  return {
    id: "initial-thread-draft",
    title: "Initial Thread Draft",
    status_chip: "ready",
    body_blocks: bodyBlocks,
    details: details.length > 0 ? details : undefined,
  };
}

function deriveExperiment(nextBestMove: string): string {
  if (/experiment|test|pilot|measure|trial/i.test(nextBestMove)) {
    return nextBestMove;
  }

  return "Define one test, one measurable signal, and one expected change if your claim is correct.";
}

function buildAgenticGuidanceCard(workspace: ThreadWorkspaceResponse): CardViewModel {
  const starterPayload = toStarter(workspace.starter_brief);
  const tension = asString(starterPayload.tension_or_assumption) ?? "No tension noted yet.";
  const nextBestMove = asString(starterPayload.next_best_move) ?? "No next move proposed yet.";
  const readinessReason = workspace.readiness?.reason_code;

  return {
    id: "agentic-guidance",
    title: "What’s Missing / What Would Change My Mind",
    status_chip: workspace.readiness?.ready_to_publish ? "ready" : "needs_refinement",
    body_blocks: [
      readinessMissingText(readinessReason),
      `What would change my mind: ${tension}`,
      `Proposed experiment: ${deriveExperiment(nextBestMove)}`,
    ],
    bullets: [
      "Keep changes inside this thread and cycle only.",
      "Use one concrete test before final publish.",
    ],
  };
}

function buildRoundsCard(workspace: ThreadWorkspaceResponse): CardViewModel {
  const rounds = workspace.rounds ?? [];
  if (rounds.length === 0) {
    return {
      id: "guided-rounds",
      title: "Guided Rounds",
      status_chip: "info",
      body_blocks: ["No guided rounds started yet."],
      bullets: ["Start Round 1 (5 MCQs).", "Maximum 3 rounds per thread."],
    };
  }

  const completed = rounds.filter((round) => round.status === "completed").length;
  const active = rounds.find((round) => round.status === "active");

  return {
    id: "guided-rounds",
    title: "Guided Rounds",
    status_chip: active ? "needs_refinement" : "ready",
    body_blocks: [
      `Rounds completed: ${completed}/3`,
      active ? `Active round: ${active.round_number}/3` : "No active round.",
    ],
    details: rounds.map((round) => ({
      key: `round_${round.round_number}`,
      value: `${round.status}${round.summary ? ` | ${round.summary}` : ""}`,
    })),
  };
}

function buildLabBriefCard(workspace: ThreadWorkspaceResponse): CardViewModel {
  const draft = workspace.lab_brief_draft;
  if (!draft) {
    return {
      id: "lab-brief",
      title: "Lab Brief",
      status_chip: "info",
      body_blocks: ["No Lab Brief proposal yet."],
      bullets: ["Generate proposal from this thread.", "Review readiness and confirm before publish."],
    };
  }

  const content = draft.content;
  const bodyBlocks: string[] = [];
  addIfPresent(bodyBlocks, "What it is", content.what_it_is);
  addIfPresent(bodyBlocks, "Why it matters", content.why_it_matters);
  addIfPresent(bodyBlocks, "Evidence", content.evidence);
  addIfPresent(bodyBlocks, "Next step", content.next_step);
  if (bodyBlocks.length === 0) {
    bodyBlocks.push("No Lab Brief fields available yet. Generate a proposal from this thread.");
  }

  const details = [
    detailIfPresent("draft_id", draft.draft_id),
    detailIfPresent("status", draft.status),
    detailIfPresent("confidence", content.confidence),
  ].filter((item): item is { key: string; value: string } => item !== null);

  return {
    id: "lab-brief",
    title: "Lab Brief",
    status_chip: draft.status === "ready" ? "ready" : "needs_refinement",
    body_blocks: bodyBlocks,
    details: details.length > 0 ? details : undefined,
  };
}

export function mapWorkspaceToCardStack(workspace: ThreadWorkspaceResponse, focusSnapshot: string): CardStackViewModel {
  const cards: CardViewModel[] = [
    buildFocusCard(workspace, focusSnapshot),
    buildSourceCard(workspace),
    buildDraftCard(workspace),
    buildAgenticGuidanceCard(workspace),
    buildRoundsCard(workspace),
    buildLabBriefCard(workspace),
  ];

  const status_chip = mapStatusChip(workspace);
  return {
    status_chip,
    status_label: statusLabel(status_chip),
    next_best_action: workspace.next_best_action,
    cards,
  };
}

export interface StudentSimpleViewModel {
  status_chip: CardStatusChip;
  status_label: string;
  next_best_action: string;
  current_stage?: ThreadWorkspaceResponse["current_stage"];
  primary_action_label?: string;
  progress_label?: string;
  cards: CardViewModel[];
  next_question?: {
    question_item_id: string;
    ordinal: number;
    prompt: string;
    options: GuidedQuestionOption[];
  };
}

function selectCardIdsByStage(stage: ThreadWorkspaceResponse["current_stage"]): string[] {
  switch (stage) {
    case "source_ready":
      return ["focus", "source"];
    case "draft_ready":
      return ["focus", "source", "initial-thread-draft"];
    case "round_in_progress":
      return ["focus", "source", "initial-thread-draft", "agentic-guidance"];
    case "round_complete":
      return ["focus", "initial-thread-draft", "guided-rounds", "agentic-guidance"];
    case "brief_ready":
      return ["focus", "lab-brief", "agentic-guidance"];
    case "ready_to_publish":
      return ["focus", "lab-brief", "agentic-guidance"];
    case "published":
      return ["focus", "lab-brief"];
    default:
      return ["focus", "source", "initial-thread-draft"];
  }
}

export function mapWorkspaceToStudentSimpleView(
  workspace: ThreadWorkspaceResponse,
  focusSnapshot: string,
): StudentSimpleViewModel {
  const stack = mapWorkspaceToCardStack(workspace, focusSnapshot);
  const cardsById = new Map(stack.cards.map((card) => [card.id, card]));
  const ordered = selectCardIdsByStage(workspace.current_stage)
    .map((id) => cardsById.get(id))
    .filter((card): card is CardViewModel => Boolean(card));

  return {
    status_chip: stack.status_chip,
    status_label: stack.status_label,
    next_best_action: stack.next_best_action,
    current_stage: workspace.current_stage,
    primary_action_label: workspace.primary_action_label,
    progress_label: workspace.progress_label,
    cards: ordered.length > 0 ? ordered : stack.cards.slice(0, 3),
    next_question: workspace.next_question,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderCardsHtml(model: CardStackViewModel): string {
  const cardHtml = model.cards
    .map((card) => {
      const body = card.body_blocks.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
      const bullets = (card.bullets ?? []).map((line) => `<li>${escapeHtml(line)}</li>`).join("");
      const details = (card.details ?? [])
        .map((item) => `<div><dt>${escapeHtml(item.key)}</dt><dd>${escapeHtml(item.value)}</dd></div>`)
        .join("");

      return `<section class=\"card\">\n  <div class=\"card-head\"><h2>${escapeHtml(card.title)}</h2><span class=\"chip chip-${card.status_chip}\">${escapeHtml(card.status_chip.replace("_", " "))}</span></div>\n  <div class=\"card-body\">${body}${bullets ? `<ul>${bullets}</ul>` : ""}</div>\n  ${
        details
          ? `<details class=\"card-details\"><summary>Details</summary><dl>${details}</dl></details>`
          : ""
      }\n</section>`;
    })
    .join("\n");

  return `<section class=\"status-callout status-${model.status_chip}\"><strong>${escapeHtml(model.status_label)}</strong><p>${escapeHtml(
    model.next_best_action,
  )}</p></section>\n${cardHtml}`;
}
