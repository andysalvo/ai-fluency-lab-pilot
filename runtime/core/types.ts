export type IngestState = "received" | "validated" | "processed" | "failed" | "duplicate";

export type TriggerType = "local_commit" | "unsupported";

export type ProtectedAction =
  | "run_local"
  | "run_system"
  | "compare"
  | "publish"
  | "credit_adjust"
  | "scope_grant"
  | "admin_override";

export type ParticipantRole = "student" | "moderator" | "facilitator" | "operator";

export type AllowlistState = "allowlisted" | "active" | "suspended" | "revoked";

export interface NotionLikeWebhookPayload {
  source_table: string;
  source_record_id: string;
  event_type: string;
  occurred_at: string;
  idempotency_key: string;
  signature?: string;
}

export interface IngestRecord {
  event_id: string;
  source_table: string;
  source_record_id: string;
  event_type: string;
  idempotency_key: string;
  ingest_state: IngestState;
  error_code?: string;
  created_at: string;
  processed_at?: string;
  details?: Record<string, unknown>;
}

export interface IngestResponse {
  ok: boolean;
  event_id?: string;
  ingest_state: IngestState;
  trigger_type: TriggerType;
  result_code: string;
  message: string;
}

export interface ProtectedActionAuditRecord {
  audit_id: string;
  action: ProtectedAction;
  actor_email?: string;
  allowlist_state: AllowlistState;
  role: ParticipantRole;
  allowed: boolean;
  reason_code: string;
  thread_id?: string;
  why?: string;
  linked_event_id?: string;
  linked_idempotency_key?: string;
  created_at: string;
}

export interface PublishActionInput {
  thread_id: string;
  actor_email?: string;
  allowlist_state?: AllowlistState;
  role?: ParticipantRole;
  why?: string;
  linked_event_id?: string;
  linked_idempotency_key?: string;
}

export type PublishReasonCode = "IDENTITY_UNRESOLVED" | "ALLOWLIST_DENY" | "ROLE_DENY" | "OK_STUB";

export interface PublishActionResponse {
  allowed: boolean;
  reason_code: PublishReasonCode;
  audit_id: string;
  thread_id: string;
  policy_snapshot: {
    allowlist_state: AllowlistState;
    role: ParticipantRole;
  };
}
