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
import { computePilotIdempotencyKey } from "../core/idempotency.js";
import { handleIngest } from "../core/ingest-handler.js";
import { summarizeGuidedRound } from "../core/guided-questions.js";
import { generateGuidedRoundWithProvider, proposeLabBriefWithProvider } from "../core/planner-provider.js";
import {
  buildResearchInboxPageProperties,
  createNotionCardPage,
  createNotionDatabasePage,
  ensureResearchInboxSchema,
  fetchNotionDatabasePayload,
} from "../core/notion.js";
import { mapWorkspaceToCardStack, mapWorkspaceToStudentSimpleView, renderCardsHtml } from "../frontstage/cards.js";
import { normalizeLabBriefContent } from "../core/lab-brief.js";
import { buildGoogleAuthUrl, exchangeGoogleCodeForIdentity } from "../core/oauth-google.js";
import { executePublishAction, guardAndAuditAction } from "../core/protected-actions.js";
import { resolveProgramContext } from "../core/program-context.js";
import { evaluateReadiness } from "../core/readiness.js";
import { clearSessionCookie, createOAuthStateToken, createSessionCookie, readOAuthStateToken, readSessionClaims } from "../core/session.js";
import { processCommitEvent } from "../core/webhook-commit.js";
import type {
  PlannerRunMetadata,
  NotionLikeWebhookPayload,
  OperatorSummaryResponse,
  SourceSubmitResponse,
  ThreadWorkspaceResponse,
  RuntimeThreadRecord,
} from "../core/types.js";

interface DefaultRuntimeContext {
  config: RuntimeConfig;
  persistence: PersistenceAdapter;
}

let defaultContext: DefaultRuntimeContext | null = null;
let telemetryWriteFailedCount = 0;

function getDefaultEnv(): Record<string, string | undefined> {
  if (typeof process !== "undefined" && process.env) {
    return process.env as Record<string, string | undefined>;
  }

  return {};
}

