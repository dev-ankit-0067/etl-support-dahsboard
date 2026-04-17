import { useGetRcaLifecycle, useGetRepeatIncidents } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  User,
  Tag,
  Globe,
  TrendingUp,
  FileSearch,
  RotateCcw,
  Layers,
  ArrowUpRight,
  Wrench,
} from "lucide-react";

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

interface Props {
  incident: Incident | null;
  open: boolean;
  onClose: () => void;
}

const SEVERITY_STYLES: Record<string, string> = {
  P1: "bg-red-100 text-red-700 border-red-300",
  P2: "bg-amber-100 text-amber-700 border-amber-300",
  P3: "bg-blue-100 text-blue-700 border-blue-300",
  P4: "bg-slate-100 text-slate-600 border-slate-300",
};

const STATUS_STYLES: Record<string, string> = {
  Investigating: "bg-blue-100 text-blue-700 border-blue-300",
  Mitigating: "bg-amber-100 text-amber-700 border-amber-300",
  Monitoring: "bg-purple-100 text-purple-700 border-purple-300",
  Open: "bg-red-100 text-red-700 border-red-300",
  Resolved: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

const RCA_STATUS_STYLES: Record<string, string> = {
  "In Progress": "bg-blue-100 text-blue-700 border-blue-200",
  "Pending Review": "bg-amber-100 text-amber-700 border-amber-200",
  "Completed": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Open": "bg-red-100 text-red-700 border-red-200",
};

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function LifecycleStep({
  label,
  sublabel,
  state,
  isLast,
}: {
  label: string;
  sublabel?: string;
  state: "done" | "active" | "pending";
  isLast?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`flex items-center justify-center w-7 h-7 rounded-full border-2 shrink-0 ${
          state === "done"   ? "border-emerald-500 bg-emerald-50 text-emerald-600" :
          state === "active" ? "border-blue-500 bg-blue-50 text-blue-600 ring-2 ring-blue-200" :
                              "border-slate-200 bg-white text-slate-300"
        }`}>
          {state === "done" ? (
            <CheckCircle2 className="h-4 w-4 fill-emerald-500 text-white" />
          ) : state === "active" ? (
            <Circle className="h-3.5 w-3.5 fill-blue-500 text-blue-500" />
          ) : (
            <Circle className="h-3.5 w-3.5" />
          )}
        </div>
        {!isLast && (
          <div className={`w-0.5 flex-1 my-1 ${state === "done" ? "bg-emerald-300" : "bg-slate-100"}`} />
        )}
      </div>
      <div className="pb-5 min-w-0">
        <p className={`text-sm font-medium ${
          state === "active" ? "text-blue-700" :
          state === "done"   ? "text-slate-700" :
                              "text-slate-400"
        }`}>{label}</p>
        {sublabel && (
          <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
        )}
      </div>
    </div>
  );
}

