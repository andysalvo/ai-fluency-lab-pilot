import assert from "node:assert/strict";
import test from "node:test";
import { loadRuntimeConfig } from "../adapters/env.js";
import { InMemoryPersistenceAdapter } from "../adapters/inmemory.js";
import { handleRequest } from "../http/edge-entry.js";

function makeDeps() {
  const persistence = new InMemoryPersistenceAdapter();
  const config = loadRuntimeConfig({
    PILOT_ALLOWED_EVENT_TYPES: "local_commit",
    PILOT_STUB_ROLE: "student",
    PILOT_ORGANIZATION_ID: "applied-ai-labs",
    PILOT_ACTIVE_PROGRAM_CYCLE_ID: "cycle-001",
    PILOT_ROOT_PROBLEM_VERSION_ID: "pilot-v1",
  });

  return { persistence, config };
}

async function seedCycle(deps: ReturnType<typeof makeDeps>, cycleId: string, state: "draft" | "active" | "locked" | "archived" = "active") {
  await deps.persistence.upsertProgramCycle({
    organization_id: "applied-ai-labs",
    cycle_id: cycleId,
    root_problem_version_id: "pilot-v1",
    focus_snapshot: "focus snapshot",
    state,
    program_label: "AI Fluency Lab",
  });
}

async function seedParticipant(
  deps: ReturnType<typeof makeDeps>,
  input: { participant_id: string; email: string; global_role?: "member" | "operator" | "admin"; global_state?: "active" | "blocked" },
) {
  await deps.persistence.upsertParticipant({
    participant_id: input.participant_id,
    email_canonical: input.email,
    global_role: input.global_role ?? "member",
    global_state: input.global_state ?? "active",
  });
}

async function seedMembership(
  deps: ReturnType<typeof makeDeps>,
  input: {
    participant_id: string;
    cycle_id: string;
    role?: "student" | "moderator" | "facilitator" | "operator";
    membership_state?: "invited" | "active" | "inactive" | "revoked";
    credits?: number;
  },
) {
  await deps.persistence.upsertCycleMembership({
    participant_id: input.participant_id,
    organization_id: "applied-ai-labs",
    cycle_id: input.cycle_id,
    role: input.role ?? "student",
    membership_state: input.membership_state ?? "active",
    credits: input.credits ?? 1,
  });
}

async function seedThread(deps: ReturnType<typeof makeDeps>, threadId: string, cycleId: string, participantId: string) {
  await deps.persistence.upsertThread({
    thread_id: threadId,
    organization_id: "applied-ai-labs",
    cycle_id: cycleId,
    root_problem_version_id: "pilot-v1",
    owner_participant_id: participantId,
    status: "ready",
  });
}

test("ingest accepts local_commit and dedupes on idempotency key per cycle", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-001");

  const payload = {
    source_table: "turns",
    source_record_id: "turn-001",
    event_type: "local_commit",
    occurred_at: "2026-02-21T16:00:00.000Z",
    idempotency_key: "slice1-dup-key-cycle001",
    cycle_id: "cycle-001",
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

test("missing cycle_id is rejected", async () => {
  const deps = makeDeps();
  const response = await handleRequest(
    new Request("http://localhost/api/notion/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source_table: "turns",
        source_record_id: "turn-002",
        event_type: "local_commit",
        occurred_at: "2026-02-21T16:01:00.000Z",
        idempotency_key: "missing-cycle",
      }),
    }),
    deps,
  );

  assert.equal(response.status, 400);
  const body = (await response.json()) as { result_code: string };
  assert.equal(body.result_code, "CYCLE_NOT_SELECTED");
});

test("non-allowlisted user is blocked at login", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-001");

  const blocked = await handleRequest(
    new Request("http://localhost/api/auth/callback/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "blocked@example.com", cycle_id: "cycle-001" }),
    }),
    deps,
  );

  assert.equal(blocked.status, 403);
  const blockedJson = (await blocked.json()) as { login_state: string };
  assert.equal(blockedJson.login_state, "login_blocked_not_allowlisted");
});

test("allowlisted invited membership becomes active on first successful login", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-001");
  await seedParticipant(deps, { participant_id: "p-1", email: "allowlisted@example.com" });
  await seedMembership(deps, { participant_id: "p-1", cycle_id: "cycle-001", membership_state: "invited", role: "student" });

  const allowed = await handleRequest(
    new Request("http://localhost/api/auth/callback/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "allowlisted@example.com", cycle_id: "cycle-001" }),
    }),
    deps,
  );

  assert.equal(allowed.status, 200);
  const allowedJson = (await allowed.json()) as { login_state: string; access_granted: boolean; membership_state: string };
  assert.equal(allowedJson.login_state, "login_success");
  assert.equal(allowedJson.access_granted, true);
  assert.equal(allowedJson.membership_state, "active");

  const membership = await deps.persistence.getCycleMembership("p-1", "applied-ai-labs", "cycle-001");
  assert.equal(membership?.membership_state, "active");
});

