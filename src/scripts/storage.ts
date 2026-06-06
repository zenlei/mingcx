export const MAX_HISTORY_ITEMS = 20;

const STORAGE_PREFIX = "online-tools:v1";

export interface ToolHistoryItem {
  id: string;
  createdAt: string;
  label: string;
  mode: string;
  input: string;
  output: string;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) {
    return fallback;
  }

  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

function historyKey(toolId: string) {
  return `${STORAGE_PREFIX}:history:${toolId}`;
}

export function createHistoryItem(entry: Omit<ToolHistoryItem, "id" | "createdAt">): ToolHistoryItem {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    ...entry,
    id,
    createdAt: new Date().toISOString(),
  };
}

export function readToolHistory(toolId: string): ToolHistoryItem[] {
  return readJson<ToolHistoryItem[]>(historyKey(toolId), []);
}

export function saveToolHistoryItem(toolId: string, item: ToolHistoryItem): ToolHistoryItem[] {
  const next = [item, ...readToolHistory(toolId)].slice(0, MAX_HISTORY_ITEMS);
  writeJson(historyKey(toolId), next);
  return next;
}

export function clearToolHistory(toolId: string) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(historyKey(toolId));
}