function EscalationDots({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-2.5 h-2.5 rounded-full ${i <= level ? "bg-red-400" : "bg-slate-200"}`}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">L{level}</span>
    </div>
  );
}

export default function IncidentDetailModal({ incident, open, onClose }: Props) {
  const { data: lifecycle } = useGetRcaLifecycle();
  const { data: repeats } = useGetRepeatIncidents();

  if (!incident) return null;

  const rcaEntry = lifecycle?.find((r: { pipeline: string }) => r.pipeline === incident.pipeline);
  const repeatEntry = repeats?.find((r: { pipeline: string }) => r.pipeline === incident.pipeline);
  const isResolved = incident.status === "Resolved";

  const statusOrder = ["Open", "Investigating", "Mitigating", "Monitoring", "Resolved"];
  const currentIdx = statusOrder.indexOf(incident.status);

  function stepState(stepStatus: string): "done" | "active" | "pending" {
    const stepIdx = statusOrder.indexOf(stepStatus);
    if (stepIdx < currentIdx) return "done";
    if (stepIdx === currentIdx) return "active";
    return "pending";
  }

  const createdDate = fmt(incident.createdAt);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-slate-50 rounded-t-lg">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg border ${
              incident.severity === "P1" ? "bg-red-50 border-red-200" :
              incident.severity === "P2" ? "bg-amber-50 border-amber-200" :
              "bg-blue-50 border-blue-200"
            }`}>
              <AlertTriangle className={`h-5 w-5 ${
                incident.severity === "P1" ? "text-red-500" :
                incident.severity === "P2" ? "text-amber-500" :
                "text-blue-500"
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-base font-mono text-slate-500">{incident.id}</DialogTitle>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${SEVERITY_STYLES[incident.severity] || ""}`}>
                  {incident.severity}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLES[incident.status] || ""}`}>
                  {incident.status}
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-900 mt-1 leading-snug">{incident.title}</p>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Job</span>
              <span className="font-mono text-xs font-medium text-slate-700 truncate">{incident.pipeline}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Domain</span>
              <span className="font-medium text-slate-700">{incident.domain}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Owner</span>
              <span className="font-medium text-slate-700">{incident.owner}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Age</span>
              <span className="font-medium text-slate-700">{incident.age}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Escalation</span>
              <EscalationDots level={incident.escalationLevel} />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Detected</span>
              <span className="font-medium text-slate-700">{createdDate}</span>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-400" />
              Incident Lifecycle
            </h3>
            <div className="pl-1">
              <LifecycleStep label="Detected" sublabel={`Alert triggered at ${createdDate}`} state="done" />
              <LifecycleStep
                label="Acknowledged"
                sublabel={incident.acknowledged ? `Acknowledged by ${incident.owner}` : "Pending acknowledgement"}
                state={incident.acknowledged ? "done" : (currentIdx >= 1 ? "active" : "pending")}
              />
              <LifecycleStep label="Investigating" sublabel="Root cause analysis underway" state={stepState("Investigating")} />
              <LifecycleStep label="Mitigating" sublabel="Fix in progress or applied" state={stepState("Mitigating")} />
              <LifecycleStep label="Monitoring" sublabel="Observing system stability post-fix" state={stepState("Monitoring")} />
              <LifecycleStep label="Resolved" sublabel="Incident closed, RCA documented" state={stepState("Resolved")} isLast />
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-slate-400" />
              Root Cause Analysis
            </h3>
            {isResolved ? (
              <div className="rounded-lg border bg-slate-50 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{rcaEntry?.id || incident.id}</span>
                    <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm font-medium text-slate-700">{rcaEntry?.incidentTitle || incident.title}</span>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${RCA_STATUS_STYLES[rcaEntry?.rcaStatus || "Completed"] || ""}`}>
                    {rcaEntry?.rcaStatus || "Completed"}
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-6">
                  {rcaEntry?.rcaSummary || "A schema mismatch introduced during the latest upstream release caused repeated job failures until the pipeline was rolled back and the source contract was corrected."}
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center rounded-md border bg-white p-3">
                    <p className="text-lg font-bold text-slate-800">{rcaEntry?.daysOpen || 3}d</p>
                    <p className="text-xs text-muted-foreground">Days Open</p>
                  </div>
                  <div className="text-center rounded-md border bg-white p-3">
                    <p className="text-lg font-bold text-slate-800">{rcaEntry?.completedActions || 4}</p>
                    <p className="text-xs text-muted-foreground">Actions Done</p>
                  </div>
                  <div className="text-center rounded-md border bg-white p-3">
                    <p className="text-lg font-bold text-slate-800">{rcaEntry?.actionItems || 4}</p>
                    <p className="text-xs text-muted-foreground">Total Actions</p>
                  </div>
                </div>
                <div className="rounded-md border bg-white p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key Findings</p>
                  <ul className="text-sm text-slate-700 list-disc pl-5 space-y-1">
                    <li>Upstream schema drift introduced an unexpected field change.</li>
                    <li>Validation rules did not fail fast before the transformation step.</li>
                    <li>Retry behavior amplified the impact by repeatedly reprocessing failed batches.</li>
                  </ul>
                </div>
                <div className="rounded-md border bg-white p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fix Applied</p>
                  <ul className="text-sm text-slate-700 list-disc pl-5 space-y-1">
                    <li>Rolled back the offending upstream release and revalidated the source contract.</li>
                    <li>Added schema checks and fail-fast validation before job execution.</li>
                    <li>Reduced retry count to prevent repeated cost amplification during failures.</li>
                  </ul>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs text-muted-foreground">Action Items Completion</p>
                    <p className="text-xs font-medium text-slate-700">
                      {rcaEntry && rcaEntry.actionItems > 0
                        ? Math.round((rcaEntry.completedActions / rcaEntry.actionItems) * 100)
                        : 0}%
                    </p>
                  </div>
                  <Progress
                    value={rcaEntry && rcaEntry.actionItems > 0 ? (rcaEntry.completedActions / rcaEntry.actionItems) * 100 : 0}
                    className="h-2"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-slate-50 p-4 text-center text-sm text-muted-foreground">
                No RCA record found for this pipeline yet.
              </div>
            )}
          </div>

          {repeatEntry && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-slate-400" />
                  Recurring Pattern
                </h3>
                <div className="rounded-lg border bg-amber-50 border-amber-200 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-amber-700 font-medium">Repeat occurrences for this pipeline</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${
                      repeatEntry.count >= 5
                        ? "bg-red-100 text-red-700 border-red-200"
                        : "bg-amber-100 text-amber-700 border-amber-200"
                    }`}>
                      {repeatEntry.count}x
                    </span>
                  </div>
                  <p className="text-sm text-amber-900 font-medium">{repeatEntry.pattern}</p>
                  <p className="text-xs text-amber-700">Last occurrence: {fmt(repeatEntry.lastOccurrence)}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
