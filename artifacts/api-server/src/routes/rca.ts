import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/rca/lifecycle", async (_req, res): Promise<void> => {
  res.json([
    { id: "RCA-301", incidentTitle: "Redshift connection pool exhaustion", pipeline: "fin_gl_ledger_sync", rcaStatus: "In Progress", daysOpen: 2, actionItems: 4, completedActions: 1 },
    { id: "RCA-298", incidentTitle: "OOM on large inventory batch", pipeline: "ops_inventory_load", rcaStatus: "Pending Review", daysOpen: 5, actionItems: 3, completedActions: 3 },
    { id: "RCA-295", incidentTitle: "Schema drift in campaign data", pipeline: "mkt_campaign_agg", rcaStatus: "In Progress", daysOpen: 3, actionItems: 5, completedActions: 2 },
    { id: "RCA-290", incidentTitle: "S3 permission change broke pipeline", pipeline: "hr_payroll_calc", rcaStatus: "Completed", daysOpen: 8, actionItems: 3, completedActions: 3 },
    { id: "RCA-288", incidentTitle: "Upstream API rate limiting", pipeline: "sc_shipment_tracker", rcaStatus: "In Progress", daysOpen: 4, actionItems: 4, completedActions: 2 },
    { id: "RCA-285", incidentTitle: "Memory leak in churn model", pipeline: "cust_churn_predictor", rcaStatus: "Open", daysOpen: 6, actionItems: 0, completedActions: 0 },
    { id: "RCA-280", incidentTitle: "Data quality regression in AR aging", pipeline: "fin_ar_aging_report", rcaStatus: "Completed", daysOpen: 12, actionItems: 5, completedActions: 5 },
  ]);
});

router.get("/rca/repeat-incidents", async (_req, res): Promise<void> => {
  res.json([
    { pipeline: "fin_gl_ledger_sync", count: 7, lastOccurrence: "2026-04-14T08:25:00Z", pattern: "Connection pool exhaustion during peak" },
    { pipeline: "ops_inventory_load", count: 5, lastOccurrence: "2026-04-14T06:32:00Z", pattern: "OOM on batch sizes > 2M records" },
    { pipeline: "sc_shipment_tracker", count: 4, lastOccurrence: "2026-04-14T04:05:00Z", pattern: "Upstream API rate limiting" },
    { pipeline: "mkt_campaign_agg", count: 3, lastOccurrence: "2026-04-14T07:50:00Z", pattern: "Schema validation failure after source changes" },
    { pipeline: "cust_churn_predictor", count: 3, lastOccurrence: "2026-04-14T03:20:00Z", pattern: "Resource exhaustion on model training step" },
  ]);
});

router.get("/rca/failure-patterns", async (_req, res): Promise<void> => {
  res.json([
    { pattern: "ConnectionTimeout", occurrences: 34, affectedPipelines: 8, lastSeen: "2026-04-14T08:23:00Z", trend: "increasing" },
    { pattern: "OutOfMemory", occurrences: 18, affectedPipelines: 5, lastSeen: "2026-04-14T06:30:00Z", trend: "stable" },
    { pattern: "SchemaValidation", occurrences: 15, affectedPipelines: 6, lastSeen: "2026-04-14T07:45:00Z", trend: "increasing" },
    { pattern: "DataQuality", occurrences: 12, affectedPipelines: 4, lastSeen: "2026-04-14T05:15:00Z", trend: "decreasing" },
    { pattern: "PermissionDenied", occurrences: 8, affectedPipelines: 3, lastSeen: "2026-04-14T02:45:00Z", trend: "stable" },
    { pattern: "UpstreamUnavailable", occurrences: 7, affectedPipelines: 4, lastSeen: "2026-04-14T04:02:00Z", trend: "increasing" },
    { pattern: "ResourceExhausted", occurrences: 5, affectedPipelines: 2, lastSeen: "2026-04-14T03:18:00Z", trend: "stable" },
  ]);
});

router.get("/rca/metrics", async (_req, res): Promise<void> => {
  res.json({
    automationSuccessRate: 78.5,
    runbookUsagePercent: 64.2,
    openRcaBacklog: 12,
    avgRcaCompletionDays: 6.8,
    changeCorrelationPercent: 42.0,
  });
});

export default router;
