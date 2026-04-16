import { useState } from "react";
import { useGetLivePipelines, useGetPipelineRuns } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Play, XCircle, Clock, AlertTriangle, Loader2 } from "lucide-react";
import PipelineRunsModal from "@/components/pipelines/PipelineRunsModal";

function StatusWidget({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string }> = {
    Running: { bg: "bg-blue-100 border-blue-200", text: "text-blue-700" },
    Success: { bg: "bg-emerald-100 border-emerald-200", text: "text-emerald-700" },
    Failed: { bg: "bg-red-100 border-red-200", text: "text-red-700" },
    Delayed: { bg: "bg-amber-100 border-amber-200", text: "text-amber-700" },
    Waiting: { bg: "bg-slate-100 border-slate-200", text: "text-slate-600" },
    "Timed Out": { bg: "bg-orange-100 border-orange-200", text: "text-orange-700" },
  };
  const s = map[status] || map.Waiting;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${s.bg} ${s.text}`}>{status}</span>;
}

export default function LivePipelines() {
  const { data: live } = useGetLivePipelines();
  const { data: runs } = useGetPipelineRuns();
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null);

  if (!live) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const runsList = Array.isArray(runs) ? runs : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Live Pipeline Operations</h2>
        <p className="text-muted-foreground">Current pipeline status and recent job runs — click a pipeline name to view its run history</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatusWidget label="Running" value={live.running} icon={Play} color="bg-blue-50 text-blue-600" />
        <StatusWidget label="Failed" value={live.failed} icon={XCircle} color="bg-red-50 text-red-600" />
        <StatusWidget label="Timed Out" value={live.timedOut} icon={Clock} color="bg-orange-50 text-orange-600" />
        <StatusWidget label="Delayed" value={live.delayed} icon={AlertTriangle} color="bg-amber-50 text-amber-600" />
        <StatusWidget label="Waiting Upstream" value={live.waitingUpstream} icon={Loader2} color="bg-slate-100 text-slate-600" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Latest Pipeline Runs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Run ID</TableHead>
                <TableHead className="text-xs">Pipeline</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Start Time</TableHead>
                <TableHead className="text-xs">Duration</TableHead>
                <TableHead className="text-xs">Domain</TableHead>
                <TableHead className="text-xs">Owner</TableHead>
                <TableHead className="text-xs">Env</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runsList.map((run) => (
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
                  <TableCell className="text-xs">{run.startTime ? new Date(run.startTime).toLocaleTimeString() : "-"}</TableCell>
                  <TableCell className="text-xs">{run.duration}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">{run.domain}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{run.owner}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{run.environment}</Badge>
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
