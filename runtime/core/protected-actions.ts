import type { RuntimeConfig } from "../adapters/env.js";
import type { PersistenceAdapter } from "../adapters/persistence.js";
import { computeProtectedActionIdempotencyKey } from "./idempotency.js";
import { resolveProgramContext } from "./program-context.js";
import type {
  MembershipState,
  ParticipantGlobalState,
  ParticipantRole,
  ProtectedAction,
  PublishActionInput,
  PublishActionResponse,
  PublishReasonCode,
} from "./types.js";

const ALLOWED_ROLES_BY_ACTION: Record<ProtectedAction, ParticipantRole[]> = {
  run_local: ["student", "moderator", "facilitator", "operator"],
  run_system: ["moderator", "facilitator", "operator"],
  compare: ["student", "moderator", "facilitator", "operator"],
  publish: ["student", "moderator", "facilitator", "operator"],
  credit_adjust: ["operator"],
  scope_grant: ["facilitator", "operator"],
  admin_override: ["facilitator", "operator"],
};

export type GuardReasonCode =
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
  | "OK";

export interface GuardInput {
  actor_email?: string;
  cycle_id?: string;
  thread_id?: string;
  why?: string;
  client_request_id?: string;
  linked_event_id?: string;
  linked_idempotency_key?: string;
  organization_id?: string;
  root_problem_version_id?: string;
}

export interface GuardDecision {
  allowed: boolean;
  reason_code: GuardReasonCode;
  actor_email?: string;
  participant_id?: string;
  membership_state: MembershipState;
  role: ParticipantRole;
  global_state: ParticipantGlobalState;
}

export interface GuardAuditResult {
  decision: GuardDecision;
  audit_id: string;
}

function canonicalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function asRoleWithGlobalOverride(role: ParticipantRole, globalRole: "member" | "operator" | "admin"): ParticipantRole {
  if (globalRole === "operator" || globalRole === "admin") {
    return "operator";
  }

  return role;
}

function mapMembershipStateToGrant(membershipState: MembershipState): boolean {
  return membershipState === "active";
}

export interface GuardDeps {
  persistence: PersistenceAdapter;
  config: RuntimeConfig;
  now?: () => string;
}

