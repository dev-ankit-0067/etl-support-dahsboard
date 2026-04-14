import { useGetOverviewKpis, useGetHealthDistribution, useGetJobStatusTrend, useGetFailedJobs, useGetActiveIncidents } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from "recharts";
import { Activity, AlertTriangle, CheckCircle2, XCircle, Clock, ShieldAlert, Target, TrendingDown } from "lucide-react";

function KpiCard({ title, value, icon: Icon, variant = "default", subtitle }: { title: string; value: string | number; icon: React.ElementType; variant?: "default" | "success" | "warning" | "danger"; subtitle?: string }) {
  const colors = {
    default: "text-primary",
    success: "text-emerald-600",
    warning: "text-amber-500",
    danger: "text-red-500",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className={`text-2xl font-bold ${colors[variant]}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-slate-50 ${colors[variant]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function severityBadge(severity: string) {
  const map: Record<string, string> = {
    P1: "bg-red-100 text-red-700 border-red-200",
    P2: "bg-amber-100 text-amber-700 border-amber-200",
    P3: "bg-blue-100 text-blue-700 border-blue-200",
    P4: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${map[severity] || map.P4}`}>{severity}</span>;
}

export default function ExecutiveOverview() {
  const { data: kpis } = useGetOverviewKpis();
  const { data: healthDist } = useGetHealthDistribution();
  const { data: trend } = useGetJobStatusTrend();
  const { data: failedJobs } = useGetFailedJobs();
  const { data: incidents } = useGetActiveIncidents();

  if (!kpis) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Executive Overview</h2>
        <p className="text-muted-foreground">Platform health and high-level KPIs</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard title="Total Pipelines" value={kpis.totalPipelines} icon={Activity} />
        <KpiCard title="Healthy" value={kpis.healthy} icon={CheckCircle2} variant="success" />
        <KpiCard title="Degraded" value={kpis.degraded} icon={TrendingDown} variant="warning" />
        <KpiCard title="Failed" value={kpis.failed} icon={XCircle} variant="danger" />
        <KpiCard title="Failed Jobs (24h)" value={kpis.failedJobs24h} icon={AlertTriangle} variant={kpis.failedJobs24h > 10 ? "danger" : "warning"} />
        <KpiCard title="Active P1/P2" value={`${kpis.activeP1} / ${kpis.activeP2}`} icon={ShieldAlert} variant={kpis.activeP1 > 0 ? "danger" : "default"} />
        <KpiCard title="SLA Breaches" value={kpis.slaBreaches} icon={Target} variant={kpis.slaBreaches > 0 ? "danger" : "success"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard title="Avg MTTA" value={`${kpis.avgMtta} min`} icon={Clock} subtitle="Mean time to acknowledge" />
        <KpiCard title="Avg MTTR" value={`${kpis.avgMttr} min`} icon={Clock} subtitle="Mean time to resolve" />
        <KpiCard title="SLA Compliance" value={`${kpis.slaCompliancePercent}%`} icon={Target} variant={kpis.slaCompliancePercent >= 95 ? "success" : "warning"} subtitle={`Top impacted: ${kpis.topImpactedDomain}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Health by Domain</CardTitle>
          </CardHeader>
          <CardContent>
            {healthDist && (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={healthDist.domains} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={75} />
                  <Tooltip />
                  <Bar dataKey="healthy" stackId="a" fill="#10b981" name="Healthy" />
                  <Bar dataKey="degraded" stackId="a" fill="#f59e0b" name="Degraded" />
                  <Bar dataKey="failed" stackId="a" fill="#ef4444" name="Failed" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Job Status Trend (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            {trend && (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={trend} margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="timestamp" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(11, 16)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={(v: string) => v.slice(11, 16)} />
                  <Area type="monotone" dataKey="success" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.3} name="Success" />
                  <Area type="monotone" dataKey="running" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Running" />
                  <Area type="monotone" dataKey="failed" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name="Failed" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Latest Failed Jobs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Job ID</TableHead>
                  <TableHead className="text-xs">Pipeline</TableHead>
                  <TableHead className="text-xs">Error</TableHead>
                  <TableHead className="text-xs">Severity</TableHead>
                  <TableHead className="text-xs">Owner</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedJobs?.slice(0, 5).map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="text-xs font-mono">{job.id}</TableCell>
                    <TableCell className="text-xs">{job.pipelineName}</TableCell>
                    <TableCell className="text-xs">{job.errorType}</TableCell>
                    <TableCell>{severityBadge(job.severity)}</TableCell>
                    <TableCell className="text-xs">{job.owner}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Incidents</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">ID</TableHead>
                  <TableHead className="text-xs">Title</TableHead>
                  <TableHead className="text-xs">Severity</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Age</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents?.slice(0, 5).map((inc) => (
                  <TableRow key={inc.id}>
                    <TableCell className="text-xs font-mono">{inc.id}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{inc.title}</TableCell>
                    <TableCell>{severityBadge(inc.severity)}</TableCell>
                    <TableCell>
                      <Badge variant={inc.status === "Investigating" ? "default" : "secondary"} className="text-xs">
                        {inc.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{inc.age}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
