import assert from "node:assert/strict";
import test from "node:test";
import { loadRuntimeConfig } from "../adapters/env.js";
import { InMemoryPersistenceAdapter } from "../adapters/inmemory.js";
import type {
  CycleSnapshotArtifactRecord,
  CycleSnapshotRecord,
  IngestRecord,
  ProgramCycleRecord,
  ProgramCycleState,
  ProtectedActionAuditRecord,
} from "../core/types.js";
import { handleRequest } from "../http/edge-entry.js";
import type { IngestStateUpdate, PersistenceAdapter } from "../adapters/persistence.js";

function makeDeps() {
  const persistence = new InMemoryPersistenceAdapter();
  const config = loadRuntimeConfig({
    PILOT_ALLOWED_EVENT_TYPES: "local_commit",
    PILOT_STUB_ALLOWLIST_STATE: "allowlisted",
    PILOT_STUB_ROLE: "student",
    PILOT_ORGANIZATION_ID: "applied-ai-labs",
    PILOT_ACTIVE_PROGRAM_CYCLE_ID: "cycle-001",
    PILOT_ROOT_PROBLEM_VERSION_ID: "pilot-v1",
  });

  return { persistence, config };
}

test("ingest accepts local_commit and dedupes on idempotency key", async () => {
  const deps = makeDeps();

  const payload = {
    source_table: "turns",
    source_record_id: "turn-001",
    event_type: "local_commit",
    occurred_at: "2026-02-21T16:00:00.000Z",
    idempotency_key: "slice1-dup-key",
  };

  const first = await handleRequest(
    new Request("http://localhost/api/notion/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
    deps,
  );

  assert.equal(first.status, 200);
  const firstJson = (await first.json()) as { ingest_state: string; result_code: string };
  assert.equal(firstJson.ingest_state, "processed");
  assert.equal(firstJson.result_code, "INGEST_ACCEPTED");

  const second = await handleRequest(
    new Request("http://localhost/api/notion/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
    deps,
  );

  assert.equal(second.status, 200);
  const secondJson = (await second.json()) as { ingest_state: string; result_code: string };
  assert.equal(secondJson.ingest_state, "duplicate");
  assert.equal(secondJson.result_code, "DUPLICATE_SKIPPED");
});

test("non-commit event_type is rejected", async () => {
  const deps = makeDeps();

  const payload = {
    source_table: "turns",
    source_record_id: "turn-002",
    event_type: "autosave",
    occurred_at: "2026-02-21T16:01:00.000Z",
    idempotency_key: "slice1-non-commit",
  };

  const response = await handleRequest(
    new Request("http://localhost/api/notion/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
    deps,
  );

  assert.equal(response.status, 400);
  const body = (await response.json()) as { result_code: string; ingest_state: string };
  assert.equal(body.result_code, "TRIGGER_NOT_ALLOWED");
  assert.equal(body.ingest_state, "failed");
});

test("publish action is denied with deterministic reason code", async () => {
  const deps = makeDeps();

  const response = await handleRequest(
    new Request("http://localhost/api/actions/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ thread_id: "thread-001" }),
    }),
    deps,
  );

  assert.equal(response.status, 403);
  const body = (await response.json()) as { reason_code: string; allowed: boolean };
  assert.equal(body.allowed, false);
  assert.equal(body.reason_code, "IDENTITY_UNRESOLVED");
});

test("readiness evaluate enforces 2-of-3 plus explicit confirmation", async () => {
  const deps = makeDeps();

  const notReady = await handleRequest(
    new Request("http://localhost/api/actions/readiness/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        thread_id: "thread-001",
        claim: true,
        value: true,
        difference: false,
        explicit_confirmation: false,
      }),
    }),
    deps,
  );

  assert.equal(notReady.status, 400);
  const notReadyJson = (await notReady.json()) as { ready_to_publish: boolean; reason_code: string };
  assert.equal(notReadyJson.ready_to_publish, false);
  assert.equal(notReadyJson.reason_code, "NEEDS_CONFIRMATION");

  const ready = await handleRequest(
    new Request("http://localhost/api/actions/readiness/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        thread_id: "thread-001",
        claim: true,
        value: true,
        difference: false,
        explicit_confirmation: true,
      }),
    }),
    deps,
  );

  assert.equal(ready.status, 200);
  const readyJson = (await ready.json()) as { ready_to_publish: boolean; reason_code: string };
  assert.equal(readyJson.ready_to_publish, true);
  assert.equal(readyJson.reason_code, "READY");
});

test("google auth callback blocks non-allowlisted users and grants allowlisted users", async () => {
  const deps = makeDeps();

  const blocked = await handleRequest(
    new Request("http://localhost/api/auth/callback/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "blocked@example.com" }),
    }),
    deps,
  );

  assert.equal(blocked.status, 403);
  const blockedJson = (await blocked.json()) as { login_state: string };
  assert.equal(blockedJson.login_state, "login_blocked_not_allowlisted");

  const allowed = await handleRequest(
    new Request("http://localhost/api/auth/callback/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "allowlisted@example.com", allowlist_state: "allowlisted", role: "student" }),
    }),
    deps,
  );

  assert.equal(allowed.status, 200);
  const allowedJson = (await allowed.json()) as { login_state: string; access_granted: boolean };
  assert.equal(allowedJson.login_state, "login_success");
  assert.equal(allowedJson.access_granted, true);
});

