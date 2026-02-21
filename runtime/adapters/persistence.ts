import type {
  CycleSnapshotArtifactRecord,
  CycleSnapshotRecord,
  IngestRecord,
  IngestState,
  ProgramCycleRecord,
  ProgramCycleState,
  ProtectedActionAuditRecord,
} from "../core/types.js";

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
  getActiveIngressMode(): Promise<string | null>;

  getIngestByIdempotencyKey(idempotencyKey: string): Promise<IngestRecord | null>;

  insertIngest(record: Omit<IngestRecord, "event_id" | "created_at"> & { event_id?: string; created_at?: string }): Promise<IngestRecord>;

  updateIngestState(eventId: string, update: IngestStateUpdate): Promise<IngestRecord | null>;

  insertProtectedActionAudit(
    record: Omit<ProtectedActionAuditRecord, "audit_id" | "created_at"> & { audit_id?: string; created_at?: string },
  ): Promise<ProtectedActionAuditRecord>;

  getProgramCycle(organizationId: string, programCycleId: string): Promise<ProgramCycleRecord | null>;

  getActiveProgramCycle(organizationId: string): Promise<ProgramCycleRecord | null>;

  upsertProgramCycle(
    record: Omit<ProgramCycleRecord, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string },
  ): Promise<ProgramCycleRecord>;

  setProgramCycleState(
    organizationId: string,
    programCycleId: string,
    state: ProgramCycleState,
    update: {
      activated_at?: string;
      frozen_at?: string;
      archived_at?: string;
      updated_at?: string;
    },
  ): Promise<ProgramCycleRecord | null>;

  insertCycleSnapshot(
    record: Omit<CycleSnapshotRecord, "snapshot_id" | "created_at" | "updated_at"> & {
      snapshot_id?: string;
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<CycleSnapshotRecord>;

  updateCycleSnapshot(
    snapshotId: string,
    update: {
      snapshot_state: CycleSnapshotRecord["snapshot_state"];
      manifest?: Record<string, unknown>;
      completed_at?: string;
      updated_at?: string;
    },
  ): Promise<CycleSnapshotRecord | null>;

  listCycleSnapshots(organizationId: string, programCycleId: string): Promise<CycleSnapshotRecord[]>;

  insertCycleSnapshotArtifact(
    record: Omit<CycleSnapshotArtifactRecord, "artifact_id" | "created_at"> & { artifact_id?: string; created_at?: string },
  ): Promise<CycleSnapshotArtifactRecord>;

  listCycleSnapshotArtifacts(snapshotId: string): Promise<CycleSnapshotArtifactRecord[]>;
}
