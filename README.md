# ai-fluency-lab-pilot

Cloud-shaped pilot runtime for Applied AI Labs / AI Fluency Lab.

## Local run
```bash
npm install
npm run dev
```

Health check:
```bash
curl -s http://localhost:8787/health | jq
```

## Runtime endpoints
1. `GET /` (minimal branded home)
2. `GET /health`
3. `POST /api/notion/webhook`
4. `POST /api/auth/callback/google`
5. `POST /api/session/active-cycle/select`
6. `POST /api/visible-surface`
7. `POST /api/actions/readiness/evaluate`
8. `POST /api/actions/publish`
9. `POST /api/admin/intake/backfill`
10. `POST /api/admin/cycles/create`
11. `POST /api/admin/cycles/bootstrap`
12. `POST /api/admin/cycles/{cycle_id}/activate`
13. `POST /api/admin/cycles/{cycle_id}/freeze`
14. `POST /api/admin/cycles/{cycle_id}/snapshot`
15. `POST /api/admin/cycles/{cycle_id}/export`
16. `POST /api/admin/cycles/{cycle_id}/reset-next`

## Isolation rule
All protected/read-write operations require explicit `cycle_id`. The runtime does not infer a default cycle.
