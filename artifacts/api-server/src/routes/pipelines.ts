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

export default router;
