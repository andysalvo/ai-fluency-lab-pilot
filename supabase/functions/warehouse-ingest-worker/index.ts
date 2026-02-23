import { getSupabaseAdminClient } from "../_shared/supabase.ts";
import { fetchNotionPage, flattenNotionProperties } from "../_shared/notion.ts";
import { canonicalizeEmail, normalizeIdeaText, sha256Hex } from "../_shared/text.ts";

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function readString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return undefined;
}

function asInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function backoffSeconds(attempt: number): number {
  // Exponential backoff with cap.
  const base = Math.min(60 * 30, 2 ** Math.min(10, attempt)); // cap at 30m
  const jitter = Math.floor(Math.random() * 5);
  return base + jitter;
}

async function markJob(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  jobId: string,
  update: Record<string, unknown>,
) {
  await supabase.from("warehouse_idea_ingest_jobs").update(update).eq("job_id", jobId);
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const notionToken =
    Deno.env.get("PILOT_NOTION_INTEGRATION_TOKEN") ?? Deno.env.get("NOTION_INTEGRATION_TOKEN");
  if (!notionToken) {
    return json(500, { ok: false, error: "missing_notion_token" });
  }

  const workerId = Deno.env.get("WAREHOUSE_WORKER_ID") ?? "warehouse-ingest-worker";
  const limit = asInt(Deno.env.get("WAREHOUSE_INGEST_BATCH_LIMIT"), 25);

  const supabase = getSupabaseAdminClient();
  const { data: claimed, error: claimErr } = await supabase.rpc("warehouse_claim_idea_ingest_jobs", {
    p_limit: limit,
    p_worker: workerId,
  });
  if (claimErr) {
    return json(500, { ok: false, error: "claim_failed", message: claimErr.message });
  }

  const jobs = Array.isArray(claimed) ? claimed : [];
  if (jobs.length === 0) {
    return json(200, { ok: true, processed: 0, message: "no jobs" });
  }

  let processed = 0;
  let ignored = 0;
  let failed = 0;

  for (const job of jobs) {
    const jobId = String(job.job_id);
    const notionPageId = String(job.notion_page_id);
    const attemptCount = typeof job.attempt_count === "number" ? job.attempt_count : 0;

    try {
      const page = await fetchNotionPage(notionPageId, notionToken);
      const props = flattenNotionProperties(page.properties);

      const ideaRaw = readString(props, "idea", "Idea", "submission", "response");
      if (!ideaRaw) {
        await markJob(supabase, jobId, {
          status: "ignored",
          last_error_code: "IGNORED_MISSING_IDEA",
          last_error_message: "Missing required Idea property.",
          locked_at: null,
          locked_by: null,
        });
        ignored += 1;
        processed += 1;
        continue;
      }

      const ideaNorm = normalizeIdeaText(ideaRaw);
      if (!ideaNorm) {
        await markJob(supabase, jobId, {
          status: "ignored",
          last_error_code: "IGNORED_EMPTY_IDEA",
          last_error_message: "Idea is empty after normalization.",
          locked_at: null,
          locked_by: null,
        });
        ignored += 1;
        processed += 1;
        continue;
      }

      const createdById = readString(props, "created_by_id");
      const createdByEmail = readString(props, "created_by_email");
      const emailFallback = readString(props, "email", "Email");
      const emailCandidate = createdByEmail ?? emailFallback;
      const participantKey = createdById
        ? `notion_user:${createdById}`
        : (emailCandidate && emailCandidate.trim().length > 0)
          ? `email:${canonicalizeEmail(emailCandidate)}`
          : undefined;

      if (!participantKey) {
        await markJob(supabase, jobId, {
          status: "ignored",
          last_error_code: "IGNORED_MISSING_IDENTITY",
          last_error_message: "No created_by id and no email provided.",
          locked_at: null,
          locked_by: null,
        });
        ignored += 1;
        processed += 1;
        continue;
      }

      const lastEdited = readString(props, "last_edited_time") ?? new Date(job.occurred_at).toISOString();
      const ideaHash = await sha256Hex(ideaNorm);
      const sourceEventKey = `${notionPageId}:${lastEdited}:${ideaHash}`;

      const focusId = Deno.env.get("PILOT_WAREHOUSE_FOCUS_ID") ?? "ai_fluency_root";
      const focusSnapshot =
        Deno.env.get("PILOT_FOCUS_SNAPSHOT") ??
        "How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?";

      const { data: inserted, error: insertErr } = await supabase.rpc("insert_idea_entry_version", {
        p_notion_page_id: notionPageId,
        p_participant_key: participantKey,
        p_organization_id: String(job.organization_id),
        p_cycle_id: String(job.cycle_id),
        p_root_problem_version_id: String(job.root_problem_version_id),
        p_focus_id: focusId,
        p_focus_text_snapshot: focusSnapshot,
        p_idea_text_raw: ideaRaw,
        p_idea_text_norm: ideaNorm,
        p_notion_last_edited_time: lastEdited,
        p_source_event_key: sourceEventKey,
      });
      if (insertErr) {
        throw new Error(`insert_idea_entry_version_failed: ${insertErr.message}`);
      }

      const entryVersionId = (inserted as any)?.entry_version_id ?? (Array.isArray(inserted) ? (inserted[0] as any)?.entry_version_id : null);
      if (!entryVersionId) {
        throw new Error("insert_idea_entry_version returned no entry_version_id");
      }

      const embeddingModel = Deno.env.get("PILOT_EMBEDDING_MODEL") ?? "text-embedding-3-small";
      const { error: embedErr } = await supabase.from("idea_embeddings").upsert(
        {
          entry_version_id: entryVersionId,
          embedding_model: embeddingModel,
          embedding_status: "pending",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "entry_version_id" },
      );
      if (embedErr) {
        throw new Error(`idea_embeddings_upsert_failed: ${embedErr.message}`);
      }

      await markJob(supabase, jobId, {
        status: "done",
        last_error_code: null,
        last_error_message: null,
        locked_at: null,
        locked_by: null,
      });

      processed += 1;
    } catch (err) {
      const status = (err as any)?.status as number | undefined;
      const message = err instanceof Error ? err.message : String(err);
      const code =
        status === 429 ? "NOTION_FETCH_429" :
        status && status >= 500 ? "NOTION_FETCH_5XX" :
        message.includes("insert_idea_entry_version_failed") ? "DB_INSERT_FAILED" :
        "WORKER_FAILED";

      const delay = backoffSeconds(attemptCount + 1);
      const nextAttempt = new Date(Date.now() + delay * 1000).toISOString();
      await markJob(supabase, jobId, {
        status: "queued",
        next_attempt_at: nextAttempt,
        last_error_code: code,
        last_error_message: message.slice(0, 500),
        locked_at: null,
        locked_by: null,
      });
      failed += 1;
      processed += 1;
    }
  }

  return json(200, { ok: true, processed, ignored, failed });
});
