import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  Loader2,
  Copy,
  AlertTriangle,
  FileText,
  Cpu,
  Search,
  ListChecks,
  ScrollText,
  ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface AnalysisResult {
  log_id: string;
  type: string;
  analysis: string;
  jira_key?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  logId: string | null;
  mode: "log" | "jira";
  isLoading: boolean;
  result: AnalysisResult | null;
  error: string | null;
}

// ---- Section parser -------------------------------------------------------

interface Section {
  title: string;
  content: string;
}

function parseSections(text: string): Section[] {
  const sections: Section[] = [];
  const regex = /\*\*([^*\n]+):\*\*\s*([\s\S]*?)(?=\n\s*\*\*[^*\n]+:\*\*|$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const content = match[2].trim();
    if (content) {
      sections.push({ title: match[1].trim(), content });
    }
  }
  return sections.length > 0 ? sections : [{ title: "Analysis", content: text }];
}

// ---- Section display helpers ----------------------------------------------

const SECTION_ICONS: Record<string, React.ReactNode> = {
  Summary:            <FileText className="h-3.5 w-3.5" />,
  Severity:           <AlertTriangle className="h-3.5 w-3.5" />,
  "Root Cause":       <Search className="h-3.5 w-3.5" />,
  "Affected Component": <Cpu className="h-3.5 w-3.5" />,
  Remediation:        <ListChecks className="h-3.5 w-3.5" />,
  Details:            <ScrollText className="h-3.5 w-3.5" />,
};

function severityClasses(text: string): string {
  if (/P1/i.test(text)) return "bg-red-100 text-red-700 border border-red-300";
  if (/P2/i.test(text)) return "bg-orange-100 text-orange-700 border border-orange-300";
  if (/P3/i.test(text)) return "bg-amber-100 text-amber-700 border border-amber-300";
  return "bg-blue-100 text-blue-700 border border-blue-300";
}

function SectionCard({ section }: { section: Section }) {
  const icon = SECTION_ICONS[section.title] ?? <FileText className="h-3.5 w-3.5" />;
  const isSeverity = section.title === "Severity";
  const isDetails = section.title === "Details";

  return (
    <div className="rounded-lg border bg-white p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {icon}
        {section.title}
      </div>
      {isSeverity ? (
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${severityClasses(section.content)}`}
        >
          {section.content}
        </span>
      ) : isDetails ? (
        <ScrollArea className="max-h-40">
          <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed pr-3">
            {section.content}
          </p>
        </ScrollArea>
      ) : (
        <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
          {section.content}
        </p>
      )}
    </div>
  );
}

// ---- Main component -------------------------------------------------------

export default function LogAnalysisModal({
  open,
  onClose,
  logId,
  mode,
  isLoading,
  result,
  error,
}: Props) {
  const [copied, setCopied] = useState(false);
  const { incidentProviderLabel } = useAuth();

  const handleCopy = () => {
    if (!result?.analysis) return;
    navigator.clipboard.writeText(result.analysis).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const sections = result ? parseSections(result.analysis) : [];
  const title =
    mode === "jira" ? `Log Analysis & ${incidentProviderLabel} Ticket` : "Error Log Analysis";

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            {title}
          </DialogTitle>
          {logId && (
            <p className="text-xs text-muted-foreground font-mono mt-1">
              Log ID: {logId}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden">
          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
              <p className="text-sm">Analysing logs with AI…</p>
              <p className="text-xs">This may take 20–60 seconds</p>
            </div>
          )}

          {/* Error */}
          {!isLoading && error && (
            <div className="flex flex-col items-center justify-center h-64 gap-2 text-center">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <p className="text-sm font-medium">Analysis failed</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          )}

          {/* Result */}
          {!isLoading && result && (
            <ScrollArea className="h-[calc(85vh-12rem)]">
              <div className="space-y-3 pr-3">
                {/* Jira ticket badge */}
                {mode === "jira" && (
                  <div
                    className={`flex items-center gap-2 rounded-lg border px-4 py-3 ${
                      result.jira_key
                        ? "bg-violet-50 border-violet-200"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <ExternalLink className="h-4 w-4 text-violet-500 shrink-0" />
                    {result.jira_key ? (
                      <>
                        <span className="text-xs text-slate-600">
                          {incidentProviderLabel} ticket created:
                        </span>
                        <span className="font-mono font-semibold text-sm text-violet-700 bg-violet-100 border border-violet-300 px-2 py-0.5 rounded">
                          {result.jira_key}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-500">
                        {incidentProviderLabel} ticket creation was not confirmed in the agent response.
                      </span>
                    )}
                  </div>
                )}

                {/* Analysis sections */}
                {sections.map((section) => (
                  <SectionCard key={section.title} section={section} />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t pt-3 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
          {result && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!result.analysis}
              className="text-xs"
            >
              <Copy className="h-3 w-3 mr-1" />
              {copied ? "Copied" : "Copy Analysis"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
