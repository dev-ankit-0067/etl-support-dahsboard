import { useGetDurationTrend, useGetSlowestJobs, useGetThroughput } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, AreaChart, Area } from "recharts";

export default function Performance() {
  const { data: durationTrend } = useGetDurationTrend();
  const { data: slowJobs } = useGetSlowestJobs();
  const { data: throughput } = useGetThroughput();

  const slowJobsList = Array.isArray(slowJobs) ? slowJobs : [];
  const durationTrendData = Array.isArray(durationTrend) ? durationTrend : [];
  const throughputData = Array.isArray(throughput) ? throughput : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Performance & Throughput</h2>
        <p className="text-muted-foreground">System performance metrics and resource utilization</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Average Job Duration Trend (14d)</CardTitle>
          </CardHeader>
          <CardContent>
            {durationTrendData.length > 0 && (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={durationTrendData} margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="timestamp" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} unit=" min" />
                  <Tooltip formatter={(value: number) => [`${value.toFixed(1)} min`]} labelFormatter={(v: string) => v} />
                  <Line type="monotone" dataKey="avgDurationMin" stroke="#3b82f6" strokeWidth={2} dot={false} name="Avg Duration" />
                  <Line type="monotone" dataKey="p95DurationMin" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 5" name="P95 Duration" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Records Read / Written (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            {throughputData.length > 0 && (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={throughputData} margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="timestamp" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(11, 16)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000000).toFixed(1)}M`} />
                  <Tooltip formatter={(value: number) => [`${(value / 1000000).toFixed(2)}M records`]} labelFormatter={(v: string) => v.slice(11, 16)} />
                  <Area type="monotone" dataKey="recordsRead" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} name="Records Read" />
                  <Area type="monotone" dataKey="recordsWritten" stroke="#10b981" fill="#10b981" fillOpacity={0.15} name="Records Written" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Slowest Jobs (Last 24 Hours)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Pipeline</TableHead>
                <TableHead className="text-xs text-right">Duration</TableHead>
                <TableHead className="text-xs text-right">Avg Duration</TableHead>
                <TableHead className="text-xs text-right">Skewness</TableHead>
                <TableHead className="text-xs text-right">Records</TableHead>
                <TableHead className="text-xs text-right">Cost/Run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slowJobsList.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="text-xs font-medium">{job.pipelineName}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{job.durationMin.toFixed(1)} min</TableCell>
                  <TableCell className="text-xs text-right">{job.avgDurationMin.toFixed(1)} min</TableCell>
                  <TableCell className="text-xs text-right">
                    <span className={job.skewness > 2 ? "text-red-600 font-medium" : "text-muted-foreground"}>
                      {job.skewness.toFixed(2)}x
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono">{(job.recordsProcessed / 1000000).toFixed(1)}M</TableCell>
                  <TableCell className="text-xs text-right text-muted-foreground">${job.costPerRun.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
