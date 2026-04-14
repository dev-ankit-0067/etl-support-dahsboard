import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/pipelines/live", async (_req, res): Promise<void> => {
  res.json({
    running: 34,
    failed: 8,
    timedOut: 3,
    delayed: 5,
    waitingUpstream: 7,
  });
});

router.get("/pipelines/runs", async (_req, res): Promise<void> => {
  res.json([
    { id: "RUN-9012", pipelineName: "fin_gl_ledger_sync", status: "Failed", startTime: "2026-04-14T08:00:00Z", endTime: "2026-04-14T08:12:34Z", duration: "12m 34s", owner: "Sarah Chen", environment: "Prod", domain: "Finance" },
    { id: "RUN-9011", pipelineName: "sales_order_ingest", status: "Running", startTime: "2026-04-14T09:00:00Z", endTime: "", duration: "58m 12s", owner: "Tom Hardy", environment: "Prod", domain: "Sales" },
    { id: "RUN-9010", pipelineName: "mkt_campaign_agg", status: "Failed", startTime: "2026-04-14T07:30:00Z", endTime: "2026-04-14T07:38:12Z", duration: "8m 12s", owner: "Mike Torres", environment: "Prod", domain: "Marketing" },
    { id: "RUN-9009", pipelineName: "hr_benefits_sync", status: "Success", startTime: "2026-04-14T06:00:00Z", endTime: "2026-04-14T06:04:22Z", duration: "4m 22s", owner: "David Lee", environment: "Prod", domain: "HR" },
    { id: "RUN-9008", pipelineName: "ops_inventory_load", status: "Failed", startTime: "2026-04-14T06:15:00Z", endTime: "2026-04-14T06:37:05Z", duration: "22m 05s", owner: "Priya Patel", environment: "Prod", domain: "Operations" },
    { id: "RUN-9007", pipelineName: "sales_forecast_daily", status: "Success", startTime: "2026-04-14T05:00:00Z", endTime: "2026-04-14T05:18:45Z", duration: "18m 45s", owner: "Tom Hardy", environment: "Prod", domain: "Sales" },
    { id: "RUN-9006", pipelineName: "cust_360_profile", status: "Running", startTime: "2026-04-14T09:15:00Z", endTime: "", duration: "43m 20s", owner: "Alex Kumar", environment: "Prod", domain: "Customer" },
    { id: "RUN-9005", pipelineName: "fin_ar_aging_report", status: "Success", startTime: "2026-04-14T04:00:00Z", endTime: "2026-04-14T04:08:15Z", duration: "8m 15s", owner: "James Wilson", environment: "Prod", domain: "Finance" },
    { id: "RUN-9004", pipelineName: "sc_demand_planning", status: "Delayed", startTime: "2026-04-14T08:30:00Z", endTime: "", duration: "1h 28m", owner: "Lisa Park", environment: "Prod", domain: "Supply Chain" },
    { id: "RUN-9003", pipelineName: "mkt_email_events", status: "Success", startTime: "2026-04-14T03:00:00Z", endTime: "2026-04-14T03:06:30Z", duration: "6m 30s", owner: "Mike Torres", environment: "Prod", domain: "Marketing" },
    { id: "RUN-9002", pipelineName: "ops_quality_metrics", status: "Waiting", startTime: "", endTime: "", duration: "-", owner: "Priya Patel", environment: "Prod", domain: "Operations" },
    { id: "RUN-9001", pipelineName: "fin_treasury_rates", status: "Timed Out", startTime: "2026-04-14T07:00:00Z", endTime: "2026-04-14T08:00:00Z", duration: "60m 00s", owner: "Sarah Chen", environment: "Prod", domain: "Finance" },
  ]);
});

