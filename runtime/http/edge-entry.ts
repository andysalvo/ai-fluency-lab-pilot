import { loadRuntimeConfig, type RuntimeConfig } from "../adapters/env.js";
import { InMemoryPersistenceAdapter } from "../adapters/inmemory.js";
import type { PersistenceAdapter } from "../adapters/persistence.js";
import { handleIngest } from "../core/ingest-handler.js";
import { executePublishStub } from "../core/protected-actions.js";
import type { PublishActionInput } from "../core/types.js";

const defaultPersistence = new InMemoryPersistenceAdapter();

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

function asAllowlistState(value: string | null | undefined): PublishActionInput["allowlist_state"] {
  if (value === "allowlisted" || value === "active" || value === "suspended" || value === "revoked") {
    return value;
  }

  return undefined;
}

function asRole(value: string | null | undefined): PublishActionInput["role"] {
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

export interface EdgeHandlerDeps {
  persistence?: PersistenceAdapter;
  config?: RuntimeConfig;
  now?: () => string;
}

export async function handleRequest(request: Request, deps: EdgeHandlerDeps = {}): Promise<Response> {
  const persistence = deps.persistence ?? defaultPersistence;
  const config = deps.config ?? loadRuntimeConfig(getDefaultEnv());
  const now = deps.now;

  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return json(200, {
      ok: true,
      service: "slice1-runtime",
      active_ingress_mode: config.active_ingress_mode,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/notion/webhook") {
    const payload = await parseJsonBody(request);
    const result = await handleIngest(payload, { persistence, config, now });
    return json(result.ok ? 200 : 400, result);
  }

  if (request.method === "POST" && url.pathname === "/api/actions/publish") {
    const payload = ((await parseJsonBody(request)) ?? {}) as Partial<PublishActionInput>;

    const input: PublishActionInput = {
      thread_id: typeof payload.thread_id === "string" ? payload.thread_id : "unknown-thread",
      actor_email:
        typeof payload.actor_email === "string"
          ? payload.actor_email
          : request.headers.get("x-actor-email") ?? undefined,
      allowlist_state:
        typeof payload.allowlist_state === "string"
          ? asAllowlistState(payload.allowlist_state)
          : asAllowlistState(request.headers.get("x-allowlist-state")),
      role:
        typeof payload.role === "string"
          ? asRole(payload.role)
          : asRole(request.headers.get("x-role")),
      why: typeof payload.why === "string" ? payload.why : undefined,
      linked_event_id: typeof payload.linked_event_id === "string" ? payload.linked_event_id : undefined,
      linked_idempotency_key:
        typeof payload.linked_idempotency_key === "string" ? payload.linked_idempotency_key : undefined,
    };

    const result = await executePublishStub(input, { persistence, config, now });
    return json(result.allowed ? 200 : 403, result);
  }

  return json(404, {
    ok: false,
    error: "NOT_FOUND",
    message: `No route for ${request.method} ${url.pathname}`,
  });
}
