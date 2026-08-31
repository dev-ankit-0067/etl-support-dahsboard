import { Fragment, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useGetOverviewKpis,
  useGetPipelineRuns,
} from "@workspace/api-client-react";
import { useAccount } from "@/contexts/AccountContext";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import CloudWatchLogViewer from "@/components/CloudWatchLogViewer";
import LogAnalysisModal from "@/components/LogAnalysisModal";
import { useAuth } from "@/contexts/AuthContext";
import {
  CheckCircle2,
  XCircle,
  Briefcase,
  Clock,
  DollarSign,
  Plus,
  Minus,
  AlertCircle,
  Cpu,
  FileText,
  Sparkles,
  TicketPlus,
  Loader2,
  ExternalLink,
} from "lucide-react";

interface JobRun {
  id: string;
  pipelineName: string;
  status: string;
  startTime: string;
  endTime: string;
  duration: string;
  costPerRun: number;
}

interface LambdaRun {
  id: string;
  functionName: string;
  status: string;
  startTime: string;
  endTime: string;
  duration: string;
  costPerRun: number;
}

interface LambdaKpis {
  totalFunctions: number;
  healthy: number;
  withErrors: number;
}

interface RunHistoryItem {
  id: string;
  status: string;
  startTime: string;
  durationMin: number;
  cost: number;
  recordsProcessed: number;
  errorMessage: string | null;
}

const DATE_MULTIPLIERS: Record<string, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  "60d": 60,
  "90d": 90,
};

// Resource types selectable in the header dropdown.
type ResType = "glue" | "lambda" | "emr" | "emr_serverless" | "s3";

// Maps the UI resource type to the backend agent/log resource_type.
const AGENT_RESOURCE: Record<ResType, "job" | "lambda" | "emr" | "emr_serverless" | "s3"> = {
  glue: "job",
  lambda: "lambda",
  emr: "emr",
  emr_serverless: "emr_serverless",
  s3: "s3",
};

interface ResourceConfig {
  label: string;
  runsUrl: string | null; // null → Glue uses the useGetPipelineRuns hook
  historyBase: string;
  desc: string;
  totalLabel: string;
  healthyLabel: string;
  failedLabel: string;
  totalSubtitle: string;
  tableTitle: string;
  nameHeader: string;
  costHeader: string;
  emptyNoun: string;
}

const RESOURCE_CONFIG: Record<ResType, ResourceConfig> = {
  glue: {
    label: "Glue", runsUrl: null, historyBase: "/api/pipelines/history",
    desc: "Glue job health and key performance indicators",
    totalLabel: "Total Jobs", healthyLabel: "Healthy Jobs", failedLabel: "Failed Jobs",
    totalSubtitle: "Across all Glue jobs", tableTitle: "Active Jobs",
    nameHeader: "Job Name", costHeader: "Cost/Run", emptyNoun: "jobs",
  },
  lambda: {
    label: "Lambda", runsUrl: "/api/lambdas/runs", historyBase: "/api/lambdas/history",
    desc: "Lambda function health and key performance indicators",
    totalLabel: "Total Functions", healthyLabel: "Healthy Functions", failedLabel: "Functions with Errors",
    totalSubtitle: "Across all Lambda functions", tableTitle: "Active Invocations",
    nameHeader: "Function Name", costHeader: "Cost/Invocation", emptyNoun: "invocations",
  },
  emr: {
    label: "EMR", runsUrl: "/api/emr/runs", historyBase: "/api/emr/history",
    desc: "EMR cluster health and key performance indicators",
    totalLabel: "Total Clusters", healthyLabel: "Healthy Clusters", failedLabel: "Failed Clusters",
    totalSubtitle: "Across all EMR clusters", tableTitle: "Active Clusters",
    nameHeader: "Cluster Name", costHeader: "Cost/Run", emptyNoun: "clusters",
  },
  emr_serverless: {
    label: "EMR Serverless", runsUrl: "/api/emr-serverless/runs", historyBase: "/api/emr-serverless/history",
    desc: "EMR Serverless health and key performance indicators",
    totalLabel: "Total Applications", healthyLabel: "Healthy Applications", failedLabel: "Failed Applications",
    totalSubtitle: "Across all EMR Serverless apps", tableTitle: "Active Applications",
    nameHeader: "Application Name", costHeader: "Cost/Run", emptyNoun: "applications",
  },
  s3: {
    label: "S3", runsUrl: "/api/s3/runs", historyBase: "",
    desc: "Custom S3 log files and AI analysis",
    totalLabel: "Total Log Files", healthyLabel: "Latest File", failedLabel: "Projects",
    totalSubtitle: "Under the selected project prefix", tableTitle: "S3 Log Files",
    nameHeader: "Run ID", costHeader: "Size", emptyNoun: "log files",
  },
};

