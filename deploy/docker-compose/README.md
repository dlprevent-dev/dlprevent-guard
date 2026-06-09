# AnveGuard — self-host (VPC) stack

One command brings up the entire AnveGuard control plane inside your VPC. No Lovable, no Supabase Cloud, no SaaS dependency. Postgres + Supabase edge runtime + the AnveGuard dashboard, all behind one nginx.

```bash
cp .env.example .env
# edit .env — set KEY_ENCRYPTION_SECRET at minimum
docker compose up -d
open http://localhost:8080
```

That's the deploy.

## What you get

| Service | Image | Port | Purpose |
|---|---|---|---|
| `postgres` | `supabase/postgres:15.8.1.060` | 54322 | Stores api_keys, request_logs, audit_logs, regression_tests, policy_* |
| `edge-runtime` | `supabase/edge-runtime:v1.58.13` | 54321 | Runs `proxy`, `dashboard`, `alerts-fire` |
| `dashboard` | `nginx:1.27-alpine` | 8080 | Serves the React app + reverse-proxies `/functions/v1/*` |

Migrations under `supabase/migrations/` run on first boot via Postgres's `/docker-entrypoint-initdb.d` mount, so the schema is correct day one.

## Production sizing

| Tier | Concurrent req/s | Postgres | Edge replicas | LB |
|---|---|---|---|---|
| Single node (dev / small team) | <50 | t3.medium / 4 GB | 1 | None |
| Small prod | 50–500 | t3.large / 16 GB SSD | 3 | ALB / Cloud LB |
| High-traffic | 500–5000 | db.r6i.xlarge + read replica | autoscale 6–24 | ALB + WAF |

For HA, drop the `postgres` service from this compose and point `SUPABASE_DB_URL` at a managed Postgres (RDS, Cloud SQL, Azure Postgres). The edge runtime is stateless and scales horizontally.

## Cloud-specific deploys

| Cloud | Suggested path |
|---|---|
| AWS | ECS Fargate (edge-runtime) + ALB + RDS Postgres + CloudFront in front of dashboard |
| GCP | Cloud Run (edge-runtime) + Cloud SQL Postgres + Cloud Storage + Cloud CDN |
| Azure | Container Apps + Azure Database for PostgreSQL Flexible Server + Front Door |
| On-prem | Kubernetes (Helm chart in `deploy/helm/` — coming) |

## Security defaults

- Provider keys stored **encrypted at rest** (AES-GCM, derived from `KEY_ENCRYPTION_SECRET`)
- Postgres RLS on every tenant-scoped table — service-role only
- All function-level CORS is origin-allowlisted (`ALLOWED_ORIGINS`)
- Log retention configurable per workspace, 1–3650 days
- No outbound network calls except to the LLM provider you choose
- Audit trail on every config change (`audit_logs`)

## Telemetry

Zero telemetry leaves the stack. No phoning home. Inspect every call with:

```bash
docker compose logs -f edge-runtime
```

## License

Apache 2.0. Self-host as long as you want; commercial use is fine.
