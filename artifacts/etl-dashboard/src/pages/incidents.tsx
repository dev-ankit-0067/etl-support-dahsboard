import { useState } from "react";
import { useGetIncidentSummary, useGetMttrTrend, useGetActiveIncidents } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from "recharts";
import { ArrowRight } from "lucide-react";
import IncidentDetailModal from "@/components/incidents/IncidentDetailModal";

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string;
  pipeline: string;
  domain: string;
  createdAt: string;
  owner: string;
  acknowledged: boolean;
  escalationLevel: number;
  age: string;
}

export default function Incidents() {
  const { data: summary } = useGetIncidentSummary();
  const { data: mttrTrend } = useGetMttrTrend();
  const { data: incidents } = useGetActiveIncidents();
  const [dateRange, setDateRange] = useState("today");
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  if (!summary) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const mult = dateRange === "30d" ? 30 : dateRange === "7d" ? 7 : 1;
  const scaledSummary = {
    openByP1: Math.round(summary.openByP1 * mult * 0.8),
    openByP2: Math.round(summary.openByP2 * mult * 0.9),
    openByP3: Math.round(summary.openByP3 * mult),
    openByP4: Math.round(summary.openByP4 * mult),
  };

  const severityData = [
    { name: "P1", count: scaledSummary.openByP1, fill: "#ef4444" },
    { name: "P2", count: scaledSummary.openByP2, fill: "#f59e0b" },
    { name: "P3", count: scaledSummary.openByP3, fill: "#3b82f6" },
    { name: "P4", count: scaledSummary.openByP4, fill: "#94a3b8" },
  ];

  const agingData = [
    { name: "0–1h", count: summary.aging0to1h },
    { name: "1–4h", count: summary.aging1to4h },
    { name: "4–12h", count: summary.aging4to12h },
    { name: "12h+", count: summary.aging12hPlus },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Incident Center</h2>
          <p className="text-muted-foreground">Active incidents and SLA tracking</p>
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
                <Bar dataKey="count" name="Incidents" radius={[4, 4, 0, 0]}>
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
            <CardTitle className="text-sm font-medium">MTTA / MTTR Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {mttrTrend && (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={mttrTrend.slice(-14)} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} unit="m" />
                  <Tooltip formatter={(value: number) => [`${value.toFixed(1)} min`]} />
                  <Line type="monotone" dataKey="mttaMin" stroke="#6366f1" strokeWidth={2} dot={false} name="MTTA" />
                  <Line type="monotone" dataKey="mttrMin" stroke="#f59e0b" strokeWidth={2} dot={false} name="MTTR" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

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
                <TableHead className="text-xs">Pipeline</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Age</TableHead>
                <TableHead className="text-xs">Owner</TableHead>
                <TableHead className="text-xs">Domain</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents?.map((inc) => (
                <TableRow
                  key={inc.id}
                  className="cursor-pointer hover:bg-slate-50 group"
                  onClick={() => setSelectedIncident(inc as Incident)}
                >
                  <TableCell>
                    <span className="text-xs font-mono text-primary">{inc.id}</span>
                  </TableCell>
                  <TableCell className="text-xs font-medium max-w-[240px] truncate">{inc.title}</TableCell>
                  <TableCell className="text-xs font-mono text-slate-500">{inc.pipeline}</TableCell>
                  <TableCell>
                    <Badge variant={inc.status === "Investigating" ? "default" : "secondary"} className="text-xs">
                      {inc.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{inc.age}</TableCell>
                  <TableCell className="text-xs">{inc.owner}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{inc.domain}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <IncidentDetailModal
        incident={selectedIncident}
        open={!!selectedIncident}
        onClose={() => setSelectedIncident(null)}
      />
    </div>
  );
}
