import assert from "node:assert/strict";
import test from "node:test";
import { loadRuntimeConfig } from "../adapters/env.js";
import { InMemoryPersistenceAdapter } from "../adapters/inmemory.js";
import { handleRequest } from "../http/edge-entry.js";

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
