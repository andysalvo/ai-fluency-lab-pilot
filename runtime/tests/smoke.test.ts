import assert from "node:assert/strict";
import test from "node:test";
import { loadRuntimeConfig } from "../adapters/env.js";
import { InMemoryPersistenceAdapter } from "../adapters/inmemory.js";
import type { IngestRecord, ProtectedActionAuditRecord } from "../core/types.js";
import { handleRequest } from "../http/edge-entry.js";
import type { IngestStateUpdate, PersistenceAdapter } from "../adapters/persistence.js";

function makeDeps() {
  const persistence = new InMemoryPersistenceAdapter();
  const config = loadRuntimeConfig({
    PILOT_ALLOWED_EVENT_TYPES: "local_commit",
    PILOT_STUB_ALLOWLIST_STATE: "allowlisted",
    PILOT_STUB_ROLE: "student",
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
