// Token-aware fetch for the hand-written (non-generated) API calls.
// AuthContext keeps the current Cognito ID token here so requests carry a bearer.
// (The generated React-Query client attaches the token separately via
// setAuthTokenGetter — this covers the raw fetch() call sites.)

let _token: string | null = null;
let _project: string | null = null;
let _onUnauthorized: (() => void) | null = null;

export function setApiToken(token: string | null): void {
  _token = token;
}

// The selected project tag filter, sent as the X-Project header (null = all).
export function setProjectHeader(project: string | null): void {
  _project = project;
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
  const sentToken = _token !== null && !headers.has("Authorization");
  if (sentToken) {
    headers.set("Authorization", `Bearer ${_token}`);
  }
  if (_project && !headers.has("X-Project")) {
    headers.set("X-Project", _project);
  }
  const res = await fetch(input, { ...init, headers });
  // Only treat a 401 as session expiry when this request actually carried a
  // bearer token — token-less calls (e.g. during bootstrap) 401 harmlessly.
  if (res.status === 401 && sentToken) notifyUnauthorized();
  return res;
}
