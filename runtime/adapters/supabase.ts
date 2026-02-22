import type {
  CycleControlRecord,
  CycleMembershipRecord,
  CycleSnapshotArtifactRecord,
  CycleSnapshotRecord,
  GuidedQuestionItemRecord,
  GuidedRoundRecord,
  IngestRecord,
  LabBriefDraftRecord,
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

interface SupabaseAdapterOptions {
  url: string;
  serviceRoleKey: string;
}

interface SupabaseError {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toIsoOrUndefined(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return undefined;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function joinError(error: SupabaseError): string {
  return [error.message, error.details, error.hint, error.code].filter((part) => typeof part === "string" && part.length > 0).join(" | ");
}

function maybeUuid(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value) ? value : undefined;
}

function mapMembershipToAllowlistState(state: ProtectedActionAuditRecord["membership_state"]): "allowlisted" | "active" | "suspended" | "revoked" {
  if (state === "active") {
    return "active";
  }
  if (state === "revoked") {
    return "revoked";
  }

  return "allowlisted";
}

export class SupabasePersistenceAdapter implements PersistenceAdapter {
  private readonly restBase: string;
  private readonly rpcBase: string;
  private readonly serviceRoleKey: string;

  constructor(options: SupabaseAdapterOptions) {
    const trimmed = options.url.replace(/\/$/, "");
    this.restBase = `${trimmed}/rest/v1`;
    this.rpcBase = `${trimmed}/rest/v1/rpc`;
    this.serviceRoleKey = options.serviceRoleKey;
  }

  private headers(extra: Record<string, string> = {}): Headers {
    return new Headers({
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      "content-type": "application/json",
      ...extra,
    });
  }

  private async request(method: string, url: URL, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
    return fetch(url, {
      method,
      headers: this.headers(headers),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  private async parseJson(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  private async expectOk(response: Response): Promise<unknown> {
    const payload = await this.parseJson(response);
    if (!response.ok) {
      const error = payload && typeof payload === "object" ? (payload as SupabaseError) : { message: String(payload ?? "request failed") };
      throw new Error(`Supabase request failed (${response.status}): ${joinError(error)}`);
    }

    return payload;
  }

  private tableUrl(table: string, query: Record<string, string | undefined> = {}): URL {
    const url = new URL(`${this.restBase}/${table}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }

    return url;
  }

  private mapIngest(row: Record<string, unknown>): IngestRecord {
    return {
      event_id: asString(row.event_id),
      source_table: asString(row.source_table),
      source_record_id: asString(row.source_record_id),
      event_type: asString(row.event_type),
      idempotency_key: asString(row.idempotency_key),
      ingest_state: asString(row.ingest_state) as IngestRecord["ingest_state"],
      error_code: toIsoOrUndefined(row.error_code),
      created_at: asString(row.created_at),
      processed_at: toIsoOrUndefined(row.processed_at),
      details: asObject(row.details_json ?? row.details),
      organization_id: asString(row.organization_id),
      cycle_id: asString(row.cycle_id),
      root_problem_version_id: asString(row.root_problem_version_id),
    };
  }

  private mapAudit(row: Record<string, unknown>): ProtectedActionAuditRecord {
    return {
      audit_id: asString(row.audit_id),
      action: asString(row.action) as ProtectedActionAuditRecord["action"],
      participant_id: toIsoOrUndefined(row.participant_id),
      actor_email: toIsoOrUndefined(row.actor_email),
      membership_state: asString(row.membership_state) as ProtectedActionAuditRecord["membership_state"],
      global_state: asString(row.global_state) as ProtectedActionAuditRecord["global_state"],
      role: asString(row.role) as ProtectedActionAuditRecord["role"],
      allowed: asBoolean(row.allowed),
      reason_code: asString(row.reason_code),
      thread_id: toIsoOrUndefined(row.thread_id),
      client_request_id: toIsoOrUndefined(row.client_request_id),
      why: toIsoOrUndefined(row.why),
      linked_event_id: toIsoOrUndefined(row.linked_event_id),
      linked_idempotency_key: toIsoOrUndefined(row.linked_idempotency_key),
      created_at: asString(row.created_at),
      organization_id: asString(row.organization_id),
      cycle_id: asString(row.cycle_id),
      root_problem_version_id: asString(row.root_problem_version_id),
    };
  }

  private mapParticipant(row: Record<string, unknown>): ParticipantRecord {
    return {
      participant_id: asString(row.participant_id),
      email_canonical: asString(row.email_canonical),
      global_state: asString(row.global_state) as ParticipantRecord["global_state"],
      global_role: asString(row.global_role) as ParticipantRecord["global_role"],
      created_at: asString(row.created_at),
      last_login_at: toIsoOrUndefined(row.last_login_at),
    };
  }

  private mapMembership(row: Record<string, unknown>): CycleMembershipRecord {
    return {
      participant_id: asString(row.participant_id),
      organization_id: asString(row.organization_id),
      cycle_id: asString(row.cycle_id),
      role: asString(row.role) as CycleMembershipRecord["role"],
      membership_state: asString(row.membership_state) as CycleMembershipRecord["membership_state"],
      credits: asNumber(row.credits),
      joined_at: asString(row.joined_at),
      updated_at: asString(row.updated_at),
    };
  }

  private mapThread(row: Record<string, unknown>): RuntimeThreadRecord {
    return {
      thread_id: asString(row.thread_id),
      organization_id: asString(row.organization_id),
      cycle_id: asString(row.cycle_id),
      root_problem_version_id: asString(row.root_problem_version_id),
      owner_participant_id: asString(row.owner_participant_id),
      status: asString(row.status) as RuntimeThreadRecord["status"],
      created_at: asString(row.created_at),
      updated_at: asString(row.updated_at),
    };
  }

  private mapSource(row: Record<string, unknown>): SourceSubmissionRecord {
    return {
      source_submission_id: asString(row.source_submission_id),
      thread_id: asString(row.thread_id),
      organization_id: asString(row.organization_id),
      cycle_id: asString(row.cycle_id),
      root_problem_version_id: asString(row.root_problem_version_id),
      participant_id: asString(row.participant_id),
      raw_url: asString(row.raw_url),
      canonical_url: asString(row.canonical_url),
      canonical_url_hash: asString(row.canonical_url_hash),
      canonicalizer_version: asNumber(row.canonicalizer_version, 1),
      relevance_note: asString(row.relevance_note),
      possible_duplicate: asBoolean(row.possible_duplicate),
      created_at: asString(row.created_at),
    };
  }

  private mapStarterBrief(row: Record<string, unknown>): StarterBriefRecord {
    return {
      starter_brief_id: asString(row.starter_brief_id),
      source_submission_id: asString(row.source_submission_id),
      thread_id: asString(row.thread_id),
      organization_id: asString(row.organization_id),
      cycle_id: asString(row.cycle_id),
      root_problem_version_id: asString(row.root_problem_version_id),
      status: asString(row.status) as StarterBriefRecord["status"],
      payload: asObject(row.payload_json ?? row.payload),
      replay_payload: asObject(row.replay_payload_json ?? row.replay_payload),
      created_at: asString(row.created_at),
      updated_at: asString(row.updated_at),
    };
  }

  private mapGuidedRound(row: Record<string, unknown>): GuidedRoundRecord {
    return {
      round_id: asString(row.round_id),
      thread_id: asString(row.thread_id),
      organization_id: asString(row.organization_id),
      cycle_id: asString(row.cycle_id),
      root_problem_version_id: asString(row.root_problem_version_id),
      participant_id: asString(row.participant_id),
      round_number: asNumber(row.round_number),
      status: asString(row.status) as GuidedRoundRecord["status"],
      summary: toIsoOrUndefined(row.summary),
      created_at: asString(row.created_at),
      updated_at: asString(row.updated_at),
      completed_at: toIsoOrUndefined(row.completed_at),
    };
  }

  private mapGuidedQuestionItem(row: Record<string, unknown>): GuidedQuestionItemRecord {
    const optionsRaw = row.options_json ?? row.options;
    const options = Array.isArray(optionsRaw)
      ? optionsRaw
          .map((item) => asObject(item))
          .map((item) => ({
            code: asString(item.code) as GuidedQuestionItemRecord["recommended_option"],
            text: asString(item.text),
          }))
          .filter((item) => item.code && item.text)
      : [];

    return {
      question_item_id: asString(row.question_item_id),
      round_id: asString(row.round_id),
      thread_id: asString(row.thread_id),
      organization_id: asString(row.organization_id),
      cycle_id: asString(row.cycle_id),
      root_problem_version_id: asString(row.root_problem_version_id),
      participant_id: asString(row.participant_id),
      ordinal: asNumber(row.ordinal),
      prompt: asString(row.prompt),
      options,
      recommended_option: asString(row.recommended_option) as GuidedQuestionItemRecord["recommended_option"],
      selected_option: toIsoOrUndefined(row.selected_option) as GuidedQuestionItemRecord["selected_option"],
      short_reason: toIsoOrUndefined(row.short_reason),
      answered_at: toIsoOrUndefined(row.answered_at),
      created_at: asString(row.created_at),
      updated_at: asString(row.updated_at),
    };
  }

  private mapLabBriefDraft(row: Record<string, unknown>): LabBriefDraftRecord {
    return {
      draft_id: asString(row.draft_id),
      thread_id: asString(row.thread_id),
      organization_id: asString(row.organization_id),
      cycle_id: asString(row.cycle_id),
      root_problem_version_id: asString(row.root_problem_version_id),
      participant_id: asString(row.participant_id),
      status: asString(row.status) as LabBriefDraftRecord["status"],
      content: asObject(row.content_json ?? row.content),
      generation_metadata: asObject(row.generation_metadata_json ?? row.generation_metadata),
      created_at: asString(row.created_at),
      updated_at: asString(row.updated_at),
    };
  }

  private mapCycle(row: Record<string, unknown>): ProgramCycleRecord {
    return {
      organization_id: asString(row.organization_id),
      cycle_id: asString(row.cycle_id),
      root_problem_version_id: asString(row.root_problem_version_id),
      state: asString(row.state) as ProgramCycleRecord["state"],
      focus_snapshot: asString(row.focus_snapshot),
      program_label: asString(row.program_label),
      created_by: toIsoOrUndefined(row.created_by),
      created_reason: toIsoOrUndefined(row.created_reason),
      activated_at: toIsoOrUndefined(row.activated_at),
      locked_at: toIsoOrUndefined(row.locked_at),
      archived_at: toIsoOrUndefined(row.archived_at),
      created_at: asString(row.created_at),
      updated_at: asString(row.updated_at),
    };
  }

  private mapSnapshot(row: Record<string, unknown>): CycleSnapshotRecord {
    return {
      snapshot_id: asString(row.snapshot_id),
      organization_id: asString(row.organization_id),
      cycle_id: asString(row.cycle_id),
      snapshot_state: asString(row.snapshot_state) as CycleSnapshotRecord["snapshot_state"],
      requested_by: toIsoOrUndefined(row.requested_by),
      reason: toIsoOrUndefined(row.reason),
      manifest: asObject(row.manifest_json ?? row.manifest),
      created_at: asString(row.created_at),
      updated_at: asString(row.updated_at),
      completed_at: toIsoOrUndefined(row.completed_at),
    };
  }

  private mapArtifact(row: Record<string, unknown>): CycleSnapshotArtifactRecord {
    return {
      artifact_id: asString(row.artifact_id),
      snapshot_id: asString(row.snapshot_id),
      artifact_name: asString(row.artifact_name),
      artifact_kind: asString(row.artifact_kind) as CycleSnapshotArtifactRecord["artifact_kind"],
      storage_pointer: asString(row.storage_pointer),
      checksum_sha256: asString(row.checksum_sha256),
      created_at: asString(row.created_at),
    };
  }

  private mapLabRecord(row: Record<string, unknown>): LabRecordEntry {
    return {
      lab_record_id: asString(row.lab_record_id),
      thread_id: asString(row.thread_id),
      participant_id: asString(row.participant_id),
      version: asNumber(row.version),
      content: asObject(row.content_json ?? row.content),
      created_at: asString(row.created_at),
      organization_id: asString(row.organization_id),
      cycle_id: asString(row.cycle_id),
      root_problem_version_id: asString(row.root_problem_version_id),
    };
  }

  async getActiveIngressMode(): Promise<string | null> {
    const url = this.tableUrl("runtime_control", {
      select: "active_ingress_mode",
      control_id: "eq.1",
      limit: "1",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    return asString(asObject(rows[0]).active_ingress_mode) || null;
  }

  async getIngestByIdempotencyKey(idempotencyKey: string): Promise<IngestRecord | null> {
    const url = this.tableUrl("event_ingest_log", {
      select: "*",
      idempotency_key: `eq.${idempotencyKey}`,
      limit: "1",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    return this.mapIngest(asObject(rows[0]));
  }

  async insertIngest(
    record: Omit<IngestRecord, "event_id" | "created_at"> & { event_id?: string; created_at?: string },
  ): Promise<IngestRecord> {
    const url = this.tableUrl("event_ingest_log", { select: "*" });
    const body = {
      event_id: record.event_id,
      source_record_id: record.source_record_id,
      source_table: record.source_table,
      event_type: record.event_type,
      idempotency_key: record.idempotency_key,
      ingest_state: record.ingest_state,
      error_code: record.error_code,
      details_json: record.details ?? {},
      created_at: record.created_at,
      processed_at: record.processed_at,
      organization_id: record.organization_id,
      cycle_id: record.cycle_id,
      root_problem_version_id: record.root_problem_version_id,
    };

    const response = await this.request("POST", url, body, { Prefer: "return=representation" });
    if (!response.ok) {
      const payload = await this.parseJson(response);
      const errorObj = payload && typeof payload === "object" ? (payload as SupabaseError) : { message: String(payload ?? "") };
      const message = joinError(errorObj);
      if (response.status === 409 || message.toLowerCase().includes("duplicate") || message.includes("event_ingest_log_idempotency_key_key")) {
        throw new DuplicateIngestKeyError(record.idempotency_key);
      }
      throw new Error(`Supabase request failed (${response.status}): ${message}`);
    }

    const payload = await this.parseJson(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      throw new Error("insertIngest returned no rows");
    }

    return this.mapIngest(asObject(rows[0]));
  }

  async updateIngestState(eventId: string, update: IngestStateUpdate): Promise<IngestRecord | null> {
    const url = this.tableUrl("event_ingest_log", {
      select: "*",
      event_id: `eq.${eventId}`,
    });
    const body = {
      ingest_state: update.ingest_state,
      error_code: update.error_code,
      processed_at: update.processed_at,
      details_json: update.details,
    };

    const response = await this.request("PATCH", url, body, { Prefer: "return=representation" });
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    return this.mapIngest(asObject(rows[0]));
  }

  async insertProtectedActionAudit(
    record: Omit<ProtectedActionAuditRecord, "audit_id" | "created_at"> & { audit_id?: string; created_at?: string },
  ): Promise<ProtectedActionAuditRecord> {
    const url = this.tableUrl("protected_action_audit", { select: "*" });
    const body = {
      audit_id: record.audit_id,
      action: record.action,
      participant_id: maybeUuid(record.participant_id),
      actor_email: record.actor_email,
      allowlist_state: mapMembershipToAllowlistState(record.membership_state),
      membership_state: record.membership_state,
      global_state: record.global_state,
      role: record.role,
      allowed: record.allowed,
      reason_code: record.reason_code,
      thread_id: record.thread_id,
      client_request_id: record.client_request_id,
      why: record.why,
      linked_event_id: maybeUuid(record.linked_event_id),
      linked_idempotency_key: record.linked_idempotency_key,
      organization_id: record.organization_id,
      cycle_id: record.cycle_id,
      root_problem_version_id: record.root_problem_version_id,
      created_at: record.created_at,
    };

    const response = await this.request("POST", url, body, { Prefer: "return=representation" });
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      throw new Error("insertProtectedActionAudit returned no rows");
    }

    return this.mapAudit(asObject(rows[0]));
  }

  async getRuntimeControl(): Promise<RuntimeControlRecord> {
    const url = this.tableUrl("runtime_control", {
      select: "*",
      control_id: "eq.1",
      limit: "1",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return {
        active_ingress_mode: "supabase_edge",
        global_protected_actions_halt: false,
        updated_at: new Date().toISOString(),
      };
    }

    const row = asObject(rows[0]);
    return {
      active_ingress_mode: (asString(row.active_ingress_mode) as RuntimeControlRecord["active_ingress_mode"]) || "supabase_edge",
      global_protected_actions_halt: asBoolean(row.global_protected_actions_halt),
      halt_reason: toIsoOrUndefined(row.halt_reason),
      updated_at: asString(row.updated_at),
    };
  }

  async getCycleControl(organizationId: string, cycleId: string): Promise<CycleControlRecord | null> {
    const url = this.tableUrl("cycle_control", {
      select: "*",
      organization_id: `eq.${organizationId}`,
      cycle_id: `eq.${cycleId}`,
      limit: "1",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    const row = asObject(rows[0]);
    return {
      organization_id: asString(row.organization_id),
      cycle_id: asString(row.cycle_id),
      protected_actions_halt: asBoolean(row.protected_actions_halt),
      halt_reason: toIsoOrUndefined(row.halt_reason),
      updated_at: asString(row.updated_at),
    };
  }

  async upsertCycleControl(record: Omit<CycleControlRecord, "updated_at"> & { updated_at?: string }): Promise<CycleControlRecord> {
    const url = this.tableUrl("cycle_control", {
      select: "*",
      on_conflict: "organization_id,cycle_id",
    });

    const body = {
      organization_id: record.organization_id,
      cycle_id: record.cycle_id,
      protected_actions_halt: record.protected_actions_halt,
      halt_reason: record.halt_reason,
      updated_at: record.updated_at,
    };

    const response = await this.request("POST", url, body, {
      Prefer: "resolution=merge-duplicates,return=representation",
    });
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      throw new Error("upsertCycleControl returned no rows");
    }

    const row = asObject(rows[0]);
    return {
      organization_id: asString(row.organization_id),
      cycle_id: asString(row.cycle_id),
      protected_actions_halt: asBoolean(row.protected_actions_halt),
      halt_reason: toIsoOrUndefined(row.halt_reason),
      updated_at: asString(row.updated_at),
    };
  }

  async getParticipantByEmailCanonical(emailCanonical: string): Promise<ParticipantRecord | null> {
    const url = this.tableUrl("participants", {
      select: "*",
      email_canonical: `eq.${emailCanonical}`,
      limit: "1",
    });

    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    return this.mapParticipant(asObject(rows[0]));
  }

  async getParticipantById(participantId: string): Promise<ParticipantRecord | null> {
    const url = this.tableUrl("participants", {
      select: "*",
      participant_id: `eq.${participantId}`,
      limit: "1",
    });

    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    return this.mapParticipant(asObject(rows[0]));
  }

  async upsertParticipant(record: Omit<ParticipantRecord, "created_at"> & { created_at?: string }): Promise<ParticipantRecord> {
    const url = this.tableUrl("participants", {
      select: "*",
      on_conflict: "email_canonical",
    });

    const body = {
      participant_id: maybeUuid(record.participant_id),
      email_canonical: record.email_canonical,
      global_state: record.global_state,
      global_role: record.global_role,
      created_at: record.created_at,
      last_login_at: record.last_login_at,
    };

    const response = await this.request("POST", url, body, {
      Prefer: "resolution=merge-duplicates,return=representation",
    });
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      throw new Error("upsertParticipant returned no rows");
    }

    return this.mapParticipant(asObject(rows[0]));
  }

  async updateParticipantLastLogin(participantId: string, lastLoginAt: string): Promise<ParticipantRecord | null> {
    const url = this.tableUrl("participants", {
      select: "*",
      participant_id: `eq.${participantId}`,
    });

    const response = await this.request("PATCH", url, { last_login_at: lastLoginAt }, { Prefer: "return=representation" });
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    return this.mapParticipant(asObject(rows[0]));
  }

  async getCycleMembership(participantId: string, organizationId: string, cycleId: string): Promise<CycleMembershipRecord | null> {
    const url = this.tableUrl("cycle_memberships", {
      select: "*",
      participant_id: `eq.${participantId}`,
      organization_id: `eq.${organizationId}`,
      cycle_id: `eq.${cycleId}`,
      limit: "1",
    });

    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    return this.mapMembership(asObject(rows[0]));
  }

  async upsertCycleMembership(
    record: Omit<CycleMembershipRecord, "joined_at" | "updated_at"> & { joined_at?: string; updated_at?: string },
  ): Promise<CycleMembershipRecord> {
    const url = this.tableUrl("cycle_memberships", {
      select: "*",
      on_conflict: "participant_id,organization_id,cycle_id",
    });

    const body = {
      participant_id: maybeUuid(record.participant_id),
      organization_id: record.organization_id,
      cycle_id: record.cycle_id,
      role: record.role,
      membership_state: record.membership_state,
      credits: record.credits,
      joined_at: record.joined_at,
      updated_at: record.updated_at,
    };

    const response = await this.request("POST", url, body, {
      Prefer: "resolution=merge-duplicates,return=representation",
    });
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      throw new Error("upsertCycleMembership returned no rows");
    }

    return this.mapMembership(asObject(rows[0]));
  }

  async activateMembership(participantId: string, organizationId: string, cycleId: string, updatedAt: string): Promise<CycleMembershipRecord | null> {
    try {
      const rpcUrl = new URL(`${this.rpcBase}/activate_membership_txn`);
      const response = await this.request(
        "POST",
        rpcUrl,
        {
          p_participant_id: participantId,
          p_organization_id: organizationId,
          p_cycle_id: cycleId,
          p_updated_at: updatedAt,
        },
        { Prefer: "return=representation" },
      );

      const payload = await this.expectOk(response);
      if (!payload || typeof payload !== "object") {
        return null;
      }

      return this.mapMembership(asObject(payload));
    } catch {
      const target = await this.getCycleMembership(participantId, organizationId, cycleId);
      if (!target || target.membership_state === "revoked") {
        return null;
      }

      const deactivateUrl = this.tableUrl("cycle_memberships", {
        participant_id: `eq.${participantId}`,
        organization_id: `eq.${organizationId}`,
        membership_state: "eq.active",
      });
      await this.expectOk(
        await this.request("PATCH", deactivateUrl, { membership_state: "inactive", updated_at: updatedAt }, { Prefer: "return=minimal" }),
      );

      const activateUrl = this.tableUrl("cycle_memberships", {
        select: "*",
        participant_id: `eq.${participantId}`,
        organization_id: `eq.${organizationId}`,
        cycle_id: `eq.${cycleId}`,
      });
      const response = await this.request(
        "PATCH",
        activateUrl,
        { membership_state: "active", updated_at: updatedAt },
        { Prefer: "return=representation" },
      );
      const payload = await this.expectOk(response);
      const rows = Array.isArray(payload) ? payload : [];
      if (rows.length === 0) {
        return null;
      }

      return this.mapMembership(asObject(rows[0]));
    }
  }

  async getSessionContext(participantId: string): Promise<SessionContextRecord | null> {
    const url = this.tableUrl("participant_session_context", {
      select: "*",
      participant_id: `eq.${participantId}`,
      limit: "1",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    const row = asObject(rows[0]);
    return {
      participant_id: asString(row.participant_id),
      active_cycle_id: asString(row.active_cycle_id),
      updated_at: asString(row.updated_at),
    };
  }

  async setSessionActiveCycle(participantId: string, cycleId: string, updatedAt: string): Promise<SessionContextRecord> {
    const url = this.tableUrl("participant_session_context", {
      select: "*",
      on_conflict: "participant_id",
    });
    const response = await this.request(
      "POST",
      url,
      {
        participant_id: participantId,
        active_cycle_id: cycleId,
        updated_at: updatedAt,
      },
      { Prefer: "resolution=merge-duplicates,return=representation" },
    );
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      throw new Error("setSessionActiveCycle returned no rows");
    }

    const row = asObject(rows[0]);
    return {
      participant_id: asString(row.participant_id),
      active_cycle_id: asString(row.active_cycle_id),
      updated_at: asString(row.updated_at),
    };
  }

  async getThreadById(threadId: string): Promise<RuntimeThreadRecord | null> {
    const url = this.tableUrl("threads_runtime", {
      select: "*",
      thread_id: `eq.${threadId}`,
      limit: "1",
    });

    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    return this.mapThread(asObject(rows[0]));
  }

  async getThreadByIdInCycle(threadId: string, cycleId: string): Promise<RuntimeThreadRecord | null> {
    const url = this.tableUrl("threads_runtime", {
      select: "*",
      thread_id: `eq.${threadId}`,
      cycle_id: `eq.${cycleId}`,
      limit: "1",
    });

    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    return this.mapThread(asObject(rows[0]));
  }

  async upsertThread(
    record: Omit<RuntimeThreadRecord, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string },
  ): Promise<RuntimeThreadRecord> {
    const url = this.tableUrl("threads_runtime", {
      select: "*",
      on_conflict: "thread_id,cycle_id",
    });

    const body = {
      thread_id: record.thread_id,
      organization_id: record.organization_id,
      cycle_id: record.cycle_id,
      root_problem_version_id: record.root_problem_version_id,
      owner_participant_id: record.owner_participant_id,
      status: record.status,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };

    const response = await this.request("POST", url, body, {
      Prefer: "resolution=merge-duplicates,return=representation",
    });
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      throw new Error("upsertThread returned no rows");
    }

    return this.mapThread(asObject(rows[0]));
  }

  async insertSourceSubmission(
    record: Omit<SourceSubmissionRecord, "source_submission_id" | "created_at"> & {
      source_submission_id?: string;
      created_at?: string;
    },
  ): Promise<SourceSubmissionRecord> {
    const url = this.tableUrl("source_submissions", { select: "*" });
    const body = {
      source_submission_id: maybeUuid(record.source_submission_id),
      thread_id: record.thread_id,
      organization_id: record.organization_id,
      cycle_id: record.cycle_id,
      root_problem_version_id: record.root_problem_version_id,
      participant_id: maybeUuid(record.participant_id),
      raw_url: record.raw_url,
      canonical_url: record.canonical_url,
      canonical_url_hash: record.canonical_url_hash,
      canonicalizer_version: record.canonicalizer_version,
      relevance_note: record.relevance_note,
      possible_duplicate: record.possible_duplicate,
      created_at: record.created_at,
    };

    const response = await this.request("POST", url, body, { Prefer: "return=representation" });
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      throw new Error("insertSourceSubmission returned no rows");
    }

    return this.mapSource(asObject(rows[0]));
  }

  async insertStarterBrief(
    record: Omit<StarterBriefRecord, "starter_brief_id" | "created_at" | "updated_at"> & {
      starter_brief_id?: string;
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<StarterBriefRecord> {
    const url = this.tableUrl("starter_briefs", { select: "*" });
    const body = {
      starter_brief_id: maybeUuid(record.starter_brief_id),
      source_submission_id: maybeUuid(record.source_submission_id),
      thread_id: record.thread_id,
      organization_id: record.organization_id,
      cycle_id: record.cycle_id,
      root_problem_version_id: record.root_problem_version_id,
      status: record.status,
      payload_json: record.payload,
      replay_payload_json: record.replay_payload,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };

    const response = await this.request("POST", url, body, { Prefer: "return=representation" });
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      throw new Error("insertStarterBrief returned no rows");
    }

    return this.mapStarterBrief(asObject(rows[0]));
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
    const url = this.tableUrl("starter_briefs", {
      select: "*",
      starter_brief_id: `eq.${starterBriefId}`,
    });

    const body = {
      status: update.status,
      payload_json: update.payload,
      replay_payload_json: update.replay_payload,
      updated_at: update.updated_at,
    };

    const response = await this.request("PATCH", url, body, { Prefer: "return=representation" });
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    return this.mapStarterBrief(asObject(rows[0]));
  }

  async listVisibleThreads(participantId: string, cycleId: string): Promise<RuntimeThreadRecord[]> {
    const url = this.tableUrl("threads_runtime", {
      select: "*",
      owner_participant_id: `eq.${participantId}`,
      cycle_id: `eq.${cycleId}`,
      order: "created_at.asc",
    });

    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapThread(asObject(row)));
  }

  async listVisibleSources(participantId: string, cycleId: string): Promise<SourceSubmissionRecord[]> {
    const url = this.tableUrl("source_submissions", {
      select: "*",
      participant_id: `eq.${participantId}`,
      cycle_id: `eq.${cycleId}`,
      order: "created_at.asc",
    });

    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapSource(asObject(row)));
  }

  async listSourcesForCycle(cycleId: string): Promise<SourceSubmissionRecord[]> {
    const url = this.tableUrl("source_submissions", {
      select: "*",
      cycle_id: `eq.${cycleId}`,
      order: "created_at.asc",
    });

    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapSource(asObject(row)));
  }

  async listVisibleStarterBriefs(participantId: string, cycleId: string): Promise<StarterBriefRecord[]> {
    const threadRows = await this.listVisibleThreads(participantId, cycleId);
    if (threadRows.length === 0) {
      return [];
    }

    const threadIdSet = new Set(threadRows.map((row) => row.thread_id));
    const url = this.tableUrl("starter_briefs", {
      select: "*",
      cycle_id: `eq.${cycleId}`,
      order: "created_at.asc",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows
      .map((row) => this.mapStarterBrief(asObject(row)))
      .filter((row) => threadIdSet.has(row.thread_id));
  }

  async listStarterBriefsForCycle(cycleId: string): Promise<StarterBriefRecord[]> {
    const url = this.tableUrl("starter_briefs", {
      select: "*",
      cycle_id: `eq.${cycleId}`,
      order: "created_at.asc",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapStarterBrief(asObject(row)));
  }

  async listVisibleLabRecord(cycleId: string): Promise<LabRecordEntry[]> {
    const url = this.tableUrl("lab_record_entries", {
      select: "*",
      cycle_id: `eq.${cycleId}`,
      order: "created_at.asc",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapLabRecord(asObject(row)));
  }

  async listLabRecordForThread(threadId: string, cycleId: string): Promise<LabRecordEntry[]> {
    const url = this.tableUrl("lab_record_entries", {
      select: "*",
      cycle_id: `eq.${cycleId}`,
      thread_id: `eq.${threadId}`,
      order: "version.asc",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapLabRecord(asObject(row)));
  }

  async listSourcesForThread(threadId: string, cycleId: string): Promise<SourceSubmissionRecord[]> {
    const url = this.tableUrl("source_submissions", {
      select: "*",
      cycle_id: `eq.${cycleId}`,
      thread_id: `eq.${threadId}`,
      order: "created_at.asc",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapSource(asObject(row)));
  }

  async listStarterBriefsForThread(threadId: string, cycleId: string): Promise<StarterBriefRecord[]> {
    const url = this.tableUrl("starter_briefs", {
      select: "*",
      cycle_id: `eq.${cycleId}`,
      thread_id: `eq.${threadId}`,
      order: "created_at.asc",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapStarterBrief(asObject(row)));
  }

  async listGuidedRoundsForThread(threadId: string, cycleId: string): Promise<GuidedRoundRecord[]> {
    const url = this.tableUrl("guided_question_rounds", {
      select: "*",
      cycle_id: `eq.${cycleId}`,
      thread_id: `eq.${threadId}`,
      order: "round_number.asc",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapGuidedRound(asObject(row)));
  }

  async listGuidedRoundsForCycle(cycleId: string): Promise<GuidedRoundRecord[]> {
    const url = this.tableUrl("guided_question_rounds", {
      select: "*",
      cycle_id: `eq.${cycleId}`,
      order: "created_at.asc",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapGuidedRound(asObject(row)));
  }

  async createGuidedRound(
    record: Omit<GuidedRoundRecord, "round_id" | "created_at" | "updated_at"> & {
      round_id?: string;
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<GuidedRoundRecord> {
    const url = this.tableUrl("guided_question_rounds", { select: "*" });
    const response = await this.request(
      "POST",
      url,
      {
        round_id: maybeUuid(record.round_id),
        thread_id: record.thread_id,
        organization_id: record.organization_id,
        cycle_id: record.cycle_id,
        root_problem_version_id: record.root_problem_version_id,
        participant_id: maybeUuid(record.participant_id),
        round_number: record.round_number,
        status: record.status,
        summary: record.summary,
        completed_at: record.completed_at,
        created_at: record.created_at,
        updated_at: record.updated_at,
      },
      { Prefer: "return=representation" },
    );
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      throw new Error("createGuidedRound returned no rows");
    }
    return this.mapGuidedRound(asObject(rows[0]));
  }

  async completeGuidedRound(roundId: string, summary: string, completedAt: string, updatedAt: string): Promise<GuidedRoundRecord | null> {
    const url = this.tableUrl("guided_question_rounds", {
      select: "*",
      round_id: `eq.${roundId}`,
    });
    const response = await this.request(
      "PATCH",
      url,
      {
        status: "completed",
        summary,
        completed_at: completedAt,
        updated_at: updatedAt,
      },
      { Prefer: "return=representation" },
    );
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }
    return this.mapGuidedRound(asObject(rows[0]));
  }

  async listGuidedQuestionItems(roundId: string): Promise<GuidedQuestionItemRecord[]> {
    const url = this.tableUrl("guided_question_items", {
      select: "*",
      round_id: `eq.${roundId}`,
      order: "ordinal.asc",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapGuidedQuestionItem(asObject(row)));
  }

  async insertGuidedQuestionItems(
    items: Array<Omit<GuidedQuestionItemRecord, "question_item_id" | "created_at" | "updated_at"> & {
      question_item_id?: string;
      created_at?: string;
      updated_at?: string;
    }>,
  ): Promise<GuidedQuestionItemRecord[]> {
    if (items.length === 0) {
      return [];
    }

    const url = this.tableUrl("guided_question_items", { select: "*" });
    const response = await this.request(
      "POST",
      url,
      items.map((item) => ({
        question_item_id: maybeUuid(item.question_item_id),
        round_id: maybeUuid(item.round_id),
        thread_id: item.thread_id,
        organization_id: item.organization_id,
        cycle_id: item.cycle_id,
        root_problem_version_id: item.root_problem_version_id,
        participant_id: maybeUuid(item.participant_id),
        ordinal: item.ordinal,
        prompt: item.prompt,
        options_json: item.options,
        recommended_option: item.recommended_option,
        selected_option: item.selected_option,
        short_reason: item.short_reason,
        answered_at: item.answered_at,
        created_at: item.created_at,
        updated_at: item.updated_at,
      })),
      { Prefer: "return=representation" },
    );
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapGuidedQuestionItem(asObject(row)));
  }

  async answerGuidedQuestionItem(
    questionItemId: string,
    update: {
      selected_option: GuidedQuestionItemRecord["selected_option"];
      short_reason?: string;
      answered_at: string;
      updated_at?: string;
    },
  ): Promise<GuidedQuestionItemRecord | null> {
    const url = this.tableUrl("guided_question_items", {
      select: "*",
      question_item_id: `eq.${questionItemId}`,
    });
    const response = await this.request(
      "PATCH",
      url,
      {
        selected_option: update.selected_option,
        short_reason: update.short_reason,
        answered_at: update.answered_at,
        updated_at: update.updated_at,
      },
      { Prefer: "return=representation" },
    );
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }
    return this.mapGuidedQuestionItem(asObject(rows[0]));
  }

  async getLabBriefDraftForThread(threadId: string, cycleId: string): Promise<LabBriefDraftRecord | null> {
    const url = this.tableUrl("lab_brief_drafts", {
      select: "*",
      thread_id: `eq.${threadId}`,
      cycle_id: `eq.${cycleId}`,
      limit: "1",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }
    return this.mapLabBriefDraft(asObject(rows[0]));
  }

  async upsertLabBriefDraft(
    record: Omit<LabBriefDraftRecord, "draft_id" | "created_at" | "updated_at"> & {
      draft_id?: string;
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<LabBriefDraftRecord> {
    const url = this.tableUrl("lab_brief_drafts", {
      select: "*",
      on_conflict: "thread_id,cycle_id",
    });
    const response = await this.request(
      "POST",
      url,
      {
        draft_id: maybeUuid(record.draft_id),
        thread_id: record.thread_id,
        organization_id: record.organization_id,
        cycle_id: record.cycle_id,
        root_problem_version_id: record.root_problem_version_id,
        participant_id: maybeUuid(record.participant_id),
        status: record.status,
        content_json: record.content,
        generation_metadata_json: record.generation_metadata,
        created_at: record.created_at,
        updated_at: record.updated_at,
      },
      { Prefer: "resolution=merge-duplicates,return=representation" },
    );
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      throw new Error("upsertLabBriefDraft returned no rows");
    }
    return this.mapLabBriefDraft(asObject(rows[0]));
  }

  async listLabBriefDraftsForCycle(cycleId: string): Promise<LabBriefDraftRecord[]> {
    const url = this.tableUrl("lab_brief_drafts", {
      select: "*",
      cycle_id: `eq.${cycleId}`,
      order: "created_at.asc",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapLabBriefDraft(asObject(row)));
  }

  async listCycleMemberships(organizationId: string, cycleId: string): Promise<CycleMembershipRecord[]> {
    const url = this.tableUrl("cycle_memberships", {
      select: "*",
      organization_id: `eq.${organizationId}`,
      cycle_id: `eq.${cycleId}`,
      order: "updated_at.desc",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapMembership(asObject(row)));
  }

  async listIngestForCycle(organizationId: string, cycleId: string, limit = 200): Promise<IngestRecord[]> {
    const url = this.tableUrl("event_ingest_log", {
      select: "*",
      organization_id: `eq.${organizationId}`,
      cycle_id: `eq.${cycleId}`,
      order: "created_at.desc",
      limit: String(limit),
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapIngest(asObject(row)));
  }

  async listProtectedActionAuditsForCycle(
    organizationId: string,
    cycleId: string,
    limit = 200,
  ): Promise<ProtectedActionAuditRecord[]> {
    const url = this.tableUrl("protected_action_audit", {
      select: "*",
      organization_id: `eq.${organizationId}`,
      cycle_id: `eq.${cycleId}`,
      order: "created_at.desc",
      limit: String(limit),
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapAudit(asObject(row)));
  }

  async publishLabRecordTxn(input: PublishTxnInput): Promise<PublishTxnResult> {
    const rpcUrl = new URL(`${this.rpcBase}/publish_lab_record_txn`);
    const response = await this.request("POST", rpcUrl, {
      p_idempotency_key: input.idempotency_key,
      p_organization_id: input.organization_id,
      p_cycle_id: input.cycle_id,
      p_root_problem_version_id: input.root_problem_version_id,
      p_participant_id: input.participant_id,
      p_role: input.role,
      p_thread_id: input.thread_id,
      p_claim: input.claim,
      p_value: input.value,
      p_difference: input.difference,
      p_explicit_confirmation: input.explicit_confirmation,
      p_content_json: input.content,
    });

    const payload = await this.expectOk(response);
    const row = asObject(payload);

    const result: PublishTxnResult = {
      ok: asBoolean(row.ok),
      reason_code: asString(row.reason_code) as PublishTxnResult["reason_code"],
      replayed: asBoolean(row.replayed),
      credit_delta: typeof row.credit_delta === "number" ? row.credit_delta : undefined,
      credit_balance_after: typeof row.credit_balance_after === "number" ? row.credit_balance_after : undefined,
    };

    if (row.lab_record_id) {
      result.lab_record = {
        lab_record_id: asString(row.lab_record_id),
        organization_id: asString(row.organization_id),
        cycle_id: asString(row.cycle_id),
        root_problem_version_id: asString(row.root_problem_version_id),
        thread_id: asString(row.thread_id),
        participant_id: asString(row.participant_id),
        version: asNumber(row.version),
        content: asObject(row.content_json),
        created_at: asString(row.created_at),
      };
    }

    return result;
  }

  async getProgramCycle(organizationId: string, cycleId: string): Promise<ProgramCycleRecord | null> {
    const url = this.tableUrl("program_cycles", {
      select: "*",
      organization_id: `eq.${organizationId}`,
      cycle_id: `eq.${cycleId}`,
      limit: "1",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    return this.mapCycle(asObject(rows[0]));
  }

  async getActiveProgramCycle(organizationId: string): Promise<ProgramCycleRecord | null> {
    const url = this.tableUrl("program_cycles", {
      select: "*",
      organization_id: `eq.${organizationId}`,
      state: "eq.active",
      limit: "1",
      order: "updated_at.desc",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    return this.mapCycle(asObject(rows[0]));
  }

  async upsertProgramCycle(
    record: Omit<ProgramCycleRecord, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string },
  ): Promise<ProgramCycleRecord> {
    const url = this.tableUrl("program_cycles", {
      select: "*",
      on_conflict: "organization_id,cycle_id",
    });

    const body = {
      organization_id: record.organization_id,
      cycle_id: record.cycle_id,
      root_problem_version_id: record.root_problem_version_id,
      state: record.state,
      focus_snapshot: record.focus_snapshot,
      program_label: record.program_label,
      created_by: record.created_by,
      created_reason: record.created_reason,
      activated_at: record.activated_at,
      locked_at: record.locked_at,
      archived_at: record.archived_at,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };

    const response = await this.request("POST", url, body, {
      Prefer: "resolution=merge-duplicates,return=representation",
    });
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      throw new Error("upsertProgramCycle returned no rows");
    }

    return this.mapCycle(asObject(rows[0]));
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
    const url = this.tableUrl("program_cycles", {
      select: "*",
      organization_id: `eq.${organizationId}`,
      cycle_id: `eq.${cycleId}`,
    });

    const response = await this.request(
      "PATCH",
      url,
      {
        state,
        activated_at: update.activated_at,
        locked_at: update.locked_at,
        archived_at: update.archived_at,
        updated_at: update.updated_at,
      },
      { Prefer: "return=representation" },
    );
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    return this.mapCycle(asObject(rows[0]));
  }

  async insertCycleSnapshot(
    record: Omit<CycleSnapshotRecord, "snapshot_id" | "created_at" | "updated_at"> & {
      snapshot_id?: string;
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<CycleSnapshotRecord> {
    const url = this.tableUrl("cycle_snapshots", { select: "*" });
    const response = await this.request(
      "POST",
      url,
      {
        snapshot_id: maybeUuid(record.snapshot_id),
        organization_id: record.organization_id,
        cycle_id: record.cycle_id,
        snapshot_state: record.snapshot_state,
        requested_by: record.requested_by,
        reason: record.reason,
        manifest_json: record.manifest ?? {},
        created_at: record.created_at,
        updated_at: record.updated_at,
        completed_at: record.completed_at,
      },
      { Prefer: "return=representation" },
    );
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      throw new Error("insertCycleSnapshot returned no rows");
    }

    return this.mapSnapshot(asObject(rows[0]));
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
    const url = this.tableUrl("cycle_snapshots", {
      select: "*",
      snapshot_id: `eq.${snapshotId}`,
    });

    const response = await this.request(
      "PATCH",
      url,
      {
        snapshot_state: update.snapshot_state,
        manifest_json: update.manifest,
        completed_at: update.completed_at,
        updated_at: update.updated_at,
      },
      { Prefer: "return=representation" },
    );
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      return null;
    }

    return this.mapSnapshot(asObject(rows[0]));
  }

  async listCycleSnapshots(organizationId: string, cycleId: string): Promise<CycleSnapshotRecord[]> {
    const url = this.tableUrl("cycle_snapshots", {
      select: "*",
      organization_id: `eq.${organizationId}`,
      cycle_id: `eq.${cycleId}`,
      order: "created_at.asc",
    });
    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapSnapshot(asObject(row)));
  }

  async insertCycleSnapshotArtifact(
    record: Omit<CycleSnapshotArtifactRecord, "artifact_id" | "created_at"> & { artifact_id?: string; created_at?: string },
  ): Promise<CycleSnapshotArtifactRecord> {
    const url = this.tableUrl("cycle_snapshot_artifacts", { select: "*" });
    const response = await this.request(
      "POST",
      url,
      {
        artifact_id: maybeUuid(record.artifact_id),
        snapshot_id: maybeUuid(record.snapshot_id),
        artifact_name: record.artifact_name,
        artifact_kind: record.artifact_kind,
        storage_pointer: record.storage_pointer,
        checksum_sha256: record.checksum_sha256,
        created_at: record.created_at,
      },
      { Prefer: "return=representation" },
    );
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    if (rows.length === 0) {
      throw new Error("insertCycleSnapshotArtifact returned no rows");
    }

    return this.mapArtifact(asObject(rows[0]));
  }

  async listCycleSnapshotArtifacts(snapshotId: string): Promise<CycleSnapshotArtifactRecord[]> {
    const url = this.tableUrl("cycle_snapshot_artifacts", {
      select: "*",
      snapshot_id: `eq.${snapshotId}`,
      order: "created_at.asc",
    });

    const response = await this.request("GET", url);
    const payload = await this.expectOk(response);
    const rows = Array.isArray(payload) ? payload : [];
    return rows.map((row) => this.mapArtifact(asObject(row)));
  }
}
