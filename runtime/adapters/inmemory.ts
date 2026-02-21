import type { IngestRecord, ProtectedActionAuditRecord } from "../core/types.js";
import { DuplicateIngestKeyError, type IngestStateUpdate, type PersistenceAdapter } from "./persistence.js";

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}-${Math.random().toString(16).slice(2)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class InMemoryPersistenceAdapter implements PersistenceAdapter {
  private readonly ingestByEventId = new Map<string, IngestRecord>();
  private readonly eventIdByIdempotencyKey = new Map<string, string>();
  private readonly auditById = new Map<string, ProtectedActionAuditRecord>();

  async getActiveIngressMode(): Promise<string | null> {
    return null;
  }

  async getIngestByIdempotencyKey(idempotencyKey: string): Promise<IngestRecord | null> {
    const eventId = this.eventIdByIdempotencyKey.get(idempotencyKey);
    if (!eventId) {
      return null;
    }

    const record = this.ingestByEventId.get(eventId);
    return record ? clone(record) : null;
  }

  async insertIngest(record: Omit<IngestRecord, "event_id" | "created_at"> & { event_id?: string; created_at?: string }): Promise<IngestRecord> {
    if (this.eventIdByIdempotencyKey.has(record.idempotency_key)) {
      throw new DuplicateIngestKeyError(record.idempotency_key);
    }

    const eventId = record.event_id ?? makeId("evt");
    const createdAt = record.created_at ?? new Date().toISOString();

    const fullRecord: IngestRecord = {
      ...record,
      event_id: eventId,
      created_at: createdAt,
    };

    this.ingestByEventId.set(eventId, clone(fullRecord));
    this.eventIdByIdempotencyKey.set(record.idempotency_key, eventId);

    return clone(fullRecord);
  }

  async updateIngestState(eventId: string, update: IngestStateUpdate): Promise<IngestRecord | null> {
    const current = this.ingestByEventId.get(eventId);
    if (!current) {
      return null;
    }

    const next: IngestRecord = {
      ...current,
      ingest_state: update.ingest_state,
      error_code: update.error_code ?? current.error_code,
      processed_at: update.processed_at ?? current.processed_at,
      details: update.details ?? current.details,
    };

    this.ingestByEventId.set(eventId, clone(next));
    return clone(next);
  }

  async insertProtectedActionAudit(
    record: Omit<ProtectedActionAuditRecord, "audit_id" | "created_at"> & { audit_id?: string; created_at?: string },
  ): Promise<ProtectedActionAuditRecord> {
    const auditId = record.audit_id ?? makeId("audit");
    const createdAt = record.created_at ?? new Date().toISOString();

    const fullRecord: ProtectedActionAuditRecord = {
      ...record,
      audit_id: auditId,
      created_at: createdAt,
    };

    this.auditById.set(auditId, clone(fullRecord));
    return clone(fullRecord);
  }
}
