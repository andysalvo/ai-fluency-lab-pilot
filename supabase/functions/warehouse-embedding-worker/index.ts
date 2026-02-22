import { getSupabaseAdminClient } from "../_shared/supabase.ts";
import { normalizeIdeaText } from "../_shared/text.ts";

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function asInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function openaiEmbed(apiKey: string, model: string, text: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, input: text }),
    });

    if (!res.ok) {
      return { ok: false, error_code: `EMBEDDING_HTTP_${res.status}` };
    }
    const payload = await res.json();
    const data = Array.isArray(payload.data) ? payload.data : [];
    const first = data[0] && typeof data[0] === "object" ? data[0] : null;
    const vector = first && Array.isArray((first as any).embedding) ? (first as any).embedding as number[] : [];
    if (!vector || vector.length === 0) return { ok: false, error_code: "EMBEDDING_VECTOR_MISSING" };
    return { ok: true, vector };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return { ok: false, error_code: "EMBEDDING_TIMEOUT" };
    return { ok: false, error_code: "EMBEDDING_REQUEST_FAILED" };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const apiKey = Deno.env.get("PILOT_OPENAI_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return json(500, { ok: false, error: "missing_openai_key" });
  }

  const workerId = Deno.env.get("WAREHOUSE_WORKER_ID") ?? "warehouse-embedding-worker";
  const limit = asInt(Deno.env.get("WAREHOUSE_EMBED_BATCH_LIMIT"), 25);
  const timeoutMs = asInt(Deno.env.get("WAREHOUSE_EMBED_TIMEOUT_MS"), 8000);

  const supabase = getSupabaseAdminClient();
  const { data: claimed, error: claimErr } = await supabase.rpc("warehouse_claim_embeddings", {
    p_limit: limit,
    p_worker: workerId,
  });
  if (claimErr) {
    return json(500, { ok: false, error: "claim_failed", message: claimErr.message });
  }

  const rows = Array.isArray(claimed) ? claimed : [];
  if (rows.length === 0) {
    return json(200, { ok: true, processed: 0, message: "no embeddings" });
  }

  let ready = 0;
  let failed = 0;
  for (const row of rows) {
    const entryVersionId = String(row.entry_version_id);
    const model = String(row.embedding_model ?? "text-embedding-3-small");
    const text = normalizeIdeaText(String(row.idea_text_norm ?? ""));
    if (!text) {
      await supabase.from("idea_embeddings").update({
        embedding_status: "failed",
        error_code: "IDEA_TEXT_EMPTY",
        updated_at: new Date().toISOString(),
      }).eq("entry_version_id", entryVersionId);
      failed += 1;
      continue;
    }

    const result = await openaiEmbed(apiKey, model, text, timeoutMs);
    if (result.ok) {
      // Store as pgvector string format.
      const vector = `[${(result.vector ?? []).join(",")}]`;
      await supabase.from("idea_embeddings").update({
        embedding_status: "ready",
        embedding_vector: vector,
        error_code: null,
        embedded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("entry_version_id", entryVersionId);
      ready += 1;
    } else {
      await supabase.from("idea_embeddings").update({
        embedding_status: "failed",
        error_code: result.error_code,
        updated_at: new Date().toISOString(),
      }).eq("entry_version_id", entryVersionId);
      failed += 1;
    }
  }

  return json(200, { ok: true, processed: rows.length, ready, failed });
});

