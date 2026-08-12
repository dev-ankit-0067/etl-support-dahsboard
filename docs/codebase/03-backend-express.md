# 03 · Backend — Express mock API (`artifacts/api-server`)

A TypeScript **Express 5** server that implements the dashboard's API surface with **static mock
data**. It lets the frontend run without AWS/Jira credentials and serves as a live reference
implementation of the OpenAPI contract. It is **not** the server started by `startup.sh` (that's the
FastAPI backend); use it for UI development.

## Technology

| Concern | Library |
|---------|---------|
| Framework | Express 5 |
| Runtime | Node 24, ESM |
| Logging | pino 9 + pino-http 10 (pino-pretty in dev) |
| CORS | cors 2 |
| Cookies | cookie-parser |
| Build | esbuild 0.27 (single ESM bundle via `build.mjs`) |
| Workspace deps | `@workspace/api-zod`, `@workspace/db`, `drizzle-orm` |

## Directory layout

```
artifacts/api-server/
├── build.mjs                 # esbuild bundler config
├── package.json              # dev = build + start; start = node dist/index.mjs
├── tsconfig.json
└── src/
    ├── index.ts              # Reads PORT, starts app.listen
    ├── app.ts                # Express app: pino-http, cors, json, mounts /api router
    ├── lib/logger.ts         # pino logger (redacts auth/cookies)
    ├── middlewares/          # (placeholder, .gitkeep)
    └── routes/
        ├── index.ts          # Combines all sub-routers
        ├── health.ts         # /healthz
        ├── overview.ts       # /overview/*
        ├── pipelines.ts      # /pipelines/*
        ├── performance.ts    # /performance/*
        ├── incidents.ts      # /incidents/*
        ├── rca.ts            # /rca/*
        ├── costs.ts          # /costs/*
        ├── lambdas.ts        # /lambdas/*
        └── logs.ts           # /logs/*
```

## Entry point — `src/index.ts`
Requires `PORT` (throws if missing/invalid), then `app.listen(port, cb)` — logs
`"Server listening"` or exits on error. No default port, so `PORT` must be supplied by the runner.

## App assembly — `src/app.ts`
Creates the Express app and applies middleware in order:
1. `pinoHttp({ logger, serializers })` — request logging with trimmed `req` (id/method/url without
   query) and `res` (statusCode) serializers.
2. `cors()` — permissive CORS.
3. `express.json()` + `express.urlencoded({ extended: true })` — body parsing.
4. Mounts the combined router at `/api`.

## Logger — `src/lib/logger.ts`
`pino` instance; level from `LOG_LEVEL` (default `info`); **redacts** `authorization`, `cookie`, and
`set-cookie` headers. In non-production it uses the `pino-pretty` transport for colorised output.

## Router aggregation — `src/routes/index.ts`
An Express `Router` that `.use()`s each sub-router (health, overview, pipelines, performance,
incidents, rca, costs, lambdas, logs). Every path is therefore served under `/api`.

## Route modules (all `GET`, all return static/synthetic JSON)

| Module | Endpoints |
|--------|-----------|
| `health.ts` | `/healthz` |
| `overview.ts` | `/overview/kpis`, `/overview/health-distribution`, `/overview/job-status-trend` (24 synthetic hourly points), `/overview/failed-jobs`, `/overview/active-incidents` |
| `pipelines.ts` | `/pipelines/live`, `/pipelines/runs`, `/pipelines/history/:pipelineName` |
| `performance.ts` | `/performance/duration-trend`, `/performance/slowest-jobs`, `/performance/throughput` |
| `incidents.ts` | `/incidents/summary`, `/incidents/queue`, `/incidents/oncall`, `/incidents/mttr-trend` |
| `rca.ts` | `/rca/lifecycle`, `/rca/detail/:id`, `/rca/repeat-incidents`, `/rca/failure-patterns`, `/rca/metrics` |
| `costs.ts` | `/costs/kpis`, `/costs/breakdown`, `/costs/performance`, `/costs/service-trend`, `/costs/optimization` |
| `lambdas.ts` | `/lambdas/kpis`, `/lambdas/runs`, `/lambdas/history/:functionName`, `/lambdas/cost-breakdown`, `/lambdas/cost-performance` |
| `logs.ts` | `/logs/job/:jobId`, `/logs/lambda/:functionName` |

The data is hard-coded fixtures shaped to the same schemas the FastAPI backend produces (e.g.
`overview/kpis` returns `{ totalPipelines: 142, healthy: 118, … slaCompliancePercent: 96.7 }`).
`job-status-trend` synthesises the last 24 hours with randomised counts.

> **Coverage difference vs FastAPI:** the Express server implements some **contract endpoints the
> FastAPI backend does not** (e.g. `/performance/*`, `/incidents/queue`, `/incidents/oncall`,
> `/rca/detail/:id`, `/rca/failure-patterns`, `/rca/metrics`, `/lambdas/cost-*`,
> `/costs/optimization`). (`/lambdas/history` is now implemented by FastAPI too.) The frontend pages that use those hooks
> (`performance.tsx`, `rca.tsx`, parts of `incidents.tsx`) therefore rely on this mock server (or an
> equivalent) rather than the Python backend.

## Build — `build.mjs`
Uses **esbuild** to bundle `src/index.ts` into `dist/index.mjs`:
- `platform: node`, `format: esm`, `bundle: true`, `sourcemap: linked`, `.js`→`.mjs`.
- A large `external` list excludes native/unbundleable modules (sharp, better-sqlite3, all
  `@aws-sdk/*`, `@google-cloud/*`, playwright, etc.).
- Uses `esbuild-plugin-pino` so pino's worker transports resolve at runtime.
- Injects a `banner` that re-creates `require`, `__filename`, and `__dirname` for CJS-only deps
  (like Express) inside the ESM output.

## Scripts (`package.json`)
- `dev` → `NODE_ENV=development` + `build` + `start`
- `build` → `node ./build.mjs`
- `start` → `node --enable-source-maps ./dist/index.mjs`
- `typecheck` → `tsc -p tsconfig.json --noEmit`

## Workspace dependencies
It imports `@workspace/api-zod` (generated Zod schemas) and `@workspace/db` (Drizzle setup).
`health.ts` already validates its response through api-zod (`HealthCheckResponse.parse({ status:
"ok" })`), but the other route modules currently return plain literals — so api-zod is only
partially used and `@workspace/db` is wired for future persistence rather than active today.
