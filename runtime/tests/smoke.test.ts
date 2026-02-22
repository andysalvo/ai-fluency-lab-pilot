import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadRuntimeConfig } from "../adapters/env.js";
import { InMemoryPersistenceAdapter } from "../adapters/inmemory.js";
import { normalizeLabBriefContent, validateLabBriefContent } from "../core/lab-brief.js";
import { mapWorkspaceToCardStack } from "../frontstage/cards.js";
import type { ThreadWorkspaceResponse } from "../core/types.js";
import {
  INITIAL_THREAD_DRAFT_PROMPT_CONTRACT_VERSION,
  LOCKED_REASONING_MODEL,
  generateStarterBrief,
  validateInitialThreadDraftContent,
} from "../core/starter-brief.js";
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

function readFixture(pathFromTestFile: string): Record<string, unknown> {
  const fixtureUrl = new URL(pathFromTestFile, import.meta.url);
  return JSON.parse(readFileSync(fixtureUrl, "utf8")) as Record<string, unknown>;
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

test("guided source submit endpoint creates starter brief and supports idempotent replay", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-001");
  await seedParticipant(deps, { participant_id: "p-submit", email: "submitter@example.com" });
  await seedMembership(deps, { participant_id: "p-submit", cycle_id: "cycle-001", membership_state: "active", role: "student" });

  const payload = {
    actor_email: "submitter@example.com",
    cycle_id: "cycle-001",
    client_request_id: "source-submit-1",
    url: "https://example.com/source-1",
    relevance_note: "This maps AI fluency to repeated reflection cycles students can actually sustain.",
    source_excerpt: "Repeated weekly reflection and applied projects increase durable fluency.",
  };

  const first = await handleRequest(
    new Request("http://localhost/api/sources/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
    deps,
  );
  assert.equal(first.status, 200);
  const firstBody = (await first.json()) as { reason_code: string; starter_brief_status: string };
  assert.equal(firstBody.reason_code, "STARTER_BRIEF_READY");
  assert.equal(firstBody.starter_brief_status, "ready");

  const replay = await handleRequest(
    new Request("http://localhost/api/sources/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
    deps,
  );
  assert.equal(replay.status, 200);
  const replayBody = (await replay.json()) as { replayed: boolean; reason_code: string };
  assert.equal(replayBody.replayed, true);
  assert.equal(replayBody.reason_code, "ALREADY_PROCESSED");
});

test("session cookie from login can drive source submit without explicit actor_email payload", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-001");
  await seedParticipant(deps, { participant_id: "p-cookie", email: "cookie-user@example.com" });
  await seedMembership(deps, { participant_id: "p-cookie", cycle_id: "cycle-001", membership_state: "invited", role: "student" });

  const login = await handleRequest(
    new Request("http://localhost/api/auth/callback/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "cookie-user@example.com",
        cycle_id: "cycle-001",
      }),
    }),
    deps,
  );

  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.ok(setCookie);
  const cookiePair = String(setCookie).split(";")[0];

  const submit = await handleRequest(
    new Request("http://localhost/api/sources/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookiePair,
      },
      body: JSON.stringify({
        client_request_id: "source-submit-cookie-1",
        url: "https://example.com/source-cookie-1",
        relevance_note: "This highlights how guided prompts can lower friction for new users.",
        source_excerpt: "Guided forms reduce drop-off in student contribution workflows.",
      }),
    }),
    deps,
  );

  assert.equal(submit.status, 200);
  const submitBody = (await submit.json()) as { reason_code: string };
  assert.equal(submitBody.reason_code, "STARTER_BRIEF_READY");
});

