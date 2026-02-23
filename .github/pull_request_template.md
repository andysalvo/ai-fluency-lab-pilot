## Summary
- What changed:
- Why this change is needed:

## Locked Invariants Checklist
- [ ] Commit-event triggers only.
- [ ] No hidden cross-thread reads without explicit scope and audit.
- [ ] No auto-publish.
- [ ] No auto-merge.
- [ ] Readiness gate is 2-of-3 plus explicit confirmation.
- [ ] Access is allowlist plus Google SSO.
- [ ] Credits decrement only on successful publish and never go negative.
- [ ] login success ≠ access; enforcement is server-side on every protected action.

## Evidence Checklist
- [ ] Included `git diff` in handoff.
- [ ] Included exact commands run.
- [ ] Included `scripts/verify.sh` output.
- [ ] Included a 5-bullet engineering summary.
- [ ] Included plain-language operator summary.

## Secrets Declaration
- [ ] I did not commit raw secrets.
- [ ] Any secret references are pointers/placeholders only.

## TODO / Unknowns
- [ ] Unknowns are explicitly marked as TODO with "How to determine".
