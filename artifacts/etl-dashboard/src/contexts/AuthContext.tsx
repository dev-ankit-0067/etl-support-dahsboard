import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { setApiToken } from "@/lib/api";
import {
  passwordLogin,
  refreshTokens,
  decodeJwt,
  type CognitoConfig,
  type Tokens,
} from "@/lib/cognito";

const STORAGE_KEY = "opsg.auth.tokens";

interface AuthUser {
  username: string;
  email?: string;
}

interface AuthContextValue {
  loading: boolean;
  authRequired: boolean; // true once a Cognito pool/client is configured
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function loadStored(): Tokens | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

function store(tokens: Tokens | null) {
  try {
    if (tokens) localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function userFromToken(idToken: string): AuthUser {
  const claims = decodeJwt(idToken);
  return {
    username: claims["cognito:username"] || claims["username"] || claims.sub || "user",
    email: claims.email,
  };
}

function base(): string {
  return (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<CognitoConfig | null>(null);
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const [loading, setLoading] = useState(true);

  // Keep both API layers' bearer token in sync with the session:
  // the generated React-Query client and the raw apiFetch helper.
  useEffect(() => {
    setAuthTokenGetter(() => tokens?.idToken ?? null);
    setApiToken(tokens?.idToken ?? null);
    return () => {
      setAuthTokenGetter(null);
      setApiToken(null);
    };
  }, [tokens]);

  // Bootstrap: fetch runtime config, then restore/refresh any stored session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let cfg: CognitoConfig | null = null;
      try {
        const res = await fetch(`${base()}/api/config`);
        const data = await res.json();
        const c = data?.cognito;
        if (c?.userPoolId && c?.clientId) {
          cfg = { region: c.region, userPoolId: c.userPoolId, clientId: c.clientId };
        }
      } catch {
        /* config unavailable → treat auth as not configured */
      }
      if (cancelled) return;
      setConfig(cfg);

      if (cfg) {
        let t = loadStored();
        if (t && t.expiresAt <= Date.now() && t.refreshToken) {
          try {
            t = await refreshTokens(cfg, t.refreshToken);
            store(t);
          } catch {
            t = null;
            store(null);
          }
        }
        if (t && t.expiresAt <= Date.now()) {
          t = null;
          store(null);
        }
        if (!cancelled) setTokens(t);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      if (!config) throw new Error("Authentication is not configured.");
      const t = await passwordLogin(config, username.trim(), password);
      store(t);
      setTokens(t);
    },
    [config],
  );

  const logout = useCallback(() => {
    store(null);
    setTokens(null);
  }, []);

  const authRequired = !!config;
  const isAuthenticated = authRequired ? !!tokens && tokens.expiresAt > Date.now() : true;
  const user = tokens ? userFromToken(tokens.idToken) : null;

  return (
    <AuthContext.Provider
      value={{ loading, authRequired, isAuthenticated, user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