const pipelineRunHistory: Record<string, Array<{ id: string; status: string; startTime: string; durationMin: number; cost: number; recordsProcessed: number; errorMessage: string | null }>> = {
  fin_gl_ledger_sync: [
    { id: "RUN-9012", status: "Failed", startTime: "2026-04-14T08:00:00Z", durationMin: 12.6, cost: 9.20, recordsProcessed: 0, errorMessage: "ConnectionPoolExhaustedException: All 20 connections in use" },
    { id: "RUN-9001A", status: "Success", startTime: "2026-04-13T08:01:00Z", durationMin: 18.4, cost: 9.75, recordsProcessed: 3240000, errorMessage: null },
    { id: "RUN-8994", status: "Failed", startTime: "2026-04-12T08:05:00Z", durationMin: 8.2, cost: 5.10, recordsProcessed: 0, errorMessage: "ConnectionPoolExhaustedException: timeout after 30s" },
    { id: "RUN-8987", status: "Success", startTime: "2026-04-11T08:00:00Z", durationMin: 17.9, cost: 9.50, recordsProcessed: 3210000, errorMessage: null },
    { id: "RUN-8980", status: "Success", startTime: "2026-04-10T08:02:00Z", durationMin: 19.1, cost: 10.20, recordsProcessed: 3280000, errorMessage: null },
  ],
  ops_inventory_load: [
    { id: "RUN-9008", status: "Failed", startTime: "2026-04-14T06:15:00Z", durationMin: 22.1, cost: 6.80, recordsProcessed: 0, errorMessage: "OutOfMemoryError: Java heap space" },
    { id: "RUN-9001B", status: "Failed", startTime: "2026-04-13T06:15:00Z", durationMin: 19.4, cost: 5.90, recordsProcessed: 0, errorMessage: "OutOfMemoryError: GC overhead limit exceeded" },
    { id: "RUN-8994B", status: "Success", startTime: "2026-04-11T06:10:00Z", durationMin: 38.7, cost: 8.20, recordsProcessed: 2800000, errorMessage: null },
    { id: "RUN-8987B", status: "Success", startTime: "2026-04-10T06:12:00Z", durationMin: 36.2, cost: 7.80, recordsProcessed: 2650000, errorMessage: null },
    { id: "RUN-8980B", status: "Success", startTime: "2026-04-09T06:18:00Z", durationMin: 40.1, cost: 8.60, recordsProcessed: 2950000, errorMessage: null },
  ],
  mkt_campaign_agg: [
    { id: "RUN-9010", status: "Failed", startTime: "2026-04-14T07:30:00Z", durationMin: 8.2, cost: 3.10, recordsProcessed: 0, errorMessage: "SchemaValidationException: unexpected column 'campaign_group_v2'" },
    { id: "RUN-9001C", status: "Failed", startTime: "2026-04-13T07:30:00Z", durationMin: 6.8, cost: 2.60, recordsProcessed: 0, errorMessage: "SchemaValidationException: unexpected column 'campaign_group_v2'" },
    { id: "RUN-8994C", status: "Success", startTime: "2026-04-10T07:32:00Z", durationMin: 14.5, cost: 5.40, recordsProcessed: 890000, errorMessage: null },
    { id: "RUN-8987C", status: "Success", startTime: "2026-04-09T07:28:00Z", durationMin: 13.9, cost: 5.20, recordsProcessed: 870000, errorMessage: null },
    { id: "RUN-8980C", status: "Success", startTime: "2026-04-08T07:31:00Z", durationMin: 15.2, cost: 5.70, recordsProcessed: 910000, errorMessage: null },
  ],
  hr_benefits_sync: [
    { id: "RUN-9009", status: "Success", startTime: "2026-04-14T06:00:00Z", durationMin: 4.4, cost: 1.20, recordsProcessed: 12400, errorMessage: null },
    { id: "RUN-9001D", status: "Success", startTime: "2026-04-13T06:00:00Z", durationMin: 4.1, cost: 1.10, recordsProcessed: 12200, errorMessage: null },
    { id: "RUN-8994D", status: "Success", startTime: "2026-04-12T06:01:00Z", durationMin: 4.6, cost: 1.25, recordsProcessed: 12500, errorMessage: null },
    { id: "RUN-8987D", status: "Success", startTime: "2026-04-11T06:00:00Z", durationMin: 4.2, cost: 1.15, recordsProcessed: 12300, errorMessage: null },
    { id: "RUN-8980D", status: "Success", startTime: "2026-04-10T06:00:00Z", durationMin: 4.3, cost: 1.18, recordsProcessed: 12350, errorMessage: null },
  ],
  sales_order_ingest: [
    { id: "RUN-9011", status: "Running", startTime: "2026-04-14T09:00:00Z", durationMin: 58.2, cost: 6.30, recordsProcessed: 1950000, errorMessage: null },
    { id: "RUN-9001E", status: "Success", startTime: "2026-04-13T09:00:00Z", durationMin: 28.4, cost: 6.30, recordsProcessed: 1950000, errorMessage: null },
    { id: "RUN-8994E", status: "Success", startTime: "2026-04-12T09:02:00Z", durationMin: 29.1, cost: 6.50, recordsProcessed: 2010000, errorMessage: null },
    { id: "RUN-8987E", status: "Success", startTime: "2026-04-11T09:01:00Z", durationMin: 27.6, cost: 6.10, recordsProcessed: 1890000, errorMessage: null },
    { id: "RUN-8980E", status: "Success", startTime: "2026-04-10T09:00:00Z", durationMin: 30.5, cost: 6.80, recordsProcessed: 2100000, errorMessage: null },
  ],
  fin_treasury_rates: [
    { id: "RUN-9001", status: "Timed Out", startTime: "2026-04-14T07:00:00Z", durationMin: 60.0, cost: 4.50, recordsProcessed: 0, errorMessage: "SocketTimeoutException: Read timed out after 60000ms" },
    { id: "RUN-9001F", status: "Timed Out", startTime: "2026-04-13T07:00:00Z", durationMin: 60.0, cost: 4.50, recordsProcessed: 0, errorMessage: "SocketTimeoutException: TLS handshake timeout" },
    { id: "RUN-8994F", status: "Success", startTime: "2026-04-07T07:00:00Z", durationMin: 6.2, cost: 1.80, recordsProcessed: 450, errorMessage: null },
    { id: "RUN-8987F", status: "Success", startTime: "2026-04-06T07:01:00Z", durationMin: 5.9, cost: 1.70, recordsProcessed: 448, errorMessage: null },
    { id: "RUN-8980F", status: "Success", startTime: "2026-04-05T07:00:00Z", durationMin: 6.4, cost: 1.85, recordsProcessed: 452, errorMessage: null },
  ],
};

