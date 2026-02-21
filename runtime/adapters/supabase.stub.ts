import type {
  CycleSnapshotArtifactRecord,
  CycleSnapshotRecord,
  IngestRecord,
  ProgramCycleRecord,
  ProgramCycleState,
  ProtectedActionAuditRecord,
} from "../core/types.js";
import type { IngestStateUpdate, PersistenceAdapter } from "./persistence.js";

export class SupabasePersistenceAdapterStub implements PersistenceAdapter {
  async getActiveIngressMode(): Promise<string | null> {
    throw new Error("TODO: implement runtime_control lookup in Supabase adapter.");
  }

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

  async getProgramCycle(_organizationId: string, _programCycleId: string): Promise<ProgramCycleRecord | null> {
    throw new Error("TODO: implement program cycle lookup in Supabase adapter.");
  }

  async getActiveProgramCycle(_organizationId: string): Promise<ProgramCycleRecord | null> {
    throw new Error("TODO: implement active program cycle lookup in Supabase adapter.");
  }

  async upsertProgramCycle(
    _record: Omit<ProgramCycleRecord, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string },
  ): Promise<ProgramCycleRecord> {
    throw new Error("TODO: implement program cycle upsert in Supabase adapter.");
  }

  async setProgramCycleState(
    _organizationId: string,
    _programCycleId: string,
    _state: ProgramCycleState,
    _update: {
      activated_at?: string;
      frozen_at?: string;
      archived_at?: string;
      updated_at?: string;
    },
  ): Promise<ProgramCycleRecord | null> {
    throw new Error("TODO: implement program cycle state transition in Supabase adapter.");
  }

  async insertCycleSnapshot(
    _record: Omit<CycleSnapshotRecord, "snapshot_id" | "created_at" | "updated_at"> & {
      snapshot_id?: string;
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<CycleSnapshotRecord> {
    throw new Error("TODO: implement cycle snapshot insert in Supabase adapter.");
  }

  async updateCycleSnapshot(
    _snapshotId: string,
    _update: {
      snapshot_state: CycleSnapshotRecord["snapshot_state"];
      manifest?: Record<string, unknown>;
      completed_at?: string;
      updated_at?: string;
    },
  ): Promise<CycleSnapshotRecord | null> {
    throw new Error("TODO: implement cycle snapshot state update in Supabase adapter.");
  }

  async listCycleSnapshots(_organizationId: string, _programCycleId: string): Promise<CycleSnapshotRecord[]> {
    throw new Error("TODO: implement cycle snapshot listing in Supabase adapter.");
  }

  async insertCycleSnapshotArtifact(
    _record: Omit<CycleSnapshotArtifactRecord, "artifact_id" | "created_at"> & { artifact_id?: string; created_at?: string },
  ): Promise<CycleSnapshotArtifactRecord> {
    throw new Error("TODO: implement cycle snapshot artifact insert in Supabase adapter.");
  }

  async listCycleSnapshotArtifacts(_snapshotId: string): Promise<CycleSnapshotArtifactRecord[]> {
    throw new Error("TODO: implement cycle snapshot artifact list in Supabase adapter.");
  }
}
