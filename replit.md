# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS v4 + Recharts + shadcn/ui

## Project: ETL OpsCenter Dashboard

Production Support & Cost Insights Dashboard for AWS ETL Pipelines. A 6-page enterprise dashboard for executive leadership and production support teams.

### Pages
- **Executive Overview** (`/`) - KPI strip, health distribution, job status trend, failed jobs table, active incidents
- **Live Pipeline Operations** (`/pipelines`) - Running/failed/timed-out/delayed widgets, pipeline runs table
- **Performance & Throughput** (`/performance`) - Duration trends, slowest jobs, records throughput
- **Incident Command Center** (`/incidents`) - Severity breakdown, aging, ack status, queue by owner, MTTA/MTTR trend
- **RCA & Prevention** (`/rca`) - RCA lifecycle, repeat incidents, failure patterns, prevention metrics
- **Cost & Financial Insights** (`/costs`) - Cost KPIs, breakdowns, cost vs performance, optimization insights

### Architecture
- Frontend: React + Vite (`artifacts/etl-dashboard`)
- Backend: Express API server (`artifacts/api-server`) with mock data endpoints
- API contract defined in `lib/api-spec/openapi.yaml`
- Generated React Query hooks in `lib/api-client-react`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
