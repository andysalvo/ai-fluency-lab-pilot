import { loadRuntimeConfig, type RuntimeConfig } from "../adapters/env.js";
import { createPersistenceAdapter } from "../adapters/factory.js";
import type { PersistenceAdapter } from "../adapters/persistence.js";
import {
  activateProgramCycle,
  createProgramCycle,
  exportProgramCycle,
  freezeProgramCycle,
  resetNextProgramCycle,
  snapshotProgramCycle,
} from "../core/cycle-admin.js";
import { handleIngest } from "../core/ingest-handler.js";
import { executePublishStub } from "../core/protected-actions.js";
import { resolveProgramContext } from "../core/program-context.js";
import { evaluateReadiness } from "../core/readiness.js";
import type { AllowlistState, ParticipantRole, PublishActionInput } from "../core/types.js";

interface DefaultRuntimeContext {
  config: RuntimeConfig;
  persistence: PersistenceAdapter;
}

let defaultContext: DefaultRuntimeContext | null = null;

function getDefaultEnv(): Record<string, string | undefined> {
  if (typeof process !== "undefined" && process.env) {
    return process.env as Record<string, string | undefined>;
  }

  return {};
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function asAllowlistState(value: string | null | undefined): AllowlistState | undefined {
  if (value === "allowlisted" || value === "active" || value === "suspended" || value === "revoked") {
    return value;
  }

  return undefined;
}

function asRole(value: string | null | undefined): ParticipantRole | undefined {
  if (value === "student" || value === "moderator" || value === "facilitator" || value === "operator") {
    return value;
  }

  return undefined;
}

async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return {};
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return undefined;
}

function readBoolean(source: Record<string, unknown>, key: string): boolean {
  const value = source[key];
  return value === true;
}

function actorFromRequest(payload: Record<string, unknown>, request: Request) {
  return {
    actor_email: readString(payload, "actor_email") ?? request.headers.get("x-actor-email") ?? undefined,
    allowlist_state: asAllowlistState(readString(payload, "allowlist_state") ?? request.headers.get("x-allowlist-state")),
    role: asRole(readString(payload, "role") ?? request.headers.get("x-role")),
    why: readString(payload, "why"),
  };
}

function getDefaultContext(): DefaultRuntimeContext {
  if (defaultContext) {
    return defaultContext;
  }

  const config = loadRuntimeConfig(getDefaultEnv());
  const persistence = createPersistenceAdapter(config);
  defaultContext = { config, persistence };
  return defaultContext;
}

async function resolveActiveIngressMode(config: RuntimeConfig, persistence: PersistenceAdapter): Promise<string> {
  if (config.ingress_mode_source === "supabase.table.runtime_control.active_ingress_mode") {
    try {
      const mode = await persistence.getActiveIngressMode();
      if (mode) {
        return mode;
      }
    } catch {
      // Slice 2 behavior: fall back to configured default when source lookup fails.
    }
  }

  return config.active_ingress_mode;
}

export interface EdgeHandlerDeps {
  persistence?: PersistenceAdapter;
  config?: RuntimeConfig;
  now?: () => string;
}

