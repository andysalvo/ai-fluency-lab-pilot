import type {
  CycleSnapshotArtifactRecord,
  CycleSnapshotRecord,
  IngestRecord,
  ProgramCycleRecord,
  ProgramCycleState,
  ProtectedActionAuditRecord,
  SnapshotState,
} from "../core/types.js";
import { DuplicateIngestKeyError, type IngestStateUpdate, type PersistenceAdapter } from "./persistence.js";

type FetchLike = typeof fetch;

interface SupabaseAdapterOptions {
  url: string;
  serviceRoleKey: string;
  fetchFn?: FetchLike;
}

interface SupabaseErrorShape {
  code?: string;
  message?: string;
  details?: string;
}

interface SupabaseIngestRow {
  event_id: string;
  organization_id: string;
  program_cycle_id: string;
  root_problem_version_id: string;
  source_table: string;
  source_record_id: string;
  event_type: string;
  idempotency_key: string;
  ingest_state: string;
  error_code?: string | null;
  details_json?: Record<string, unknown> | null;
  created_at: string;
  processed_at?: string | null;
}

interface SupabaseAuditRow {
  audit_id: string;
  action: string;
  actor_email?: string | null;
  allowlist_state: string;
  role: string;
  allowed: boolean;
  reason_code: string;
  thread_id?: string | null;
  why?: string | null;
  linked_event_id?: string | null;
  linked_idempotency_key?: string | null;
  organization_id: string;
  program_cycle_id: string;
  root_problem_version_id: string;
  created_at: string;
}

