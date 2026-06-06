type ModelRow = {
  model: string;
  requests: number;
  total_tokens: number;
  total_cost: number;
};

type Sub2apiUsageResponse = {
  summary?: Record<string, number>;
  models?: ModelRow[];
  total_records?: number;
};

type OpencodeUsageKey = "rollingUsage" | "weeklyUsage" | "monthlyUsage";

type OpencodeUsageItem = {
  status: string;
  resetInSec: number;
  usagePercent: number;
};

type OpencodeUsageResponse = {
  data?: Record<OpencodeUsageKey, OpencodeUsageItem>;
};

const defaultApiBase = import.meta.env.PUBLIC_API_MONITOR_BASE_URL || "http://127.0.0.1:8787";
const defaultMonitorToken = import.meta.env.PUBLIC_API_MONITOR_TOKEN || "local-monitor";
const apiBase = window.localStorage.getItem("api-monitor-base-url") || defaultApiBase;
const monitorToken = window.localStorage.getItem("api-monitor-token") || defaultMonitorToken;

let activeRange = "today";
let tokenUnit: "raw" | "k" | "m" = "m";
let latestSummary: Record<string, number> = {};
let latestModels: ModelRow[] = [];

const statusEl = document.querySelector<HTMLElement>("[data-monitor-status]");
const rangeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-range]"));
const tokenUnitButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-token-unit]"));
const refreshButton = document.querySelector<HTMLButtonElement>("[data-refresh]");
const modelTable = document.querySelector<HTMLTableSectionElement>("[data-model-table]");
const modelCount = document.querySelector<HTMLElement>("[data-model-count]");
const tokenHeading = document.querySelector<HTMLElement>("[data-token-heading]");
const opencodeStatus = document.querySelector<HTMLElement>("[data-opencode-status]");

function setStatus(message: string, state: "ok" | "error" = "ok") {
  if (!statusEl) {
    return;
  }

  statusEl.dataset.state = state;
  const text = statusEl.querySelector("span:last-child");
  if (text) {
    text.textContent = message;
  }
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      Authorization: `Bearer ${monitorToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function loadMonitorData() {
  setStatus("正在加载 API 使用数据");
  refreshButton?.setAttribute("disabled", "true");

  try {
    const [sub2api, opencode] = await Promise.allSettled([
      loadSub2apiData(),
      loadOpencodeGoData(),
    ]);

    if (sub2api.status === "rejected" && opencode.status === "rejected") {
      throw new Error("所有数据源加载失败");
    }

    setStatus(`已更新 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "加载失败";
    setStatus(message, "error");
  } finally {
    refreshButton?.removeAttribute("disabled");
  }
}

async function loadSub2apiData() {
  const usage = await requestJson<Sub2apiUsageResponse>(`/sub2api/usage?range=${activeRange}`);

  latestSummary = usage.summary || {};
  latestModels = usage.models || [];

  renderSummary(latestSummary);
  renderModels(latestModels);
  if (modelCount) {
    modelCount.textContent = `${latestModels.length} 个模型 · ${usage.total_records || 0} 条记录`;
  }
}

async function loadOpencodeGoData() {
  try {
    const usage = await requestJson<OpencodeUsageResponse>("/opencode-go/usage");
    renderOpencodeGo(usage.data);
    if (opencodeStatus) {
      opencodeStatus.textContent = "已连接";
    }
  } catch (error) {
    renderOpencodeGo();
    if (opencodeStatus) {
      opencodeStatus.textContent = error instanceof Error ? error.message : "加载失败";
    }
    throw error;
  }
}

function renderSummary(data: Record<string, number>) {
  const tokenKeys = ["total_tokens", "total_input_tokens", "total_output_tokens", "total_cache_tokens"];

  for (const key of ["total_requests", ...tokenKeys]) {
    const element = document.querySelector<HTMLElement>(`[data-metric="${key}"]`);
    if (element) {
      element.textContent = tokenKeys.includes(key) ? formatTokens(data[key]) : formatNumber(data[key]);
    }
  }

  const cost = document.querySelector<HTMLElement>('[data-metric="total_cost"]');
  if (cost) {
    cost.textContent = formatCost(data.total_cost);
  }
}

