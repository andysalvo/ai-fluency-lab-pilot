# CHANGELOG
- 2026-02-21: Added evidence-based gates so a single operator can verify readiness without interpretation.
- 2026-02-21: Added config-source and state-machine readiness checks to prevent launch ambiguity.
- 2026-02-21: Added final sign-off block for accountability before build/deploy start.

# Build-Ready Exit Criteria

Build starts only when every item below is checked.

## Access + Secrets
- [ ] 1Password vault `AI Fluency Lab Ops` created
- [ ] All required secret items created with exact names
- [ ] `dev` and `prod` secret items separated
- [ ] Rotation owner and cadence assigned for each secret
- [ ] Secret pointers use `Vault/ItemName#FieldName` format

Evidence:
1. `CREDENTIALS_AND_IDS_MATRIX.md` required secret rows filled

## Accounts + Permissions
- [ ] Dedicated service accounts created for GitHub/Vercel/Supabase/Notion/Google OAuth
- [ ] Required platform invitations accepted
- [ ] Permission model applied exactly
- [ ] Final prod approver assigned

Evidence:
1. `PERMISSIONS_MODEL.md` role mapping confirmed

## Cloud Reachability
- [ ] `dev` and `prod` Supabase projects reachable
- [ ] Vercel projects reachable
- [ ] GitHub repo and branch protections configured
- [ ] Notion integration has required database/page access

Evidence:
1. Smoke checks in `TEST_CASES_AND_SCENARIOS.md` pass

## Auth + Access
- [ ] Google SSO configured with correct origins/redirects
- [ ] SSO smoke test passed
- [ ] Admin allowlist policy active
- [ ] Allowlist state transitions verified

Evidence:
1. Tests A and G pass

## Operations + Safety
- [ ] Slack + email alerts verified
- [ ] Budget hard cap + daily warning configured
- [ ] Rollback procedure tested
- [ ] `prod` approval gate tested

Evidence:
1. Tests D, E, H pass

## Governance Integrity
- [ ] No hidden cross-thread read path present
- [ ] No auto-publish path present
- [ ] No auto-merge path present
- [ ] Readiness and commit-event constraints preserved

Evidence:
1. Tests F pass

## Source-of-Truth Integrity
- [ ] All required matrix keys are filled (no `TBD` in required rows)
- [ ] Runtime env vars match canonical matrix names
- [ ] No conflicting values across docs

Evidence:
1. Tests I pass

## Final Sign-off
- [ ] Operator sign-off
- [ ] Security owner sign-off
- [ ] Final prod approver sign-off
