import type { RuntimeConfig } from "../adapters/env.js";
import type { PersistenceAdapter } from "../adapters/persistence.js";
import { normalizeCanonicalUrl, sha256Hex } from "./idempotency.js";
import { generateIdeaEmbedding, normalizeIdeaText } from "./idea-embeddings.js";
import { fetchNotionPagePayload, flattenNotionProperties } from "./notion.js";
import { resolveProgramContext } from "./program-context.js";
import { generateStarterBrief } from "./starter-brief.js";
import type { NotionLikeWebhookPayload, ParticipantRole, MembershipState, ParticipantGlobalState, GlobalRole } from "./types.js";

interface ProcessDeps {
  persistence: PersistenceAdapter;
  config: RuntimeConfig;
  now?: () => string;
}

export interface CommitProcessResult {
  ok: boolean;
  result_code: string;
  message: string;
  details?: Record<string, unknown>;
}

function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readString(source: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const direct = source[key];
    if (typeof direct === "string" && direct.trim().length > 0) {
      return direct.trim();
    }

    const normalized = source[normalizeKey(key)];
    if (typeof normalized === "string" && normalized.trim().length > 0) {
      return normalized.trim();
    }
  }

  return undefined;
}

function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key] ?? source[normalizeKey(key)];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function canonicalEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toIsoTimestamp(value: string | undefined, fallback: string): string {
  if (!value) {
    return fallback;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return new Date(parsed).toISOString();
}

function makeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `p-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}

function asRole(value: string | undefined): ParticipantRole {
  if (value === "student" || value === "moderator" || value === "facilitator" || value === "operator") {
    return value;
  }

  return "student";
}

function asMembershipState(value: string | undefined): MembershipState {
  if (value === "invited" || value === "active" || value === "inactive" || value === "revoked") {
    return value;
  }

  return "invited";
}

function asGlobalState(value: string | undefined): ParticipantGlobalState {
  if (value === "blocked") {
    return "blocked";
  }

  return "active";
}

function asGlobalRole(value: string | undefined): GlobalRole {
  if (value === "operator" || value === "admin") {
    return value;
  }

  return "member";
}

async function maybeLoadNotionRow(payload: NotionLikeWebhookPayload, config: RuntimeConfig): Promise<Record<string, unknown>> {
  const page = await fetchNotionPagePayload(payload.source_record_id, config);
  if (!page) {
    return {};
  }

  return flattenNotionProperties(page.properties);
}

function isResearchInboxSource(sourceTable: string, config: RuntimeConfig): boolean {
  const normalized = sourceTable.trim().toLowerCase();
  if (normalized === "research_inbox" || normalized === "research inbox") {
    return true;
  }

  return Boolean(config.notion_db_research_inbox_id && normalized === config.notion_db_research_inbox_id.toLowerCase());
}

function isTeamIntakeSource(sourceTable: string, config: RuntimeConfig): boolean {
  const normalized = sourceTable.trim().toLowerCase();
  if (normalized === "team_intake" || normalized === "team intake") {
    return true;
  }

  return Boolean(config.notion_db_team_intake_id && normalized === config.notion_db_team_intake_id.toLowerCase());
}

function isIdeaIntakeSource(sourceTable: string, config: RuntimeConfig): boolean {
  const normalized = sourceTable.trim().toLowerCase();
  if (normalized === "idea_intake" || normalized === "idea intake") {
    return true;
  }

  return Boolean(config.notion_db_idea_intake_id && normalized === config.notion_db_idea_intake_id.toLowerCase());
}

async function handleTeamIntake(payload: NotionLikeWebhookPayload, deps: ProcessDeps): Promise<CommitProcessResult> {
  const now = deps.now ?? (() => new Date().toISOString());
  const context = resolveProgramContext(payload, deps.config);
  const payloadProps = payload.properties && typeof payload.properties === "object" ? payload.properties : {};
  const row = {
    ...payloadProps,
    ...payload,
  } as Record<string, unknown>;

  let email = readString(row, "email", "member_email", "participant_email");
  if (!email) {
    const notionRow = await maybeLoadNotionRow(payload, deps.config);
    email = readString(notionRow, "email", "member_email", "participant_email");
  }

  if (!email) {
    return {
      ok: false,
      result_code: "TEAM_INTAKE_EMAIL_MISSING",
      message: "Team Intake record is missing email.",
    };
  }

  const canonical = canonicalEmail(email);
  const role = asRole(readString(row, "role"));
  const membershipState = asMembershipState(readString(row, "membership_state", "allowlist_state"));
  const credits = Math.max(0, readNumber(row, "credits") ?? 1);
  const globalState = asGlobalState(readString(row, "global_state"));
  const globalRole = asGlobalRole(readString(row, "global_role"));

  const existing = await deps.persistence.getParticipantByEmailCanonical(canonical);
  const participant = await deps.persistence.upsertParticipant({
    participant_id: existing?.participant_id ?? makeUuid(),
    email_canonical: canonical,
    global_state: existing?.global_state ?? globalState,
    global_role: existing?.global_role ?? globalRole,
    created_at: existing?.created_at,
    last_login_at: existing?.last_login_at,
  });

  await deps.persistence.upsertCycleMembership({
    participant_id: participant.participant_id,
    organization_id: context.organization_id,
    cycle_id: context.cycle_id,
    role,
    membership_state: membershipState,
    credits,
    updated_at: now(),
  });

  if (membershipState === "active") {
    await deps.persistence.activateMembership(participant.participant_id, context.organization_id, context.cycle_id, now());
  }

  await deps.persistence.insertProtectedActionAudit({
    action: "scope_grant",
    participant_id: participant.participant_id,
    actor_email: payload.actor_email,
    membership_state: membershipState,
    global_state: participant.global_state,
    role,
    allowed: true,
    reason_code: "TEAM_INTAKE_SYNCED",
    thread_id: undefined,
    client_request_id: payload.idempotency_key,
    why: "Notion Team Intake commit-event sync",
    linked_event_id: undefined,
    linked_idempotency_key: payload.idempotency_key,
    organization_id: context.organization_id,
    cycle_id: context.cycle_id,
    root_problem_version_id: context.root_problem_version_id,
    created_at: now(),
  });

  return {
    ok: true,
    result_code: "TEAM_INTAKE_SYNCED",
    message: "Team member synced from Notion intake.",
    details: {
      participant_id: participant.participant_id,
      email_canonical: participant.email_canonical,
      role,
      membership_state: membershipState,
      credits,
    },
  };
}

async function handleIdeaIntake(payload: NotionLikeWebhookPayload, deps: ProcessDeps): Promise<CommitProcessResult> {
  const now = deps.now ?? (() => new Date().toISOString());
  const context = resolveProgramContext(payload, deps.config);
  const payloadProps = payload.properties && typeof payload.properties === "object" ? payload.properties : {};
  const notionRow = await maybeLoadNotionRow(payload, deps.config);
  const row = {
    ...notionRow,
    ...payloadProps,
    ...payload,
  } as Record<string, unknown>;

  const ideaTextRaw = readString(row, "idea", "idea_text", "submission", "response", "entry");
  const notionUserId = readString(row, "created_by_id", "created_by_user_id", "submitted_by_id");
  const participantEmail = readString(row, "created_by_email", "created_by", "submitted_by", "actor_email", "email");
  const participantKey = notionUserId
    ? `notion_user:${notionUserId}`
    : participantEmail
      ? `email:${canonicalEmail(participantEmail)}`
      : undefined;
  const notionLastEdited = readString(row, "last_edited_time");

  if (!ideaTextRaw) {
    return {
      ok: true,
      result_code: "IDEA_INTAKE_IGNORED_MISSING_IDEA",
      message: "Idea Intake record ignored because idea text is missing.",
      details: {
        ignored: true,
        missing: "idea_text",
      },
    };
  }

  if (!participantKey) {
    return {
      ok: true,
      result_code: "IDEA_INTAKE_IGNORED_MISSING_IDENTITY",
      message: "Idea Intake record ignored because author identity is missing.",
      details: {
        ignored: true,
        missing: "participant_key",
      },
    };
  }

  const normalizedIdea = normalizeIdeaText(ideaTextRaw);
  if (!normalizedIdea) {
    return {
      ok: true,
      result_code: "IDEA_INTAKE_IGNORED_EMPTY_NORM",
      message: "Idea Intake record ignored because idea text is empty after normalization.",
      details: {
        ignored: true,
        missing: "idea_text_norm",
      },
    };
  }

  const notionEditedAtIso = toIsoTimestamp(notionLastEdited, payload.occurred_at);
  const ideaHash = await sha256Hex(normalizedIdea);
  const sourceEventKey = `${payload.source_record_id}:${notionEditedAtIso}:${ideaHash}`;
  const existingVersion = await deps.persistence.getIdeaEntryBySourceEventKey(sourceEventKey);
  if (existingVersion) {
    return {
      ok: true,
      result_code: "IDEA_INTAKE_DUPLICATE",
      message: "Idea version already recorded.",
      details: {
        entry_version_id: existingVersion.entry_version_id,
        notion_page_id: existingVersion.notion_page_id,
        version_no: existingVersion.version_no,
      },
    };
  }

  const latest = await deps.persistence.getLatestIdeaEntryByNotionPageId(payload.source_record_id);
  const versionNo = latest ? latest.version_no + 1 : 1;
  let entry;
  try {
    entry = await deps.persistence.insertIdeaEntry({
      notion_page_id: payload.source_record_id,
      version_no: versionNo,
      participant_key: participantKey,
      organization_id: context.organization_id,
      cycle_id: context.cycle_id,
      root_problem_version_id: context.root_problem_version_id,
      focus_id: deps.config.warehouse_focus_id,
      focus_text_snapshot: deps.config.focus_snapshot,
      idea_text_raw: ideaTextRaw,
      idea_text_norm: normalizedIdea,
      notion_last_edited_time: notionEditedAtIso,
      source_event_key: sourceEventKey,
      created_at: now(),
    });
  } catch {
    const duplicateAfterRace = await deps.persistence.getIdeaEntryBySourceEventKey(sourceEventKey);
    if (!duplicateAfterRace) {
      return {
        ok: false,
        result_code: "IDEA_INTAKE_INSERT_FAILED",
        message: "Failed to persist idea entry.",
      };
    }
    entry = duplicateAfterRace;
  }

  try {
    await deps.persistence.upsertIdeaEmbedding({
      entry_version_id: entry.entry_version_id,
      embedding_model: deps.config.embedding_model,
      embedding_status: "pending",
      updated_at: now(),
    });
  } catch {
    // Continue. Entry persistence is primary; embedding status can be backfilled later.
  }

  const embedding = await generateIdeaEmbedding({
    text: normalizedIdea,
    config: deps.config,
  });

  try {
    if (embedding.ok && embedding.vector) {
      await deps.persistence.updateIdeaEmbedding(entry.entry_version_id, {
        embedding_status: "ready",
        embedding_vector: embedding.vector,
        error_code: undefined,
        embedded_at: now(),
        updated_at: now(),
      });
    } else {
      await deps.persistence.updateIdeaEmbedding(entry.entry_version_id, {
        embedding_status: "failed",
        error_code: embedding.error_code ?? "EMBEDDING_UNKNOWN",
        embedded_at: undefined,
        updated_at: now(),
      });
    }
  } catch {
    // Non-blocking by design; pending/failed states are handled by backfill.
  }

  return {
    ok: true,
    result_code: "IDEA_INTAKE_SAVED",
    message: "Idea stored and embedding status updated.",
    details: {
      entry_version_id: entry.entry_version_id,
      notion_page_id: entry.notion_page_id,
      version_no: entry.version_no,
      embedding_status: embedding.ok ? "ready" : "failed",
      embedding_model: deps.config.embedding_model,
      focus_id: deps.config.warehouse_focus_id,
      participant_key: entry.participant_key,
    },
  };
}

async function handleResearchInbox(payload: NotionLikeWebhookPayload, deps: ProcessDeps): Promise<CommitProcessResult> {
  const now = deps.now ?? (() => new Date().toISOString());
  const context = resolveProgramContext(payload, deps.config);
  const payloadProps = payload.properties && typeof payload.properties === "object" ? payload.properties : {};
  const row = {
    ...payloadProps,
    ...payload,
  } as Record<string, unknown>;

  let url = readString(row, "url", "source_url");
  let relevanceNote = readString(row, "relevance_note", "note", "relevance");
  let submittedBy = readString(row, "submitted_by", "actor_email", "email");
  const sourceExcerpt = readString(row, "source_excerpt");

  if (!url || !relevanceNote || !submittedBy) {
    const notionRow = await maybeLoadNotionRow(payload, deps.config);
    url = url ?? readString(notionRow, "url", "source_url");
    relevanceNote = relevanceNote ?? readString(notionRow, "relevance_note", "note", "relevance");
    submittedBy = submittedBy ?? readString(notionRow, "submitted_by", "email");
  }

  if (!url) {
    return {
      ok: false,
      result_code: "SOURCE_URL_MISSING",
      message: "Research Inbox commit-event is missing URL.",
    };
  }

  if (!relevanceNote) {
    return {
      ok: false,
      result_code: "RELEVANCE_NOTE_MISSING",
      message: "Research Inbox commit-event is missing relevance note.",
    };
  }

  if (!submittedBy) {
    return {
      ok: false,
      result_code: "SUBMITTED_BY_MISSING",
      message: "Research Inbox commit-event is missing submitted_by email.",
    };
  }

  const participant = await deps.persistence.getParticipantByEmailCanonical(canonicalEmail(submittedBy));
  if (!participant) {
    return {
      ok: false,
      result_code: "NO_MEMBERSHIP_FOR_CYCLE",
      message: "Submitted_by is not allowlisted for this cycle.",
    };
  }

  const membership = await deps.persistence.getCycleMembership(participant.participant_id, context.organization_id, context.cycle_id);
  if (!membership || membership.membership_state !== "active") {
    return {
      ok: false,
      result_code: "NO_MEMBERSHIP_FOR_CYCLE",
      message: "Submitted_by does not have active membership in this cycle.",
    };
  }

  const canonicalUrl = normalizeCanonicalUrl(url);
  const canonicalHash = await sha256Hex(canonicalUrl);
  const existingSources = await deps.persistence.listVisibleSources(participant.participant_id, context.cycle_id);
  const possibleDuplicate = existingSources.some((source) => source.canonical_url_hash === canonicalHash);

  const threadId = readString(row, "thread_id") ?? `thread-${payload.source_record_id}`;

  await deps.persistence.upsertThread({
    thread_id: threadId,
    organization_id: context.organization_id,
    cycle_id: context.cycle_id,
    root_problem_version_id: context.root_problem_version_id,
    owner_participant_id: participant.participant_id,
    status: "processing",
    updated_at: now(),
  });

  const source = await deps.persistence.insertSourceSubmission({
    thread_id: threadId,
    organization_id: context.organization_id,
    cycle_id: context.cycle_id,
    root_problem_version_id: context.root_problem_version_id,
    participant_id: participant.participant_id,
    raw_url: url,
    canonical_url: canonicalUrl,
    canonical_url_hash: canonicalHash,
    canonicalizer_version: 1,
    relevance_note: relevanceNote,
    possible_duplicate: possibleDuplicate,
    created_at: now(),
  });

  const starterBrief = await deps.persistence.insertStarterBrief({
    source_submission_id: source.source_submission_id,
    thread_id: threadId,
    organization_id: context.organization_id,
    cycle_id: context.cycle_id,
    root_problem_version_id: context.root_problem_version_id,
    status: "processing",
    payload: {
      status_label: "Processing",
      message: "Starter Brief is being prepared.",
      provenance: `Built only from: ${url}`,
    },
    replay_payload: {
      state: "processing",
    },
    created_at: now(),
    updated_at: now(),
  });

  const generated = await generateStarterBrief({
    url,
    relevance_note: relevanceNote,
    focus_snapshot: deps.config.focus_snapshot,
    source_excerpt: sourceExcerpt,
    config: deps.config,
  });

  const updatedBrief = await deps.persistence.updateStarterBrief(starterBrief.starter_brief_id, {
    status: generated.status,
    payload: generated.payload,
    replay_payload: generated.replay_payload,
    updated_at: now(),
  });

  await deps.persistence.upsertThread({
    thread_id: threadId,
    organization_id: context.organization_id,
    cycle_id: context.cycle_id,
    root_problem_version_id: context.root_problem_version_id,
    owner_participant_id: participant.participant_id,
    status: "ready",
    updated_at: now(),
  });

  return {
    ok: true,
    result_code: "STARTER_BRIEF_READY",
    message: "Source accepted and Starter Brief generated.",
    details: {
      thread_id: threadId,
      source_submission_id: source.source_submission_id,
      starter_brief_id: updatedBrief?.starter_brief_id ?? starterBrief.starter_brief_id,
      starter_brief_status: updatedBrief?.status ?? generated.status,
      possible_duplicate: source.possible_duplicate,
    },
  };
}

export async function processCommitEvent(payload: NotionLikeWebhookPayload, deps: ProcessDeps): Promise<CommitProcessResult> {
  if (isTeamIntakeSource(payload.source_table, deps.config)) {
    return handleTeamIntake(payload, deps);
  }

  if (isIdeaIntakeSource(payload.source_table, deps.config)) {
    return handleIdeaIntake(payload, deps);
  }

  if (isResearchInboxSource(payload.source_table, deps.config)) {
    return handleResearchInbox(payload, deps);
  }

  return {
    ok: true,
    result_code: "COMMIT_EVENT_NOOP",
    message: `No post-ingest action for source_table='${payload.source_table}'.`,
  };
}
