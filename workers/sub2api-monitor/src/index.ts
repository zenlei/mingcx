type Env = {
  SUB2API_BASE_URL: string;
  SUB2API_JWT: string;
  SUB2API_REFRESH_TOKEN?: string;
  MONITOR_API_TOKEN?: string;
  CORS_ORIGIN?: string;
  CACHE_TTL_SECONDS?: string;
  DEFAULT_TIMEZONE?: string;
  WORKER_ROUTE_PREFIX?: string;
  OPENCODE_GO_WORKSPACE_ID?: string;
  OPENCODE_GO_AUTH_COOKIE?: string;
};

type UsageStatsData = {
  total_requests?: number;
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_cache_tokens?: number;
  total_tokens?: number;
  total_cost?: number;
  total_actual_cost?: number;
  average_duration_ms?: number;
};

type UsageItem = {
  id: number;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  total_cost?: number;
  actual_cost?: number;
  duration_ms?: number;
  created_at?: string;
  api_key_id?: number;
  group_id?: number;
  request_type?: string;
  stream?: boolean;
};

type UsageListData = {
  items?: UsageItem[];
  total?: number;
  page?: number;
  page_size?: number;
  pages?: number;
};

type ApiEnvelope<T> = {
  code?: number;
  message?: string;
  data?: T;
};

