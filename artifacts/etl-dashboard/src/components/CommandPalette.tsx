import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useGetActiveIncidents, useGetPipelineRuns } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  ShieldAlert,
  DollarSign,
  Workflow,
  AlertTriangle,
  RefreshCw,
  LogOut,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuth } from "@/contexts/AuthContext";

interface IncidentLite {
  id: string;
  title?: string;
  severity?: string;
  pipeline?: string;
  owner?: string;
}
interface RunLite {
  id: string;
  pipelineName?: string;
}

const severityClass: Record<string, string> = {
  P1: "text-red-600",
  P2: "text-orange-600",
  P3: "text-amber-600",
  P4: "text-blue-600",
};

/**
 * Palette body. Kept in a child component so its data hooks only mount (and
 * fetch) while the dialog is open — Radix doesn't render dialog content when closed.
 */
function PaletteBody({ close }: { close: () => void }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const { data: incData } = useGetActiveIncidents();
  const { data: runData } = useGetPipelineRuns();

  const incidents = (Array.isArray(incData) ? incData : []) as IncidentLite[];
  const runs = (Array.isArray(runData) ? runData : []) as RunLite[];

  // Unique job names, capped for a tidy list.
  const jobs = Array.from(
    new Map(runs.map((r) => [r.pipelineName ?? r.id, r] as const)).values(),
  ).slice(0, 8);
  const incs = incidents.slice(0, 8);

  const go = (path: string) => {
    close();
    navigate(path);
  };
  const act = (fn: () => void) => {
    close();
    fn();
  };

  return (
    <>
      <CommandInput placeholder="Search pages, jobs, incidents…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Pages">
          <CommandItem value="executive overview home dashboard" onSelect={() => go("/")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Executive Overview
          </CommandItem>
          <CommandItem value="incidents incident center" onSelect={() => go("/incidents")}>
            <ShieldAlert className="mr-2 h-4 w-4" />
            Incidents
          </CommandItem>
          <CommandItem value="costs financial insights spend" onSelect={() => go("/costs")}>
            <DollarSign className="mr-2 h-4 w-4" />
            Costs &amp; Financial Insights
          </CommandItem>
        </CommandGroup>

        {incs.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Incidents">
              {incs.map((inc) => (
                <CommandItem
                  key={inc.id}
                  value={`incident ${inc.id} ${inc.title ?? ""} ${inc.pipeline ?? ""} ${inc.severity ?? ""} ${inc.owner ?? ""}`}
                  onSelect={() => go("/incidents")}
                >
                  <AlertTriangle
                    className={`mr-2 h-4 w-4 shrink-0 ${severityClass[inc.severity ?? ""] ?? "text-slate-400"}`}
                  />
                  <span className="truncate">{inc.title ?? inc.id}</span>
                  <span className="ml-auto pl-2 text-xs text-muted-foreground shrink-0">
                    {inc.severity ? `${inc.severity} · ` : ""}
                    {inc.id}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {jobs.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Jobs">
              {jobs.map((j) => (
                <CommandItem
                  key={j.id}
                  value={`job glue ${j.pipelineName ?? j.id}`}
                  onSelect={() => go("/")}
                >
                  <Workflow className="mr-2 h-4 w-4 text-slate-400" />
                  <span className="truncate">{j.pipelineName ?? j.id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="refresh reload data"
            onSelect={() => act(() => queryClient.invalidateQueries())}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh dashboard data
          </CommandItem>
          <CommandItem value="sign out log out logout" onSelect={() => act(logout)}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </>
  );
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {/* Rendered only while open (Radix mounts dialog content on open), so the
          data hooks inside don't fetch until the palette is invoked. */}
      {open && <PaletteBody close={() => onOpenChange(false)} />}
    </CommandDialog>
  );
}
