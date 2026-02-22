# CHANGELOG
- 2026-02-21: Added explicit webhook endpoint derivation rule from `pilot.vercel.project_url` to prevent setup stalls.
- 2026-02-21: Added minimal "where to find it" hints in table notes for fields operators commonly miss.

# PILOT_ONLY_MATRIX

Single source of truth for this pilot setup.  
Use pointers only for secrets.  
Environment name is always: `pilot`.

## Canonical states and rules
- Access states: `allowlisted`, `active`, `suspended`, `revoked`
- Login states: `never_logged_in`, `login_success`, `login_failed`, `login_blocked_not_allowlisted`, `login_blocked_suspended`, `login_blocked_revoked`
- Credit model: integer per participant per `root_problem_version_id`; default student = `1`; decrement only on successful publish; never negative
- Webhook endpoint derivation rule: `pilot.notion.webhook_endpoint_url = <pilot.vercel.project_url>/api/notion/webhook` (remove trailing `/` from `pilot.vercel.project_url` before appending path)

## Required values (only)
| Key | Secret? | Value / Pointer | Notes |
|---|---|---|---|
| `pilot.supabase.project_url` | No | `TBD` | Supabase dashboard -> Project Settings -> General |
| `pilot.supabase.project_ref` | No | `TBD` | Supabase dashboard -> Project Settings -> General |
| `pilot.supabase.anon_key` | Yes | `AI Fluency Lab Ops/<Item>#<Field>` | Pointer only |
| `pilot.supabase.service_role_key` | Yes | `AI Fluency Lab Ops/<Item>#<Field>` | Pointer only |
| `pilot.supabase.edge_base_url` | No | `TBD` | Usually `<pilot.supabase.project_url>/functions/v1` |
| `pilot.vercel.project_url` | No | `TBD` | Vercel -> Project -> Domains |
| `pilot.vercel.project_id` | No | `TBD` | Vercel -> Project -> Settings -> General |
| `pilot.vercel.team_id` | No | `TBD` | Vercel -> Team Settings -> General |
| `pilot.vercel.token` | Yes | `AI Fluency Lab Ops/<Item>#<Field>` | Pointer only |
| `pilot.sso.google_client_id` | Yes | `AI Fluency Lab Ops/<Item>#<Field>` | Pointer only |
| `pilot.sso.google_client_secret` | Yes | `AI Fluency Lab Ops/<Item>#<Field>` | Pointer only |
| `pilot.sso.authorized_origins` | No | `TBD` | Google OAuth client settings |
| `pilot.sso.redirect_uris` | No | `TBD` | Google OAuth client settings |
| `pilot.openai.api_key` | Yes | `AI Fluency Lab Ops/<Item>#<Field>` | Pointer only |
| `pilot.openai.allowed_models` | No | `TBD` | Comma-separated |
| `pilot.notion.workspace_url` | No | `TBD` | Notion workspace URL |
| `pilot.notion.root_page_url` | No | `TBD` | Root pilot page URL |
| `pilot.notion.db_threads_id` | No | `TBD` | Notion DB URL -> copy DB ID |
| `pilot.notion.db_turns_id` | No | `TBD` | Notion DB URL -> copy DB ID |
| `pilot.notion.db_outputs_id` | No | `TBD` | Notion DB URL -> copy DB ID |
| `pilot.notion.db_research_inbox_id` | No | `TBD` | Notion DB URL -> copy DB ID |
| `pilot.notion.db_research_library_id` | No | `TBD` | Notion DB URL -> copy DB ID |
| `pilot.notion.integration_token` | Yes | `AI Fluency Lab Ops/<Item>#<Field>` | Pointer only |
| `pilot.notion.webhook_secret` | Yes | `AI Fluency Lab Ops/<Item>#<Field>` | Pointer only |
| `pilot.notion.webhook_endpoint_url` | No | `TBD` | Derived from rule above |
| `pilot.root_problem_version_id` | No | `TBD` | Active root problem version |
| `pilot.default_student_initial_credits` | No | `1` | Keep as `1` |
| `pilot.operator_email` | No | `TBD` | Primary operator |
| `pilot.test_allowlisted_email` | No | `TBD` | Member test account |
| `pilot.test_non_allowlisted_email` | No | `TBD` | Non-member test account |
