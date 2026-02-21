import type { RuntimeConfig } from "../adapters/env.js";
import { DuplicateIngestKeyError, type PersistenceAdapter } from "../adapters/persistence.js";
import { resolveProgramContext } from "./program-context.js";
import { mapEventTypeToTriggerType } from "./router.js";
import type { IngestResponse, NotionLikeWebhookPayload } from "./types.js";

export interface IngestHandlerDeps {
  persistence: PersistenceAdapter;
  config: RuntimeConfig;
  now?: () => string;
}

interface ParseResult {
  ok: boolean;
  payload?: NotionLikeWebhookPayload;
  error?: string;
}

function parsePayload(input: unknown): ParseResult {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "payload must be an object" };
  }

  const candidate = input as Partial<NotionLikeWebhookPayload>;
  const required: Array<keyof NotionLikeWebhookPayload> = [
    "source_table",
    "source_record_id",
    "event_type",
    "occurred_at",
    "idempotency_key",
  ];

  for (const key of required) {
    const value = candidate[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      return { ok: false, error: `missing or invalid field: ${key}` };
    }
  }

  if (Number.isNaN(Date.parse(candidate.occurred_at!))) {
    return { ok: false, error: "invalid occurred_at timestamp" };
  }

  return {
    ok: true,
    payload: {
      source_table: candidate.source_table!.trim(),
      source_record_id: candidate.source_record_id!.trim(),
      event_type: candidate.event_type!.trim(),
      occurred_at: candidate.occurred_at!,
      idempotency_key: candidate.idempotency_key!.trim(),
      signature: typeof candidate.signature === "string" ? candidate.signature : undefined,
      organization_id: typeof candidate.organization_id === "string" ? candidate.organization_id.trim() : undefined,
      program_cycle_id: typeof candidate.program_cycle_id === "string" ? candidate.program_cycle_id.trim() : undefined,
      root_problem_version_id:
        typeof candidate.root_problem_version_id === "string" ? candidate.root_problem_version_id.trim() : undefined,
    },
  };
}

export async function handleIngest(input: unknown, deps: IngestHandlerDeps): Promise<IngestResponse> {
  const now = deps.now ?? (() => new Date().toISOString());
  const parsed = parsePayload(input);

  if (!parsed.ok || !parsed.payload) {
    return {
      ok: false,
      ingest_state: "failed",
      trigger_type: "unsupported",
      result_code: "PAYLOAD_INVALID",
      message: parsed.error ?? "invalid payload",
    };
  }

  const payload = parsed.payload;
  const programContext = resolveProgramContext(payload, deps.config);
  const triggerType = mapEventTypeToTriggerType(payload.event_type, deps.config);

  const existing = await deps.persistence.getIngestByIdempotencyKey(payload.idempotency_key);
  if (existing) {
    await deps.persistence.updateIngestState(existing.event_id, {
      ingest_state: "duplicate",
      error_code: "DUPLICATE_EVENT",
      processed_at: now(),
      details: {
        duplicate_of_event_id: existing.event_id,
        duplicate_skipped: true,
      },
    });

    return {
      ok: true,
      event_id: existing.event_id,
      ingest_state: "duplicate",
      trigger_type: triggerType,
      result_code: "DUPLICATE_SKIPPED",
      message: "Duplicate idempotency key detected. Execution skipped.",
      organization_id: existing.organization_id,
      program_cycle_id: existing.program_cycle_id,
      root_problem_version_id: existing.root_problem_version_id,
    };
  }

  let record;
  try {
    record = await deps.persistence.insertIngest({
      source_table: payload.source_table,
      source_record_id: payload.source_record_id,
      event_type: payload.event_type,
      idempotency_key: payload.idempotency_key,
      organization_id: programContext.organization_id,
      program_cycle_id: programContext.program_cycle_id,
      root_problem_version_id: programContext.root_problem_version_id,
      ingest_state: "received",
    });
  } catch (error) {
    if (error instanceof DuplicateIngestKeyError) {
      return {
        ok: true,
        ingest_state: "duplicate",
        trigger_type: triggerType,
        result_code: "DUPLICATE_SKIPPED",
        message: "Duplicate idempotency key detected during insert.",
        organization_id: programContext.organization_id,
        program_cycle_id: programContext.program_cycle_id,
        root_problem_version_id: programContext.root_problem_version_id,
      };
    }

    return {
      ok: false,
      ingest_state: "failed",
      trigger_type: "unsupported",
      result_code: "INGEST_INSERT_FAILED",
      message: error instanceof Error ? error.message : "unknown insert failure",
      organization_id: programContext.organization_id,
      program_cycle_id: programContext.program_cycle_id,
      root_problem_version_id: programContext.root_problem_version_id,
    };
  }

  await deps.persistence.updateIngestState(record.event_id, {
    ingest_state: "validated",
    details: {
      signature_received: Boolean(payload.signature),
    },
  });

  if (triggerType !== "local_commit") {
    await deps.persistence.updateIngestState(record.event_id, {
      ingest_state: "failed",
      error_code: "TRIGGER_NOT_ALLOWED",
      processed_at: now(),
      details: {
        allowed_event_types: deps.config.allowed_event_types,
      },
    });

    return {
      ok: false,
      event_id: record.event_id,
      ingest_state: "failed",
      trigger_type: "unsupported",
      result_code: "TRIGGER_NOT_ALLOWED",
      message: "Only commit-event trigger types are allowed in Slice 1.",
      organization_id: record.organization_id,
      program_cycle_id: record.program_cycle_id,
      root_problem_version_id: record.root_problem_version_id,
    };
  }

  await deps.persistence.updateIngestState(record.event_id, {
    ingest_state: "processed",
    processed_at: now(),
    details: {
      trigger_type: "local_commit",
      execution_mode: "slice1_stub",
    },
  });

  return {
    ok: true,
    event_id: record.event_id,
    ingest_state: "processed",
    trigger_type: "local_commit",
    result_code: "INGEST_ACCEPTED",
    message: "Commit-event accepted for local_commit processing.",
    organization_id: record.organization_id,
    program_cycle_id: record.program_cycle_id,
    root_problem_version_id: record.root_problem_version_id,
  };
}
