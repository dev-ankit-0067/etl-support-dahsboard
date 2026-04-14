import { useGetIncidentSummary, useGetIncidentQueue, useGetMttrTrend, useGetActiveIncidents } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from "recharts";
import { BookOpen, Ticket, Radio, ExternalLink } from "lucide-react";

export default function Incidents() {
  const { data: summary } = useGetIncidentSummary();
  const { data: queue } = useGetIncidentQueue();
  const { data: mttrTrend } = useGetMttrTrend();
  const { data: incidents } = useGetActiveIncidents();

  if (!summary) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const severityData = [
    { name: "P1", count: summary.openByP1, fill: "#ef4444" },
    { name: "P2", count: summary.openByP2, fill: "#f59e0b" },
    { name: "P3", count: summary.openByP3, fill: "#3b82f6" },
    { name: "P4", count: summary.openByP4, fill: "#94a3b8" },
  ];

  const agingData = [
    { name: "0-1h", count: summary.aging0to1h },
    { name: "1-4h", count: summary.aging1to4h },
    { name: "4-12h", count: summary.aging4to12h },
    { name: "12h+", count: summary.aging12hPlus },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Incident Command Center</h2>
        <p className="text-muted-foreground">Active incidents, SLA tracking, and escalation management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Open by Severity</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={severityData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Incidents">
                  {severityData.map((entry, i) => (
                    <rect key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Incident Aging</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={agingData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" name="Incidents" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Acknowledgement Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Acknowledged</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(summary.acknowledged / (summary.acknowledged + summary.unacknowledged)) * 100}%` }} />
                  </div>
                  <span className="text-sm font-medium">{summary.acknowledged}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Unacknowledged</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-500 rounded-full" style={{ width: `${(summary.unacknowledged / (summary.acknowledged + summary.unacknowledged)) * 100}%` }} />
                  </div>
                  <span className="text-sm font-medium text-red-600">{summary.unacknowledged}</span>
                </div>
              </div>
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground">Total open: {summary.acknowledged + summary.unacknowledged}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Incident Queue by Owner</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Owner</TableHead>
                    <TableHead className="text-xs text-center">P1</TableHead>
                    <TableHead className="text-xs text-center">P2</TableHead>
                    <TableHead className="text-xs text-center">P3</TableHead>
                    <TableHead className="text-xs text-center">P4</TableHead>
                    <TableHead className="text-xs">Oldest</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue?.map((item) => (
                    <TableRow key={item.owner}>
                      <TableCell className="text-xs font-medium">{item.owner}</TableCell>
                      <TableCell className="text-xs text-center">
                        {item.p1Count > 0 ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-700 font-medium">{item.p1Count}</span> : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        {item.p2Count > 0 ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 font-medium">{item.p2Count}</span> : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        {item.p3Count > 0 ? <span className="text-muted-foreground">{item.p3Count}</span> : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        {item.p4Count > 0 ? <span className="text-muted-foreground">{item.p4Count}</span> : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-xs">{item.oldestAge}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">MTTA / MTTR Trend (30d)</CardTitle>
            </CardHeader>
            <CardContent>
              {mttrTrend && (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={mttrTrend} margin={{ left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} unit=" min" />
                    <Tooltip formatter={(value: number) => [`${value.toFixed(1)} min`]} />
                    <Line type="monotone" dataKey="mttaMin" stroke="#6366f1" strokeWidth={2} dot={false} name="MTTA" />
                    <Line type="monotone" dataKey="mttrMin" stroke="#f59e0b" strokeWidth={2} dot={false} name="MTTR" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Quick Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-2 h-10">
                <BookOpen className="h-4 w-4 text-blue-600" />
                <span className="text-sm">Runbooks</span>
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2 h-10">
                <Ticket className="h-4 w-4 text-purple-600" />
                <span className="text-sm">Create Ticket</span>
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2 h-10">
                <Radio className="h-4 w-4 text-red-600" />
                <span className="text-sm">War Room / Bridge</span>
                <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Recent Incidents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {incidents?.slice(0, 4).map((inc) => (
                <div key={inc.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${inc.severity === "P1" ? "bg-red-500" : inc.severity === "P2" ? "bg-amber-500" : "bg-blue-500"}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{inc.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{inc.id}</span>
                      <span className="text-xs text-muted-foreground">{inc.age}</span>
                      <Badge variant={inc.acknowledged ? "secondary" : "destructive"} className="text-[10px] px-1 py-0">
                        {inc.acknowledged ? "ACK" : "UNACK"}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
