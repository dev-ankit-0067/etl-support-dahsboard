import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setProjectHeader as setClientProjectHeader } from "@workspace/api-client-react";
import { setProjectHeader as setRawProjectHeader } from "@/lib/api";

export interface AwsAccount {
  id: string; // "all" or a project tag value
  label: string;
}

interface AccountContextValue {
  account: AwsAccount;
  setAccountId: (id: string) => void;
  accounts: AwsAccount[];
  projectLoading: boolean;
}

const ALL: AwsAccount = { id: "all", label: "All Projects" };

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

function apiBase(): string {
  return (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
}

// Push the selected project to both API layers (X-Project header). null = all.
function applyProjectHeader(id: string) {
  const value = id === "all" ? null : id;
  setClientProjectHeader(value);
  setRawProjectHeader(value);
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [accounts, setAccounts] = useState<AwsAccount[]>([ALL]);
  const [accountId, setAccountIdState] = useState<string>("all");
  const [projectLoading, setProjectLoading] = useState(false);

  // Load the project options (configured tag values) from the backend.
  useEffect(() => {
    fetch(`${apiBase()}/api/projects`)
      .then((r) => r.json())
      .then((d) => {
        const projects: string[] = Array.isArray(d?.projects) ? d.projects : ["all"];
        setAccounts(
          projects.map((p) => (p === "all" ? ALL : { id: p, label: p })),
        );
      })
      .catch(() => setAccounts([ALL]));
  }, []);

  const setAccountId = useCallback(
    (id: string) => {
      applyProjectHeader(id);
      setAccountIdState(id);
      // Show a loading overlay until the refetched queries settle.
      setProjectLoading(true);
      queryClient
        .invalidateQueries()
        .finally(() => setProjectLoading(false));
    },
    [queryClient],
  );

  const account = accounts.find((a) => a.id === accountId) ?? ALL;

  return (
    <AccountContext.Provider value={{ account, setAccountId, accounts, projectLoading }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used within an AccountProvider");
  return ctx;
}