// Runs returned by the non-Glue endpoints (Lambda uses functionName, EMR uses pipelineName).
interface ResourceRun {
  id: string;
  pipelineName?: string;
  functionName?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  duration?: string;
  costPerRun?: number;
  // S3 log objects (/api/s3/runs)
  runId?: string;
  project?: string;
  lastModified?: string;
  sizeBytes?: number;
}

// Log → incident ticket link (GET /api/ticket-mappings).
interface TicketLink {
  incidentId: string;
  provider?: string;
  url?: string | null;
  resourceType?: string | null;
  createdAt?: string | null;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    Running: "bg-blue-100 text-blue-700 border-blue-200",
    Success: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Failed: "bg-red-100 text-red-700 border-red-200",
    Delayed: "bg-amber-100 text-amber-700 border-amber-200",
    Waiting: "bg-slate-100 text-slate-600 border-slate-200",
    "Timed Out": "bg-orange-100 text-orange-700 border-orange-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${map[status] || map.Waiting}`}
    >
      {status}
    </span>
  );
}

function fmtTime(iso: string) {
  return iso
    ? new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
}

function fmtMs(ms: number) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function filterRunsByDateRange<T extends { startTime: string }>(
  runs: T[],
  dateRange: string,
): T[] {
  if (!Array.isArray(runs)) return [];
  const now = new Date();
  let cutoffTime: Date;

  switch (dateRange) {
    case "today":
      cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      cutoffTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "60d":
      cutoffTime = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      cutoffTime = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      return runs;
  }

  return runs.filter((run) => {
    try {
      const runTime = new Date(run.startTime);
      return runTime >= cutoffTime;
    } catch {
      return false;
    }
  });
}

interface JobHistorySubsectionProps {
  jobName: string;
  historyBase: string;
  onAnalyzeLogs: (runId: string) => void;
  onGetRca: (runId: string) => void;
  onLogJiraTicket: (runId: string) => void;
}

