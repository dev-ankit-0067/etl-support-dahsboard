# 04 · Frontend — React dashboard (`artifacts/etl-dashboard`)

The single-page dashboard UI. React 19 + TypeScript, built with Vite, styled with Tailwind v4 and
shadcn/ui, charts by Recharts, server state by TanStack React Query, routing by wouter.

## Technology

| Concern | Library |
|---------|---------|
| UI framework | React 19.1 |
| Build/dev | Vite 7 (`@vitejs/plugin-react`, `@tailwindcss/vite`) |
| Styling | Tailwind CSS v4, `tw-animate-css`, `class-variance-authority`, `tailwind-merge`, `clsx` |
| Components | shadcn/ui over Radix UI primitives (`src/components/ui/*`) |
| Data fetching | `@tanstack/react-query` v5 + generated `@workspace/api-client-react` hooks |
| Charts | Recharts |
| Routing | wouter |
| Icons | lucide-react (+ react-icons) |
| Toasts | sonner + a shadcn toast shim |
| Forms | react-hook-form + `@hookform/resolvers` (available; forms are light) |

## Directory layout

```
artifacts/etl-dashboard/
├── index.html
├── vite.config.ts
├── components.json            # shadcn/ui config
├── public/                    # favicon, opengraph image
└── src/
    ├── main.tsx               # React root
    ├── App.tsx                # Providers + router
    ├── index.css              # Tailwind entry + theme tokens
    ├── contexts/
    │   ├── AccountContext.tsx  # Project/account selector state
    │   └── AuthContext.tsx     # Cognito session (login/logout/token)
    ├── hooks/
    │   ├── use-mobile.tsx
    │   └── use-toast.ts
    ├── lib/
    │   ├── utils.ts            # cn() classname helper
    │   ├── cognito.ts          # Cognito InitiateAuth login/refresh (no SDK)
    │   └── api.ts              # apiFetch — token-aware fetch for raw API calls
    ├── pages/                  # Route pages
    │   ├── executive-overview.tsx
    │   ├── incidents.tsx
    │   ├── costs.tsx
    │   ├── live-pipelines.tsx  # (not routed in App.tsx)
    │   ├── performance.tsx     # (not routed)
    │   ├── rca.tsx             # (not routed)
    │   ├── login.tsx           # Cognito sign-in page
    │   └── not-found.tsx
    └── components/
        ├── layout/DashboardLayout.tsx
        ├── CloudWatchLogViewer.tsx
        ├── LogAnalysisModal.tsx
        ├── incidents/IncidentDetailModal.tsx
        ├── pipelines/PipelineRunsModal.tsx
        ├── rca/RcaDetailModal.tsx
        └── ui/…                # ~50 shadcn/ui primitives
```

## Build config — `vite.config.ts`
- `base` from `BASE_PATH` (default `/`); `PORT` from env (validated).
- Plugins: React, Tailwind, Replit runtime-error overlay, and (dev + Replit only) cartographer +
  dev-banner.
- Path aliases: `@` → `src`, `@assets` → `../../attached_assets`; dedupes react/react-dom.
- Build output: `dist/public`.
- **Dev proxy:** `/api` → `http://localhost:8080` (the FastAPI backend), so `pnpm run dev` reaches
  live data without nginx.
- Preview server: host `0.0.0.0`, `allowedHosts: true`.

## Entry — `src/main.tsx`
`createRoot(document.getElementById("root")).render(<App/>)` and imports `index.css`.

## App shell — `src/App.tsx`
Wraps the app in providers and defines routes:

```
<QueryClientProvider>            // one shared React Query client
  <TooltipProvider>
    <AuthProvider>               // Cognito session (gates the app)
      <AccountProvider>          // project/account selection context
        <WouterRouter base={BASE_URL}>
          <AppRoutes>            // login gate:
            <Route "/login" → Login (or Redirect "/" if authed) />
            <Route          → needLogin ? Redirect "/login"
                              : <DashboardLayout><Switch>
                                  "/"          → ExecutiveOverview
                                  "/incidents" → Incidents
                                  "/costs"     → Costs
                                  *            → NotFound />
          </AppRoutes>
        </WouterRouter>
        <Toaster />
```

