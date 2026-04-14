import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/costs/kpis", async (_req, res): Promise<void> => {
  res.json({
    totalCostMtd: 47832.50,
    avgCostPerRun: 4.85,
    costOfFailedRuns: 3215.40,
    costAnomalies: 4,
    budgetUtilization: 68.3,
    budget: 70000,
  });
});

router.get("/costs/breakdown", async (_req, res): Promise<void> => {
  res.json({
    byPipeline: [
      { name: "cust_churn_predictor", cost: 8450.20 },
      { name: "fin_gl_ledger_sync", cost: 6820.15 },
      { name: "ops_inventory_load", cost: 5940.30 },
      { name: "sales_order_ingest", cost: 4580.75 },
      { name: "sc_demand_planning", cost: 4120.60 },
      { name: "mkt_attribution_model", cost: 3890.45 },
      { name: "cust_360_profile", cost: 3450.80 },
      { name: "fin_treasury_rates", cost: 2980.25 },
      { name: "fin_ap_reconciliation", cost: 2640.50 },
      { name: "hr_payroll_calc", cost: 1960.30 },
    ],
    byDomain: [
      { name: "Finance", cost: 15240.90 },
      { name: "Customer", cost: 11900.00 },
      { name: "Operations", cost: 7840.30 },
      { name: "Sales", cost: 5980.75 },
      { name: "Supply Chain", cost: 4120.60 },
      { name: "Marketing", cost: 3890.45 },
      { name: "HR", cost: 1960.30 },
    ],
    byEnvironment: [
      { name: "Production", cost: 38265.00 },
      { name: "QA", cost: 6698.50 },
      { name: "Development", cost: 2869.00 },
    ],
  });
});

router.get("/costs/performance", async (_req, res): Promise<void> => {
  res.json({
    costVsRuntime: [
      { pipeline: "cust_churn_predictor", cost: 12.50, runtimeMin: 45.2 },
      { pipeline: "ops_inventory_load", cost: 8.20, runtimeMin: 38.7 },
      { pipeline: "fin_gl_ledger_sync", cost: 9.75, runtimeMin: 34.1 },
      { pipeline: "sales_order_ingest", cost: 6.30, runtimeMin: 28.4 },
      { pipeline: "sc_demand_planning", cost: 7.15, runtimeMin: 26.8 },
      { pipeline: "mkt_attribution_model", cost: 5.90, runtimeMin: 24.5 },
      { pipeline: "cust_360_profile", cost: 5.40, runtimeMin: 22.1 },
      { pipeline: "fin_treasury_rates", cost: 4.80, runtimeMin: 19.8 },
      { pipeline: "fin_ap_reconciliation", cost: 3.60, runtimeMin: 15.2 },
      { pipeline: "hr_payroll_calc", cost: 2.80, runtimeMin: 10.5 },
      { pipeline: "mkt_email_events", cost: 1.90, runtimeMin: 6.3 },
      { pipeline: "hr_benefits_sync", cost: 1.20, runtimeMin: 4.2 },
    ],
    costVsVolume: Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      return {
        date: d.toISOString().slice(0, 10),
        cost: 3000 + Math.random() * 1500,
        volumeGb: 120 + Math.random() * 80,
      };
    }),
    retryCostWaste: 1847.60,
  });
});

router.get("/costs/optimization", async (_req, res): Promise<void> => {
  res.json([
    { type: "Over-provisioned", pipeline: "hr_benefits_sync", description: "Using 4x memory allocation vs actual peak usage. Right-sizing could reduce costs significantly.", estimatedSavings: 420.00, priority: "Medium" },
    { type: "High Retry Cost", pipeline: "fin_gl_ledger_sync", description: "Averaging 3.2 retries per run. Connection pooling fix could eliminate most retry costs.", estimatedSavings: 1250.00, priority: "High" },
    { type: "Over-provisioned", pipeline: "mkt_email_events", description: "Running on r5.2xlarge but peak CPU never exceeds 15%. Downsize to r5.large.", estimatedSavings: 680.00, priority: "Medium" },
    { type: "High Retry Cost", pipeline: "ops_inventory_load", description: "OOM-triggered retries waste compute. Increase memory or optimize batch size.", estimatedSavings: 890.00, priority: "High" },
    { type: "Schedule Optimization", pipeline: "sales_forecast_daily", description: "Runs overlap with peak demand window. Shifting to off-peak could reduce spot pricing.", estimatedSavings: 340.00, priority: "Low" },
    { type: "Over-provisioned", pipeline: "fin_ar_aging_report", description: "Reserved instance running at 8% avg utilization. Switch to on-demand or smaller instance.", estimatedSavings: 560.00, priority: "Medium" },
  ]);
});

export default router;
