import { loadRuntimeConfig, type RuntimeConfig } from "../adapters/env.js";
import { createPersistenceAdapter } from "../adapters/factory.js";
import type { PersistenceAdapter } from "../adapters/persistence.js";
import {
  activateProgramCycle,
  bootstrapProgramCycle,
  createProgramCycle,
  exportProgramCycle,
  freezeProgramCycle,
  resetNextProgramCycle,
  snapshotProgramCycle,
} from "../core/cycle-admin.js";
import { handleIngest } from "../core/ingest-handler.js";
import { executePublishAction, guardAndAuditAction } from "../core/protected-actions.js";
import { resolveProgramContext } from "../core/program-context.js";
import { evaluateReadiness } from "../core/readiness.js";
import { processCommitEvent } from "../core/webhook-commit.js";
import type { NotionLikeWebhookPayload } from "../core/types.js";

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

function html(status: number, markup: string): Response {
  return new Response(markup, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
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

function canonicalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function actorEmailFromRequest(payload: Record<string, unknown>, request: Request): string | undefined {
  return readString(payload, "actor_email") ?? readString(payload, "email") ?? request.headers.get("x-actor-email") ?? undefined;
}

function cycleIdFromRequest(payload: Record<string, unknown>, request: Request): string | undefined {
  return readString(payload, "cycle_id") ?? request.headers.get("x-cycle-id") ?? undefined;
}

function isIdeaIntakeSource(sourceTable: string | undefined, config: RuntimeConfig): boolean {
  if (!sourceTable) {
    return false;
  }

  const normalized = sourceTable.trim().toLowerCase();
  if (normalized === "idea_intake" || normalized === "idea intake") {
    return true;
  }

  return Boolean(config.notion_db_idea_intake_id && normalized === config.notion_db_idea_intake_id.toLowerCase());
}

function supabaseFunctionsBaseUrl(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) {
    return null;
  }
  try {
    const url = new URL(supabaseUrl);
    // Expect: https://<project-ref>.supabase.co
    const match = url.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    if (!match) {
      return null;
    }
    const projectRef = match[1];
    return `https://${projectRef}.functions.supabase.co`;
  } catch {
    return null;
  }
}

function cronAuthorized(request: Request): boolean {
  // Vercel Cron sends this header on scheduled runs.
  if (request.headers.get("x-vercel-cron") === "1") {
    return true;
  }

  // Optional manual override for debugging (no secrets in git). If unset, disabled.
  if (typeof process === "undefined" || !process.env) {
    return false;
  }
  const expected = process.env.PILOT_CRON_SECRET ?? process.env.PILOT_WAREHOUSE_CRON_TOKEN;
  if (!expected) {
    return false;
  }
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") ?? url.searchParams.get("token");
  return Boolean(secret && secret === expected);
}

async function postWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { method: "POST", signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function truncateText(input: string, maxBytes: number): string {
  const buf = Buffer.from(input, "utf8");
  if (buf.byteLength <= maxBytes) return input;
  return buf.subarray(0, maxBytes).toString("utf8");
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
      // Fall back to configured mode if source lookup fails.
    }
  }

  return config.active_ingress_mode;
}

export interface EdgeHandlerDeps {
  persistence?: PersistenceAdapter;
  config?: RuntimeConfig;
  now?: () => string;
}