interface SupabaseProgramCycleRow {
  organization_id: string;
  program_cycle_id: string;
  root_problem_version_id: string;
  state: string;
  program_label: string;
  created_by?: string | null;
  created_reason?: string | null;
  activated_at?: string | null;
  frozen_at?: string | null;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface SupabaseCycleSnapshotRow {
  snapshot_id: string;
  organization_id: string;
  program_cycle_id: string;
  snapshot_state: string;
  requested_by?: string | null;
  reason?: string | null;
  manifest_json?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

interface SupabaseCycleSnapshotArtifactRow {
  artifact_id: string;
  snapshot_id: string;
  artifact_name: string;
  artifact_kind: string;
  storage_pointer: string;
  checksum_sha256: string;
  created_at: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function mapIngestRow(row: SupabaseIngestRow): IngestRecord {
  return {
    event_id: row.event_id,
    organization_id: row.organization_id,
    program_cycle_id: row.program_cycle_id,
    root_problem_version_id: row.root_problem_version_id,
    source_table: row.source_table,
    source_record_id: row.source_record_id,
    event_type: row.event_type,
    idempotency_key: row.idempotency_key,
    ingest_state: row.ingest_state as IngestRecord["ingest_state"],
    error_code: row.error_code ?? undefined,
    details: row.details_json ?? undefined,
    created_at: row.created_at,
    processed_at: row.processed_at ?? undefined,
  };
}

function mapAuditRow(row: SupabaseAuditRow): ProtectedActionAuditRecord {
  return {
    audit_id: row.audit_id,
    action: row.action as ProtectedActionAuditRecord["action"],
    actor_email: row.actor_email ?? undefined,
    allowlist_state: row.allowlist_state as ProtectedActionAuditRecord["allowlist_state"],
    role: row.role as ProtectedActionAuditRecord["role"],
    allowed: row.allowed,
    reason_code: row.reason_code,
    thread_id: row.thread_id ?? undefined,
    why: row.why ?? undefined,
    linked_event_id: row.linked_event_id ?? undefined,
    linked_idempotency_key: row.linked_idempotency_key ?? undefined,
    organization_id: row.organization_id,
    program_cycle_id: row.program_cycle_id,
    root_problem_version_id: row.root_problem_version_id,
    created_at: row.created_at,
  };
}

function mapProgramCycleRow(row: SupabaseProgramCycleRow): ProgramCycleRecord {
  return {
    organization_id: row.organization_id,
    program_cycle_id: row.program_cycle_id,
    root_problem_version_id: row.root_problem_version_id,
    state: row.state as ProgramCycleState,
    program_label: row.program_label,
    created_by: row.created_by ?? undefined,
    created_reason: row.created_reason ?? undefined,
    activated_at: row.activated_at ?? undefined,
    frozen_at: row.frozen_at ?? undefined,
    archived_at: row.archived_at ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapSnapshotRow(row: SupabaseCycleSnapshotRow): CycleSnapshotRecord {
  return {
    snapshot_id: row.snapshot_id,
    organization_id: row.organization_id,
    program_cycle_id: row.program_cycle_id,
    snapshot_state: row.snapshot_state as SnapshotState,
    requested_by: row.requested_by ?? undefined,
    reason: row.reason ?? undefined,
    manifest: row.manifest_json ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at ?? undefined,
  };
}

function mapSnapshotArtifactRow(row: SupabaseCycleSnapshotArtifactRow): CycleSnapshotArtifactRecord {
  return {
    artifact_id: row.artifact_id,
    snapshot_id: row.snapshot_id,
    artifact_name: row.artifact_name,
    artifact_kind: row.artifact_kind as CycleSnapshotArtifactRecord["artifact_kind"],
    storage_pointer: row.storage_pointer,
    checksum_sha256: row.checksum_sha256,
    created_at: row.created_at,
  };
}

export class SupabasePersistenceAdapter implements PersistenceAdapter {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly fetchFn: FetchLike;

  constructor(options: SupabaseAdapterOptions) {
    this.baseUrl = options.url.replace(/\/$/, "");
    this.serviceRoleKey = options.serviceRoleKey;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  private async request<T>(path: string, init: RequestInit & { bodyJson?: unknown } = {}): Promise<T> {
    const headers = new Headers(init.headers ?? {});
    headers.set("apikey", this.serviceRoleKey);
    headers.set("Authorization", `Bearer ${this.serviceRoleKey}`);

    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (!headers.has("Prefer") && init.method && init.method !== "GET") {
      headers.set("Prefer", "return=representation");
    }

    const response = await this.fetchFn(`${this.baseUrl}/rest/v1${path}`, {
      ...init,
      headers,
      body: init.bodyJson !== undefined ? JSON.stringify(init.bodyJson) : init.body,
    });

    if (response.status === 204) {
      return [] as T;
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const err = (isObject(parsed) ? parsed : {}) as SupabaseErrorShape;

      if (err.code === "23505" && typeof err.message === "string" && err.message.includes("idempotency_key")) {
        throw new DuplicateIngestKeyError("idempotency_key");
      }

      const message = err.message ?? `Supabase request failed (${response.status})`;
      throw new Error(message);
    }

    return parsed as T;
  }

  async getActiveIngressMode(): Promise<string | null> {
    const rows = await this.request<Array<{ active_ingress_mode?: string }>>(
      "/runtime_control?select=active_ingress_mode&control_id=eq.1&limit=1",
      { method: "GET", headers: { Prefer: "count=exact" } },
    );

    const mode = rows[0]?.active_ingress_mode;
    return typeof mode === "string" && mode.length > 0 ? mode : null;
  }

  async getIngestByIdempotencyKey(idempotencyKey: string): Promise<IngestRecord | null> {
    const rows = await this.request<SupabaseIngestRow[]>(
      `/event_ingest_log?select=*&idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&limit=1`,
      { method: "GET" },
    );

    const row = rows[0];
    return row ? mapIngestRow(row) : null;
  }

  async insertIngest(record: Omit<IngestRecord, "event_id" | "created_at"> & { event_id?: string; created_at?: string }): Promise<IngestRecord> {
    const payload = {
      event_id: record.event_id,
      organization_id: record.organization_id,
      program_cycle_id: record.program_cycle_id,
      root_problem_version_id: record.root_problem_version_id,
      source_table: record.source_table,
      source_record_id: record.source_record_id,
      event_type: record.event_type,
      idempotency_key: record.idempotency_key,
      ingest_state: record.ingest_state,
      error_code: record.error_code ?? null,
      details_json: record.details ?? {},
      created_at: record.created_at,
      processed_at: record.processed_at ?? null,
    };

    const rows = await this.request<SupabaseIngestRow[]>("/event_ingest_log", {
      method: "POST",
      bodyJson: payload,
    });

    const row = rows[0];
    if (!row) {
      throw new Error("Supabase insert did not return event_ingest_log row");
    }

    return mapIngestRow(row);
  }

  async updateIngestState(eventId: string, update: IngestStateUpdate): Promise<IngestRecord | null> {
    const rows = await this.request<SupabaseIngestRow[]>(`/event_ingest_log?event_id=eq.${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      bodyJson: {
        ingest_state: update.ingest_state,
        error_code: update.error_code ?? null,
        processed_at: update.processed_at ?? null,
        details_json: update.details ?? {},
      },
    });

    const row = rows[0];
    return row ? mapIngestRow(row) : null;
  }

  async insertProtectedActionAudit(
    record: Omit<ProtectedActionAuditRecord, "audit_id" | "created_at"> & { audit_id?: string; created_at?: string },
  ): Promise<ProtectedActionAuditRecord> {
    const rows = await this.request<SupabaseAuditRow[]>("/protected_action_audit", {
      method: "POST",
      bodyJson: {
        audit_id: record.audit_id,
        action: record.action,
        actor_email: record.actor_email ?? null,
        allowlist_state: record.allowlist_state,
        role: record.role,
        allowed: record.allowed,
        reason_code: record.reason_code,
        thread_id: record.thread_id ?? null,
        why: record.why ?? null,
        linked_event_id: record.linked_event_id ?? null,
        linked_idempotency_key: record.linked_idempotency_key ?? null,
        organization_id: record.organization_id,
        program_cycle_id: record.program_cycle_id,
        root_problem_version_id: record.root_problem_version_id,
        created_at: record.created_at,
      },
    });

    const row = rows[0];
    if (!row) {
      throw new Error("Supabase insert did not return protected_action_audit row");
    }

    return mapAuditRow(row);
  }

  async getProgramCycle(organizationId: string, programCycleId: string): Promise<ProgramCycleRecord | null> {
    const rows = await this.request<SupabaseProgramCycleRow[]>(
      `/program_cycles?select=*&organization_id=eq.${encodeURIComponent(organizationId)}&program_cycle_id=eq.${encodeURIComponent(programCycleId)}&limit=1`,
      { method: "GET" },
    );

    const row = rows[0];
    return row ? mapProgramCycleRow(row) : null;
  }

  async getActiveProgramCycle(organizationId: string): Promise<ProgramCycleRecord | null> {
    const rows = await this.request<SupabaseProgramCycleRow[]>(
      `/program_cycles?select=*&organization_id=eq.${encodeURIComponent(organizationId)}&state=eq.active&limit=1`,
      { method: "GET" },
    );

    const row = rows[0];
    return row ? mapProgramCycleRow(row) : null;
  }

  async upsertProgramCycle(
    record: Omit<ProgramCycleRecord, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string },
  ): Promise<ProgramCycleRecord> {
    const rows = await this.request<SupabaseProgramCycleRow[]>("/program_cycles?on_conflict=organization_id,program_cycle_id", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      bodyJson: {
        organization_id: record.organization_id,
        program_cycle_id: record.program_cycle_id,
        root_problem_version_id: record.root_problem_version_id,
        state: record.state,
        program_label: record.program_label,
        created_by: record.created_by ?? null,
        created_reason: record.created_reason ?? null,
        activated_at: record.activated_at ?? null,
        frozen_at: record.frozen_at ?? null,
        archived_at: record.archived_at ?? null,
        created_at: record.created_at,
        updated_at: record.updated_at,
      },
    });

    const row = rows[0];
    if (!row) {
      throw new Error("Supabase upsert did not return program_cycles row");
    }

    return mapProgramCycleRow(row);
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
    const rows = await this.request<SupabaseProgramCycleRow[]>(
      `/program_cycles?organization_id=eq.${encodeURIComponent(organizationId)}&program_cycle_id=eq.${encodeURIComponent(programCycleId)}`,
      {
        method: "PATCH",
        bodyJson: {
          state,
          activated_at: update.activated_at ?? null,
          frozen_at: update.frozen_at ?? null,
          archived_at: update.archived_at ?? null,
          updated_at: update.updated_at,
        },
      },
    );

    const row = rows[0];
    return row ? mapProgramCycleRow(row) : null;
  }

  async insertCycleSnapshot(
    record: Omit<CycleSnapshotRecord, "snapshot_id" | "created_at" | "updated_at"> & {
      snapshot_id?: string;
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<CycleSnapshotRecord> {
    const rows = await this.request<SupabaseCycleSnapshotRow[]>("/cycle_snapshots", {
      method: "POST",
      bodyJson: {
        snapshot_id: record.snapshot_id,
        organization_id: record.organization_id,
        program_cycle_id: record.program_cycle_id,
        snapshot_state: record.snapshot_state,
        requested_by: record.requested_by ?? null,
        reason: record.reason ?? null,
        manifest_json: record.manifest ?? {},
        created_at: record.created_at,
        updated_at: record.updated_at,
        completed_at: record.completed_at ?? null,
      },
    });

    const row = rows[0];
    if (!row) {
      throw new Error("Supabase insert did not return cycle_snapshots row");
    }

    return mapSnapshotRow(row);
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
    const rows = await this.request<SupabaseCycleSnapshotRow[]>(`/cycle_snapshots?snapshot_id=eq.${encodeURIComponent(snapshotId)}`, {
      method: "PATCH",
      bodyJson: {
        snapshot_state: update.snapshot_state,
        manifest_json: update.manifest ?? {},
        completed_at: update.completed_at ?? null,
        updated_at: update.updated_at,
      },
    });

    const row = rows[0];
    return row ? mapSnapshotRow(row) : null;
  }

  async listCycleSnapshots(organizationId: string, programCycleId: string): Promise<CycleSnapshotRecord[]> {
    const rows = await this.request<SupabaseCycleSnapshotRow[]>(
      `/cycle_snapshots?select=*&organization_id=eq.${encodeURIComponent(organizationId)}&program_cycle_id=eq.${encodeURIComponent(programCycleId)}&order=created_at.desc`,
      { method: "GET" },
    );

    return rows.map(mapSnapshotRow);
  }

  async insertCycleSnapshotArtifact(
    record: Omit<CycleSnapshotArtifactRecord, "artifact_id" | "created_at"> & { artifact_id?: string; created_at?: string },
  ): Promise<CycleSnapshotArtifactRecord> {
    const rows = await this.request<SupabaseCycleSnapshotArtifactRow[]>("/cycle_snapshot_artifacts", {
      method: "POST",
      bodyJson: {
        artifact_id: record.artifact_id,
        snapshot_id: record.snapshot_id,
        artifact_name: record.artifact_name,
        artifact_kind: record.artifact_kind,
        storage_pointer: record.storage_pointer,
        checksum_sha256: record.checksum_sha256,
        created_at: record.created_at,
      },
    });

    const row = rows[0];
    if (!row) {
      throw new Error("Supabase insert did not return cycle_snapshot_artifacts row");
    }

    return mapSnapshotArtifactRow(row);
  }

  async listCycleSnapshotArtifacts(snapshotId: string): Promise<CycleSnapshotArtifactRecord[]> {
    const rows = await this.request<SupabaseCycleSnapshotArtifactRow[]>(
      `/cycle_snapshot_artifacts?select=*&snapshot_id=eq.${encodeURIComponent(snapshotId)}&order=created_at.asc`,
      { method: "GET" },
    );

    return rows.map(mapSnapshotArtifactRow);
  }
}
