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
2. `GET /submit` (guided source intake)
3. `GET /health`
4. `POST /api/notion/webhook`
5. `POST /api/sources/submit`
6. `GET /api/auth/google/start`
7. `POST|GET /api/auth/callback/google`
8. `POST /api/auth/logout`
9. `POST /api/session/active-cycle/select`
10. `POST /api/visible-surface`
11. `GET /api/operator/summary`
12. `POST /api/actions/readiness/evaluate`
13. `POST /api/actions/publish`
14. `POST /api/admin/intake/backfill`
15. `POST /api/admin/cycles/create`
16. `POST /api/admin/cycles/bootstrap`
17. `POST /api/admin/cycles/{cycle_id}/activate`
18. `POST /api/admin/cycles/{cycle_id}/freeze`
19. `POST /api/admin/cycles/{cycle_id}/snapshot`
20. `POST /api/admin/cycles/{cycle_id}/export`
21. `POST /api/admin/cycles/{cycle_id}/reset-next`

## Isolation rule
All protected/read-write operations require explicit `cycle_id`. The runtime does not infer a default cycle.
