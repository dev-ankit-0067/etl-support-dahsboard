import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/costs/kpis", async (_req, res): Promise<void> => {
  res.json({
    totalCostMtd: 47832.5,
    avgCostPerRun: 4.85,
    costOfFailedRuns: 3215.4,
    costAnomalies: 4,
    budgetUtilization: 68.3,
    budget: 70000,
  });
});

router.get("/costs/breakdown", async (_req, res): Promise<void> => {
  res.json({
    byPipeline: [
      { name: "cust_churn_predictor", cost: 8450.2 },
      { name: "fin_gl_ledger_sync", cost: 6820.15 },
      { name: "ops_inventory_load", cost: 5940.3 },
      { name: "sales_order_ingest", cost: 4580.75 },
      { name: "sc_demand_planning", cost: 4120.6 },
      { name: "mkt_attribution_model", cost: 3890.45 },
      { name: "cust_360_profile", cost: 3450.8 },
      { name: "fin_treasury_rates", cost: 2980.25 },
      { name: "fin_ap_reconciliation", cost: 2640.5 },
      { name: "hr_payroll_calc", cost: 1960.3 },
    ],
    byDomain: [
      { name: "Finance", cost: 15240.9 },
      { name: "Customer", cost: 11900.0 },
      { name: "Operations", cost: 7840.3 },
      { name: "Sales", cost: 5980.75 },
      { name: "Supply Chain", cost: 4120.6 },
      { name: "Marketing", cost: 3890.45 },
      { name: "HR", cost: 1960.3 },
    ],
    byEnvironment: [
      { name: "Production", cost: 38265.0 },
      { name: "QA", cost: 6698.5 },
      { name: "Development", cost: 2869.0 },
    ],
  });
});

router.get("/costs/performance", async (_req, res): Promise<void> => {
  const ranges = {
    today: [
      { date: "2026-04-17", cost: 3120.5 },
      { date: "2026-04-17", cost: 2980.2 },
      { date: "2026-04-17", cost: 3350.75 },
      { date: "2026-04-17", cost: 3210.4 },
      { date: "2026-04-17", cost: 2895.1 },
      { date: "2026-04-17", cost: 3055.9 },
      { date: "2026-04-17", cost: 3188.35 },
    ],
    "7d": [
      { date: "2026-04-11", cost: 2860.4 },
      { date: "2026-04-12", cost: 3015.8 },
      { date: "2026-04-13", cost: 2942.1 },
      { date: "2026-04-14", cost: 3290.6 },
      { date: "2026-04-15", cost: 3175.25 },
      { date: "2026-04-16", cost: 3422.9 },
      { date: "2026-04-17", cost: 3331.7 },
    ],
    "30d": [
      { date: "2026-03-19", cost: 2765.4 },
      { date: "2026-03-24", cost: 2894.8 },
      { date: "2026-03-29", cost: 3012.1 },
      { date: "2026-04-03", cost: 3148.6 },
      { date: "2026-04-08", cost: 3275.3 },
      { date: "2026-04-13", cost: 3390.5 },
      { date: "2026-04-17", cost: 3321.9 },
    ],
  };

  res.json({
    costVsPipeline: ranges["7d"],
    costRanges: ranges,
    retryCostWaste: 1847.6,
  });
});

router.get("/costs/optimization", async (_req, res): Promise<void> => {
  res.json([
    { type: "Over-provisioned", pipeline: "hr_benefits_sync", description: "Using 4x memory allocation vs actual peak usage. Right-sizing could reduce costs significantly.", estimatedSavings: 420.0, priority: "Medium" },
    { type: "High Retry Cost", pipeline: "fin_gl_ledger_sync", description: "Averaging 3.2 retries per run. Connection pooling fix could eliminate most retry costs.", estimatedSavings: 1250.0, priority: "High" },
    { type: "Over-provisioned", pipeline: "mkt_email_events", description: "Running on r5.2xlarge but peak CPU never exceeds 15%. Downsize to r5.large.", estimatedSavings: 680.0, priority: "Medium" },
    { type: "High Retry Cost", pipeline: "ops_inventory_load", description: "OOM-triggered retries waste compute. Increase memory or optimize batch size.", estimatedSavings: 890.0, priority: "High" },
    { type: "Schedule Optimization", pipeline: "sales_forecast_daily", description: "Runs overlap with peak demand window. Shifting to off-peak could reduce spot pricing.", estimatedSavings: 340.0, priority: "Low" },
    { type: "Over-provisioned", pipeline: "fin_ar_aging_report", description: "Reserved instance running at 8% avg utilization. Switch to on-demand or smaller instance.", estimatedSavings: 560.0, priority: "Medium" },
  ]);
});

export default router;
