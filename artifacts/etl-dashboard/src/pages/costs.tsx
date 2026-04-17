import { useGetCostKpis, useGetCostBreakdown, useGetCostPerformance } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { DollarSign, TrendingUp, AlertTriangle, Target } from "lucide-react";

export default function Costs() {
  const { data: kpis } = useGetCostKpis();
  const { data: breakdown } = useGetCostBreakdown();
  const { data: perf } = useGetCostPerformance();

  if (!kpis) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const budgetPercent = (kpis.totalCostMtd / kpis.budget) * 100;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Cost Insights</h2>
        <p className="text-muted-foreground">Infrastructure spend by jobs and daily trends</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><DollarSign className="h-4 w-4" /></div>
              <div>
                <p className="text-xl font-bold">${kpis.totalCostMtd.toLocaleString()}</p>
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
                <p className="text-xl font-bold">${kpis.avgCostPerRun.toFixed(2)}</p>
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
                <p className="text-xl font-bold text-red-600">${kpis.costOfFailedRuns.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Failed Run Cost</p>
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
              <p className="text-xs text-muted-foreground">${kpis.totalCostMtd.toLocaleString()} / ${kpis.budget.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cost by Jobs (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            {breakdown && (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={breakdown.byPipeline} layout="vertical" margin={{ left: 120 }}>
                  <XAxis type="number" tickFormatter={(v: number) => `$${v}`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={115} />
                  <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`]} />
                  <Bar dataKey="cost" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Daily Cost Trend</CardTitle>
              {perf && (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                  Retry waste: ${perf.retryCostWaste.toLocaleString()}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {perf && (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={perf.costVsPipeline} margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toLocaleString()}`, "Job Cost"]}
                    labelFormatter={(v: string) => `Date: ${v}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#3b82f6" }}
                    activeDot={{ r: 5 }}
                    name="Job Cost"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
