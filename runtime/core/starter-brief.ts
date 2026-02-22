import type { RuntimeConfig } from "../adapters/env.js";
import { STARTER_DRAFT_PROMPT_CONTRACT_VERSION, generateStarterDraftWithProvider } from "./planner-provider.js";
import type { InitialThreadDraftContent } from "./types.js";

export const LOCKED_REASONING_MODEL = "gpt-4.1";
export const LOCKED_REASONING_TEMPERATURE = 0;
export const LOCKED_REASONING_TOP_P = 1;
export const INITIAL_THREAD_DRAFT_PROMPT_CONTRACT_VERSION = STARTER_DRAFT_PROMPT_CONTRACT_VERSION;
export const LAB_RECORD_PROMPT_CONTRACT_VERSION = "lab_record_v1";
export const APPROVED_GOLDEN_EXAMPLE_ID = "smu_ai_edu_A";
const MAX_SENTENCE_WORDS = 22;

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

function capWords(value: string, maxWords: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  const words = normalized.split(" ");
  if (words.length <= maxWords) {
    return normalized;
  }
  return words.slice(0, maxWords).join(" ");
}

function toSentence(value: string, fallbackText: string, maxLength: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return fallbackText;
  }
  const first = collapsed.split(/(?<=[.!?])\s+/)[0] ?? collapsed;
  const words = capWords(first, MAX_SENTENCE_WORDS);
  const withPunctuation = /[.!?]$/.test(words) ? words : `${words}.`;
  return truncate(withPunctuation, maxLength);
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
  url: string;
  relevance_note: string;
  focus_snapshot: string;
  model_name?: string;
  prompt_contract_version?: string;
  golden_example_id?: string;
}): InitialThreadDraftContent {
  const note = input.relevance_note.trim();
  const focus = truncate(input.focus_snapshot.trim(), 220);
  const fallbackSourceTakeaway =
    note.length > 0 ? `Source signal: ${truncate(note, 220)}` : "Source signal: this article links to the focus but needs a clearer note.";
  const fallbackStudentTakeaway =
    note.length > 0 ? `Student pattern: ${truncate(note, 220)}` : "Student pattern: the note is too short to show a clear direction yet.";

  return {
    source_takeaway: toSentence(input.source_takeaway ?? fallbackSourceTakeaway, fallbackSourceTakeaway, 260),
    student_note_takeaway: toSentence(input.student_note_takeaway ?? fallbackStudentTakeaway, fallbackStudentTakeaway, 260),
    combined_insight: toSentence(
      input.combined_insight ??
        `Core idea: connect source reading to repeatable reasoning habits around this focus: ${focus}`,
      "Core idea: connect source reading to repeatable reasoning habits around this focus.",
      260,
    ),
    tension_or_assumption: toSentence(
      input.tension_or_assumption ??
        "Key tension: easy AI answers can replace real thinking unless classes require evidence, reflection, and clear feedback loops.",
      "Key tension: easy AI answers can replace real thinking unless classes require evidence and reflection.",
      260,
    ),
    next_best_move: toSentence(
      input.next_best_move ??
        "Cohort question: which class routine best helps students use AI for stronger reasoning, not shortcuts?",
      "Cohort question: which class routine best helps students use AI for stronger reasoning?",
      260,
    ),
    provenance: `Built only from: ${input.url}`,
    golden_example_id: input.golden_example_id ?? APPROVED_GOLDEN_EXAMPLE_ID,
    prompt_contract_version: input.prompt_contract_version ?? INITIAL_THREAD_DRAFT_PROMPT_CONTRACT_VERSION,
    model_name: input.model_name ?? LOCKED_REASONING_MODEL,
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
    "Use plain language for 17-21 college students.",
    "Tone: focus-group consultant summary, practical and non-jargon.",
    "Ground output only in the source text and student note.",
    "Return only JSON with keys:",
    "source_takeaway, student_note_takeaway, combined_insight, tension_or_assumption, next_best_move",
    "Constraints:",
    "- each field should be one sentence with 22 words or fewer",
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

  const deterministicFromSource = deterministicNormalizeDraft({
    source_takeaway: fetched,
    url: input.url,
    relevance_note: input.relevance_note,
    focus_snapshot: input.focus_snapshot,
  });

  if (input.config.use_kimi_planner) {
    const planner = await generateStarterDraftWithProvider(
      {
        focus_snapshot: input.focus_snapshot,
        source_url: input.url,
        relevance_note: input.relevance_note,
        source_excerpt: fetched,
        deterministic: {
          source_takeaway: deterministicFromSource.source_takeaway,
          student_note_takeaway: deterministicFromSource.student_note_takeaway,
          combined_insight: deterministicFromSource.combined_insight,
          tension_or_assumption: deterministicFromSource.tension_or_assumption,
          next_best_move: deterministicFromSource.next_best_move,
        },
      },
      input.config,
    );

    const payload = deterministicNormalizeDraft({
      source_takeaway: planner.payload.source_takeaway,
      student_note_takeaway: planner.payload.student_note_takeaway,
      combined_insight: planner.payload.combined_insight,
      tension_or_assumption: planner.payload.tension_or_assumption,
      next_best_move: planner.payload.next_best_move,
      url: input.url,
      relevance_note: input.relevance_note,
      focus_snapshot: input.focus_snapshot,
      model_name: planner.metadata.model_name,
      prompt_contract_version: planner.metadata.prompt_contract_version,
    });

    const generationMode =
      planner.metadata.provider === "kimi" && planner.metadata.status === "success"
        ? "kimi"
        : planner.metadata.status === "fallback"
          ? `fallback_${String(planner.metadata.fallback_reason ?? "capacity").toLowerCase()}`
          : "deterministic";

    return {
      status: "ready",
      payload,
      replay_payload: {
        generation_mode: generationMode,
        fetch_status: "ok",
        source_url: input.url,
        used_excerpt: Boolean(excerpt),
        planner_provider: planner.metadata.provider,
        planner_status: planner.metadata.status,
        fallback_reason: planner.metadata.fallback_reason,
        latency_ms: planner.metadata.latency_ms,
        estimated_cost_usd: planner.metadata.estimated_cost_usd,
        golden_example_id: payload.golden_example_id,
        prompt_contract_version: payload.prompt_contract_version,
        model_name: payload.model_name,
        temperature: LOCKED_REASONING_TEMPERATURE,
        top_p: LOCKED_REASONING_TOP_P,
      },
    };
  }

  if (!input.config.openai_api_key) {
    return {
      status: "ready",
      payload: deterministicFromSource,
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
      payload: deterministicFromSource,
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