function json(status: number, payload: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function html(status: number, markup: string, extraHeaders: Record<string, string> = {}): Response {
  return new Response(markup, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...extraHeaders,
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

function readAnyString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readString(source, key);
    if (value) {
      return value;
    }
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
  return readAnyString(payload, "actor_email", "email") ?? request.headers.get("x-actor-email") ?? undefined;
}

function cycleIdFromRequest(payload: Record<string, unknown>, request: Request): string | undefined {
  return readString(payload, "cycle_id") ?? request.headers.get("x-cycle-id") ?? undefined;
}

interface RequestContext {
  actor_email?: string;
  cycle_id?: string;
  organization_id: string;
}

async function resolveRequestContext(payload: Record<string, unknown>, request: Request, config: RuntimeConfig): Promise<RequestContext> {
  const session = await readSessionClaims(request, config.session_secret);
  return {
    actor_email: actorEmailFromRequest(payload, request) ?? session?.actor_email,
    cycle_id: cycleIdFromRequest(payload, request) ?? session?.cycle_id,
    organization_id: readString(payload, "organization_id") ?? session?.organization_id ?? config.organization_id,
  };
}

function payloadFromSearchParams(searchParams: URLSearchParams): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [key, value] of searchParams.entries()) {
    payload[key] = value;
  }

  return payload;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

async function resolveOperatorContext(
  persistence: PersistenceAdapter,
  config: RuntimeConfig,
  requestContext: RequestContext,
) {
  if (!requestContext.actor_email) {
    return { ok: false as const, reason_code: "IDENTITY_UNRESOLVED" };
  }

  if (!requestContext.cycle_id) {
    return { ok: false as const, reason_code: "CYCLE_NOT_SELECTED" };
  }

  const participant = await persistence.getParticipantByEmailCanonical(canonicalizeEmail(requestContext.actor_email));
  if (!participant) {
    return { ok: false as const, reason_code: "NO_MEMBERSHIP_FOR_CYCLE" };
  }

  if (participant.global_state !== "active") {
    return { ok: false as const, reason_code: "GLOBAL_STATE_BLOCKED" };
  }

  if (participant.global_role !== "operator" && participant.global_role !== "admin") {
    return { ok: false as const, reason_code: "ROLE_DENY" };
  }

  const cycle = await persistence.getProgramCycle(requestContext.organization_id, requestContext.cycle_id);
  if (!cycle) {
    return { ok: false as const, reason_code: "NO_MEMBERSHIP_FOR_CYCLE" };
  }

  const runtimeControl = await persistence.getRuntimeControl();
  const cycleControl = await persistence.getCycleControl(requestContext.organization_id, requestContext.cycle_id);
  return {
    ok: true as const,
    participant,
    cycle,
    runtime_control: runtimeControl,
    cycle_control: cycleControl,
  };
}

function stageLabels(stage: NonNullable<ThreadWorkspaceResponse["current_stage"]>): {
  primary_action_label: string;
  progress_label: string;
  next_best_action: string;
} {
  switch (stage) {
    case "source_ready":
      return {
        primary_action_label: "Add a Source",
        progress_label: "Step 1 of 6",
        next_best_action: "Add one article URL and a short note to start your thread.",
      };
    case "draft_ready":
      return {
        primary_action_label: "Refresh",
        progress_label: "Step 2 of 6",
        next_best_action: "Hold on while your first insight draft is created.",
      };
    case "round_in_progress":
      return {
        primary_action_label: "Answer Next Question",
        progress_label: "Step 3 of 6",
        next_best_action: "Answer one quick question to keep momentum.",
      };
    case "round_complete":
      return {
        primary_action_label: "Create Lab Brief Draft",
        progress_label: "Step 4 of 6",
        next_best_action: "Create your 5-sentence insight draft from this round.",
      };
    case "brief_ready":
      return {
        primary_action_label: "Run Quality Check",
        progress_label: "Step 5 of 6",
        next_best_action: "Run Quality Check to confirm claim, value, and difference.",
      };
    case "ready_to_publish":
      return {
        primary_action_label: "Add to Lab Record",
        progress_label: "Step 6 of 6",
        next_best_action: "Confirm explicitly, then Add to Lab Record.",
      };
    case "published":
      return {
        primary_action_label: "Add Another Source",
        progress_label: "Published",
        next_best_action: "Published to Lab Record. Add another source to continue.",
      };
  }
}

function computeStage(input: {
  sourceExists: boolean;
  starterReady: boolean;
  activeRoundUnansweredCount: number;
  roundsCount: number;
  labBriefDraftExists: boolean;
  readinessReady: boolean;
  published: boolean;
}): NonNullable<ThreadWorkspaceResponse["current_stage"]> {
  if (input.published) {
    return "published";
  }
  if (!input.sourceExists) {
    return "source_ready";
  }
  if (!input.starterReady) {
    return "draft_ready";
  }
  if (input.roundsCount === 0) {
    return "round_in_progress";
  }
  if (input.activeRoundUnansweredCount > 0) {
    return "round_in_progress";
  }
  if (input.roundsCount > 0 && !input.labBriefDraftExists) {
    return "round_complete";
  }
  if (input.labBriefDraftExists && !input.readinessReady) {
    return "brief_ready";
  }
  return "ready_to_publish";
}

async function buildThreadWorkspace(
  persistence: PersistenceAdapter,
  config: RuntimeConfig,
  input: {
    organization_id: string;
    cycle_id: string;
    thread_id: string;
  },
): Promise<ThreadWorkspaceResponse> {
  const thread = await persistence.getThreadByIdInCycle(input.thread_id, input.cycle_id);
  if (!thread) {
    return {
      ok: false,
      reason_code: "THREAD_NOT_FOUND",
      organization_id: input.organization_id,
      cycle_id: input.cycle_id,
      root_problem_version_id: config.root_problem_version_id,
      thread_id: input.thread_id,
      publish_state: "not_ready",
      next_best_action: "Create a thread by submitting a source first.",
      rounds: [],
      question_items: [],
      lab_brief_draft: null,
    };
  }

  const [sources, briefs, rounds, labBriefDraft, labRecord] = await Promise.all([
    persistence.listSourcesForThread(input.thread_id, input.cycle_id),
    persistence.listStarterBriefsForThread(input.thread_id, input.cycle_id),
    persistence.listGuidedRoundsForThread(input.thread_id, input.cycle_id),
    persistence.getLabBriefDraftForThread(input.thread_id, input.cycle_id),
    persistence.listLabRecordForThread(input.thread_id, input.cycle_id),
  ]);

  const source = sources[sources.length - 1];
  const starterBrief = briefs[briefs.length - 1];
  const activeRound = rounds.find((round) => round.status === "active");
  const completedRounds = rounds.filter((round) => round.status === "completed");
  const latestCompletedRound = completedRounds.length > 0 ? completedRounds[completedRounds.length - 1] : undefined;

  const activeQuestionItems = activeRound ? await persistence.listGuidedQuestionItems(activeRound.round_id) : [];
  const completedQuestionItems =
    latestCompletedRound && latestCompletedRound.round_id === activeRound?.round_id
      ? activeQuestionItems
      : latestCompletedRound
        ? await persistence.listGuidedQuestionItems(latestCompletedRound.round_id)
        : [];
  const nextQuestion = activeQuestionItems.find((item) => !item.selected_option);
  const activeRoundUnansweredCount = nextQuestion
    ? activeQuestionItems.filter((item) => !item.selected_option).length
    : 0;
  const completedRoundSummary = completedQuestionItems.length > 0 ? summarizeGuidedRound(completedQuestionItems) : null;

  const readinessPreview =
    completedRoundSummary
      ? evaluateReadiness({
          organization_id: input.organization_id,
          cycle_id: input.cycle_id,
          root_problem_version_id: thread.root_problem_version_id,
          thread_id: input.thread_id,
          claim: completedRoundSummary.readiness_signals.claim,
          value: completedRoundSummary.readiness_signals.value,
          difference: completedRoundSummary.readiness_signals.difference,
          explicit_confirmation: false,
        })
      : undefined;

  const publishState: ThreadWorkspaceResponse["publish_state"] =
    labRecord.length > 0
      ? "published"
      : readinessPreview?.ready_to_publish
        ? "ready_pending_confirmation"
        : "not_ready";
  const currentStage = computeStage({
    sourceExists: Boolean(source),
    starterReady: starterBrief?.status === "ready",
    activeRoundUnansweredCount,
    roundsCount: rounds.length,
    labBriefDraftExists: Boolean(labBriefDraft),
    readinessReady: readinessPreview?.ready_to_publish === true,
    published: publishState === "published",
  });
  const stage = stageLabels(currentStage);

  return {
    ok: true,
    reason_code: "OK",
    organization_id: thread.organization_id,
    cycle_id: thread.cycle_id,
    root_problem_version_id: thread.root_problem_version_id,
    thread_id: thread.thread_id,
    source,
    starter_brief: starterBrief,
    rounds,
    question_items: activeQuestionItems,
    lab_brief_draft: labBriefDraft,
    readiness: readinessPreview,
    publish_state: publishState,
    current_stage: currentStage,
    primary_action_label: stage.primary_action_label,
    progress_label: stage.progress_label,
    next_question: nextQuestion
      ? {
          question_item_id: nextQuestion.question_item_id,
          ordinal: nextQuestion.ordinal,
          prompt: nextQuestion.prompt,
          options: nextQuestion.options,
        }
      : undefined,
    next_best_action: stage.next_best_action,
  };
}

interface ThreadMutationScope {
  payload: Record<string, unknown>;
  request: Request;
  action: "compare" | "publish";
}

type ThreadMutationResolution =
  | {
      ok: true;
      request_context: RequestContext;
      context: ReturnType<typeof resolveProgramContext>;
      guard: Awaited<ReturnType<typeof guardAndAuditAction>>;
      thread: RuntimeThreadRecord;
      cycle_id: string;
      thread_id: string;
    }
  | {
      ok: false;
      response: Response;
    };

async function resolveThreadMutationScope(
  persistence: PersistenceAdapter,
  config: RuntimeConfig,
  now: () => string,
  scope: ThreadMutationScope,
): Promise<ThreadMutationResolution> {
  const requestContext = await resolveRequestContext(scope.payload, scope.request, config);
  const cycleId = requestContext.cycle_id;
  const threadId = readString(scope.payload, "thread_id");
  if (!cycleId || !threadId) {
    return {
      ok: false,
      response: json(400, { ok: false, reason_code: "CYCLE_NOT_SELECTED" }),
    };
  }

  const context = resolveProgramContext(
    {
      organization_id: requestContext.organization_id,
      cycle_id: cycleId,
      root_problem_version_id: readString(scope.payload, "root_problem_version_id"),
    },
    config,
  );
  const guard = await guardAndAuditAction(
    scope.action,
    {
      actor_email: requestContext.actor_email,
      cycle_id: cycleId,
      thread_id: threadId,
      client_request_id: readString(scope.payload, "client_request_id"),
      organization_id: context.organization_id,
      root_problem_version_id: context.root_problem_version_id,
    },
    { persistence, config, now },
  );
  if (!guard.decision.allowed) {
    return {
      ok: false,
      response: json(403, { ok: false, reason_code: guard.decision.reason_code, audit_id: guard.audit_id }),
    };
  }

  const thread = await persistence.getThreadByIdInCycle(threadId, cycleId);
  if (!thread) {
    return {
      ok: false,
      response: json(404, { ok: false, reason_code: "THREAD_NOT_FOUND" }),
    };
  }
  if (thread.owner_participant_id !== guard.decision.participant_id) {
    return {
      ok: false,
      response: json(403, { ok: false, reason_code: "ROLE_DENY", audit_id: guard.audit_id }),
    };
  }

  return {
    ok: true,
    request_context: requestContext,
    context,
    guard,
    thread,
    cycle_id: cycleId,
    thread_id: threadId,
  };
}

async function logNotionSyncFailure(
  persistence: PersistenceAdapter,
  input: {
    actor_email?: string;
    participant_id?: string;
    role?: "student" | "moderator" | "facilitator" | "operator";
    organization_id: string;
    cycle_id: string;
    root_problem_version_id: string;
    linked_idempotency_key?: string;
    why: string;
  },
  now: () => string,
): Promise<void> {
  await persistence.insertProtectedActionAudit({
    action: "run_system",
    participant_id: input.participant_id,
    actor_email: input.actor_email,
    membership_state: "active",
    global_state: "active",
    role: input.role ?? "operator",
    allowed: false,
    reason_code: "NOTION_SYNC_FAILED",
    why: input.why,
    linked_idempotency_key: input.linked_idempotency_key,
    organization_id: input.organization_id,
    cycle_id: input.cycle_id,
    root_problem_version_id: input.root_problem_version_id,
    created_at: now(),
  });
}

async function tryWriteNotionCardRecord(
  persistence: PersistenceAdapter,
  config: RuntimeConfig,
  input: {
    database_id?: string;
    title: string;
    fields: Record<string, string | number | boolean | undefined>;
    aliases?: Record<string, string[]>;
    workspace: ThreadWorkspaceResponse;
    actor_email?: string;
    participant_id?: string;
    role?: "student" | "moderator" | "facilitator" | "operator";
    linked_idempotency_key?: string;
  },
  now: () => string,
): Promise<void> {
  if (!config.notion_integration_token || !input.database_id) {
    return;
  }

  const cardStack = mapWorkspaceToCardStack(input.workspace, config.focus_snapshot);
  try {
    const created = await createNotionCardPage(
      input.database_id,
      {
        title: input.title,
        fields: input.fields,
        aliases: input.aliases,
        cardStack,
        idempotency_key: input.linked_idempotency_key,
      },
      config,
    );
    if (!created) {
      await logNotionSyncFailure(
        persistence,
        {
          actor_email: input.actor_email,
          participant_id: input.participant_id,
          role: input.role,
          organization_id: input.workspace.organization_id,
          cycle_id: input.workspace.cycle_id,
          root_problem_version_id: input.workspace.root_problem_version_id,
          linked_idempotency_key: input.linked_idempotency_key,
          why: "Notion card page returned null.",
        },
        now,
      );
    }
  } catch (error) {
    await logNotionSyncFailure(
      persistence,
      {
        actor_email: input.actor_email,
        participant_id: input.participant_id,
        role: input.role,
        organization_id: input.workspace.organization_id,
        cycle_id: input.workspace.cycle_id,
        root_problem_version_id: input.workspace.root_problem_version_id,
        linked_idempotency_key: input.linked_idempotency_key,
        why: `Notion card write failed: ${error instanceof Error ? error.message : "unknown error"}`,
      },
      now,
    );
  }
}

async function tryInsertModelRun(
  persistence: PersistenceAdapter,
  input: {
    organization_id: string;
    cycle_id: string;
    root_problem_version_id: string;
    thread_id?: string;
    participant_id?: string;
    action_type: "guided_round" | "lab_brief_proposal";
    metadata: PlannerRunMetadata;
  },
  now: () => string,
): Promise<void> {
  try {
    await persistence.insertModelRun({
      organization_id: input.organization_id,
      cycle_id: input.cycle_id,
      root_problem_version_id: input.root_problem_version_id,
      thread_id: input.thread_id,
      participant_id: input.participant_id,
      action_type: input.action_type,
      provider: input.metadata.provider,
      model_name: input.metadata.model_name,
      status: input.metadata.status,
      prompt_contract_version: input.metadata.prompt_contract_version,
      latency_ms: input.metadata.latency_ms,
      estimated_cost_usd: input.metadata.estimated_cost_usd,
      fallback_reason: input.metadata.fallback_reason,
      created_at: now(),
    });
  } catch {
    telemetryWriteFailedCount += 1;
  }
}

async function startGuidedRoundIfEligible(
  persistence: PersistenceAdapter,
  config: RuntimeConfig,
  input: {
    organization_id: string;
    cycle_id: string;
    root_problem_version_id: string;
    thread_id: string;
    participant_id: string;
  },
  now: () => string,
): Promise<
  | { ok: true; reason_code: "ROUND_ALREADY_ACTIVE" | "ROUND_STARTED"; round: Awaited<ReturnType<PersistenceAdapter["createGuidedRound"]>>; items: Awaited<ReturnType<PersistenceAdapter["insertGuidedQuestionItems"]>> }
  | { ok: false; reason_code: string; message?: string; max_rounds?: number }
> {
  const rounds = await persistence.listGuidedRoundsForThread(input.thread_id, input.cycle_id);
  const active = rounds.find((round) => round.status === "active");
  if (active) {
    const items = await persistence.listGuidedQuestionItems(active.round_id);
    return { ok: true, reason_code: "ROUND_ALREADY_ACTIVE", round: active, items };
  }
  if (rounds.length >= 3) {
    return { ok: false, reason_code: "QUESTIONS_ROUND_LIMIT_REACHED", max_rounds: 3 };
  }

  const sources = await persistence.listSourcesForThread(input.thread_id, input.cycle_id);
  const briefs = await persistence.listStarterBriefsForThread(input.thread_id, input.cycle_id);
  const source = sources[sources.length - 1];
  const starter = briefs[briefs.length - 1];
  if (!source || !starter || starter.status !== "ready") {
    return { ok: false, reason_code: "LAB_BRIEF_DRAFT_NOT_READY", message: "Starter draft not ready yet." };
  }

  const planner = await generateGuidedRoundWithProvider(
    {
      focus_snapshot: config.focus_snapshot,
      source_url: source.raw_url,
      source_takeaway: readString(starter.payload as Record<string, unknown>, "source_takeaway"),
      combined_insight: readString(starter.payload as Record<string, unknown>, "combined_insight"),
      tension_or_assumption: readString(starter.payload as Record<string, unknown>, "tension_or_assumption"),
      next_best_move: readString(starter.payload as Record<string, unknown>, "next_best_move"),
    },
    config,
  );

  await tryInsertModelRun(
    persistence,
    {
      organization_id: input.organization_id,
      cycle_id: input.cycle_id,
      root_problem_version_id: input.root_problem_version_id,
      thread_id: input.thread_id,
      participant_id: input.participant_id,
      action_type: "guided_round",
      metadata: planner.metadata,
    },
    now,
  );

  const round = await persistence.createGuidedRound({
    thread_id: input.thread_id,
    organization_id: input.organization_id,
    cycle_id: input.cycle_id,
    root_problem_version_id: input.root_problem_version_id,
    participant_id: input.participant_id,
    round_number: rounds.length + 1,
    status: "active",
    summary: undefined,
  });

  const items = await persistence.insertGuidedQuestionItems(
    planner.payload.map((item) => ({
      round_id: round.round_id,
      thread_id: input.thread_id,
      organization_id: input.organization_id,
      cycle_id: input.cycle_id,
      root_problem_version_id: input.root_problem_version_id,
      participant_id: input.participant_id,
      ordinal: item.ordinal,
      prompt: item.prompt,
      options: item.options,
      recommended_option: item.recommended_option,
    })),
  );

  return { ok: true, reason_code: "ROUND_STARTED", round, items };
}

export async function handleRequest(request: Request, deps: EdgeHandlerDeps = {}): Promise<Response> {
  const fallback = getDefaultContext();
  const persistence = deps.persistence ?? fallback.persistence;
  const config = deps.config ?? fallback.config;
  const now = deps.now ?? (() => new Date().toISOString());

  const url = new URL(request.url);

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
        <div class="btnrow">
          <a class="btn" href="/app">Open Lab Workspace</a>
          <a class="btn secondary" href="${notionHref}">Open Notion Workspace</a>
        </div>
      </section>
      <section class="card">
        <h2 class="section">My Work</h2>
        <p class="copy">Review your thread, improve signal quality, and keep momentum in one place.</p>
      </section>
      <section class="card">
        <h2 class="section">Lab Record</h2>
        <p class="copy">When work meets criteria, use <strong>Add to Lab Record</strong> with explicit confirmation.</p>
        <div class="btnrow">
          <a class="btn secondary" href="/health">Check Runtime Health</a>
        </div>
        <p class="note">System proposes. Lab Team decides. No auto-publish.</p>
      </section>
    </main>
  </body>
</html>`,
    );
  }

  if (request.method === "GET" && url.pathname === "/app") {
    const session = await readSessionClaims(request, config.session_secret);
    const cycleId = url.searchParams.get("cycle_id") ?? session?.cycle_id ?? config.default_cycle_id;
    const organizationId = url.searchParams.get("organization_id") ?? session?.organization_id ?? config.organization_id;
    const actorEmail = session?.actor_email ?? "";
    const authStartPath = `/api/auth/google/start?cycle_id=${encodeURIComponent(cycleId)}&organization_id=${encodeURIComponent(
      organizationId,
    )}&next=${encodeURIComponent(`/app?cycle_id=${cycleId}&organization_id=${organizationId}`)}`;

    const participantContext = actorEmail
      ? await resolveParticipantContext(persistence, config, organizationId, actorEmail, cycleId)
      : null;
    const participantId =
      participantContext && participantContext.ok && participantContext.participant
        ? participantContext.participant.participant_id
        : undefined;
    const threads = participantId ? await persistence.listVisibleThreads(participantId, cycleId) : [];
    const latestThread = threads.length > 0 ? threads[threads.length - 1] : undefined;

    return html(
      200,
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Lab Workspace | Applied AI Labs</title>
    <style>
      :root { --ink: #1f2d56; --muted: #55617d; --bg: #f7f9fc; --card: #ffffff; --line: #dbe1ef; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; background: linear-gradient(180deg, var(--bg), #eef3fb); color: var(--ink); }
      main { max-width: 860px; margin: 0 auto; padding: 28px 18px 44px; }
      .brand { margin: 0 0 12px; max-width: 280px; width: 100%; }
      .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px; box-shadow: 0 14px 40px rgba(31,45,86,0.06); margin-bottom: 12px; }
      h1 { margin: 0 0 6px; font-size: 28px; }
      p { margin: 6px 0; line-height: 1.45; color: var(--muted); }
      .focus { font-weight: 600; color: var(--ink); }
      .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
      a.btn { display: inline-block; text-decoration: none; border-radius: 10px; padding: 10px 14px; font-size: 14px; }
      a.primary { background: var(--ink); color: #fff; }
      a.secondary { border: 1px solid var(--line); color: var(--ink); background: #fff; }
      .notice { margin-top: 12px; font-size: 13px; color: #ad7a00; }
    </style>
  </head>
  <body>
    <main>
      <img class="brand" src="/branding/applied-ai-labs-logo.svg" alt="Applied AI Labs logo" />
      <section class="card">
        <h1>Lab Workspace</h1>
        <p class="focus">${escapeHtml(config.focus_snapshot)}</p>
        <p>How can students stay fluent with AI as tools and norms keep changing?</p>
        ${
          actorEmail
            ? `<p><strong>Signed in as:</strong> ${escapeHtml(actorEmail)}</p>`
            : `<p><strong>Sign in required</strong> to open your thread cards.</p>`
        }
        <div class="row">
          ${
            actorEmail
              ? `<a class="btn primary" href="/submit?cycle_id=${encodeURIComponent(cycleId)}&organization_id=${encodeURIComponent(
                  organizationId,
                )}">Add a Source</a>`
              : `<a class="btn primary" href="${authStartPath}">Sign in with Google</a>`
          }
          ${
            latestThread
              ? `<a class="btn secondary" href="/thread?thread_id=${encodeURIComponent(latestThread.thread_id)}&cycle_id=${encodeURIComponent(
                  cycleId,
                )}&organization_id=${encodeURIComponent(organizationId)}">Open Latest Thread</a>`
              : `<a class="btn secondary" href="${escapeHtml(config.notion_root_page_url ?? "/")}">Open Notion Workspace</a>`
          }
        </div>
        ${
          participantContext && !participantContext.ok
            ? `<p class="notice">Blocked: ${escapeHtml(participantContext.reason_code)}</p>`
            : ""
        }
      </section>
    </main>
  </body>
