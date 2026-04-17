import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import ExecutiveOverview from "@/pages/executive-overview";
import Incidents from "@/pages/incidents";
import Costs from "@/pages/costs";

const queryClient = new QueryClient();

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={ExecutiveOverview} />
        <Route path="/incidents" component={Incidents} />
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
