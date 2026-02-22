import type { RuntimeConfig } from "../adapters/env.js";
import {
  GUIDED_ROUND_MODEL_NAME,
  GUIDED_ROUND_PROMPT_CONTRACT_VERSION,
  generateGuidedRoundQuestions,
} from "./guided-questions.js";
import {
  LAB_BRIEF_PROPOSAL_CONTRACT_VERSION,
  LAB_BRIEF_PROPOSAL_MODEL_NAME,
  proposeLabBriefFromThread,
} from "./lab-brief-proposal.js";
import type {
  GuidedQuestionItemRecord,
  GuidedQuestionOption,
  LabBriefGenerationContent,
  PlannerFallbackReason,
  PlannerRunMetadata,
  StarterBriefRecord,
} from "./types.js";

type GuidedRoundShape = Array<Pick<GuidedQuestionItemRecord, "ordinal" | "prompt" | "options" | "recommended_option">>;

interface ProviderResult<T> {
  payload: T;
  metadata: PlannerRunMetadata;
}

interface OpenAICompatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    total_tokens?: number;
  };
}

let activeKimiRequests = 0;

function nowMs(): number {
  return Date.now();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asGuidedOption(value: unknown): GuidedQuestionOption | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const code = asString(row.code);
  const text = asString(row.text);
  if (!code || !text || !["A", "B", "C", "D"].includes(code)) {
    return null;
  }
  return { code: code as GuidedQuestionOption["code"], text };
}

function parseGuidedQuestionsPayload(raw: unknown): GuidedRoundShape | null {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const candidate = Array.isArray(raw)
    ? raw
    : Array.isArray(obj?.questions)
      ? obj?.questions
      : null;
  if (!candidate || candidate.length !== 5) {
    return null;
  }

  const out: GuidedRoundShape = [];
  for (let index = 0; index < candidate.length; index += 1) {
    const row = candidate[index];
    if (!row || typeof row !== "object") {
      return null;
    }
    const item = row as Record<string, unknown>;
    const prompt = asString(item.prompt);
    const optionsRaw = Array.isArray(item.options) ? item.options : [];
    const options = optionsRaw.map(asGuidedOption).filter((value): value is GuidedQuestionOption => value !== null);
    const recommended = asString(item.recommended_option);
    if (!prompt || options.length !== 4 || !recommended || !["A", "B", "C", "D"].includes(recommended)) {
      return null;
    }
    out.push({
      ordinal: index + 1,
      prompt,
      options,
      recommended_option: recommended as GuidedQuestionItemRecord["recommended_option"],
    });
  }

  return out;
}

function parseLabBriefPayload(raw: unknown): LabBriefGenerationContent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const what_it_is = asString(row.what_it_is);
  const why_it_matters = asString(row.why_it_matters);
  const evidence = asString(row.evidence);
  const next_step = asString(row.next_step);
  if (!what_it_is || !why_it_matters || !evidence || !next_step) {
    return null;
  }
  return {
    what_it_is,
    why_it_matters,
    evidence,
    next_step,
    confidence: asString(row.confidence),
    model_name: asString(row.model_name) ?? "kimi",
    prompt_contract_version: asString(row.prompt_contract_version) ?? LAB_BRIEF_PROPOSAL_CONTRACT_VERSION,
    golden_example_id: asString(row.golden_example_id) ?? "smu_ai_edu_A",
  };
}

function plannerDisabledMetadata(modelName: string, promptVersion: string): PlannerRunMetadata {
  return {
    provider: "deterministic",
    model_name: modelName,
    status: "success",
    prompt_contract_version: promptVersion,
    latency_ms: 0,
  };
}

function fallbackMetadata(
  config: RuntimeConfig,
  promptVersion: string,
  latencyMs: number,
  fallbackReason: PlannerFallbackReason,
): PlannerRunMetadata {
  return {
    provider: "kimi",
    model_name: config.kimi_planner_model,
    status: "fallback",
    prompt_contract_version: promptVersion,
    latency_ms: latencyMs,
    fallback_reason: fallbackReason,
  };
}

