# Runbook: Dad + Me (10 Minutes)

## Goal
Prove two accounts can authenticate, select cycle, submit source, receive a Starter Brief, and publish with explicit gates.

## Steps
1. Confirm runtime deployed and `/health` returns `ok:true`.
2. In Notion Operator Console -> `Team Intake`, add your email as `active` in current cycle.
3. Login via Google callback flow with explicit `cycle_id`; confirm `login_success`.
4. In Notion team-facing surface, open `Research Inbox` and add:
   - `url`
   - `relevance_note` (2-3 sentences)
   - commit-event flag
5. Verify webhook response shows `post_ingest.result_code=STARTER_BRIEF_READY`.
6. Open visible surface endpoint and confirm Starter Brief includes provenance:
   - `Built only from: <URL>`
7. Run readiness evaluate (`claim/value/difference`) and confirm blocked reason if criteria missing.
8. Run publish with explicit confirmation and verify:
   - `reason_code=OK`
   - `credit_balance_after` decremented by `1`
9. Add dad email in Notion `Team Intake` and repeat steps 3-8 for dad account.
10. Capture evidence bundle: command outputs, reason codes, and published Lab Record entry.

## Quick Troubleshooting
- `CYCLE_NOT_SELECTED`: send explicit `cycle_id` in payload/header.
- `NO_MEMBERSHIP_FOR_CYCLE`: add membership record for that cycle.
- `CROSS_CYCLE_ACCESS_DENIED`: thread/resource belongs to different cycle.
- `HALTED_GLOBAL` or `HALTED_CYCLE`: clear halt flags in runtime controls.
- `TEAM_INTAKE_EMAIL_MISSING`: ensure Team Intake row has a valid email field.
- `RELEVANCE_NOTE_MISSING`: ensure Research Inbox relevance note is non-empty (<=500 chars).
- `NEEDS_CONFIRMATION`: publish call missing explicit confirmation.
