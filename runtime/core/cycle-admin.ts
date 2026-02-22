import type { RuntimeConfig } from "../adapters/env.js";
import type { PersistenceAdapter } from "../adapters/persistence.js";
import { resolveProgramContext } from "./program-context.js";
import { guardAndAuditAction, type GuardInput } from "./protected-actions.js";
import type {
  CycleAdminActionResponse,
  CycleSnapshotArtifactRecord,
  CycleSnapshotRecord,
  ProgramContext,
  ProgramCycleRecord,
} from "./types.js";

interface AdminDeps {
  persistence: PersistenceAdapter;
  config: RuntimeConfig;
  now?: () => string;
}

interface AdminActorInput extends GuardInput {
  reason?: string;
}

interface CycleInput extends AdminActorInput, Partial<ProgramContext> {
  cycle_id?: string;
  focus_snapshot?: string;
}

interface BootstrapInput extends CycleInput {
  memberships?: Array<{
    email: string;
    role?: "student" | "moderator" | "facilitator" | "operator";
    credits?: number;
  }>;
}

function okBase(
  action: CycleAdminActionResponse["action"],
  context: ProgramContext,
  resultCode: string,
  message: string,
): CycleAdminActionResponse {
  return {
    ok: true,
    action,
    result_code: resultCode,
    message,
    ...context,
  };
}

function failBase(
  action: CycleAdminActionResponse["action"],
  context: ProgramContext,
  resultCode: string,
  message: string,
): CycleAdminActionResponse {
  return {
    ok: false,
    action,
    result_code: resultCode,
    message,
    ...context,
  };
}

async function hashSha256(text: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  const cryptoModule = await import("node:crypto");
  return cryptoModule.createHash("sha256").update(text).digest("hex");
}

async function buildSnapshotArtifacts(
  snapshot: CycleSnapshotRecord,
  nowIso: string,
): Promise<Array<Omit<CycleSnapshotArtifactRecord, "artifact_id" | "created_at">>> {
  const base = `${snapshot.organization_id}/${snapshot.cycle_id}/${snapshot.snapshot_id}`;
  const names: Array<[CycleSnapshotArtifactRecord["artifact_kind"], string]> = [
    ["db_export", "cycle-db-export.json"],
    ["notion_export", "notion-threads-turns-outputs.zip"],
    ["config_manifest", "config-manifest.json"],
    ["evidence_index", "evidence-index.json"],
  ];

  const artifacts: Array<Omit<CycleSnapshotArtifactRecord, "artifact_id" | "created_at">> = [];
  for (const [kind, file] of names) {
    const pointer = `snapshot://${base}/${file}`;
    artifacts.push({
      snapshot_id: snapshot.snapshot_id,
      artifact_kind: kind,
      artifact_name: file,
      storage_pointer: pointer,
      checksum_sha256: await hashSha256(`${pointer}:${nowIso}`),
    });
  }

  return artifacts;
}

async function guardAdmin(
  action: CycleAdminActionResponse["action"],
  context: ProgramContext,
  input: AdminActorInput,
  deps: AdminDeps,
): Promise<CycleAdminActionResponse | null> {
  if (action === "create") {
    const actorEmail = input.actor_email?.trim().toLowerCase();
    const participant = actorEmail ? await deps.persistence.getParticipantByEmailCanonical(actorEmail) : null;
    const allowed = Boolean(participant && participant.global_state === "active" && (participant.global_role === "operator" || participant.global_role === "admin"));
    const reasonCode = !actorEmail
      ? "IDENTITY_UNRESOLVED"
      : !participant
        ? "NO_MEMBERSHIP_FOR_CYCLE"
        : participant.global_state !== "active"
          ? "GLOBAL_STATE_BLOCKED"
          : participant.global_role === "operator" || participant.global_role === "admin"
            ? "OK"
            : "ROLE_DENY";

    await deps.persistence.insertProtectedActionAudit({
      action: "admin_override",
      participant_id: participant?.participant_id,
      actor_email: actorEmail,
      membership_state: "active",
      global_state: participant?.global_state ?? "active",
      role: "operator",
      allowed,
      reason_code: reasonCode,
      why: input.why ?? input.reason,
      organization_id: context.organization_id,
      cycle_id: context.cycle_id,
      root_problem_version_id: context.root_problem_version_id,
    });

    if (!allowed) {
      return failBase(
        action,
        context,
        reasonCode,
        "Admin cycle-create denied by server-side global role guard.",
      );
    }

    return null;
  }

  const guard = await guardAndAuditAction(
    "admin_override",
    {
      actor_email: input.actor_email,
      cycle_id: context.cycle_id,
      why: input.why ?? input.reason,
      organization_id: context.organization_id,
      root_problem_version_id: context.root_problem_version_id,
    },
    deps,
  );

  if (!guard.decision.allowed) {
    return failBase(
      action,
      context,
      guard.decision.reason_code,
      "Admin action denied by server-side membership/role guard.",
    );
  }

  return null;
}