test("operator summary returns cycle metrics for operator role", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-001");
  await seedParticipant(deps, { participant_id: "p-op", email: "op@example.com", global_role: "operator" });
  await seedParticipant(deps, { participant_id: "p-student", email: "student@example.com" });
  await seedMembership(deps, { participant_id: "p-student", cycle_id: "cycle-001", membership_state: "active", role: "student", credits: 1 });

  await handleRequest(
    new Request("http://localhost/api/actions/readiness/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor_email: "student@example.com",
        cycle_id: "cycle-001",
        thread_id: "missing-thread",
        claim: true,
        value: false,
        difference: false,
        explicit_confirmation: false,
      }),
    }),
    deps,
  );

  const summary = await handleRequest(
    new Request("http://localhost/api/operator/summary?actor_email=op@example.com&cycle_id=cycle-001", {
      method: "GET",
    }),
    deps,
  );

  assert.equal(summary.status, 200);
  const body = (await summary.json()) as {
    ok: boolean;
    reason_code: string;
    cycle_state: string;
    active_members_count: number;
  };
  assert.equal(body.ok, true);
  assert.equal(body.reason_code, "OK");
  assert.equal(body.cycle_state, "active");
  assert.equal(body.active_members_count, 1);
});

test("operator can create a new cycle without pre-existing membership in target cycle", async () => {
  const deps = makeDeps();
  await seedParticipant(deps, { participant_id: "p-op-create", email: "operator-create@example.com", global_role: "operator" });

  const response = await handleRequest(
    new Request("http://localhost/api/admin/cycles/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor_email: "operator-create@example.com",
        cycle_id: "cycle-new-001",
      }),
    }),
    deps,
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; result_code: string };
  assert.equal(body.ok, true);
  assert.equal(body.result_code, "CYCLE_CREATED");
});

test("starter brief fallback conforms to initial thread draft schema and locked metadata", async () => {
  const config = loadRuntimeConfig({
    PILOT_ORGANIZATION_ID: "applied-ai-labs",
    PILOT_ACTIVE_PROGRAM_CYCLE_ID: "cycle-001",
    PILOT_ROOT_PROBLEM_VERSION_ID: "pilot-v1",
  });

  const output = await generateStarterBrief({
    url: "https://learningsciences.smu.edu/blog/artificial-intelligence-in-education",
    relevance_note:
      "The source shows AI benefits and risks in classrooms. This helps us think about sustained fluency over time.",
    focus_snapshot:
      "How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?",
    source_excerpt:
      "The article describes AI personalization benefits and implementation risks around equity, privacy, and teacher support.",
    config,
  });

  assert.equal(output.status, "ready");
  const check = validateInitialThreadDraftContent(output.payload as unknown as Record<string, unknown>);
  assert.equal(check.ok, true);
  assert.equal(output.payload.prompt_contract_version, INITIAL_THREAD_DRAFT_PROMPT_CONTRACT_VERSION);
  assert.equal(output.payload.model_name, LOCKED_REASONING_MODEL);
  assert.equal(output.payload.golden_example_id, "smu_ai_edu_A");
});

test("golden example fixtures validate for initial draft and lab record schemas", () => {
  const draftA = readFixture("../../fixtures/golden_examples/smu_ai_edu/approved_initial_thread_draft_A.json");
  const draftB = readFixture("../../fixtures/golden_examples/smu_ai_edu/approved_initial_thread_draft_B.json");
  const labA = readFixture("../../fixtures/golden_examples/smu_ai_edu/approved_lab_record_A.json");
  const labB = readFixture("../../fixtures/golden_examples/smu_ai_edu/approved_lab_record_B_candidate.json");

  assert.equal(validateInitialThreadDraftContent(draftA).ok, true);
  assert.equal(validateInitialThreadDraftContent(draftB).ok, true);
  assert.equal(validateLabBriefContent(labA).ok, true);
  assert.equal(validateLabBriefContent(labB).ok, true);
});

test("lab brief normalizer produces required canonical fields", () => {
  const normalized = normalizeLabBriefContent({
    content: {
      whatItIs: "AI fluency as repeatable reasoning practice.",
      whyItMatters: "Students need durable judgment under changing tools.",
      supporting_point: "Source identifies benefits and implementation risk.",
      nextTest: "Run two-week cohort pilot with guided refinement.",
    },
  });

  const result = validateLabBriefContent(normalized as unknown as Record<string, unknown>);
  assert.equal(result.ok, true);
  assert.equal(normalized.what_it_is.length > 0, true);
  assert.equal(normalized.why_it_matters.length > 0, true);
  assert.equal(normalized.evidence.length > 0, true);
  assert.equal(normalized.next_step.length > 0, true);
});

