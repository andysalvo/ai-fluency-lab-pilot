# Applied AI Labs Scope Lock + Full Build Plan

## Scope Lock
1. Umbrella platform/company: `Applied AI Labs`.
2. Flagship lab program: `AI Fluency Lab`.
3. Canonical root artifact:
   - `AI Hub Problem Statement`
   - "How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?"
4. Student/operator flow remains Notion-first.
5. Runtime/ops backbone remains Supabase + Vercel (cloud-first, always-on).
6. Canonical publish artifact for pilot is a single readable one-page output:
   - `One-page Lab Brief`.

## In Scope (First Full Wave)
1. Article-to-brief R/D workflow with evidence traceability.
2. Governance-first operation suitable for Innovation Day demos.
3. Cloud-running system that supports cohort/time partitioning without deleting history.
4. Soft reset model for new cohorts/program periods.

## Out of Scope (First Full Wave)
1. Multiple polished student UIs beyond Notion-first workflow.
2. Open signup mechanics beyond allowlist governance.
3. Autonomous publishing or autonomous merge decisions.
4. Enterprise multi-region complexity before pilot validation.

## Canonical Output Contract (Innovation Day)
1. Artifact: `One-page Lab Brief`.
2. Required sections:
   - Context and article source
   - Root problem linkage
   - Key insight
   - Evidence and confidence
   - What changed in my thinking
   - Next experiment/test
3. Publish gate:
   - readiness `2-of-3` (`claim`, `value`, `difference`)
   - explicit confirmation
   - credit check and decrement only on successful publish

## Runtime/Data Decisions
1. Runtime shape remains Option B:
   - Supabase Edge runtime enforcement
   - Notion primary control plane
   - minimal Vercel glue surfaces
2. All operational writes must include:
   - `organization_id`
   - `program_cycle_id`
   - `root_problem_version_id`
3. Ingress mode source remains canonical:
   - `runtime_control.active_ingress_mode`
4. Program cycle states:
   - `draft`, `active`, `frozen`, `archived`
5. Snapshot states:
   - `started`, `completed`, `failed`, `verified`
6. Reset policy:
   - soft reset via new active cycle
   - previous active cycle becomes immutable (`frozen`/`archived`)
   - no destructive truncation

## API Surface (Current + Added)
1. Existing:
   - `POST /api/notion/webhook`
   - `POST /api/actions/publish`
   - `GET /health`
2. Added in this slice:
   - `POST /api/auth/callback/google`
   - `POST /api/actions/readiness/evaluate`
   - `POST /api/admin/cycles/create`
   - `POST /api/admin/cycles/{program_cycle_id}/activate`
   - `POST /api/admin/cycles/{program_cycle_id}/freeze`
   - `POST /api/admin/cycles/{program_cycle_id}/snapshot`
   - `POST /api/admin/cycles/{program_cycle_id}/export`
   - `POST /api/admin/cycles/{program_cycle_id}/reset-next`

## Snapshot + Legacy Contract
1. Snapshot bundle should include:
   - cycle-scoped DB export
   - Notion export (Threads/Turns/Outputs/Research)
   - non-secret config manifest with secret pointers only
   - evidence index + checksums
   - optional embedding-ready content bundle
2. Snapshot immutability:
   - checksum-based artifact manifest
   - read-only historical usage after freeze/archive

## Execution Waves
1. Wave 1: identity + governance completion.
2. Wave 2: Notion read/write loop completion.
3. Wave 3: readiness + one-page brief publish pipeline.
4. Wave 4: full `organization_id + program_cycle_id` partition enforcement.
5. Wave 5: snapshot/freeze/export/reset-next lifecycle hardening.
6. Wave 6: Innovation Day polish and operator runbook.
7. Wave 7: multi-cohort/multi-organization hardening.
