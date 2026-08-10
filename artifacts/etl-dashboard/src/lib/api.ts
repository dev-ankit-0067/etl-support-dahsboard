// Token-aware fetch for the hand-written (non-generated) API calls.
// AuthContext keeps the current Cognito ID token here so requests carry a bearer.
// (The generated React-Query client attaches the token separately via
// setAuthTokenGetter — this covers the raw fetch() call sites.)

let _token: string | null = null;
let _onUnauthorized: (() => void) | null = null;

export function setApiToken(token: string | null): void {
  _token = token;
}

// Registered by AuthContext; invoked whenever an API call returns 401 so the
// session can be cleared and the user redirected to the login page.
export function setOnUnauthorized(cb: (() => void) | null): void {
  _onUnauthorized = cb;
}

export function notifyUnauthorized(): void {
  _onUnauthorized?.();
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (_token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${_token}`);
  }
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) notifyUnauthorized();
  return res;
}
