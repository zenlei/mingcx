# Sub2API Monitor Worker

Read-only API proxy for Sub2API usage monitoring. It keeps the Sub2API JWT on the server side, strips sensitive fields from recent usage records, and aggregates model usage for dashboard pages.

## Secrets

Set these in the Worker project:

```bash
wrangler secret put SUB2API_JWT
wrangler secret put SUB2API_REFRESH_TOKEN
wrangler secret put MONITOR_API_TOKEN
wrangler secret put OPENCODE_GO_WORKSPACE_ID
wrangler secret put OPENCODE_GO_AUTH_COOKIE
```

`MONITOR_API_TOKEN` is optional, but recommended. When set, clients must send either:

```http
Authorization: Bearer <MONITOR_API_TOKEN>
```

or:

```http
X-Monitor-Token: <MONITOR_API_TOKEN>
```

`SUB2API_REFRESH_TOKEN` is optional. When set, the Worker can refresh the Sub2API access JWT if it is expired or if Sub2API returns `401`.

`OPENCODE_GO_AUTH_COOKIE` should contain the raw `auth` cookie value, without the `auth=` prefix.

## Vars

Configured in `wrangler.toml`:

```toml
SUB2API_BASE_URL = "https://your-sub2api.example.com"
CORS_ORIGIN = "*"
CACHE_TTL_SECONDS = "120"
DEFAULT_TIMEZONE = "Asia/Shanghai"
WORKER_ROUTE_PREFIX = "/monitor"
```

Set `CORS_ORIGIN` to your Pages domain in production.

`WORKER_ROUTE_PREFIX` lets the same Worker run at both the root path and a custom route such as `https://your-domain.example/monitor/*`.

## Endpoints

### `GET /health`

No auth required.

If the Worker is mounted at `/monitor/*`, use `/monitor/health`, `/monitor/sub2api/usage`, and `/monitor/opencode-go/usage`.

### `GET /sub2api/usage?range=today`

Supported ranges:

- `today`
- `5d`
- `7d`
- `30d`

Returns aggregate Sub2API stats and Sub2API model distribution for the selected Beijing-time date window.

The Worker caps pagination at 30 pages with 100 records per page. Increase `MAX_PAGES` in `src/index.ts` if your account has more records than that in the selected window.

### `GET /opencode-go/usage`

Returns OpenCode Go rolling, weekly, and monthly usage percentages plus reset timers. It does not return the workspace cookie or workspace ID.

## Local Development

```bash
npm run worker:dev
```

## Deploy

```bash
npm run worker:deploy
```
