import type {
  CycleSnapshotArtifactRecord,
  CycleSnapshotRecord,
  IngestRecord,
  ProgramCycleRecord,
  ProgramCycleState,
  ProtectedActionAuditRecord,
} from "../core/types.js";
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
  private readonly cyclesByKey = new Map<string, ProgramCycleRecord>();
  private readonly snapshotsById = new Map<string, CycleSnapshotRecord>();
  private readonly artifactsBySnapshotId = new Map<string, CycleSnapshotArtifactRecord[]>();

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

  async getProgramCycle(organizationId: string, programCycleId: string): Promise<ProgramCycleRecord | null> {
    const key = `${organizationId}::${programCycleId}`;
    const row = this.cyclesByKey.get(key);
    return row ? clone(row) : null;
  }

  async getActiveProgramCycle(organizationId: string): Promise<ProgramCycleRecord | null> {
    for (const row of this.cyclesByKey.values()) {
      if (row.organization_id === organizationId && row.state === "active") {
        return clone(row);
      }
    }

    return null;
  }

  async upsertProgramCycle(
    record: Omit<ProgramCycleRecord, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string },
  ): Promise<ProgramCycleRecord> {
    const key = `${record.organization_id}::${record.program_cycle_id}`;
    const current = this.cyclesByKey.get(key);

    const createdAt = record.created_at ?? current?.created_at ?? new Date().toISOString();
    const updatedAt = record.updated_at ?? new Date().toISOString();

    const next: ProgramCycleRecord = {
      ...current,
      ...record,
      created_at: createdAt,
      updated_at: updatedAt,
    };

    this.cyclesByKey.set(key, clone(next));
    return clone(next);
  }

  async setProgramCycleState(
    organizationId: string,
    programCycleId: string,
    state: ProgramCycleState,
    update: {
      activated_at?: string;
      frozen_at?: string;
      archived_at?: string;
      updated_at?: string;
    },
  ): Promise<ProgramCycleRecord | null> {
    const key = `${organizationId}::${programCycleId}`;
    const current = this.cyclesByKey.get(key);
    if (!current) {
      return null;
    }

    const next: ProgramCycleRecord = {
      ...current,
      state,
      activated_at: update.activated_at ?? current.activated_at,
      frozen_at: update.frozen_at ?? current.frozen_at,
      archived_at: update.archived_at ?? current.archived_at,
      updated_at: update.updated_at ?? new Date().toISOString(),
    };

    this.cyclesByKey.set(key, clone(next));
    return clone(next);
  }

  async insertCycleSnapshot(
    record: Omit<CycleSnapshotRecord, "snapshot_id" | "created_at" | "updated_at"> & {
      snapshot_id?: string;
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<CycleSnapshotRecord> {
    const snapshotId = record.snapshot_id ?? makeId("snapshot");
    const createdAt = record.created_at ?? new Date().toISOString();
    const updatedAt = record.updated_at ?? createdAt;

    const next: CycleSnapshotRecord = {
      ...record,
      snapshot_id: snapshotId,
      created_at: createdAt,
      updated_at: updatedAt,
    };

    this.snapshotsById.set(snapshotId, clone(next));
    return clone(next);
  }

  async updateCycleSnapshot(
    snapshotId: string,
    update: {
      snapshot_state: CycleSnapshotRecord["snapshot_state"];
      manifest?: Record<string, unknown>;
      completed_at?: string;
      updated_at?: string;
    },
  ): Promise<CycleSnapshotRecord | null> {
    const current = this.snapshotsById.get(snapshotId);
    if (!current) {
      return null;
    }

    const next: CycleSnapshotRecord = {
      ...current,
      snapshot_state: update.snapshot_state,
      manifest: update.manifest ?? current.manifest,
      completed_at: update.completed_at ?? current.completed_at,
      updated_at: update.updated_at ?? new Date().toISOString(),
    };

    this.snapshotsById.set(snapshotId, clone(next));
    return clone(next);
  }

  async listCycleSnapshots(organizationId: string, programCycleId: string): Promise<CycleSnapshotRecord[]> {
    return [...this.snapshotsById.values()]
      .filter((row) => row.organization_id === organizationId && row.program_cycle_id === programCycleId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((row) => clone(row));
  }

  async insertCycleSnapshotArtifact(
    record: Omit<CycleSnapshotArtifactRecord, "artifact_id" | "created_at"> & { artifact_id?: string; created_at?: string },
  ): Promise<CycleSnapshotArtifactRecord> {
    const artifactId = record.artifact_id ?? makeId("artifact");
    const createdAt = record.created_at ?? new Date().toISOString();

    const next: CycleSnapshotArtifactRecord = {
      ...record,
      artifact_id: artifactId,
      created_at: createdAt,
    };

    const list = this.artifactsBySnapshotId.get(record.snapshot_id) ?? [];
    list.push(clone(next));
    this.artifactsBySnapshotId.set(record.snapshot_id, list);

    return clone(next);
  }

  async listCycleSnapshotArtifacts(snapshotId: string): Promise<CycleSnapshotArtifactRecord[]> {
    return [...(this.artifactsBySnapshotId.get(snapshotId) ?? [])].map((row) => clone(row));
  }
}
