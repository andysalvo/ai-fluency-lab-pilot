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
  program_cycle_id?: string;
}

function okBase(
  action: CycleAdminActionResponse["action"],
  context: ProgramContext,
  result_code: string,
  message: string,
): CycleAdminActionResponse {
  return {
    ok: true,
    action,
    result_code,
    message,
    ...context,
  };
}

function failBase(
  action: CycleAdminActionResponse["action"],
  context: ProgramContext,
  result_code: string,
  message: string,
): CycleAdminActionResponse {
  return {
    ok: false,
    action,
    result_code,
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
  const base = `${snapshot.organization_id}/${snapshot.program_cycle_id}/${snapshot.snapshot_id}`;
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
  const guard = await guardAndAuditAction(
    "admin_override",
    {
      actor_email: input.actor_email,
      allowlist_state: input.allowlist_state,
      role: input.role,
      why: input.why ?? input.reason,
      organization_id: context.organization_id,
      program_cycle_id: context.program_cycle_id,
      root_problem_version_id: context.root_problem_version_id,
    },
    deps,
  );

  if (!guard.decision.allowed) {
    return failBase(
      action,
      context,
      guard.decision.reason_code,
      "Admin action denied by server-side allowlist/role guard.",
    );
  }

  return null;
}

function nextCycleId(seedCycleId: string, nowIso: string): string {
  const datePart = nowIso.slice(0, 10).replace(/-/g, "");
  return `${seedCycleId}-next-${datePart}`;
}

export async function createProgramCycle(input: CycleInput, deps: AdminDeps): Promise<CycleAdminActionResponse> {
  const now = deps.now ?? (() => new Date().toISOString());
  const context = resolveProgramContext(input, deps.config);
  const programCycleId = input.program_cycle_id?.trim() || context.program_cycle_id;

  const denied = await guardAdmin("create", { ...context, program_cycle_id: programCycleId }, input, deps);
  if (denied) {
    return denied;
  }

  const existing = await deps.persistence.getProgramCycle(context.organization_id, programCycleId);
  if (existing) {
    return failBase("create", context, "CYCLE_EXISTS", `Program cycle '${programCycleId}' already exists.`);
  }

  const row = await deps.persistence.upsertProgramCycle({
    organization_id: context.organization_id,
    program_cycle_id: programCycleId,
    root_problem_version_id: context.root_problem_version_id,
    state: "draft",
    program_label: deps.config.program_label,
    created_by: input.actor_email,
    created_reason: input.reason,
    created_at: now(),
    updated_at: now(),
  });

  return {
    ...okBase("create", context, "CYCLE_CREATED", `Program cycle '${programCycleId}' created in draft state.`),
    cycle: row,
  };
}

export async function activateProgramCycle(input: CycleInput, deps: AdminDeps): Promise<CycleAdminActionResponse> {
  const now = deps.now ?? (() => new Date().toISOString());
  const context = resolveProgramContext(input, deps.config);
  const programCycleId = input.program_cycle_id?.trim() || context.program_cycle_id;

  const denied = await guardAdmin("activate", { ...context, program_cycle_id: programCycleId }, input, deps);
  if (denied) {
    return denied;
  }

  const target = await deps.persistence.getProgramCycle(context.organization_id, programCycleId);
  if (!target) {
    return failBase("activate", context, "CYCLE_NOT_FOUND", `Program cycle '${programCycleId}' was not found.`);
  }

  const active = await deps.persistence.getActiveProgramCycle(context.organization_id);
  let previousCycleId: string | undefined;
  if (active && active.program_cycle_id !== programCycleId) {
    previousCycleId = active.program_cycle_id;
    await deps.persistence.setProgramCycleState(context.organization_id, active.program_cycle_id, "frozen", {
      frozen_at: now(),
      updated_at: now(),
    });
  }

  const updated = await deps.persistence.setProgramCycleState(context.organization_id, programCycleId, "active", {
    activated_at: now(),
    updated_at: now(),
  });

  if (!updated) {
    return failBase("activate", context, "CYCLE_ACTIVATE_FAILED", `Could not activate '${programCycleId}'.`);
  }

  return {
    ...okBase("activate", context, "CYCLE_ACTIVE", `Program cycle '${programCycleId}' is now active.`),
    cycle: updated,
    previous_cycle_id: previousCycleId,
  };
}

export async function freezeProgramCycle(input: CycleInput, deps: AdminDeps): Promise<CycleAdminActionResponse> {
  const now = deps.now ?? (() => new Date().toISOString());
  const context = resolveProgramContext(input, deps.config);
  const programCycleId = input.program_cycle_id?.trim() || context.program_cycle_id;

  const denied = await guardAdmin("freeze", { ...context, program_cycle_id: programCycleId }, input, deps);
  if (denied) {
    return denied;
  }

  const updated = await deps.persistence.setProgramCycleState(context.organization_id, programCycleId, "frozen", {
    frozen_at: now(),
    updated_at: now(),
  });

  if (!updated) {
    return failBase("freeze", context, "CYCLE_NOT_FOUND", `Program cycle '${programCycleId}' was not found.`);
  }

  return {
    ...okBase("freeze", context, "CYCLE_FROZEN", `Program cycle '${programCycleId}' is frozen.`),
    cycle: updated,
  };
}

export async function snapshotProgramCycle(input: CycleInput, deps: AdminDeps): Promise<CycleAdminActionResponse> {
  const now = deps.now ?? (() => new Date().toISOString());
  const context = resolveProgramContext(input, deps.config);
  const programCycleId = input.program_cycle_id?.trim() || context.program_cycle_id;

  const denied = await guardAdmin("snapshot", { ...context, program_cycle_id: programCycleId }, input, deps);
  if (denied) {
    return denied;
  }

  const cycle = await deps.persistence.getProgramCycle(context.organization_id, programCycleId);
  if (!cycle) {
    return failBase("snapshot", context, "CYCLE_NOT_FOUND", `Program cycle '${programCycleId}' was not found.`);
  }

  const started = await deps.persistence.insertCycleSnapshot({
    organization_id: context.organization_id,
    program_cycle_id: programCycleId,
    snapshot_state: "started",
    requested_by: input.actor_email,
    reason: input.reason,
    manifest: {
      organization_id: context.organization_id,
      program_cycle_id: programCycleId,
      root_problem_version_id: cycle.root_problem_version_id,
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
    ...okBase("snapshot", context, "SNAPSHOT_COMPLETED", `Snapshot completed for '${programCycleId}'.`),
    cycle,
    snapshot: completed ?? started,
    artifacts,
  };
}

export async function exportProgramCycle(input: CycleInput, deps: AdminDeps): Promise<CycleAdminActionResponse> {
  const context = resolveProgramContext(input, deps.config);
  const programCycleId = input.program_cycle_id?.trim() || context.program_cycle_id;

  const denied = await guardAdmin("export", { ...context, program_cycle_id: programCycleId }, input, deps);
  if (denied) {
    return denied;
  }

  const snapshots = await deps.persistence.listCycleSnapshots(context.organization_id, programCycleId);
  const eligible = snapshots.find((snapshot) => snapshot.snapshot_state === "completed" || snapshot.snapshot_state === "verified");
  if (!eligible) {
    return failBase("export", context, "NO_SNAPSHOT", `No completed snapshot exists for '${programCycleId}'.`);
  }

  const artifacts = await deps.persistence.listCycleSnapshotArtifacts(eligible.snapshot_id);
  return {
    ...okBase("export", context, "EXPORT_READY", `Export manifest is ready for '${programCycleId}'.`),
    snapshot: eligible,
    artifacts,
  };
}

export async function resetNextProgramCycle(input: CycleInput, deps: AdminDeps): Promise<CycleAdminActionResponse> {
  const now = deps.now ?? (() => new Date().toISOString());
  const context = resolveProgramContext(input, deps.config);
  const active = await deps.persistence.getActiveProgramCycle(context.organization_id);
  const baselineCycleId = active?.program_cycle_id ?? context.program_cycle_id;
  const nextCycle = input.program_cycle_id?.trim() || nextCycleId(baselineCycleId, now());

  const denied = await guardAdmin("reset-next", { ...context, program_cycle_id: nextCycle }, input, deps);
  if (denied) {
    return denied;
  }

  let previousCycleId: string | undefined;
  if (active) {
    previousCycleId = active.program_cycle_id;
    await deps.persistence.setProgramCycleState(context.organization_id, active.program_cycle_id, "frozen", {
      frozen_at: now(),
      updated_at: now(),
    });
  }

  const cycle = await deps.persistence.upsertProgramCycle({
    organization_id: context.organization_id,
    program_cycle_id: nextCycle,
    root_problem_version_id: context.root_problem_version_id,
    state: "active",
    program_label: deps.config.program_label,
    created_by: input.actor_email,
    created_reason: input.reason ?? "soft-reset-next",
    activated_at: now(),
    created_at: now(),
    updated_at: now(),
  });

  return {
    ...okBase("reset-next", { ...context, program_cycle_id: nextCycle }, "RESET_NEXT_ACTIVE", `Program cycle '${nextCycle}' is active.`),
    cycle,
    previous_cycle_id: previousCycleId,
  };
}
