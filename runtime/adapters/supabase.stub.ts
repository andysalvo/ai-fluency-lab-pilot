import type { IngestRecord, ProtectedActionAuditRecord } from "../core/types.js";
import type { IngestStateUpdate, PersistenceAdapter } from "./persistence.js";

export class SupabasePersistenceAdapterStub implements PersistenceAdapter {
  async getIngestByIdempotencyKey(_idempotencyKey: string): Promise<IngestRecord | null> {
    throw new Error("TODO: implement Supabase adapter once schema/migrations exist. How to determine: apply pilot schema and map this adapter to event_ingest_log.");
  }

  async insertIngest(
    _record: Omit<IngestRecord, "event_id" | "created_at"> & { event_id?: string; created_at?: string },
  ): Promise<IngestRecord> {
    throw new Error("TODO: implement Supabase adapter once schema/migrations exist. How to determine: use unique idempotency key constraint from spec table contract.");
  }

  async updateIngestState(_eventId: string, _update: IngestStateUpdate): Promise<IngestRecord | null> {
    throw new Error("TODO: implement Supabase adapter state updates once ingest table exists.");
  }

  async insertProtectedActionAudit(
    _record: Omit<ProtectedActionAuditRecord, "audit_id" | "created_at"> & { audit_id?: string; created_at?: string },
  ): Promise<ProtectedActionAuditRecord> {
    throw new Error("TODO: implement Supabase adapter audit writes once audit table contract is materialized.");
  }
}