async function resolveParticipantContext(
  persistence: PersistenceAdapter,
  config: RuntimeConfig,
  organizationId: string,
  actorEmail: string | undefined,
  cycleId: string | undefined,
) {
  if (!actorEmail) {
    return { ok: false, reason_code: "IDENTITY_UNRESOLVED" as const };
  }

  const participant = await persistence.getParticipantByEmailCanonical(canonicalizeEmail(actorEmail));
  if (!participant) {
    return { ok: false, reason_code: "NO_MEMBERSHIP_FOR_CYCLE" as const };
  }

  if (participant.global_state !== "active") {
    return { ok: false, reason_code: "GLOBAL_STATE_BLOCKED" as const, participant };
  }

  if (!cycleId) {
    return { ok: false, reason_code: "CYCLE_NOT_SELECTED" as const, participant };
  }

  const membership = await persistence.getCycleMembership(participant.participant_id, organizationId, cycleId);
  if (!membership || membership.membership_state !== "active") {
    return { ok: false, reason_code: "NO_MEMBERSHIP_FOR_CYCLE" as const, participant };
  }

  const cycle = await persistence.getProgramCycle(organizationId, cycleId);
  if (!cycle) {
    return { ok: false, reason_code: "NO_MEMBERSHIP_FOR_CYCLE" as const, participant, membership };
  }

  if (cycle.state === "archived" && participant.global_role !== "operator" && participant.global_role !== "admin") {
    return { ok: false, reason_code: "CYCLE_ARCHIVED" as const, participant, membership, cycle };
  }

  return { ok: true as const, participant, membership, cycle };
}

