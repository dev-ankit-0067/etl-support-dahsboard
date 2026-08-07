# 05 · Shared libraries (`lib/`)

The `lib/` packages define the **API contract** and the **generated clients** that keep the
frontend, backend, and mock server in agreement, plus a database scaffold.

```
lib/
├── api-spec/          # OpenAPI 3.1 spec + Orval codegen config (source of truth)
├── api-client-react/  # Generated React-Query hooks + a custom fetch wrapper
├── api-zod/           # Generated Zod schemas + TypeScript types
└── db/                # Drizzle ORM + PostgreSQL setup (scaffold)
```

The generation pipeline:

```
openapi.yaml ──(Orval)──►  api-client-react/src/generated/*   (React-Query hooks, TS types)
             └─(Orval)──►  api-zod/src/generated/*            (Zod schemas + types)
```

---

## `lib/api-spec` — the contract

- **`openapi.yaml`** — OpenAPI **3.1.0** document titled `Api` (title is fixed so generated file
  paths stay stable), version `0.1.0`, base server `/api`. Tags: health, overview, pipelines,
  performance, incidents, rca, costs. It defines ~24 operations (each with a stable `operationId`
  that becomes a hook name) and the component schemas that mirror the backend Pydantic models. See
  [06-api-reference.md](./06-api-reference.md) for the operation list.
- **`orval.config.ts`** — Orval configuration with two outputs:
  - `api-client-react` → `client: "react-query"`, split mode, `baseUrl: "/api"`, using the custom
    `customFetch` mutator from `api-client-react/src/custom-fetch.ts`.
  - `zod` → Zod schemas into `api-zod/src/generated`, with coercion rules and `useDates`/`useBigInt`.
  - A `titleTransformer` forces `info.title = "Api"` on both.
- **`package.json`** — exposes the `codegen` script:
  `pnpm --filter @workspace/api-spec run codegen` regenerates both clients from the spec.

> **Workflow:** edit `openapi.yaml` → run codegen → the frontend gets new/updated `useGet*` hooks and
> the Zod package gets matching schemas. Keep the FastAPI Pydantic models and the Express mock in
> sync with any schema change.

---

## `lib/api-client-react` — generated React-Query client

Consumed by the frontend as `@workspace/api-client-react`.

### `src/index.ts`
Re-exports the generated `api` (hooks) and `api.schemas` (types), plus the runtime configuration
helpers `setBaseUrl`, `setAuthTokenGetter`, and the `AuthTokenGetter` type.

### `src/generated/` (Orval output — do not hand-edit)
- `api.ts` — one React-Query hook per operation, e.g. `useGetOverviewKpis`, `useGetPipelineRuns`,
  `useGetCostKpis`, `useGetActiveIncidents`, `useGetRepeatIncidents`, `useGetRcaLifecycle`,
  `useGetFailurePatterns`, `useGetRcaMetrics`, `useGetDurationTrend`, `useGetSlowestJobs`,
  `useGetThroughput`, `useGetLivePipelines`, `useGetIncidentSummary`, `useGetIncidentQueue`,
  `useGetMttrTrend`, `useGetCostBreakdown`, `useGetCostPerformance`, `useGetCostOptimization`, etc.
- `api.schemas.ts` — TypeScript interfaces for every request/response schema.

### `src/custom-fetch.ts` — the fetch layer
A hardened `fetch` wrapper Orval calls for every request. Key pieces:

- **Config:** `setBaseUrl(url)` (prepend to relative paths — for native/Expo bundles),
  `setAuthTokenGetter(getter)` (attach `Authorization: Bearer <token>` when provided — noted as
  *not* for web where cookies handle auth).
- **`customFetch<T>(input, options)`** — resolves method/base URL, merges headers, auto-sets
  `content-type: application/json` for JSON-looking string bodies, sets an `accept` header for JSON,
  attaches the bearer token if configured, then calls `fetch`. On non-2xx it throws `ApiError`; on
  success it parses the body per `responseType` (`auto`/`json`/`text`/`blob`).
- **Robust parsing:** BOM stripping, empty-body detection, JSON-vs-text media-type inference, and
  React-Native quirk handling (`response.body` is `undefined` there even with a payload).
- **Error classes:** `ApiError<T>` (status/statusText/data/headers/method/url + a friendly message
  built from `title`/`detail`/`message` fields) and `ResponseParseError` (raw body + cause when JSON
  parsing fails).

### `package.json` / `tsconfig.json`
Standard workspace library packaging; depended on by the frontend via `workspace:*`.

---

## `lib/api-zod` — generated Zod schemas & types

Consumed as `@workspace/api-zod` (e.g. by the Express server).
- `src/generated/api.ts` — Zod validators per operation.
- `src/generated/types/*` — one TS type per schema, e.g. `costKpis`, `costBreakdown`,
  `costPerformance`, `overviewKpis`, `healthDistribution`, `healthStatus`, `incident`,
  `incidentQueueItem`, `incidentSummary`, `pipelineRun`, `livePipelineData`, `failedJob`,
  `slowJob`, `throughputItem`, `durationTrendItem`, `jobStatusTrendItem`, `mttrTrendItem`,
  `rcaLifecycleItem`, `rcaMetrics`, `repeatIncident`, `failurePattern`, `optimizationInsight`,
  plus an `index.ts` barrel.
- Coercion is enabled (`bigint`, `date`) via the Orval config so runtime validation matches the
  wire format.

These schemas exist to validate/parse payloads at the boundaries; the Express mock imports the
package so responses can be type-checked against the contract.

---

## `lib/db` — Drizzle ORM + PostgreSQL (scaffold)

Present for future persistence; **no tables are defined yet**.

- **`src/index.ts`** — requires `DATABASE_URL` (throws if unset), creates a `pg.Pool`, and exports
  a Drizzle instance `db = drizzle(pool, { schema })` plus the `pool` and a re-export of the schema.
- **`src/schema/index.ts`** — currently just `export {}` with a commented template showing the
  intended pattern (a `pgTable`, a `createInsertSchema` via `drizzle-zod`, and `Insert*`/select
  types per model, one file per table).
- **`drizzle.config.ts`** — Drizzle Kit config (used by `pnpm --filter @workspace/db run push`).

Because no tables exist, the API servers currently source all data from AWS/Jira (FastAPI) or
fixtures (Express) rather than from Postgres.

---

## `scripts/`
A small workspace utilities package (`@workspace/scripts`) — e.g. `src/hello.ts` and
`scripts/post-merge.sh` (referenced by `.replit`'s `postMerge` hook). Not part of the runtime API.
