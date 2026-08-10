// Minimal Cognito User Pool auth via the public InitiateAuth API (USER_PASSWORD_AUTH).
// No SDK dependency — the SPA only needs the region + app client id.

export interface CognitoConfig {
  region: string;
  userPoolId: string;
  clientId: string;
}

export interface Tokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

async function cognitoCall(region: string, target: string, body: unknown): Promise<any> {
  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const type = String(data.__type || "").split("#").pop();
    // Friendlier message for the common case.
    if (type === "NotAuthorizedException" || type === "UserNotFoundException") {
      throw new Error("Incorrect username or password.");
    }
    throw new Error(data.message || type || `Cognito error ${res.status}`);
  }
  return data;
}

function toTokens(r: any): Tokens {
  return {
    idToken: r.IdToken,
    accessToken: r.AccessToken,
    refreshToken: r.RefreshToken ?? "",
    expiresAt: Date.now() + (r.ExpiresIn ?? 3600) * 1000,
  };
}

export async function passwordLogin(cfg: CognitoConfig, username: string, password: string): Promise<Tokens> {
  const data = await cognitoCall(cfg.region, "InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: cfg.clientId,
    AuthParameters: { USERNAME: username, PASSWORD: password },
  });
  if (data.ChallengeName) {
    throw new Error(`Additional sign-in step required (${data.ChallengeName}). Contact an administrator.`);
  }
  return toTokens(data.AuthenticationResult);
}

export async function refreshTokens(cfg: CognitoConfig, refreshToken: string): Promise<Tokens> {
  const data = await cognitoCall(cfg.region, "InitiateAuth", {
    AuthFlow: "REFRESH_TOKEN_AUTH",
    ClientId: cfg.clientId,
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  });
  const t = toTokens(data.AuthenticationResult);
  if (!t.refreshToken) t.refreshToken = refreshToken; // refresh flow doesn't return a new one
  return t;
}

export function decodeJwt(token: string): Record<string, any> {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return {};
  }
}
