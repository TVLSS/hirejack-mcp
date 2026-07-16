// Thin wrapper around HireJack's public REST API.
// No Origin/Referer headers → server-side calls pass isAllowedOrigin().

const DEFAULT_API_BASE = "https://hirejack.com/api";

export const API_BASE = process.env.HIREJACK_API_BASE || DEFAULT_API_BASE;
export const SITE_BASE = process.env.HIREJACK_SITE_BASE || "https://hirejack.com";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiOptions = {
  /** When set, sent as `Authorization: Bearer <authToken>`. Required for any
   *  endpoint that calls `requireAuth` on the server. */
  authToken?: string;
};

export async function apiGet<T = unknown>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  opts: ApiOptions = {},
): Promise<T> {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {
    "User-Agent": "hirejack-mcp/0.3",
  };
  if (opts.authToken) headers["Authorization"] = `Bearer ${opts.authToken}`;

  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const body: any = await resp.json();
      if (body?.error) msg = body.error;
    } catch {
      /* swallow */
    }
    throw new ApiError(resp.status, msg);
  }
  return resp.json() as Promise<T>;
}

export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
  opts: ApiOptions = {},
): Promise<T> {
  const url = new URL(API_BASE + path);
  const headers: Record<string, string> = {
    "User-Agent": "hirejack-mcp/0.3",
    "Content-Type": "application/json",
  };
  if (opts.authToken) headers["Authorization"] = `Bearer ${opts.authToken}`;

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const j: any = await resp.json();
      if (j?.error) msg = j.error;
    } catch {
      /* swallow */
    }
    throw new ApiError(resp.status, msg);
  }
  return resp.json() as Promise<T>;
}

export async function apiPut<T = unknown>(
  path: string,
  body: unknown,
  opts: ApiOptions = {},
): Promise<T> {
  const url = new URL(API_BASE + path);
  const headers: Record<string, string> = {
    "User-Agent": "hirejack-mcp/0.3",
    "Content-Type": "application/json",
  };
  if (opts.authToken) headers["Authorization"] = `Bearer ${opts.authToken}`;

  const resp = await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const j: any = await resp.json();
      if (j?.error) msg = j.error;
    } catch {
      /* swallow */
    }
    throw new ApiError(resp.status, msg);
  }
  return resp.json() as Promise<T>;
}

export function siteUrl(path: string): string {
  return SITE_BASE + path;
}