function successMetadata(config: RuntimeConfig, promptVersion: string, latencyMs: number, estimatedCostUsd?: number): PlannerRunMetadata {
  return {
    provider: "kimi",
    model_name: config.kimi_planner_model,
    status: "success",
    prompt_contract_version: promptVersion,
    latency_ms: latencyMs,
    estimated_cost_usd: estimatedCostUsd,
  };
}

async function callKimiJson(
  config: RuntimeConfig,
  prompt: string,
): Promise<{ json: unknown; estimated_cost_usd?: number }> {
  const base = config.kimi_base_url.replace(/\/$/, "");
  const response = await withTimeout(
    fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.kimi_api_key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.kimi_planner_model,
        temperature: 0,
        top_p: 1,
        messages: [
          { role: "system", content: "You are a strict JSON planner. Return JSON only." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    }),
    config.kimi_timeout_ms,
  );

  if (response.status === 429) {
    throw new Error("RATE_LIMIT");
  }
  if (!response.ok) {
    throw new Error("CAPACITY");
  }
  const payload = (await response.json()) as OpenAICompatResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("SCHEMA");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("SCHEMA");
  }

  const tokenCount = payload.usage?.total_tokens;
  const estimatedCostUsd =
    typeof tokenCount === "number" && Number.isFinite(tokenCount)
      ? Number((tokenCount * 0.000001).toFixed(6))
      : undefined;

  return { json: parsed, estimated_cost_usd: estimatedCostUsd };
}

function kimiEnabled(config: RuntimeConfig): boolean {
  return config.use_kimi_planner && Boolean(config.kimi_api_key) && Boolean(config.kimi_base_url) && Boolean(config.kimi_planner_model);
}

async function tryWithKimi<T>(config: RuntimeConfig, promptVersion: string, prompt: string, parser: (raw: unknown) => T | null): Promise<{
  ok: boolean;
  result?: ProviderResult<T>;
  fallback_reason?: PlannerFallbackReason;
  latency_ms: number;
}> {
  const startedAt = nowMs();
  if (!kimiEnabled(config)) {
    return { ok: false, fallback_reason: "CAPACITY", latency_ms: 0 };
  }
  if (activeKimiRequests >= config.kimi_max_concurrency) {
    return { ok: false, fallback_reason: "CAPACITY", latency_ms: 0 };
  }

  activeKimiRequests += 1;
  try {
    const response = await callKimiJson(config, prompt);
    const parsed = parser(response.json);
    if (!parsed) {
      return { ok: false, fallback_reason: "SCHEMA", latency_ms: nowMs() - startedAt };
    }
    return {
      ok: true,
      result: {
        payload: parsed,
        metadata: successMetadata(config, promptVersion, nowMs() - startedAt, response.estimated_cost_usd),
      },
      latency_ms: nowMs() - startedAt,
    };
  } catch (error) {
    const latencyMs = nowMs() - startedAt;
    const message = error instanceof Error ? error.message : "CAPACITY";
    if (message === "TIMEOUT") {
      return { ok: false, fallback_reason: "TIMEOUT", latency_ms: latencyMs };
    }
    if (message === "RATE_LIMIT") {
      return { ok: false, fallback_reason: "RATE_LIMIT", latency_ms: latencyMs };
    }
    if (message === "SCHEMA") {
      return { ok: false, fallback_reason: "SCHEMA", latency_ms: latencyMs };
    }
    return { ok: false, fallback_reason: "CAPACITY", latency_ms: latencyMs };
  } finally {
    activeKimiRequests = Math.max(0, activeKimiRequests - 1);
  }
}

