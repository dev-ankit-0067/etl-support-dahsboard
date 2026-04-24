import { Link, useLocation } from "wouter";
import {
  ShieldCheck,
  AlertTriangle,
  Search,
  Settings,
  Bell,
  RefreshCw,
  LayoutDashboard,
  DollarSign,
  Cloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useAccount } from "@/contexts/AccountContext";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { account, accounts, setAccountId } = useAccount();

  const navItems = [
    { name: "Executive Overview", path: "/", icon: LayoutDashboard },
    { name: "Incident Center", path: "/incidents", icon: AlertTriangle },
    { name: "Cost Insights", path: "/costs", icon: DollarSign },
  ];

  return (
    <div className="flex h-screen w-full bg-slate-50/50">
      {/* Sidebar */}
      <div className="hidden md:flex w-64 flex-col border-r bg-white">
        <div className="flex h-14 items-center border-b px-4">
          <div className="flex items-center gap-2 font-semibold text-primary">
            <ShieldCheck className="h-5 w-5" />
            <span>OpsGuardian</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto py-4">
          <nav className="grid gap-1 px-2">
            {navItems.map((item) => {
              const isActive = location === item.path;
              return (
                <Link key={item.path} href={item.path}>
                  <div
                    className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-3 border-b bg-white px-4 lg:px-6">
          <div className="flex flex-1 items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 text-sm text-slate-500 shrink-0">
              <Cloud className="h-3.5 w-3.5 text-slate-400" />
              <span className="whitespace-nowrap">AWS Account:</span>
              <Select value={account.id} onValueChange={setAccountId}>
                <SelectTrigger className="h-8 w-[200px]">
                  <SelectValue>
                    <span className="flex items-center gap-2 truncate">
                      <span className="font-medium text-slate-700 truncate">{account.label}</span>
                      {account.id !== "all" && (
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">{account.accountId}</span>
                      )}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="flex items-center justify-between gap-3 w-full">
                        <span className="font-medium">{a.label}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {a.id === "all" ? "all regions" : `${a.accountId} · ${a.region}`}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="h-5 w-px bg-slate-200 shrink-0" />
            <div className="flex items-center gap-2 text-sm text-slate-500 shrink-0">
              <span className="whitespace-nowrap">Environment:</span>
              <Select defaultValue="prod">
                <SelectTrigger className="h-8 w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prod">Production</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="dev">Development</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full max-w-sm hidden md:flex items-center relative ml-auto">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                type="search"
                placeholder="Search jobs, incidents..."
                className="w-full bg-slate-50 pl-8 h-9"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
              <RefreshCw className="h-3 w-3" />
              <span>Last refreshed: Just now</span>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
