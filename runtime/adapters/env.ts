import type { GlobalRole, ParticipantRole } from "../core/types.js";

export type PersistenceBackend = "inmemory" | "supabase";

export interface RuntimeConfig {
  persistence_backend: PersistenceBackend;
  active_ingress_mode: string;
  ingress_mode_source: string;
  allowed_event_types: string[];
  default_global_role: GlobalRole;
  stub_role: ParticipantRole;
  supabase_url?: string;
  supabase_service_role_key?: string;
  operator_email?: string;
  organization_id: string;
  program_label: string;
  default_cycle_id: string;
  root_problem_version_id: string;
  focus_snapshot: string;
  default_model: string;
  openai_api_key?: string;
  use_kimi_planner: boolean;
  kimi_api_key?: string;
  kimi_base_url: string;
  kimi_planner_model: string;
  kimi_timeout_ms: number;
  kimi_max_concurrency: number;
  notion_integration_token?: string;
  notion_api_base_url: string;
  notion_root_page_url?: string;
  notion_db_threads_id?: string;
  notion_db_turns_id?: string;
  notion_db_outputs_id?: string;
  notion_db_research_inbox_id?: string;
  notion_db_team_intake_id?: string;
  session_secret: string;
  oauth_google_client_id?: string;
  oauth_google_client_secret?: string;
  oauth_google_redirect_uri?: string;
  oauth_google_auth_url: string;
  oauth_google_token_url: string;
  oauth_google_tokeninfo_url: string;
  oauth_google_scopes: string[];
}

function asGlobalRole(value: string | undefined): GlobalRole {
  if (value === "member" || value === "operator" || value === "admin") {
    return value;
  }

  return "member";
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

function asBoolean(value: string | undefined, fallback: boolean): boolean {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return fallback;
}

function asPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function loadRuntimeConfig(env: Record<string, string | undefined>): RuntimeConfig {
  return {
    persistence_backend: asPersistenceBackend(env.PILOT_PERSISTENCE_BACKEND),
    active_ingress_mode: env.PILOT_RUNTIME_ACTIVE_INGRESS_MODE ?? "supabase_edge",
    ingress_mode_source:
      env.PILOT_RUNTIME_INGRESS_MODE_SOURCE ?? "supabase.table.runtime_control.active_ingress_mode",
    allowed_event_types: parseList(env.PILOT_ALLOWED_EVENT_TYPES, ["local_commit", "commit-event", "commit_event"]),
    default_global_role: asGlobalRole(env.PILOT_DEFAULT_GLOBAL_ROLE),
    stub_role: asRole(env.PILOT_STUB_ROLE),
    supabase_url: env.PILOT_SUPABASE_URL ?? env.SUPABASE_URL,
    supabase_service_role_key: env.PILOT_SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY,
    operator_email: env.PILOT_OPERATOR_EMAIL,
    organization_id: env.PILOT_ORGANIZATION_ID ?? "applied-ai-labs",
    program_label: env.PILOT_PROGRAM_LABEL ?? "AI Fluency Lab",
    default_cycle_id: env.PILOT_ACTIVE_PROGRAM_CYCLE_ID ?? "cycle-innovation-day-001",
    root_problem_version_id: env.PILOT_ROOT_PROBLEM_VERSION_ID ?? "pilot-v1",
    focus_snapshot:
      env.PILOT_FOCUS_SNAPSHOT ??
      "How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?",
    default_model: env.PILOT_DEFAULT_MODEL ?? "gpt-4o-mini",
    openai_api_key: env.PILOT_OPENAI_API_KEY ?? env.OPENAI_API_KEY,
    use_kimi_planner: asBoolean(env.PILOT_USE_KIMI_PLANNER, false),
    kimi_api_key: env.PILOT_KIMI_API_KEY ?? env.KIMI_API_KEY,
    kimi_base_url: env.PILOT_KIMI_BASE_URL ?? env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1",
    kimi_planner_model: env.PILOT_KIMI_PLANNER_MODEL ?? env.KIMI_PLANNER_MODEL ?? "kimi-k2",
    kimi_timeout_ms: asPositiveNumber(env.PILOT_KIMI_TIMEOUT_MS, 9000),
    kimi_max_concurrency: asPositiveNumber(env.PILOT_KIMI_MAX_CONCURRENCY, 3),
    notion_integration_token: env.PILOT_NOTION_INTEGRATION_TOKEN ?? env.NOTION_INTEGRATION_TOKEN,
    notion_api_base_url: env.PILOT_NOTION_API_BASE_URL ?? "https://api.notion.com/v1",
    notion_root_page_url: env.PILOT_NOTION_ROOT_PAGE_URL,
    notion_db_threads_id: env.PILOT_NOTION_DB_THREADS_ID,
    notion_db_turns_id: env.PILOT_NOTION_DB_TURNS_ID,
    notion_db_outputs_id: env.PILOT_NOTION_DB_OUTPUTS_ID,
    notion_db_research_inbox_id: env.PILOT_NOTION_DB_RESEARCH_INBOX_ID,
    notion_db_team_intake_id: env.PILOT_NOTION_DB_TEAM_INTAKE_ID,
    session_secret: env.PILOT_SESSION_SECRET ?? "pilot-dev-insecure-session-secret",
    oauth_google_client_id: env.PILOT_GOOGLE_CLIENT_ID,
    oauth_google_client_secret: env.PILOT_GOOGLE_CLIENT_SECRET,
    oauth_google_redirect_uri: env.PILOT_GOOGLE_REDIRECT_URI,
    oauth_google_auth_url: env.PILOT_GOOGLE_AUTH_URL ?? "https://accounts.google.com/o/oauth2/v2/auth",
    oauth_google_token_url: env.PILOT_GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token",
    oauth_google_tokeninfo_url: env.PILOT_GOOGLE_TOKENINFO_URL ?? "https://oauth2.googleapis.com/tokeninfo",
    oauth_google_scopes: parseList(env.PILOT_GOOGLE_SCOPES, ["openid", "email", "profile"]),
  };
}
