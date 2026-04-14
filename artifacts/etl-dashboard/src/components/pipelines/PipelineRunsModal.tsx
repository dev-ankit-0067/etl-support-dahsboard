import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  DollarSign,
  Database,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface PipelineRun {
  id: string;
  status: string;
  startTime: string;
  durationMin: number;
  cost: number;
  recordsProcessed: number;
  errorMessage: string | null;
}

interface Props {
  pipelineName: string | null;
  open: boolean;
  onClose: () => void;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "Success") return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
  if (status === "Failed") return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
  if (status === "Timed Out") return <Clock className="h-4 w-4 text-orange-500 shrink-0" />;
  if (status === "Running") return <Loader2 className="h-4 w-4 text-blue-500 shrink-0 animate-spin" />;
  if (status === "Delayed") return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />;
  return <Clock className="h-4 w-4 text-slate-400 shrink-0" />;
}

const STATUS_ROW_BG: Record<string, string> = {
  Failed: "bg-red-50/50",
  "Timed Out": "bg-orange-50/50",
  Success: "",
  Running: "bg-blue-50/30",
};

const STATUS_BAR_COLOR: Record<string, string> = {
  Failed: "#ef4444",
  "Timed Out": "#f97316",
  Running: "#3b82f6",
  Success: "#10b981",
  Delayed: "#f59e0b",
};

function fmtTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function fmtDuration(min: number) {
  if (min < 1) return `${Math.round(min * 60)}s`;
  const m = Math.floor(min);
  const s = Math.round((min - m) * 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function fmtRecords(n: number) {
  if (n === 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

export default function PipelineRunsModal({ pipelineName, open, onClose }: Props) {
  const { data: runs, isLoading } = useQuery<PipelineRun[]>({
    queryKey: ["pipeline-history", pipelineName],
    queryFn: async () => {
      const res = await fetch(`/api/pipelines/history/${pipelineName}`);
      if (!res.ok) throw new Error("Failed to load pipeline history");
      return res.json();
    },
    enabled: open && !!pipelineName,
  });

  const totalCost = runs?.reduce((s, r) => s + r.cost, 0) ?? 0;
  const avgDuration = runs && runs.length > 0
    ? runs.reduce((s, r) => s + r.durationMin, 0) / runs.length
    : 0;
  const successRate = runs && runs.length > 0
    ? Math.round((runs.filter((r) => r.status === "Success").length / runs.length) * 100)
    : 0;

  const chartData = runs?.map((r, i) => ({
    label: `Run ${runs.length - i}`,
    duration: Math.round(r.durationMin * 10) / 10,
    cost: r.cost,
    status: r.status,
  })).reverse() ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-slate-50 rounded-t-lg">
          <div>
            <DialogTitle className="text-base font-mono text-slate-700">{pipelineName}</DialogTitle>
            <p className="text-sm text-muted-foreground mt-0.5">Last 5 pipeline runs — timings and cost</p>
          </div>
        </DialogHeader>

        {isLoading || !runs ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            Loading run history...
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5">
            {/* Summary KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-slate-50 p-3 text-center">
                <p className="text-lg font-bold text-slate-800">{successRate}%</p>
                <p className="text-xs text-muted-foreground">Success Rate</p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-3 text-center">
                <p className="text-lg font-bold text-slate-800">{fmtDuration(avgDuration)}</p>
                <p className="text-xs text-muted-foreground">Avg Duration</p>
              </div>
              <div className="rounded-lg border bg-slate-50 p-3 text-center">
                <p className="text-lg font-bold text-slate-800">${totalCost.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Total Cost (5 runs)</p>
              </div>
            </div>

            {/* Duration bar chart */}
            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">Duration per Run (min)</p>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={chartData} margin={{ left: -20 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="m" />
                  <Tooltip
                    formatter={(val: number) => [`${val}m`, "Duration"]}
                    labelStyle={{ fontSize: 11 }}
                    contentStyle={{ fontSize: 11 }}
                  />
                  <Bar dataKey="duration" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={STATUS_BAR_COLOR[entry.status] ?? "#94a3b8"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <Separator />

            {/* Run detail rows */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600 uppercase tracking-wide">Run Details</p>
              {runs.map((run) => (
                <div key={run.id} className={`rounded-lg border p-3 space-y-2 ${STATUS_ROW_BG[run.status] ?? ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusIcon status={run.status} />
                      <span className="text-xs font-mono font-medium text-slate-600 shrink-0">{run.id}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border ${
                        run.status === "Success"   ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                        run.status === "Failed"    ? "bg-red-100 text-red-700 border-red-200" :
                        run.status === "Timed Out" ? "bg-orange-100 text-orange-700 border-orange-200" :
                        run.status === "Running"   ? "bg-blue-100 text-blue-700 border-blue-200" :
                                                     "bg-slate-100 text-slate-600 border-slate-200"
                      }`}>{run.status}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{fmtTime(run.startTime)}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span>{fmtDuration(run.durationMin)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <DollarSign className="h-3 w-3 text-muted-foreground" />
                      <span>${run.cost.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Database className="h-3 w-3 text-muted-foreground" />
                      <span>{fmtRecords(run.recordsProcessed)} records</span>
                    </div>
                  </div>

                  {run.errorMessage && (
                    <div className="rounded bg-red-50 border border-red-100 px-2 py-1.5">
                      <p className="text-[11px] font-mono text-red-700 break-all">{run.errorMessage}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
