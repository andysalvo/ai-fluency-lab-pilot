import type { AllowlistState, ParticipantRole } from "../core/types.js";

export interface RuntimeConfig {
  active_ingress_mode: string;
  allowed_event_types: string[];
  stub_allowlist_state: AllowlistState;
  stub_role: ParticipantRole;
  operator_email?: string;
}

function asAllowlistState(value: string | undefined): AllowlistState {
  if (value === "allowlisted" || value === "active" || value === "suspended" || value === "revoked") {
    return value;
  }

  return "allowlisted";
}

function asRole(value: string | undefined): ParticipantRole {
  if (value === "student" || value === "moderator" || value === "facilitator" || value === "operator") {
    return value;
  }

  return "student";
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value) {
    return fallback;
  }

  const parsed = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return parsed.length > 0 ? parsed : fallback;
}

export function loadRuntimeConfig(env: Record<string, string | undefined>): RuntimeConfig {
  return {
    active_ingress_mode: env.PILOT_RUNTIME_ACTIVE_INGRESS_MODE ?? "supabase_edge",
    allowed_event_types: parseList(env.PILOT_ALLOWED_EVENT_TYPES, ["local_commit", "commit-event", "commit_event"]),
    stub_allowlist_state: asAllowlistState(env.PILOT_STUB_ALLOWLIST_STATE),
    stub_role: asRole(env.PILOT_STUB_ROLE),
    operator_email: env.PILOT_OPERATOR_EMAIL,
  };
}
