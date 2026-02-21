# PILOT_KEYS_INTAKE

Fill this once, then tell me "keys ready" and I will start full build execution.

Rules:
- Use pointer format for secrets only: `AI Fluency Lab Ops/<Item>#<Field>`
- Use real values for non-secrets
- Do not commit raw secrets anywhere
- Keep environment as `pilot`

## Secrets (pointer only)

| Key | Value |
|---|---|
| `pilot.supabase.anon_key` | `AI Fluency Lab Ops/AI-LAB-PILOT-SUPABASE#anon_key` |
| `pilot.supabase.service_role_key` | `AI Fluency Lab Ops/AI-LAB-PILOT-SUPABASE#service_role_key` |
| `pilot.vercel.token` | `AI Fluency Lab Ops/AI-LAB-PILOT-VERCEL#token` |
| `pilot.sso.google_client_id` | AI Fluency Lab Ops/AI-LAB-PILOT-GOOGLE-SSO#client_id |
| `pilot.sso.google_client_secret` | AI Fluency Lab Ops/AI-LAB-PILOT-GOOGLE-SSO#client_secret |
| `pilot.openai.api_key` | `AI Fluency Lab Ops/AI-LAB-PILOT-OPENAI#api_key` |
| `pilot.notion.integration_token` | AI Fluency Lab Ops/AI-LAB-PILOT-API#integration_token |
| `pilot.notion.webhook_secret` | AI Fluency Lab Ops/AI-LAB-PILOT-API#webhook_secret |

## Non-secrets (exact values)

| Key | Value |
|---|---|
| `pilot.supabase.project_url` | https://pokhjgwokmimnccujvff.supabase.co |
| `pilot.supabase.project_ref` | pokhjgwokmimnccujvff |
| `pilot.supabase.edge_base_url` | https://pokhjgwokmimnccujvff.functions.supabase.co |
| `pilot.runtime.ingress_mode_source` | supabase.table.runtime_control.active_ingress_mode |
| `pilot.vercel.project_url` | ai-fluency-lab-pilot.vercel.app |
| `pilot.vercel.project_id` | prj_drLPahvPwoqatTOdbKBbzN7uU7be |
| `pilot.vercel.team_id` | team_o05ic4DW1kwnyefXmNd6RODN |
| `pilot.sso.authorized_origins` | https://ai-fluency-lab-pilot.vercel.app |
| `pilot.sso.redirect_uris` | https://ai-fluency-lab-pilot.vercel.app/api/auth/callback/google |
| `pilot.openai.allowed_models` | `TBD` |
| `pilot.notion.workspace_url` | `TBD` |
| `pilot.notion.root_page_url` | `TBD` |
| `pilot.notion.db_threads_id` | `TBD` |
| `pilot.notion.db_turns_id` | `TBD` |
| `pilot.notion.db_outputs_id` | `TBD` |
| `pilot.notion.db_research_inbox_id` | `TBD` |
| `pilot.notion.db_research_library_id` | `TBD` |
| `pilot.notion.webhook_endpoint_url` | `TBD` |
| `pilot.root_problem_version_id` | `TBD` |
| `pilot.default_student_initial_credits` | `1` |
| `pilot.operator_email` | `TBD` |
| `pilot.test_allowlisted_email` | `TBD` |
| `pilot.test_non_allowlisted_email` | `TBD` |

## Derivation rule

- `pilot.notion.webhook_endpoint_url = <pilot.vercel.project_url>/api/notion/webhook` (strip trailing `/`)