test("cycle admin endpoints enforce guard and support create/activate/snapshot/export/reset-next", async () => {
  const deps = makeDeps();

  const denied = await handleRequest(
    new Request("http://localhost/api/admin/cycles/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ program_cycle_id: "cycle-denied" }),
    }),
    deps,
  );
  assert.equal(denied.status, 403);

  const create = await handleRequest(
    new Request("http://localhost/api/admin/cycles/create", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-email": "operator@example.com",
        "x-allowlist-state": "active",
        "x-role": "operator",
      },
      body: JSON.stringify({ program_cycle_id: "cycle-innovation-day-002", reason: "new cohort" }),
    }),
    deps,
  );
  assert.equal(create.status, 200);

  const activate = await handleRequest(
    new Request("http://localhost/api/admin/cycles/cycle-innovation-day-002/activate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-email": "operator@example.com",
        "x-allowlist-state": "active",
        "x-role": "operator",
      },
      body: JSON.stringify({ reason: "kickoff cycle" }),
    }),
    deps,
  );
  assert.equal(activate.status, 200);

  const snapshot = await handleRequest(
    new Request("http://localhost/api/admin/cycles/cycle-innovation-day-002/snapshot", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-email": "operator@example.com",
        "x-allowlist-state": "active",
        "x-role": "operator",
      },
      body: JSON.stringify({ reason: "innovation day checkpoint" }),
    }),
    deps,
  );
  assert.equal(snapshot.status, 200);
  const snapshotBody = (await snapshot.json()) as { snapshot?: { snapshot_state?: string } };
  assert.equal(snapshotBody.snapshot?.snapshot_state, "completed");

  const exportResponse = await handleRequest(
    new Request("http://localhost/api/admin/cycles/cycle-innovation-day-002/export", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-email": "operator@example.com",
        "x-allowlist-state": "active",
        "x-role": "operator",
      },
      body: JSON.stringify({ reason: "prepare archive" }),
    }),
    deps,
  );
  assert.equal(exportResponse.status, 200);
  const exportBody = (await exportResponse.json()) as { artifacts?: unknown[] };
  assert.ok(Array.isArray(exportBody.artifacts) && exportBody.artifacts.length > 0);

  const resetNext = await handleRequest(
    new Request("http://localhost/api/admin/cycles/cycle-innovation-day-002/reset-next", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-email": "operator@example.com",
        "x-allowlist-state": "active",
        "x-role": "operator",
      },
      body: JSON.stringify({ reason: "new period" }),
    }),
    deps,
  );
  assert.equal(resetNext.status, 200);
});

class HealthModeAdapter implements PersistenceAdapter {
  async getActiveIngressMode(): Promise<string | null> {
    return "vercel_fallback";
  }

  async getIngestByIdempotencyKey(_idempotencyKey: string): Promise<IngestRecord | null> {
    return null;
  }

  async insertIngest(_record: Omit<IngestRecord, "event_id" | "created_at">): Promise<IngestRecord> {
    throw new Error("not needed in this test");
  }

  async updateIngestState(_eventId: string, _update: IngestStateUpdate): Promise<IngestRecord | null> {
    return null;
  }

  async insertProtectedActionAudit(
    _record: Omit<ProtectedActionAuditRecord, "audit_id" | "created_at">,
  ): Promise<ProtectedActionAuditRecord> {
    throw new Error("not needed in this test");
  }

  async getProgramCycle(_organizationId: string, _programCycleId: string): Promise<ProgramCycleRecord | null> {
    return null;
  }

  async getActiveProgramCycle(_organizationId: string): Promise<ProgramCycleRecord | null> {
    return null;
  }

  async upsertProgramCycle(
    _record: Omit<ProgramCycleRecord, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string },
  ): Promise<ProgramCycleRecord> {
    throw new Error("not needed in this test");
  }

  async setProgramCycleState(
    _organizationId: string,
    _programCycleId: string,
    _state: ProgramCycleState,
    _update: {
      activated_at?: string;
      frozen_at?: string;
      archived_at?: string;
      updated_at?: string;
    },
  ): Promise<ProgramCycleRecord | null> {
    return null;
  }

  async insertCycleSnapshot(
    _record: Omit<CycleSnapshotRecord, "snapshot_id" | "created_at" | "updated_at"> & {
      snapshot_id?: string;
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<CycleSnapshotRecord> {
    throw new Error("not needed in this test");
  }

  async updateCycleSnapshot(
    _snapshotId: string,
    _update: {
      snapshot_state: CycleSnapshotRecord["snapshot_state"];
      manifest?: Record<string, unknown>;
      completed_at?: string;
      updated_at?: string;
    },
  ): Promise<CycleSnapshotRecord | null> {
    return null;
  }

  async listCycleSnapshots(_organizationId: string, _programCycleId: string): Promise<CycleSnapshotRecord[]> {
    return [];
  }

  async insertCycleSnapshotArtifact(
    _record: Omit<CycleSnapshotArtifactRecord, "artifact_id" | "created_at">,
  ): Promise<CycleSnapshotArtifactRecord> {
    throw new Error("not needed in this test");
  }

  async listCycleSnapshotArtifacts(_snapshotId: string): Promise<CycleSnapshotArtifactRecord[]> {
    return [];
  }
}

test("health resolves ingress mode from canonical source when available", async () => {
  const config = loadRuntimeConfig({
    PILOT_PERSISTENCE_BACKEND: "supabase",
    PILOT_RUNTIME_ACTIVE_INGRESS_MODE: "supabase_edge",
    PILOT_RUNTIME_INGRESS_MODE_SOURCE: "supabase.table.runtime_control.active_ingress_mode",
  });

  const response = await handleRequest(new Request("http://localhost/health"), {
    config,
    persistence: new HealthModeAdapter(),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { active_ingress_mode: string; ingress_mode_source: string };
  assert.equal(body.ingress_mode_source, "supabase.table.runtime_control.active_ingress_mode");
  assert.equal(body.active_ingress_mode, "vercel_fallback");
});
