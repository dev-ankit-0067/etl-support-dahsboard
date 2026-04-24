import { Fragment, useState } from "react";
import {
  useGetIncidentSummary,
  useGetActiveIncidents,
  useGetRcaLifecycle,
  useGetRepeatIncidents,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Plus,
  Minus,
  AlertTriangle,
  Clock,
  User,
  CheckCircle2,
  RotateCcw,
  Wrench,
  FileSearch,
} from "lucide-react";

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  pipeline: string;
  domain?: string;
  createdAt: string;
  owner: string;
  acknowledged: boolean;
  escalationLevel: number;
  age: string;
}

const SEVERITY_BADGE: Record<string, string> = {
  P1: "bg-red-100 text-red-700 border-red-200",
  P2: "bg-amber-100 text-amber-700 border-amber-200",
  P3: "bg-blue-100 text-blue-700 border-blue-200",
  P4: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_BADGE: Record<string, string> = {
  Open: "bg-red-100 text-red-700 border-red-200",
  Investigating: "bg-blue-100 text-blue-700 border-blue-200",
  Mitigating: "bg-amber-100 text-amber-700 border-amber-200",
  Monitoring: "bg-purple-100 text-purple-700 border-purple-200",
  Resolved: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const STATUS_COLOR: Record<string, string> = {
  Open: "#ef4444",
  Investigating: "#3b82f6",
  Mitigating: "#f59e0b",
  Monitoring: "#8b5cf6",
  Resolved: "#10b981",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function statusBadge(status: string) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${STATUS_BADGE[status] || STATUS_BADGE.Open}`}>
      {status}
    </span>
  );
}

function severityBadge(sev: string) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${SEVERITY_BADGE[sev] || SEVERITY_BADGE.P3}`}>
      {sev}
    </span>
  );
}

