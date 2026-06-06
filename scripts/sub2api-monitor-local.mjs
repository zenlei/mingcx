import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import worker from "../workers/sub2api-monitor/src/index.ts";

const env = {
  CACHE_TTL_SECONDS: "0",
  CORS_ORIGIN: "*",
  ...loadEnvFile(".env"),
  ...loadEnvFile(".env.local"),
  ...process.env,
};

const host = env.API_HOST || "127.0.0.1";
const port = Number(env.API_PORT || "8787");

const localCache = new Map();
globalThis.caches = globalThis.caches || {
  default: {
    async match(request) {
      return localCache.get(cacheKey(request));
    },
    async put(request, response) {
      localCache.set(cacheKey(request), response);
    },
  },
};

const server = createServer(async (nodeRequest, nodeResponse) => {
  try {
    const request = await toRequest(nodeRequest);
    const response = await worker.fetch(request, env, { waitUntil() {} });

    nodeResponse.writeHead(response.status, Object.fromEntries(response.headers));

    if (response.body) {
      const body = Buffer.from(await response.arrayBuffer());
      nodeResponse.end(body);
      return;
    }

    nodeResponse.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    nodeResponse.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    nodeResponse.end(JSON.stringify({ error: message }));
  }
});

server.listen(port, host, () => {
  console.log(`Sub2API monitor API listening at http://${host}:${port}`);
});

function loadEnvFile(path) {
  const fullPath = resolve(path);
  if (!existsSync(fullPath)) {
    return {};
  }

  const text = readFileSyncText(fullPath);
  const values = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    values[key] = stripQuotes(rawValue);
  }

  return values;
}

function readFileSyncText(path) {
  const buffer = readFileSync(path);
  return buffer.toString("utf8");
}

function stripQuotes(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}

async function toRequest(nodeRequest) {
  const url = `http://${nodeRequest.headers.host}${nodeRequest.url}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(nodeRequest.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const method = nodeRequest.method || "GET";
  const init = { method, headers };

  if (!["GET", "HEAD"].includes(method)) {
    init.body = await readNodeBody(nodeRequest);
  }

  return new Request(url, init);
}

async function readNodeBody(nodeRequest) {
  const chunks = [];

  for await (const chunk of nodeRequest) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function cacheKey(request) {
  return request.url;
}
