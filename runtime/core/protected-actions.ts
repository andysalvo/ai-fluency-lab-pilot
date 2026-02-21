import type { RuntimeConfig } from "../adapters/env.js";
import type { PersistenceAdapter } from "../adapters/persistence.js";
import type {
  AllowlistState,
  ParticipantRole,
  PublishActionInput,
  PublishActionResponse,
  PublishReasonCode,
  ProtectedAction,
} from "./types.js";

const PUBLISH_ALLOWED_ROLES: ParticipantRole[] = ["moderator", "facilitator", "operator"];

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

export interface PublishDeps {
  persistence: PersistenceAdapter;
  config: RuntimeConfig;
  now?: () => string;
}

export async function executePublishStub(input: PublishActionInput, deps: PublishDeps): Promise<PublishActionResponse> {
  const now = deps.now ?? (() => new Date().toISOString());
  const action: ProtectedAction = "publish";

  const actorEmail = input.actor_email?.trim();
  const allowlistState = normalizeAllowlistState(input.allowlist_state, deps.config.stub_allowlist_state);
  const role = normalizeRole(input.role, deps.config.stub_role);

  let allowed = false;
  let reasonCode: PublishReasonCode;

  if (!actorEmail) {
    reasonCode = "IDENTITY_UNRESOLVED";
  } else if (!allowlistGrantsAccess(allowlistState)) {
    reasonCode = "ALLOWLIST_DENY";
  } else if (!PUBLISH_ALLOWED_ROLES.includes(role)) {
    reasonCode = "ROLE_DENY";
  } else {
    allowed = true;
    reasonCode = "OK_STUB";
  }

  const audit = await deps.persistence.insertProtectedActionAudit({
    action,
    actor_email: actorEmail,
    allowlist_state: allowlistState,
    role,
    allowed,
    reason_code: reasonCode,
    thread_id: input.thread_id,
    why: input.why,
    linked_event_id: input.linked_event_id,
    linked_idempotency_key: input.linked_idempotency_key,
    created_at: now(),
  });

  return {
    allowed,
    reason_code: reasonCode,
    audit_id: audit.audit_id,
    thread_id: input.thread_id,
    policy_snapshot: {
      allowlist_state: allowlistState,
      role,
    },
  };
}
