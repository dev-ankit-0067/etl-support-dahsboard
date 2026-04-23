import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/lambdas/kpis", async (_req, res): Promise<void> => {
  res.json({
    totalFunctions: 87,
    healthy: 71,
    withErrors: 12,
    throttled: 4,
    avgDurationMs: 412,
    coldStartsPercent: 6.4,
    totalInvocations24h: 1843291,
  });
});

router.get("/lambdas/runs", async (_req, res): Promise<void> => {
  res.json([
    { id: "INV-7821", functionName: "fin-gl-event-router",       status: "Failed",   startTime: "2026-04-14T08:11:00Z", endTime: "2026-04-14T08:11:02Z", duration: "2.1s",  costPerRun: 0.0042 },
    { id: "INV-7820", functionName: "sales-order-validator",     status: "Running",  startTime: "2026-04-14T09:02:00Z", endTime: "",                       duration: "—",     costPerRun: 0.0028 },
    { id: "INV-7819", functionName: "mkt-segment-updater",       status: "Failed",   startTime: "2026-04-14T07:48:00Z", endTime: "2026-04-14T07:48:05Z", duration: "5.4s",  costPerRun: 0.0061 },
    { id: "INV-7818", functionName: "hr-benefits-webhook",       status: "Success",  startTime: "2026-04-14T06:02:00Z", endTime: "2026-04-14T06:02:01Z", duration: "0.9s",  costPerRun: 0.0011 },
    { id: "INV-7817", functionName: "ops-inventory-notifier",    status: "Failed",   startTime: "2026-04-14T06:18:00Z", endTime: "2026-04-14T06:18:03Z", duration: "3.2s",  costPerRun: 0.0035 },
    { id: "INV-7816", functionName: "sales-quote-pricer",        status: "Success",  startTime: "2026-04-14T05:14:00Z", endTime: "2026-04-14T05:14:02Z", duration: "1.8s",  costPerRun: 0.0021 },
    { id: "INV-7815", functionName: "cust-360-stream-handler",   status: "Running",  startTime: "2026-04-14T09:18:00Z", endTime: "",                       duration: "—",     costPerRun: 0.0058 },
    { id: "INV-7814", functionName: "fin-ar-webhook-listener",   status: "Success",  startTime: "2026-04-14T04:08:00Z", endTime: "2026-04-14T04:08:01Z", duration: "1.1s",  costPerRun: 0.0014 },
    { id: "INV-7813", functionName: "sc-shipment-callback",      status: "Timed Out", startTime: "2026-04-14T08:32:00Z", endTime: "2026-04-14T08:32:30Z", duration: "30.0s", costPerRun: 0.0190 },
    { id: "INV-7812", functionName: "mkt-email-bounce-handler",  status: "Success",  startTime: "2026-04-14T03:12:00Z", endTime: "2026-04-14T03:12:00Z", duration: "0.4s",  costPerRun: 0.0006 },
    { id: "INV-7811", functionName: "ops-quality-alert-router",  status: "Waiting",  startTime: "",                      endTime: "",                       duration: "—",     costPerRun: 0 },
    { id: "INV-7810", functionName: "fin-treasury-fx-fetcher",   status: "Failed",   startTime: "2026-04-14T07:05:00Z", endTime: "2026-04-14T07:05:08Z", duration: "8.1s",  costPerRun: 0.0072 },
  ]);
});

