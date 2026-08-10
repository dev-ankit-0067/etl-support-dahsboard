// Token-aware fetch for the hand-written (non-generated) API calls.
// AuthContext keeps the current Cognito ID token here so requests carry a bearer.
// (The generated React-Query client attaches the token separately via
// setAuthTokenGetter — this covers the raw fetch() call sites.)

let _token: string | null = null;

export function setApiToken(token: string | null): void {
  _token = token;
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (_token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${_token}`);
  }
  return fetch(input, { ...init, headers });
}
