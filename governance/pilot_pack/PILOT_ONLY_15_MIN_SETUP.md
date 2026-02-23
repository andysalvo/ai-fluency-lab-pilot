# CHANGELOG
- 2026-02-21: Added explicit OAuth redirect-loop stop condition with exact places to verify.
- 2026-02-21: Verified every step references only keys from `PILOT_ONLY_MATRIX.md`.

# PILOT_ONLY_15_MIN_SETUP

Goal: get one working cloud pilot online in ~15 minutes.

## Step 1 — Fill the matrix first
- Where to click: Open `PILOT_ONLY_MATRIX.md`
- What key to paste: Fill all `TBD` and secret pointers for every row
- If it fails: You still have missing rows
- Recovery action: Do not continue until every required row is filled

## Step 2 — Create one Supabase project
- Where to click: Supabase dashboard -> New project
- What key to paste: `pilot.supabase.project_url`, `pilot.supabase.project_ref`, `pilot.supabase.edge_base_url`
- If it fails: Project shows provisioning/error
- Recovery action: Recreate project once and confirm region/plan defaults

## Step 3 — Turn on Google login
- Where to click: Supabase -> Authentication -> Providers -> Google
- What key to paste: `pilot.sso.google_client_id`, `pilot.sso.google_client_secret`
- If it fails: “Invalid OAuth credentials”
- Recovery action: Re-check pointer target and copy exact value from vault item field

## Step 4 — Set login URLs
- Where to click: Supabase -> Authentication -> URL configuration
- What key to paste: `pilot.sso.authorized_origins`, `pilot.sso.redirect_uris`, `pilot.vercel.project_url`
- If it fails: Redirect mismatch during login
- Recovery action: Add exact callback URI shown in the auth error and save
- Stop condition: If redirect mismatch repeats 2 times, stop and verify in two places before retrying:
  1. Google Cloud Console -> APIs & Services -> Credentials -> OAuth client (`pilot.sso.authorized_origins`, `pilot.sso.redirect_uris`)
  2. Supabase -> Authentication -> URL configuration (`pilot.sso.authorized_origins`, `pilot.sso.redirect_uris`, `pilot.vercel.project_url`)

## Step 5 — Create Notion integration + share pages/databases
- Where to click: Notion -> Settings -> Integrations; then share root page + DBs with integration
- What key to paste: `pilot.notion.integration_token`, `pilot.notion.workspace_url`, `pilot.notion.root_page_url`, DB IDs:
  `pilot.notion.db_threads_id`, `pilot.notion.db_turns_id`, `pilot.notion.db_outputs_id`, `pilot.notion.db_research_inbox_id`, `pilot.notion.db_research_library_id`
- If it fails: Integration can’t read/write DBs
- Recovery action: Re-open each DB/page -> Share -> add integration explicitly

## Step 6 — Set webhook details
- Where to click: Notion webhook setup + your backend webhook config
- What key to paste: `pilot.notion.webhook_endpoint_url`, `pilot.notion.webhook_secret`
- If it fails: Signature verification error
- Recovery action: Regenerate webhook secret once and update both sides

## Step 7 — Configure Vercel project env vars
- Where to click: Vercel -> Project -> Settings -> Environment Variables
- What key to paste:
  `pilot.supabase.project_url`, `pilot.supabase.anon_key`, `pilot.supabase.service_role_key`,
  `pilot.openai.api_key`, `pilot.openai.allowed_models`,
  `pilot.notion.integration_token`, `pilot.notion.webhook_secret`,
  `pilot.root_problem_version_id`, `pilot.default_student_initial_credits`
- If it fails: App boots with missing env errors
- Recovery action: Add missing vars exactly, then redeploy

## Step 8 — Deploy once and open the app
- Where to click: Vercel -> Deployments -> Redeploy (latest)
- What key to paste: `pilot.vercel.project_url`
- If it fails: Build error
- Recovery action: Open build logs, fix missing env var first (most common), redeploy

## Step 9 — Seed allowlist and initial credit
- Where to click: Hosted admin screen in your deployed app
- What key to paste: `pilot.operator_email`, `pilot.test_allowlisted_email`, `pilot.default_student_initial_credits`
- If it fails: User cannot sign in
- Recovery action: Confirm email exact match and state = `allowlisted`

## Step 10 — Run minimum tests and mark pilot online
- Where to click: Follow `MINIMUM_TESTS_TO_RUN.md`
- What key to paste: `pilot.test_allowlisted_email`, `pilot.test_non_allowlisted_email`
- If it fails: Any test fails
- Recovery action: Fix only that failed dependency, rerun just failed test, then rerun full 4-test set
