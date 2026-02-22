# Applied AI Labs

Applied AI Labs is building a simple, governed idea warehouse for student AI fluency research.

Cycle 1 product:
- students answer one fixed focus question in Notion
- each submission is stored in Supabase
- each submission gets an embedding for analysis

This repository is organized to keep the active system easy to understand:
- `docs/warehouse/` -> canonical plan and implementation contract
- `governance/` -> immutable safety and policy corpus
- `runtime/` -> Notion webhook + runtime services
- `supabase/` -> schema and migrations

Start here:
- `/docs/README.md`
- `/docs/warehouse/00_MANIFESTO.md`

## Focus Question (Cycle 1)
How do we build sustained AI fluency inside a student population when the technology and norms are constantly shifting?

## Non-Negotiable Constraints
- No hidden cross-thread reads
- No auto-publish
- Readiness requires 2-of-3 checks plus explicit confirmation
- Protected actions are server-enforced
- Notion is UX; Supabase is enforcement and system-of-record