async function evaluateGuard(action: ProtectedAction, input: GuardInput, deps: GuardDeps): Promise<GuardDecision> {
  const actorEmail = input.actor_email?.trim();
  const context = resolveProgramContext(
    {
      organization_id: input.organization_id,
      cycle_id: input.cycle_id,
      root_problem_version_id: input.root_problem_version_id,
    },
    deps.config,
  );
  const cycleId = input.cycle_id?.trim();

  if (!actorEmail) {
    return {
      allowed: false,
      reason_code: "IDENTITY_UNRESOLVED",
      actor_email: actorEmail,
      membership_state: "inactive",
      role: deps.config.stub_role,
      global_state: "active",
    };
  }

  if (!cycleId) {
    return {
      allowed: false,
      reason_code: "CYCLE_NOT_SELECTED",
      actor_email: actorEmail,
      membership_state: "inactive",
      role: deps.config.stub_role,
      global_state: "active",
    };
  }

  const runtimeControl = await deps.persistence.getRuntimeControl();
  if (runtimeControl.global_protected_actions_halt) {
    return {
      allowed: false,
      reason_code: "HALTED_GLOBAL",
      actor_email: actorEmail,
      membership_state: "inactive",
      role: deps.config.stub_role,
      global_state: "active",
    };
  }

  const cycleControl = await deps.persistence.getCycleControl(context.organization_id, cycleId);
  if (cycleControl?.protected_actions_halt) {
    return {
      allowed: false,
      reason_code: "HALTED_CYCLE",
      actor_email: actorEmail,
      membership_state: "inactive",
      role: deps.config.stub_role,
      global_state: "active",
    };
  }

  const participant = await deps.persistence.getParticipantByEmailCanonical(canonicalizeEmail(actorEmail));
  if (!participant) {
    return {
      allowed: false,
      reason_code: "NO_MEMBERSHIP_FOR_CYCLE",
      actor_email: actorEmail,
      membership_state: "inactive",
      role: deps.config.stub_role,
      global_state: "active",
    };
  }

  if (participant.global_state !== "active") {
    return {
      allowed: false,
      reason_code: "GLOBAL_STATE_BLOCKED",
      actor_email: actorEmail,
      participant_id: participant.participant_id,
      membership_state: "inactive",
      role: deps.config.stub_role,
      global_state: participant.global_state,
    };
  }

  if (action === "admin_override" && (participant.global_role === "operator" || participant.global_role === "admin")) {
    return {
      allowed: true,
      reason_code: "OK",
      actor_email: actorEmail,
      participant_id: participant.participant_id,
      membership_state: "active",
      role: "operator",
      global_state: participant.global_state,
    };
  }

  const membership = await deps.persistence.getCycleMembership(participant.participant_id, context.organization_id, cycleId);
  if (!membership || !mapMembershipStateToGrant(membership.membership_state)) {
    return {
      allowed: false,
      reason_code: "NO_MEMBERSHIP_FOR_CYCLE",
      actor_email: actorEmail,
      participant_id: participant.participant_id,
      membership_state: membership?.membership_state ?? "inactive",
      role: membership?.role ?? deps.config.stub_role,
      global_state: participant.global_state,
    };
  }

  const cycle = await deps.persistence.getProgramCycle(context.organization_id, cycleId);
  if (!cycle) {
    return {
      allowed: false,
      reason_code: "NO_MEMBERSHIP_FOR_CYCLE",
      actor_email: actorEmail,
      participant_id: participant.participant_id,
      membership_state: membership.membership_state,
      role: membership.role,
      global_state: participant.global_state,
    };
  }

  if (cycle.state === "archived" && participant.global_role !== "operator" && participant.global_role !== "admin") {
    return {
      allowed: false,
      reason_code: "CYCLE_ARCHIVED",
      actor_email: actorEmail,
      participant_id: participant.participant_id,
      membership_state: membership.membership_state,
      role: membership.role,
      global_state: participant.global_state,
    };
  }

  if (cycle.state === "locked") {
    return {
      allowed: false,
      reason_code: "CYCLE_LOCKED",
      actor_email: actorEmail,
      participant_id: participant.participant_id,
      membership_state: membership.membership_state,
      role: membership.role,
      global_state: participant.global_state,
    };
  }

  const effectiveRole = asRoleWithGlobalOverride(membership.role, participant.global_role);
  if (!ALLOWED_ROLES_BY_ACTION[action].includes(effectiveRole)) {
    return {
      allowed: false,
      reason_code: "ROLE_DENY",
      actor_email: actorEmail,
      participant_id: participant.participant_id,
      membership_state: membership.membership_state,
      role: effectiveRole,
      global_state: participant.global_state,
    };
  }

  if (input.thread_id) {
    const thread = await deps.persistence.getThreadById(input.thread_id);
    if (!thread || thread.cycle_id !== cycleId) {
      return {
        allowed: false,
        reason_code: "CROSS_CYCLE_ACCESS_DENIED",
        actor_email: actorEmail,
        participant_id: participant.participant_id,
        membership_state: membership.membership_state,
        role: effectiveRole,
        global_state: participant.global_state,
      };
    }

    if (action === "publish" && effectiveRole === "student" && thread.owner_participant_id !== participant.participant_id) {
      return {
        allowed: false,
        reason_code: "ROLE_DENY",
        actor_email: actorEmail,
        participant_id: participant.participant_id,
        membership_state: membership.membership_state,
        role: effectiveRole,
        global_state: participant.global_state,
      };
    }
  }

  return {
    allowed: true,
    reason_code: "OK",
    actor_email: actorEmail,
    participant_id: participant.participant_id,
    membership_state: membership.membership_state,
    role: effectiveRole,
    global_state: participant.global_state,
  };
}

export async function guardAndAuditAction(
  action: ProtectedAction,
  input: GuardInput,
  deps: GuardDeps,
): Promise<GuardAuditResult> {
  const now = deps.now ?? (() => new Date().toISOString());
  const decision = await evaluateGuard(action, input, deps);
  const context = resolveProgramContext(
    {
      organization_id: input.organization_id,
      cycle_id: input.cycle_id,
      root_problem_version_id: input.root_problem_version_id,
    },
    deps.config,
  );

  const audit = await deps.persistence.insertProtectedActionAudit({
    action,
    participant_id: decision.participant_id,
    actor_email: decision.actor_email,
    membership_state: decision.membership_state,
    global_state: decision.global_state,
    role: decision.role,
    allowed: decision.allowed,
    reason_code: decision.reason_code,
    thread_id: input.thread_id,
    client_request_id: input.client_request_id,
    why: input.why,
    linked_event_id: input.linked_event_id,
    linked_idempotency_key: input.linked_idempotency_key,
    organization_id: context.organization_id,
    cycle_id: context.cycle_id,
    root_problem_version_id: context.root_problem_version_id,
    created_at: now(),
  });

  return {
    decision,
    audit_id: audit.audit_id,
  };
}

