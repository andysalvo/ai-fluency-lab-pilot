import type { RuntimeConfig } from "../adapters/env.js";
import type { PersistenceAdapter } from "../adapters/persistence.js";
import { resolveProgramContext } from "./program-context.js";
import type {
  AllowlistState,
  ParticipantRole,
  PublishActionInput,
  PublishActionResponse,
  PublishReasonCode,
  ProtectedAction,
} from "./types.js";

const ALLOWED_ROLES_BY_ACTION: Record<ProtectedAction, ParticipantRole[]> = {
  run_local: ["student", "moderator", "facilitator", "operator"],
  run_system: ["moderator", "facilitator", "operator"],
  compare: ["student", "moderator", "facilitator", "operator"],
  publish: ["moderator", "facilitator", "operator"],
  credit_adjust: ["operator"],
  scope_grant: ["facilitator", "operator"],
  admin_override: ["facilitator", "operator"],
};

export type GuardReasonCode = "IDENTITY_UNRESOLVED" | "ALLOWLIST_DENY" | "ROLE_DENY" | "OK";

export interface GuardInput {
  actor_email?: string;
  allowlist_state?: AllowlistState;
  role?: ParticipantRole;
  why?: string;
  thread_id?: string;
  linked_event_id?: string;
  linked_idempotency_key?: string;
  organization_id?: string;
  program_cycle_id?: string;
  root_problem_version_id?: string;
}

export interface GuardDecision {
  allowed: boolean;
  reason_code: GuardReasonCode;
  actor_email?: string;
  allowlist_state: AllowlistState;
  role: ParticipantRole;
}

export interface GuardAuditResult {
  decision: GuardDecision;
  audit_id: string;
}

function normalizeAllowlistState(value: string | undefined, fallback: AllowlistState): AllowlistState {
  if (value === "allowlisted" || value === "active" || value === "suspended" || value === "revoked") {
    return value;
  }

  return fallback;
}

function normalizeRole(value: string | undefined, fallback: ParticipantRole): ParticipantRole {
  if (value === "student" || value === "moderator" || value === "facilitator" || value === "operator") {
    return value;
  }

  return fallback;
}

function allowlistGrantsAccess(state: AllowlistState): boolean {
  return state === "allowlisted" || state === "active";
}

function evaluateGuard(action: ProtectedAction, input: GuardInput, config: RuntimeConfig): GuardDecision {
  const actorEmail = input.actor_email?.trim();
  const allowlistState = normalizeAllowlistState(input.allowlist_state, config.stub_allowlist_state);
  const role = normalizeRole(input.role, config.stub_role);
  const allowedRoles = ALLOWED_ROLES_BY_ACTION[action];

  if (!actorEmail) {
    return {
      allowed: false,
      reason_code: "IDENTITY_UNRESOLVED",
      actor_email: actorEmail,
      allowlist_state: allowlistState,
      role,
    };
  }

  if (!allowlistGrantsAccess(allowlistState)) {
    return {
      allowed: false,
      reason_code: "ALLOWLIST_DENY",
      actor_email: actorEmail,
      allowlist_state: allowlistState,
      role,
    };
  }

  if (!allowedRoles.includes(role)) {
    return {
      allowed: false,
      reason_code: "ROLE_DENY",
      actor_email: actorEmail,
      allowlist_state: allowlistState,
      role,
    };
  }

  return {
    allowed: true,
    reason_code: "OK",
    actor_email: actorEmail,
    allowlist_state: allowlistState,
    role,
  };
}

export interface GuardDeps {
  persistence: PersistenceAdapter;
  config: RuntimeConfig;
  now?: () => string;
}

export async function guardAndAuditAction(
  action: ProtectedAction,
  input: GuardInput,
  deps: GuardDeps,
): Promise<GuardAuditResult> {
  const now = deps.now ?? (() => new Date().toISOString());
  const decision = evaluateGuard(action, input, deps.config);
  const programContext = resolveProgramContext(input, deps.config);

  const audit = await deps.persistence.insertProtectedActionAudit({
    action,
    actor_email: decision.actor_email,
    allowlist_state: decision.allowlist_state,
    role: decision.role,
    allowed: decision.allowed,
    reason_code: decision.reason_code,
    thread_id: input.thread_id,
    why: input.why,
    linked_event_id: input.linked_event_id,
    linked_idempotency_key: input.linked_idempotency_key,
    organization_id: programContext.organization_id,
    program_cycle_id: programContext.program_cycle_id,
    root_problem_version_id: programContext.root_problem_version_id,
    created_at: now(),
  });

  return {
    decision,
    audit_id: audit.audit_id,
  };
}

export async function executePublishStub(input: PublishActionInput, deps: GuardDeps): Promise<PublishActionResponse> {
  const programContext = resolveProgramContext(input, deps.config);
  const guard = await guardAndAuditAction(
    "publish",
    {
      ...input,
      organization_id: programContext.organization_id,
      program_cycle_id: programContext.program_cycle_id,
      root_problem_version_id: programContext.root_problem_version_id,
    },
    deps,
  );

  let reasonCode: PublishReasonCode;
  if (guard.decision.allowed) {
    reasonCode = "OK_STUB";
  } else if (
    guard.decision.reason_code === "IDENTITY_UNRESOLVED" ||
    guard.decision.reason_code === "ALLOWLIST_DENY" ||
    guard.decision.reason_code === "ROLE_DENY"
  ) {
    reasonCode = guard.decision.reason_code;
  } else {
    reasonCode = "ROLE_DENY";
  }

  return {
    allowed: guard.decision.allowed,
    reason_code: reasonCode,
    audit_id: guard.audit_id,
    thread_id: input.thread_id,
    policy_snapshot: {
      allowlist_state: guard.decision.allowlist_state,
      role: guard.decision.role,
    },
    organization_id: programContext.organization_id,
    program_cycle_id: programContext.program_cycle_id,
    root_problem_version_id: programContext.root_problem_version_id,
  };
}
