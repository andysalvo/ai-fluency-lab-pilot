import type {
  CycleControlRecord,
  CycleMembershipRecord,
  CycleSnapshotArtifactRecord,
  CycleSnapshotRecord,
  IdeaEmbeddingBackfillItem,
  IdeaEmbeddingRecord,
  IdeaEntryRecord,
  IngestRecord,
  IngestState,
  LabRecordEntry,
  ParticipantRecord,
  PublishTxnInput,
  PublishTxnResult,
  ProgramCycleRecord,
  ProgramCycleState,
  ProtectedActionAuditRecord,
  RuntimeControlRecord,
  RuntimeThreadRecord,
  SessionContextRecord,
  SourceSubmissionRecord,
  StarterBriefRecord,
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

  getRuntimeControl(): Promise<RuntimeControlRecord>;

  getCycleControl(organizationId: string, cycleId: string): Promise<CycleControlRecord | null>;

  upsertCycleControl(
    record: Omit<CycleControlRecord, "updated_at"> & { updated_at?: string },
  ): Promise<CycleControlRecord>;

  getParticipantByEmailCanonical(emailCanonical: string): Promise<ParticipantRecord | null>;

  getParticipantById(participantId: string): Promise<ParticipantRecord | null>;

  upsertParticipant(
    record: Omit<ParticipantRecord, "created_at"> & { created_at?: string },
  ): Promise<ParticipantRecord>;

  updateParticipantLastLogin(participantId: string, lastLoginAt: string): Promise<ParticipantRecord | null>;

  getCycleMembership(participantId: string, organizationId: string, cycleId: string): Promise<CycleMembershipRecord | null>;

  upsertCycleMembership(
    record: Omit<CycleMembershipRecord, "joined_at" | "updated_at"> & { joined_at?: string; updated_at?: string },
  ): Promise<CycleMembershipRecord>;

  activateMembership(participantId: string, organizationId: string, cycleId: string, updatedAt: string): Promise<CycleMembershipRecord | null>;

  getSessionContext(participantId: string): Promise<SessionContextRecord | null>;

  setSessionActiveCycle(participantId: string, cycleId: string, updatedAt: string): Promise<SessionContextRecord>;

  getThreadById(threadId: string): Promise<RuntimeThreadRecord | null>;

  getThreadByIdInCycle(threadId: string, cycleId: string): Promise<RuntimeThreadRecord | null>;

  upsertThread(record: Omit<RuntimeThreadRecord, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string }): Promise<RuntimeThreadRecord>;

  insertSourceSubmission(
    record: Omit<SourceSubmissionRecord, "source_submission_id" | "created_at"> & { source_submission_id?: string; created_at?: string },
  ): Promise<SourceSubmissionRecord>;

  insertStarterBrief(
    record: Omit<StarterBriefRecord, "starter_brief_id" | "created_at" | "updated_at"> & {
      starter_brief_id?: string;
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<StarterBriefRecord>;

  updateStarterBrief(
    starterBriefId: string,
    update: {
      status: StarterBriefRecord["status"];
      payload?: Record<string, unknown>;
      replay_payload?: Record<string, unknown>;
      updated_at?: string;
    },
  ): Promise<StarterBriefRecord | null>;

  listVisibleThreads(participantId: string, cycleId: string): Promise<RuntimeThreadRecord[]>;

  listVisibleSources(participantId: string, cycleId: string): Promise<SourceSubmissionRecord[]>;

  listVisibleStarterBriefs(participantId: string, cycleId: string): Promise<StarterBriefRecord[]>;

  listVisibleLabRecord(cycleId: string): Promise<LabRecordEntry[]>;

  getIdeaEntryBySourceEventKey(sourceEventKey: string): Promise<IdeaEntryRecord | null>;

  getLatestIdeaEntryByNotionPageId(notionPageId: string): Promise<IdeaEntryRecord | null>;

  listIdeaEntryVersionsByNotionPageId(notionPageId: string): Promise<IdeaEntryRecord[]>;

  insertIdeaEntry(
    record: Omit<IdeaEntryRecord, "entry_version_id" | "created_at"> & { entry_version_id?: string; created_at?: string },
  ): Promise<IdeaEntryRecord>;

  upsertIdeaEmbedding(
    record: Omit<IdeaEmbeddingRecord, "updated_at"> & { updated_at?: string },
  ): Promise<IdeaEmbeddingRecord>;

  updateIdeaEmbedding(
    entryVersionId: string,
    update: {
      embedding_status: IdeaEmbeddingRecord["embedding_status"];
      embedding_vector?: number[];
      error_code?: string;
      embedded_at?: string;
      updated_at?: string;
    },
  ): Promise<IdeaEmbeddingRecord | null>;

  listIdeaEmbeddingsForBackfill(limit: number): Promise<IdeaEmbeddingBackfillItem[]>;

  // Warehouse v1: fast webhook path should be enqueue-only (no Notion fetch / no embeddings).
  warehouseEnqueueIdeaJob(input: {
    idempotency_key: string;
    source_table: string;
    source_record_id: string;
    event_type: string;
    occurred_at: string;
    organization_id: string;
    cycle_id: string;
    root_problem_version_id: string;
  }): Promise<{ deduped: boolean; event_id: string | null; job_id: string | null }>;

  publishLabRecordTxn(input: PublishTxnInput): Promise<PublishTxnResult>;

  getProgramCycle(organizationId: string, cycleId: string): Promise<ProgramCycleRecord | null>;

  getActiveProgramCycle(organizationId: string): Promise<ProgramCycleRecord | null>;

  upsertProgramCycle(
    record: Omit<ProgramCycleRecord, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string },
  ): Promise<ProgramCycleRecord>;

  setProgramCycleState(
    organizationId: string,
    cycleId: string,
    state: ProgramCycleState,
    update: {
      activated_at?: string;
      locked_at?: string;
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

  listCycleSnapshots(organizationId: string, cycleId: string): Promise<CycleSnapshotRecord[]>;

  insertCycleSnapshotArtifact(
    record: Omit<CycleSnapshotArtifactRecord, "artifact_id" | "created_at"> & { artifact_id?: string; created_at?: string },
  ): Promise<CycleSnapshotArtifactRecord>;

  listCycleSnapshotArtifacts(snapshotId: string): Promise<CycleSnapshotArtifactRecord[]>;
}
