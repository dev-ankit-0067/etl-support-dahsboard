import { useEffect, useMemo, useState } from "react";
import { useGetCostKpis, useGetCostBreakdown, useGetCostPerformance } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { DollarSign, TrendingUp, AlertTriangle, Target } from "lucide-react";

const DATE_KEYS: Record<string, string> = { today: "today", "7d": "7d", "30d": "30d" };

interface BreakdownItem { name: string; cost: number }
interface TrendPoint { date: string; cost: number }
interface LambdaBreakdown { byFunction: BreakdownItem[] }
interface LambdaPerformance { costVsFunction: TrendPoint[]; costRanges: Record<string, TrendPoint[]> }

export default function Costs() {
  const { data: kpis } = useGetCostKpis();
  const { data: breakdown } = useGetCostBreakdown();
  const { data: perf } = useGetCostPerformance();
  const [dateRange, setDateRange] = useState("7d");
  const [resourceType, setResourceType] = useState<"job" | "lambda">("job");

  const [lambdaBreakdown, setLambdaBreakdown] = useState<LambdaBreakdown | null>(null);
  const [lambdaPerf, setLambdaPerf] = useState<LambdaPerformance | null>(null);

  useEffect(() => {
    if (resourceType !== "lambda") return;
    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    Promise.all([
      fetch(`${base}/api/lambdas/cost-breakdown`).then((r) => r.json()),
      fetch(`${base}/api/lambdas/cost-performance`).then((r) => r.json()),
    ])
      .then(([b, p]) => { setLambdaBreakdown(b); setLambdaPerf(p); })
      .catch(() => { setLambdaBreakdown(null); setLambdaPerf(null); });
  }, [resourceType]);

  const isLambda = resourceType === "lambda";

  const breakdownItems: BreakdownItem[] = useMemo(() => {
    if (isLambda) return lambdaBreakdown?.byFunction ?? [];
    return breakdown?.byPipeline ?? [];
  }, [isLambda, lambdaBreakdown, breakdown]);

  const trendData: TrendPoint[] = useMemo(() => {
    const key = DATE_KEYS[dateRange] ?? "7d";
    if (isLambda) return lambdaPerf?.costRanges?.[key] ?? lambdaPerf?.costVsFunction ?? [];
    return perf?.costRanges?.[key] ?? perf?.costVsPipeline ?? [];
  }, [isLambda, lambdaPerf, perf, dateRange]);

  if (!kpis) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const budgetPercent = (kpis.totalCostMtd / kpis.budget) * 100;
  const breakdownTitle = isLambda ? "Cost by Lambda Functions (Top 10)" : "Cost by Jobs (Top 10)";
  const trendLabel = isLambda ? "Lambda Cost" : "Job Cost";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Cost Insights</h2>
          <p className="text-muted-foreground">Infrastructure spend by {isLambda ? "Lambda functions" : "jobs"} and daily trends</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={resourceType} onValueChange={(v) => setResourceType(v as "job" | "lambda")}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="job">Glue Jobs</SelectItem>
              <SelectItem value="lambda">Lambda</SelectItem>
            </SelectContent>
          </Select>
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
            <CardTitle className="text-sm font-medium">{breakdownTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {breakdownItems.length > 0 && (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={breakdownItems} layout="vertical" margin={{ left: 120 }}>
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
            <CardTitle className="text-sm font-medium">Daily Cost Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 && (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={trendData} margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
                  <Tooltip
                    formatter={(value: number) => [`$${value.toLocaleString()}`, trendLabel]}
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
                    name={trendLabel}
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
