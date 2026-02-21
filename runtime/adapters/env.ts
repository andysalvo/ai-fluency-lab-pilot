import type { AllowlistState, ParticipantRole } from "../core/types.js";

export type PersistenceBackend = "inmemory" | "supabase";

export interface RuntimeConfig {
  persistence_backend: PersistenceBackend;
  active_ingress_mode: string;
  ingress_mode_source: string;
  allowed_event_types: string[];
  stub_allowlist_state: AllowlistState;
  stub_role: ParticipantRole;
  supabase_url?: string;
  supabase_service_role_key?: string;
  operator_email?: string;
  organization_id: string;
  program_label: string;
  program_cycle_id: string;
  root_problem_version_id: string;
  default_model: string;
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

function asPersistenceBackend(value: string | undefined): PersistenceBackend {
  if (value === "supabase") {
    return "supabase";
  }

  return "inmemory";
}

export function loadRuntimeConfig(env: Record<string, string | undefined>): RuntimeConfig {
  return {
    persistence_backend: asPersistenceBackend(env.PILOT_PERSISTENCE_BACKEND),
    active_ingress_mode: env.PILOT_RUNTIME_ACTIVE_INGRESS_MODE ?? "supabase_edge",
    ingress_mode_source:
      env.PILOT_RUNTIME_INGRESS_MODE_SOURCE ?? "supabase.table.runtime_control.active_ingress_mode",
    allowed_event_types: parseList(env.PILOT_ALLOWED_EVENT_TYPES, ["local_commit", "commit-event", "commit_event"]),
    stub_allowlist_state: asAllowlistState(env.PILOT_STUB_ALLOWLIST_STATE),
    stub_role: asRole(env.PILOT_STUB_ROLE),
    supabase_url: env.PILOT_SUPABASE_URL ?? env.SUPABASE_URL,
    supabase_service_role_key: env.PILOT_SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY,
    operator_email: env.PILOT_OPERATOR_EMAIL,
    organization_id: env.PILOT_ORGANIZATION_ID ?? "applied-ai-labs",
    program_label: env.PILOT_PROGRAM_LABEL ?? "AI Fluency Lab",
    program_cycle_id: env.PILOT_ACTIVE_PROGRAM_CYCLE_ID ?? "cycle-innovation-day-001",
    root_problem_version_id: env.PILOT_ROOT_PROBLEM_VERSION_ID ?? "pilot-v1",
    default_model: env.PILOT_DEFAULT_MODEL ?? "gpt-4o-mini",
  };
}
