import type { IngestRecord, IngestState, ProtectedActionAuditRecord } from "../core/types.js";

export interface IngestStateUpdate {
  ingest_state: IngestState;
  error_code?: string;
  processed_at?: string;
  details?: Record<string, unknown>;
}

export class DuplicateIngestKeyError extends Error {
  public readonly idempotency_key: string;

  constructor(idempotencyKey: string) {
    super(`Duplicate idempotency key: ${idempotencyKey}`);
    this.name = "DuplicateIngestKeyError";
    this.idempotency_key = idempotencyKey;
  }
}

export interface PersistenceAdapter {
  getIngestByIdempotencyKey(idempotencyKey: string): Promise<IngestRecord | null>;

  insertIngest(record: Omit<IngestRecord, "event_id" | "created_at"> & { event_id?: string; created_at?: string }): Promise<IngestRecord>;

  updateIngestState(eventId: string, update: IngestStateUpdate): Promise<IngestRecord | null>;

  insertProtectedActionAudit(
    record: Omit<ProtectedActionAuditRecord, "audit_id" | "created_at"> & { audit_id?: string; created_at?: string },
  ): Promise<ProtectedActionAuditRecord>;
}