function JobHistorySubsection({ jobName, historyBase, onAnalyzeLogs, onGetRca, onLogJiraTicket }: JobHistorySubsectionProps) {
  const { incidentProviderLabel } = useAuth();
  const { data, isLoading } = useQuery<RunHistoryItem[]>({
    queryKey: ["run-history", historyBase, jobName],
    queryFn: async () => {
      const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      const res = await apiFetch(`${base}${historyBase}/${jobName}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  if (isLoading || !data) {
    return (
      <div className="px-6 py-4 text-xs text-muted-foreground">
        Loading run history…
      </div>
    );
  }

  // Sort by start time descending (most recent first) and take last 5 runs
  const recentRuns = data
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 5);

  const totalCost = recentRuns.reduce((s, r) => s + r.cost, 0);
  const success = recentRuns.filter((r) => r.status === "Success").length;
  const successRate = recentRuns.length
    ? Math.round((success / recentRuns.length) * 100)
    : 0;
  const avgDur = recentRuns.length
    ? recentRuns.reduce((s, r) => s + r.durationMin, 0) / recentRuns.length
    : 0;

  return (
    <div className="bg-slate-50 border-t border-b">
      <div className="px-6 py-3 border-b bg-white/60 flex items-center gap-6 text-xs">
        <span className="font-mono text-slate-700">{jobName}</span>
        <span className="text-muted-foreground">
          Success rate:{" "}
          <span className="font-semibold text-slate-700">{successRate}%</span>
        </span>
        <span className="text-muted-foreground">
          Avg duration:{" "}
          <span className="font-semibold text-slate-700">
            {avgDur.toFixed(1)}m
          </span>
        </span>
        <span className="text-muted-foreground">
          Total cost (last 5 runs):{" "}
          <span className="font-semibold text-slate-700">
            ${totalCost.toFixed(2)}
          </span>
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-100/60 hover:bg-slate-100/60">
            <TableHead className="text-[11px] uppercase tracking-wide text-slate-500">
              Run ID
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wide text-slate-500">
              Status
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wide text-slate-500">
              Start Time
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wide text-slate-500">
              Duration
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wide text-slate-500 text-right">
              Cost
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wide text-slate-500">
              Error
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wide text-slate-500 text-center">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recentRuns.map((r) => (
            <TableRow key={r.id} className="hover:bg-white">
              <TableCell className="text-xs font-mono text-muted-foreground">
                {r.id}
              </TableCell>
              <TableCell>{statusBadge(r.status)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(r.startTime).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </TableCell>
              <TableCell className="text-xs">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {r.durationMin.toFixed(1)}m
                </span>
              </TableCell>
              <TableCell className="text-xs text-right font-mono">
                ${r.cost.toFixed(2)}
              </TableCell>
              <TableCell className="text-[11px] text-red-600 font-mono max-w-[280px] truncate">
                {r.errorMessage ? (
                  <span className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span className="truncate" title={r.errorMessage}>
                      {r.errorMessage}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-1.5"
                    onClick={() => onAnalyzeLogs(r.id)}
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    Logs
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                    onClick={() => onGetRca(r.id)}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    Get RCA
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-1.5 text-violet-600 border-violet-200 hover:bg-violet-50"
                    onClick={() => onLogJiraTicket(r.id)}
                  >
                    <TicketPlus className="h-3 w-3 mr-1" />
                    Log {incidentProviderLabel}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface LambdaHistoryItem {
  id: string;
  status: string;
  startTime: string;
  durationMs: number;
  cost: number;
  memoryMb: number;
  errorMessage: string | null;
}

interface LambdaHistorySubsectionProps {
  functionName: string;
  onAnalyzeLogs: (invocationId: string) => void;
  onGetRca: (invocationId: string) => void;
  onLogJiraTicket: (invocationId: string) => void;
}

function LambdaHistorySubsection({ functionName, onAnalyzeLogs, onGetRca, onLogJiraTicket }: LambdaHistorySubsectionProps) {
  const { incidentProviderLabel } = useAuth();
  const { data, isLoading } = useQuery<LambdaHistoryItem[]>({
    queryKey: ["lambda-history", functionName],
    queryFn: async () => {
      const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      const res = await apiFetch(`${base}/api/lambdas/history/${functionName}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  if (isLoading || !data) {
    return (
      <div className="px-6 py-4 text-xs text-muted-foreground">
        Loading invocation history…
      </div>
    );
  }

  // Sort by start time descending (most recent first) and take last 5 runs
  const recentRuns = data
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 5);

  const totalCost = recentRuns.reduce((s, r) => s + r.cost, 0);
  const success = recentRuns.filter((r) => r.status === "Success").length;
  const successRate = recentRuns.length
    ? Math.round((success / recentRuns.length) * 100)
    : 0;
  const avgMs = recentRuns.length
    ? recentRuns.reduce((s, r) => s + r.durationMs, 0) / recentRuns.length
    : 0;

  return (
    <div className="bg-slate-50 border-t border-b">
      <div className="px-6 py-3 border-b bg-white/60 flex items-center gap-6 text-xs">
        <span className="font-mono text-slate-700">{functionName}</span>
        <span className="text-muted-foreground">
          Success rate:{" "}
          <span className="font-semibold text-slate-700">{successRate}%</span>
        </span>
        <span className="text-muted-foreground">
          Avg duration:{" "}
          <span className="font-semibold text-slate-700">
            {fmtMs(Math.round(avgMs))}
          </span>
        </span>
        <span className="text-muted-foreground">
          Total cost (last 5 runs):{" "}
          <span className="font-semibold text-slate-700">
            ${totalCost.toFixed(4)}
          </span>
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-100/60 hover:bg-slate-100/60">
            <TableHead className="text-[11px] uppercase tracking-wide text-slate-500">
              Invocation ID
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wide text-slate-500">
              Status
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wide text-slate-500">
              Start Time
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wide text-slate-500">
              Duration
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wide text-slate-500">
              Memory
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wide text-slate-500 text-right">
              Cost
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wide text-slate-500">
              Error
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wide text-slate-500 text-center">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recentRuns.map((r) => (
            <TableRow key={r.id} className="hover:bg-white">
              <TableCell className="text-xs font-mono text-muted-foreground">
                {r.id}
              </TableCell>
              <TableCell>{statusBadge(r.status)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(r.startTime).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </TableCell>
              <TableCell className="text-xs">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {fmtMs(r.durationMs)}
                </span>
              </TableCell>
              <TableCell className="text-xs">
                <span className="flex items-center gap-1">
                  <Cpu className="h-3 w-3 text-muted-foreground" />
                  {r.memoryMb} MB
                </span>
              </TableCell>
              <TableCell className="text-xs text-right font-mono">
                ${r.cost.toFixed(4)}
              </TableCell>
              <TableCell className="text-[11px] text-red-600 font-mono max-w-[280px] truncate">
                {r.errorMessage ? (
                  <span className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span className="truncate" title={r.errorMessage}>
                      {r.errorMessage}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-1.5"
                    onClick={() => onAnalyzeLogs(r.id)}
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    Logs
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                    onClick={() => onGetRca(r.id)}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    Get RCA
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-1.5 text-violet-600 border-violet-200 hover:bg-violet-50"
                    onClick={() => onLogJiraTicket(r.id)}
                  >
                    <TicketPlus className="h-3 w-3 mr-1" />
                    Log {incidentProviderLabel}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function fmtBytes(n?: number): string {
  if (n === undefined || n === null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// S3 log source: an adapted list of log files under s3://<bucket>/<project>/ with
// per-file Analyze / RCA / ticket actions (no run status/cost — S3 has none).
function S3LogsSection({
  runs,
  dateRange,
  tickets,
  onAnalyzeLogs,
  onGetRca,
  onLogJiraTicket,
}: {
  runs: ResourceRun[];
  dateRange: string;
  tickets: Record<string, TicketLink>;
  onAnalyzeLogs: (id: string, name: string) => void;
  onGetRca: (id: string) => void;
  onLogJiraTicket: (id: string) => void;
}) {
  const { incidentProviderLabel } = useAuth();
  // Filter by lastModified via the shared date-range helper.
  const filtered = filterRunsByDateRange(
    runs.map((r) => ({ ...r, startTime: r.lastModified ?? "" })),
    dateRange,
  );
  const totalFiles = filtered.length;
  const projectCount = new Set(filtered.map((r) => r.project).filter(Boolean)).size;
  const latest = filtered.reduce<string>(
    (acc, r) => (r.lastModified && r.lastModified > acc ? r.lastModified : acc),
    "",
  );

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Log Files</p>
                <p className="text-2xl font-bold text-slate-800 leading-tight">{totalFiles.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">Under the selected project prefix</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-50"><FileText className="h-5 w-5 text-blue-500" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Latest File</p>
                <p className="text-lg font-bold text-slate-800 leading-tight">{latest ? fmtTime(latest) : "—"}</p>
                <p className="text-[10px] text-muted-foreground">Most recently modified log</p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-50"><Clock className="h-5 w-5 text-emerald-500" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Projects</p>
                <p className="text-2xl font-bold text-slate-800 leading-tight">{projectCount.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">Distinct project prefixes</p>
              </div>
              <div className="p-2 rounded-lg bg-violet-50"><Briefcase className="h-5 w-5 text-violet-500" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <CardHeader className="pb-2 pt-3 shrink-0">
          <CardTitle className="text-sm font-medium">S3 Log Files</CardTitle>
        </CardHeader>
        <CardContent className="p-0 flex-1 min-h-0 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_rgb(226_232_240)]">
              <TableRow>
                <TableHead className="text-xs">Run ID</TableHead>
                <TableHead className="text-xs">Project</TableHead>
                <TableHead className="text-xs">Last Modified</TableHead>
                <TableHead className="text-xs text-right">Size</TableHead>
                <TableHead className="text-xs">Ticket</TableHead>
                <TableHead className="text-xs text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8">
                    <div className="flex items-center justify-center text-muted-foreground text-sm">
                      No log files in selected period
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="py-2">
                      <span className="text-xs font-medium text-slate-700 break-all">{r.runId ?? r.id}</span>
                    </TableCell>
                    <TableCell className="py-2">
                      <span className="text-xs text-muted-foreground">{r.project || "—"}</span>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">{fmtTime(r.lastModified ?? "")}</TableCell>
                    <TableCell className="py-2 text-xs text-right font-mono">{fmtBytes(r.sizeBytes)}</TableCell>
                    <TableCell className="py-2">
                      {(() => {
                        const t = tickets[r.id];
                        return t ? (
                          t.url ? (
                            <a
                              href={t.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {t.incidentId}
                            </a>
                          ) : (
                            <span className="text-xs font-medium text-slate-500">{t.incidentId}</span>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5" onClick={() => onAnalyzeLogs(r.id, r.runId ?? r.id)}>
                          <FileText className="h-3 w-3 mr-1" />Logs
                        </Button>
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5 text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => onGetRca(r.id)}>
                          <Sparkles className="h-3 w-3 mr-1" />Get RCA
                        </Button>
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5 text-violet-600 border-violet-200 hover:bg-violet-50" onClick={() => onLogJiraTicket(r.id)}>
                          <TicketPlus className="h-3 w-3 mr-1" />Log {incidentProviderLabel}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export default function ExecutiveOverview() {
  const { data: kpis } = useGetOverviewKpis();
  const { data: runs } = useGetPipelineRuns();
  const { account, projectLabels } = useAccount();
  const [dateRange, setDateRange] = useState("today");
  const [resourceType, setResourceType] = useState<ResType>("glue");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJobName, setSelectedJobName] = useState<string | null>(null);

  // Log Analysis modal state
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<"log" | "jira">("log");
  const [analysisLogId, setAnalysisLogId] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<{
    log_id: string; type: string; analysis: string; jira_key?: string | null;
  } | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const callAgentsApi = async (logId: string, mode: "log" | "jira", resource: "job" | "lambda" | "emr" | "emr_serverless" | "s3" = "job") => {
    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    setAnalysisMode(mode);
    setAnalysisLogId(logId);
    setAnalysisResult(null);
    setAnalysisError(null);
    setAnalysisLoading(true);
    setAnalysisOpen(true);
    try {
      const res = await apiFetch(`${base}/api/agents/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_id: logId, type: mode, resource_type: resource }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setAnalysisResult(data);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setAnalysisLoading(false);
    }
  };

  // Reset expansion when switching account
  useEffect(() => {
    setExpanded(null);
  }, [account.id]);

  // Non-Glue resources (Lambda / EMR / EMR Serverless) load their rows from the matching API.
  const [resourceRuns, setResourceRuns] = useState<ResourceRun[]>([]);
  // Blocks the page with a loading overlay while a newly-selected resource loads.
  const [resourceLoading, setResourceLoading] = useState(false);
  // Log → incident ticket links (Jira/ServiceNow) keyed by log id.
  const [tickets, setTickets] = useState<Record<string, TicketLink>>({});

  useEffect(() => {
    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    apiFetch(`${base}/api/ticket-mappings`)
      .then((r) => r.json())
      .then((d) =>
        setTickets(d?.mappings && typeof d.mappings === "object" ? d.mappings : {}),
      )
      .catch(() => setTickets({}));
  }, []);

  useEffect(() => {
    const cfg = RESOURCE_CONFIG[resourceType];
    if (!cfg.runsUrl) {
      setResourceRuns([]);
      setResourceLoading(false);
      return;
    }
    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    setResourceLoading(true);
    apiFetch(`${base}${cfg.runsUrl}`)
      .then((r) => r.json())
      .then((runs) => setResourceRuns(Array.isArray(runs) ? runs : []))
      .catch(() => setResourceRuns([]))
      .finally(() => setResourceLoading(false));
  }, [resourceType, account.id]);

  // Date-range changes filter the loaded runs client-side (no fetch), so briefly
  // show the same blocking overlay for consistent feedback.
  const dateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDateRangeChange = (v: string) => {
    if (v === dateRange) return;
    setDateRange(v);
    setResourceLoading(true);
    if (dateTimer.current) clearTimeout(dateTimer.current);
    dateTimer.current = setTimeout(() => setResourceLoading(false), 400);
  };

  // Reset expansion when switching resource types
  useEffect(() => {
    setExpanded(null);
  }, [resourceType]);

  if (!kpis)
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading...
      </div>
    );

  const cfg = RESOURCE_CONFIG[resourceType];
  const isGlue = resourceType === "glue";
  const isLambda = resourceType === "lambda";
  const isS3 = resourceType === "s3";
  // Custom per-project label for the S3 log source (remote config `s3LogLabel`).
  const s3Label = projectLabels[account.id] || "S3";
  const resourceLabel = isS3 ? s3Label : cfg.label;

  const jobRuns: JobRun[] = (Array.isArray(runs) ? runs : []) as unknown as JobRun[];

  type NormRun = {
    id: string; name: string; status: string;
    startTime: string; endTime: string; duration: string; cost: number;
  };
  // Normalise the selected resource's runs to a common shape.
  const normalized: NormRun[] = isGlue
    ? jobRuns.map((r) => ({
        id: r.id, name: r.pipelineName, status: r.status,
        startTime: r.startTime, endTime: r.endTime, duration: r.duration, cost: r.costPerRun,
      }))
    : resourceRuns.map((r) => ({
        id: r.id, name: r.pipelineName ?? r.functionName ?? r.id, status: r.status ?? "",
        startTime: r.startTime ?? "", endTime: r.endTime ?? "", duration: r.duration ?? "", cost: r.costPerRun ?? 0,
      }));

  const filteredRuns = filterRunsByDateRange(normalized, dateRange);

  // Group by resource name, keep the latest run for each.
  const latestByName: NormRun[] = Object.values(
    filteredRuns.reduce((acc, run) => {
      if (!acc[run.name] || new Date(run.startTime) > new Date(acc[run.name].startTime)) {
        acc[run.name] = run;
      }
      return acc;
    }, {} as Record<string, NormRun>),
  );

  const totalCount = latestByName.length;
  const healthyCount = latestByName.filter((r) => r.status === "Success").length;
  const failedCount = latestByName.filter((r) => r.status === "Failed" || r.status === "Timed Out").length;

  const totalLabel = cfg.totalLabel;
  const healthyLabel = cfg.healthyLabel;
  const failedLabel = cfg.failedLabel;
  const totalSubtitle = cfg.totalSubtitle;
  const tableTitle = cfg.tableTitle;
  const nameHeader = cfg.nameHeader;
  const costHeader = cfg.costHeader;

  type Row = NormRun & { expandable: boolean };
  // Filtering is done server-side by the selected project (X-Project header).
  const rows: Row[] = latestByName.map((r) => ({ ...r, expandable: true }));

  return (
    <div className="relative flex flex-col h-[calc(100vh-7rem)] gap-3">
      {/* Loading overlay — disables the page while a newly-selected resource loads */}
      {resourceLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white/70 backdrop-blur-sm">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Loading {resourceLabel}…
          </p>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            Executive Overview
          </h2>
          <p className="text-xs text-muted-foreground">{cfg.desc}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={resourceType}
            onValueChange={(v) => {
              const next = v as ResType;
              if (next === resourceType) return;
              // Show the loading overlay immediately for resources that fetch on switch.
              if (RESOURCE_CONFIG[next].runsUrl) setResourceLoading(true);
              setResourceType(next);
            }}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="glue">Glue</SelectItem>
              <SelectItem value="lambda">Lambda</SelectItem>
              <SelectItem value="emr">EMR</SelectItem>
              <SelectItem value="emr_serverless">EMR Serverless</SelectItem>
              <SelectItem value="s3">{s3Label}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={handleDateRangeChange}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="60d">Last 60 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isS3 ? (
        <S3LogsSection
          runs={resourceRuns}
          dateRange={dateRange}
          tickets={tickets}
          onAnalyzeLogs={(id, name) => {
            setSelectedJobId(id);
            setSelectedJobName(name);
            setLogsModalOpen(true);
          }}
          onGetRca={(id) => callAgentsApi(id, "log", "s3")}
          onLogJiraTicket={(id) => callAgentsApi(id, "jira", "s3")}
        />
      ) : (
      <>
      {/* KPI tiles - frozen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {totalLabel}
                </p>
                <p className="text-2xl font-bold text-slate-800 leading-tight">
                  {totalCount.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {totalSubtitle}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-blue-50">
                <Briefcase className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {healthyLabel}
                </p>
                <p className="text-2xl font-bold text-emerald-600 leading-tight">
                  {healthyCount.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {totalCount > 0
                    ? Math.round((healthyCount / totalCount) * 100)
                    : 0}
                  % success rate
                </p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-50">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  {failedLabel}
                </p>
                <p className="text-2xl font-bold text-red-600 leading-tight">
                  {failedCount.toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {totalCount > 0
                    ? Math.round((failedCount / totalCount) * 100)
                    : 0}
                  % failure rate
                </p>
              </div>
              <div className="p-2 rounded-lg bg-red-50">
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Jobs - fills remaining height, scrolls internally */}
      <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <CardHeader className="pb-2 pt-3 shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">{tableTitle}</CardTitle>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />{" "}
                Running
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />{" "}
                Success
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{" "}
                Failed
              </span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 flex-1 min-h-0 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_rgb(226_232_240)]">
              <TableRow>
                <TableHead className="w-8 text-xs"></TableHead>
                <TableHead className="text-xs">{nameHeader}</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Start Time</TableHead>
                <TableHead className="text-xs">End Time</TableHead>
                <TableHead className="text-xs">Duration</TableHead>
                <TableHead className="text-xs text-right">
                  <span className="flex items-center justify-end gap-1">
                    <DollarSign className="h-3 w-3" />
                    {costHeader}
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8">
                    <div className="flex items-center justify-center text-muted-foreground text-sm">
                      {dateRange === "today"
                        ? `No ${cfg.emptyNoun} run today`
                        : `No ${cfg.emptyNoun} in selected period`}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const isExpanded = expanded === row.name;
                  return (
                    <Fragment key={row.id}>
                      <TableRow
                        className={`group ${row.expandable ? "cursor-pointer" : ""} ${isExpanded ? "bg-slate-50" : ""}`}
                        onClick={() =>
                          row.expandable &&
                          setExpanded(isExpanded ? null : row.name)
                        }
                      >
                        <TableCell className="py-2">
                          {row.expandable ? (
                            <button
                              type="button"
                              aria-label={
                                isExpanded ? "Collapse details" : "Expand details"
                              }
                              className="flex items-center justify-center h-5 w-5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpanded(isExpanded ? null : row.name);
                              }}
                            >
                              {isExpanded ? (
                                <Minus className="h-3 w-3" />
                              ) : (
                                <Plus className="h-3 w-3" />
                              )}
                            </button>
                          ) : null}
                        </TableCell>
                        <TableCell className="py-2">
                          <span
                            className={`text-xs font-medium ${row.expandable ? "text-primary" : "text-slate-700"}`}
                          >
                            {row.name}
                          </span>
                        </TableCell>
                        <TableCell className="py-2">
                          {statusBadge(row.status)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2">
                          {fmtTime(row.startTime)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2">
                          {fmtTime(row.endTime)}
                        </TableCell>
                        <TableCell className="text-xs py-2">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {row.duration}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono py-2">
                          {row.cost > 0 ? (
                            <span className="font-medium text-slate-700">
                              $
                              {isLambda
                                ? row.cost.toFixed(4)
                                : row.cost.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && row.expandable && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={7} className="p-0">
                            {isLambda ? (
                              <LambdaHistorySubsection
                                functionName={row.name}
                                onAnalyzeLogs={(invocationId) => {
                                  setSelectedJobId(invocationId);
                                  setSelectedJobName(row.name);
                                  setLogsModalOpen(true);
                                }}
                                onGetRca={() => callAgentsApi(row.name, "log", "lambda")}
                                onLogJiraTicket={() => callAgentsApi(row.name, "jira", "lambda")}
                              />
                            ) : (
                              <JobHistorySubsection
                                jobName={row.name}
                                historyBase={cfg.historyBase}
                                onAnalyzeLogs={(runId) => {
                                  setSelectedJobId(runId);
                                  setSelectedJobName(row.name);
                                  setLogsModalOpen(true);
                                }}
                                onGetRca={(runId) => callAgentsApi(runId, "log", AGENT_RESOURCE[resourceType])}
                                onLogJiraTicket={(runId) => callAgentsApi(runId, "jira", AGENT_RESOURCE[resourceType])}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </>
      )}

      {/* CloudWatch Log Viewer Modal */}
      <CloudWatchLogViewer
        jobId={selectedJobId}
        jobName={selectedJobName}
        resourceType={AGENT_RESOURCE[resourceType]}
        open={logsModalOpen}
        onClose={() => {
          setLogsModalOpen(false);
          setSelectedJobId(null);
          setSelectedJobName(null);
        }}
      />

      {/* Log Analysis Modal (RCA / Jira) */}
      <LogAnalysisModal
        open={analysisOpen}
        onClose={() => {
          setAnalysisOpen(false);
          setAnalysisLogId(null);
          setAnalysisResult(null);
          setAnalysisError(null);
        }}
        logId={analysisLogId}
        mode={analysisMode}
        isLoading={analysisLoading}
        result={analysisResult}
        error={analysisError}
      />
    </div>
  );
}