export async function handleRequest(request: Request, deps: EdgeHandlerDeps = {}): Promise<Response> {
  const fallback = getDefaultContext();
  const persistence = deps.persistence ?? fallback.persistence;
  const config = deps.config ?? fallback.config;
  const now = deps.now ?? (() => new Date().toISOString());

  const url = new URL(request.url);

  // Warehouse v1: cloud scheduler endpoints (Vercel Cron -> Supabase Edge worker functions).
  // These endpoints do not accept student input and never touch Notion/OpenAI directly.
  const isCronIngest = url.pathname === "/api/cron/warehouse/ingest" || url.pathname === "/api/warehouse/ingest";
  const isCronEmbed = url.pathname === "/api/cron/warehouse/embed" || url.pathname === "/api/warehouse/embed";
  if (isCronIngest || isCronEmbed) {
    if (request.method !== "GET") {
      return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    }
    if (!cronAuthorized(request)) {
      return json(403, { ok: false, error: "FORBIDDEN" });
    }

    const base = supabaseFunctionsBaseUrl(config.supabase_url);
    if (!base) {
      return json(500, { ok: false, error: "SUPABASE_URL_INVALID" });
    }

    const target = isCronIngest ? `${base}/warehouse-ingest-worker` : `${base}/warehouse-embedding-worker`;
    const started = Date.now();
    try {
      const upstream = await postWithTimeout(target, 15_000);
      const text = await upstream.text();
      return json(200, {
        ok: upstream.ok,
        worker_http_status: upstream.status,
        worker_body: truncateText(text, 2048),
        ts: now(),
        latency_ms: Date.now() - started,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json(200, {
        ok: false,
        worker_http_status: null,
        worker_body: null,
        error: "UPSTREAM_FAILED",
        message: truncateText(message, 512),
        ts: now(),
        latency_ms: Date.now() - started,
      });
    }
  }

  if (request.method === "GET" && url.pathname === "/") {
    const notionHref = config.notion_root_page_url ?? "#";
    const focus = config.focus_snapshot;
    return html(
      200,
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Applied AI Labs - AI Fluency at Smeal</title>
    <style>
      :root { --ink: #1f2d56; --muted: #55617d; --bg: #f7f9fc; --card: #ffffff; --line: #dbe1ef; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: \"Helvetica Neue\", Helvetica, Arial, sans-serif; background: linear-gradient(180deg, var(--bg), #eef3fb); color: var(--ink); }
      main { max-width: 920px; margin: 0 auto; padding: 34px 20px 56px; }
      .brand { margin: 0 0 8px; max-width: 320px; width: 100%; height: auto; display: block; }
      .title { font-size: 26px; letter-spacing: 0.2px; font-weight: 700; margin: 0 0 4px; }
      .sub { margin: 0 0 24px; color: var(--muted); font-size: 16px; }
      .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 22px; box-shadow: 0 14px 40px rgba(31,45,86,0.06); margin-bottom: 14px; }
      .label { color: var(--muted); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; }
      .focus { margin: 6px 0 0; font-size: 20px; line-height: 1.35; }
      .section { margin: 0 0 6px; font-size: 20px; font-weight: 700; }
      .copy { margin: 0; color: var(--muted); line-height: 1.5; }
      ol { margin: 16px 0 0; padding-left: 20px; color: var(--ink); line-height: 1.6; }
      .btnrow { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
      a.btn { display: inline-block; background: var(--ink); color: #fff; text-decoration: none; border-radius: 10px; padding: 10px 14px; font-size: 14px; }
      a.btn.secondary { background: #fff; color: var(--ink); border: 1px solid var(--line); }
      .note { margin-top: 12px; color: var(--muted); font-size: 13px; }
    </style>
  </head>
  <body>
    <main>
      <img class="brand" src="/branding/applied-ai-labs-logo.svg" alt="Applied AI Labs logo" />
      <h1 class="title">Applied AI Labs - AI Fluency at Smeal</h1>
      <p class="sub">Lab Team workspace for focused, high-signal AI thinking.</p>
      <section class="card">
        <div class="label">Current Focus</div>
        <p class="focus">${focus}</p>
      </section>
      <section class="card">
        <h2 class="section">Add a Source</h2>
        <p class="copy">Drop one URL and a short relevance note. The system proposes a starter brief with provenance.</p>
      </section>
      <section class="card">
        <h2 class="section">My Work</h2>
        <p class="copy">Review your thread, improve signal quality, and keep momentum in one place.</p>
      </section>
      <section class="card">
        <h2 class="section">Lab Record</h2>
        <p class="copy">When work meets criteria, use <strong>Add to Lab Record</strong> with explicit confirmation.</p>
        <div class="btnrow">
          <a class="btn" href="${notionHref}">Open Lab Workspace</a>
          <a class="btn secondary" href="/health">Check Runtime Health</a>
        </div>
        <p class="note">System proposes. Lab Team decides. No auto-publish.</p>
      </section>
    </main>
  </body>
</html>`,
    );
  }

  if (request.method === "GET" && url.pathname === "/health") {
    const activeIngressMode = await resolveActiveIngressMode(config, persistence);
    const runtimeControl = await persistence.getRuntimeControl();
    return json(200, {
      ok: true,
      service: "cycle-isolation-runtime",
      persistence_backend: config.persistence_backend,
      ingress_mode_source: config.ingress_mode_source,
      active_ingress_mode: activeIngressMode,
      global_protected_actions_halt: runtimeControl.global_protected_actions_halt,
      halt_reason: runtimeControl.halt_reason ?? null,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/notion/webhook") {
    const payloadRaw = await parseJsonBody(request);
    const payload = asObject(payloadRaw);
    const sourceTable = readString(payload, "source_table");
    if (!payload.cycle_id) {
      payload.cycle_id = request.headers.get("x-cycle-id") ?? undefined;
    }
    if (!payload.cycle_id && isIdeaIntakeSource(sourceTable, config)) {
      payload.cycle_id = config.default_cycle_id;
    }
    if (!payload.idempotency_key) {
      const sourceRecordId = readString(payload, "source_record_id");
      const occurredAt = readString(payload, "occurred_at");
      if (sourceRecordId && occurredAt) {
        payload.idempotency_key = `${sourceRecordId}:${occurredAt}`;
      }
    }

    // Warehouse v1: idea intake is enqueue-only (no Notion fetch, no embeddings, no slow calls).
    if (isIdeaIntakeSource(sourceTable, config)) {
      const sourceRecordId = readString(payload, "source_record_id");
      const occurredAt = readString(payload, "occurred_at");
      const eventType = readString(payload, "event_type") ?? "commit_event";
      const idempotencyKey = readString(payload, "idempotency_key");

      if (!sourceRecordId || !occurredAt || !idempotencyKey) {
        return json(400, { ok: false, result_code: "PAYLOAD_INVALID", message: "Missing required fields for idea intake." });
      }

      const notionPayload = payload as unknown as NotionLikeWebhookPayload;
      const context = resolveProgramContext(notionPayload, config);
      const enqueue = await persistence.warehouseEnqueueIdeaJob({
        idempotency_key: idempotencyKey,
        source_table: sourceTable ?? "idea_intake",
        source_record_id: sourceRecordId,
        event_type: eventType,
        occurred_at: occurredAt,
        organization_id: context.organization_id,
        cycle_id: context.cycle_id,
        root_problem_version_id: context.root_problem_version_id,
      });

      return json(200, {
        ok: true,
        ingest_state: enqueue.deduped ? "duplicate" : "processed",
        trigger_type: "local_commit",
        result_code: enqueue.deduped ? "DUPLICATE_SKIPPED" : "WAREHOUSE_ENQUEUED",
        message: enqueue.deduped ? "Duplicate webhook delivery skipped." : "Idea intake accepted and queued for async processing.",
        organization_id: context.organization_id,
        cycle_id: context.cycle_id,
        root_problem_version_id: context.root_problem_version_id,
        warehouse: {
          deduped: enqueue.deduped,
          event_id: enqueue.event_id,
          job_id: enqueue.job_id,
        },
      });
    }

    const result = await handleIngest(payload, { persistence, config, now });
    if (!result.ok || result.ingest_state !== "processed" || result.trigger_type !== "local_commit") {
      return json(result.ok ? 200 : 400, result);
    }

    const commitResult = await processCommitEvent(payload as unknown as NotionLikeWebhookPayload, { persistence, config, now });
    if (!commitResult.ok) {
      if (result.event_id) {
        await persistence.updateIngestState(result.event_id, {
          ingest_state: "failed",
          error_code: commitResult.result_code,
          processed_at: now(),
          details: {
            post_ingest_error: commitResult,
          },
        });
      }

      return json(400, {
        ...result,
        ok: false,
        ingest_state: "failed",
        result_code: commitResult.result_code,
        message: commitResult.message,
        post_ingest: commitResult,
      });
    }

    return json(200, {
      ...result,
      post_ingest: commitResult,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/session/active-cycle/select") {
    const payload = asObject(await parseJsonBody(request));
    const actorEmail = actorEmailFromRequest(payload, request);
    const cycleId = cycleIdFromRequest(payload, request);
    const organizationId = readString(payload, "organization_id") ?? config.organization_id;
    if (!actorEmail) {
      return json(401, { ok: false, reason_code: "IDENTITY_UNRESOLVED" });
    }

    if (!cycleId) {
      return json(400, { ok: false, reason_code: "CYCLE_NOT_SELECTED" });
    }

    const participant = await persistence.getParticipantByEmailCanonical(canonicalizeEmail(actorEmail));
    if (!participant) {
      return json(403, { ok: false, reason_code: "NO_MEMBERSHIP_FOR_CYCLE" });
    }

    const membership = await persistence.activateMembership(participant.participant_id, organizationId, cycleId, now());
    if (!membership) {
      return json(403, { ok: false, reason_code: "NO_MEMBERSHIP_FOR_CYCLE", cycle_id: cycleId });
    }

    await persistence.setSessionActiveCycle(participant.participant_id, cycleId, now());
    return json(200, {
      ok: true,
      cycle_id: cycleId,
      membership_state: membership.membership_state,
      role: membership.role,
      message: "Active cycle selected.",
    });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/callback/google") {
    const payload = asObject(await parseJsonBody(request));
    const actorEmail = actorEmailFromRequest(payload, request);
    const cycleId = cycleIdFromRequest(payload, request);
    const organizationId = readString(payload, "organization_id") ?? config.organization_id;

    if (!actorEmail) {
      return json(401, {
        ok: false,
        login_state: "login_failed",
        access_granted: false,
        reason_code: "IDENTITY_UNRESOLVED",
      });
    }

    const participant = await persistence.getParticipantByEmailCanonical(canonicalizeEmail(actorEmail));
    if (!participant) {
      return json(403, {
        ok: false,
        login_state: "login_blocked_not_allowlisted",
        access_granted: false,
        reason_code: "NO_MEMBERSHIP_FOR_CYCLE",
        email: actorEmail,
      });
    }

    if (participant.global_state !== "active") {
      return json(403, {
        ok: false,
        login_state: "login_blocked_revoked",
        access_granted: false,
        reason_code: "GLOBAL_STATE_BLOCKED",
        email: actorEmail,
      });
    }

    if (!cycleId) {
      return json(200, {
        ok: true,
        login_state: "login_success",
        access_granted: false,
        reason_code: "CYCLE_NOT_SELECTED",
        requires_cycle_selection: true,
        email: actorEmail,
      });
    }

    const membership = await persistence.getCycleMembership(participant.participant_id, organizationId, cycleId);
    if (!membership || membership.membership_state === "inactive") {
      return json(403, {
        ok: false,
        login_state: "login_blocked_not_allowlisted",
        access_granted: false,
        reason_code: "NO_MEMBERSHIP_FOR_CYCLE",
        cycle_id: cycleId,
        email: actorEmail,
      });
    }

    if (membership.membership_state === "revoked") {
      return json(403, {
        ok: false,
        login_state: "login_blocked_revoked",
        access_granted: false,
        reason_code: "MEMBERSHIP_REVOKED",
        cycle_id: cycleId,
        email: actorEmail,
      });
    }

    const activatedMembership = await persistence.activateMembership(participant.participant_id, organizationId, cycleId, now());
    if (!activatedMembership) {
      return json(403, {
        ok: false,
        login_state: "login_blocked_not_allowlisted",
        access_granted: false,
        reason_code: "NO_MEMBERSHIP_FOR_CYCLE",
        cycle_id: cycleId,
        email: actorEmail,
      });
    }

    await persistence.updateParticipantLastLogin(participant.participant_id, now());
    await persistence.setSessionActiveCycle(participant.participant_id, cycleId, now());

    return json(200, {
      ok: true,
      login_state: "login_success",
      access_granted: true,
      cycle_id: cycleId,
      membership_state: activatedMembership.membership_state,
      role: activatedMembership.role,
      email: actorEmail,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/visible-surface") {
    const payload = asObject(await parseJsonBody(request));
    const actorEmail = actorEmailFromRequest(payload, request);
    const cycleId = cycleIdFromRequest(payload, request);
    const organizationId = readString(payload, "organization_id") ?? config.organization_id;

    const participantContext = await resolveParticipantContext(persistence, config, organizationId, actorEmail, cycleId);
    if (!participantContext.ok) {
      return json(403, { ok: false, reason_code: participantContext.reason_code });
    }

    const participant = participantContext.participant;
    if (!participant) {
      return json(500, { ok: false, reason_code: "IDENTITY_UNRESOLVED" });
    }

    const threads = await persistence.listVisibleThreads(participant.participant_id, cycleId!);
    const sources = await persistence.listVisibleSources(participant.participant_id, cycleId!);
    const starterBriefs = await persistence.listVisibleStarterBriefs(participant.participant_id, cycleId!);
    const labRecord = await persistence.listVisibleLabRecord(cycleId!);

    return json(200, {
      ok: true,
      cycle_id: cycleId,
      participant_id: participant.participant_id,
      threads,
      sources,
      starter_briefs: starterBriefs,
      lab_record: labRecord,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/actions/publish") {
    const payloadRaw = await parseJsonBody(request);
    const payload = asObject(payloadRaw);
    const cycleId = cycleIdFromRequest(payload, request);
    const actorEmail = actorEmailFromRequest(payload, request);
    const context = resolveProgramContext(
      {
        organization_id: readString(payload, "organization_id"),
        cycle_id: cycleId,
        root_problem_version_id: readString(payload, "root_problem_version_id"),
      },
      config,
    );

    const result = await executePublishAction(
      {
        thread_id: readString(payload, "thread_id") ?? "unknown-thread",
        actor_email: actorEmail,
        cycle_id: cycleId,
        claim: readBoolean(payload, "claim"),
        value: readBoolean(payload, "value"),
        difference: readBoolean(payload, "difference"),
        explicit_confirmation: readBoolean(payload, "explicit_confirmation"),
        content: asObject(payload.content),
        why: readString(payload, "why"),
        client_request_id: readString(payload, "client_request_id"),
        linked_event_id: readString(payload, "linked_event_id"),
        linked_idempotency_key: readString(payload, "linked_idempotency_key"),
        organization_id: context.organization_id,
        root_problem_version_id: context.root_problem_version_id,
      },
      { persistence, config, now },
    );

    return json(result.allowed ? 200 : 403, result);
  }

  if (request.method === "POST" && url.pathname === "/api/actions/readiness/evaluate") {
    const payload = asObject(await parseJsonBody(request));
    const cycleId = cycleIdFromRequest(payload, request);
    const actorEmail = actorEmailFromRequest(payload, request);
    const context = resolveProgramContext(
      {
        organization_id: readString(payload, "organization_id"),
        cycle_id: cycleId,
        root_problem_version_id: readString(payload, "root_problem_version_id"),
      },
      config,
    );

    const guard = await guardAndAuditAction(
      "compare",
      {
        actor_email: actorEmail,
        cycle_id: cycleId,
        thread_id: readString(payload, "thread_id"),
        client_request_id: readString(payload, "client_request_id"),
        why: readString(payload, "why"),
        organization_id: context.organization_id,
        root_problem_version_id: context.root_problem_version_id,
      },
      { persistence, config, now },
    );

    if (!guard.decision.allowed) {
      return json(403, {
        ok: false,
        reason_code: guard.decision.reason_code,
        audit_id: guard.audit_id,
        cycle_id: cycleId,
      });
    }

    const response = evaluateReadiness({
      organization_id: context.organization_id,
      cycle_id: cycleId ?? "",
      root_problem_version_id: context.root_problem_version_id,
      thread_id: readString(payload, "thread_id") ?? "unknown-thread",
      actor_email: actorEmail,
      client_request_id: readString(payload, "client_request_id"),
      claim: readBoolean(payload, "claim"),
      value: readBoolean(payload, "value"),
      difference: readBoolean(payload, "difference"),
      explicit_confirmation: readBoolean(payload, "explicit_confirmation"),
    });

    return json(response.ready_to_publish ? 200 : 400, response);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/intake/backfill") {
    const payload = asObject(await parseJsonBody(request));
    if (!payload.cycle_id) {
      payload.cycle_id = request.headers.get("x-cycle-id") ?? undefined;
    }

    // Authorize admin action before processing backfill
    const actorEmail = actorEmailFromRequest(payload, request);
    const programContext = resolveProgramContext(
      {
        organization_id: readString(payload, "organization_id"),
        cycle_id: readString(payload, "cycle_id"),
        root_problem_version_id: readString(payload, "root_problem_version_id"),
      },
      config,
    );
    const guard = await guardAndAuditAction(
      "admin_override",
      {
        actor_email: actorEmail,
        cycle_id: programContext.cycle_id,
        organization_id: programContext.organization_id,
        root_problem_version_id: programContext.root_problem_version_id,
        why: readString(payload, "reason") ?? "backfill intake event",
      },
      { persistence, config, now },
    );

    if (!guard.decision.allowed) {
      return json(403, {
        ok: false,
        reason_code: guard.decision.reason_code,
        message: "Admin action denied by server-side membership/role guard.",
      });
    }

    if (!payload.idempotency_key) {
      payload.idempotency_key = `backfill:${Date.now()}`;
    }
    if (!payload.event_type) {
      payload.event_type = "local_commit";
    }
    if (!payload.occurred_at) {
      payload.occurred_at = now();
    }
    if (!payload.source_record_id) {
      payload.source_record_id = `backfill-${Date.now()}`;
    }

    const sourceTable = readString(payload, "source_table") ?? "team_intake";
    payload.source_table = sourceTable;

    const ingestResult = await handleIngest(payload, { persistence, config, now });
    if (!ingestResult.ok || ingestResult.ingest_state !== "processed" || ingestResult.trigger_type !== "local_commit") {
      return json(ingestResult.ok ? 200 : 400, ingestResult);
    }

    const commitResult = await processCommitEvent(payload as unknown as NotionLikeWebhookPayload, { persistence, config, now });
    if (!commitResult.ok) {
      if (ingestResult.event_id) {
        await persistence.updateIngestState(ingestResult.event_id, {
          ingest_state: "failed",
          error_code: commitResult.result_code,
          processed_at: now(),
          details: {
            backfill_error: commitResult,
          },
        });
      }

      return json(400, {
        ok: false,
        reason_code: commitResult.result_code,
        message: commitResult.message,
        post_ingest: commitResult,
      });
    }

    return json(200, {
      ok: true,
      result_code: "BACKFILL_APPLIED",
      ingest: ingestResult,
      post_ingest: commitResult,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/admin/cycles/create") {
    const payload = asObject(await parseJsonBody(request));
    const result = await createProgramCycle(
      {
        actor_email: actorEmailFromRequest(payload, request),
        cycle_id: cycleIdFromRequest(payload, request),
        reason: readString(payload, "reason"),
        focus_snapshot: readString(payload, "focus_snapshot"),
        organization_id: readString(payload, "organization_id"),
        root_problem_version_id: readString(payload, "root_problem_version_id"),
      },
      { persistence, config, now },
    );

    return json(result.ok ? 200 : 403, result);
  }

  if (request.method === "POST" && url.pathname === "/api/admin/cycles/bootstrap") {
    const payload = asObject(await parseJsonBody(request));
    const membershipsRaw = payload.memberships;
    const memberships =
      Array.isArray(membershipsRaw) && membershipsRaw.every((item) => item && typeof item === "object")
        ? (membershipsRaw as Array<Record<string, unknown>>).map((item) => ({
            email: readString(item, "email") ?? "",
            role: (readString(item, "role") as "student" | "moderator" | "facilitator" | "operator" | undefined) ?? "student",
            credits: Number(item.credits ?? 1),
          }))
        : undefined;

    const result = await bootstrapProgramCycle(
      {
        actor_email: actorEmailFromRequest(payload, request),
        cycle_id: cycleIdFromRequest(payload, request),
        reason: readString(payload, "reason"),
        focus_snapshot: readString(payload, "focus_snapshot"),
        organization_id: readString(payload, "organization_id"),
        root_problem_version_id: readString(payload, "root_problem_version_id"),
        memberships,
      },
      { persistence, config, now },
    );

    return json(result.ok ? 200 : 403, result);
  }

  const adminCycleMatch = url.pathname.match(/^\/api\/admin\/cycles\/([^/]+)\/(activate|freeze|snapshot|export|reset-next)$/);
  if (request.method === "POST" && adminCycleMatch) {
    const [, cycleId, action] = adminCycleMatch;
    const payload = asObject(await parseJsonBody(request));
    const input = {
      actor_email: actorEmailFromRequest(payload, request),
      reason: readString(payload, "reason"),
      organization_id: readString(payload, "organization_id"),
      cycle_id: decodeURIComponent(cycleId),
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
      return json(result.ok ? 200 : 403, result);
    }

    const result = await resetNextProgramCycle(input, { persistence, config, now });
    return json(result.ok ? 200 : 403, result);
  }

  return json(404, {
    ok: false,
    message: "route not found",
  });
}
