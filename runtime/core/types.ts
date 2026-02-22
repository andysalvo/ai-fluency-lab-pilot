export type IngestState = "received" | "validated" | "processed" | "failed" | "duplicate";

export type TriggerType = "local_commit" | "unsupported";

export type ProgramCycleState = "draft" | "active" | "locked" | "archived";

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

export type GlobalRole = "member" | "operator" | "admin";

export type ParticipantGlobalState = "active" | "blocked";

export type MembershipState = "invited" | "active" | "inactive" | "revoked";
export type QuestionRoundStatus = "active" | "completed" | "maxed_out";

export interface ProgramContext {
  organization_id: string;
  cycle_id: string;
  root_problem_version_id: string;
}

export interface NotionLikeWebhookPayload {
  source_table: string;
  source_record_id: string;
  event_type: string;
  occurred_at: string;
  idempotency_key: string;
  cycle_id: string;
  actor_email?: string;
  signature?: string;
  organization_id?: string;
  root_problem_version_id?: string;
  url?: string;
  source_url?: string;
  relevance_note?: string;
  submitted_by?: string;
  role?: string;
  membership_state?: string;
  credits?: number;
  properties?: Record<string, unknown>;
  source_excerpt?: string;
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
  cycle_id?: string;
  root_problem_version_id?: string;
  replay_payload?: Record<string, unknown>;
}

export interface ProtectedActionAuditRecord extends ProgramContext {
  audit_id: string;
  action: ProtectedAction;
  participant_id?: string;
  actor_email?: string;
  membership_state: MembershipState;
  global_state: ParticipantGlobalState;
  role: ParticipantRole;
  allowed: boolean;
  reason_code: string;
  thread_id?: string;
  client_request_id?: string;
  why?: string;
  linked_event_id?: string;
  linked_idempotency_key?: string;
  created_at: string;
}

export interface PublishActionInput {
  thread_id: string;
  actor_email?: string;
  cycle_id?: string;
  claim?: boolean;
  value?: boolean;
  difference?: boolean;
  explicit_confirmation?: boolean;
  content?: Record<string, unknown>;
  why?: string;
  client_request_id?: string;
  linked_event_id?: string;
  linked_idempotency_key?: string;
  organization_id?: string;
  root_problem_version_id?: string;
}

export type PublishReasonCode =
  | "IDENTITY_UNRESOLVED"
  | "GLOBAL_STATE_BLOCKED"
  | "CYCLE_NOT_SELECTED"
  | "NO_MEMBERSHIP_FOR_CYCLE"
  | "CROSS_CYCLE_ACCESS_DENIED"
  | "CYCLE_LOCKED"
  | "CYCLE_ARCHIVED"
  | "HALTED_GLOBAL"
  | "HALTED_CYCLE"
  | "ROLE_DENY"
  | "QUESTIONS_ROUND_LIMIT_REACHED"
  | "QUESTIONS_ROUND_INCOMPLETE"
  | "LAB_BRIEF_DRAFT_NOT_READY"
  | "THREAD_NOT_FOUND"
  | "THREAD_CYCLE_MISMATCH"
  | "CREDIT_INSUFFICIENT"
  | "INSUFFICIENT_CRITERIA"
  | "NEEDS_CONFIRMATION"
  | "PUBLISH_FAILED"
  | "OK";

export interface PublishActionResponse {
  allowed: boolean;
  reason_code: PublishReasonCode;
  audit_id: string;
  thread_id: string;
  lab_record_id?: string;
  version?: number;
  credit_delta?: number;
  credit_balance_after?: number;
  replayed?: boolean;
  policy_snapshot: {
    membership_state: MembershipState;
    role: ParticipantRole;
    global_state: ParticipantGlobalState;
  };
  organization_id: string;
  cycle_id: string;
  root_problem_version_id: string;
}