const lambdaInvocationHistory: Record<string, Array<{ id: string; status: string; startTime: string; durationMs: number; cost: number; memoryMb: number; errorMessage: string | null }>> = {
  "fin-gl-event-router": [
    { id: "INV-7821",  status: "Failed",   startTime: "2026-04-14T08:11:00Z", durationMs: 2120, cost: 0.0042, memoryMb: 512, errorMessage: "TimeoutError: connection to RDS timed out after 2000ms" },
    { id: "INV-7821a", status: "Success",  startTime: "2026-04-14T07:11:00Z", durationMs: 184,  cost: 0.0009, memoryMb: 512, errorMessage: null },
    { id: "INV-7821b", status: "Success",  startTime: "2026-04-14T06:11:00Z", durationMs: 192,  cost: 0.0010, memoryMb: 512, errorMessage: null },
    { id: "INV-7821c", status: "Failed",   startTime: "2026-04-14T05:11:00Z", durationMs: 2050, cost: 0.0041, memoryMb: 512, errorMessage: "TimeoutError: handshake failed" },
    { id: "INV-7821d", status: "Success",  startTime: "2026-04-14T04:11:00Z", durationMs: 178,  cost: 0.0009, memoryMb: 512, errorMessage: null },
  ],
  "sales-order-validator": [
    { id: "INV-7820",  status: "Running",  startTime: "2026-04-14T09:02:00Z", durationMs: 0,    cost: 0.0028, memoryMb: 256, errorMessage: null },
    { id: "INV-7820a", status: "Success",  startTime: "2026-04-14T08:02:00Z", durationMs: 412,  cost: 0.0021, memoryMb: 256, errorMessage: null },
    { id: "INV-7820b", status: "Success",  startTime: "2026-04-14T07:02:00Z", durationMs: 388,  cost: 0.0019, memoryMb: 256, errorMessage: null },
    { id: "INV-7820c", status: "Success",  startTime: "2026-04-14T06:02:00Z", durationMs: 421,  cost: 0.0021, memoryMb: 256, errorMessage: null },
    { id: "INV-7820d", status: "Success",  startTime: "2026-04-14T05:02:00Z", durationMs: 405,  cost: 0.0020, memoryMb: 256, errorMessage: null },
  ],
  "mkt-segment-updater": [
    { id: "INV-7819",  status: "Failed",   startTime: "2026-04-14T07:48:00Z", durationMs: 5400, cost: 0.0061, memoryMb: 1024, errorMessage: "ValidationError: required field 'segment_id' missing" },
    { id: "INV-7819a", status: "Failed",   startTime: "2026-04-14T06:48:00Z", durationMs: 5210, cost: 0.0058, memoryMb: 1024, errorMessage: "ValidationError: required field 'segment_id' missing" },
    { id: "INV-7819b", status: "Success",  startTime: "2026-04-14T05:48:00Z", durationMs: 1820, cost: 0.0021, memoryMb: 1024, errorMessage: null },
    { id: "INV-7819c", status: "Success",  startTime: "2026-04-14T04:48:00Z", durationMs: 1755, cost: 0.0020, memoryMb: 1024, errorMessage: null },
    { id: "INV-7819d", status: "Success",  startTime: "2026-04-14T03:48:00Z", durationMs: 1890, cost: 0.0022, memoryMb: 1024, errorMessage: null },
  ],
  "sc-shipment-callback": [
    { id: "INV-7813",  status: "Timed Out", startTime: "2026-04-14T08:32:00Z", durationMs: 30000, cost: 0.0190, memoryMb: 512, errorMessage: "Task timed out after 30.00 seconds" },
    { id: "INV-7813a", status: "Timed Out", startTime: "2026-04-14T07:32:00Z", durationMs: 30000, cost: 0.0190, memoryMb: 512, errorMessage: "Task timed out after 30.00 seconds" },
    { id: "INV-7813b", status: "Success",   startTime: "2026-04-14T06:32:00Z", durationMs: 1240,  cost: 0.0014, memoryMb: 512, errorMessage: null },
    { id: "INV-7813c", status: "Success",   startTime: "2026-04-14T05:32:00Z", durationMs: 1180,  cost: 0.0013, memoryMb: 512, errorMessage: null },
    { id: "INV-7813d", status: "Success",   startTime: "2026-04-14T04:32:00Z", durationMs: 1305,  cost: 0.0014, memoryMb: 512, errorMessage: null },
  ],
  "fin-treasury-fx-fetcher": [
    { id: "INV-7810",  status: "Failed",   startTime: "2026-04-14T07:05:00Z", durationMs: 8100, cost: 0.0072, memoryMb: 768, errorMessage: "HTTPError: 503 Service Unavailable from fx provider" },
    { id: "INV-7810a", status: "Failed",   startTime: "2026-04-14T06:05:00Z", durationMs: 8200, cost: 0.0073, memoryMb: 768, errorMessage: "HTTPError: 503 Service Unavailable from fx provider" },
    { id: "INV-7810b", status: "Success",  startTime: "2026-04-14T05:05:00Z", durationMs: 920,  cost: 0.0010, memoryMb: 768, errorMessage: null },
    { id: "INV-7810c", status: "Success",  startTime: "2026-04-14T04:05:00Z", durationMs: 875,  cost: 0.0010, memoryMb: 768, errorMessage: null },
    { id: "INV-7810d", status: "Success",  startTime: "2026-04-14T03:05:00Z", durationMs: 950,  cost: 0.0011, memoryMb: 768, errorMessage: null },
  ],
};

const defaultLambdaHistory = (name: string) => [
  { id: "INV-0001", status: "Success", startTime: "2026-04-14T05:00:00Z", durationMs: 410, cost: 0.0020, memoryMb: 256, errorMessage: null },
  { id: "INV-0002", status: "Success", startTime: "2026-04-14T04:00:00Z", durationMs: 398, cost: 0.0019, memoryMb: 256, errorMessage: null },
  { id: "INV-0003", status: "Success", startTime: "2026-04-14T03:00:00Z", durationMs: 425, cost: 0.0021, memoryMb: 256, errorMessage: null },
  { id: "INV-0004", status: "Success", startTime: "2026-04-14T02:00:00Z", durationMs: 388, cost: 0.0019, memoryMb: 256, errorMessage: null },
  { id: "INV-0005", status: "Failed",  startTime: "2026-04-14T01:00:00Z", durationMs: 1820, cost: 0.0034, memoryMb: 256, errorMessage: `RuntimeError: unexpected event payload in ${name}` },
];

router.get("/lambdas/history/:functionName", async (req, res): Promise<void> => {
  const { functionName } = req.params;
  const history = lambdaInvocationHistory[functionName] ?? defaultLambdaHistory(functionName);
  res.json(history);
});

router.get("/lambdas/cost-breakdown", async (_req, res): Promise<void> => {
  res.json({
    byFunction: [
      { name: "cust-360-stream-handler",  cost: 412.80 },
      { name: "sc-shipment-callback",     cost: 318.45 },
      { name: "fin-treasury-fx-fetcher",  cost: 274.10 },
      { name: "mkt-segment-updater",      cost: 248.60 },
      { name: "fin-gl-event-router",      cost: 196.30 },
      { name: "ops-inventory-notifier",   cost: 172.55 },
      { name: "sales-order-validator",    cost: 158.90 },
      { name: "sales-quote-pricer",       cost: 134.20 },
      { name: "fin-ar-webhook-listener",  cost: 98.40 },
      { name: "hr-benefits-webhook",      cost: 71.05 },
    ],
  });
});

router.get("/lambdas/cost-performance", async (_req, res): Promise<void> => {
  const buildSeries = (days: number, base: number, variance: number) =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      return {
        date: d.toISOString().slice(0, 10),
        cost: Number((base + Math.sin(i / 2) * variance + (Math.random() * variance) / 2).toFixed(2)),
      };
    });

  const series7 = buildSeries(7, 78, 14);
  const series30 = buildSeries(30, 76, 18);
  const today = series7.slice(-1);

  res.json({
    costVsFunction: series7,
    costRanges: { today, "7d": series7, "30d": series30 },
  });
});

export default router;
