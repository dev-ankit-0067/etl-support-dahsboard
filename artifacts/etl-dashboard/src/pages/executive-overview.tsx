import { useState } from "react";
import { useGetOverviewKpis, useGetPipelineRuns } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, Briefcase, Clock, DollarSign } from "lucide-react";
import PipelineRunsModal from "@/components/pipelines/PipelineRunsModal";

interface JobRun {
  id: string;
  pipelineName: string;
  status: string;
  startTime: string;
  endTime: string;
  duration: string;
  domain: string;
  costPerRun: number;
}

const DATE_MULTIPLIERS: Record<string, number> = {
  today: 1,
  "7d": 7,
  "30d": 30,
};

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
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[status] || map.Waiting}`}>
      {status}
    </span>
  );
}

export default function ExecutiveOverview() {
  const { data: kpis } = useGetOverviewKpis();
  const { data: runs } = useGetPipelineRuns();
  const [dateRange, setDateRange] = useState("today");
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null);

  if (!kpis) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const mult = DATE_MULTIPLIERS[dateRange] ?? 1;
  const totalJobs = Math.round(kpis.totalPipelines * mult * (dateRange === "today" ? 1 : 0.9));
  const healthyJobs = Math.round(kpis.healthy * mult * (dateRange === "today" ? 1 : 0.88));
  const failedJobs = Math.round((kpis.failed + kpis.degraded) * mult * (dateRange === "today" ? 1 : 1.05));

  const jobRuns: JobRun[] = (runs as JobRun[] | undefined) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Executive Overview</h2>
          <p className="text-muted-foreground">Job health and key performance indicators</p>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Total Jobs</p>
                <p className="text-3xl font-bold text-slate-800">{totalJobs.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Across all pipelines</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50">
                <Briefcase className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Healthy Jobs</p>
                <p className="text-3xl font-bold text-emerald-600">{healthyJobs.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalJobs > 0 ? Math.round((healthyJobs / totalJobs) * 100) : 0}% success rate
                </p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Failed Jobs</p>
                <p className="text-3xl font-bold text-red-600">{failedJobs.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalJobs > 0 ? Math.round((failedJobs / totalJobs) * 100) : 0}% failure rate
                </p>
              </div>
              <div className="p-3 rounded-xl bg-red-50">
                <XCircle className="h-6 w-6 text-red-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Running
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Success
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Failed
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Job ID</TableHead>
                <TableHead className="text-xs">Pipeline</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Domain</TableHead>
                <TableHead className="text-xs">Start Time</TableHead>
                <TableHead className="text-xs">End Time</TableHead>
                <TableHead className="text-xs">Duration</TableHead>
                <TableHead className="text-xs text-right">
                  <span className="flex items-center justify-end gap-1">
                    <DollarSign className="h-3 w-3" />
                    Cost/Run
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobRuns.map((run) => (
                <TableRow key={run.id} className="group">
                  <TableCell className="text-xs font-mono text-muted-foreground">{run.id}</TableCell>
                  <TableCell>
                    <button
                      className="text-xs font-medium text-primary underline-offset-2 hover:underline cursor-pointer text-left"
                      onClick={() => setSelectedPipeline(run.pipelineName)}
                    >
                      {run.pipelineName}
                    </button>
                  </TableCell>
                  <TableCell>{statusBadge(run.status)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">{run.domain}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {run.startTime ? new Date(run.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {run.endTime ? new Date(run.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      {run.duration}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono">
                    {run.costPerRun > 0 ? (
                      <span className="font-medium text-slate-700">${run.costPerRun.toFixed(2)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PipelineRunsModal
        pipelineName={selectedPipeline}
        open={!!selectedPipeline}
        onClose={() => setSelectedPipeline(null)}
      />
    </div>
  );
}