export interface ProgramCycleRecord extends ProgramContext {
  state: ProgramCycleState;
  focus_snapshot: string;
  program_label: string;
  created_by?: string;
  created_reason?: string;
  activated_at?: string;
  locked_at?: string;
  archived_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CycleSnapshotRecord {
  snapshot_id: string;
  organization_id: string;
  cycle_id: string;
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
  client_request_id?: string;
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

export interface GenerationMetadata {
  golden_example_id: string;
  prompt_contract_version: string;
  model_name: string;
}

export interface InitialThreadDraftContent extends GenerationMetadata {
  source_takeaway: string;
  student_note_takeaway: string;
  combined_insight: string;
  tension_or_assumption: string;
  next_best_move: string;
  provenance: string;
}

export interface LabBriefContent {
  what_it_is: string;
  why_it_matters: string;
  evidence: string;
  next_step: string;
  confidence?: string;
}

export interface LabBriefGenerationContent extends LabBriefContent, GenerationMetadata {}

export type PlannerProvider = "deterministic" | "kimi";
export type PlannerRunStatus = "success" | "fallback";
export type PlannerFallbackReason = "TIMEOUT" | "RATE_LIMIT" | "SCHEMA" | "CAPACITY";

export interface PlannerRunMetadata {
  provider: PlannerProvider;
  model_name: string;
  status: PlannerRunStatus;
  prompt_contract_version: string;
  latency_ms: number;
  estimated_cost_usd?: number;
  fallback_reason?: PlannerFallbackReason;
}

export interface SourceSubmitResponse extends ProgramContext {
  ok: boolean;
  reason_code: string;
  message: string;
  event_id?: string;
  ingest_state?: IngestState;
  starter_brief_id?: string;
  source_submission_id?: string;
  thread_id?: string;
  starter_brief_status?: string;
  possible_duplicate?: boolean;
  notion_record_id?: string;
  replayed?: boolean;
}

export interface ThreadWorkspaceResponse extends ProgramContext {
  ok: boolean;
  reason_code: string;
  thread_id: string;
  source?: SourceSubmissionRecord;
  starter_brief?: StarterBriefRecord;
  rounds?: GuidedRoundRecord[];
  question_items?: GuidedQuestionItemRecord[];
  lab_brief_draft?: LabBriefDraftRecord | null;
  readiness?: ReadinessEvaluateResponse;
  publish_state: "not_ready" | "ready_pending_confirmation" | "published";
  current_stage?: "source_ready" | "draft_ready" | "round_in_progress" | "round_complete" | "brief_ready" | "ready_to_publish" | "published";
  primary_action_label?: string;
  progress_label?: string;
  next_question?: Pick<GuidedQuestionItemRecord, "question_item_id" | "ordinal" | "prompt" | "options">;
  next_best_action: string;
}

export type CardStatusChip = "ready" | "needs_refinement" | "blocked" | "info";

export interface CardDetailItem {
  key: string;
  value: string;
}

export interface CardViewModel {
  id: string;
  title: string;
  status_chip: CardStatusChip;
  body_blocks: string[];
  bullets?: string[];
  details?: CardDetailItem[];
}

export interface CardStackViewModel {
  status_chip: CardStatusChip;
  status_label: string;
  next_best_action: string;
  cards: CardViewModel[];
}

export interface OperatorSummaryResponse extends ProgramContext {
  ok: boolean;
  reason_code: string;
  cycle_state?: ProgramCycleState;
  active_members_count?: number;
  invited_members_count?: number;
  ingest_counts?: Record<string, number>;
  publish_attempts_total?: number;
  publish_success_total?: number;
  blocked_reason_counts?: Record<string, number>;
  sources_submitted_total?: number;
  starter_drafts_ready_total?: number;
  rounds_completed_total?: number;
  lab_brief_drafts_total?: number;
  planner_runs_total?: number;
  planner_fallback_total?: number;
  planner_rate_limited_total?: number;
  planner_avg_latency_ms?: number;
  planner_estimated_cost_usd?: number;
  planner_provider_counts?: Record<string, number>;
  telemetry_write_failed_count?: number;
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

export interface ParticipantRecord {
  participant_id: string;
  email_canonical: string;
  global_state: ParticipantGlobalState;
  global_role: GlobalRole;
  created_at: string;
  last_login_at?: string;
}

export interface CycleMembershipRecord {
  participant_id: string;
  organization_id: string;
  cycle_id: string;
  role: ParticipantRole;
  membership_state: MembershipState;
  credits: number;
  joined_at: string;
  updated_at: string;
}

export interface SessionContextRecord {
  participant_id: string;
  active_cycle_id: string;
  updated_at: string;
}

export interface RuntimeControlRecord {
  active_ingress_mode: "supabase_edge" | "vercel_fallback";
  global_protected_actions_halt: boolean;
  halt_reason?: string;
  updated_at: string;
}

export interface CycleControlRecord {
  organization_id: string;
  cycle_id: string;
  protected_actions_halt: boolean;
  halt_reason?: string;
  updated_at: string;
}

export interface RuntimeThreadRecord extends ProgramContext {
  thread_id: string;
  owner_participant_id: string;
  status: "processing" | "ready" | "published";
  created_at: string;
  updated_at: string;
}

export interface SourceSubmissionRecord extends ProgramContext {
  source_submission_id: string;
  thread_id: string;
  participant_id: string;
  raw_url: string;
  canonical_url: string;
  canonical_url_hash: string;
  canonicalizer_version: number;
  relevance_note: string;
  possible_duplicate: boolean;
  created_at: string;
}

export interface StarterBriefRecord extends ProgramContext {
  starter_brief_id: string;
  source_submission_id: string;
  thread_id: string;
  status: "processing" | "ready" | "failed_fetch" | "failed_generation";
  payload: Record<string, unknown>;
  replay_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface GuidedQuestionOption {
  code: "A" | "B" | "C" | "D";
  text: string;
}

export interface GuidedRoundRecord extends ProgramContext {
  round_id: string;
  thread_id: string;
  participant_id: string;
  round_number: number;
  status: QuestionRoundStatus;
  summary?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface GuidedQuestionItemRecord extends ProgramContext {
  question_item_id: string;
  round_id: string;
  thread_id: string;
  participant_id: string;
  ordinal: number;
  prompt: string;
  options: GuidedQuestionOption[];
  recommended_option: "A" | "B" | "C" | "D";
  selected_option?: "A" | "B" | "C" | "D";
  short_reason?: string;
  answered_at?: string;
  created_at: string;
  updated_at: string;
}

export interface LabRecordEntry extends ProgramContext {
  lab_record_id: string;
  thread_id: string;
  participant_id: string;
  version: number;
  content: Record<string, unknown>;
  created_at: string;
}

export interface LabBriefDraftRecord extends ProgramContext {
  draft_id: string;
  thread_id: string;
  participant_id: string;
  status: "draft" | "ready";
  content: Record<string, unknown>;
  generation_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ModelRunRecord extends ProgramContext {
  run_id: string;
  thread_id?: string;
  participant_id?: string;
  action_type: "guided_round" | "lab_brief_proposal";
  provider: PlannerProvider;
  model_name: string;
  status: PlannerRunStatus;
  prompt_contract_version: string;
  latency_ms: number;
  estimated_cost_usd?: number;
  fallback_reason?: PlannerFallbackReason;
  created_at: string;
}

export interface PublishTxnInput extends ProgramContext {
  idempotency_key: string;
  participant_id: string;
  role: ParticipantRole;
  thread_id: string;
  claim: boolean;
  value: boolean;
  difference: boolean;
  explicit_confirmation: boolean;
  content: Record<string, unknown>;
}

export interface PublishTxnResult {
  ok: boolean;
  reason_code: PublishReasonCode;
  replayed: boolean;
  lab_record?: LabRecordEntry;
  credit_balance_after?: number;
  credit_delta?: number;
}
