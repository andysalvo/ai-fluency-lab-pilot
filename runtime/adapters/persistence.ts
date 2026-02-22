import type {
  CycleControlRecord,
  CycleMembershipRecord,
  CycleSnapshotArtifactRecord,
  CycleSnapshotRecord,
  IngestRecord,
  IngestState,
  LabRecordEntry,
  ModelRunRecord,
  LabBriefDraftRecord,
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
  GuidedRoundRecord,
  GuidedQuestionItemRecord,
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

  listSourcesForCycle(cycleId: string): Promise<SourceSubmissionRecord[]>;

  listVisibleStarterBriefs(participantId: string, cycleId: string): Promise<StarterBriefRecord[]>;

  listStarterBriefsForCycle(cycleId: string): Promise<StarterBriefRecord[]>;

  listVisibleLabRecord(cycleId: string): Promise<LabRecordEntry[]>;

  listLabRecordForThread(threadId: string, cycleId: string): Promise<LabRecordEntry[]>;

  listSourcesForThread(threadId: string, cycleId: string): Promise<SourceSubmissionRecord[]>;

  listStarterBriefsForThread(threadId: string, cycleId: string): Promise<StarterBriefRecord[]>;

  listGuidedRoundsForThread(threadId: string, cycleId: string): Promise<GuidedRoundRecord[]>;

  listGuidedRoundsForCycle(cycleId: string): Promise<GuidedRoundRecord[]>;

  createGuidedRound(
    record: Omit<GuidedRoundRecord, "round_id" | "created_at" | "updated_at"> & { round_id?: string; created_at?: string; updated_at?: string },
  ): Promise<GuidedRoundRecord>;

  completeGuidedRound(roundId: string, summary: string, completedAt: string, updatedAt: string): Promise<GuidedRoundRecord | null>;

  listGuidedQuestionItems(roundId: string): Promise<GuidedQuestionItemRecord[]>;

  insertGuidedQuestionItems(
    items: Array<Omit<GuidedQuestionItemRecord, "question_item_id" | "created_at" | "updated_at"> & {
      question_item_id?: string;
      created_at?: string;
      updated_at?: string;
    }>,
  ): Promise<GuidedQuestionItemRecord[]>;

  answerGuidedQuestionItem(
    questionItemId: string,
    update: {
      selected_option: GuidedQuestionItemRecord["selected_option"];
      short_reason?: string;
      answered_at: string;
      updated_at?: string;
    },
  ): Promise<GuidedQuestionItemRecord | null>;

  getLabBriefDraftForThread(threadId: string, cycleId: string): Promise<LabBriefDraftRecord | null>;

  upsertLabBriefDraft(
    record: Omit<LabBriefDraftRecord, "draft_id" | "created_at" | "updated_at"> & {
      draft_id?: string;
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<LabBriefDraftRecord>;

  listLabBriefDraftsForCycle(cycleId: string): Promise<LabBriefDraftRecord[]>;

  insertModelRun(
    record: Omit<ModelRunRecord, "run_id" | "created_at"> & { run_id?: string; created_at?: string },
  ): Promise<ModelRunRecord>;

  listModelRunsForCycle(organizationId: string, cycleId: string, limit?: number): Promise<ModelRunRecord[]>;

  listCycleMemberships(organizationId: string, cycleId: string): Promise<CycleMembershipRecord[]>;

  listIngestForCycle(organizationId: string, cycleId: string, limit?: number): Promise<IngestRecord[]>;

  listProtectedActionAuditsForCycle(
    organizationId: string,
    cycleId: string,
    limit?: number,
  ): Promise<ProtectedActionAuditRecord[]>;

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
