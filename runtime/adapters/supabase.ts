import type { IngestRecord, ProtectedActionAuditRecord } from "../core/types.js";
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
  created_at: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function mapIngestRow(row: SupabaseIngestRow): IngestRecord {
  return {
    event_id: row.event_id,
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
        created_at: record.created_at,
      },
    });

    const row = rows[0];
    if (!row) {
      throw new Error("Supabase insert did not return protected_action_audit row");
    }

    return mapAuditRow(row);
  }
}
