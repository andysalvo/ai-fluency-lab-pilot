import type { RuntimeConfig } from "../adapters/env.js";

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function normalizeIdeaText(input: string): string {
  return normalizeWhitespace(input);
}

export interface IdeaEmbeddingInput {
  text: string;
  config: RuntimeConfig;
}

export interface IdeaEmbeddingResult {
  ok: boolean;
  model: string;
  vector?: number[];
  error_code?: string;
}

export async function generateIdeaEmbedding(input: IdeaEmbeddingInput): Promise<IdeaEmbeddingResult> {
  const model = input.config.embedding_model;
  const apiKey = input.config.openai_api_key;
  const text = normalizeIdeaText(input.text);
  if (!apiKey) {
    return { ok: false, model, error_code: "OPENAI_KEY_MISSING" };
  }
  if (!text) {
    return { ok: false, model, error_code: "IDEA_TEXT_EMPTY" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.config.embedding_timeout_ms);
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: text,
      }),
    });

    if (!response.ok) {
      return { ok: false, model, error_code: `EMBEDDING_HTTP_${response.status}` };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const data = Array.isArray(payload.data) ? payload.data : [];
    const first = data[0] && typeof data[0] === "object" ? (data[0] as Record<string, unknown>) : null;
    const vector = first && Array.isArray(first.embedding)
      ? first.embedding.filter((item) => typeof item === "number" && Number.isFinite(item)) as number[]
      : [];

    if (vector.length === 0) {
      return { ok: false, model, error_code: "EMBEDDING_VECTOR_MISSING" };
    }

    return {
      ok: true,
      model,
      vector,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, model, error_code: "EMBEDDING_TIMEOUT" };
    }

    return { ok: false, model, error_code: "EMBEDDING_REQUEST_FAILED" };
  } finally {
    clearTimeout(timeout);
  }
}
