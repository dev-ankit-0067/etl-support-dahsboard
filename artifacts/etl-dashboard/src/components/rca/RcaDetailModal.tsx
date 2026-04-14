import { useQuery } from "@tanstack/react-query";
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
  Link2,
  Wrench,
  FileSearch,
  ListChecks,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

interface RcaDetail {
  id: string;
  incidentTitle: string;
  pipeline: string;
  rcaStatus: string;
  daysOpen: number;
  actionItems: number;
  completedActions: number;
  severity: string;
  domain: string;
  detectedAt: string;
  resolvedAt: string | null;
  fixedBy: string | null;
  rootCause: string;
  contributingFactors: string[];
  bugFixDescription: string | null;
  resolution: string | null;
  affectedIncidents: string[];
  actionItemsList: Array<{
    id: number;
    description: string;
    status: string;
    assignee: string;
  }>;
  postMortemUrl: string | null;
  changeCorrelated: string | null;
}

interface Props {
  rcaId: string | null;
  open: boolean;
  onClose: () => void;
}

const RCA_STATUS_STYLES: Record<string, { badge: string; dot: string }> = {
  "In Progress": { badge: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  "Pending Review": { badge: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  "Completed": { badge: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  "Open": { badge: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500" },
};

const ACTION_STATUS_STYLES: Record<string, string> = {
  Completed: "text-emerald-600",
  "In Progress": "text-blue-600",
  Pending: "text-slate-400",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function ActionItem({ item }: { item: RcaDetail["actionItemsList"][number] }) {
  return (
    <div className="flex items-start gap-3 py-2">
      {item.status === "Completed" ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5 fill-emerald-100" />
      ) : item.status === "In Progress" ? (
        <Circle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5 fill-blue-100" />
      ) : (
        <Circle className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${item.status === "Completed" ? "line-through text-muted-foreground" : "text-slate-700"}`}>
          {item.description}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs font-medium ${ACTION_STATUS_STYLES[item.status] || "text-slate-400"}`}>
            {item.status}
          </span>
          <span className="text-xs text-muted-foreground">· {item.assignee}</span>
        </div>
      </div>
    </div>
  );
}

export default function RcaDetailModal({ rcaId, open, onClose }: Props) {
  const { data, isLoading } = useQuery<RcaDetail>({
    queryKey: ["rca-detail", rcaId],
    queryFn: async () => {
      const res = await fetch(`/api/rca/detail/${rcaId}`);
      if (!res.ok) throw new Error("Failed to load RCA");
      return res.json();
    },
    enabled: open && !!rcaId,
  });

  const statusStyle = RCA_STATUS_STYLES[data?.rcaStatus ?? ""] ?? RCA_STATUS_STYLES["Open"];
  const completionPct = data && data.actionItems > 0
    ? Math.round((data.completedActions / data.actionItems) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {isLoading || !data ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
            Loading RCA details...
          </div>
        ) : (
          <>
            {/* Header */}
            <DialogHeader className="px-6 pt-6 pb-4 border-b bg-slate-50 rounded-t-lg">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-200">
                  <FileSearch className="h-5 w-5 text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <DialogTitle className="text-base font-mono text-slate-500">{data.id}</DialogTitle>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusStyle.badge}`}>
                      {data.rcaStatus}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-slate-100 text-slate-600 border-slate-200">
                      {data.severity} · {data.domain}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 mt-1 leading-snug">{data.incidentTitle}</p>
                </div>
              </div>
            </DialogHeader>

            <div className="px-6 py-5 space-y-6">
              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Pipeline</span>
                  <span className="font-mono text-xs font-medium text-slate-700">{data.pipeline}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Detected</span>
                  <span className="font-medium text-slate-700">{fmt(data.detectedAt)}</span>
                </div>
                {data.fixedBy && (
                  <div className="flex items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Fixed by</span>
                    <span className="font-medium text-slate-700">{data.fixedBy}</span>
                  </div>
                )}
                {data.resolvedAt && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Resolved</span>
                    <span className="font-medium text-slate-700">{fmt(data.resolvedAt)}</span>
                  </div>
                )}
                {data.changeCorrelated && (
                  <div className="flex items-start gap-2 col-span-2">
                    <Link2 className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground shrink-0">Change</span>
                    <span className="text-xs font-medium text-amber-700">{data.changeCorrelated}</span>
                  </div>
                )}
                {data.affectedIncidents.length > 0 && (
                  <div className="flex items-center gap-2 col-span-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">Incidents</span>
                    <div className="flex gap-1 flex-wrap">
                      {data.affectedIncidents.map((id) => (
                        <span key={id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono bg-red-50 text-red-600 border border-red-200">{id}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Root Cause */}
              <div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-slate-400" />
                  Root Cause
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed bg-red-50 border border-red-100 rounded-lg p-3">
                  {data.rootCause}
                </p>
              </div>

              {data.contributingFactors.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">Contributing Factors</h3>
                  <ul className="space-y-1">
                    {data.contributingFactors.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                        <ChevronRight className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.bugFixDescription && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-slate-400" />
                      Bug Fix Details
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                      {data.bugFixDescription}
                    </p>
                  </div>
                </>
              )}

              {data.resolution && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 mb-2">Resolution Summary</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{data.resolution}</p>
                </div>
              )}

              {!data.bugFixDescription && !data.resolution && (
                <div className="rounded-lg border border-dashed bg-slate-50 p-3 text-center text-sm text-muted-foreground">
                  Investigation in progress — fix details not yet available.
                </div>
              )}

              <Separator />

              {/* Action Items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-slate-400" />
                    Action Items
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {data.completedActions}/{data.actionItems} complete · {completionPct}%
                  </span>
                </div>
                <Progress value={completionPct} className="h-1.5 mb-3" />
                {data.actionItemsList.length > 0 ? (
                  <div className="divide-y">
                    {data.actionItemsList.map((item) => (
                      <ActionItem key={item.id} item={item} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">No action items defined yet.</p>
                )}
              </div>

              {data.postMortemUrl && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Post-mortem document available</span>
                    <a
                      href={data.postMortemUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
                    >
                      Open Post-mortem
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
