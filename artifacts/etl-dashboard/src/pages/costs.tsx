import { useGetCostKpis, useGetCostBreakdown, useGetCostPerformance, useGetCostOptimization } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ScatterChart, Scatter, CartesianGrid, LineChart, Line, Cell } from "recharts";
import { DollarSign, TrendingUp, AlertTriangle, Target, Lightbulb } from "lucide-react";

export default function Costs() {
  const { data: kpis } = useGetCostKpis();
  const { data: breakdown } = useGetCostBreakdown();
  const { data: perf } = useGetCostPerformance();
  const { data: optimization } = useGetCostOptimization();

  if (!kpis) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const optimizationList = Array.isArray(optimization) ? optimization : [];
  const breakdownEnvList = Array.isArray(breakdown?.byEnvironment) ? breakdown.byEnvironment : [];
  const breakdownPipelineList = Array.isArray(breakdown?.byPipeline) ? breakdown.byPipeline : [];
  const breakdownDomainList = Array.isArray(breakdown?.byDomain) ? breakdown.byDomain : [];
  const perfCostVsRuntimeList = Array.isArray(perf?.costVsRuntime) ? perf.costVsRuntime : [];
  const perfCostVsVolumeList = Array.isArray(perf?.costVsVolume) ? perf.costVsVolume : [];
  const perfData = Array.isArray(perf) ? perf : [];

  // Provide defaults for potentially undefined kpis properties
  const totalCostMtd = kpis?.totalCostMtd ?? 0;
  const budget = kpis?.budget ?? 0;
  const avgCostPerRun = kpis?.avgCostPerRun ?? 0;
  const costOfFailedRuns = kpis?.costOfFailedRuns ?? 0;
  const costAnomalies = kpis?.costAnomalies ?? 0;

  const budgetPercent = budget > 0 ? (totalCostMtd / budget) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Cost & Financial Insights</h2>
        <p className="text-muted-foreground">Infrastructure spend analysis and optimization opportunities</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><DollarSign className="h-4 w-4" /></div>
              <div>
                <p className="text-xl font-bold">${totalCostMtd.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Cost (MTD)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600"><TrendingUp className="h-4 w-4" /></div>
              <div>
                <p className="text-xl font-bold">${avgCostPerRun.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">Avg Cost / Run</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-50 text-red-600"><AlertTriangle className="h-4 w-4" /></div>
              <div>
                <p className="text-xl font-bold text-red-600">${costOfFailedRuns.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Failed Run Cost</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600"><AlertTriangle className="h-4 w-4" /></div>
              <div>
                <p className="text-xl font-bold">{costAnomalies}</p>
                <p className="text-xs text-muted-foreground">Cost Anomalies</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Budget</span>
                </div>
                <span className="text-xs font-medium">{budgetPercent.toFixed(0)}%</span>
              </div>
              <Progress value={budgetPercent} className="h-2" />
              <p className="text-xs text-muted-foreground">${totalCostMtd.toLocaleString()} / ${budget.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cost by Pipeline (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            {breakdownPipelineList.length > 0 && (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={breakdownPipelineList} layout="vertical" margin={{ left: 120 }}>
                  <XAxis type="number" tickFormatter={(v: number) => `$${v.toLocaleString()}`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={115} />
                  <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`]} />
                  <Bar dataKey="cost" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cost by Domain</CardTitle>
          </CardHeader>
          <CardContent>
            {breakdownDomainList.length > 0 && (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={breakdownDomainList} layout="vertical" margin={{ left: 80 }}>
                  <XAxis type="number" tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
                  <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`]} />
                  <Bar dataKey="cost" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cost by Environment</CardTitle>
          </CardHeader>
          <CardContent>
            {breakdownEnvList.length > 0 && (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={breakdownEnvList}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`]} />
                  <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                    {breakdownEnvList.map((_, i) => (
                      <Cell key={i} fill={["#3b82f6", "#f59e0b", "#6366f1"][i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cost vs Runtime</CardTitle>
          </CardHeader>
          <CardContent>
            {perfCostVsRuntimeList.length > 0 && (
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="runtimeMin" name="Runtime" unit=" min" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="cost" name="Cost" unit="$" tick={{ fontSize: 10 }} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(value: number, name: string) => [name === "Cost" ? `$${value.toFixed(2)}` : `${value} min`, name]} />
                  <Scatter data={perfCostVsRuntimeList} fill="#3b82f6" />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Cost vs Data Volume Trend</CardTitle>
              {perf && perf.retryCostWaste != null && (
                <Badge variant="secondary" className="text-xs">
                  Retry waste: ${(perf.retryCostWaste ?? 0).toLocaleString()}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {perfCostVsVolumeList.length > 0 && (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={perfCostVsVolumeList} margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v.toFixed(0)} GB`} />
                  <Tooltip />
                  <Line yAxisId="left" type="monotone" dataKey="cost" stroke="#3b82f6" strokeWidth={2} dot={false} name="Cost ($)" />
                  <Line yAxisId="right" type="monotone" dataKey="volumeGb" stroke="#10b981" strokeWidth={2} dot={false} name="Volume (GB)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-sm font-medium">Optimization Insights</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">Pipeline</TableHead>
                <TableHead className="text-xs">Description</TableHead>
                <TableHead className="text-xs text-right">Est. Savings</TableHead>
                <TableHead className="text-xs">Priority</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {optimizationList.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{item.type}</Badge>
                  </TableCell>
                  <TableCell className="text-xs font-medium">{item.pipeline}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[300px]">{item.description}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-emerald-600">${(item.estimatedSavings ?? 0).toLocaleString()}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                      item.priority === "High" ? "bg-red-100 text-red-700 border-red-200" : item.priority === "Medium" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}>{item.priority}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