function nextCycleId(seedCycleId: string, nowIso: string): string {
  const datePart = nowIso.slice(0, 10).replace(/-/g, "");
  return `${seedCycleId}-next-${datePart}`;
}

function contextFromInput(input: Partial<ProgramContext>, config: RuntimeConfig): ProgramContext {
  return resolveProgramContext(
    {
      organization_id: input.organization_id,
      cycle_id: input.cycle_id,
      root_problem_version_id: input.root_problem_version_id,
    },
    config,
  );
}

export async function createProgramCycle(input: CycleInput, deps: AdminDeps): Promise<CycleAdminActionResponse> {
  const now = deps.now ?? (() => new Date().toISOString());
  const context = contextFromInput(input, deps.config);
  const cycleId = input.cycle_id?.trim();
  if (!cycleId) {
    return failBase("create", context, "CYCLE_NOT_SELECTED", "cycle_id is required.");
  }

  const scopedContext = { ...context, cycle_id: cycleId };
  const denied = await guardAdmin("create", scopedContext, input, deps);
  if (denied) {
    return denied;
  }

  const existing = await deps.persistence.getProgramCycle(context.organization_id, cycleId);
  if (existing) {
    return failBase("create", scopedContext, "CYCLE_EXISTS", `Cycle '${cycleId}' already exists.`);
  }

  const row = await deps.persistence.upsertProgramCycle({
    organization_id: context.organization_id,
    cycle_id: cycleId,
    root_problem_version_id: context.root_problem_version_id,
    focus_snapshot: input.focus_snapshot?.trim() || deps.config.focus_snapshot,
    state: "draft",
    program_label: deps.config.program_label,
    created_by: input.actor_email,
    created_reason: input.reason,
    created_at: now(),
    updated_at: now(),
  });

  await deps.persistence.upsertCycleControl({
    organization_id: context.organization_id,
    cycle_id: cycleId,
    protected_actions_halt: false,
    halt_reason: undefined,
    updated_at: now(),
  });

  return {
    ...okBase("create", scopedContext, "CYCLE_CREATED", `Cycle '${cycleId}' created in draft state.`),
    cycle: row,
  };
}

export async function activateProgramCycle(input: CycleInput, deps: AdminDeps): Promise<CycleAdminActionResponse> {
  const now = deps.now ?? (() => new Date().toISOString());
  const context = contextFromInput(input, deps.config);
  const cycleId = input.cycle_id?.trim();
  if (!cycleId) {
    return failBase("activate", context, "CYCLE_NOT_SELECTED", "cycle_id is required.");
  }

  const scopedContext = { ...context, cycle_id: cycleId };
  const denied = await guardAdmin("activate", scopedContext, input, deps);
  if (denied) {
    return denied;
  }

  const target = await deps.persistence.getProgramCycle(context.organization_id, cycleId);
  if (!target) {
    return failBase("activate", scopedContext, "CYCLE_NOT_FOUND", `Cycle '${cycleId}' was not found.`);
  }

  const active = await deps.persistence.getActiveProgramCycle(context.organization_id);
  let previousCycleId: string | undefined;
  if (active && active.cycle_id !== cycleId) {
    previousCycleId = active.cycle_id;
    await deps.persistence.setProgramCycleState(context.organization_id, active.cycle_id, "locked", {
      locked_at: now(),
      updated_at: now(),
    });
  }

  const updated = await deps.persistence.setProgramCycleState(context.organization_id, cycleId, "active", {
    activated_at: now(),
    updated_at: now(),
  });

  if (!updated) {
    return failBase("activate", scopedContext, "CYCLE_ACTIVATE_FAILED", `Could not activate '${cycleId}'.`);
  }

  return {
    ...okBase("activate", scopedContext, "CYCLE_ACTIVE", `Cycle '${cycleId}' is now active.`),
    cycle: updated,
    previous_cycle_id: previousCycleId,
  };
}