export async function executePublishAction(input: PublishActionInput, deps: GuardDeps): Promise<PublishActionResponse> {
  const context = resolveProgramContext(
    {
      organization_id: input.organization_id,
      cycle_id: input.cycle_id,
      root_problem_version_id: input.root_problem_version_id,
    },
    deps.config,
  );
  const guard = await guardAndAuditAction(
    "publish",
    {
      actor_email: input.actor_email,
      cycle_id: context.cycle_id,
      thread_id: input.thread_id,
      client_request_id: input.client_request_id,
      why: input.why,
      linked_event_id: input.linked_event_id,
      linked_idempotency_key: input.linked_idempotency_key,
      organization_id: context.organization_id,
      root_problem_version_id: context.root_problem_version_id,
    },
    deps,
  );

  if (!guard.decision.allowed) {
    return {
      allowed: false,
      reason_code:
        guard.decision.reason_code === "IDENTITY_UNRESOLVED" ||
        guard.decision.reason_code === "GLOBAL_STATE_BLOCKED" ||
        guard.decision.reason_code === "CYCLE_NOT_SELECTED" ||
        guard.decision.reason_code === "NO_MEMBERSHIP_FOR_CYCLE" ||
        guard.decision.reason_code === "CROSS_CYCLE_ACCESS_DENIED" ||
        guard.decision.reason_code === "CYCLE_LOCKED" ||
        guard.decision.reason_code === "CYCLE_ARCHIVED" ||
        guard.decision.reason_code === "HALTED_GLOBAL" ||
        guard.decision.reason_code === "HALTED_CYCLE" ||
        guard.decision.reason_code === "ROLE_DENY"
          ? guard.decision.reason_code
          : "PUBLISH_FAILED",
      audit_id: guard.audit_id,
      thread_id: input.thread_id,
      policy_snapshot: {
        membership_state: guard.decision.membership_state,
        role: guard.decision.role,
        global_state: guard.decision.global_state,
      },
      organization_id: context.organization_id,
      cycle_id: context.cycle_id,
      root_problem_version_id: context.root_problem_version_id,
    };
  }

  if (!guard.decision.participant_id) {
    return {
      allowed: false,
      reason_code: "PUBLISH_FAILED",
      audit_id: guard.audit_id,
      thread_id: input.thread_id,
      policy_snapshot: {
        membership_state: guard.decision.membership_state,
        role: guard.decision.role,
        global_state: guard.decision.global_state,
      },
      organization_id: context.organization_id,
      cycle_id: context.cycle_id,
      root_problem_version_id: context.root_problem_version_id,
    };
  }

  const txnIdempotencyKey = await computeProtectedActionIdempotencyKey({
    cycle_id: context.cycle_id,
    thread_id: input.thread_id,
    participant_id: guard.decision.participant_id,
    action_type: "publish",
    client_request_id: input.client_request_id ?? `${input.thread_id}:${context.cycle_id}:publish`,
  });

  const txn = await deps.persistence.publishLabRecordTxn({
    idempotency_key: txnIdempotencyKey,
    organization_id: context.organization_id,
    cycle_id: context.cycle_id,
    root_problem_version_id: context.root_problem_version_id,
    participant_id: guard.decision.participant_id,
    role: guard.decision.role,
    thread_id: input.thread_id,
    claim: Boolean(input.claim),
    value: Boolean(input.value),
    difference: Boolean(input.difference),
    explicit_confirmation: Boolean(input.explicit_confirmation),
    content: input.content ?? {},
  });

  return {
    allowed: txn.ok,
    reason_code: txn.reason_code,
    audit_id: guard.audit_id,
    thread_id: input.thread_id,
    lab_record_id: txn.lab_record?.lab_record_id,
    version: txn.lab_record?.version,
    credit_delta: txn.credit_delta,
    credit_balance_after: txn.credit_balance_after,
    replayed: txn.replayed,
    policy_snapshot: {
      membership_state: guard.decision.membership_state,
      role: guard.decision.role,
      global_state: guard.decision.global_state,
    },
    organization_id: context.organization_id,
    cycle_id: context.cycle_id,
    root_problem_version_id: context.root_problem_version_id,
  };
}
