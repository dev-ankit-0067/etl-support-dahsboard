import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { notifyUnauthorized } from "@/lib/api";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import ExecutiveOverview from "@/pages/executive-overview";
import Incidents from "@/pages/incidents";
import Costs from "@/pages/costs";
import Login from "@/pages/login";
import { AccountProvider } from "@/contexts/AccountContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

const queryClient = new QueryClient({
  // Any 401 from a generated hook → clear the session and redirect to login.
  queryCache: new QueryCache({
    onError: (error) => {
      if ((error as { status?: number })?.status === 401) notifyUnauthorized();
    },
  }),
});

function Redirect({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(to, { replace: true });
  }, [to, navigate]);
  return null;
}

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function ProtectedDashboard() {
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

function AppRoutes() {
  const { loading, isAuthenticated, authRequired } = useAuth();

  if (loading) return <FullScreenSpinner />;

  const needLogin = authRequired && !isAuthenticated;

  return (
    <Switch>
      <Route path="/login">{needLogin ? <Login /> : <Redirect to="/" />}</Route>
      <Route>{needLogin ? <Redirect to="/login" /> : <ProtectedDashboard />}</Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AccountProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AppRoutes />
            </WouterRouter>
            <Toaster />
          </AccountProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