`AppRoutes` reads `useAuth()`: while `loading` it shows a spinner; when auth is required and the user
isn't signed in, **every route redirects to `/login`**; once authenticated, `/login` redirects back
to `/`. See [Authentication](#authentication) below.

> Only **three** pages are routed today: Executive Overview, Incidents, Costs. `live-pipelines.tsx`,
> `performance.tsx`, and `rca.tsx` are implemented but not mounted (they depend on mock-only
> endpoints — see [03-backend-express.md](./03-backend-express.md)). `RcaDetailModal` is still used
> indirectly, and `IncidentDetailModal` imports RCA hooks.

## State: `contexts/AccountContext.tsx` (project filter)
Provides the **project selector**, which applies a **real server-side tag filter** (not client-side
scaling).

- `interface AwsAccount { id, label }` — `id` is `"all"` or a project tag value.
- `AccountProvider` fetches the options from **`GET /api/projects`** (`All Projects` + configured tag
  values) and holds the selected `accountId` (default `"all"`); exposes `{ account, setAccountId,
  accounts }`. `useAccount()` throws outside the provider.
- On change, `setAccountId` pushes the selection to **both API layers** as the `X-Project` header
  (`setProjectHeader` from `@workspace/api-client-react` for generated hooks, and from `@/lib/api`
  for raw `apiFetch`), then awaits `queryClient.invalidateQueries()` so all active queries refetch.
- Exposes a **`projectLoading`** flag (true while the refetch settles). `DashboardLayout` renders a
  blocking overlay over the page content while it's set, so switching projects shows a loading state
  on every page.
- Raw-fetch pages (executive-overview `/runs`, costs `/service-trend`) add `account.id` to their
  effect deps so they refetch on project change too.

The backend reads `X-Project` and filters by the `project` resource tag (see
[02-backend-python.md → Project tag filtering](./02-backend-python.md#project-tag-filtering)). No
client-side scaling/slicing remains — the pages render exactly what the (filtered) API returns.

## Authentication

Cognito-backed login gating the whole app. No AWS SDK/Amplify dependency — auth talks to Cognito's
public endpoint directly.

- **`lib/cognito.ts`** — minimal Cognito client: `passwordLogin(cfg, user, pass)` (POST
  `InitiateAuth` with `USER_PASSWORD_AUTH`), `refreshTokens(cfg, refreshToken)` (`REFRESH_TOKEN_AUTH`),
  and `decodeJwt(token)`. Returns `{ idToken, accessToken, refreshToken, expiresAt }`.
- **`contexts/AuthContext.tsx`** — the session:
  - On mount, fetches `/api/config` to learn the pool/client/region; `authRequired` is true only when
    those are present (so **local dev without Cognito runs open**).
  - Restores tokens from `localStorage`, refreshing on load if expired.
  - Exposes `{ loading, authRequired, isAuthenticated, user, login, logout }`. On token change it
    registers the ID token with **both** API layers: `setAuthTokenGetter` (generated client) and
    `setApiToken` (raw `apiFetch`).
- **`pages/login.tsx`** — the `Login` component: branded card (ShieldCheck), username/password form,
  error banner, and a submit that calls `useAuth().login(...)`. On success the router auto-redirects.
- **`App.tsx`** — `AppRoutes` enforces the gate (see App shell above).
- **`components/layout/DashboardLayout.tsx`** — header shows the signed-in user + a **Sign out**
  button (only when `authRequired`).

### Session expiry → redirect to login
Two mechanisms clear an expired session (which flips `isAuthenticated` false → the gate redirects to
`/login`) and show a **"Session expired"** toast:

- **Reactive (any API 401):** `lib/api.ts` `apiFetch` and a global `QueryCache.onError` (in `App.tsx`,
  checking `error.status === 401`) both call `notifyUnauthorized()` → `AuthContext.expireSession()`.
- **Proactive (before it breaks):** `AuthContext` schedules a timer ~30s before `expiresAt` that
  attempts a **silent `refreshTokens`**; on success the session continues seamlessly, on failure (or
  no refresh token) it expires the session and redirects.

Duplicate 401s are de-duped via a `tokensRef` guard; a manual **Sign out** stays silent (no toast).

Default login (provisioned by `deploy/setup-cognito.sh`): **`admin` / `OpsG@123`**.

## Hooks
- `hooks/use-mobile.tsx` — `useIsMobile()` via a `matchMedia` breakpoint listener.
- `hooks/use-toast.ts` — a small toast store/reducer (`useToast`, `toast()`) powering the shadcn
  `Toaster`.

## Layout — `components/layout/DashboardLayout.tsx`
The chrome shared by every page:
- **Left sidebar** — OpsGuardian brand + nav (`Executive Overview` `/`, `Incident Center`
  `/incidents`, `Cost Insights` `/costs`) using wouter `Link`; active item highlighted via
  `useLocation()`.
- **Top project bar** — centered `Projects:` `Select` bound to `AccountContext` (real tag filter).
- **Header** — a search input, a "Last refreshed" indicator, bell/settings icon buttons, and (when
  auth is required) the signed-in user + a **Sign out** button.
- **Main** — scrollable content area rendering `{children}`; shows a **blocking loading overlay**
  (spinner + "Loading {project}…") while `AccountContext.projectLoading` is set, i.e. during a
  project switch.

## Pages

### `executive-overview.tsx` (~1000 lines — the richest page)
A **resource-type dropdown** switches the KPI tiles + runs table between four AWS compute types:
**Glue** (default), **Lambda**, **EMR**, **EMR Serverless**. Glue uses `useGetPipelineRuns()`; the
other three load `/api/{lambdas|emr|emr-serverless}/runs` on demand. A `RESOURCE_CONFIG` map drives
the per-type labels/endpoints, `AGENT_RESOURCE` maps the UI type → backend `resource_type`
(`glue`→`job`), and runs are normalised to a common `{id, name, status, …}` shape so one code path
renders all four. Each row expands to a history subsection (`/api/{…}/history/:name`) whose
**Analyze logs / RCA / Log Jira ticket** buttons open the log viewer / agentic flow with the right
`resource_type`. Changing the resource dropdown (or the date range) shows a **blocking loading
overlay** (`resourceLoading`) covering the whole page until data is ready — real for a resource
switch (awaits the `/runs` fetch), and a brief ~400ms overlay for the client-side date-range filter.

Data: `useGetOverviewKpis()`, `useGetPipelineRuns()`, plus `apiFetch` to `/api/{lambdas|emr|
emr-serverless}/runs` and `/api/{pipelines|lambdas|emr|emr-serverless}/history/:name`.

Local types: `JobRun`, `LambdaRun`, `RunHistoryItem`, `ResType`, `ResourceRun`. Constants:
`DATE_MULTIPLIERS`, `RESOURCE_CONFIG`, `AGENT_RESOURCE`. Helpers: `statusBadge(status)`,
`fmtTime(iso)`, `fmtMs(ms)`, `filterRunsByDateRange(runs, range)` (client-side date filter for
today/7d/30d/60d/90d).

Sub-components:
- **`JobHistorySubsection({ jobName, onAnalyzeLogs, onGetRca, onLogJiraTicket })`** — expandable
  per-job panel. Fetches `/api/pipelines/history/:jobName` with React Query, shows the last 5 runs
  with success-rate / avg-duration / total-cost summary and per-run **Analyze logs / RCA / Log Jira
  ticket** action buttons.
- **`LambdaHistorySubsection({ functionName, … })`** — the Lambda equivalent.
- **`ExecutiveOverview()`** (default export) — KPI strip, live/status widgets, pipeline & lambda
  run tables with expandable history rows, and wires up the two modals below.

Modals opened from this page: `CloudWatchLogViewer` (raw logs + AI actions) and `LogAnalysisModal`
(structured AI analysis / Jira result).

#### AI button → endpoint → agent mapping

Each run/invocation row exposes three buttons. They hit **two different backend agents**:

| Button | Frontend handler | Endpoint (`POST`) | Backend agent | Mounted in `main.py`? |
|--------|------------------|-------------------|---------------|-----------------------|
| **Analyze logs** | opens `CloudWatchLogViewer` | `GET /api/logs/{job\|lambda}/…` | none (raw log fetch) | ✅ |
| **Get RCA** | `callAgentsApi(id, "log")` | `/api/agents/analyze` `{ log_id, type:"log" }` | **LangChain tool-calling agent** (`agents.py` → `agent_service.run_log_analysis_agent`) | ✅ |
| **Log Jira ticket** | `callAgentsApi(id, "jira")` | `/api/agents/analyze` `{ log_id, type:"jira" }` | **LangChain agent** (`agent_service.run_jira_creation_agent`) | ✅ |

`callAgentsApi(logId, mode)` sends only the **run/invocation ID** and lets the agent fetch the logs
itself (via its `fetch_cloudwatch_logs` tool). Results render in `LogAnalysisModal`.

The two buttons **inside** the `CloudWatchLogViewer` modal now target the **same agentic workflow**
(they send the job run id, not the already-fetched log text):

| Button (in log viewer) | Endpoint (`POST`) | Backend agent | Mounted in `main.py`? |
|------------------------|-------------------|---------------|-----------------------|
| **RCA Analysis** | `/api/agents/analyze` `{ log_id, type:"log" }` | LangChain agent (`agents.py` → `agent_service.run_log_analysis_agent`) | ✅ |
| **Log Jira ticket** | `/api/agents/analyze` `{ log_id, type:"jira" }` | LangChain agent (`agent_service.run_jira_creation_agent`) | ✅ |

> Both the row-level buttons **and** the in-viewer buttons now call the mounted agentic endpoint
> `/api/agents/analyze`. The alternative single-shot service (`routers/agent.py` → `services/agent.py`,
> `/api/agent/*`) remains in the codebase but is **not registered in `main.py`**, so it is unused by
> the UI.

### `incidents.tsx` (~490 lines)
Data: `useGetActiveIncidents()`, `useGetRepeatIncidents()`, `useAccount()`.
- Client-side date-range filter (`all`/`today`/`7d`/`30d`) and account-scale slicing.
- Charts (Recharts): **Incidents by Status** (pie) and **Priority breakdown** (bar), with
  `STATUS_COLOR` / priority colour maps.
- Sub-components: `HorizontalTimeline({ incident })` (lifecycle progress) and
  `IncidentDetailSubsection({ incident })` (expandable detail row).
- Opens `IncidentDetailModal`.

### `costs.tsx` (~380 lines)
Data: `useGetCostKpis()`, `useAccount()`, and a raw `fetch` to `/api/costs/service-trend`.
- Types: `ServiceKey` (all/glue/lambda), `RangeKey` (7d/30d/60d/90d), `TrendPoint`,
  `ServiceTrendRange`, `ServiceTrendData`; `RANGE_KEYS` maps range → response field.
- **Five KPI tiles**, each with an info tooltip: Total Cost (MTD), Last Month (Same Period),
  Forecast (current month, extrapolated from daily run-rate), Last Month Total, Budget Consumed
  (with green/amber/red tone thresholds at 75%/90%).
- Derived figures (forecast, last-month baselines, budget %) are computed client-side and scaled by
  `account.scale`.
- **Cost-per-service line chart** (Recharts `LineChart`) with Glue/Lambda/Total series, filtered by
  the service + range selectors; `chartData` is memoised.

### `not-found.tsx`
Simple 404 card.

### Not-currently-routed pages
- **`live-pipelines.tsx`** — `useGetLivePipelines()` + `useGetPipelineRuns()`; `StatusWidget`
  tiles (running/failed/timed-out/delayed) and a runs table.
- **`performance.tsx`** — `useGetDurationTrend()`, `useGetSlowestJobs()`, `useGetThroughput()`.
- **`rca.tsx`** — `useGetRcaLifecycle()`, `useGetRepeatIncidents()`, `useGetFailurePatterns()`,
  `useGetRcaMetrics()`; `rcaStatusBadge()`, `trendIcon()` helpers; supports deep-linking via
  `?incident=`/`?pipeline=` query params and opens `RcaDetailModal`.

## Feature components

### `CloudWatchLogViewer.tsx`
A `Dialog` that streams CloudWatch logs and offers AI actions.
- Props: `{ jobId, jobName, resourceType: "job"|"lambda"|"emr"|"emr_serverless", open, onClose }`.
- React Query fetches the matching endpoint — `/api/logs/{job|lambda|emr|emr-serverless}/…` — with
  **`refetchInterval: 5000`** (auto-refresh). Resets AI state whenever it opens. The `RESOURCE_LABEL`
  map drives the dialog title; `agentLogId` is the Lambda function name for `lambda`, else the id.
- Actions: **Copy** / **Download** logs; **RCA Analysis** → `POST /api/agents/analyze`
  `{ log_id: jobId, type: "log" }`; **Log Jira ticket** → `POST /api/agents/analyze`
  `{ log_id: jobId, type: "jira" }`. Both call the **agentic LangChain workflow** (the agent fetches
  the logs itself from the job run id and, for `jira`, opens the ticket), rendering the returned
  `analysis` and `jira_key`. Uses `useToast` for success/failure.
- Renders logs in a dark monospace scroll area with loading/error/empty states.

### `LogAnalysisModal.tsx`
Renders the **structured** AI analysis returned by the agentic endpoint.
- Props: `{ open, onClose, logId, mode: "log"|"jira", isLoading, result, error }`.
- `parseSections(text)` — regex-splits the LLM's `**Label:** …` markdown into `Section[]`
  (Summary, Severity, Root Cause, Affected Component, Remediation, Details), falling back to a single
  "Analysis" section.
- `SECTION_ICONS` map + `severityClasses(text)` (P1 red → P4 blue) + `SectionCard` render each
  section; Severity becomes a pill, Details a scroll area.
- For `mode="jira"` it shows a "Jira ticket created: <key>" badge. Includes a Copy-analysis button.

### `incidents/IncidentDetailModal.tsx`
Deep incident view. Props `{ incident, open, onClose }`. Pulls `useGetRcaLifecycle()` +
`useGetRepeatIncidents()` for related context; uses `SEVERITY_STYLES` / `STATUS_STYLES` maps and a
lifecycle timeline (detect → acknowledge → mitigate → resolve → RCA), owner/domain/pipeline meta,
and links to RCA.

### `pipelines/PipelineRunsModal.tsx`
Props `{ pipelineName, open, onClose }`. Fetches `/api/pipelines/history/:pipelineName` and renders a
run history with a `StatusIcon`, per-status row tinting (`STATUS_ROW_BG`), a Recharts bar chart of
durations, and cost/records columns.

### `rca/RcaDetailModal.tsx`
Props `{ …rcaId }`. Fetches RCA detail (`RcaDetail` shape: root cause, contributing factors,
bug-fix description, resolution, action items with completion, affected incidents) and renders a
structured RCA report with progress/badges.

## UI primitives — `components/ui/*`
~50 shadcn/ui components wrapping Radix primitives (accordion, alert-dialog, avatar, badge, button,
card, chart, checkbox, command, dialog, drawer, dropdown-menu, form, input, popover, select,
separator, sheet, sidebar, table, tabs, toast/toaster, tooltip, …). They provide the design system;
pages/feature components compose them. `lib/utils.ts` exposes `cn(...)` (clsx + tailwind-merge) used
throughout for conditional classNames.

## Data-fetching conventions
- **Contract endpoints** → generated hooks from `@workspace/api-client-react`
  (`useGet<Operation>()`), which call `customFetch` against `/api`. The Cognito ID token is attached
  via `setAuthTokenGetter` (set by `AuthContext`).
- **Non-contract endpoints** (`/costs/service-trend`, `/pipelines/history/*`, `/lambdas/*`,
  `/agents/analyze`, `/logs/*`, `/rca/detail/*`) → **`apiFetch`** from `lib/api.ts` (React Query),
  which adds the same `Authorization: Bearer` header. The only plain `fetch` calls left are the
  public `/api/config` (in `AuthContext`) and the direct calls to Cognito (`lib/cognito.ts`).
- `import.meta.env.BASE_URL` is stripped of a trailing slash and prefixed to raw fetch URLs so the
  app works under a sub-path base.
