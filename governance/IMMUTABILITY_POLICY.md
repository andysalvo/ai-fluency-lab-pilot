# Governance Immutability Policy

## Purpose
This policy defines immutability boundaries for governance documentation and frozen artifacts.

## Rules
1. `governance/frozen_v1/` is immutable forever.
2. Files under `governance/frozen_v1/` must never be edited in place.
3. If updates are needed, create a new versioned frozen folder (for example `frozen_v2/`) and leave prior versions untouched.
4. Governance docs are reference/control-plane artifacts and must not be treated as runtime source code.
5. `governance/pilot_pack/DEFERRED_TODO.md` remains deferred unless an explicit, documented trigger is approved.
6. No raw secrets may be committed to git.
7. Matrix secret-bearing fields must use pointers/placeholders (for example `AI Fluency Lab Ops/<Item>#<Field>` or `TBD`) and not literal secret values.

## Enforcement
1. PRs adding or modifying governance docs must include a secret scan result.
2. Any change proposal touching frozen content is rejected unless it creates a new versioned folder.
