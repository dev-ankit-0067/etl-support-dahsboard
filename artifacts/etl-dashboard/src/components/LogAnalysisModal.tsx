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
import { useState, Fragment, type ReactNode } from "react";
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

// ---- Lightweight markdown renderer ---------------------------------------
// The LLM emits markdown (bold, inline code, bullet/numbered lists). We render
// the common subset without pulling in a markdown library. Output is built from
// React nodes (no dangerouslySetInnerHTML), so LLM text can't inject HTML.

const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const NUMBERED_RE = /^\s*(\d+)[.)]\s+(.*)$/;

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // **bold** | `code` | *italic*
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\n]+)\*)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={key++} className="font-semibold text-slate-900">{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(
        <code key={key++} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-800">
          {m[3]}
        </code>,
      );
    } else if (m[4] !== undefined) {
      nodes.push(<em key={key++}>{m[4]}</em>);
    }
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (BULLET_RE.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        items.push(<li key={key++}>{renderInline(lines[i].replace(BULLET_RE, "$1"))}</li>);
        i++;
      }
      blocks.push(<ul key={key++} className="list-disc space-y-0.5 pl-4">{items}</ul>);
      continue;
    }
    if (NUMBERED_RE.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && NUMBERED_RE.test(lines[i])) {
        items.push(<li key={key++}>{renderInline(lines[i].replace(NUMBERED_RE, "$2"))}</li>);
        i++;
      }
      blocks.push(<ol key={key++} className="list-decimal space-y-0.5 pl-4">{items}</ol>);
      continue;
    }
    if (line.trim() === "") {
      i++;
      continue;
    }
    // Gather consecutive plain lines into one paragraph (preserving soft breaks).
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !BULLET_RE.test(lines[i]) && !NUMBERED_RE.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++}>
        {para.map((l, idx) => (
          <Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInline(l.replace(/^#{1,6}\s+/, ""))}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className={className}>{blocks}</div>;
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
          <MarkdownLite
            text={section.content}
            className="space-y-1.5 pr-3 text-xs leading-relaxed text-slate-700 [&_code]:break-all"
          />
        </ScrollArea>
      ) : (
        <MarkdownLite
          text={section.content}
          className="space-y-1.5 text-xs leading-relaxed text-slate-700"
        />
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
