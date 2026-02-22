# CHANGELOG
- 2026-02-21: Added explicit release gates, approval evidence, and rollback success criteria.
- 2026-02-21: Added alert severity definitions and response expectations for single-operator clarity.
- 2026-02-21: Normalized environment names and linked controls to canonical config matrix.

# Release and Safety Workflow

## Canonical Config Source
Use `CREDENTIALS_AND_IDS_MATRIX.md` for branch names, URLs, alert targets, and budget values.

## `dev` Release Flow
1. Merge to `dev` branch.
2. `dev` deploy runs automatically.
3. Smoke tests run post-deploy.
4. Failures notify Slack + email.
5. `dev` deployment is marked usable only after smoke tests pass.

## `prod` Release Flow
1. Generate release summary from candidate build.
2. Verify pre-release checklist:
   - smoke tests pass
   - no open P0/P1 incidents
   - budget headroom above daily warning threshold
3. `approveProdRelease` action by final prod approver.
4. Deploy to `prod`.
5. Execute post-deploy smoke checks.
6. Mark release `completed` or `failed`.

## Mandatory Approval Evidence
Before `prod` approval, record:
1. release ID
2. approver ID/email
3. summary link
4. timestamp

## Rollback Procedure (Required)
1. Trigger rollback to previous known-good production version.
2. Confirm service health checks pass.
3. Post incident notice in Slack + email.
4. Record rollback incident in audit logs.

Rollback success criteria:
1. prior stable version active
2. auth + core flows restored
3. no new critical errors for 15 minutes

## Budget Controls
1. Monthly hard cap enforced for model usage.
2. Daily warning threshold sends alert before cap risk.
3. At hard cap, non-critical model actions are blocked until manual override by authorized operator.

## Alerting and Severity
| Severity | Examples | Required Action |
|---|---|---|
| P0 | Production outage, auth completely broken | Immediate incident response and possible rollback |
| P1 | Repeated sync failures, high error rate | Investigate within same operating window |
| P2 | Budget warning, transient failures | Track and resolve during daily ops |

Alert channels:
1. Slack for immediate response
2. Email for durable operational record
