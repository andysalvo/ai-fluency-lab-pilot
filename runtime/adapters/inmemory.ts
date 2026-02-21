import type {
  CycleControlRecord,
  CycleMembershipRecord,
  CycleSnapshotArtifactRecord,
  CycleSnapshotRecord,
  IngestRecord,
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

function cycleKey(organizationId: string, cycleId: string): string {
  return `${organizationId}::${cycleId}`;
}

function membershipKey(participantId: string, organizationId: string, cycleId: string): string {
  return `${participantId}::${organizationId}::${cycleId}`;
}

export class InMemoryPersistenceAdapter implements PersistenceAdapter {
  private readonly ingestByEventId = new Map<string, IngestRecord>();
  private readonly eventIdByIdempotencyKey = new Map<string, string>();
  private readonly auditById = new Map<string, ProtectedActionAuditRecord>();
  private readonly cyclesByKey = new Map<string, ProgramCycleRecord>();
  private readonly snapshotsById = new Map<string, CycleSnapshotRecord>();
  private readonly artifactsBySnapshotId = new Map<string, CycleSnapshotArtifactRecord[]>();
  private readonly cycleControlByKey = new Map<string, CycleControlRecord>();
  private readonly participantsById = new Map<string, ParticipantRecord>();
  private readonly participantIdByEmail = new Map<string, string>();
  private readonly membershipsByKey = new Map<string, CycleMembershipRecord>();
  private readonly sessionsByParticipantId = new Map<string, SessionContextRecord>();
  private readonly threadsById = new Map<string, RuntimeThreadRecord>();
  private readonly sourcesById = new Map<string, SourceSubmissionRecord>();
  private readonly briefsById = new Map<string, StarterBriefRecord>();
  private readonly labRecordsById = new Map<string, LabRecordEntry>();
  private readonly publishReplayByIdempotencyKey = new Map<string, PublishTxnResult>();

  private runtimeControl: RuntimeControlRecord = {
    active_ingress_mode: "supabase_edge",
    global_protected_actions_halt: false,
    updated_at: new Date().toISOString(),
  };

  async getActiveIngressMode(): Promise<string | null> {
    return this.runtimeControl.active_ingress_mode;
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

  async getRuntimeControl(): Promise<RuntimeControlRecord> {
    return clone(this.runtimeControl);
  }

  async getCycleControl(organizationId: string, cycleId: string): Promise<CycleControlRecord | null> {
    const row = this.cycleControlByKey.get(cycleKey(organizationId, cycleId));
    return row ? clone(row) : null;
  }

  async upsertCycleControl(
    record: Omit<CycleControlRecord, "updated_at"> & { updated_at?: string },
  ): Promise<CycleControlRecord> {
    const key = cycleKey(record.organization_id, record.cycle_id);
    const current = this.cycleControlByKey.get(key);

    const next: CycleControlRecord = {
      ...current,
      ...record,
      updated_at: record.updated_at ?? new Date().toISOString(),
    };

    this.cycleControlByKey.set(key, clone(next));
    return clone(next);
  }

  async getParticipantByEmailCanonical(emailCanonical: string): Promise<ParticipantRecord | null> {
    const participantId = this.participantIdByEmail.get(emailCanonical);
    if (!participantId) {
      return null;
    }

    return this.getParticipantById(participantId);
  }

  async getParticipantById(participantId: string): Promise<ParticipantRecord | null> {
    const row = this.participantsById.get(participantId);
    return row ? clone(row) : null;
  }

  async upsertParticipant(
    record: Omit<ParticipantRecord, "created_at"> & { created_at?: string },
  ): Promise<ParticipantRecord> {
    const current = this.participantsById.get(record.participant_id);

    const next: ParticipantRecord = {
      ...current,
      ...record,
      created_at: current?.created_at ?? record.created_at ?? new Date().toISOString(),
    };

    this.participantsById.set(next.participant_id, clone(next));
    this.participantIdByEmail.set(next.email_canonical, next.participant_id);
    return clone(next);
  }

  async updateParticipantLastLogin(participantId: string, lastLoginAt: string): Promise<ParticipantRecord | null> {
    const current = this.participantsById.get(participantId);
    if (!current) {
      return null;
    }

    const next: ParticipantRecord = {
      ...current,
      last_login_at: lastLoginAt,
    };

    this.participantsById.set(participantId, clone(next));
    return clone(next);
  }

  async getCycleMembership(participantId: string, organizationId: string, cycleId: string): Promise<CycleMembershipRecord | null> {
    const row = this.membershipsByKey.get(membershipKey(participantId, organizationId, cycleId));
    return row ? clone(row) : null;
  }

  async upsertCycleMembership(
    record: Omit<CycleMembershipRecord, "joined_at" | "updated_at"> & { joined_at?: string; updated_at?: string },
  ): Promise<CycleMembershipRecord> {
    const key = membershipKey(record.participant_id, record.organization_id, record.cycle_id);
    const current = this.membershipsByKey.get(key);

    const next: CycleMembershipRecord = {
      ...current,
      ...record,
      joined_at: current?.joined_at ?? record.joined_at ?? new Date().toISOString(),
      updated_at: record.updated_at ?? new Date().toISOString(),
    };

    this.membershipsByKey.set(key, clone(next));
    return clone(next);
  }

  async activateMembership(participantId: string, organizationId: string, cycleId: string, updatedAt: string): Promise<CycleMembershipRecord | null> {
    const targetKey = membershipKey(participantId, organizationId, cycleId);
    const target = this.membershipsByKey.get(targetKey);
    if (!target || target.membership_state === "revoked") {
      return null;
    }

    for (const [key, row] of this.membershipsByKey.entries()) {
      if (row.participant_id === participantId && row.organization_id === organizationId && row.membership_state === "active") {
        this.membershipsByKey.set(
          key,
          clone({
            ...row,
            membership_state: "inactive",
            updated_at: updatedAt,
          }),
        );
      }
    }

    const activated: CycleMembershipRecord = {
      ...target,
      membership_state: "active",
      updated_at: updatedAt,
    };

    this.membershipsByKey.set(targetKey, clone(activated));
    return clone(activated);
  }

  async getSessionContext(participantId: string): Promise<SessionContextRecord | null> {
    const row = this.sessionsByParticipantId.get(participantId);
    return row ? clone(row) : null;
  }

  async setSessionActiveCycle(participantId: string, cycleId: string, updatedAt: string): Promise<SessionContextRecord> {
    const next: SessionContextRecord = {
      participant_id: participantId,
      active_cycle_id: cycleId,
      updated_at: updatedAt,
    };

    this.sessionsByParticipantId.set(participantId, clone(next));
    return clone(next);
  }

  async getThreadById(threadId: string): Promise<RuntimeThreadRecord | null> {
    const row = this.threadsById.get(threadId);
    return row ? clone(row) : null;
  }

  async getThreadByIdInCycle(threadId: string, cycleId: string): Promise<RuntimeThreadRecord | null> {
    const row = this.threadsById.get(threadId);
    if (!row || row.cycle_id !== cycleId) {
      return null;
    }

    return clone(row);
  }

  async upsertThread(
    record: Omit<RuntimeThreadRecord, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string },
  ): Promise<RuntimeThreadRecord> {
    const current = this.threadsById.get(record.thread_id);

    const next: RuntimeThreadRecord = {
      ...current,
      ...record,
      created_at: current?.created_at ?? record.created_at ?? new Date().toISOString(),
      updated_at: record.updated_at ?? new Date().toISOString(),
    };

    this.threadsById.set(record.thread_id, clone(next));
    return clone(next);
  }

  async insertSourceSubmission(
    record: Omit<SourceSubmissionRecord, "source_submission_id" | "created_at"> & { source_submission_id?: string; created_at?: string },
  ): Promise<SourceSubmissionRecord> {
    const sourceSubmissionId = record.source_submission_id ?? makeId("src");
    const next: SourceSubmissionRecord = {
      ...record,
      source_submission_id: sourceSubmissionId,
      created_at: record.created_at ?? new Date().toISOString(),
    };

    this.sourcesById.set(sourceSubmissionId, clone(next));
    return clone(next);
  }

  async insertStarterBrief(
    record: Omit<StarterBriefRecord, "starter_brief_id" | "created_at" | "updated_at"> & {
      starter_brief_id?: string;
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<StarterBriefRecord> {
    const starterBriefId = record.starter_brief_id ?? makeId("brief");
    const next: StarterBriefRecord = {
      ...record,
      starter_brief_id: starterBriefId,
      created_at: record.created_at ?? new Date().toISOString(),
      updated_at: record.updated_at ?? new Date().toISOString(),
    };

    this.briefsById.set(starterBriefId, clone(next));
    return clone(next);
  }

  async updateStarterBrief(
    starterBriefId: string,
    update: {
      status: StarterBriefRecord["status"];
      payload?: Record<string, unknown>;
      replay_payload?: Record<string, unknown>;
      updated_at?: string;
    },
  ): Promise<StarterBriefRecord | null> {
    const current = this.briefsById.get(starterBriefId);
    if (!current) {
      return null;
    }

    const next: StarterBriefRecord = {
      ...current,
      status: update.status,
      payload: update.payload ?? current.payload,
      replay_payload: update.replay_payload ?? current.replay_payload,
      updated_at: update.updated_at ?? new Date().toISOString(),
    };

    this.briefsById.set(starterBriefId, clone(next));
    return clone(next);
  }

  async listVisibleThreads(participantId: string, cycleId: string): Promise<RuntimeThreadRecord[]> {
    return [...this.threadsById.values()]
      .filter((row) => row.owner_participant_id === participantId && row.cycle_id === cycleId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((row) => clone(row));
  }

  async listVisibleSources(participantId: string, cycleId: string): Promise<SourceSubmissionRecord[]> {
    return [...this.sourcesById.values()]
      .filter((row) => row.participant_id === participantId && row.cycle_id === cycleId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((row) => clone(row));
  }

  async listVisibleStarterBriefs(participantId: string, cycleId: string): Promise<StarterBriefRecord[]> {
    const ownedThreadIds = new Set(
      [...this.threadsById.values()]
        .filter((row) => row.owner_participant_id === participantId && row.cycle_id === cycleId)
        .map((row) => row.thread_id),
    );

    return [...this.briefsById.values()]
      .filter((row) => row.cycle_id === cycleId && ownedThreadIds.has(row.thread_id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((row) => clone(row));
  }

  async listVisibleLabRecord(cycleId: string): Promise<LabRecordEntry[]> {
    return [...this.labRecordsById.values()]
      .filter((row) => row.cycle_id === cycleId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((row) => clone(row));
  }

  async publishLabRecordTxn(input: PublishTxnInput): Promise<PublishTxnResult> {
    const replay = this.publishReplayByIdempotencyKey.get(input.idempotency_key);
    if (replay) {
      return clone(replay);
    }

    const cycle = await this.getProgramCycle(input.organization_id, input.cycle_id);
    if (!cycle) {
      return { ok: false, reason_code: "NO_MEMBERSHIP_FOR_CYCLE", replayed: false };
    }
    if (cycle.state === "locked") {
      return { ok: false, reason_code: "CYCLE_LOCKED", replayed: false };
    }
    if (cycle.state === "archived") {
      return { ok: false, reason_code: "CYCLE_ARCHIVED", replayed: false };
    }

    const thread = await this.getThreadByIdInCycle(input.thread_id, input.cycle_id);
    if (!thread) {
      return { ok: false, reason_code: "CROSS_CYCLE_ACCESS_DENIED", replayed: false };
    }

    if (input.role === "student" && thread.owner_participant_id !== input.participant_id) {
      return { ok: false, reason_code: "ROLE_DENY", replayed: false };
    }

    const score = Number(input.claim) + Number(input.value) + Number(input.difference);
    if (score < 2) {
      return { ok: false, reason_code: "INSUFFICIENT_CRITERIA", replayed: false };
    }
    if (!input.explicit_confirmation) {
      return { ok: false, reason_code: "NEEDS_CONFIRMATION", replayed: false };
    }

    const membership = await this.getCycleMembership(input.participant_id, input.organization_id, input.cycle_id);
    if (!membership || membership.membership_state !== "active") {
      return { ok: false, reason_code: "NO_MEMBERSHIP_FOR_CYCLE", replayed: false };
    }
    if (membership.credits <= 0) {
      return { ok: false, reason_code: "CREDIT_INSUFFICIENT", replayed: false };
    }

    const existingVersions = [...this.labRecordsById.values()].filter(
      (row) => row.cycle_id === input.cycle_id && row.thread_id === input.thread_id,
    );
    const nextVersion = existingVersions.length > 0 ? Math.max(...existingVersions.map((row) => row.version)) + 1 : 1;

    const now = new Date().toISOString();
    const labRecord: LabRecordEntry = {
      organization_id: input.organization_id,
      cycle_id: input.cycle_id,
      root_problem_version_id: input.root_problem_version_id,
      lab_record_id: makeId("lab"),
      thread_id: input.thread_id,
      participant_id: input.participant_id,
      version: nextVersion,
      content: clone(input.content),
      created_at: now,
    };
    this.labRecordsById.set(labRecord.lab_record_id, clone(labRecord));

    this.membershipsByKey.set(
      membershipKey(input.participant_id, input.organization_id, input.cycle_id),
      clone({
        ...membership,
        credits: membership.credits - 1,
        updated_at: now,
      }),
    );

    const updatedThread = await this.getThreadByIdInCycle(input.thread_id, input.cycle_id);
    if (updatedThread) {
      await this.upsertThread({
        ...updatedThread,
        status: "published",
        updated_at: now,
      });
    }

    const result: PublishTxnResult = {
      ok: true,
      reason_code: "OK",
      replayed: false,
      lab_record: labRecord,
      credit_delta: -1,
      credit_balance_after: membership.credits - 1,
    };
    this.publishReplayByIdempotencyKey.set(input.idempotency_key, clone(result));
    return clone(result);
  }

  async getProgramCycle(organizationId: string, cycleId: string): Promise<ProgramCycleRecord | null> {
    const row = this.cyclesByKey.get(cycleKey(organizationId, cycleId));
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
    const key = cycleKey(record.organization_id, record.cycle_id);
    const current = this.cyclesByKey.get(key);

    const next: ProgramCycleRecord = {
      ...current,
      ...record,
      created_at: current?.created_at ?? record.created_at ?? new Date().toISOString(),
      updated_at: record.updated_at ?? new Date().toISOString(),
    };

    this.cyclesByKey.set(key, clone(next));
    return clone(next);
  }

  async setProgramCycleState(
    organizationId: string,
    cycleId: string,
    state: ProgramCycleState,
    update: {
      activated_at?: string;
      locked_at?: string;
      archived_at?: string;
      updated_at?: string;
    },
  ): Promise<ProgramCycleRecord | null> {
    const key = cycleKey(organizationId, cycleId);
    const current = this.cyclesByKey.get(key);
    if (!current) {
      return null;
    }

    const next: ProgramCycleRecord = {
      ...current,
      state,
      activated_at: update.activated_at ?? current.activated_at,
      locked_at: update.locked_at ?? current.locked_at,
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

  async listCycleSnapshots(organizationId: string, cycleId: string): Promise<CycleSnapshotRecord[]> {
    return [...this.snapshotsById.values()]
      .filter((row) => row.organization_id === organizationId && row.cycle_id === cycleId)
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
