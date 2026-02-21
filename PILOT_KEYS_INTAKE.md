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
| `pilot.runtime.persistence_backend` | supabase |
| `pilot.runtime.ingress_mode_source` | supabase.table.runtime_control.active_ingress_mode |
| `pilot.organization.id` | applied-ai-labs |
| `pilot.organization.name` | Applied AI Labs |
| `pilot.program.id` | ai-fluency-lab |
| `pilot.program.name` | AI Fluency Lab |
| `pilot.program.active_cycle_id` | cycle-innovation-day-001 |
| `pilot.vercel.project_url` | ai-fluency-lab-pilot.vercel.app |
| `pilot.vercel.project_id` | prj_drLPahvPwoqatTOdbKBbzN7uU7be |
| `pilot.vercel.team_id` | team_o05ic4DW1kwnyefXmNd6RODN |
| `pilot.sso.authorized_origins` | https://ai-fluency-lab-pilot.vercel.app |
| `pilot.sso.redirect_uris` | https://ai-fluency-lab-pilot.vercel.app/api/auth/callback/google |
| `pilot.openai.allowed_models` | `gpt-4o-mini` |
| `pilot.notion.workspace_url` | `https://www.notion.so` |
| `pilot.notion.root_page_url` | `https://www.notion.so/Applied-AI-Labs-AI-Fluency-at-Smeal-30e4c63befac81a6bccdee6c55253ece` |
| `pilot.notion.operator_console_url` | `https://www.notion.so/Operator-Console-30e4c63befac8139bfb8c5184278b362` |
| `pilot.notion.db_threads_id` | `30e4c63b-efac-81a5-8b30-e0d6bac7fca9` |
| `pilot.notion.db_turns_id` | `30e4c63b-efac-811e-b5f5-fdd9843f5760` |
| `pilot.notion.db_outputs_id` | `30e4c63b-efac-819b-9e48-e5417fee4b37` |
| `pilot.notion.db_research_inbox_id` | `30e4c63b-efac-81ad-b9b6-e472ff5a0599` |
| `pilot.notion.db_research_library_id` | `30e4c63b-efac-8132-90d8-ee5f103d53f1` |
| `pilot.notion.webhook_endpoint_url` | `https://ai-fluency-lab-pilot.vercel.app/api/notion/webhook` |
| `pilot.root_problem_version_id` | `pilot-v1` |
| `pilot.default_student_initial_credits` | `1` |
| `pilot.operator_email` | `ajs10845@psu.edu` |
| `pilot.test_allowlisted_email` | `ajs10845@psu.edu` |
| `pilot.test_non_allowlisted_email` | `test+blocked@invalid.local` |

## Derivation rule

- `pilot.notion.webhook_endpoint_url = <pilot.vercel.project_url>/api/notion/webhook` (strip trailing `/`)
