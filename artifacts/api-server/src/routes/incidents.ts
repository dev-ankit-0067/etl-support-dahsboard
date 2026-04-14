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

router.get("/incidents/oncall", async (_req, res): Promise<void> => {
  res.json([
    {
      team: "Finance Data",
      domain: "Finance",
      oncall: "Sarah Chen",
      backup: "James Wilson",
      phone: "+1-555-0101",
      slackHandle: "@sarah.chen",
      activeP1: 1,
      activeP2: 1,
      shiftStart: "2026-04-14T06:00:00Z",
      shiftEnd: "2026-04-14T18:00:00Z",
      escalationPath: ["Sarah Chen", "James Wilson", "Finance Data Lead (Emily Ross)"],
    },
    {
      team: "Operations Eng",
      domain: "Operations",
      oncall: "Priya Patel",
      backup: "Tom Hardy",
      phone: "+1-555-0102",
      slackHandle: "@priya.patel",
      activeP1: 1,
      activeP2: 0,
      shiftStart: "2026-04-14T06:00:00Z",
      shiftEnd: "2026-04-14T18:00:00Z",
      escalationPath: ["Priya Patel", "Tom Hardy", "Ops Lead (Marcus Johnson)"],
    },
    {
      team: "Marketing Analytics",
      domain: "Marketing",
      oncall: "Mike Torres",
      backup: "Alex Kumar",
      phone: "+1-555-0103",
      slackHandle: "@mike.torres",
      activeP1: 0,
      activeP2: 1,
      shiftStart: "2026-04-14T00:00:00Z",
      shiftEnd: "2026-04-14T12:00:00Z",
      escalationPath: ["Mike Torres", "Alex Kumar", "Marketing Eng Lead (Wei Zhang)"],
    },
    {
      team: "HR & People",
      domain: "HR",
      oncall: "David Lee",
      backup: "Priya Patel",
      phone: "+1-555-0104",
      slackHandle: "@david.lee",
      activeP1: 0,
      activeP2: 1,
      shiftStart: "2026-04-14T06:00:00Z",
      shiftEnd: "2026-04-14T18:00:00Z",
      escalationPath: ["David Lee", "Priya Patel", "HR Eng Lead (Sandra Osei)"],
    },
    {
      team: "Supply Chain",
      domain: "Supply Chain",
      oncall: "Lisa Park",
      backup: "Tom Hardy",
      phone: "+1-555-0105",
      slackHandle: "@lisa.park",
      activeP1: 0,
      activeP2: 1,
      shiftStart: "2026-04-14T06:00:00Z",
      shiftEnd: "2026-04-14T18:00:00Z",
      escalationPath: ["Lisa Park", "Tom Hardy", "SC Lead (Carlos Rivera)"],
    },
    {
      team: "Customer Intelligence",
      domain: "Customer",
      oncall: "Alex Kumar",
      backup: "Mike Torres",
      phone: "+1-555-0106",
      slackHandle: "@alex.kumar",
      activeP1: 0,
      activeP2: 1,
      shiftStart: "2026-04-14T00:00:00Z",
      shiftEnd: "2026-04-14T12:00:00Z",
      escalationPath: ["Alex Kumar", "Mike Torres", "Customer Eng Lead (Neha Singh)"],
    },
    {
      team: "Sales & Revenue",
      domain: "Sales",
      oncall: "Tom Hardy",
      backup: "Lisa Park",
      phone: "+1-555-0107",
      slackHandle: "@tom.hardy",
      activeP1: 0,
      activeP2: 0,
      shiftStart: "2026-04-14T06:00:00Z",
      shiftEnd: "2026-04-14T18:00:00Z",
      escalationPath: ["Tom Hardy", "Lisa Park", "Sales Eng Lead (John Park)"],
    },
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