</html>`,
    );
  }

  if (request.method === "GET" && url.pathname === "/thread") {
    const session = await readSessionClaims(request, config.session_secret);
    const cycleId = url.searchParams.get("cycle_id") ?? session?.cycle_id ?? config.default_cycle_id;
    const organizationId = url.searchParams.get("organization_id") ?? session?.organization_id ?? config.organization_id;
    const threadId = url.searchParams.get("thread_id") ?? "";
    const actorEmail = session?.actor_email ?? "";
    const authStartPath = `/api/auth/google/start?cycle_id=${encodeURIComponent(cycleId)}&organization_id=${encodeURIComponent(
      organizationId,
    )}&next=${encodeURIComponent(`/thread?thread_id=${threadId}&cycle_id=${cycleId}&organization_id=${organizationId}`)}`;

    if (!threadId) {
      return html(302, "", { location: `/app?cycle_id=${encodeURIComponent(cycleId)}&organization_id=${encodeURIComponent(organizationId)}` });
    }

    if (!actorEmail) {
      return html(
        200,
        `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;padding:24px;"><p>Sign in to open this thread.</p><a href="${authStartPath}">Sign in with Google</a></body></html>`,
      );
    }

    const participantContext = await resolveParticipantContext(persistence, config, organizationId, actorEmail, cycleId);
    if (!participantContext.ok) {
      return html(
        403,
        `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;padding:24px;"><p>Blocked: ${escapeHtml(
          participantContext.reason_code,
        )}</p><a href="/app?cycle_id=${encodeURIComponent(cycleId)}&organization_id=${encodeURIComponent(organizationId)}">Back to Lab Workspace</a></body></html>`,
      );
    }
    const participant = participantContext.participant;
    if (!participant) {
      return html(
        403,
        `<!doctype html><html><body style="font-family:Helvetica,Arial,sans-serif;padding:24px;"><p>Blocked: NO_MEMBERSHIP_FOR_CYCLE</p><a href="/app?cycle_id=${encodeURIComponent(cycleId)}&organization_id=${encodeURIComponent(organizationId)}">Back to Lab Workspace</a></body></html>`,
      );
    }

    const workspace = await buildThreadWorkspace(persistence, config, {
      organization_id: organizationId,
      cycle_id: cycleId,
      thread_id: threadId,
    });
    const detailViewRequested = url.searchParams.get("view") === "details";
    const canUseDetailView = participant.global_role === "operator" || participant.global_role === "admin";
    const detailView = detailViewRequested && canUseDetailView;
    const cardStack = mapWorkspaceToCardStack(workspace, config.focus_snapshot);
    const simpleView = mapWorkspaceToStudentSimpleView(workspace, config.focus_snapshot);
    const simpleStackHtml = renderCardsHtml({
      status_chip: simpleView.status_chip,
      status_label: simpleView.status_label,
      next_best_action: simpleView.next_best_action,
      cards: simpleView.cards,
    });
    const unanswered = (workspace.question_items ?? []).filter((item) => !item.selected_option);
    const readinessClaim = workspace.readiness?.passed_criteria.includes("claim") ?? false;
    const readinessValue = workspace.readiness?.passed_criteria.includes("value") ?? false;
    const readinessDifference = workspace.readiness?.passed_criteria.includes("difference") ?? false;
    const stage = workspace.current_stage ?? "source_ready";
    const detailsHref = `/thread?thread_id=${encodeURIComponent(threadId)}&cycle_id=${encodeURIComponent(cycleId)}&organization_id=${encodeURIComponent(
      organizationId,
    )}&view=details`;

    if (!detailView) {
      return html(
        200,
        `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Thread | Applied AI Labs</title>
    <style>
      :root { --ink: #1f2d56; --muted: #55617d; --bg: #f7f9fc; --card: #ffffff; --line: #dbe1ef; --ok:#1f7a4d; --warn:#ad7a00; --bad:#a33333; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; background: linear-gradient(180deg, var(--bg), #eef3fb); color: var(--ink); }
      main { max-width: 900px; margin: 0 auto; padding: 26px 18px 50px; }
      .brand { margin: 0 0 12px; max-width: 280px; width: 100%; }
      .status-callout, .card, .next-step { transition: transform 200ms ease, box-shadow 200ms ease; }
      .status-callout:hover, .card:hover, .next-step:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(31,45,86,0.08); }
      .status-callout { border-radius: 12px; border: 1px solid var(--line); background: #fff; padding: 12px 14px; margin-bottom: 12px; position: sticky; top: 10px; z-index: 1; }
      .status-ready { border-color: #b8e5c8; background: #ecf8f1; }
      .status-needs_refinement { border-color: #f0db8d; background: #fff7db; }
      .status-blocked { border-color: #f5bcbc; background: #fdeeee; }
      .card { background: #fff; border: 1px solid var(--line); border-radius: 12px; margin-bottom: 12px; padding: 14px; }
      .card-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .card-head h2 { margin:0; font-size:20px; }
      .chip { border-radius: 20px; padding: 4px 10px; font-size: 12px; text-transform: uppercase; border: 1px solid var(--line); }
      .chip-ready { background:#ecf8f1; border-color:#b8e5c8; color:var(--ok); }
      .chip-needs_refinement { background:#fff7db; border-color:#f0db8d; color:var(--warn); }
      .chip-blocked { background:#fdeeee; border-color:#f5bcbc; color:var(--bad); }
      .chip-info { background:#f2f5fb; border-color:#dbe1ef; color:var(--muted); }
      p { margin: 6px 0; line-height:1.45; color: var(--muted); }
      details { margin-top: 10px; }
      summary { cursor: pointer; color: var(--ink); }
      dt { font-weight: 600; margin-top: 6px; color: var(--ink); }
      dd { margin: 2px 0 0 0; color: var(--muted); }
      .next-step { background:#fff; border:1px solid var(--line); border-radius:12px; padding:14px; margin-top: 14px; }
      .next-step h3 { margin: 0; font-size: 18px; }
      .progress { color: var(--muted); font-size: 13px; margin-top: 6px; }
      .row { display:flex; gap:8px; flex-wrap:wrap; margin-top: 10px; align-items: center; }
      button, a.btn { border-radius:10px; padding: 9px 12px; border:1px solid var(--line); background:#fff; color:var(--ink); text-decoration:none; cursor:pointer; }
      button.primary { background: var(--ink); color:#fff; border-color: var(--ink); }
      .question { border: 1px dashed var(--line); border-radius: 10px; padding: 12px; margin-top: 10px; }
      .helper { margin-top: 4px; font-size: 13px; color: var(--muted); }
      .status-msg { margin-top:10px; font-size:13px; color:var(--muted); }
      .link { color: var(--ink); font-size: 13px; text-decoration: underline; }
      @media (prefers-reduced-motion: reduce) { .status-callout, .card, .next-step { transition: none; } }
    </style>
  </head>
  <body>
    <main>
      <img class="brand" src="/branding/applied-ai-labs-logo.svg" alt="Applied AI Labs logo" />
      ${simpleStackHtml}
      <section class="next-step">
        <h3>One Next Step</h3>
        <p class="progress">${escapeHtml(simpleView.progress_label ?? "Current step")}</p>
        <p>${escapeHtml(simpleView.next_best_action)}</p>
        ${
          stage === "round_in_progress" && simpleView.next_question
            ? `<div class="question">
                <p><strong>Quick Question ${simpleView.next_question.ordinal} of 5</strong></p>
                <p>${escapeHtml(simpleView.next_question.prompt)}</p>
                <p class="helper">Pick the option that best matches your current thinking.</p>
                <div class="row">
                  ${simpleView.next_question.options
                    .map(
                      (opt) =>
                        `<button class="answer-btn" data-qid="${escapeHtml(simpleView.next_question!.question_item_id)}" data-opt="${escapeHtml(
                          opt.code,
                        )}">${escapeHtml(opt.code)}: ${escapeHtml(opt.text)}</button>`,
                    )
                    .join("")}
                </div>
              </div>`
            : ""
        }
        <div class="row">
          ${
            stage === "source_ready"
              ? `<a class="btn primary" href="/submit?cycle_id=${encodeURIComponent(cycleId)}&organization_id=${encodeURIComponent(organizationId)}">Add a Source</a>`
              : stage === "draft_ready"
                ? `<button id="refresh" class="primary">${escapeHtml(simpleView.primary_action_label ?? "Refresh")}</button>`
                : stage === "round_complete"
                  ? `<button id="propose-brief" class="primary">${escapeHtml(simpleView.primary_action_label ?? "Create Lab Brief Draft")}</button>`
                  : stage === "brief_ready"
                    ? `<button id="quality-check" class="primary">${escapeHtml(simpleView.primary_action_label ?? "Run Quality Check")}</button>`
                    : stage === "ready_to_publish"
                      ? `<button id="publish" class="primary">${escapeHtml(simpleView.primary_action_label ?? "Add to Lab Record")}</button>`
                      : stage === "published"
                        ? `<a class="btn primary" href="/submit?cycle_id=${encodeURIComponent(cycleId)}&organization_id=${encodeURIComponent(
                            organizationId,
                          )}">Add Another Source</a>`
                        : `<button id="start-round" class="primary">${escapeHtml(simpleView.primary_action_label ?? "Start Quick Questions")}</button>`
          }
          <a class="btn" href="/app?cycle_id=${encodeURIComponent(cycleId)}&organization_id=${encodeURIComponent(organizationId)}">Back to Lab Workspace</a>
        </div>
        ${
          stage === "ready_to_publish"
            ? `<div class="row"><label><input type="checkbox" id="confirm" /> I confirm this is ready for Lab Record.</label></div>`
            : ""
        }
        ${canUseDetailView ? `<div class="row"><a class="link" href="${detailsHref}">Show details</a></div>` : ""}
        <div id="status-msg" class="status-msg"></div>
      </section>
    </main>
    <script>
      const threadId = ${JSON.stringify(threadId)};
      const cycleId = ${JSON.stringify(cycleId)};
      const organizationId = ${JSON.stringify(organizationId)};
      const stage = ${JSON.stringify(stage)};
      const readinessSignals = {
        claim: ${JSON.stringify(readinessClaim)},
        value: ${JSON.stringify(readinessValue)},
        difference: ${JSON.stringify(readinessDifference)},
      };
      const statusMsg = document.getElementById("status-msg");
      const setStatus = (msg) => { if (statusMsg) statusMsg.textContent = msg; };
      const requestId = () => ((globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : String(Date.now()));

      document.getElementById("refresh")?.addEventListener("click", () => globalThis.location.reload());

      document.getElementById("start-round")?.addEventListener("click", async () => {
        setStatus("Starting quick questions...");
        const response = await fetch("/api/questions/round/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ thread_id: threadId, cycle_id: cycleId, organization_id: organizationId, client_request_id: requestId() }),
        });
        const body = await response.json();
        setStatus(response.ok ? "Quick questions ready." : "Blocked: " + (body.reason_code || "UNKNOWN"));
        if (response.ok) globalThis.location.reload();
      });

      document.querySelectorAll(".answer-btn").forEach((button) => {
        button.addEventListener("click", async () => {
          const qid = button.getAttribute("data-qid");
          const opt = button.getAttribute("data-opt");
          setStatus("Saving answer...");
          const response = await fetch("/api/questions/answer", {
            method: "POST",
            headers: { "content-type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ thread_id: threadId, cycle_id: cycleId, organization_id: organizationId, question_item_id: qid, selected_option: opt, client_request_id: requestId() }),
          });
          const body = await response.json();
          setStatus(response.ok ? "Answer saved." : "Blocked: " + (body.reason_code || "UNKNOWN"));
          if (response.ok) globalThis.location.reload();
        });
      });

      document.getElementById("propose-brief")?.addEventListener("click", async () => {
        setStatus("Creating Lab Brief Draft...");
        const response = await fetch("/api/lab-brief/propose", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ thread_id: threadId, cycle_id: cycleId, organization_id: organizationId, client_request_id: requestId() }),
        });
        const body = await response.json();
        setStatus(response.ok ? "Lab Brief Draft ready." : "Blocked: " + (body.reason_code || "UNKNOWN"));
        if (response.ok) globalThis.location.reload();
      });

      document.getElementById("quality-check")?.addEventListener("click", async () => {
        setStatus("Running quality check...");
        const response = await fetch("/api/actions/readiness/evaluate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            thread_id: threadId,
            cycle_id: cycleId,
            organization_id: organizationId,
            claim: readinessSignals.claim,
            value: readinessSignals.value,
            difference: readinessSignals.difference,
            explicit_confirmation: false,
            client_request_id: requestId(),
          }),
        });
        const body = await response.json();
        setStatus(response.ok ? "Quality check: " + body.reason_code : "Blocked: " + (body.reason_code || "UNKNOWN"));
        if (response.ok) globalThis.location.reload();
      });

      document.getElementById("publish")?.addEventListener("click", async () => {
        const explicitConfirmation = document.getElementById("confirm")?.checked === true;
        setStatus("Publishing...");
        const response = await fetch("/api/actions/publish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            thread_id: threadId,
            cycle_id: cycleId,
            organization_id: organizationId,
            claim: readinessSignals.claim,
            value: readinessSignals.value,
            difference: readinessSignals.difference,
            explicit_confirmation: explicitConfirmation,
            client_request_id: requestId(),
          }),
        });
        const body = await response.json();
        setStatus(response.ok ? "Added to Lab Record." : "Blocked: " + (body.reason_code || "UNKNOWN"));
        if (response.ok) globalThis.location.reload();
      });
    </script>
  </body>
