# CHANGELOG
- 2026-02-21: Reworked into canonical source-of-truth format with explicit matrix keys and env var names.
- 2026-02-21: Added missing required non-secret IDs/config (webhook endpoint URL, SSO origins/redirects, root problem config, role contacts).
- 2026-02-21: Added consistent pointer format and governance metadata for every secret.

# Credentials and IDs Matrix (Canonical)

## Canonical Rules
1. This file is the single source of truth for IDs, config values, and secret pointers.
2. Never store raw secrets in git-tracked files.
3. Secret values must be stored only in `1Password` vault `AI Fluency Lab Ops`.
4. Environment tags are canonical: `dev`, `prod`.
5. Environment variable naming convention: `AI_LAB_<ENV>_<DOMAIN>_<KEY>`.

## Pointer Format
Use this format for all secret pointers:
`Vault/ItemName#FieldName`

Example:
`AI Fluency Lab Ops/AI-LAB-DEV-SUPABASE-SERVICE-ROLE#value`

## Matrix Columns
- `Matrix Key`: canonical identifier used by all docs
- `Env`: `dev` or `prod` or `global`
- `Secret`: `Yes` or `No`
- `Env Var`: runtime variable name
- `1Password Item`: required for secrets, optional for non-secrets
- `Value/Pointer`: `TBD` until filled
- `Required`: `Yes` or `Optional`
- `Owner`: responsible human role
- `Rotation`: cadence for secrets, `N/A` for non-secrets

## Notion
| Matrix Key | Env | Secret | Env Var | 1Password Item | Value/Pointer | Required | Owner | Rotation |
|---|---|---|---|---|---|---|---|---|
| notion.workspace_url | global | No | AI_LAB_NOTION_WORKSPACE_URL | N/A | `TBD` | Yes | Ops | N/A |
| notion.workspace_id | global | No | AI_LAB_NOTION_WORKSPACE_ID | N/A | `TBD` | Yes | Ops | N/A |
| notion.root_page_url | global | No | AI_LAB_NOTION_ROOT_PAGE_URL | N/A | `TBD` | Yes | Ops | N/A |
| notion.root_page_id | global | No | AI_LAB_NOTION_ROOT_PAGE_ID | N/A | `TBD` | Yes | Ops | N/A |
| notion.db_threads_id | global | No | AI_LAB_NOTION_DB_THREADS_ID | N/A | `TBD` | Yes | Ops | N/A |
| notion.db_turns_id | global | No | AI_LAB_NOTION_DB_TURNS_ID | N/A | `TBD` | Yes | Ops | N/A |
| notion.db_outputs_id | global | No | AI_LAB_NOTION_DB_OUTPUTS_ID | N/A | `TBD` | Yes | Ops | N/A |
| notion.db_research_inbox_id | global | No | AI_LAB_NOTION_DB_RESEARCH_INBOX_ID | N/A | `TBD` | Yes | Ops | N/A |
| notion.db_research_library_id | global | No | AI_LAB_NOTION_DB_RESEARCH_LIBRARY_ID | N/A | `TBD` | Yes | Ops | N/A |
| notion.db_synthesis_proposals_id | global | No | AI_LAB_NOTION_DB_SYNTHESIS_PROPOSALS_ID | N/A | `TBD` | Optional | Ops | N/A |
| notion.webhook_endpoint_url | global | No | AI_LAB_NOTION_WEBHOOK_ENDPOINT_URL | N/A | `TBD` | Yes | Ops | N/A |
| notion.dev.integration_token | dev | Yes | AI_LAB_DEV_NOTION_INTEGRATION_TOKEN | AI-LAB-DEV-NOTION-INTEGRATION-TOKEN | `TBD` | Yes | Security | 90d |
| notion.prod.integration_token | prod | Yes | AI_LAB_PROD_NOTION_INTEGRATION_TOKEN | AI-LAB-PROD-NOTION-INTEGRATION-TOKEN | `TBD` | Yes | Security | 90d |
| notion.dev.webhook_secret | dev | Yes | AI_LAB_DEV_NOTION_WEBHOOK_SECRET | AI-LAB-DEV-NOTION-WEBHOOK-SECRET | `TBD` | Yes | Security | 90d |
| notion.prod.webhook_secret | prod | Yes | AI_LAB_PROD_NOTION_WEBHOOK_SECRET | AI-LAB-PROD-NOTION-WEBHOOK-SECRET | `TBD` | Yes | Security | 90d |

