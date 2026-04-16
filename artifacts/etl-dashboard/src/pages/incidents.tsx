import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetIncidentSummary, useGetIncidentQueue, useGetMttrTrend, useGetActiveIncidents } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from "recharts";
import { BookOpen, Ticket, Radio, ExternalLink, ArrowRight, Phone, MessageSquare, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
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

interface OncallEntry {
  team: string;
  domain: string;
  oncall: string;
  backup: string;
  phone: string;
  slackHandle: string;
  activeP1: number;
  activeP2: number;
  shiftStart: string;
  shiftEnd: string;
  escalationPath: string[];
}

function fmtShift(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function Incidents() {
  const { data: summary } = useGetIncidentSummary();
  const { data: queue } = useGetIncidentQueue();
  const { data: mttrTrend } = useGetMttrTrend();
  const { data: incidents } = useGetActiveIncidents();
  const { data: oncall } = useQuery<OncallEntry[]>({
    queryKey: ["incidents-oncall"],
    queryFn: async () => {
      const res = await fetch("/api/incidents/oncall");
      return res.json();
    },
  });
  const [, navigate] = useLocation();
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  if (!summary) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const incidentsList = Array.isArray(incidents) ? incidents : [];
  const oncallList = Array.isArray(oncall) ? oncall : [];
  const queueList = Array.isArray(queue) ? queue : [];
  const mttrTrendData = Array.isArray(mttrTrend) ? mttrTrend : [];

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

  function goToRca(incidentId: string, pipeline: string) {
    navigate(`/rca?incident=${encodeURIComponent(incidentId)}&pipeline=${encodeURIComponent(pipeline)}`);
  }

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

      {/* Active Incidents Table */}
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
                <TableHead className="text-xs">Severity</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Age</TableHead>
                <TableHead className="text-xs">Owner</TableHead>
                <TableHead className="text-xs w-20">RCA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidentsList.map((inc) => (
                <TableRow key={inc.id} className="group">
                  <TableCell>
                    <button
                      className="text-xs font-mono text-primary underline-offset-2 hover:underline cursor-pointer"
                      onClick={() => setSelectedIncident(inc as Incident)}
                    >
                      {inc.id}
                    </button>
                  </TableCell>
                  <TableCell className="text-xs font-medium max-w-[200px] truncate">{inc.title}</TableCell>
                  <TableCell className="text-xs font-mono text-slate-500">{inc.pipeline}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                      inc.severity === "P1" ? "bg-red-100 text-red-700 border-red-200" :
                      inc.severity === "P2" ? "bg-amber-100 text-amber-700 border-amber-200" :
                      "bg-blue-100 text-blue-700 border-blue-200"
                    }`}>{inc.severity}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={inc.status === "Investigating" ? "default" : "secondary"} className="text-xs">
                      {inc.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{inc.age}</TableCell>
                  <TableCell className="text-xs">{inc.owner}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1 opacity-60 group-hover:opacity-100 transition-opacity"
                      onClick={() => goToRca(inc.id, inc.pipeline)}
                    >
                      RCA
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* On-call Escalation Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">On-call Escalation — Current Shift</CardTitle>
            <span className="text-xs text-muted-foreground">Shift window: 06:00–18:00 UTC</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Team</TableHead>
                <TableHead className="text-xs">On-call Engineer</TableHead>
                <TableHead className="text-xs">Backup</TableHead>
                <TableHead className="text-xs text-center">P1</TableHead>
                <TableHead className="text-xs text-center">P2</TableHead>
                <TableHead className="text-xs">Shift</TableHead>
                <TableHead className="text-xs">Escalation Path</TableHead>
                <TableHead className="text-xs">Contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {oncallList.map((entry) => (
                <TableRow key={entry.team} className={entry.activeP1 > 0 ? "bg-red-50/40" : entry.activeP2 > 0 ? "bg-amber-50/30" : ""}>
                  <TableCell>
                    <div>
                      <p className="text-xs font-medium text-slate-700">{entry.team}</p>
                      <p className="text-[11px] text-muted-foreground">{entry.domain}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${entry.activeP1 > 0 ? "bg-red-500" : entry.activeP2 > 0 ? "bg-amber-500" : "bg-emerald-400"}`} />
                      <span className="text-xs font-medium">{entry.oncall}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{entry.backup}</TableCell>
                  <TableCell className="text-center">
                    {entry.activeP1 > 0
                      ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-700 text-xs font-bold">{entry.activeP1}</span>
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    {entry.activeP2 > 0
                      ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">{entry.activeP2}</span>
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtShift(entry.shiftStart)}–{fmtShift(entry.shiftEnd)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5 flex-wrap">
                      {entry.escalationPath.map((step, i) => (
                        <span key={i} className="flex items-center gap-0.5">
                          <span className="text-[11px] text-slate-600">{step}</span>
                          {i < entry.escalationPath.length - 1 && <ChevronRight className="h-2.5 w-2.5 text-slate-300 shrink-0" />}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <a href={`tel:${entry.phone}`} title={entry.phone} className="p-1 rounded hover:bg-slate-100 text-muted-foreground hover:text-slate-700 transition-colors">
                        <Phone className="h-3 w-3" />
                      </a>
                      <span className="text-[11px] text-muted-foreground hover:text-slate-600 cursor-pointer" title="Slack">
                        <MessageSquare className="h-3 w-3" />
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
                  {queueList.map((item) => (
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
              {mttrTrendData.length > 0 && (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={mttrTrendData} margin={{ left: 0 }}>
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
            <CardContent className="space-y-2">
              {incidentsList.slice(0, 5).map((inc) => (
                <div
                  key={inc.id}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors group"
                  onClick={() => setSelectedIncident(inc as Incident)}
                  title={`View details for ${inc.id}`}
                >
                  <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${inc.severity === "P1" ? "bg-red-500" : inc.severity === "P2" ? "bg-amber-500" : "bg-blue-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{inc.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-mono text-primary">{inc.id}</span>
                      <span className="text-xs text-muted-foreground">{inc.age}</span>
                      <Badge variant={inc.acknowledged ? "secondary" : "destructive"} className="text-[10px] px-1 py-0">
                        {inc.acknowledged ? "ACK" : "UNACK"}
                      </Badge>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-1 transition-opacity" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <IncidentDetailModal
        incident={selectedIncident}
        open={!!selectedIncident}
        onClose={() => setSelectedIncident(null)}
      />
    </div>
  );
}