export async function freezeProgramCycle(input: CycleInput, deps: AdminDeps): Promise<CycleAdminActionResponse> {
  const now = deps.now ?? (() => new Date().toISOString());
  const context = contextFromInput(input, deps.config);
  const cycleId = input.cycle_id?.trim();
  if (!cycleId) {
    return failBase("freeze", context, "CYCLE_NOT_SELECTED", "cycle_id is required.");
  }

  const scopedContext = { ...context, cycle_id: cycleId };
  const denied = await guardAdmin("freeze", scopedContext, input, deps);
  if (denied) {
    return denied;
  }

  const updated = await deps.persistence.setProgramCycleState(context.organization_id, cycleId, "locked", {
    locked_at: now(),
    updated_at: now(),
  });

  if (!updated) {
    return failBase("freeze", scopedContext, "CYCLE_NOT_FOUND", `Cycle '${cycleId}' was not found.`);
  }

  return {
    ...okBase("freeze", scopedContext, "CYCLE_LOCKED", `Cycle '${cycleId}' is locked.`),
    cycle: updated,
  };
}

export async function snapshotProgramCycle(input: CycleInput, deps: AdminDeps): Promise<CycleAdminActionResponse> {
  const now = deps.now ?? (() => new Date().toISOString());
  const context = contextFromInput(input, deps.config);
  const cycleId = input.cycle_id?.trim();
  if (!cycleId) {
    return failBase("snapshot", context, "CYCLE_NOT_SELECTED", "cycle_id is required.");
  }

  const scopedContext = { ...context, cycle_id: cycleId };
  const denied = await guardAdmin("snapshot", scopedContext, input, deps);
  if (denied) {
    return denied;
  }

  const cycle = await deps.persistence.getProgramCycle(context.organization_id, cycleId);
  if (!cycle) {
    return failBase("snapshot", scopedContext, "CYCLE_NOT_FOUND", `Cycle '${cycleId}' was not found.`);
  }

  const started = await deps.persistence.insertCycleSnapshot({
    organization_id: context.organization_id,
    cycle_id: cycleId,
    snapshot_state: "started",
    requested_by: input.actor_email,
    reason: input.reason,
    manifest: {
      organization_id: context.organization_id,
      cycle_id: cycleId,
      root_problem_version_id: cycle.root_problem_version_id,
      focus_snapshot: cycle.focus_snapshot,
      captured_at: now(),
      mode: "cycle_snapshot",
    },
    created_at: now(),
    updated_at: now(),
  });

  const artifactsPayload = await buildSnapshotArtifacts(started, now());
  const artifacts: CycleSnapshotArtifactRecord[] = [];
  for (const item of artifactsPayload) {
    artifacts.push(
      await deps.persistence.insertCycleSnapshotArtifact({
        ...item,
        created_at: now(),
      }),
    );
  }

  const completed = await deps.persistence.updateCycleSnapshot(started.snapshot_id, {
    snapshot_state: "completed",
    manifest: {
      ...started.manifest,
      artifact_count: artifacts.length,
      completed_at: now(),
    },
    completed_at: now(),
    updated_at: now(),
  });

  return {
    ...okBase("snapshot", scopedContext, "SNAPSHOT_COMPLETED", `Snapshot completed for '${cycleId}'.`),
    cycle,
    snapshot: completed ?? started,
    artifacts,
  };
}

export async function exportProgramCycle(input: CycleInput, deps: AdminDeps): Promise<CycleAdminActionResponse> {
  const context = contextFromInput(input, deps.config);
  const cycleId = input.cycle_id?.trim();
  if (!cycleId) {
    return failBase("export", context, "CYCLE_NOT_SELECTED", "cycle_id is required.");
  }

  const scopedContext = { ...context, cycle_id: cycleId };
  const denied = await guardAdmin("export", scopedContext, input, deps);
  if (denied) {
    return denied;
  }

  const snapshots = await deps.persistence.listCycleSnapshots(context.organization_id, cycleId);
  const eligible = snapshots.find((snapshot) => snapshot.snapshot_state === "completed" || snapshot.snapshot_state === "verified");
  if (!eligible) {
    return failBase("export", scopedContext, "NO_SNAPSHOT", `No completed snapshot exists for '${cycleId}'.`);
  }

  const artifacts = await deps.persistence.listCycleSnapshotArtifacts(eligible.snapshot_id);
  return {
    ...okBase("export", scopedContext, "EXPORT_READY", `Export manifest is ready for '${cycleId}'.`),
    snapshot: eligible,
    artifacts,
  };
}