test("card mapper keeps provenance in collapsed details", () => {
  const workspace: ThreadWorkspaceResponse = {
    ok: true,
    reason_code: "OK",
    organization_id: "applied-ai-labs",
    cycle_id: "cycle-001",
    root_problem_version_id: "pilot-v1",
    thread_id: "thread-001",
    source: {
      source_submission_id: "src-1",
      thread_id: "thread-001",
      organization_id: "applied-ai-labs",
      cycle_id: "cycle-001",
      root_problem_version_id: "pilot-v1",
      participant_id: "p-1",
      raw_url: "https://example.com",
      canonical_url: "https://example.com",
      canonical_url_hash: "hash",
      canonicalizer_version: 1,
      relevance_note: "Relevant note",
      possible_duplicate: false,
      created_at: "2026-02-22T00:00:00.000Z",
    },
    starter_brief: {
      starter_brief_id: "brief-1",
      source_submission_id: "src-1",
      thread_id: "thread-001",
      organization_id: "applied-ai-labs",
      cycle_id: "cycle-001",
      root_problem_version_id: "pilot-v1",
      status: "ready",
      payload: {
        source_takeaway: "Source takeaway",
        student_note_takeaway: "Student note takeaway",
        combined_insight: "Combined insight",
        tension_or_assumption: "Assumption",
        next_best_move: "Run a pilot test",
        provenance: "Built only from: https://example.com",
        model_name: "gpt-4.1",
        prompt_contract_version: "initial_thread_draft_v1",
      },
      replay_payload: {},
      created_at: "2026-02-22T00:00:00.000Z",
      updated_at: "2026-02-22T00:00:00.000Z",
    },
    rounds: [],
    question_items: [],
    lab_brief_draft: null,
    publish_state: "not_ready",
    next_best_action: "Start Guided Round 1 (5 quick questions).",
  };

  const stack = mapWorkspaceToCardStack(workspace, "Canonical focus text");
  const draftCard = stack.cards.find((card) => card.id === "initial-thread-draft");
  assert.ok(draftCard);
  const provenance = draftCard!.details?.find((item) => item.key === "provenance");
  assert.equal(provenance?.value, "Built only from: https://example.com");
});

test("guided round + lab brief proposal flow works with deterministic cards path", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-001");
  await seedParticipant(deps, { participant_id: "p-round", email: "rounder@example.com" });
  await seedMembership(deps, { participant_id: "p-round", cycle_id: "cycle-001", membership_state: "active", role: "student" });

  const submit = await handleRequest(
    new Request("http://localhost/api/sources/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor_email: "rounder@example.com",
        cycle_id: "cycle-001",
        client_request_id: "round-source-1",
        url: "https://example.com/round-source-1",
        relevance_note: "This source supports a measurable student fluency workflow.",
      }),
    }),
    deps,
  );
  assert.equal(submit.status, 200);
  const submitBody = (await submit.json()) as { thread_id: string };
  assert.ok(submitBody.thread_id);

  const startRound = await handleRequest(
    new Request("http://localhost/api/questions/round/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor_email: "rounder@example.com",
        cycle_id: "cycle-001",
        thread_id: submitBody.thread_id,
        client_request_id: "round-start-1",
      }),
    }),
    deps,
  );
  assert.equal(startRound.status, 200);
  const startBody = (await startRound.json()) as { items: Array<{ question_item_id: string }> };
  assert.equal(startBody.items.length, 5);

  for (const item of startBody.items) {
    const answer = await handleRequest(
      new Request("http://localhost/api/questions/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actor_email: "rounder@example.com",
          cycle_id: "cycle-001",
          thread_id: submitBody.thread_id,
          question_item_id: item.question_item_id,
          selected_option: "A",
        }),
      }),
      deps,
    );
    assert.equal(answer.status, 200);
  }

  const propose = await handleRequest(
    new Request("http://localhost/api/lab-brief/propose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor_email: "rounder@example.com",
        cycle_id: "cycle-001",
        thread_id: submitBody.thread_id,
        client_request_id: "brief-propose-1",
      }),
    }),
    deps,
  );
  assert.equal(propose.status, 200);
  const proposeBody = (await propose.json()) as { reason_code: string };
  assert.equal(proposeBody.reason_code, "LAB_BRIEF_DRAFT_READY");

  const workspace = await handleRequest(
    new Request("http://localhost/api/thread/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor_email: "rounder@example.com",
        cycle_id: "cycle-001",
        thread_id: submitBody.thread_id,
      }),
    }),
    deps,
  );
  assert.equal(workspace.status, 200);
  const workspaceBody = (await workspace.json()) as { next_best_action: string };
  assert.equal(workspaceBody.next_best_action.length > 0, true);
});

