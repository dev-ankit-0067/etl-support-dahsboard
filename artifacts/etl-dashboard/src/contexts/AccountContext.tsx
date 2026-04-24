import { createContext, useContext, useState, type ReactNode } from "react";

export interface AwsAccount {
  id: string;
  label: string;
  accountId: string;
  scale: number;
  region: string;
}

export const AWS_ACCOUNTS: AwsAccount[] = [
  { id: "all", label: "All Accounts", accountId: "—", scale: 1.0, region: "global" },
  { id: "prod-payments", label: "prod-payments", accountId: "957382641029", scale: 0.42, region: "us-east-1" },
  { id: "prod-data-platform", label: "prod-data-platform", accountId: "203847561234", scale: 0.30, region: "us-east-1" },
  { id: "prod-analytics-ml", label: "prod-analytics-ml", accountId: "748392051023", scale: 0.18, region: "us-west-2" },
  { id: "dev-sandbox", label: "dev-sandbox", accountId: "512874039128", scale: 0.10, region: "us-east-2" },
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
