import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Download,
  Loader2,
  ScrollText,
  AlertCircle,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

interface LogEvent {
  timestamp: string;
  message: string;
  stream: string;
}

interface CloudWatchLogsResponse {
  jobId?: string;
  functionName?: string;
  logGroup: string;
  events: LogEvent[];
  eventCount: number;
  timestamp: string;
  error?: string;
}

interface AgentAnalyzeResponse {
  log_id: string;
  type: string;
  analysis: string;
  jira_key?: string | null;
}

type ResourceType = "job" | "lambda" | "emr" | "emr_serverless";

interface Props {
  jobId: string | null;
  jobName: string | null;
  resourceType: ResourceType;
  open: boolean;
  onClose: () => void;
}

const RESOURCE_LABEL: Record<ResourceType, string> = {
  job: "- Glue Job",
  lambda: "- Lambda",
  emr: "- EMR",
  emr_serverless: "- EMR Serverless",
};

export default function CloudWatchLogViewer({
  jobId,
  jobName,
  resourceType,
  open,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [jiraResult, setJiraResult] = useState<{ issueKey: string; issueUrl?: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<"analysis" | "jira" | null>(null);
  const { toast } = useToast();
  const { incidentProviderLabel } = useAuth();

  useEffect(() => {
    if (open) {
      setAnalysisResult(null);
      setJiraResult(null);
      setActionLoading(null);
    }
  }, [open]);

  const { data: logsData, isLoading, error } = useQuery<CloudWatchLogsResponse>({
    queryKey: ["cloudwatch-logs", resourceType, jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const endpoint =
        resourceType === "lambda"
          ? `/api/logs/lambda/${jobName}`
          : resourceType === "emr"
            ? `/api/logs/emr/${jobId}`
            : resourceType === "emr_serverless"
              ? `/api/logs/emr-serverless/${jobId}`
              : `/api/logs/job/${jobId}`;
      const res = await apiFetch(endpoint);
      if (!res.ok) throw new Error("Failed to load logs");
      return res.json();
    },
    enabled: open && !!(resourceType === "lambda" ? jobName : jobId),
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const logs = logsData?.events || [];
  const logGroup = logsData?.logGroup || "";

  const handleCopyLogs = () => {
    const logText = logs.map((e) => `[${e.timestamp}] ${e.message}`).join("\n");
    navigator.clipboard.writeText(logText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownloadLogs = () => {
    const logText = logs.map((e) => `[${e.timestamp}] ${e.message}`).join("\n");
    const element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(logText));
    element.setAttribute("download", `${jobId}-logs.txt`);
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // The agent identifies a Glue job by its run id, but a Lambda by its function name.
  const agentLogId = resourceType === "lambda" ? jobName : jobId;

  const handleRcaAnalysis = async () => {
    if (!agentLogId) return;
    setActionLoading("analysis");
    setAnalysisResult(null);
    try {
      // Point at the agentic workflow: the LangChain agent fetches the
      // CloudWatch logs itself from the identifier and returns the analysis.
      const response = await apiFetch("/api/agents/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_id: agentLogId, type: "log", resource_type: resourceType }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || "Failed to analyze logs.");
      }
      const result = (await response.json()) as AgentAnalyzeResponse;
      setAnalysisResult(result.analysis);
      toast({
        title: "RCA analysis complete",
        description: "CloudWatch logs were analyzed by the agent.",
      });
    } catch (err) {
      toast({
        title: "RCA analysis failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateJiraTicket = async () => {
    if (!agentLogId) return;
    setActionLoading("jira");
    setJiraResult(null);
    try {
      // Agentic workflow: the LangChain agent fetches the logs, analyses them,
      // and creates the ticket itself, returning the analysis + ticket key.
      const response = await apiFetch("/api/agents/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_id: agentLogId, type: "jira", resource_type: resourceType }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.detail || `Failed to create ${incidentProviderLabel} ticket.`);
      }
      const result = (await response.json()) as AgentAnalyzeResponse;
      if (result.analysis) setAnalysisResult(result.analysis);
      if (result.jira_key) {
        setJiraResult({ issueKey: result.jira_key });
        toast({
          title: `${incidentProviderLabel} ticket created`,
          description: result.jira_key,
        });
      } else {
        toast({
          title: "Analysis complete",
          description: `The agent did not return a ${incidentProviderLabel} ticket key.`,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: `${incidentProviderLabel} ticket failed`,
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" />
            CloudWatch Logs {RESOURCE_LABEL[resourceType]}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-2">
            {jobName || jobId}
          </p>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0 gap-3">
          {/* Log Group Info */}
          <div className="px-1 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              <span className="font-mono bg-slate-100 px-2 py-1 rounded">
                {logGroup}
              </span>
              <span className="ml-3">
                {logsData?.eventCount || 0} events
              </span>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRcaAnalysis}
                disabled={logs.length === 0 || actionLoading !== null}
                className="h-8 text-xs"
              >
                RCA Analysis
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCreateJiraTicket}
                disabled={logs.length === 0 || actionLoading !== null}
                className="h-8 text-xs"
              >
                Log {incidentProviderLabel} ticket
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyLogs}
                disabled={logs.length === 0}
                className="h-8 text-xs"
              >
                <Copy className="h-3 w-3 mr-1" />
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadLogs}
                disabled={logs.length === 0}
                className="h-8 text-xs"
              >
                <Download className="h-3 w-3 mr-1" />
                Download
              </Button>
            </div>
          </div>

          {/* Logs Display */}
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <p className="text-sm font-medium">Failed to load logs</p>
              <p className="text-xs text-muted-foreground">{error.message}</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
              <AlertCircle className="h-8 w-8 text-amber-500" />
              <p className="text-sm font-medium">No logs available</p>
              <p className="text-xs text-muted-foreground">
                This {resourceType === "lambda" ? "function" : "job"} may not have any log output yet.
              </p>
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 border rounded-lg bg-slate-950 text-slate-100 font-mono text-xs p-3">
                <div className="space-y-1 pr-4">
                  {logs.map((log, idx) => (
                    <div key={idx} className="text-slate-300 hover:bg-slate-900 px-2 rounded transition-colors">
                      <span className="text-slate-500">[{log.timestamp}]</span>
                      <span className="ml-2">{log.message}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {(analysisResult || jiraResult) && (
                <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm text-slate-100">
                  {analysisResult && (
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-400">RCA analysis</p>
                      <pre className="whitespace-pre-wrap text-sm leading-6">{analysisResult}</pre>
                    </div>
                  )}
                  {jiraResult && (
                    <div className="rounded-md border border-slate-700 bg-slate-950 p-3">
                      <p className="mb-1 text-xs uppercase tracking-[0.2em] text-slate-400">{incidentProviderLabel} ticket</p>
                      <p className="text-sm">Ticket ID: <span className="font-medium">{jiraResult.issueKey}</span></p>
                      {jiraResult.issueUrl && (
                        <p className="text-sm text-sky-300">
                          <a href={jiraResult.issueUrl} target="_blank" rel="noreferrer">View ticket</a>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="text-xs text-muted-foreground border-t pt-2">
          Last updated: {new Date(logsData?.timestamp || Date.now()).toLocaleString()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
