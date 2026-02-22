# Runbook: Dad + Me (10 Minutes)

## Goal
Prove two accounts can authenticate, select cycle, submit source, receive a Starter Brief, and publish with explicit gates.

## Steps
1. Confirm runtime deployed and `/health` returns `ok:true`.
2. Open Notion frontstage: `Applied AI Labs - AI Fluency at Smeal`.
3. Open private `Operator Console` -> `Team Intake`; ensure:
   - `ajs10845@psu.edu` = `role:operator`, `membership_state:active`
   - `andysalvo26@gmail.com` = `role:student`, `membership_state:invited|active`
4. Login `andysalvo26@gmail.com` via callback flow with explicit `cycle_id`; confirm `login_success`.
5. In frontstage `Add a Source`, submit:
   - `url`
   - `relevance_note` (2-3 sentences, <=500 chars)
6. Verify webhook/commit processing result is `post_ingest.result_code=STARTER_BRIEF_READY`.
7. Open visible surface endpoint and confirm Starter Brief includes provenance:
   - `Built only from: <URL>`
8. Run readiness evaluate (`claim/value/difference`) and confirm blocked reason if criteria missing.
9. Run publish with explicit confirmation and verify:
   - `reason_code=OK`
   - `credit_balance_after` decremented by `1`
   - output appears in `Lab Record`
10. Add dad email in `Team Intake` and repeat steps 4-9 for dad account.
11. Capture evidence bundle: command outputs, reason codes, and published Lab Record entry.

## Quick Troubleshooting
- `CYCLE_NOT_SELECTED`: send explicit `cycle_id` in payload/header.
- `NO_MEMBERSHIP_FOR_CYCLE`: add membership record for that cycle.
- `CROSS_CYCLE_ACCESS_DENIED`: thread/resource belongs to different cycle.
- `HALTED_GLOBAL` or `HALTED_CYCLE`: clear halt flags in runtime controls.
- `TEAM_INTAKE_EMAIL_MISSING`: ensure Team Intake row has a valid email field.
- `RELEVANCE_NOTE_MISSING`: ensure Research Inbox relevance note is non-empty (<=500 chars).
- `NEEDS_CONFIRMATION`: publish call missing explicit confirmation.