export async function handleRequest(request: Request, deps: EdgeHandlerDeps = {}): Promise<Response> {
  const fallback = getDefaultContext();
  const persistence = deps.persistence ?? fallback.persistence;
  const config = deps.config ?? fallback.config;
  const now = deps.now;

  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    const activeIngressMode = await resolveActiveIngressMode(config, persistence);
    return json(200, {
      ok: true,
      service: "slice2-runtime",
      persistence_backend: config.persistence_backend,
      ingress_mode_source: config.ingress_mode_source,
      active_ingress_mode: activeIngressMode,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/notion/webhook") {
    const payload = await parseJsonBody(request);
    const result = await handleIngest(payload, { persistence, config, now });
    return json(result.ok ? 200 : 400, result);
  }

  if (request.method === "POST" && url.pathname === "/api/actions/publish") {
    const payloadRaw = await parseJsonBody(request);
    const payload = asObject(payloadRaw);
    const actor = actorFromRequest(payload, request);
    const context = resolveProgramContext(
      {
        organization_id: readString(payload, "organization_id"),
        program_cycle_id: readString(payload, "program_cycle_id"),
        root_problem_version_id: readString(payload, "root_problem_version_id"),
      },
      config,
    );

    const input: PublishActionInput = {
      thread_id: readString(payload, "thread_id") ?? "unknown-thread",
      actor_email: actor.actor_email,
      allowlist_state: actor.allowlist_state,
      role: actor.role,
      why: readString(payload, "why"),
      linked_event_id: readString(payload, "linked_event_id"),
      linked_idempotency_key: readString(payload, "linked_idempotency_key"),
      ...context,
    };

    const result = await executePublishStub(input, { persistence, config, now });
    return json(result.allowed ? 200 : 403, result);
  }

  if (request.method === "POST" && url.pathname === "/api/actions/readiness/evaluate") {
    const payload = asObject(await parseJsonBody(request));
    const context = resolveProgramContext(
      {
        organization_id: readString(payload, "organization_id"),
        program_cycle_id: readString(payload, "program_cycle_id"),
        root_problem_version_id: readString(payload, "root_problem_version_id"),
      },
      config,
    );

    const response = evaluateReadiness({
      ...context,
      thread_id: readString(payload, "thread_id") ?? "unknown-thread",
      actor_email: actorFromRequest(payload, request).actor_email,
      claim: readBoolean(payload, "claim"),
      value: readBoolean(payload, "value"),
      difference: readBoolean(payload, "difference"),
      explicit_confirmation: readBoolean(payload, "explicit_confirmation"),
    });

    return json(response.ready_to_publish ? 200 : 400, response);
  }

  if (request.method === "POST" && url.pathname === "/api/auth/callback/google") {
    const payload = asObject(await parseJsonBody(request));
    const context = resolveProgramContext(
      {
        organization_id: readString(payload, "organization_id"),
        program_cycle_id: readString(payload, "program_cycle_id"),
        root_problem_version_id: readString(payload, "root_problem_version_id"),
      },
      config,
    );

    const actorEmail = readString(payload, "email") ?? request.headers.get("x-actor-email") ?? undefined;
    const allowlistState = asAllowlistState(readString(payload, "allowlist_state") ?? request.headers.get("x-allowlist-state"));
    const role = asRole(readString(payload, "role") ?? request.headers.get("x-role"));

    if (!actorEmail) {
      return json(401, {
        ok: false,
        login_state: "login_failed",
        access_granted: false,
        reason_code: "IDENTITY_UNRESOLVED",
        ...context,
      });
    }

    if (allowlistState === "suspended") {
      return json(403, {
        ok: false,
        login_state: "login_blocked_suspended",
        access_granted: false,
        reason_code: "ALLOWLIST_SUSPENDED",
        email: actorEmail,
        ...context,
      });
    }

    if (allowlistState === "revoked") {
      return json(403, {
        ok: false,
        login_state: "login_blocked_revoked",
        access_granted: false,
        reason_code: "ALLOWLIST_REVOKED",
        email: actorEmail,
        ...context,
      });
    }

    if (allowlistState === "allowlisted" || allowlistState === "active") {
      return json(200, {
        ok: true,
        login_state: "login_success",
        access_granted: true,
        allowlist_state: "active",
        role: role ?? config.stub_role,
        email: actorEmail,
        message: "Google login succeeded. Protected actions still enforce allowlist + role server-side.",
        ...context,
      });
    }

    return json(403, {
      ok: false,
      login_state: "login_blocked_not_allowlisted",
      access_granted: false,
      reason_code: "ALLOWLIST_REQUIRED",
      email: actorEmail,
      ...context,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/admin/cycles/create") {
    const payload = asObject(await parseJsonBody(request));
    const actor = actorFromRequest(payload, request);
    const result = await createProgramCycle(
      {
        ...actor,
        reason: readString(payload, "reason"),
        organization_id: readString(payload, "organization_id"),
        program_cycle_id: readString(payload, "program_cycle_id"),
        root_problem_version_id: readString(payload, "root_problem_version_id"),
      },
      { persistence, config, now },
    );

    return json(result.ok ? 200 : 403, result);
  }

  const adminCycleMatch = url.pathname.match(/^\/api\/admin\/cycles\/([^/]+)\/(activate|freeze|snapshot|export|reset-next)$/);
  if (request.method === "POST" && adminCycleMatch) {
    const [, cycleId, action] = adminCycleMatch;
    const payload = asObject(await parseJsonBody(request));
    const actor = actorFromRequest(payload, request);
    const input = {
      ...actor,
      reason: readString(payload, "reason"),
      organization_id: readString(payload, "organization_id"),
      program_cycle_id: decodeURIComponent(cycleId),
      root_problem_version_id: readString(payload, "root_problem_version_id"),
    };

    if (action === "activate") {
      const result = await activateProgramCycle(input, { persistence, config, now });
      return json(result.ok ? 200 : 403, result);
    }

    if (action === "freeze") {
      const result = await freezeProgramCycle(input, { persistence, config, now });
      return json(result.ok ? 200 : 403, result);
    }

    if (action === "snapshot") {
      const result = await snapshotProgramCycle(input, { persistence, config, now });
      return json(result.ok ? 200 : 403, result);
    }

    if (action === "export") {
      const result = await exportProgramCycle(input, { persistence, config, now });
      return json(result.ok ? 200 : 400, result);
    }

    const result = await resetNextProgramCycle(input, { persistence, config, now });
    return json(result.ok ? 200 : 403, result);
  }

  return json(404, {
    ok: false,
    error: "NOT_FOUND",
    message: `No route for ${request.method} ${url.pathname}`,
  });
}
