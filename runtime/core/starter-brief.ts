import type { RuntimeConfig } from "../adapters/env.js";

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function stripHtml(input: string): string {
  return input.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchBoundedSourceText(url: string, timeoutMs = 6000, maxChars = 6000): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "user-agent": "AppliedAILabs/1.0 (+https://appliedailabs.example)",
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

function fallbackBrief(url: string, relevanceNote: string, focusSnapshot: string): { payload: Record<string, unknown>; replayPayload: Record<string, unknown> } {
  const note = relevanceNote.trim();
  const shortFocus = truncate(focusSnapshot.trim(), 160);
  const shortNote = truncate(note.length > 0 ? note : "This source appears relevant to the current focus.", 280);

  return {
    payload: {
      what_this_source_says: shortNote,
      how_it_connects_to_focus: `This source may inform the focus: ${shortFocus}`,
      next_angles: [
        "What practical behavior change could this source suggest for students?",
        "Which assumption in the focus does this source challenge or support?",
        "What one small test could the team run this week from this source?",
      ],
      provenance: `Built only from: ${url}`,
      generation_mode: "fallback",
    },
    replayPayload: {
      generation_mode: "fallback",
      source_url: url,
      used_excerpt: false,
    },
  };
}

async function generateWithOpenAI(args: {
  apiKey: string;
  model: string;
  focusSnapshot: string;
  url: string;
  relevanceNote: string;
  sourceText: string;
}): Promise<Record<string, unknown> | null> {
  const prompt = [
    "You are helping a student team think clearly.",
    "Return strict JSON with keys: what_this_source_says, how_it_connects_to_focus, next_angles.",
    "Constraints:",
    "- what_this_source_says: 1-2 plain-English sentences",
    "- how_it_connects_to_focus: 1-2 sentences",
    "- next_angles: exactly 3 concise questions",
    "- stay grounded only in provided source text and relevance note",
    `Focus: ${args.focusSnapshot}`,
    `Source URL: ${args.url}`,
    `Relevance Note: ${args.relevanceNote}`,
    `Source Text: ${truncate(args.sourceText, 3000)}`,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: "You create concise structured thinking briefs." },
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
    const what = typeof parsed.what_this_source_says === "string" ? parsed.what_this_source_says : "";
    const connect = typeof parsed.how_it_connects_to_focus === "string" ? parsed.how_it_connects_to_focus : "";
    const nextAngles = Array.isArray(parsed.next_angles) ? parsed.next_angles.filter((item) => typeof item === "string") : [];

    if (!what || !connect || nextAngles.length < 3) {
      return null;
    }

    return {
      what_this_source_says: truncate(what, 320),
      how_it_connects_to_focus: truncate(connect, 320),
      next_angles: nextAngles.slice(0, 3).map((item) => truncate(item, 140)),
    };
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
  payload: Record<string, unknown>;
  replay_payload: Record<string, unknown>;
}

export async function generateStarterBrief(input: StarterBriefInput): Promise<StarterBriefOutput> {
  const excerpt = input.source_excerpt?.trim();
  const fetched = excerpt && excerpt.length > 0 ? truncate(excerpt, 6000) : await fetchBoundedSourceText(input.url);

  const fallback = fallbackBrief(input.url, input.relevance_note, input.focus_snapshot);

  if (!fetched || fetched.length === 0) {
    return {
      status: "ready",
      payload: {
        ...fallback.payload,
        fetch_status: "unavailable",
      },
      replay_payload: {
        ...fallback.replayPayload,
        fetch_status: "unavailable",
      },
    };
  }

  if (!input.config.openai_api_key) {
    return {
      status: "ready",
      payload: {
        ...fallback.payload,
        what_this_source_says: truncate(fetched, 220),
        generation_mode: "fallback_no_openai",
      },
      replay_payload: {
        ...fallback.replayPayload,
        fetch_status: "ok",
        generation_mode: "fallback_no_openai",
      },
    };
  }

  const generated = await generateWithOpenAI({
    apiKey: input.config.openai_api_key,
    model: input.config.default_model,
    focusSnapshot: input.focus_snapshot,
    url: input.url,
    relevanceNote: input.relevance_note,
    sourceText: fetched,
  });

  if (!generated) {
    return {
      status: "ready",
      payload: {
        ...fallback.payload,
        what_this_source_says: truncate(fetched, 220),
        generation_mode: "fallback_on_model_error",
      },
      replay_payload: {
        ...fallback.replayPayload,
        fetch_status: "ok",
        generation_mode: "fallback_on_model_error",
      },
    };
  }

  return {
    status: "ready",
    payload: {
      ...generated,
      provenance: `Built only from: ${input.url}`,
      generation_mode: "openai",
    },
    replay_payload: {
      generation_mode: "openai",
      source_url: input.url,
      used_excerpt: Boolean(excerpt),
    },
  };
}
