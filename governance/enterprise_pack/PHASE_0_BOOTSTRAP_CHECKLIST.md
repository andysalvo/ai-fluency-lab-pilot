# CHANGELOG
- 2026-02-21: Added explicit outputs/evidence per step so one operator can complete setup without guessing.
- 2026-02-21: Normalized environment naming to `dev`/`prod` and aligned with matrix keys.
- 2026-02-21: Added setup dependencies for SSO, alerts, and branch controls to avoid late blockers.

# Phase 0 Bootstrap Checklist

## Objective
Set up access once so operations can run from cloud software with no critical local dependency.

## Prerequisites
1. You have owner/admin rights on GitHub, Vercel, Supabase, Notion, Google Cloud OAuth.
2. You can create and share a 1Password team vault.
3. You can assign at least one backup operator.

## A) 1Password Vault Setup
- [ ] Create shared vault: `AI Fluency Lab Ops`
- [ ] Add security owner
- [ ] Add backup owner
- [ ] Add incident escalation contact
- [ ] Enable audit logging for vault access (if available)

Output evidence:
1. Vault link/ID recorded in `CREDENTIALS_AND_IDS_MATRIX.md`
2. Owner names recorded in matrix governance section

## B) Service Accounts (No Personal Accounts)
- [ ] GitHub service identity created
- [ ] Vercel service identity created
- [ ] Supabase service identity created
- [ ] Notion integration identity created
- [ ] Google Cloud OAuth service ownership assigned

Output evidence:
1. Account emails/IDs recorded in `CREDENTIALS_AND_IDS_MATRIX.md` notes fields

## C) Platform Invitations
- [ ] Service identities invited to GitHub repo/org
- [ ] Service identities invited to Vercel team/project
- [ ] Service identities invited to Supabase `dev` + `prod` projects
- [ ] Notion integration connected to required workspace pages/databases
- [ ] Google Cloud OAuth project access granted

Output evidence:
1. Invitation acceptance confirmed by operator
2. Permission results validated against `PERMISSIONS_MODEL.md`

## D) Environment Separation
- [ ] Separate `dev` and `prod` projects verified for Supabase
- [ ] Separate `dev` and `prod` environments verified for Vercel
- [ ] Separate `dev` and `prod` secret items created in 1Password
- [ ] Branches verified: `dev` and `main`

Output evidence:
1. `CREDENTIALS_AND_IDS_MATRIX.md` env rows complete for both `dev` and `prod`

## E) Security Controls
- [ ] Branch protection enabled for production branch (`main`)
- [ ] Production environment approval required
- [ ] No raw secrets in repository files
- [ ] Secret rotation owner and cadence assigned per secret item
- [ ] Slack + email alert channels configured

Output evidence:
1. Test notifications sent and acknowledged
2. Branch protection screenshots or audit references stored by operator

## F) SSO Controls
- [ ] Google OAuth origins configured for `dev` and `prod`
- [ ] Google OAuth redirect URIs configured for `dev` and `prod`
- [ ] Allowlist policy active before first login

Output evidence:
1. Successful SSO smoke login for allowlisted test account
2. Blocked login for non-allowlisted account

## Completion Criteria
- [ ] All sections A-F complete
- [ ] Security owner signs off
- [ ] Ops owner confirms cloud-only operation readiness