## Supabase
| Matrix Key | Env | Secret | Env Var | 1Password Item | Value/Pointer | Required | Owner | Rotation |
|---|---|---|---|---|---|---|---|---|
| supabase.dev.project_ref | dev | No | AI_LAB_DEV_SUPABASE_PROJECT_REF | N/A | `TBD` | Yes | Ops | N/A |
| supabase.prod.project_ref | prod | No | AI_LAB_PROD_SUPABASE_PROJECT_REF | N/A | `TBD` | Yes | Ops | N/A |
| supabase.dev.url | dev | Yes | AI_LAB_DEV_SUPABASE_URL | AI-LAB-DEV-SUPABASE-URL | `TBD` | Yes | Security | 90d |
| supabase.prod.url | prod | Yes | AI_LAB_PROD_SUPABASE_URL | AI-LAB-PROD-SUPABASE-URL | `TBD` | Yes | Security | 90d |
| supabase.dev.anon_key | dev | Yes | AI_LAB_DEV_SUPABASE_ANON_KEY | AI-LAB-DEV-SUPABASE-ANON-KEY | `TBD` | Yes | Security | 90d |
| supabase.prod.anon_key | prod | Yes | AI_LAB_PROD_SUPABASE_ANON_KEY | AI-LAB-PROD-SUPABASE-ANON-KEY | `TBD` | Yes | Security | 90d |
| supabase.dev.service_role | dev | Yes | AI_LAB_DEV_SUPABASE_SERVICE_ROLE | AI-LAB-DEV-SUPABASE-SERVICE-ROLE | `TBD` | Yes | Security | 60d |
| supabase.prod.service_role | prod | Yes | AI_LAB_PROD_SUPABASE_SERVICE_ROLE | AI-LAB-PROD-SUPABASE-SERVICE-ROLE | `TBD` | Yes | Security | 60d |
| supabase.dev.db_password | dev | Yes | AI_LAB_DEV_SUPABASE_DB_PASSWORD | AI-LAB-DEV-SUPABASE-DB-PASSWORD | `TBD` | Yes | Security | 60d |
| supabase.prod.db_password | prod | Yes | AI_LAB_PROD_SUPABASE_DB_PASSWORD | AI-LAB-PROD-SUPABASE-DB-PASSWORD | `TBD` | Yes | Security | 60d |
| supabase.dev.edge_base_url | dev | No | AI_LAB_DEV_SUPABASE_EDGE_BASE_URL | N/A | `TBD` | Yes | Ops | N/A |
| supabase.prod.edge_base_url | prod | No | AI_LAB_PROD_SUPABASE_EDGE_BASE_URL | N/A | `TBD` | Yes | Ops | N/A |

## OpenAI
| Matrix Key | Env | Secret | Env Var | 1Password Item | Value/Pointer | Required | Owner | Rotation |
|---|---|---|---|---|---|---|---|---|
| openai.dev.api_key | dev | Yes | AI_LAB_DEV_OPENAI_API_KEY | AI-LAB-DEV-OPENAI-API-KEY | `TBD` | Yes | Security | 90d |
| openai.prod.api_key | prod | Yes | AI_LAB_PROD_OPENAI_API_KEY | AI-LAB-PROD-OPENAI-API-KEY | `TBD` | Yes | Security | 90d |
| openai.allowed_models | global | No | AI_LAB_OPENAI_ALLOWED_MODELS | N/A | `TBD` | Yes | Ops | N/A |
| openai.monthly_hard_cap_usd | global | No | AI_LAB_OPENAI_MONTHLY_HARD_CAP_USD | N/A | `TBD` | Yes | Ops | N/A |
| openai.daily_warning_threshold_usd | global | No | AI_LAB_OPENAI_DAILY_WARNING_THRESHOLD_USD | N/A | `TBD` | Yes | Ops | N/A |

## Vercel
| Matrix Key | Env | Secret | Env Var | 1Password Item | Value/Pointer | Required | Owner | Rotation |
|---|---|---|---|---|---|---|---|---|
| vercel.token | global | Yes | AI_LAB_VERCEL_TOKEN | AI-LAB-VERCEL-TOKEN | `TBD` | Yes | Security | 90d |
| vercel.team_id | global | No | AI_LAB_VERCEL_TEAM_ID | N/A | `TBD` | Yes | Ops | N/A |
| vercel.web_project_id | global | No | AI_LAB_VERCEL_WEB_PROJECT_ID | N/A | `TBD` | Yes | Ops | N/A |
| vercel.admin_project_id | global | No | AI_LAB_VERCEL_ADMIN_PROJECT_ID | N/A | `TBD` | Yes | Ops | N/A |
| vercel.dev_url | dev | No | AI_LAB_DEV_VERCEL_URL | N/A | `TBD` | Yes | Ops | N/A |
| vercel.prod_domain | prod | No | AI_LAB_PROD_DOMAIN | N/A | `TBD` | Yes | Ops | N/A |