test("demo path smoke: source to publish renders thread cards with 200", async () => {
  const deps = makeDeps();
  await seedCycle(deps, "cycle-001");
  await seedParticipant(deps, { participant_id: "p-demo", email: "demo-user@example.com" });
  await seedMembership(deps, { participant_id: "p-demo", cycle_id: "cycle-001", membership_state: "invited", role: "student", credits: 2 });

  const login = await handleRequest(
    new Request("http://localhost/api/auth/callback/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "demo-user@example.com",
        cycle_id: "cycle-001",
      }),
    }),
    deps,
  );
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.ok(setCookie);
  const cookiePair = String(setCookie).split(";")[0];

  const submit = await handleRequest(
    new Request("http://localhost/api/sources/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookiePair,
      },
      body: JSON.stringify({
        cycle_id: "cycle-001",
        client_request_id: "demo-source-1",
        url: "https://example.com/demo-source-1",
        relevance_note: "This source gives a practical way to measure fluency gains in a short cycle.",
      }),
    }),
    deps,
  );
  assert.equal(submit.status, 200);
  const submitBody = (await submit.json()) as { thread_id?: string };
  assert.ok(submitBody.thread_id);
  const threadId = submitBody.thread_id!;

  const startRound = await handleRequest(
    new Request("http://localhost/api/questions/round/start", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookiePair,
      },
      body: JSON.stringify({
        cycle_id: "cycle-001",
        thread_id: threadId,
        client_request_id: "demo-round-start-1",
      }),
    }),
    deps,
  );
  assert.equal(startRound.status, 200);
  const roundBody = (await startRound.json()) as { items: Array<{ question_item_id: string }> };
  assert.equal(roundBody.items.length, 5);

  for (const item of roundBody.items) {
    const answer = await handleRequest(
      new Request("http://localhost/api/questions/answer", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: cookiePair,
        },
        body: JSON.stringify({
          cycle_id: "cycle-001",
          thread_id: threadId,
          question_item_id: item.question_item_id,
          selected_option: "A",
          client_request_id: `demo-answer-${item.question_item_id}`,
        }),
      }),
      deps,
    );
    assert.equal(answer.status, 200);
  }

  const propose = await handleRequest(
    new Request("http://localhost/api/lab-brief/propose", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookiePair,
      },
      body: JSON.stringify({
        cycle_id: "cycle-001",
        thread_id: threadId,
        client_request_id: "demo-brief-1",
      }),
    }),
    deps,
  );
  assert.equal(propose.status, 200);

  const publish = await handleRequest(
    new Request("http://localhost/api/actions/publish", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookiePair,
      },
      body: JSON.stringify({
        cycle_id: "cycle-001",
        thread_id: threadId,
        claim: true,
        value: true,
        difference: false,
        explicit_confirmation: true,
        client_request_id: "demo-publish-1",
      }),
    }),
    deps,
  );
  assert.equal(publish.status, 200);

  const threadPage = await handleRequest(
    new Request(`http://localhost/thread?thread_id=${encodeURIComponent(threadId)}&cycle_id=cycle-001`, {
      method: "GET",
      headers: {
        cookie: cookiePair,
      },
    }),
    deps,
  );
  assert.equal(threadPage.status, 200);
  const html = await threadPage.text();
  assert.equal(html.includes("Initial Thread Draft"), true);
  assert.equal(html.includes("Guided Rounds"), true);
  assert.equal(html.includes("Lab Brief"), true);
  assert.equal(html.includes("Details"), true);
});
