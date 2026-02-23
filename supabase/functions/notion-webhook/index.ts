import { getSupabaseAdminClient } from "../_shared/supabase.ts";

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function normalizeKey(input: string): string {
  return input.trim().toLowerCase();
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const expectedSecret =
    Deno.env.get("PILOT_NOTION_WEBHOOK_SECRET") ??
    Deno.env.get("PILOT_WAREHOUSE_WEBHOOK_SECRET") ??
    undefined;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const payload = asObject(body);

  const sourceTable = readString(payload, "source_table") ?? "idea_intake";
  const sourceRecordId = readString(payload, "source_record_id");
  const eventType = readString(payload, "event_type") ?? "commit_event";
  const occurredAt = readString(payload, "occurred_at");

  const expectedSourceTableId = Deno.env.get("PILOT_NOTION_DB_IDEA_INTAKE_ID");
  const normalizedSourceTable = normalizeKey(sourceTable);
  const isIdeaIntake =
    normalizedSourceTable === "idea_intake" ||
    normalizedSourceTable === "idea intake" ||
    (expectedSourceTableId && normalizedSourceTable === normalizeKey(expectedSourceTableId));

  if (!isIdeaIntake) {
    // Keep webhook delivery green, but do not enqueue non-warehouse sources.
    return json(200, { ok: true, ignored: true, reason: "non_idea_intake_source" });
  }

  if (expectedSecret) {
    const provided = req.headers.get("x-webhook-secret") ?? readString(payload, "signature");
    if (!provided || provided !== expectedSecret) {
      return json(401, { ok: false, error: "unauthorized" });
    }
  }

  if (!sourceRecordId || !occurredAt) {
    return json(400, { ok: false, error: "missing_required_fields", missing: ["source_record_id", "occurred_at"] });
  }

  const occurredAtMs = Date.parse(occurredAt);
  if (Number.isNaN(occurredAtMs)) {
    return json(400, { ok: false, error: "invalid_occurred_at" });
  }

  const orgId = readString(payload, "organization_id") ?? (Deno.env.get("PILOT_ORGANIZATION_ID") ?? "applied-ai-labs");
  const cycleId = readString(payload, "cycle_id") ?? (Deno.env.get("PILOT_ACTIVE_PROGRAM_CYCLE_ID") ?? "cycle_01");
  const rootProblem = readString(payload, "root_problem_version_id") ?? (Deno.env.get("PILOT_ROOT_PROBLEM_VERSION_ID") ?? "pilot-v1");

  const idempotencyKey =
    readString(payload, "idempotency_key") ??
    (() => {
      const lastEdited = readString(payload, "last_edited_time") ?? readString(asObject(payload.properties), "last_edited_time");
      return lastEdited ? `${sourceRecordId}:${lastEdited}` : `${sourceRecordId}:${occurredAt}`;
    })();

  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase.rpc("warehouse_enqueue_idea_job", {
    p_idempotency_key: idempotencyKey,
    p_source_table: sourceTable,
    p_source_record_id: sourceRecordId,
    p_event_type: eventType,
    p_occurred_at: new Date(occurredAtMs).toISOString(),
    p_organization_id: orgId,
    p_cycle_id: cycleId,
    p_root_problem_version_id: rootProblem,
  });

  if (error) {
    return json(500, { ok: false, error: "enqueue_failed", message: error.message });
  }

  // RPC returns an array of rows in supabase-js.
  const row = Array.isArray(data) ? data[0] : data;
  return json(200, {
    ok: true,
    deduped: Boolean(row?.deduped),
    event_id: row?.event_id ?? null,
    job_id: row?.job_id ?? null,
  });
});