function renderModels(rows: ModelRow[]) {
  if (!modelTable) {
    return;
  }

  if (rows.length === 0) {
    modelTable.innerHTML = '<tr><td colspan="4">暂无数据</td></tr>';
    return;
  }

  modelTable.innerHTML = rows
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.model)}</td>
        <td>${formatNumber(row.requests)}</td>
        <td>${formatTokens(row.total_tokens)}</td>
        <td>${formatCost(row.total_cost)}</td>
      </tr>`,
    )
    .join("");
}

function renderOpencodeGo(data?: Record<OpencodeUsageKey, OpencodeUsageItem>) {
  for (const key of ["rollingUsage", "weeklyUsage", "monthlyUsage"] as OpencodeUsageKey[]) {
    const item = data?.[key];
    const percent = document.querySelector<HTMLElement>(`[data-opencode-percent="${key}"]`);
    const bar = document.querySelector<HTMLElement>(`[data-opencode-bar="${key}"]`);
    const reset = document.querySelector<HTMLElement>(`[data-opencode-reset="${key}"]`);
    const card = document.querySelector<HTMLElement>(`[data-opencode-card="${key}"]`);

    if (percent) {
      percent.textContent = item ? `${item.usagePercent}%` : "--";
    }
    if (bar) {
      bar.style.width = item ? `${clamp(item.usagePercent, 0, 100)}%` : "0%";
    }
    if (reset) {
      reset.textContent = item ? `重置 ${formatDuration(item.resetInSec)}` : "--";
    }
    if (card) {
      card.dataset.state = item?.status || "unknown";
    }
  }
}


function formatNumber(value?: number) {
  return typeof value === "number" ? new Intl.NumberFormat("zh-CN").format(value) : "--";
}

function formatTokens(value?: number) {
  if (typeof value !== "number") {
    return "--";
  }

  if (tokenUnit === "m") {
    return `${formatCompact(value / 1_000_000)} M`;
  }

  if (tokenUnit === "k") {
    return `${formatCompact(value / 1_000)} K`;
  }

  return formatNumber(value);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: value >= 10 ? 1 : 2,
    minimumFractionDigits: value > 0 && value < 1 ? 2 : 0,
  }).format(value);
}

function formatCost(value?: number) {
  return typeof value === "number" ? `$${value.toFixed(4)}` : "--";
}

function formatDuration(totalSeconds: number) {
  let seconds = totalSeconds;
  const days = Math.floor(seconds / 86400);
  seconds -= days * 86400;
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  const minutes = Math.floor(seconds / 60);

  const parts = [];
  if (days) {
    parts.push(`${days}d`);
  }
  if (hours) {
    parts.push(`${hours}h`);
  }
  if (minutes) {
    parts.push(`${minutes}m`);
  }
  if (parts.length === 0) {
    parts.push(`${Math.max(0, seconds)}s`);
  }

  return parts.join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}

function syncTokenHeading() {
  if (!tokenHeading) {
    return;
  }

  tokenHeading.textContent = tokenUnit === "raw" ? "Tokens" : `Tokens (${tokenUnit.toUpperCase()})`;
}

for (const button of rangeButtons) {
  button.addEventListener("click", () => {
    activeRange = button.dataset.range || "today";
    for (const item of rangeButtons) {
      item.setAttribute("aria-pressed", String(item === button));
    }
    void loadMonitorData();
  });
}

for (const button of tokenUnitButtons) {
  button.addEventListener("click", () => {
    tokenUnit = (button.dataset.tokenUnit as "raw" | "k" | "m") || "m";
    for (const item of tokenUnitButtons) {
      item.setAttribute("aria-pressed", String(item === button));
    }
    syncTokenHeading();
    renderSummary(latestSummary);
    renderModels(latestModels);
  });
}

refreshButton?.addEventListener("click", () => {
  void loadMonitorData();
});

syncTokenHeading();
void loadMonitorData();
