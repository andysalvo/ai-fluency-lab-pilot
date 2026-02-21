export type IngestState = "received" | "validated" | "processed" | "failed" | "duplicate";

export type TriggerType = "local_commit" | "unsupported";

export type ProgramCycleState = "draft" | "active" | "frozen" | "archived";

export type SnapshotState = "started" | "completed" | "failed" | "verified";

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

export interface ProgramContext {
  organization_id: string;
  program_cycle_id: string;
  root_problem_version_id: string;
}

export interface NotionLikeWebhookPayload {
  source_table: string;
  source_record_id: string;
  event_type: string;
  occurred_at: string;
  idempotency_key: string;
  signature?: string;
  organization_id?: string;
  program_cycle_id?: string;
  root_problem_version_id?: string;
}

export interface IngestRecord extends ProgramContext {
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
  organization_id?: string;
  program_cycle_id?: string;
  root_problem_version_id?: string;
}

export interface ProtectedActionAuditRecord extends ProgramContext {
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
  organization_id?: string;
  program_cycle_id?: string;
  root_problem_version_id?: string;
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
  organization_id: string;
  program_cycle_id: string;
  root_problem_version_id: string;
}

export interface ProgramCycleRecord extends ProgramContext {
  state: ProgramCycleState;
  program_label: string;
  created_by?: string;
  created_reason?: string;
  activated_at?: string;
  frozen_at?: string;
  archived_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CycleSnapshotRecord {
  snapshot_id: string;
  organization_id: string;
  program_cycle_id: string;
  snapshot_state: SnapshotState;
  requested_by?: string;
  reason?: string;
  manifest?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface CycleSnapshotArtifactRecord {
  artifact_id: string;
  snapshot_id: string;
  artifact_name: string;
  artifact_kind: "db_export" | "notion_export" | "config_manifest" | "evidence_index" | "embed_bundle";
  storage_pointer: string;
  checksum_sha256: string;
  created_at: string;
}

export interface ReadinessEvaluateInput extends ProgramContext {
  thread_id: string;
  actor_email?: string;
  claim: boolean;
  value: boolean;
  difference: boolean;
  explicit_confirmation: boolean;
}

export type ReadinessReasonCode =
  | "READY"
  | "NEEDS_CONFIRMATION"
  | "INSUFFICIENT_CRITERIA"
  | "INSUFFICIENT_CRITERIA_AND_CONFIRMATION";

export interface ReadinessEvaluateResponse extends ProgramContext {
  ready_to_publish: boolean;
  score: number;
  passed_criteria: Array<"claim" | "value" | "difference">;
  missing_criteria: Array<"claim" | "value" | "difference">;
  explicit_confirmation: boolean;
  reason_code: ReadinessReasonCode;
}

export interface CycleAdminActionResponse extends ProgramContext {
  ok: boolean;
  action: "create" | "activate" | "freeze" | "snapshot" | "export" | "reset-next";
  result_code: string;
  message: string;
  cycle?: ProgramCycleRecord;
  snapshot?: CycleSnapshotRecord;
  artifacts?: CycleSnapshotArtifactRecord[];
  previous_cycle_id?: string;
}