## GitHub
| Matrix Key | Env | Secret | Env Var | 1Password Item | Value/Pointer | Required | Owner | Rotation |
|---|---|---|---|---|---|---|---|---|
| github.token | global | Yes | AI_LAB_GITHUB_TOKEN | AI-LAB-GITHUB-TOKEN | `TBD` | Yes | Security | 90d |
| github.repo_url | global | No | AI_LAB_GITHUB_REPO_URL | N/A | `TBD` | Yes | Ops | N/A |
| github.default_branch | global | No | AI_LAB_GITHUB_DEFAULT_BRANCH | N/A | `main` | Yes | Ops | N/A |
| github.dev_branch | dev | No | AI_LAB_GITHUB_DEV_BRANCH | N/A | `dev` | Yes | Ops | N/A |
| github.prod_branch | prod | No | AI_LAB_GITHUB_PROD_BRANCH | N/A | `main` | Yes | Ops | N/A |
| github.required_checks | global | No | AI_LAB_GITHUB_REQUIRED_CHECKS | N/A | `TBD` | Yes | Ops | N/A |

## Google SSO
| Matrix Key | Env | Secret | Env Var | 1Password Item | Value/Pointer | Required | Owner | Rotation |
|---|---|---|---|---|---|---|---|---|
| sso.google.client_id | global | Yes | AI_LAB_GOOGLE_OAUTH_CLIENT_ID | AI-LAB-GOOGLE-OAUTH-CLIENT-ID | `TBD` | Yes | Security | 180d |
| sso.google.client_secret | global | Yes | AI_LAB_GOOGLE_OAUTH_CLIENT_SECRET | AI-LAB-GOOGLE-OAUTH-CLIENT-SECRET | `TBD` | Yes | Security | 180d |
| sso.google.dev_authorized_origins | dev | No | AI_LAB_DEV_GOOGLE_OAUTH_ORIGINS | N/A | `TBD` | Yes | Ops | N/A |
| sso.google.prod_authorized_origins | prod | No | AI_LAB_PROD_GOOGLE_OAUTH_ORIGINS | N/A | `TBD` | Yes | Ops | N/A |
| sso.google.dev_redirect_uris | dev | No | AI_LAB_DEV_GOOGLE_OAUTH_REDIRECT_URIS | N/A | `TBD` | Yes | Ops | N/A |
| sso.google.prod_redirect_uris | prod | No | AI_LAB_PROD_GOOGLE_OAUTH_REDIRECT_URIS | N/A | `TBD` | Yes | Ops | N/A |

## Alerts and Ops Contacts
| Matrix Key | Env | Secret | Env Var | 1Password Item | Value/Pointer | Required | Owner | Rotation |
|---|---|---|---|---|---|---|---|---|
| alerts.slack_webhook_url | global | Yes | AI_LAB_SLACK_WEBHOOK_URL | AI-LAB-SLACK-WEBHOOK-URL | `TBD` | Yes | Security | 90d |
| alerts.ops_email_distribution | global | No | AI_LAB_OPS_EMAIL_DISTRIBUTION | N/A | `TBD` | Yes | Ops | N/A |
| ops.final_prod_approver_email | global | No | AI_LAB_FINAL_PROD_APPROVER_EMAIL | N/A | `TBD` | Yes | Ops | N/A |
| ops.facilitator_email | global | No | AI_LAB_FACILITATOR_EMAIL | N/A | `TBD` | Yes | Ops | N/A |
| ops.moderator_primary_email | global | No | AI_LAB_MODERATOR_PRIMARY_EMAIL | N/A | `TBD` | Yes | Ops | N/A |

## Pilot Runtime Config
| Matrix Key | Env | Secret | Env Var | 1Password Item | Value/Pointer | Required | Owner | Rotation |
|---|---|---|---|---|---|---|---|---|
| pilot.active_root_problem_version_id | global | No | AI_LAB_ACTIVE_ROOT_PROBLEM_VERSION_ID | N/A | `TBD` | Yes | Facilitator | N/A |
| pilot.default_student_initial_credits | global | No | AI_LAB_DEFAULT_STUDENT_INITIAL_CREDITS | N/A | `1` | Yes | Ops | N/A |
| pilot.allowlist_domain_policy | global | No | AI_LAB_ALLOWLIST_DOMAIN_POLICY | N/A | `any_domain_by_admin` | Yes | Ops | N/A |
| pilot.sso_mode | global | No | AI_LAB_SSO_MODE | N/A | `google_only` | Yes | Ops | N/A |
| pilot.prod_approval_mode | global | No | AI_LAB_PROD_APPROVAL_MODE | N/A | `manual_approver` | Yes | Ops | N/A |

## Secret Governance Metadata
| Control | Value |
|---|---|
| Secret storage location | `1Password Team Vault` |
| Vault name | `AI Fluency Lab Ops` |
| Security owner | `TBD` |
| Backup security owner | `TBD` |
| Incident escalation contact | `TBD` |
| Rotation audit cadence | `Quarterly` |
| Last rotation audit date | `TBD` |

## Do Not Commit Secrets Checklist
- [ ] No raw secrets in repository files
- [ ] All secret values stored in 1Password only
- [ ] This file contains pointers/placeholders only
- [ ] All required matrix keys are filled for `dev` and `prod`
