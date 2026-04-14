import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/overview/kpis", async (_req, res): Promise<void> => {
  res.json({
    totalPipelines: 142,
    healthy: 118,
    degraded: 16,
    failed: 8,
    failedJobs24h: 23,
    activeP1: 2,
    activeP2: 5,
    slaBreaches: 3,
    avgMtta: 4.2,
    avgMttr: 38.5,
    topImpactedDomain: "Finance",
    slaCompliancePercent: 96.7,
  });
});

router.get("/overview/health-distribution", async (_req, res): Promise<void> => {
  res.json({
    domains: [
      { name: "Finance", healthy: 18, degraded: 4, failed: 3 },
      { name: "Marketing", healthy: 22, degraded: 2, failed: 1 },
      { name: "Sales", healthy: 28, degraded: 3, failed: 0 },
      { name: "Operations", healthy: 15, degraded: 3, failed: 2 },
      { name: "HR", healthy: 12, degraded: 1, failed: 0 },
      { name: "Supply Chain", healthy: 14, degraded: 2, failed: 1 },
      { name: "Customer", healthy: 9, degraded: 1, failed: 1 },
    ],
  });
});

router.get("/overview/job-status-trend", async (_req, res): Promise<void> => {
  const hours = Array.from({ length: 24 }, (_, i) => {
    const d = new Date();
    d.setHours(d.getHours() - (23 - i));
    return d.toISOString().slice(0, 13) + ":00";
  });
  res.json(
    hours.map((timestamp) => ({
      timestamp,
      success: 40 + Math.floor(Math.random() * 20),
      failed: Math.floor(Math.random() * 5),
      running: 5 + Math.floor(Math.random() * 10),
    }))
  );
});

router.get("/overview/failed-jobs", async (_req, res): Promise<void> => {
  res.json([
    { id: "JOB-4821", pipelineName: "fin_gl_ledger_sync", domain: "Finance", failedAt: "2026-04-14T08:23:00Z", duration: "12m 34s", errorType: "ConnectionTimeout", owner: "Sarah Chen", severity: "P1" },
    { id: "JOB-4819", pipelineName: "mkt_campaign_agg", domain: "Marketing", failedAt: "2026-04-14T07:45:00Z", duration: "8m 12s", errorType: "SchemaValidation", owner: "Mike Torres", severity: "P2" },
    { id: "JOB-4815", pipelineName: "ops_inventory_load", domain: "Operations", failedAt: "2026-04-14T06:30:00Z", duration: "22m 05s", errorType: "OutOfMemory", owner: "Priya Patel", severity: "P1" },
    { id: "JOB-4812", pipelineName: "fin_ap_reconciliation", domain: "Finance", failedAt: "2026-04-14T05:15:00Z", duration: "5m 48s", errorType: "DataQuality", owner: "James Wilson", severity: "P2" },
    { id: "JOB-4808", pipelineName: "sc_shipment_tracker", domain: "Supply Chain", failedAt: "2026-04-14T04:02:00Z", duration: "15m 22s", errorType: "UpstreamUnavailable", owner: "Lisa Park", severity: "P3" },
    { id: "JOB-4805", pipelineName: "cust_churn_predictor", domain: "Customer", failedAt: "2026-04-14T03:18:00Z", duration: "45m 10s", errorType: "ResourceExhausted", owner: "Alex Kumar", severity: "P2" },
    { id: "JOB-4801", pipelineName: "hr_payroll_calc", domain: "HR", failedAt: "2026-04-14T02:45:00Z", duration: "3m 55s", errorType: "PermissionDenied", owner: "David Lee", severity: "P3" },
  ]);
});

router.get("/overview/active-incidents", async (_req, res): Promise<void> => {
  res.json([
    { id: "INC-1042", title: "GL Ledger sync failing - connection pool exhausted", severity: "P1", status: "Investigating", pipeline: "fin_gl_ledger_sync", domain: "Finance", createdAt: "2026-04-14T08:25:00Z", owner: "Sarah Chen", acknowledged: true, escalationLevel: 2, age: "1h 35m" },
    { id: "INC-1041", title: "Inventory load OOM on large batch", severity: "P1", status: "Mitigating", pipeline: "ops_inventory_load", domain: "Operations", createdAt: "2026-04-14T06:32:00Z", owner: "Priya Patel", acknowledged: true, escalationLevel: 1, age: "3h 28m" },
    { id: "INC-1040", title: "Campaign aggregation schema mismatch", severity: "P2", status: "Investigating", pipeline: "mkt_campaign_agg", domain: "Marketing", createdAt: "2026-04-14T07:50:00Z", owner: "Mike Torres", acknowledged: true, escalationLevel: 1, age: "2h 10m" },
    { id: "INC-1039", title: "AP reconciliation data quality failures", severity: "P2", status: "Open", pipeline: "fin_ap_reconciliation", domain: "Finance", createdAt: "2026-04-14T05:20:00Z", owner: "James Wilson", acknowledged: false, escalationLevel: 0, age: "4h 40m" },
    { id: "INC-1038", title: "Churn predictor resource exhaustion", severity: "P2", status: "Open", pipeline: "cust_churn_predictor", domain: "Customer", createdAt: "2026-04-14T03:20:00Z", owner: "Alex Kumar", acknowledged: true, escalationLevel: 1, age: "6h 40m" },
    { id: "INC-1036", title: "Shipment tracker upstream API down", severity: "P2", status: "Monitoring", pipeline: "sc_shipment_tracker", domain: "Supply Chain", createdAt: "2026-04-14T04:05:00Z", owner: "Lisa Park", acknowledged: true, escalationLevel: 0, age: "5h 55m" },
    { id: "INC-1035", title: "Payroll calc permission denied on new role", severity: "P2", status: "Open", pipeline: "hr_payroll_calc", domain: "HR", createdAt: "2026-04-14T02:48:00Z", owner: "David Lee", acknowledged: false, escalationLevel: 0, age: "7h 12m" },
  ]);
});

export default router;
