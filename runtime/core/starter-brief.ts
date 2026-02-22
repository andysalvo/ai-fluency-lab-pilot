import type { RuntimeConfig } from "../adapters/env.js";
import type { InitialThreadDraftContent } from "./types.js";

export const LOCKED_REASONING_MODEL = "gpt-4.1";
export const LOCKED_REASONING_TEMPERATURE = 0;
export const LOCKED_REASONING_TOP_P = 1;
export const INITIAL_THREAD_DRAFT_PROMPT_CONTRACT_VERSION = "initial_thread_draft_v1";
export const LAB_RECORD_PROMPT_CONTRACT_VERSION = "lab_record_v1";
export const APPROVED_GOLDEN_EXAMPLE_ID = "smu_ai_edu_A";

const INITIAL_THREAD_REQUIRED_FIELDS = [
  "source_takeaway",
  "student_note_takeaway",
  "combined_insight",
  "tension_or_assumption",
  "next_best_move",
  "provenance",
  "golden_example_id",
  "prompt_contract_version",
  "model_name",
] as const;

type InitialThreadRequiredField = (typeof INITIAL_THREAD_REQUIRED_FIELDS)[number];

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(1, maxLength - 1))}…`;
}

function capSentences(value: string, maxSentences: number, maxLength: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return "";
  }

  const parts = collapsed.split(/(?<=[.!?])\s+/).filter((item) => item.trim().length > 0);
  const selected = (parts.length > 0 ? parts.slice(0, maxSentences) : [collapsed]).join(" ");
  return truncate(selected, maxLength);
}

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchBoundedSourceText(url: string, timeoutMs = 6000, maxChars = 6000): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "AppliedAILabs/1.0 (+https://ai-fluency-lab-pilot.vercel.app)",
      },
    });

    if (!response.ok) {
      return null;
    }

    const text = await response.text();
    const cleaned = stripHtml(text);
    return cleaned.length > 0 ? truncate(cleaned, maxChars) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function deterministicNormalizeDraft(input: {
  source_takeaway?: string;
  student_note_takeaway?: string;
  combined_insight?: string;
  tension_or_assumption?: string;
  next_best_move?: string;
  provenance?: string;
  url: string;
  relevance_note: string;
  focus_snapshot: string;
}): InitialThreadDraftContent {
  const note = input.relevance_note.trim();
  const focus = input.focus_snapshot.trim();
  const fallbackSourceTakeaway =
    note.length > 0
      ? `The source appears relevant to the focus because it connects to this note: ${truncate(note, 220)}`
      : "The source appears relevant to the focus, but the note did not provide enough detail yet.";
  const fallbackStudentTakeaway =
    note.length > 0
      ? `The student note suggests this angle: ${truncate(note, 220)}`
      : "The student note is too brief to establish a strong position yet.";

  return {
    source_takeaway: capSentences(input.source_takeaway ?? fallbackSourceTakeaway, 2, 340),
    student_note_takeaway: capSentences(input.student_note_takeaway ?? fallbackStudentTakeaway, 2, 320),
    combined_insight: capSentences(
      input.combined_insight ??
        `A stronger fluency approach should connect this source to repeatable student reasoning habits around the focus: ${truncate(focus, 200)}`,
      2,
      360,
    ),
    tension_or_assumption: capSentences(
      input.tension_or_assumption ??
        "A likely assumption is that tool access alone creates fluency, when sustained fluency requires repeated critical thinking practice.",
      2,
      340,
    ),
    next_best_move: capSentences(
      input.next_best_move ??
        "Define one measurable student behavior that would show stronger fluency after this source is discussed and refined.",
      2,
      320,
    ),
    provenance: `Built only from: ${input.url}`,
    golden_example_id: APPROVED_GOLDEN_EXAMPLE_ID,
    prompt_contract_version: INITIAL_THREAD_DRAFT_PROMPT_CONTRACT_VERSION,
    model_name: LOCKED_REASONING_MODEL,
  };
}

export function validateInitialThreadDraftContent(
  payload: Record<string, unknown>,
): { ok: boolean; missing_fields: InitialThreadRequiredField[] } {
  const missing_fields: InitialThreadRequiredField[] = [];

  for (const key of INITIAL_THREAD_REQUIRED_FIELDS) {
    const value = payload[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      missing_fields.push(key);
    }
  }

  return {
    ok: missing_fields.length === 0,
    missing_fields,
  };
}

function fallbackDraft(url: string, relevanceNote: string, focusSnapshot: string): InitialThreadDraftContent {
  return deterministicNormalizeDraft({
    url,
    relevance_note: relevanceNote,
    focus_snapshot: focusSnapshot,
  });
}

function readStringField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

async function generateWithOpenAI(args: {
  apiKey: string;
  url: string;
  relevanceNote: string;
  focusSnapshot: string;
  sourceText: string;
}): Promise<InitialThreadDraftContent | null> {
  const prompt = [
    "You produce one Initial Thread Draft in strict JSON.",
    "Use plain language suitable for first-year college students.",
    "Ground output only in the source text and student note.",
    "Return only JSON with keys:",
    "source_takeaway, student_note_takeaway, combined_insight, tension_or_assumption, next_best_move",
    "Constraints:",
    "- each field should be concise and practical",
    "- no markdown",
    "- no extra keys",
    `Focus: ${args.focusSnapshot}`,
    `Source URL: ${args.url}`,
    `Student note: ${args.relevanceNote}`,
    `Bounded source text: ${truncate(args.sourceText, 3200)}`,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: LOCKED_REASONING_MODEL,
      temperature: LOCKED_REASONING_TEMPERATURE,
      top_p: LOCKED_REASONING_TOP_P,
      messages: [
        { role: "system", content: "You create high-signal structured thinking drafts." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : null;
  const message = first && typeof first.message === "object" ? (first.message as Record<string, unknown>) : null;
  const content = message && typeof message.content === "string" ? message.content : null;
  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const normalized = deterministicNormalizeDraft({
      source_takeaway: readStringField(parsed, "source_takeaway"),
      student_note_takeaway: readStringField(parsed, "student_note_takeaway"),
      combined_insight: readStringField(parsed, "combined_insight"),
      tension_or_assumption: readStringField(parsed, "tension_or_assumption"),
      next_best_move: readStringField(parsed, "next_best_move"),
      provenance: readStringField(parsed, "provenance"),
      url: args.url,
      relevance_note: args.relevanceNote,
      focus_snapshot: args.focusSnapshot,
    });

    const check = validateInitialThreadDraftContent(normalized as unknown as Record<string, unknown>);
    return check.ok ? normalized : null;
  } catch {
    return null;
  }
}

export interface StarterBriefInput {
  url: string;
  relevance_note: string;
  focus_snapshot: string;
  source_excerpt?: string;
  config: RuntimeConfig;
}

export interface StarterBriefOutput {
  status: "ready" | "failed_fetch" | "failed_generation";
  payload: InitialThreadDraftContent;
  replay_payload: Record<string, unknown>;
}

export async function generateStarterBrief(input: StarterBriefInput): Promise<StarterBriefOutput> {
  const excerpt = input.source_excerpt?.trim();
  const fetched = excerpt && excerpt.length > 0 ? truncate(excerpt, 6000) : await fetchBoundedSourceText(input.url);

  const fallback = fallbackDraft(input.url, input.relevance_note, input.focus_snapshot);

  if (!fetched || fetched.length === 0) {
    return {
      status: "ready",
      payload: fallback,
      replay_payload: {
        generation_mode: "fallback_fetch_unavailable",
        fetch_status: "unavailable",
        source_url: input.url,
        used_excerpt: false,
        golden_example_id: APPROVED_GOLDEN_EXAMPLE_ID,
        prompt_contract_version: INITIAL_THREAD_DRAFT_PROMPT_CONTRACT_VERSION,
        model_name: LOCKED_REASONING_MODEL,
        temperature: LOCKED_REASONING_TEMPERATURE,
        top_p: LOCKED_REASONING_TOP_P,
      },
    };
  }

  if (!input.config.openai_api_key) {
    return {
      status: "ready",
      payload: deterministicNormalizeDraft({
        source_takeaway: fetched,
        url: input.url,
        relevance_note: input.relevance_note,
        focus_snapshot: input.focus_snapshot,
      }),
      replay_payload: {
        generation_mode: "fallback_no_openai",
        fetch_status: "ok",
        source_url: input.url,
        used_excerpt: Boolean(excerpt),
        golden_example_id: APPROVED_GOLDEN_EXAMPLE_ID,
        prompt_contract_version: INITIAL_THREAD_DRAFT_PROMPT_CONTRACT_VERSION,
        model_name: LOCKED_REASONING_MODEL,
        temperature: LOCKED_REASONING_TEMPERATURE,
        top_p: LOCKED_REASONING_TOP_P,
      },
    };
  }

  const generated = await generateWithOpenAI({
    apiKey: input.config.openai_api_key,
    url: input.url,
    relevanceNote: input.relevance_note,
    focusSnapshot: input.focus_snapshot,
    sourceText: fetched,
  });

  if (!generated) {
    return {
      status: "ready",
      payload: deterministicNormalizeDraft({
        source_takeaway: fetched,
        url: input.url,
        relevance_note: input.relevance_note,
        focus_snapshot: input.focus_snapshot,
      }),
      replay_payload: {
        generation_mode: "fallback_on_model_error",
        fetch_status: "ok",
        source_url: input.url,
        used_excerpt: Boolean(excerpt),
        golden_example_id: APPROVED_GOLDEN_EXAMPLE_ID,
        prompt_contract_version: INITIAL_THREAD_DRAFT_PROMPT_CONTRACT_VERSION,
        model_name: LOCKED_REASONING_MODEL,
        temperature: LOCKED_REASONING_TEMPERATURE,
        top_p: LOCKED_REASONING_TOP_P,
      },
    };
  }

  return {
    status: "ready",
    payload: generated,
    replay_payload: {
      generation_mode: "openai",
      fetch_status: "ok",
      source_url: input.url,
      used_excerpt: Boolean(excerpt),
      golden_example_id: APPROVED_GOLDEN_EXAMPLE_ID,
      prompt_contract_version: INITIAL_THREAD_DRAFT_PROMPT_CONTRACT_VERSION,
      model_name: LOCKED_REASONING_MODEL,
      temperature: LOCKED_REASONING_TEMPERATURE,
      top_p: LOCKED_REASONING_TOP_P,
    },
  };
}