export async function generateGuidedRoundWithProvider(
  input: {
    focus_snapshot: string;
    source_url: string;
    source_takeaway?: string;
    combined_insight?: string;
    tension_or_assumption?: string;
    next_best_move?: string;
  },
  config: RuntimeConfig,
): Promise<ProviderResult<GuidedRoundShape>> {
  const deterministic = generateGuidedRoundQuestions(input);
  if (!kimiEnabled(config)) {
    return {
      payload: deterministic,
      metadata: plannerDisabledMetadata(GUIDED_ROUND_MODEL_NAME, GUIDED_ROUND_PROMPT_CONTRACT_VERSION),
    };
  }

  const prompt = [
    "Return exactly 5 multiple-choice questions as strict JSON for this thread.",
    "Use plain language for 17-21 year old students.",
    "Return JSON shape:",
    '{"questions":[{"ordinal":1,"prompt":"...","options":[{"code":"A","text":"..."},{"code":"B","text":"..."},{"code":"C","text":"..."},{"code":"D","text":"..."}],"recommended_option":"A"}]}',
    `Focus: ${input.focus_snapshot}`,
    `Source URL: ${input.source_url}`,
    `Source takeaway: ${input.source_takeaway ?? ""}`,
    `Combined insight: ${input.combined_insight ?? ""}`,
    `Tension or assumption: ${input.tension_or_assumption ?? ""}`,
    `Next best move: ${input.next_best_move ?? ""}`,
  ].join("\n");

  const kimiResult = await tryWithKimi(config, GUIDED_ROUND_PROMPT_CONTRACT_VERSION, prompt, parseGuidedQuestionsPayload);
  if (!kimiResult.ok || !kimiResult.result) {
    return {
      payload: deterministic,
      metadata: fallbackMetadata(
        config,
        GUIDED_ROUND_PROMPT_CONTRACT_VERSION,
        kimiResult.latency_ms,
        kimiResult.fallback_reason ?? "CAPACITY",
      ),
    };
  }
  return kimiResult.result;
}

export async function proposeLabBriefWithProvider(
  input: {
    focus_snapshot: string;
    source_url: string;
    relevance_note: string;
    starter_brief?: StarterBriefRecord;
    round_summary?: string;
    confidence?: string;
  },
  config: RuntimeConfig,
): Promise<ProviderResult<LabBriefGenerationContent>> {
  const deterministic = proposeLabBriefFromThread(input);
  if (!kimiEnabled(config)) {
    return {
      payload: deterministic,
      metadata: plannerDisabledMetadata(LAB_BRIEF_PROPOSAL_MODEL_NAME, LAB_BRIEF_PROPOSAL_CONTRACT_VERSION),
    };
  }

  const starterPayload = (input.starter_brief?.payload ?? {}) as Record<string, unknown>;
  const prompt = [
    "Return one lab brief proposal as strict JSON with fields:",
    "what_it_is, why_it_matters, evidence, next_step, confidence (optional).",
    "Use only same-thread source and note context.",
    "Keep each field concise and practical.",
    `Focus: ${input.focus_snapshot}`,
    `Source URL: ${input.source_url}`,
    `Relevance note: ${input.relevance_note}`,
    `Starter combined insight: ${asString(starterPayload.combined_insight) ?? ""}`,
    `Starter tension/assumption: ${asString(starterPayload.tension_or_assumption) ?? ""}`,
    `Starter next best move: ${asString(starterPayload.next_best_move) ?? ""}`,
    `Latest round summary: ${input.round_summary ?? ""}`,
  ].join("\n");

  const kimiResult = await tryWithKimi(config, LAB_BRIEF_PROPOSAL_CONTRACT_VERSION, prompt, parseLabBriefPayload);
  if (!kimiResult.ok || !kimiResult.result) {
    return {
      payload: deterministic,
      metadata: fallbackMetadata(
        config,
        LAB_BRIEF_PROPOSAL_CONTRACT_VERSION,
        kimiResult.latency_ms,
        kimiResult.fallback_reason ?? "CAPACITY",
      ),
    };
  }
  return kimiResult.result;
}