export async function resetNextProgramCycle(input: CycleInput, deps: AdminDeps): Promise<CycleAdminActionResponse> {
  const now = deps.now ?? (() => new Date().toISOString());
  const context = contextFromInput(input, deps.config);
  const cycleId = input.cycle_id?.trim();
  if (!cycleId) {
    return failBase("reset-next", context, "CYCLE_NOT_SELECTED", "cycle_id is required.");
  }

  const scopedContext = { ...context, cycle_id: cycleId };
  const denied = await guardAdmin("reset-next", scopedContext, input, deps);
  if (denied) {
    return denied;
  }

  const cycle = await deps.persistence.getProgramCycle(context.organization_id, cycleId);
  if (!cycle) {
    return failBase("reset-next", scopedContext, "CYCLE_NOT_FOUND", `Cycle '${cycleId}' was not found.`);
  }

  if (cycle.state !== "locked" && cycle.state !== "archived") {
    return failBase("reset-next", scopedContext, "CYCLE_NOT_LOCKED", `Cycle '${cycleId}' must be locked before reset-next.`);
  }

  const nextId = nextCycleId(cycleId, now());
  const nextCycle = await deps.persistence.upsertProgramCycle({
    organization_id: context.organization_id,
    cycle_id: nextId,
    root_problem_version_id: context.root_problem_version_id,
    focus_snapshot: cycle.focus_snapshot,
    state: "draft",
    program_label: deps.config.program_label,
    created_by: input.actor_email,
    created_reason: input.reason ?? `reset-next from ${cycleId}`,
    created_at: now(),
    updated_at: now(),
  });

  return {
    ...okBase("reset-next", { ...scopedContext, cycle_id: nextId }, "CYCLE_NEXT_CREATED", `Next cycle '${nextId}' created.`),
    previous_cycle_id: cycleId,
    cycle: nextCycle,
  };
}

export async function bootstrapProgramCycle(input: BootstrapInput, deps: AdminDeps): Promise<CycleAdminActionResponse> {
  const now = deps.now ?? (() => new Date().toISOString());
  const context = contextFromInput(input, deps.config);
  const cycleId = input.cycle_id?.trim();
  if (!cycleId) {
    return failBase("create", context, "CYCLE_NOT_SELECTED", "cycle_id is required.");
  }

  const scopedContext = { ...context, cycle_id: cycleId };
  const denied = await guardAdmin("create", scopedContext, input, deps);
  if (denied) {
    return denied;
  }

  const existing = await deps.persistence.getProgramCycle(context.organization_id, cycleId);
  if (existing) {
    return failBase("create", scopedContext, "CYCLE_EXISTS", `Cycle '${cycleId}' already exists.`);
  }

  const active = await deps.persistence.getActiveProgramCycle(context.organization_id);
  if (active && active.cycle_id !== cycleId) {
    await deps.persistence.setProgramCycleState(context.organization_id, active.cycle_id, "locked", {
      locked_at: now(),
      updated_at: now(),
    });
  }

  const created = await deps.persistence.upsertProgramCycle({
    organization_id: context.organization_id,
    cycle_id: cycleId,
    root_problem_version_id: context.root_problem_version_id,
    focus_snapshot: input.focus_snapshot?.trim() || deps.config.focus_snapshot,
    state: "active",
    program_label: deps.config.program_label,
    created_by: input.actor_email,
    created_reason: input.reason ?? "bootstrap",
    activated_at: now(),
    created_at: now(),
    updated_at: now(),
  });

  await deps.persistence.upsertCycleControl({
    organization_id: context.organization_id,
    cycle_id: cycleId,
    protected_actions_halt: false,
    halt_reason: undefined,
    updated_at: now(),
  });

  if (input.memberships) {
    for (const member of input.memberships) {
      const emailCanonical = member.email.trim().toLowerCase();
      const existing = await deps.persistence.getParticipantByEmailCanonical(emailCanonical);
      const participantId = existing?.participant_id ?? `ptc-${emailCanonical.replace(/[^a-z0-9]/g, "-")}`;
      const participant = await deps.persistence.upsertParticipant({
        participant_id: participantId,
        email_canonical: emailCanonical,
        global_state: existing?.global_state ?? "active",
        global_role: existing?.global_role ?? "member",
        last_login_at: existing?.last_login_at,
        created_at: existing?.created_at ?? now(),
      });

      await deps.persistence.upsertCycleMembership({
        participant_id: participant.participant_id,
        organization_id: context.organization_id,
        cycle_id: cycleId,
        role: member.role ?? "student",
        membership_state: "invited",
        credits: member.credits ?? 1,
        joined_at: now(),
        updated_at: now(),
      });
    }
  }

  return {
    ...okBase("create", scopedContext, "CYCLE_BOOTSTRAPPED", `Cycle '${cycleId}' bootstrapped and activated.`),
    result_code: "CYCLE_BOOTSTRAPPED",
    message: `Cycle '${cycleId}' bootstrapped with focus snapshot and seeded memberships.`,
    cycle: created,
    previous_cycle_id: active?.cycle_id,
  };
}
