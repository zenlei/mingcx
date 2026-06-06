import { requireElement, setStatus } from "../dom";
import { createToolHistory } from "../history";
import type { ToolHistoryItem } from "../storage";

const timestampInput = requireElement<HTMLInputElement>("#timestamp-input");
const dateInput = requireElement<HTMLInputElement>("#date-input");
const output = requireElement<HTMLTextAreaElement>("#timestamp-output");
const history = createToolHistory("timestamp", restore);

const now = new Date();
timestampInput.value = String(now.getTime());
dateInput.value = toDateTimeLocalValue(now);

document.querySelectorAll<HTMLButtonElement>("[data-time-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.timeAction;
    if (action === "timestamp-to-date") {
      convertTimestamp();
    }
    if (action === "date-to-timestamp") {
      convertDate();
    }
    if (action === "now") {
      useNow();
    }
  });
});

history.render();

function convertTimestamp() {
  const parsed = parseTimestamp(timestampInput.value);

  if (!parsed) {
    output.value = "";
    setStatus("请输入 Unix 秒或毫秒时间戳", true);
    return;
  }

  const { date, unit } = parsed;
  const nextOutput = formatDateOutput(date);
  output.value = nextOutput;
  dateInput.value = toDateTimeLocalValue(date);
  setStatus(`已按 Unix ${unit} 转换`);
  history.add({
    label: timestampInput.value.trim(),
    mode: `时间戳转日期（${unit}）`,
    input: timestampInput.value,
    output: nextOutput,
  });
}

function convertDate() {
  const date = new Date(dateInput.value);

  if (Number.isNaN(date.getTime())) {
    output.value = "";
    setStatus("请选择有效的日期时间", true);
    return;
  }

  const nextOutput = [
    `Unix 秒：${Math.floor(date.getTime() / 1000)}`,
    `Unix 毫秒：${date.getTime()}`,
    `ISO：${date.toISOString()}`,
    `本地：${date.toLocaleString("zh-CN")}`,
  ].join("\n");

  timestampInput.value = String(date.getTime());
  output.value = nextOutput;
  setStatus("已转换为时间戳");
  history.add({
    label: date.toLocaleString("zh-CN"),
    mode: "日期转时间戳",
    input: dateInput.value,
    output: nextOutput,
  });
}

function useNow() {
  const date = new Date();
  timestampInput.value = String(date.getTime());
  dateInput.value = toDateTimeLocalValue(date);
  output.value = formatDateOutput(date);
  setStatus("已填入当前时间");
}

function restore(item: ToolHistoryItem) {
  if (item.mode.startsWith("日期")) {
    dateInput.value = item.input;
  } else {
    timestampInput.value = item.input;
  }
  output.value = item.output;
  setStatus(`已复用：${item.mode}`);
}

function parseTimestamp(value: string) {
  const normalized = value.trim();

  if (!/^-?\d+$/.test(normalized)) {
    return null;
  }

  const numberValue = Number(normalized);
  if (!Number.isSafeInteger(numberValue)) {
    return null;
  }

  const unit = Math.abs(numberValue) < 10_000_000_000 ? "秒" : "毫秒";
  const date = new Date(unit === "秒" ? numberValue * 1000 : numberValue);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return { date, unit };
}

function formatDateOutput(date: Date) {
  return [
    `本地：${date.toLocaleString("zh-CN")}`,
    `ISO：${date.toISOString()}`,
    `Unix 秒：${Math.floor(date.getTime() / 1000)}`,
    `Unix 毫秒：${date.getTime()}`,
  ].join("\n");
}

function toDateTimeLocalValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
