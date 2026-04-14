import { useEffect, useRef } from "react";
import { useGetRcaLifecycle, useGetRepeatIncidents, useGetFailurePatterns, useGetRcaMetrics } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, Bot, BookOpen, ListChecks, Clock, ArrowLeft, AlertTriangle } from "lucide-react";
import { useLocation, useSearch } from "wouter";

function rcaStatusBadge(status: string) {
  const map: Record<string, string> = {
    "In Progress": "bg-blue-100 text-blue-700 border-blue-200",
    "Pending Review": "bg-amber-100 text-amber-700 border-amber-200",
    "Completed": "bg-emerald-100 text-emerald-700 border-emerald-200",
    "Open": "bg-red-100 text-red-700 border-red-200",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>{status}</span>;
}

function trendIcon(trend: string) {
  if (trend === "increasing") return <TrendingUp className="h-3.5 w-3.5 text-red-500" />;
  if (trend === "decreasing") return <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />;
  return <Minus className="h-3.5 w-3.5 text-slate-400" />;
}

export default function Rca() {
  const { data: lifecycle } = useGetRcaLifecycle();
  const { data: repeats } = useGetRepeatIncidents();
  const { data: patterns } = useGetFailurePatterns();
  const { data: metrics } = useGetRcaMetrics();
  const [, navigate] = useLocation();
  const search = useSearch();

  const params = new URLSearchParams(search);
  const fromIncident = params.get("incident");
  const fromPipeline = params.get("pipeline");

  const highlightedRowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (fromPipeline && highlightedRowRef.current) {
      highlightedRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [fromPipeline, lifecycle]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">RCA & Prevention</h2>
          <p className="text-muted-foreground">Root cause analysis, recurring patterns, and prevention metrics</p>
        </div>
        {fromIncident && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            onClick={() => navigate("/incidents")}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Incidents
          </Button>
        )}
      </div>

      {/* Contextual banner when navigated from an incident */}
      {fromIncident && fromPipeline && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-900">
              Viewing RCA for incident <span className="font-mono">{fromIncident}</span>
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              Pipeline: <span className="font-mono font-medium">{fromPipeline}</span>
              {" · "}
              The matching RCA entry is highlighted below.
            </p>
          </div>
          <button
            className="text-blue-500 hover:text-blue-700 text-lg leading-none shrink-0"
            onClick={() => navigate("/rca")}
            title="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Bot className="h-4 w-4" /></div>
                <div>
                  <p className="text-xl font-bold">{metrics.automationSuccessRate}%</p>
                  <p className="text-xs text-muted-foreground">Automation Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600"><BookOpen className="h-4 w-4" /></div>
                <div>
                  <p className="text-xl font-bold">{metrics.runbookUsagePercent}%</p>
                  <p className="text-xs text-muted-foreground">Runbook Usage</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-50 text-amber-600"><ListChecks className="h-4 w-4" /></div>
                <div>
                  <p className="text-xl font-bold">{metrics.openRcaBacklog}</p>
                  <p className="text-xs text-muted-foreground">Open RCA Backlog</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-50 text-purple-600"><Clock className="h-4 w-4" /></div>
                <div>
                  <p className="text-xl font-bold">{metrics.avgRcaCompletionDays}d</p>
                  <p className="text-xs text-muted-foreground">Avg RCA Time</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-50 text-red-600"><TrendingUp className="h-4 w-4" /></div>
                <div>
                  <p className="text-xl font-bold">{metrics.changeCorrelationPercent}%</p>
                  <p className="text-xs text-muted-foreground">Change Correlation</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Incident Lifecycle with RCA Status</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">ID</TableHead>
                  <TableHead className="text-xs">Incident</TableHead>
                  <TableHead className="text-xs">Pipeline</TableHead>
                  <TableHead className="text-xs">RCA Status</TableHead>
                  <TableHead className="text-xs text-right">Days</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lifecycle?.map((item) => {
                  const isHighlighted = fromPipeline && item.pipeline === fromPipeline;
                  return (
                    <TableRow
                      key={item.id}
                      ref={isHighlighted ? highlightedRowRef : null}
                      className={
                        isHighlighted
                          ? "bg-blue-50 ring-1 ring-inset ring-blue-300 transition-colors"
                          : undefined
                      }
                    >
                      <TableCell className="text-xs font-mono">
                        {isHighlighted ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                            {item.id}
                          </span>
                        ) : item.id}
                      </TableCell>
                      <TableCell className="text-xs max-w-[160px] truncate font-medium">{item.incidentTitle}</TableCell>
                      <TableCell className="text-xs font-mono text-slate-500">{item.pipeline}</TableCell>
                      <TableCell>{rcaStatusBadge(item.rcaStatus)}</TableCell>
                      <TableCell className="text-xs text-right">{item.daysOpen}d</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">{item.completedActions}/{item.actionItems}</span>
                          <Progress value={item.actionItems > 0 ? (item.completedActions / item.actionItems) * 100 : 0} className="w-12 h-1.5" />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Repeat Incidents by Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Pipeline</TableHead>
                  <TableHead className="text-xs text-right">Count</TableHead>
                  <TableHead className="text-xs">Pattern</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repeats?.map((item) => {
                  const isHighlighted = fromPipeline && item.pipeline === fromPipeline;
                  return (
                    <TableRow
                      key={item.pipeline}
                      className={isHighlighted ? "bg-blue-50 ring-1 ring-inset ring-blue-200" : undefined}
                    >
                      <TableCell className="text-xs font-medium">
                        {isHighlighted ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                            {item.pipeline}
                          </span>
                        ) : item.pipeline}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        <span className={`font-medium ${item.count >= 5 ? "text-red-600" : "text-amber-600"}`}>{item.count}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{item.pattern}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top Recurring Failure Patterns</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Pattern</TableHead>
                <TableHead className="text-xs text-right">Occurrences</TableHead>
                <TableHead className="text-xs text-right">Affected Pipelines</TableHead>
                <TableHead className="text-xs">Last Seen</TableHead>
                <TableHead className="text-xs text-center">Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patterns?.map((item) => (
                <TableRow key={item.pattern}>
                  <TableCell className="text-xs font-medium">{item.pattern}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{item.occurrences}</TableCell>
                  <TableCell className="text-xs text-right">{item.affectedPipelines}</TableCell>
                  <TableCell className="text-xs">{new Date(item.lastSeen).toLocaleTimeString()}</TableCell>
                  <TableCell className="text-center">{trendIcon(item.trend)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
