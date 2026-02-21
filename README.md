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
1. `POST /api/notion/webhook`
2. `POST /api/actions/publish`
3. `POST /api/actions/readiness/evaluate`
4. `POST /api/auth/callback/google`
5. `POST /api/admin/cycles/create`
6. `POST /api/admin/cycles/{program_cycle_id}/activate`
7. `POST /api/admin/cycles/{program_cycle_id}/freeze`
8. `POST /api/admin/cycles/{program_cycle_id}/snapshot`
9. `POST /api/admin/cycles/{program_cycle_id}/export`
10. `POST /api/admin/cycles/{program_cycle_id}/reset-next`
11. `GET /health`
