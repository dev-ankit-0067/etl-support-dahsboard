import { createContext, useContext, useState, type ReactNode } from "react";

export interface AwsAccount {
  id: string;
  label: string;
  accountId: string;
  scale: number;
  region: string;
}

export const AWS_ACCOUNTS: AwsAccount[] = [
  { id: "all", label: "All Projects", accountId: "—", scale: 1.0, region: "global" },
  { id: "payments-platform", label: "Payments Platform", accountId: "PRJ-1042", scale: 0.32, region: "us-east-1" },
  { id: "customer-data-hub", label: "Customer Data Hub", accountId: "PRJ-1108", scale: 0.24, region: "us-east-1" },
  { id: "analytics-ml", label: "Analytics & ML", accountId: "PRJ-1175", scale: 0.18, region: "us-west-2" },
  { id: "marketing-attribution", label: "Marketing Attribution", accountId: "PRJ-1213", scale: 0.12, region: "us-east-1" },
  { id: "supply-chain-ops", label: "Supply Chain Ops", accountId: "PRJ-1287", scale: 0.09, region: "us-east-2" },
  { id: "sandbox-dev", label: "Sandbox / Dev", accountId: "PRJ-9001", scale: 0.05, region: "us-east-2" },
];

interface AccountContextValue {
  account: AwsAccount;
  setAccountId: (id: string) => void;
  accounts: AwsAccount[];
}

const AccountContext = createContext<AccountContextValue | undefined>(undefined);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string>("all");
  const account = AWS_ACCOUNTS.find((a) => a.id === accountId) ?? AWS_ACCOUNTS[0];
  return (
    <AccountContext.Provider value={{ account, setAccountId, accounts: AWS_ACCOUNTS }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used within an AccountProvider");
  return ctx;
}
