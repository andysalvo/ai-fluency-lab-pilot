# AGENTS.md

## Purpose
This repository uses an Agent Operating System (Agent OS) so Codex work is safe, auditable, and understandable for a non-coder operator.

## Hard Rules
1. Never work on `main`.
2. Always branch from `dev` with prefix `codex/`.
3. Never commit secrets; pointers/placeholders only.
4. Preserve locked invariants from `/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/spec`.
5. No guessing: unknowns must be `TODO` plus `How to determine`.
6. Treat `supabase/.temp/*` as ignorable CLI cache.
7. Login success does not imply access; enforce allowlist and role server-side for every protected action.

## Locked Invariants Checklist
1. Commit-event triggers only.
2. No hidden cross-thread reads without explicit scope and audit.
3. No auto-publish.
4. No auto-merge.
5. Readiness gate is 2-of-3 (`claim`, `value`, `difference`) plus explicit confirmation.
6. Access is allowlist plus Google SSO.
7. Credits decrement only on successful publish and never go negative.

## Branch Policy
1. Cockpit/governance changes go on dedicated `codex/*` cockpit branches.
2. Construction/product changes go on separate `codex/*` construction branches.
3. Never mix cockpit and construction scopes in one PR.

## Evidence Bundle Requirement
Each change slice must include:
1. `git diff`.
2. Commands run.
3. `scripts/verify.sh` output.
4. Short engineering summary.
5. Plain-language summary for Andy.

## How Andy Works with Codex (Plain Language)
1. Ask for one thin slice at a time.
2. Codex will show what changed, what checks ran, and why it is safe.
3. Codex will stop before commit and wait for your approval.
4. If something is unknown, Codex will mark it as TODO and explain how to find the answer.
5. You can require separate branches for cockpit and construction at all times.

## Canonical Pack
Read and operate using:
`/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/agent_setup_pack/00_INDEX_AND_READING_ORDER.md` through
`/Users/andysalvo_1/Documents/GitHub/ai-fluency-lab-pilot/docs/agent_setup_pack/09_COLLABORATION_AND_HANDOFF.md`.
