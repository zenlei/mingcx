import {
  clearToolHistory,
  createHistoryItem,
  readToolHistory,
  saveToolHistoryItem,
  type ToolHistoryItem,
} from "./storage";

interface HistoryController {
  add: (entry: Omit<ToolHistoryItem, "id" | "createdAt">) => void;
  render: () => void;
}

export function createToolHistory(toolId: string, onRestore: (item: ToolHistoryItem) => void): HistoryController {
  const list = document.querySelector<HTMLUListElement>("[data-history-list]");
  const empty = document.querySelector<HTMLElement>("[data-history-empty]");
  const clearButton = document.querySelector<HTMLButtonElement>("[data-history-clear]");

  clearButton?.addEventListener("click", () => {
    clearToolHistory(toolId);
    render();
  });

  function render() {
    if (!list || !empty || !clearButton) {
      return;
    }

    const history = readToolHistory(toolId);
    list.textContent = "";
    empty.hidden = history.length > 0;
    clearButton.disabled = history.length === 0;

    history.forEach((item) => {
      const row = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.historyItem = item.id;
      button.innerHTML = `
        <span class="history-title"></span>
        <span class="history-meta">${formatHistoryTime(item.createdAt)} · ${escapeHtml(item.mode)}</span>
        <span class="history-action">复用</span>
      `;

      const title = button.querySelector<HTMLElement>(".history-title");
      if (title) {
        title.textContent = item.label;
      }

      button.addEventListener("click", () => onRestore(item));
      row.append(button);
      list.append(row);
    });
  }

  return {
    add(entry) {
      saveToolHistoryItem(toolId, createHistoryItem(entry));
      render();
    },
    render,
  };
}

function formatHistoryTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "未知时间";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