const defaultPipelineRuns = (name: string) => [
  { id: "RUN-0001", status: "Success", startTime: "2026-04-14T05:00:00Z", durationMin: 14.0, cost: 4.80, recordsProcessed: 980000, errorMessage: null },
  { id: "RUN-0002", status: "Success", startTime: "2026-04-13T05:00:00Z", durationMin: 13.5, cost: 4.60, recordsProcessed: 960000, errorMessage: null },
  { id: "RUN-0003", status: "Success", startTime: "2026-04-12T05:01:00Z", durationMin: 14.8, cost: 5.00, recordsProcessed: 1010000, errorMessage: null },
  { id: "RUN-0004", status: "Success", startTime: "2026-04-11T05:00:00Z", durationMin: 13.2, cost: 4.50, recordsProcessed: 940000, errorMessage: null },
  { id: "RUN-0005", status: "Failed", startTime: "2026-04-10T05:03:00Z", durationMin: 4.1, cost: 1.40, recordsProcessed: 0, errorMessage: `RuntimeError: unexpected null in ${name} source` },
];

router.get("/pipelines/history/:pipelineName", async (req, res): Promise<void> => {
  const { pipelineName } = req.params;
  const history = pipelineRunHistory[pipelineName] ?? defaultPipelineRuns(pipelineName);
  res.json(history);
});

export default router;
