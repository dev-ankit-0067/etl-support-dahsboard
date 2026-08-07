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
    │   └── AccountContext.tsx  # Project/account selector state
    ├── hooks/
    │   ├── use-mobile.tsx
    │   └── use-toast.ts
    ├── lib/
    │   └── utils.ts            # cn() classname helper
    ├── pages/                  # Route pages
    │   ├── executive-overview.tsx
    │   ├── incidents.tsx
    │   ├── costs.tsx
    │   ├── live-pipelines.tsx  # (not routed in App.tsx)
    │   ├── performance.tsx     # (not routed)
    │   ├── rca.tsx             # (not routed)
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
    <AccountProvider>            // project/account selection context
      <WouterRouter base={BASE_URL}>
        <DashboardLayout>        // sidebar + top bars
          <Switch>
            <Route "/"          → ExecutiveOverview />
            <Route "/incidents" → Incidents />
            <Route "/costs"     → Costs />
            <Route              → NotFound />
          </Switch>
        </DashboardLayout>
      </WouterRouter>
      <Toaster />
```

> Only **three** pages are routed today: Executive Overview, Incidents, Costs. `live-pipelines.tsx`,
> `performance.tsx`, and `rca.tsx` are implemented but not mounted (they depend on mock-only
> endpoints — see [03-backend-express.md](./03-backend-express.md)). `RcaDetailModal` is still used
> indirectly, and `IncidentDetailModal` imports RCA hooks.

## State: `contexts/AccountContext.tsx`
Provides a **project/account selector** that scales displayed figures per business unit.

- `interface AwsAccount { id, label, accountId, scale, region }`.
- `AWS_ACCOUNTS` — 7 predefined entries: `All Projects` (scale 1.0) plus Payments Platform,
  Customer Data Hub, Analytics & ML, Marketing Attribution, Supply Chain Ops, Sandbox/Dev, each
  with a fractional `scale` (0.32 … 0.05) and a region.
- `AccountProvider` holds the selected `accountId` (default `"all"`) and exposes
  `{ account, setAccountId, accounts }`.
- `useAccount()` — hook; throws if used outside the provider.

`scale` is applied client-side: cost tiles multiply totals by `account.scale`; incident/rows lists
are sliced proportionally. This simulates per-project drill-down over a single shared dataset.

## Hooks
- `hooks/use-mobile.tsx` — `useIsMobile()` via a `matchMedia` breakpoint listener.
- `hooks/use-toast.ts` — a small toast store/reducer (`useToast`, `toast()`) powering the shadcn
  `Toaster`.

## Layout — `components/layout/DashboardLayout.tsx`
The chrome shared by every page:
- **Left sidebar** — OpsGuardian brand + nav (`Executive Overview` `/`, `Incident Center`
  `/incidents`, `Cost Insights` `/costs`) using wouter `Link`; active item highlighted via
  `useLocation()`.
- **Top project bar** — centered `Projects:` `Select` bound to `AccountContext`.
- **Header** — Environment selector (Production/Staging/Development — display only), a search input,
  a "Last refreshed" indicator, and bell/settings icon buttons.
- **Main** — scrollable content area rendering `{children}`.

## Pages

### `executive-overview.tsx` (~1000 lines — the richest page)
Data: `useGetOverviewKpis()`, `useGetPipelineRuns()`, plus raw `fetch` to
`/api/pipelines/history/:job` and `/api/lambdas/*`.

Local types: `JobRun`, `LambdaRun`, `LambdaKpis`, `RunHistoryItem`. Constants:
`DATE_MULTIPLIERS`. Helpers: `statusBadge(status)` (Tailwind badge classes per status),
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
- Props: `{ jobId, jobName, resourceType: "job"|"lambda", open, onClose }`.
- React Query fetches `/api/logs/lambda/:name` or `/api/logs/job/:id` with **`refetchInterval:
  5000`** (auto-refresh). Resets AI state whenever it opens.
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
  (`useGet<Operation>()`), which call `customFetch` against `/api`.
- **Non-contract endpoints** (`/costs/service-trend`, `/pipelines/history/*`, `/lambdas/*`,
  `/agent/*`) → direct `fetch`/React Query, because they are not in the OpenAPI spec.
- `import.meta.env.BASE_URL` is stripped of a trailing slash and prefixed to raw fetch URLs so the
  app works under a sub-path base.
