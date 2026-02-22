# CHANGELOG
- 2026-02-21: Added exact "where to check" locations for each test (admin UI + Supabase).
- 2026-02-21: Tightened each failure path to one most-likely fix.

# MINIMUM_TESTS_TO_RUN

Run these 4 tests only.  
All must pass before saying “pilot online.”

## Test 1 — Non-allowlisted user is blocked
Steps:
1. Try Google login with `pilot.test_non_allowlisted_email`.
2. Observe result.

Where to check:
- Admin UI -> Participants -> search email -> login state
- Supabase -> Logs -> Auth

Pass:
- Login blocked with state `login_blocked_not_allowlisted`.

Fail:
- User gets into app.

Immediate fix:
- Remove/revoke that email from allowlist, then retry.

## Test 2 — Allowlisted user can log in
Steps:
1. Add `pilot.test_allowlisted_email` in allowlist with state `allowlisted`.
2. Login via Google with that email.

Where to check:
- Admin UI -> Participants -> login state
- Supabase -> Authentication -> Users

Pass:
- Login succeeds with state `login_success`.

Fail:
- Login blocked or auth loop.

Immediate fix:
- Fix OAuth URLs so `pilot.sso.authorized_origins` and `pilot.sso.redirect_uris` match exactly in Google + Supabase.

## Test 3 — First login moves allowlisted -> active
Steps:
1. Ensure `pilot.test_allowlisted_email` starts in `allowlisted`.
2. Perform first successful login.
3. Re-open participant record.

Where to check:
- Admin UI -> Participants -> access state
- Supabase -> Authentication -> Users (last sign-in timestamp)

Pass:
- State changed to `active`.

Fail:
- State remains `allowlisted` or incorrect state.

Immediate fix:
- Re-run one clean login after clearing stale session/cookies.

## Test 4 — Credit decrement behavior
Steps:
1. Set participant credit to `1`.
2. Perform successful individual publish (readiness passed + confirmation).
3. Verify credit is `0`.
4. Attempt publish that fails readiness.

Where to check:
- Admin UI -> Participants -> credit balance
- Admin UI -> Outputs/Publish log -> publish status

Pass:
- Successful publish: `1 -> 0`.
- Failed readiness publish: credit unchanged.

Fail:
- Credit does not decrement on success, decrements on failed readiness, or goes negative.

Immediate fix:
- Ensure credit decrement runs only after publish success event, not on draft/readiness checks.
