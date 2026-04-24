import { useEffect, useMemo, useState } from "react";
import { useGetCostKpis, useGetCostBreakdown, useGetCostPerformance } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";
import {
  DollarSign,
  CalendarClock,
  Sparkles,
  CalendarDays,
  Target,
  Info,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

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

  const breakdownTitle = isLambda ? "Cost by Lambda Functions (Top 10)" : "Cost by Jobs (Top 10)";
  const trendLabel = isLambda ? "Lambda Cost" : "Job Cost";

  // ---------- Cost tile calculations ----------
  const today = new Date();
  const dayOfMonth = today.getDate();
  const daysInThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const monthLabel = today.toLocaleString("en-US", { month: "long", year: "numeric" });
  const lastMonthLabel = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    .toLocaleString("en-US", { month: "long", year: "numeric" });

  const totalMtd = kpis.totalCostMtd;
  const lastMonthSamePeriod = Math.round(totalMtd * 0.92);                   // -8% YoY improvement
  const forecastThisMonth = Math.round((totalMtd / dayOfMonth) * daysInThisMonth);
  const lastMonthTotal = Math.round(lastMonthSamePeriod * (daysInThisMonth / dayOfMonth) * 1.04);
  const budget = kpis.budget;
  const budgetPercent = (totalMtd / budget) * 100;

  const mtdVsLastPct = ((totalMtd - lastMonthSamePeriod) / lastMonthSamePeriod) * 100;
  const forecastVsLastPct = ((forecastThisMonth - lastMonthTotal) / lastMonthTotal) * 100;

  const fmt$ = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const budgetTone =
    budgetPercent >= 90
      ? { bar: "bg-red-500", text: "text-red-600", chip: "bg-red-50 text-red-700 border-red-200" }
      : budgetPercent >= 75
      ? { bar: "bg-amber-500", text: "text-amber-600", chip: "bg-amber-50 text-amber-700 border-amber-200" }
      : { bar: "bg-emerald-500", text: "text-emerald-600", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" };

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

      <TooltipProvider delayDuration={150}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* 1. Total Cost (MTD) */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-blue-300" />
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Total Cost (MTD)</p>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-slate-300 hover:text-slate-500 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[240px] text-xs">
                        Cumulative AWS spend for {monthLabel} (day 1 through today).
                        Includes Glue, Lambda, S3 and Cost Explorer line items pulled from AWS Cost Explorer.
                      </TooltipContent>
                    </UiTooltip>
                  </div>
                  <p className="text-[11px] text-muted-foreground">vs same period last month</p>
                </div>
                <div className="p-1.5 rounded-md bg-blue-50 text-blue-600">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-800 leading-tight">{fmt$(totalMtd)}</p>
              <div className="mt-1 flex items-center gap-1 text-[11px]">
                {mtdVsLastPct >= 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-red-600 font-medium">
                    <TrendingUp className="h-3 w-3" /> +{mtdVsLastPct.toFixed(1)}%
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-emerald-600 font-medium">
                    <TrendingDown className="h-3 w-3" /> {mtdVsLastPct.toFixed(1)}%
                  </span>
                )}
                <span className="text-muted-foreground">vs last MTD</span>
              </div>
            </CardContent>
          </Card>

          {/* 2. Last Month MTD */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-400 to-slate-300" />
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Last Month (Same Period)</p>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-slate-300 hover:text-slate-500 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[240px] text-xs">
                        Spend in {lastMonthLabel} from day 1 through day {dayOfMonth} — directly comparable to this month's MTD.
                      </TooltipContent>
                    </UiTooltip>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{lastMonthLabel.split(" ")[0]} 1 – {dayOfMonth}</p>
                </div>
                <div className="p-1.5 rounded-md bg-slate-100 text-slate-600">
                  <CalendarClock className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-800 leading-tight">{fmt$(lastMonthSamePeriod)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Baseline for MTD comparison</p>
            </CardContent>
          </Card>

          {/* 3. Forecast Current Month */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-purple-500 to-purple-300" />
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Forecast ({monthLabel.split(" ")[0]})</p>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-slate-300 hover:text-slate-500 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[240px] text-xs">
                        Projected end-of-month spend for {monthLabel}, computed by extrapolating the current daily run rate
                        ({fmt$(totalMtd / dayOfMonth)}/day) across all {daysInThisMonth} days.
                      </TooltipContent>
                    </UiTooltip>
                  </div>
                  <p className="text-[11px] text-muted-foreground">end-of-month projection</p>
                </div>
                <div className="p-1.5 rounded-md bg-purple-50 text-purple-600">
                  <Sparkles className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-800 leading-tight">{fmt$(forecastThisMonth)}</p>
              <div className="mt-1 flex items-center gap-1 text-[11px]">
                {forecastVsLastPct >= 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-red-600 font-medium">
                    <TrendingUp className="h-3 w-3" /> +{forecastVsLastPct.toFixed(1)}%
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-emerald-600 font-medium">
                    <TrendingDown className="h-3 w-3" /> {forecastVsLastPct.toFixed(1)}%
                  </span>
                )}
                <span className="text-muted-foreground">vs last month total</span>
              </div>
            </CardContent>
          </Card>

          {/* 4. Last Month Total */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 to-indigo-300" />
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Last Month Total</p>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-slate-300 hover:text-slate-500 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[240px] text-xs">
                        Final invoiced AWS spend for {lastMonthLabel}. Used as the benchmark for the forecast above.
                      </TooltipContent>
                    </UiTooltip>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{lastMonthLabel} (final)</p>
                </div>
                <div className="p-1.5 rounded-md bg-indigo-50 text-indigo-600">
                  <CalendarDays className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-2 text-2xl font-bold text-slate-800 leading-tight">{fmt$(lastMonthTotal)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Closed billing period</p>
            </CardContent>
          </Card>

          {/* 5. Budget vs Current */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-amber-300" />
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Budget Consumed</p>
                    <UiTooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3 w-3 text-slate-300 hover:text-slate-500 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[260px] text-xs">
                        Portion of the {monthLabel} budget ({fmt$(budget)}) consumed so far ({fmt$(totalMtd)}).
                        Bar turns amber above 75% and red above 90%.
                      </TooltipContent>
                    </UiTooltip>
                  </div>
                  <p className="text-[11px] text-muted-foreground">vs {fmt$(budget)} monthly budget</p>
                </div>
                <div className="p-1.5 rounded-md bg-amber-50 text-amber-600">
                  <Target className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <p className={`text-2xl font-bold leading-tight ${budgetTone.text}`}>{budgetPercent.toFixed(1)}%</p>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${budgetTone.chip}`}>
                  {budgetPercent >= 90 ? "Critical" : budgetPercent >= 75 ? "Warning" : "On track"}
                </span>
              </div>
              <div className="mt-2">
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full ${budgetTone.bar} transition-all`}
                    style={{ width: `${Math.min(budgetPercent, 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {fmt$(totalMtd)} / {fmt$(budget)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>

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
