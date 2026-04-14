import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import ExecutiveOverview from "@/pages/executive-overview";
import LivePipelines from "@/pages/live-pipelines";
import Performance from "@/pages/performance";
import Incidents from "@/pages/incidents";
import Rca from "@/pages/rca";
import Costs from "@/pages/costs";

const queryClient = new QueryClient();

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={ExecutiveOverview} />
        <Route path="/pipelines" component={LivePipelines} />
        <Route path="/performance" component={Performance} />
        <Route path="/incidents" component={Incidents} />
        <Route path="/rca" component={Rca} />
        <Route path="/costs" component={Costs} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
