import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/incidents/summary", async (_req, res): Promise<void> => {
  res.json({
    openByP1: 2,
    openByP2: 5,
    openByP3: 8,
    openByP4: 3,
    aging0to1h: 1,
    aging1to4h: 4,
    aging4to12h: 8,
    aging12hPlus: 5,
    acknowledged: 13,
    unacknowledged: 5,
  });
});

router.get("/incidents/queue", async (_req, res): Promise<void> => {
  res.json([
    { owner: "Sarah Chen", p1Count: 1, p2Count: 1, p3Count: 2, p4Count: 0, oldestAge: "3h 28m" },
    { owner: "Priya Patel", p1Count: 1, p2Count: 0, p3Count: 1, p4Count: 1, oldestAge: "5h 15m" },
    { owner: "Mike Torres", p1Count: 0, p2Count: 1, p3Count: 1, p4Count: 0, oldestAge: "2h 10m" },
    { owner: "James Wilson", p1Count: 0, p2Count: 1, p3Count: 0, p4Count: 1, oldestAge: "4h 40m" },
    { owner: "Alex Kumar", p1Count: 0, p2Count: 1, p3Count: 1, p4Count: 0, oldestAge: "6h 40m" },
    { owner: "Lisa Park", p1Count: 0, p2Count: 1, p3Count: 1, p4Count: 1, oldestAge: "5h 55m" },
    { owner: "David Lee", p1Count: 0, p2Count: 1, p3Count: 2, p4Count: 0, oldestAge: "7h 12m" },
  ]);
});

router.get("/incidents/mttr-trend", async (_req, res): Promise<void> => {
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });
  res.json(
    days.map((date) => ({
      date,
      mttaMin: 3 + Math.random() * 4,
      mttrMin: 25 + Math.random() * 20,
    }))
  );
});

export default router;