</html>`,
      );
    }

    return html(
      200,
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Thread Cards | Applied AI Labs</title>
    <style>
      :root { --ink: #1f2d56; --muted: #55617d; --bg: #f7f9fc; --card: #ffffff; --line: #dbe1ef; --ok:#1f7a4d; --warn:#ad7a00; --bad:#a33333; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; background: linear-gradient(180deg, var(--bg), #eef3fb); color: var(--ink); }
      main { max-width: 900px; margin: 0 auto; padding: 26px 18px 50px; }
      .brand { margin: 0 0 12px; max-width: 280px; width: 100%; }
      .status-callout { border-radius: 12px; border: 1px solid var(--line); background: #fff; padding: 12px 14px; margin-bottom: 12px; }
      .status-ready { border-color: #b8e5c8; background: #ecf8f1; }
      .status-needs_refinement { border-color: #f0db8d; background: #fff7db; }
      .status-blocked { border-color: #f5bcbc; background: #fdeeee; }
      .card { background: #fff; border: 1px solid var(--line); border-radius: 12px; margin-bottom: 12px; padding: 14px; }
      .card-head { display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .card-head h2 { margin:0; font-size:20px; }
      .chip { border-radius: 20px; padding: 4px 10px; font-size: 12px; text-transform: uppercase; border: 1px solid var(--line); }
      .chip-ready { background:#ecf8f1; border-color:#b8e5c8; color:var(--ok); }
      .chip-needs_refinement { background:#fff7db; border-color:#f0db8d; color:var(--warn); }
      .chip-blocked { background:#fdeeee; border-color:#f5bcbc; color:var(--bad); }
      .chip-info { background:#f2f5fb; border-color:#dbe1ef; color:var(--muted); }
      p { margin: 6px 0; line-height:1.45; color: var(--muted); }
      ul { margin: 8px 0 0 18px; color: var(--muted); }
      details { margin-top: 10px; }
      summary { cursor: pointer; color: var(--ink); }
      dt { font-weight: 600; margin-top: 6px; color: var(--ink); }
      dd { margin: 2px 0 0 0; color: var(--muted); }
      .actions { background:#fff; border:1px solid var(--line); border-radius:12px; padding:14px; margin-top: 14px; }
      .row { display:flex; gap:8px; flex-wrap:wrap; margin-top: 8px; }
      button, a.btn { border-radius:10px; padding: 9px 12px; border:1px solid var(--line); background:#fff; color:var(--ink); text-decoration:none; cursor:pointer; }
      button.primary { background: var(--ink); color:#fff; border-color: var(--ink); }
      .q { border-top:1px dashed var(--line); padding-top:10px; margin-top:10px; }
      .status-msg { margin-top:10px; font-size:13px; color:var(--muted); }
      textarea { width:100%; min-height:90px; border:1px solid var(--line); border-radius:8px; padding:8px; }
      .check-row { display:flex; gap:12px; flex-wrap:wrap; margin-top:8px; }
    </style>
  </head>
  <body>
    <main>
      <img class="brand" src="/branding/applied-ai-labs-logo.svg" alt="Applied AI Labs logo" />
      ${renderCardsHtml(cardStack)}
      <section class="actions">
        <h3 style="margin:0;">Thread Actions</h3>
        <div class="row">
          <button id="start-round" class="primary">Start/Continue Guided Round</button>
          <button id="propose-brief">Generate Lab Brief Proposal</button>
          <a class="btn" href="/submit?cycle_id=${encodeURIComponent(cycleId)}&organization_id=${encodeURIComponent(organizationId)}">Add Another Source</a>
          <a class="btn" href="/app?cycle_id=${encodeURIComponent(cycleId)}&organization_id=${encodeURIComponent(organizationId)}">Back to Lab Workspace</a>
        </div>
        ${
          unanswered.length > 0
            ? `<div id="questions">
                ${unanswered
                  .map(
                    (item) => `<div class="q">
                      <p><strong>Q${item.ordinal}.</strong> ${escapeHtml(item.prompt)}</p>
                      <div class="row">
                        ${(item.options ?? [])
                          .map(
                            (opt) =>
                              `<button data-qid="${escapeHtml(item.question_item_id)}" data-opt="${escapeHtml(opt.code)}">${escapeHtml(opt.code)}: ${escapeHtml(opt.text)}</button>`,
                          )
                          .join("")}
                      </div>
                    </div>`,
                  )
                  .join("")}
              </div>`
            : `<p>No unanswered guided questions.</p>`
        }
        <div style="margin-top:10px;">
          <p style="margin:6px 0 4px;"><strong>Readiness Check</strong></p>
          <div class="check-row">
            <label><input type="checkbox" id="claim" /> claim</label>
            <label><input type="checkbox" id="value" /> value</label>
            <label><input type="checkbox" id="difference" /> difference</label>
            <label><input type="checkbox" id="confirm" /> explicit confirmation</label>
          </div>
          <div class="row">
            <button id="evaluate-readiness">Evaluate Readiness</button>
            <button id="publish" class="primary">Add to Lab Record</button>
          </div>
        </div>
        <div id="status-msg" class="status-msg"></div>
      </section>
    </main>
    <script>
      const threadId = ${JSON.stringify(threadId)};
      const cycleId = ${JSON.stringify(cycleId)};
      const organizationId = ${JSON.stringify(organizationId)};
      const statusMsg = document.getElementById(\"status-msg\");
      const setStatus = (msg) => { statusMsg.textContent = msg; };
      const requestId = () => ((globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : String(Date.now()));

      document.getElementById(\"start-round\")?.addEventListener(\"click\", async () => {
        setStatus(\"Starting guided round...\");
        const response = await fetch(\"/api/questions/round/start\", {
          method: \"POST\",
          headers: { \"content-type\": \"application/json\" },
          credentials: \"include\",
          body: JSON.stringify({ thread_id: threadId, cycle_id: cycleId, organization_id: organizationId, client_request_id: requestId() }),
        });
        const body = await response.json();
        setStatus(response.ok ? \"Guided round ready.\" : \"Blocked: \" + (body.reason_code || \"UNKNOWN\"));
        if (response.ok) location.reload();
      });

      document.querySelectorAll(\"#questions button[data-qid]\").forEach((button) => {
        button.addEventListener(\"click\", async () => {
          const questionId = button.getAttribute(\"data-qid\");
          const option = button.getAttribute(\"data-opt\");
          setStatus(\"Saving answer...\");
          const response = await fetch(\"/api/questions/answer\", {
            method: \"POST\",
            headers: { \"content-type\": \"application/json\" },
            credentials: \"include\",
            body: JSON.stringify({ thread_id: threadId, cycle_id: cycleId, organization_id: organizationId, question_item_id: questionId, selected_option: option }),
          });
          const body = await response.json();
          setStatus(response.ok ? \"Answer saved.\" : \"Blocked: \" + (body.reason_code || \"UNKNOWN\"));
          if (response.ok) location.reload();
        });
      });

      document.getElementById(\"propose-brief\")?.addEventListener(\"click\", async () => {
        setStatus(\"Generating Lab Brief proposal...\");
        const response = await fetch(\"/api/lab-brief/propose\", {
          method: \"POST\",
          headers: { \"content-type\": \"application/json\" },
          credentials: \"include\",
          body: JSON.stringify({ thread_id: threadId, cycle_id: cycleId, organization_id: organizationId, client_request_id: requestId() }),
        });
        const body = await response.json();
        setStatus(response.ok ? \"Lab Brief proposal ready.\" : \"Blocked: \" + (body.reason_code || \"UNKNOWN\"));
        if (response.ok) location.reload();
      });

      document.getElementById(\"evaluate-readiness\")?.addEventListener(\"click\", async () => {
        setStatus(\"Evaluating readiness...\");
        const payload = {
          thread_id: threadId,
          cycle_id: cycleId,
          organization_id: organizationId,
          claim: document.getElementById(\"claim\").checked,
          value: document.getElementById(\"value\").checked,
          difference: document.getElementById(\"difference\").checked,
          explicit_confirmation: document.getElementById(\"confirm\").checked,
        };
        const response = await fetch(\"/api/actions/readiness/evaluate\", {
          method: \"POST\",
          headers: { \"content-type\": \"application/json\" },
          credentials: \"include\",
          body: JSON.stringify(payload),
        });
        const body = await response.json();
        setStatus(response.ok ? \"Readiness: \" + body.reason_code : \"Blocked: \" + (body.reason_code || \"UNKNOWN\"));
      });

      document.getElementById(\"publish\")?.addEventListener(\"click\", async () => {
        setStatus(\"Publishing...\");
        const response = await fetch(\"/api/actions/publish\", {
          method: \"POST\",
          headers: { \"content-type\": \"application/json\" },
          credentials: \"include\",
          body: JSON.stringify({
            thread_id: threadId,
            cycle_id: cycleId,
            organization_id: organizationId,
            claim: document.getElementById(\"claim\").checked,
            value: document.getElementById(\"value\").checked,
            difference: document.getElementById(\"difference\").checked,
            explicit_confirmation: document.getElementById(\"confirm\").checked,
            client_request_id: requestId(),
          }),
        });
        const body = await response.json();
        setStatus(response.ok ? \"Published to Lab Record.\" : \"Blocked: \" + (body.reason_code || \"UNKNOWN\"));
        if (response.ok) location.reload();
      });
    </script>
  </body>
</html>`,
    );
  }

  if (request.method === "GET" && url.pathname === "/submit") {
    const session = await readSessionClaims(request, config.session_secret);
    const cycleId = url.searchParams.get("cycle_id") ?? session?.cycle_id ?? config.default_cycle_id;
    const organizationId = url.searchParams.get("organization_id") ?? session?.organization_id ?? config.organization_id;
    const actorEmail = session?.actor_email ?? "";
    const studentFocusQuestion = "How can students stay fluent with AI as tools and norms keep changing?";
    const authStartPath = `/api/auth/google/start?cycle_id=${encodeURIComponent(cycleId)}&organization_id=${encodeURIComponent(
      organizationId,
    )}&next=${encodeURIComponent(`/submit?cycle_id=${cycleId}&organization_id=${organizationId}`)}`;

    const safeEmail = escapeHtml(actorEmail);
    const safeFocusQuestion = escapeHtml(studentFocusQuestion);

    return html(
      200,
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Add a Source | Applied AI Labs</title>
    <style>
      :root { --ink: #1f2d56; --muted: #55617d; --bg: #f7f9fc; --card: #ffffff; --line: #dbe1ef; --ok: #1f7a4d; --warn: #ad7a00; --bad: #a33333; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; background: linear-gradient(180deg, var(--bg), #eef3fb); color: var(--ink); }
      main { max-width: 760px; margin: 0 auto; padding: 28px 18px 44px; }
      .brand { margin: 0 0 8px; max-width: 300px; width: 100%; }
      .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 22px; box-shadow: 0 14px 40px rgba(31,45,86,0.06); }
      h1 { margin: 0; font-size: 30px; line-height: 1.2; }
      p { color: var(--muted); margin: 8px 0 0; line-height: 1.5; }
      .focus { margin: 14px 0 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: #f9fbff; }
      .focus .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin: 0; }
      .focus .question { margin: 6px 0 0; color: var(--ink); font-weight: 600; line-height: 1.4; }
      .meta { margin: 14px 0 0; font-size: 13px; color: var(--muted); }
      .meta strong { color: var(--ink); }
      label { display: block; font-size: 14px; font-weight: 600; margin-top: 16px; color: var(--ink); }
      input, textarea { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; font-size: 15px; margin-top: 8px; }
      textarea { min-height: 120px; resize: vertical; font-family: inherit; }
      .hint { font-size: 12px; color: var(--muted); margin-top: 6px; }
      .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 18px; }
      button, a.btn { border: 0; border-radius: 10px; padding: 11px 14px; font-size: 14px; text-decoration: none; cursor: pointer; display: inline-block; }
      button.primary { background: var(--ink); color: #fff; }
      a.btn.secondary { background: #fff; color: var(--ink); border: 1px solid var(--line); }
      .status { margin-top: 14px; border-radius: 10px; padding: 10px 12px; font-size: 13px; display: none; border: 1px solid transparent; }
      .status.processing { display: block; color: #775d0b; background: #fff7db; border-color: #f0db8d; }
      .status.ready { display: block; color: var(--ok); background: #ecf8f1; border-color: #b8e5c8; }
      .status.error { display: block; color: var(--bad); background: #fdeeee; border-color: #f5bcbc; }
    </style>
  </head>
  <body>
    <main>
      <img class="brand" src="/branding/applied-ai-labs-logo.svg" alt="Applied AI Labs logo" />
      <section class="card">
        <h1>Add a Source</h1>
        <p>Paste one article link and add 2-3 sentences on how it relates to the Focus Question.</p>
        <p>We build your initial thread using your article, your note, and our analysis of both.</p>
        <div class="focus">
          <p class="label">Focus Question</p>
          <p class="question">${safeFocusQuestion}</p>
        </div>
        ${
          actorEmail
            ? `<p class="meta"><strong>Signed in as:</strong> ${safeEmail}</p>`
            : `<p class="meta"><strong>Sign-in required.</strong> Use Google login before submitting.</p>`
        }
        ${
          actorEmail
            ? `<form id="source-form">
          <label for="url">Article URL</label>
          <input id="url" name="url" type="url" required placeholder="https://..." />
          <label for="relevance_note">Why this article matters</label>
          <textarea id="relevance_note" name="relevance_note" maxlength="500" required placeholder="2-3 sentences. Keep it specific."></textarea>
          <div class="hint">500 character max. Keep it clear and practical.</div>
          <div class="row">
            <button class="primary" type="submit">Create My Thread</button>
            <a class="btn secondary" href="${config.notion_root_page_url ?? "/"}">Back to Lab Workspace</a>
          </div>
          <div id="status" class="status"></div>
        </form>
        <script>
          const form = document.getElementById("source-form");
          const statusEl = document.getElementById("status");
          const cycleId = ${JSON.stringify(cycleId)};
          const organizationId = ${JSON.stringify(organizationId)};
          form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const data = new FormData(form);
            const payload = {
              url: String(data.get("url") || "").trim(),
              relevance_note: String(data.get("relevance_note") || "").trim(),
              cycle_id: cycleId,
              organization_id: organizationId,
              client_request_id: (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : String(Date.now()),
            };

            statusEl.className = "status processing";
            statusEl.textContent = "Processing starter brief...";

            try {
              const response = await fetch("/api/sources/submit", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload),
              });
              const body = await response.json();
              if (!response.ok || body.ok === false) {
                statusEl.className = "status error";
                statusEl.textContent = "Blocked: " + (body.reason_code || "UNKNOWN_ERROR");
                return;
              }

              statusEl.className = "status ready";
              statusEl.textContent = "Ready: Initial Thread Draft created.";
              if (body.thread_id) {
                const next = "/thread?thread_id=" + encodeURIComponent(body.thread_id) + "&cycle_id=" + encodeURIComponent(cycleId) + "&organization_id=" + encodeURIComponent(organizationId);
                globalThis.location.assign(next);
                return;
              }
              form.reset();
            } catch {
              statusEl.className = "status error";
              statusEl.textContent = "Network error while submitting source.";
            }
          });
        </script>`
            : `<div class="row">
          <a class="btn secondary" href="${authStartPath}">Sign in with Google</a>
        </div>`
        }
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
    if (!payload.cycle_id) {
      payload.cycle_id = request.headers.get("x-cycle-id") ?? undefined;
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

  if (request.method === "POST" && url.pathname === "/api/sources/submit") {
    const payload = asObject(await parseJsonBody(request));
    const requestContext = await resolveRequestContext(payload, request, config);
    const actorEmail = requestContext.actor_email;
    const cycleId = requestContext.cycle_id;
    const organizationId = requestContext.organization_id;
    const urlValue = readAnyString(payload, "url", "source_url");
    const relevanceNote = readAnyString(payload, "relevance_note", "note", "relevance");
    const sourceExcerpt = readString(payload, "source_excerpt");
    const clientRequestId =
      readAnyString(payload, "client_request_id", "request_id") ??
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `source-${Date.now()}`);

    if (!actorEmail) {
      const error: SourceSubmitResponse = {
        ok: false,
        reason_code: "IDENTITY_UNRESOLVED",
        message: "Sign in is required before submitting a source.",
        organization_id: organizationId,
        cycle_id: cycleId ?? "",
        root_problem_version_id: config.root_problem_version_id,
      };
      return json(401, error);
    }

    if (!cycleId) {
      const error: SourceSubmitResponse = {
        ok: false,
        reason_code: "CYCLE_NOT_SELECTED",
        message: "Select an active cycle before submitting a source.",
        organization_id: organizationId,
        cycle_id: "",
        root_problem_version_id: config.root_problem_version_id,
      };
      return json(400, error);
    }

    if (!urlValue) {
      const error: SourceSubmitResponse = {
        ok: false,
        reason_code: "SOURCE_URL_MISSING",
        message: "Article URL is required.",
        organization_id: organizationId,
        cycle_id: cycleId,
        root_problem_version_id: config.root_problem_version_id,
      };
      return json(400, error);
    }

    try {
      // Validate URL format deterministically before ingest.
      new URL(urlValue);
    } catch {
      const error: SourceSubmitResponse = {
        ok: false,
        reason_code: "SOURCE_URL_INVALID",
        message: "Article URL must be a valid absolute URL.",
        organization_id: organizationId,
        cycle_id: cycleId,
        root_problem_version_id: config.root_problem_version_id,
      };
      return json(400, error);
    }

    if (!relevanceNote || relevanceNote.trim().length === 0) {
      const error: SourceSubmitResponse = {
        ok: false,
        reason_code: "RELEVANCE_NOTE_MISSING",
        message: "Relevance note is required.",
        organization_id: organizationId,
        cycle_id: cycleId,
        root_problem_version_id: config.root_problem_version_id,
      };
      return json(400, error);
    }

    if (relevanceNote.length > 500) {
      const error: SourceSubmitResponse = {
        ok: false,
        reason_code: "RELEVANCE_NOTE_TOO_LONG",
        message: "Relevance note must be 500 characters or fewer.",
        organization_id: organizationId,
        cycle_id: cycleId,
        root_problem_version_id: config.root_problem_version_id,
      };
      return json(400, error);
    }

    const participantContext = await resolveParticipantContext(persistence, config, organizationId, actorEmail, cycleId);
    if (!participantContext.ok) {
      const error: SourceSubmitResponse = {
        ok: false,
        reason_code: participantContext.reason_code,
        message: "Source submit is blocked by membership or cycle policy.",
        organization_id: organizationId,
        cycle_id: cycleId,
        root_problem_version_id: config.root_problem_version_id,
      };
      return json(403, error);
    }
    const participant = participantContext.participant;
    const membership = participantContext.membership;
    if (!participant || !membership) {
      const error: SourceSubmitResponse = {
        ok: false,
        reason_code: "NO_MEMBERSHIP_FOR_CYCLE",
        message: "Source submit is blocked by membership or cycle policy.",
        organization_id: organizationId,
        cycle_id: cycleId,
        root_problem_version_id: config.root_problem_version_id,
      };
      return json(403, error);
    }

    const idempotencyKey = await computePilotIdempotencyKey({
      source_table: "research_inbox",
      source_record_or_event_id: clientRequestId,
      cycle_id: cycleId,
    });
    const prior = await persistence.getIngestByIdempotencyKey(idempotencyKey);
    if (prior) {
      const replay: SourceSubmitResponse = {
        ok: true,
        replayed: true,
        reason_code: prior.ingest_state === "duplicate" ? "DUPLICATE" : "ALREADY_PROCESSED",
        message: "Source submission already processed for this request id.",
        event_id: prior.event_id,
        ingest_state: prior.ingest_state,
        organization_id: prior.organization_id,
        cycle_id: prior.cycle_id,
        root_problem_version_id: prior.root_problem_version_id,
      };
      return json(200, replay);
    }

    let notionRecordId: string | undefined;
    if (config.notion_integration_token && config.notion_db_research_inbox_id) {
      const schemaStatus = await ensureResearchInboxSchema(config.notion_db_research_inbox_id, config);
      if (schemaStatus.ok) {
        const database = schemaStatus.database ?? (await fetchNotionDatabasePayload(config.notion_db_research_inbox_id, config));
        if (database) {
          const properties = buildResearchInboxPageProperties(database, {
            url: urlValue,
            relevance_note: relevanceNote,
            submitted_by: actorEmail,
          });
          if (properties) {
            const created = await createNotionDatabasePage(config.notion_db_research_inbox_id, properties, config);
            notionRecordId = created?.id;
          }
        }
      }
    }

    const sourceRecordId = notionRecordId ?? clientRequestId;
    const commitPayload: NotionLikeWebhookPayload = {
      source_table: "research_inbox",
      source_record_id: sourceRecordId,
      event_type: "local_commit",
      occurred_at: now(),
      idempotency_key: idempotencyKey,
      cycle_id: cycleId,
      organization_id: organizationId,
      root_problem_version_id: config.root_problem_version_id,
      actor_email: actorEmail,
      submitted_by: actorEmail,
      url: urlValue,
      relevance_note: relevanceNote,
      source_excerpt: sourceExcerpt,
    };

    const ingestResult = await handleIngest(commitPayload, { persistence, config, now });
    if (!ingestResult.ok || ingestResult.ingest_state !== "processed" || ingestResult.trigger_type !== "local_commit") {
      const response: SourceSubmitResponse = {
        ok: ingestResult.ok,
        reason_code: ingestResult.result_code,
        message: ingestResult.message,
        event_id: ingestResult.event_id,
        ingest_state: ingestResult.ingest_state,
        notion_record_id: notionRecordId,
        replayed: ingestResult.ingest_state === "duplicate",
        organization_id: ingestResult.organization_id ?? organizationId,
        cycle_id: ingestResult.cycle_id ?? cycleId,
        root_problem_version_id: ingestResult.root_problem_version_id ?? config.root_problem_version_id,
      };
      return json(ingestResult.ok ? 200 : 400, response);
    }

    const commitResult = await processCommitEvent(commitPayload, { persistence, config, now });
    if (!commitResult.ok) {
      if (ingestResult.event_id) {
        await persistence.updateIngestState(ingestResult.event_id, {
          ingest_state: "failed",
          error_code: commitResult.result_code,
          processed_at: now(),
          details: {
            post_ingest_error: commitResult,
          },
        });
      }

      const error: SourceSubmitResponse = {
        ok: false,
        reason_code: commitResult.result_code,
        message: commitResult.message,
        event_id: ingestResult.event_id,
        ingest_state: "failed",
        notion_record_id: notionRecordId,
        organization_id: organizationId,
        cycle_id: cycleId,
        root_problem_version_id: config.root_problem_version_id,
      };
      return json(400, error);
    }

    const details = asObject(commitResult.details);
    const response: SourceSubmitResponse = {
      ok: true,
      reason_code: commitResult.result_code,
      message: commitResult.message,
      event_id: ingestResult.event_id,
      ingest_state: ingestResult.ingest_state,
      thread_id: readString(details, "thread_id"),
      source_submission_id: readString(details, "source_submission_id"),
      starter_brief_id: readString(details, "starter_brief_id"),
      starter_brief_status: readString(details, "starter_brief_status"),
      possible_duplicate: details.possible_duplicate === true,
      notion_record_id: notionRecordId,
      organization_id: organizationId,
      cycle_id: cycleId,
      root_problem_version_id: config.root_problem_version_id,
    };

    if (response.thread_id) {
      let workspace = await buildThreadWorkspace(persistence, config, {
        organization_id: organizationId,
        cycle_id: cycleId,
        thread_id: response.thread_id,
      });
      if (workspace.ok) {
        if ((workspace.rounds?.length ?? 0) === 0 && workspace.starter_brief?.status === "ready") {
          const started = await startGuidedRoundIfEligible(
            persistence,
            config,
            {
              organization_id: organizationId,
              cycle_id: cycleId,
              root_problem_version_id: config.root_problem_version_id,
              thread_id: response.thread_id,
              participant_id: participant.participant_id,
            },
            now,
          );
          if (started.ok) {
            workspace = await buildThreadWorkspace(persistence, config, {
              organization_id: organizationId,
              cycle_id: cycleId,
              thread_id: response.thread_id,
            });
          }
        }

        await tryWriteNotionCardRecord(
          persistence,
          config,
          {
            database_id: config.notion_db_threads_id,
            title: `Thread ${response.thread_id}`,
            fields: {
              thread_id: response.thread_id,
              cycle_id: cycleId,
              status: workspace.publish_state,
              source_url: response.source_submission_id ?? "",
            },
            aliases: {
              thread_id: ["thread_id", "name", "title"],
              cycle_id: ["cycle_id"],
              status: ["status", "stage"],
              source_url: ["source_url", "url"],
            },
            workspace,
            actor_email: actorEmail,
            participant_id: participant.participant_id,
            role: membership.role,
            linked_idempotency_key: idempotencyKey,
          },
          now,
        );

        await tryWriteNotionCardRecord(
          persistence,
          config,
          {
            database_id: config.notion_db_turns_id,
            title: `Initial Thread Draft (${response.thread_id})`,
            fields: {
              thread_id: response.thread_id,
              cycle_id: cycleId,
              turn_type: "initial_thread_draft",
              summary: workspace.next_best_action,
            },
            aliases: {
              thread_id: ["thread_id", "thread_ref"],
              cycle_id: ["cycle_id"],
              turn_type: ["turn_type", "type"],
              summary: ["summary", "content", "body"],
            },
            workspace,
            actor_email: actorEmail,
            participant_id: participant.participant_id,
            role: membership.role,
            linked_idempotency_key: idempotencyKey,
          },
          now,
        );
      }
    }

    return json(200, response);
  }

  if (request.method === "POST" && url.pathname === "/api/session/active-cycle/select") {
    const payload = asObject(await parseJsonBody(request));
    const requestContext = await resolveRequestContext(payload, request, config);
    const actorEmail = requestContext.actor_email;
    const cycleId = requestContext.cycle_id;
    const organizationId = requestContext.organization_id;
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
    const sessionCookie = await createSessionCookie(
      {
        actor_email: actorEmail,
        cycle_id: cycleId,
        organization_id: organizationId,
        participant_id: participant.participant_id,
      },
      config.session_secret,
    );
    return json(200, {
      ok: true,
      cycle_id: cycleId,
      membership_state: membership.membership_state,
      role: membership.role,
      message: "Active cycle selected.",
    }, { "set-cookie": sessionCookie });
  }

  if (request.method === "GET" && url.pathname === "/api/auth/google/start") {
    const cycleId = url.searchParams.get("cycle_id") ?? config.default_cycle_id;
    const organizationId = url.searchParams.get("organization_id") ?? config.organization_id;
    const nextPath = url.searchParams.get("next") ?? "/submit";
    const stateToken = await createOAuthStateToken(
      {
        cycle_id: cycleId,
        organization_id: organizationId,
        next_path: nextPath,
      },
      config.session_secret,
    );
    const authUrl = buildGoogleAuthUrl(config, { state: stateToken });
    if (!authUrl.ok || !authUrl.url) {
      return json(503, {
        ok: false,
        reason_code: authUrl.reason_code ?? "GOOGLE_OAUTH_NOT_CONFIGURED",
        message: authUrl.message ?? "Google OAuth is not configured.",
      });
    }

    return new Response(null, {
      status: 302,
      headers: {
        location: authUrl.url,
      },
    });
  }

  if ((request.method === "POST" || request.method === "GET") && url.pathname === "/api/auth/callback/google") {
    const payload =
      request.method === "GET"
        ? payloadFromSearchParams(url.searchParams)
        : asObject(await parseJsonBody(request));

    let actorEmail = actorEmailFromRequest(payload, request);
    let cycleId = cycleIdFromRequest(payload, request);
    let organizationId = readString(payload, "organization_id") ?? config.organization_id;
    let nextPath = readString(payload, "next") ?? "/submit";

    const code = readString(payload, "code");
    const stateToken = readString(payload, "state");
    if (code) {
      const state = await readOAuthStateToken(stateToken, config.session_secret);
      if (!state) {
        return json(400, {
          ok: false,
          login_state: "login_failed",
          access_granted: false,
          reason_code: "STATE_INVALID",
        });
      }

      const oauthResult = await exchangeGoogleCodeForIdentity(code, config);
      if (!oauthResult.ok || !oauthResult.identity) {
        return json(401, {
          ok: false,
          login_state: "login_failed",
          access_granted: false,
          reason_code: oauthResult.reason_code ?? "GOOGLE_TOKEN_EXCHANGE_FAILED",
          message: oauthResult.message,
        });
      }

      actorEmail = oauthResult.identity.email;
      cycleId = cycleId ?? state.cycle_id;
      organizationId = state.organization_id;
      nextPath = state.next_path;
    }

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

    const sessionCookie = await createSessionCookie(
      {
        actor_email: actorEmail,
        cycle_id: cycleId,
        organization_id: organizationId,
        participant_id: participant.participant_id,
      },
      config.session_secret,
    );

    if (request.method === "GET" && code) {
      const location = `${nextPath}${nextPath.includes("?") ? "&" : "?"}login=success`;
      return new Response(null, {
        status: 302,
        headers: {
          location,
          "set-cookie": sessionCookie,
        },
      });
    }

    return json(
      200,
      {
        ok: true,
        login_state: "login_success",
        access_granted: true,
        cycle_id: cycleId,
        membership_state: activatedMembership.membership_state,
        role: activatedMembership.role,
        email: actorEmail,
      },
      { "set-cookie": sessionCookie },
    );
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    return json(
      200,
      {
        ok: true,
        reason_code: "LOGOUT_SUCCESS",
      },
      { "set-cookie": clearSessionCookie() },
    );
  }

  if (request.method === "POST" && url.pathname === "/api/thread/workspace") {
    const payload = asObject(await parseJsonBody(request));
    const requestContext = await resolveRequestContext(payload, request, config);
    const threadId = readString(payload, "thread_id");
    if (!threadId) {
      return json(400, { ok: false, reason_code: "THREAD_NOT_FOUND" });
    }

    const participantContext = await resolveParticipantContext(
      persistence,
      config,
      requestContext.organization_id,
      requestContext.actor_email,
      requestContext.cycle_id,
    );
    if (!participantContext.ok) {
      return json(403, { ok: false, reason_code: participantContext.reason_code });
    }
    const participant = participantContext.participant;
    if (!participant) {
      return json(403, { ok: false, reason_code: "NO_MEMBERSHIP_FOR_CYCLE" });
    }

    const thread = await persistence.getThreadByIdInCycle(threadId, requestContext.cycle_id!);
    if (!thread) {
      return json(404, { ok: false, reason_code: "THREAD_NOT_FOUND" });
    }
    if (thread.owner_participant_id !== participant.participant_id) {
      return json(403, { ok: false, reason_code: "ROLE_DENY" });
    }

    const workspace = await buildThreadWorkspace(persistence, config, {
      organization_id: requestContext.organization_id,
      cycle_id: requestContext.cycle_id!,
      thread_id: threadId,
    });
    return json(workspace.ok ? 200 : 404, workspace);
  }

  if (request.method === "POST" && url.pathname === "/api/questions/round/start") {
    const payload = asObject(await parseJsonBody(request));
    const mutationScope = await resolveThreadMutationScope(persistence, config, now, {
      payload,
      request,
      action: "compare",
    });
    if (!mutationScope.ok) {
      return mutationScope.response;
    }
    const { cycle_id: cycleId, thread_id: threadId, context, guard } = mutationScope;
    const started = await startGuidedRoundIfEligible(
      persistence,
      config,
      {
        organization_id: context.organization_id,
        cycle_id: cycleId,
        root_problem_version_id: context.root_problem_version_id,
        thread_id: threadId,
        participant_id: guard.decision.participant_id!,
      },
      now,
    );
    if (!started.ok) {
      return json(400, started);
    }
    return json(200, started);
  }

  if (request.method === "POST" && url.pathname === "/api/questions/answer") {
    const payload = asObject(await parseJsonBody(request));
    const questionItemId = readString(payload, "question_item_id");
    const selectedOption = readString(payload, "selected_option") as "A" | "B" | "C" | "D" | undefined;
    if (!questionItemId) {
      return json(400, { ok: false, reason_code: "CYCLE_NOT_SELECTED" });
    }
    if (!selectedOption || !["A", "B", "C", "D"].includes(selectedOption)) {
      return json(400, { ok: false, reason_code: "QUESTIONS_ROUND_INCOMPLETE", message: "selected_option must be A/B/C/D." });
    }

    const mutationScope = await resolveThreadMutationScope(persistence, config, now, {
      payload,
      request,
      action: "compare",
    });
    if (!mutationScope.ok) {
      return mutationScope.response;
    }
    const { cycle_id: cycleId, thread_id: threadId, context, guard, request_context: requestContext } = mutationScope;

    const rounds = await persistence.listGuidedRoundsForThread(threadId, cycleId);
    const active = rounds.find((round) => round.status === "active");
    if (!active) {
      return json(400, { ok: false, reason_code: "QUESTIONS_ROUND_INCOMPLETE", message: "No active round." });
    }

    const items = await persistence.listGuidedQuestionItems(active.round_id);
    const target = items.find((item) => item.question_item_id === questionItemId);
    if (!target) {
      return json(404, { ok: false, reason_code: "THREAD_NOT_FOUND", message: "Question item not found in active round." });
    }

    await persistence.answerGuidedQuestionItem(questionItemId, {
      selected_option: selectedOption,
      short_reason: readString(payload, "short_reason"),
      answered_at: now(),
      updated_at: now(),
    });

    const updatedItems = await persistence.listGuidedQuestionItems(active.round_id);
    const unanswered = updatedItems.filter((item) => !item.selected_option).length;

    if (unanswered === 0) {
      const roundSummary = summarizeGuidedRound(updatedItems);
      const completed = await persistence.completeGuidedRound(active.round_id, roundSummary.summary, now(), now());
      const readinessPreview = evaluateReadiness({
        organization_id: context.organization_id,
        cycle_id: cycleId,
        root_problem_version_id: context.root_problem_version_id,
        thread_id: threadId,
        actor_email: requestContext.actor_email,
        client_request_id: readString(payload, "client_request_id"),
        claim: roundSummary.readiness_signals.claim,
        value: roundSummary.readiness_signals.value,
        difference: roundSummary.readiness_signals.difference,
        explicit_confirmation: false,
      });

      const workspace = await buildThreadWorkspace(persistence, config, {
        organization_id: context.organization_id,
        cycle_id: cycleId,
        thread_id: threadId,
      });
      await tryWriteNotionCardRecord(
        persistence,
        config,
        {
          database_id: config.notion_db_turns_id,
          title: `Round ${completed?.round_number ?? active.round_number} Summary (${threadId})`,
          fields: {
            thread_id: threadId,
            cycle_id: cycleId,
            turn_type: "guided_round_summary",
            summary: roundSummary.summary,
          },
          aliases: {
            thread_id: ["thread_id", "thread_ref"],
            cycle_id: ["cycle_id"],
            turn_type: ["turn_type", "type"],
            summary: ["summary", "content", "body"],
          },
          workspace,
          actor_email: requestContext.actor_email,
          participant_id: guard.decision.participant_id,
          role: guard.decision.role,
          linked_idempotency_key:
            readString(payload, "client_request_id") ?? `round-summary:${cycleId}:${threadId}:${completed?.round_number ?? active.round_number}`,
        },
        now,
      );
      return json(200, {
        ok: true,
        reason_code: "ROUND_COMPLETED",
        round: completed ?? active,
        readiness_preview: readinessPreview,
      });
    }

    return json(200, {
      ok: true,
      reason_code: "ANSWER_RECORDED",
      unanswered_questions: unanswered,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/lab-brief/propose") {
    const payload = asObject(await parseJsonBody(request));
    const mutationScope = await resolveThreadMutationScope(persistence, config, now, {
      payload,
      request,
      action: "compare",
    });
    if (!mutationScope.ok) {
      return mutationScope.response;
    }
    const { cycle_id: cycleId, thread_id: threadId, context, guard, request_context: requestContext } = mutationScope;

    const sources = await persistence.listSourcesForThread(threadId, cycleId);
    const briefs = await persistence.listStarterBriefsForThread(threadId, cycleId);
    const rounds = await persistence.listGuidedRoundsForThread(threadId, cycleId);
    const completedRounds = rounds.filter((round) => round.status === "completed");
    if (completedRounds.length === 0) {
      return json(400, { ok: false, reason_code: "LAB_BRIEF_DRAFT_NOT_READY", message: "Complete at least one guided round first." });
    }

    const source = sources[sources.length - 1];
    const starter = briefs[briefs.length - 1];
    if (!source || !starter || starter.status !== "ready") {
      return json(400, { ok: false, reason_code: "LAB_BRIEF_DRAFT_NOT_READY", message: "Starter draft is not ready." });
    }

    const planned = await proposeLabBriefWithProvider(
      {
        focus_snapshot: config.focus_snapshot,
        source_url: source.raw_url,
        relevance_note: source.relevance_note,
        starter_brief: starter,
        round_summary: completedRounds[completedRounds.length - 1]?.summary,
      },
      config,
    );

    await tryInsertModelRun(
      persistence,
      {
        organization_id: context.organization_id,
        cycle_id: cycleId,
        root_problem_version_id: context.root_problem_version_id,
        thread_id: threadId,
        participant_id: guard.decision.participant_id,
        action_type: "lab_brief_proposal",
        metadata: planned.metadata,
      },
      now,
    );

    const draft = planned.payload;

    const saved = await persistence.upsertLabBriefDraft({
      thread_id: threadId,
      organization_id: context.organization_id,
      cycle_id: cycleId,
      root_problem_version_id: context.root_problem_version_id,
      participant_id: guard.decision.participant_id!,
      status: "ready",
      content: {
        what_it_is: draft.what_it_is,
        why_it_matters: draft.why_it_matters,
        evidence: draft.evidence,
        next_step: draft.next_step,
        confidence: draft.confidence,
      },
      generation_metadata: {
        model_name: draft.model_name,
        prompt_contract_version: draft.prompt_contract_version,
        golden_example_id: draft.golden_example_id,
      },
      updated_at: now(),
    });

    const workspace = await buildThreadWorkspace(persistence, config, {
      organization_id: context.organization_id,
      cycle_id: cycleId,
      thread_id: threadId,
    });

    await tryWriteNotionCardRecord(
      persistence,
      config,
      {
        database_id: config.notion_db_turns_id,
        title: `Lab Brief Proposal (${threadId})`,
        fields: {
          thread_id: threadId,
          cycle_id: cycleId,
          turn_type: "lab_brief_proposal",
          summary: draft.what_it_is,
        },
        aliases: {
          thread_id: ["thread_id", "thread_ref"],
          cycle_id: ["cycle_id"],
          turn_type: ["turn_type", "type"],
          summary: ["summary", "content", "body"],
        },
        workspace,
        actor_email: requestContext.actor_email,
        participant_id: guard.decision.participant_id,
        role: guard.decision.role,
        linked_idempotency_key: readString(payload, "client_request_id") ?? `lab-brief:${cycleId}:${threadId}`,
      },
      now,
    );

    return json(200, {
      ok: true,
      reason_code: "LAB_BRIEF_DRAFT_READY",
      draft: saved,
    });
  }

  if (request.method === "POST" && url.pathname === "/api/visible-surface") {
    const payload = asObject(await parseJsonBody(request));
    const requestContext = await resolveRequestContext(payload, request, config);
    const actorEmail = requestContext.actor_email;
    const cycleId = requestContext.cycle_id;
    const organizationId = requestContext.organization_id;

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

  if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/operator/summary") {
    const payload =
      request.method === "GET"
        ? payloadFromSearchParams(url.searchParams)
        : asObject(await parseJsonBody(request));
    const requestContext = await resolveRequestContext(payload, request, config);
    const operatorContext = await resolveOperatorContext(persistence, config, requestContext);
    if (!operatorContext.ok) {
      const status = operatorContext.reason_code === "CYCLE_NOT_SELECTED" ? 400 : 403;
      const blocked: OperatorSummaryResponse = {
        ok: false,
        reason_code: operatorContext.reason_code,
        organization_id: requestContext.organization_id,
        cycle_id: requestContext.cycle_id ?? "",
        root_problem_version_id: config.root_problem_version_id,
      };
      return json(status, blocked);
    }

    const cycleId = requestContext.cycle_id!;
    const [memberships, ingest, audits, sources, starterDrafts, rounds, briefDrafts, modelRuns] = await Promise.all([
      persistence.listCycleMemberships(requestContext.organization_id, cycleId),
      persistence.listIngestForCycle(requestContext.organization_id, cycleId, 200),
      persistence.listProtectedActionAuditsForCycle(requestContext.organization_id, cycleId, 200),
      persistence.listSourcesForCycle(cycleId),
      persistence.listStarterBriefsForCycle(cycleId),
      persistence.listGuidedRoundsForCycle(cycleId),
      persistence.listLabBriefDraftsForCycle(cycleId),
      persistence.listModelRunsForCycle(requestContext.organization_id, cycleId, 200),
    ]);

    const ingestCounts: Record<string, number> = {
      received: 0,
      validated: 0,
      processed: 0,
      failed: 0,
      duplicate: 0,
    };
    for (const row of ingest) {
      ingestCounts[row.ingest_state] = (ingestCounts[row.ingest_state] ?? 0) + 1;
    }

    const blockedReasonCounts: Record<string, number> = {};
    const publishAttempts = audits.filter((row) => row.action === "publish");
    const publishSuccess = publishAttempts.filter((row) => row.allowed && row.reason_code === "OK");
    for (const row of audits) {
      if (!row.allowed) {
        blockedReasonCounts[row.reason_code] = (blockedReasonCounts[row.reason_code] ?? 0) + 1;
      }
    }

    const plannerProviderCounts: Record<string, number> = {};
    let plannerFallbackTotal = 0;
    let plannerRateLimitedTotal = 0;
    let plannerLatencyTotal = 0;
    let plannerCostTotal = 0;
    for (const row of modelRuns) {
      plannerProviderCounts[row.provider] = (plannerProviderCounts[row.provider] ?? 0) + 1;
      plannerLatencyTotal += row.latency_ms;
      if (typeof row.estimated_cost_usd === "number") {
        plannerCostTotal += row.estimated_cost_usd;
      }
      if (row.status === "fallback") {
        plannerFallbackTotal += 1;
      }
      if (row.fallback_reason === "RATE_LIMIT") {
        plannerRateLimitedTotal += 1;
      }
    }

    const summary: OperatorSummaryResponse = {
      ok: true,
      reason_code: "OK",
      organization_id: requestContext.organization_id,
      cycle_id: cycleId,
      root_problem_version_id: operatorContext.cycle.root_problem_version_id,
      cycle_state: operatorContext.cycle.state,
      active_members_count: memberships.filter((row) => row.membership_state === "active").length,
      invited_members_count: memberships.filter((row) => row.membership_state === "invited").length,
      ingest_counts: ingestCounts,
      publish_attempts_total: publishAttempts.length,
      publish_success_total: publishSuccess.length,
      blocked_reason_counts: blockedReasonCounts,
      sources_submitted_total: sources.length,
      starter_drafts_ready_total: starterDrafts.filter((row) => row.status === "ready").length,
      rounds_completed_total: rounds.filter((row) => row.status === "completed").length,
      lab_brief_drafts_total: briefDrafts.length,
      planner_runs_total: modelRuns.length,
      planner_fallback_total: plannerFallbackTotal,
      planner_rate_limited_total: plannerRateLimitedTotal,
      planner_avg_latency_ms: modelRuns.length > 0 ? Math.round(plannerLatencyTotal / modelRuns.length) : 0,
      planner_estimated_cost_usd: Number(plannerCostTotal.toFixed(6)),
      planner_provider_counts: plannerProviderCounts,
      telemetry_write_failed_count: telemetryWriteFailedCount,
    };

    return json(200, {
      ...summary,
      global_halt: operatorContext.runtime_control.global_protected_actions_halt,
      cycle_halt: operatorContext.cycle_control?.protected_actions_halt ?? false,
      cycle_halt_reason: operatorContext.cycle_control?.halt_reason ?? null,
      generated_at: now(),
    });
  }

  if (request.method === "POST" && url.pathname === "/api/actions/publish") {
    const payloadRaw = await parseJsonBody(request);
    const payload = asObject(payloadRaw);
    const requestContext = await resolveRequestContext(payload, request, config);
    const cycleId = requestContext.cycle_id;
    const actorEmail = requestContext.actor_email;
    const context = resolveProgramContext(
      {
        organization_id: requestContext.organization_id,
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
        content: normalizeLabBriefContent(payload) as unknown as Record<string, unknown>,
        why: readString(payload, "why"),
        client_request_id: readString(payload, "client_request_id"),
        linked_event_id: readString(payload, "linked_event_id"),
        linked_idempotency_key: readString(payload, "linked_idempotency_key"),
        organization_id: context.organization_id,
        root_problem_version_id: context.root_problem_version_id,
      },
      { persistence, config, now },
    );

    if (result.allowed) {
      const workspace = await buildThreadWorkspace(persistence, config, {
        organization_id: context.organization_id,
        cycle_id: context.cycle_id,
        thread_id: readString(payload, "thread_id") ?? "unknown-thread",
      });
      if (workspace.ok) {
        await tryWriteNotionCardRecord(
          persistence,
          config,
          {
            database_id: config.notion_db_outputs_id,
            title: `Lab Record Entry (${workspace.thread_id})`,
            fields: {
              thread_id: workspace.thread_id,
              cycle_id: workspace.cycle_id,
              publish_state: "published",
              version: result.version ?? 1,
              lab_record_id: result.lab_record_id ?? "",
            },
            aliases: {
              thread_id: ["thread_id", "thread_ref"],
              cycle_id: ["cycle_id"],
              publish_state: ["publish_state", "status"],
              version: ["version", "version_number"],
              lab_record_id: ["lab_record_id", "output_id"],
            },
            workspace,
            actor_email: actorEmail,
            linked_idempotency_key:
              readString(payload, "client_request_id") ??
              `publish:${context.cycle_id}:${workspace.thread_id}:${result.lab_record_id ?? "entry"}`,
          },
          now,
        );
      }
    }

    return json(result.allowed ? 200 : 403, result);
  }

  if (request.method === "POST" && url.pathname === "/api/actions/readiness/evaluate") {
    const payload = asObject(await parseJsonBody(request));
    const requestContext = await resolveRequestContext(payload, request, config);
    const cycleId = requestContext.cycle_id;
    const actorEmail = requestContext.actor_email;
    const context = resolveProgramContext(
      {
        organization_id: requestContext.organization_id,
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
    const requestContext = await resolveRequestContext(payload, request, config);
    const operatorContext = await resolveOperatorContext(persistence, config, requestContext);
    if (!operatorContext.ok) {
      const status = operatorContext.reason_code === "CYCLE_NOT_SELECTED" ? 400 : 403;
      return json(status, {
        ok: false,
        reason_code: operatorContext.reason_code,
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