function IncidentDetailSubsection({ incident }: { incident: Incident }) {
  const { data: lifecycle } = useGetRcaLifecycle();
  const { data: repeats } = useGetRepeatIncidents();

  const rcaEntry = lifecycle?.find((r: { pipeline: string }) => r.pipeline === incident.pipeline);
  const repeatEntry = repeats?.find((r: { pipeline: string }) => r.pipeline === incident.pipeline);
  const isResolved = incident.status === "Resolved";

  const completedActions = rcaEntry?.completedActions ?? (isResolved ? 4 : 1);
  const totalActions = rcaEntry?.actionItems ?? (isResolved ? 4 : 4);
  const daysOpen = rcaEntry?.daysOpen ?? 2;
  const completionPct = totalActions > 0 ? Math.round((completedActions / totalActions) * 100) : 0;

  const rcaSummary = rcaEntry?.rcaSummary ||
    (isResolved
      ? "A schema mismatch introduced during the latest upstream release caused repeated job failures until the pipeline was rolled back and the source contract was corrected."
      : "Investigation in progress. Initial analysis points to an upstream change introducing unexpected payload variance; on-call team is collecting trace data and validating recent deployments.");

  return (
    <div className="bg-slate-50 border-t border-b">
      {/* Top strip */}
      <div className="px-6 py-3 border-b bg-white/60 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
        <span className="font-mono text-slate-700">{incident.id}</span>
        <span className="text-muted-foreground">
          Pipeline: <span className="font-mono font-semibold text-slate-700">{incident.pipeline}</span>
        </span>
        <span className="text-muted-foreground">
          Detected: <span className="font-semibold text-slate-700">{fmt(incident.createdAt)}</span>
        </span>
        <span className="text-muted-foreground">
          Aging: <span className="font-semibold text-slate-700">{incident.age}</span>
        </span>
        <span className="text-muted-foreground">
          Days open: <span className="font-semibold text-slate-700">{daysOpen}d</span>
        </span>
        <span className="text-muted-foreground">
          Owner: <span className="font-semibold text-slate-700">{incident.owner}</span>
        </span>
      </div>

      {/* Body */}
      <div className="px-6 py-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* RCA */}
        <div className="rounded-md border bg-white p-3 space-y-3">
          <div className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-slate-400" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Root Cause Analysis</p>
          </div>
          <p className="text-sm text-slate-700 leading-6">{rcaSummary}</p>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Key Findings</p>
            <ul className="text-xs text-slate-700 list-disc pl-5 space-y-1">
              <li>Upstream schema drift introduced an unexpected field change.</li>
              <li>Validation rules did not fail fast before the transformation step.</li>
              <li>Retry behavior amplified the impact by repeatedly reprocessing failed batches.</li>
            </ul>
          </div>
        </div>

        {/* Fix details */}
        <div className="rounded-md border bg-white p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-slate-400" />
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {isResolved ? "Fix Applied" : "Mitigation Plan"}
            </p>
          </div>
          <ul className="text-xs text-slate-700 list-disc pl-5 space-y-1">
            <li>{isResolved ? "Rolled back" : "Roll back"} the offending upstream release and revalidate the source contract.</li>
            <li>{isResolved ? "Added" : "Add"} schema checks and fail-fast validation before job execution.</li>
            <li>{isResolved ? "Reduced" : "Reduce"} retry count to prevent repeated cost amplification during failures.</li>
          </ul>

          <div className="grid grid-cols-3 gap-2">
            <div className="text-center rounded border bg-slate-50 p-2">
              <p className="text-base font-bold text-slate-800 leading-tight">{daysOpen}d</p>
              <p className="text-[10px] text-muted-foreground">Days Open</p>
            </div>
            <div className="text-center rounded border bg-slate-50 p-2">
              <p className="text-base font-bold text-slate-800 leading-tight">{completedActions}</p>
              <p className="text-[10px] text-muted-foreground">Done</p>
            </div>
            <div className="text-center rounded border bg-slate-50 p-2">
              <p className="text-base font-bold text-slate-800 leading-tight">{totalActions}</p>
              <p className="text-[10px] text-muted-foreground">Total Actions</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] text-muted-foreground">Action items completion</p>
              <p className="text-[11px] font-medium text-slate-700">{completionPct}%</p>
            </div>
            <Progress value={completionPct} className="h-1.5" />
          </div>
        </div>

        {/* Recurring pattern */}
        {repeatEntry && (
          <div className="lg:col-span-2 rounded-md border border-amber-200 bg-amber-50 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-amber-600" />
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Recurring Pattern</p>
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${
                repeatEntry.count >= 5
                  ? "bg-red-100 text-red-700 border-red-200"
                  : "bg-amber-100 text-amber-700 border-amber-200"
              }`}>
                {repeatEntry.count}x
              </span>
            </div>
            <p className="text-sm text-amber-900 font-medium">{repeatEntry.pattern}</p>
            <p className="text-xs text-amber-700">Last occurrence: {fmt(repeatEntry.lastOccurrence)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Incidents() {
  const { data: summary } = useGetIncidentSummary();
  const { data: incidents } = useGetActiveIncidents();
  const [dateRange, setDateRange] = useState("today");
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!summary) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const mult = dateRange === "30d" ? 30 : dateRange === "7d" ? 7 : 1;
  const scaled = {
    p1: Math.round(summary.openByP1 * mult * 0.8),
    p2: Math.round(summary.openByP2 * mult * 0.9),
    p3: Math.round(summary.openByP3 * mult),
    p4: Math.round(summary.openByP4 * mult),
  };

  const priorityData = [
    { name: "P1", count: scaled.p1, fill: "#ef4444" },
    { name: "P2", count: scaled.p2, fill: "#f59e0b" },
    { name: "P3", count: scaled.p3, fill: "#3b82f6" },
    { name: "P4", count: scaled.p4, fill: "#94a3b8" },
  ];

  // Closed incidents to give us Resolved entries in the list/charts
  const closedIncidents: Incident[] = [
    {
      id: "INC-1034", title: "Sales order ingest schema drift",
      severity: "P2", status: "Resolved", pipeline: "sales_order_ingest",
      createdAt: "2026-04-12T05:10:00Z", owner: "Tom Hardy",
      acknowledged: true, escalationLevel: 1, age: "Closed",
    },
    {
      id: "INC-1033", title: "Treasury rates timeout after TLS upgrade",
      severity: "P1", status: "Resolved", pipeline: "fin_treasury_rates",
      createdAt: "2026-04-07T07:00:00Z", owner: "Sarah Chen",
      acknowledged: true, escalationLevel: 2, age: "Closed",
    },
    {
      id: "INC-1032", title: "Inventory backfill OOM hotfix verified",
      severity: "P1", status: "Resolved", pipeline: "ops_inventory_load",
      createdAt: "2026-04-06T06:15:00Z", owner: "Priya Patel",
      acknowledged: true, escalationLevel: 1, age: "Closed",
    },
  ];

  const activeRows: Incident[] = (incidents as Incident[] | undefined)?.filter((inc) => inc.status !== "Resolved") ?? [];
  const incidentRows: Incident[] = [...activeRows, ...closedIncidents];

  // Status pie data — count incidents grouped by status
  const statusCounts = incidentRows.reduce<Record<string, number>>((acc, inc) => {
    acc[inc.status] = (acc[inc.status] || 0) + 1;
    return acc;
  }, {});
  const statusOrder = ["Open", "Investigating", "Mitigating", "Monitoring", "Resolved"];
  const statusData = statusOrder
    .filter((s) => statusCounts[s])
    .map((s) => ({ name: s, value: statusCounts[s], fill: STATUS_COLOR[s] }));
  const totalIncidents = statusData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Incident Center</h2>
          <p className="text-xs text-muted-foreground">Active incidents and SLA tracking</p>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Charts row - frozen */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0">
        <Card>
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-sm font-medium">Incidents by Status</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3">
            <div className="grid grid-cols-[1fr_auto] items-center gap-3" style={{ height: 200 }}>
              <div className="relative h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={85}
                      paddingAngle={2}
                      stroke="#fff"
                      strokeWidth={2}
                      isAnimationActive={false}
                    >
                      {statusData.map((d) => (
                        <Cell key={d.name} fill={d.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [v, n]} contentStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-2xl font-bold text-slate-800 leading-none">{totalIncidents}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Total</p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 pr-2">
                {statusData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: d.fill }} />
                    <span className="text-slate-700">{d.name}</span>
                    <span className="text-muted-foreground ml-auto font-mono">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-sm font-medium">Open Incidents by Priority</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={priorityData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 11 }} cursor={{ fill: "#f1f5f9" }} />
                <Bar dataKey="count" name="Open Incidents" radius={[4, 4, 0, 0]}>
                  {priorityData.map((d) => (
                    <Cell key={d.name} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Active Incidents table - sliding window with sticky header */}
      <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <CardHeader className="pb-2 pt-3 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Active Incidents</CardTitle>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Open
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Investigating
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Resolved
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_rgb(226_232_240)]">
              <TableRow>
                <TableHead className="w-8 text-xs"></TableHead>
                <TableHead className="text-xs">ID</TableHead>
                <TableHead className="text-xs">Title</TableHead>
                <TableHead className="text-xs">Priority</TableHead>
                <TableHead className="text-xs">Pipeline</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Age</TableHead>
                <TableHead className="text-xs">Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidentRows.map((inc) => {
                const isExpanded = expanded === inc.id;
                return (
                  <Fragment key={inc.id}>
                    <TableRow
                      className={`group cursor-pointer ${isExpanded ? "bg-slate-50" : ""}`}
                      onClick={() => setExpanded(isExpanded ? null : inc.id)}
                    >
                      <TableCell className="py-2">
                        <button
                          type="button"
                          aria-label={isExpanded ? "Collapse details" : "Expand details"}
                          className="flex items-center justify-center h-5 w-5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          onClick={(e) => { e.stopPropagation(); setExpanded(isExpanded ? null : inc.id); }}
                        >
                          {isExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-primary py-2">{inc.id}</TableCell>
                      <TableCell className="py-2">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700 max-w-[280px]">
                          {inc.severity === "P1" && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
                          {inc.status === "Resolved" && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
                          <span className="truncate" title={inc.title}>{inc.title}</span>
                        </span>
                      </TableCell>
                      <TableCell className="py-2">{severityBadge(inc.severity)}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground py-2">{inc.pipeline}</TableCell>
                      <TableCell className="py-2">{statusBadge(inc.status)}</TableCell>
                      <TableCell className="text-xs py-2">
                        <span className="flex items-center gap-1 text-slate-600">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {inc.age}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        <span className="flex items-center gap-1 text-slate-600">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {inc.owner}
                        </span>
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={8} className="p-0">
                          <IncidentDetailSubsection incident={inc} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
