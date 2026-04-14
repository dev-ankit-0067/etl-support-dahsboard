import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/performance/duration-trend", async (_req, res): Promise<void> => {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
  res.json(
    days.map((timestamp) => ({
      timestamp,
      avgDurationMin: 12 + Math.random() * 8,
      p95DurationMin: 35 + Math.random() * 15,
    }))
  );
});

router.get("/performance/slowest-jobs", async (_req, res): Promise<void> => {
  res.json([
    { id: "JOB-4821", pipelineName: "cust_churn_predictor", durationMin: 45.2, avgDurationMin: 22.1, skewness: 2.05, costPerRun: 12.50, recordsProcessed: 4500000 },
    { id: "JOB-4815", pipelineName: "ops_inventory_load", durationMin: 38.7, avgDurationMin: 15.3, skewness: 2.53, costPerRun: 8.20, recordsProcessed: 2800000 },
    { id: "JOB-4810", pipelineName: "fin_gl_ledger_sync", durationMin: 34.1, avgDurationMin: 18.5, skewness: 1.84, costPerRun: 9.75, recordsProcessed: 3200000 },
    { id: "JOB-4806", pipelineName: "sales_order_ingest", durationMin: 28.4, avgDurationMin: 14.2, skewness: 2.0, costPerRun: 6.30, recordsProcessed: 1950000 },
    { id: "JOB-4803", pipelineName: "sc_demand_planning", durationMin: 26.8, avgDurationMin: 12.8, skewness: 2.09, costPerRun: 7.15, recordsProcessed: 1400000 },
    { id: "JOB-4799", pipelineName: "mkt_attribution_model", durationMin: 24.5, avgDurationMin: 11.0, skewness: 2.23, costPerRun: 5.90, recordsProcessed: 890000 },
    { id: "JOB-4795", pipelineName: "cust_360_profile", durationMin: 22.1, avgDurationMin: 10.5, skewness: 2.1, costPerRun: 5.40, recordsProcessed: 750000 },
    { id: "JOB-4790", pipelineName: "fin_treasury_rates", durationMin: 19.8, avgDurationMin: 8.2, skewness: 2.41, costPerRun: 4.80, recordsProcessed: 320000 },
  ]);
});

router.get("/performance/throughput", async (_req, res): Promise<void> => {
  const hours = Array.from({ length: 24 }, (_, i) => {
    const d = new Date();
    d.setHours(d.getHours() - (23 - i));
    return d.toISOString().slice(0, 13) + ":00";
  });
  res.json(
    hours.map((timestamp) => ({
      timestamp,
      recordsRead: 800000 + Math.floor(Math.random() * 400000),
      recordsWritten: 650000 + Math.floor(Math.random() * 350000),
    }))
  );
});

export default router;