type AuthRefreshData = {
  access_token?: string;
  token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

type OpencodeGoUsageItem = {
  status: string;
  resetInSec: number;
  usagePercent: number;
};

type OpencodeGoUsage = {
  rollingUsage: OpencodeGoUsageItem;
  weeklyUsage: OpencodeGoUsageItem;
  monthlyUsage: OpencodeGoUsageItem;
};

const RANGE_DAYS: Record<string, number> = {
  today: 1,
  "5d": 5,
  "7d": 7,
  "30d": 30,
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 30;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    const url = new URL(request.url);
    const pathname = normalizePathname(url.pathname, env);

    if (pathname === "/health") {
      return json({ ok: true, service: "sub2api-monitor" }, env);
    }

    if (!isAuthorized(request, env)) {
      return json({ error: "Unauthorized" }, env, 401);
    }

    try {
      if (request.method === "GET" && pathname === "/sub2api/usage") {
        const range = parseRange(url);
        return await cached(request, env, ctx, async () => {
          const [summary, list] = await Promise.all([
            fetchUsageStats(env, range),
            fetchUsageItems(env, range),
          ]);
          return json({
            range,
            summary,
            models: aggregateByModel(list.items || []),
            total_records: list.total,
          }, env);
        });
      }

      if (request.method === "GET" && pathname === "/opencode-go/usage") {
        return await cached(request, env, ctx, async () => {
          const data = await fetchOpencodeGoUsage(env);
          return json({ data }, env);
        });
      }

      return json({ error: "Not found" }, env, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return json({ error: message }, env, 502);
    }
  },
};

function normalizePathname(pathname: string, env: Env): string {
  const prefix = normalizeRoutePrefix(env.WORKER_ROUTE_PREFIX || "/monitor");
  if (!prefix || pathname === prefix) {
    return pathname === prefix ? "/" : pathname;
  }

  if (pathname.startsWith(`${prefix}/`)) {
    return pathname.slice(prefix.length) || "/";
  }

  return pathname;
}

function normalizeRoutePrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") {
    return "";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function isAuthorized(request: Request, env: Env): boolean {
  if (!env.MONITOR_API_TOKEN) {
    return true;
  }

  const authorization = request.headers.get("Authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const apiToken = request.headers.get("X-Monitor-Token");

  return bearer === env.MONITOR_API_TOKEN || apiToken === env.MONITOR_API_TOKEN;
}

function parseRange(url: URL) {
  const value = url.searchParams.get("range") || "today";
  const days = RANGE_DAYS[value];

  if (!days) {
    throw new Error("Invalid range. Use today, 5d, 7d, or 30d.");
  }

  const end = new Date();
  const start = startOfShanghaiDay(end, days - 1);

  return {
    key: value,
    start_date: toDateParam(start),
    end_date: toDateParam(end),
  };
}

function startOfShanghaiDay(now: Date, daysBack: number): Date {
  const shanghaiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  shanghaiNow.setUTCDate(shanghaiNow.getUTCDate() - daysBack);
  shanghaiNow.setUTCHours(0, 0, 0, 0);
  return new Date(shanghaiNow.getTime() - 8 * 60 * 60 * 1000);
}

function toDateParam(date: Date): string {
  const shanghai = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return shanghai.toISOString().slice(0, 10);
}

async function fetchUsageStats(env: Env, range: ReturnType<typeof parseRange>): Promise<UsageStatsData> {
  const response = await sub2apiFetch<ApiEnvelope<UsageStatsData>>(
    env,
    `/api/v1/usage/stats?start_date=${encodeURIComponent(range.start_date)}&end_date=${encodeURIComponent(range.end_date)}`,
  );

  return response.data || {};
}

async function fetchUsageItems(env: Env, range: ReturnType<typeof parseRange>): Promise<UsageListData> {
  const first = await fetchUsagePage(env, {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    startDate: range.start_date,
    endDate: range.end_date,
  });
  const pages = Math.min(first.pages || 1, MAX_PAGES);
  const items = [...(first.items || [])];

  for (let page = 2; page <= pages; page += 1) {
    const next = await fetchUsagePage(env, {
      page,
      pageSize: DEFAULT_PAGE_SIZE,
      startDate: range.start_date,
      endDate: range.end_date,
    });
    items.push(...(next.items || []));
  }

  return {
    ...first,
    items,
  };
}

async function fetchUsagePage(
  env: Env,
  options: { page: number; pageSize: number; startDate?: string; endDate?: string },
): Promise<UsageListData> {
  const params = new URLSearchParams({
    page: String(options.page),
    page_size: String(options.pageSize),
  });

  if (options.startDate) {
    params.set("start_date", options.startDate);
  }
  if (options.endDate) {
    params.set("end_date", options.endDate);
  }

  const response = await sub2apiFetch<ApiEnvelope<UsageListData>>(env, `/api/v1/usage?${params.toString()}`);
  return response.data || {};
}

async function sub2apiFetch<T>(env: Env, path: string): Promise<T> {
  const token = await getSub2apiAccessToken(env);

  const baseUrl = getSub2apiBaseUrl(env);
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  let response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 && env.SUB2API_REFRESH_TOKEN) {
    const refreshed = await refreshSub2apiAccessToken(env);
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${refreshed}`,
      },
    });
  }

  const text = await response.text();
  const data = text ? (JSON.parse(text) as T) : ({} as T);

  if (!response.ok) {
    throw new Error(`Sub2API request failed: ${response.status}`);
  }

  return data;
}

async function fetchOpencodeGoUsage(env: Env): Promise<OpencodeGoUsage> {
  if (!env.OPENCODE_GO_WORKSPACE_ID || !env.OPENCODE_GO_AUTH_COOKIE) {
    throw new Error("OpenCode Go credentials are not configured.");
  }

  const url = `https://opencode.ai/workspace/${encodeURIComponent(env.OPENCODE_GO_WORKSPACE_ID)}/go`;
  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
      Cookie: `auth=${env.OPENCODE_GO_AUTH_COOKIE}`,
      "User-Agent": "online-tools-monitor/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`OpenCode Go request failed: ${response.status}`);
  }

  const html = await response.text();
  const usage = parseOpencodeGoUsage(html);
  if (!usage) {
    throw new Error("OpenCode Go usage data was not found.");
  }

  return usage;
}

function parseOpencodeGoUsage(html: string): OpencodeGoUsage | null {
  const usagePattern =
    /rollingUsage:[^=]*=\{status:"([^"]+)",resetInSec:(\d+),usagePercent:(\d+)\},weeklyUsage:[^=]*=\{status:"([^"]+)",resetInSec:(\d+),usagePercent:(\d+)\},monthlyUsage:[^=]*=\{status:"([^"]+)",resetInSec:(\d+),usagePercent:(\d+)\}/;

  const match = html.match(usagePattern);
  if (!match) {
    return null;
  }

  return {
    rollingUsage: {
      status: match[1],
      resetInSec: Number(match[2]),
      usagePercent: Number(match[3]),
    },
    weeklyUsage: {
      status: match[4],
      resetInSec: Number(match[5]),
      usagePercent: Number(match[6]),
    },
    monthlyUsage: {
      status: match[7],
      resetInSec: Number(match[8]),
      usagePercent: Number(match[9]),
    },
  };
}

