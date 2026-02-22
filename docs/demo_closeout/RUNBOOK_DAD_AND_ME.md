# Runbook: Dad + Me (10 Minutes)

## Goal
Prove two accounts can authenticate, select cycle, submit source, receive a Starter Brief, and publish with explicit gates.

## Steps
1. Confirm runtime deployed and `/health` returns `ok:true`.
2. Open Notion frontstage: `Applied AI Labs - AI Fluency at Smeal`.
3. Open private `Operator Console` -> `Team Intake`; ensure:
   - `ajs10845@psu.edu` = `role:operator`, `membership_state:active`
   - `andysalvo26@gmail.com` = `role:student`, `membership_state:invited|active`
4. Start Google login: `GET /api/auth/google/start?cycle_id=<active_cycle_id>&next=/submit`.
   - Use production URL only (`https://ai-fluency-lab-pilot.vercel.app`), not preview links that trigger Vercel account login.
5. Complete login as `andysalvo26@gmail.com`; callback sets session and redirects to `/submit`.
6. Submit source in guided form:
   - `url`
   - `relevance_note` (2-3 sentences, <=500 chars)
7. Verify submit response has `reason_code=STARTER_BRIEF_READY`.
8. Open visible surface endpoint and confirm Starter Brief includes provenance:
   - `Built only from: <URL>`
   - Confirm thread shows one-next-step flow with one question at a time.
9. Run readiness evaluate (`claim/value/difference`) and confirm blocked reason if criteria missing.
10. Run publish with explicit confirmation and verify:
   - `reason_code=OK`
   - `credit_balance_after` decremented by `1`
   - output appears in `Lab Record`
11. Add dad email in `Team Intake` and repeat steps 4-10 for dad account.
12. Capture evidence bundle: command outputs, reason codes, and published Lab Record entry.

## Quick Troubleshooting
- `CYCLE_NOT_SELECTED`: send explicit `cycle_id` in payload/header.
- `NO_MEMBERSHIP_FOR_CYCLE`: add membership record for that cycle.
- `CROSS_CYCLE_ACCESS_DENIED`: thread/resource belongs to different cycle.
- `HALTED_GLOBAL` or `HALTED_CYCLE`: clear halt flags in runtime controls.
- `TEAM_INTAKE_EMAIL_MISSING`: ensure Team Intake row has a valid email field.
- `RELEVANCE_NOTE_MISSING`: ensure Research Inbox relevance note is non-empty (<=500 chars).
- `NEEDS_CONFIRMATION`: publish call missing explicit confirmation.
- `GOOGLE_OAUTH_NOT_CONFIGURED`: set `PILOT_GOOGLE_CLIENT_ID`, `PILOT_GOOGLE_CLIENT_SECRET`, and `PILOT_GOOGLE_REDIRECT_URI` in Vercel.