test("active cycle selection enforces one active membership", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-a");
  await seedCycle(deps, "cycle-b");
  await seedParticipant(deps, { participant_id: "p-2", email: "member@example.com" });
  await seedMembership(deps, { participant_id: "p-2", cycle_id: "cycle-a", membership_state: "active" });
  await seedMembership(deps, { participant_id: "p-2", cycle_id: "cycle-b", membership_state: "invited" });

  const response = await handleRequest(
    new Request("http://localhost/api/session/active-cycle/select", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor_email: "member@example.com", cycle_id: "cycle-b" }),
    }),
    deps,
  );

  assert.equal(response.status, 200);
  const aMembership = await deps.persistence.getCycleMembership("p-2", "applied-ai-labs", "cycle-a");
  const bMembership = await deps.persistence.getCycleMembership("p-2", "applied-ai-labs", "cycle-b");
  assert.equal(aMembership?.membership_state, "inactive");
  assert.equal(bMembership?.membership_state, "active");
});

test("user in Cycle A cannot publish a thread in Cycle B", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-a");
  await seedCycle(deps, "cycle-b");
  await seedParticipant(deps, { participant_id: "p-3", email: "user@example.com" });
  await seedMembership(deps, { participant_id: "p-3", cycle_id: "cycle-a", membership_state: "active", role: "moderator" });
  await seedThread(deps, "thread-b", "cycle-b", "p-3");

  const response = await handleRequest(
    new Request("http://localhost/api/actions/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor_email: "user@example.com",
        cycle_id: "cycle-a",
        thread_id: "thread-b",
      }),
    }),
    deps,
  );

  assert.equal(response.status, 403);
  const body = (await response.json()) as { reason_code: string };
  assert.equal(body.reason_code, "CROSS_CYCLE_ACCESS_DENIED");
});

test("no cycle selected for readiness returns deterministic reason code", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-001");
  await seedParticipant(deps, { participant_id: "p-4", email: "readiness@example.com" });
  await seedMembership(deps, { participant_id: "p-4", cycle_id: "cycle-001", membership_state: "active", role: "student" });
  await seedThread(deps, "thread-001", "cycle-001", "p-4");

  const response = await handleRequest(
    new Request("http://localhost/api/actions/readiness/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor_email: "readiness@example.com",
        thread_id: "thread-001",
        claim: true,
        value: true,
        explicit_confirmation: false,
      }),
    }),
    deps,
  );

  assert.equal(response.status, 403);
  const body = (await response.json()) as { reason_code: string };
  assert.equal(body.reason_code, "CYCLE_NOT_SELECTED");
});

test("archived cycle is hidden from participants in visible surface", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-archived", "archived");
  await seedParticipant(deps, { participant_id: "p-5", email: "archived@example.com" });
  await seedMembership(deps, { participant_id: "p-5", cycle_id: "cycle-archived", membership_state: "active", role: "student" });

  const response = await handleRequest(
    new Request("http://localhost/api/visible-surface", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor_email: "archived@example.com",
        cycle_id: "cycle-archived",
      }),
    }),
    deps,
  );

  assert.equal(response.status, 403);
  const body = (await response.json()) as { reason_code: string };
  assert.equal(body.reason_code, "CYCLE_ARCHIVED");
});

test("membership revoked mid-session denies subsequent protected action", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-001");
  await seedParticipant(deps, { participant_id: "p-6", email: "revoked@example.com" });
  await seedMembership(deps, { participant_id: "p-6", cycle_id: "cycle-001", membership_state: "active", role: "student" });
  await seedThread(deps, "thread-006", "cycle-001", "p-6");

  const login = await handleRequest(
    new Request("http://localhost/api/auth/callback/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "revoked@example.com", cycle_id: "cycle-001" }),
    }),
    deps,
  );
  assert.equal(login.status, 200);

  await seedMembership(deps, { participant_id: "p-6", cycle_id: "cycle-001", membership_state: "revoked", role: "student" });

  const response = await handleRequest(
    new Request("http://localhost/api/actions/readiness/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor_email: "revoked@example.com",
        cycle_id: "cycle-001",
        thread_id: "thread-006",
        claim: true,
        value: true,
        explicit_confirmation: false,
      }),
    }),
    deps,
  );

  assert.equal(response.status, 403);
  const body = (await response.json()) as { reason_code: string };
  assert.equal(body.reason_code, "NO_MEMBERSHIP_FOR_CYCLE");
});

test("health includes halt status and ingress mode", async () => {
  const deps = makeDeps();

  const response = await handleRequest(new Request("http://localhost/health"), deps);

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    active_ingress_mode: string;
    global_protected_actions_halt: boolean;
  };
  assert.equal(body.active_ingress_mode, "supabase_edge");
  assert.equal(body.global_protected_actions_halt, false);
});