async function getSub2apiAccessToken(env: Env): Promise<string> {
  if (env.SUB2API_JWT && !isJwtExpired(env.SUB2API_JWT)) {
    return env.SUB2API_JWT;
  }

  if (env.SUB2API_REFRESH_TOKEN) {
    return refreshSub2apiAccessToken(env);
  }

  if (!env.SUB2API_JWT) {
    throw new Error("SUB2API_JWT is not configured.");
  }

  throw new Error("SUB2API_JWT is expired and SUB2API_REFRESH_TOKEN is not configured.");
}

async function refreshSub2apiAccessToken(env: Env): Promise<string> {
  if (!env.SUB2API_REFRESH_TOKEN) {
    throw new Error("SUB2API_REFRESH_TOKEN is not configured.");
  }

  const baseUrl = getSub2apiBaseUrl(env);
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ refresh_token: env.SUB2API_REFRESH_TOKEN }),
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as ApiEnvelope<AuthRefreshData> | AuthRefreshData) : {};

  if (!response.ok) {
    throw new Error(`Sub2API refresh failed: ${response.status}`);
  }

  const data = getRefreshData(payload);
  const token = data?.access_token || data?.token;

  if (!token) {
    throw new Error("Sub2API refresh response did not include an access token.");
  }

  return token;
}

function getSub2apiBaseUrl(env: Env): string {
  if (!env.SUB2API_BASE_URL) {
    throw new Error("SUB2API_BASE_URL is not configured.");
  }

  return env.SUB2API_BASE_URL;
}

function getRefreshData(payload: ApiEnvelope<AuthRefreshData> | AuthRefreshData): AuthRefreshData | undefined {
  if ("access_token" in payload || "token" in payload || "refresh_token" in payload) {
    return payload;
  }

  if ("data" in payload) {
    return payload.data;
  }

  return undefined;
}

function isJwtExpired(token: string): boolean {
  const payload = token.split(".")[1];
  if (!payload) {
    return false;
  }

  try {
    const decoded = JSON.parse(base64UrlDecode(payload)) as { exp?: number };
    if (!decoded.exp) {
      return false;
    }

    return Date.now() >= (decoded.exp - 60) * 1000;
  } catch {
    return false;
  }
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function aggregateByModel(items: UsageItem[]) {
  const models = new Map<string, UsageStatsData & { model: string; requests: number }>();

  for (const item of items) {
    const model = item.model || "unknown";
    const current =
      models.get(model) ||
      ({
        model,
        requests: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cache_tokens: 0,
        total_tokens: 0,
        total_cost: 0,
        total_actual_cost: 0,
      } satisfies UsageStatsData & { model: string; requests: number });

    const input = item.input_tokens || 0;
    const output = item.output_tokens || 0;
    const cache = (item.cache_creation_tokens || 0) + (item.cache_read_tokens || 0);
    const total = input + output + cache;

    current.requests += 1;
    current.total_input_tokens = (current.total_input_tokens || 0) + input;
    current.total_output_tokens = (current.total_output_tokens || 0) + output;
    current.total_cache_tokens = (current.total_cache_tokens || 0) + cache;
    current.total_tokens = (current.total_tokens || 0) + total;
    current.total_cost = (current.total_cost || 0) + (item.total_cost || 0);
    current.total_actual_cost = (current.total_actual_cost || 0) + (item.actual_cost || item.total_cost || 0);

    models.set(model, current);
  }

  return [...models.values()].sort((a, b) => (b.total_tokens || 0) - (a.total_tokens || 0));
}

async function cached(request: Request, env: Env, ctx: ExecutionContext, handler: () => Promise<Response>): Promise<Response> {
  const ttl = clampNumber(Number(env.CACHE_TTL_SECONDS || "120"), 0, 3600);
  if (ttl === 0 || request.headers.get("Cache-Control")?.includes("no-cache")) {
    return handler();
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  const hit = await cache.match(cacheKey);
  if (hit) {
    return withCors(hit, env);
  }

  const response = await handler();
  const cacheable = new Response(response.body, response);
  cacheable.headers.set("Cache-Control", `public, max-age=${ttl}`);
  ctx.waitUntil(cache.put(cacheKey, cacheable.clone()));
  return cacheable;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function json(data: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(env),
    },
  });
}

function withCors(response: Response, env: Env): Response {
  const next = new Response(response.body, response);
  for (const [key, value] of Object.entries(corsHeaders(env))) {
    next.headers.set(key, value);
  }
  return next;
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Monitor-Token",
    "Access-Control-Max-Age": "86400",
  };
}
