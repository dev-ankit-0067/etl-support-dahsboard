# OpsGuardian — ETL Production Support & Cost Insights Dashboard

> Codebase documentation index. This folder documents the technology, structure, components,
> classes, methods, and functionality of both the frontend and backend of the OpsGuardian dashboard.

OpsGuardian is an enterprise **Production Support & Cost Insights Dashboard for AWS ETL pipelines**.
It is aimed at executive leadership and production-support teams and surfaces pipeline health,
live operations, incidents, root-cause analysis (RCA), and cloud cost insights — with an AI
"agentic" layer that analyses CloudWatch logs and opens Jira tickets.

---

## Documentation map

| Document | Contents |
|----------|----------|
| [01-architecture.md](./01-architecture.md) | System topology, request flow, the "two backends" model, monorepo layout |
| [02-backend-python.md](./02-backend-python.md) | **Primary backend** — FastAPI `aws-backend` (config, AWS clients, cache, routers, services, models, AI agents) |
| [03-backend-express.md](./03-backend-express.md) | Mock/contract backend — Express `api-server` (routes, build, logging) |
| [04-frontend.md](./04-frontend.md) | React dashboard `etl-dashboard` (app shell, pages, components, contexts, hooks) |
| [05-shared-libraries.md](./05-shared-libraries.md) | `lib/` packages — OpenAPI spec, generated React-Query client, Zod schemas, Drizzle DB |
| [06-api-reference.md](./06-api-reference.md) | Full HTTP endpoint reference across both backends |
| [07-deployment.md](./07-deployment.md) | Setup, startup/stop scripts, nginx, Docker, gunicorn, IAM policy, environment variables |
| [agents-api.md](./agents-api.md) | AI agents API — log-analysis & Jira ticket creation (request/response detail) |
| [OpsGuardian-Product-Design-Document.md](./OpsGuardian-Product-Design-Document.md) | Product design document — vision, personas, page-by-page UX, requirements |

> Also see [../diagrams/](../diagrams/) for the architecture diagrams (current AWS reference SVG and
> the [Fargate deployment](../diagrams/fargate-deployment.md) SVG/PNG + write-up).

---

## Technology at a glance

### Frontend
- **React 19** + **TypeScript 5.9**
- **Vite 7** (build/dev server)
- **Tailwind CSS v4** + **shadcn/ui** (Radix UI primitives)
- **TanStack React Query v5** for server state
- **Recharts** for charts
- **wouter** for routing
- **lucide-react** icons, **sonner** toasts

### Backends
- **FastAPI** (Python 3.12) — `aws-backend`, the real AWS-backed API (Glue, Lambda, CloudWatch, Cost Explorer, Budgets, STS)
- **Express 5** (Node 24, TypeScript) — `api-server`, a mock/contract API used for local UI development
- **boto3** for AWS access, **cachetools** for TTL caching, **python-json-logger** for structured logs
- **LangChain** + **HuggingFace Inference** for the AI log-analysis agents
- **Jira SDK** for incident/RCA data and ticket creation

### Shared / tooling
- **pnpm workspaces** monorepo
- **OpenAPI 3.1** contract (`lib/api-spec/openapi.yaml`) → **Orval** codegen → React-Query hooks + Zod schemas
- **Drizzle ORM** + PostgreSQL scaffolding (`lib/db`) — present but not yet populated with tables
- **nginx** reverse proxy, **gunicorn/uvicorn** app server, **Docker** for the Python backend

---

## Repository layout (top level)

```
etl-support-dahsboard/
├── artifacts/
│   ├── etl-dashboard/     # React + Vite frontend (the dashboard UI)
│   ├── api-server/        # Express mock API server (TypeScript)
│   └── mockup-sandbox/    # shadcn/ui component sandbox (design scratch space)
├── aws-backend/           # FastAPI backend — the real AWS-backed API + AI agents
├── lib/
│   ├── api-spec/          # OpenAPI spec + Orval codegen config
│   ├── api-client-react/  # Generated React-Query client + custom fetch
│   ├── api-zod/           # Generated Zod schemas / TS types
│   └── db/                # Drizzle ORM + Postgres setup (scaffold)
├── nginx/                 # Reverse-proxy config
├── scripts/               # Workspace utility scripts
├── docs/                  # Product design doc, agents API doc, diagrams, this folder
├── setup.py               # One-shot environment provisioning
├── startup.sh / stop.sh   # Run/stop backend + frontend + nginx
└── pnpm-workspace.yaml    # Monorepo workspace + package catalog
```

---

## How the pieces fit (quick version)

1. The **React dashboard** calls `"/api/..."` endpoints.
2. In production, **nginx** proxies `"/api/"` to the **FastAPI backend** (port 8080) and everything
   else to the **frontend preview server** (port 3000).
3. FastAPI pulls live data from **AWS** (Glue jobs/runs, Lambda + CloudWatch metrics, Cost Explorer,
   Budgets) and from **Jira** (incidents & RCA), caches it with TTL buckets, and returns JSON that
   matches the shapes the UI expects.
4. The **Express `api-server`** implements the same URL surface with hard-coded mock data — useful
   for UI work without AWS/Jira credentials. The OpenAPI spec in `lib/api-spec` is the shared
   contract that both the mock server and the generated frontend client are derived from.
5. The **AI agents** (`/api/agent/*` and `/api/agents/*`) fetch CloudWatch logs, run a HuggingFace
   LLM to produce a structured RCA, and can create a Jira ticket.

See [01-architecture.md](./01-architecture.md) for the detailed flow and the important nuance about
which backend is authoritative for which route.

---

## Running locally

```bash
# One-time provisioning (installs system deps, venv, pnpm deps, nginx config)
./setup.py

# Start FastAPI (8080) + frontend preview (3000) + nginx (80)
./startup.sh

# Stop everything
./stop.sh
```

For contributor-focused commands (typecheck, codegen, running an individual package), see
[07-deployment.md](./07-deployment.md).