test("team intake webhook syncs participant and active membership", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-001");

  const response = await handleRequest(
    new Request("http://localhost/api/notion/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source_table: "team_intake",
        source_record_id: "team-row-1",
        event_type: "local_commit",
        occurred_at: "2026-02-21T17:00:00.000Z",
        idempotency_key: "team-intake-1",
        cycle_id: "cycle-001",
        email: "new-member@example.com",
        role: "student",
        membership_state: "active",
        credits: 2,
        actor_email: "operator@example.com",
      }),
    }),
    deps,
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as { post_ingest?: { result_code?: string } };
  assert.equal(body.post_ingest?.result_code, "TEAM_INTAKE_SYNCED");

  const participant = await deps.persistence.getParticipantByEmailCanonical("new-member@example.com");
  assert.ok(participant);
  const membership = await deps.persistence.getCycleMembership(participant!.participant_id, "applied-ai-labs", "cycle-001");
  assert.equal(membership?.membership_state, "active");
  assert.equal(membership?.credits, 2);
});

test("research inbox webhook creates source and starter brief with provenance", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-001");
  await seedParticipant(deps, { participant_id: "p-r1", email: "researcher@example.com" });
  await seedMembership(deps, { participant_id: "p-r1", cycle_id: "cycle-001", membership_state: "active", role: "student" });

  const response = await handleRequest(
    new Request("http://localhost/api/notion/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source_table: "research_inbox",
        source_record_id: "research-row-1",
        event_type: "local_commit",
        occurred_at: "2026-02-21T17:05:00.000Z",
        idempotency_key: "research-intake-1",
        cycle_id: "cycle-001",
        submitted_by: "researcher@example.com",
        url: "https://example.com/article?utm_source=test",
        relevance_note: "This gives a practical model for repeated AI skill practice in class.",
        source_excerpt: "The article argues fluency grows through repeatable weekly practice and reflective checkpoints.",
      }),
    }),
    deps,
  );

  assert.equal(response.status, 200);
  const visible = await handleRequest(
    new Request("http://localhost/api/visible-surface", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor_email: "researcher@example.com",
        cycle_id: "cycle-001",
      }),
    }),
    deps,
  );
  assert.equal(visible.status, 200);
  const visibleBody = (await visible.json()) as {
    threads: Array<{ thread_id: string }>;
    sources: Array<{ canonical_url: string }>;
    starter_briefs: Array<{ status: string; payload: { provenance?: string } }>;
  };
  assert.equal(visibleBody.threads.length, 1);
  assert.equal(visibleBody.sources.length, 1);
  assert.equal(visibleBody.starter_briefs.length, 1);
  assert.equal(visibleBody.starter_briefs[0]?.status, "ready");
  assert.equal(visibleBody.starter_briefs[0]?.payload?.provenance, "Built only from: https://example.com/article?utm_source=test");
});

test("publish is explicit, credit-safe, and idempotent by client_request_id", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-001");
  await seedParticipant(deps, { participant_id: "p-pub", email: "publisher@example.com" });
  await seedMembership(deps, { participant_id: "p-pub", cycle_id: "cycle-001", membership_state: "active", role: "student", credits: 1 });
  await seedThread(deps, "thread-pub", "cycle-001", "p-pub");

  const blocked = await handleRequest(
    new Request("http://localhost/api/actions/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor_email: "publisher@example.com",
        cycle_id: "cycle-001",
        thread_id: "thread-pub",
        claim: true,
        value: true,
        difference: false,
        explicit_confirmation: false,
        client_request_id: "pub-req-1",
      }),
    }),
    deps,
  );
  assert.equal(blocked.status, 403);
  const blockedBody = (await blocked.json()) as { reason_code: string };
  assert.equal(blockedBody.reason_code, "NEEDS_CONFIRMATION");
  const membershipAfterBlock = await deps.persistence.getCycleMembership("p-pub", "applied-ai-labs", "cycle-001");
  assert.equal(membershipAfterBlock?.credits, 1);

  const success = await handleRequest(
    new Request("http://localhost/api/actions/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor_email: "publisher@example.com",
        cycle_id: "cycle-001",
        thread_id: "thread-pub",
        claim: true,
        value: true,
        difference: false,
        explicit_confirmation: true,
        client_request_id: "pub-req-2",
        content: {
          what_it_is: "Pilot publication",
        },
      }),
    }),
    deps,
  );
  assert.equal(success.status, 200);
  const successBody = (await success.json()) as { reason_code: string; credit_balance_after: number };
  assert.equal(successBody.reason_code, "OK");
  assert.equal(successBody.credit_balance_after, 0);

  const replay = await handleRequest(
    new Request("http://localhost/api/actions/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor_email: "publisher@example.com",
        cycle_id: "cycle-001",
        thread_id: "thread-pub",
        claim: true,
        value: true,
        difference: false,
        explicit_confirmation: true,
        client_request_id: "pub-req-2",
        content: {
          what_it_is: "Pilot publication",
        },
      }),
    }),
    deps,
  );
  assert.equal(replay.status, 200);
  const replayBody = (await replay.json()) as { replayed: boolean; credit_balance_after: number };
  assert.equal(replayBody.replayed, false);
  assert.equal(replayBody.credit_balance_after, 0);

  const membershipAfterSuccess = await deps.persistence.getCycleMembership("p-pub", "applied-ai-labs", "cycle-001");
  assert.equal(membershipAfterSuccess?.credits, 0);
});
