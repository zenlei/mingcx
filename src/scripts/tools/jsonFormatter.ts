import { makeLabel, requireElement, setStatus } from "../dom";
import { createToolHistory } from "../history";
import type { ToolHistoryItem } from "../storage";

const input = requireElement<HTMLTextAreaElement>("#json-input");
const output = requireElement<HTMLTextAreaElement>("#json-output");
const history = createToolHistory("json-formatter", restore);

document.querySelectorAll<HTMLButtonElement>("[data-json-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.jsonAction;
    if (action === "format" || action === "minify" || action === "validate") {
      runJson(action);
    }
  });
});

history.render();

function runJson(mode: "format" | "minify" | "validate") {
  try {
    const parsed = JSON.parse(input.value);
    const nextOutput = mode === "minify" ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2);
    const nextStatus = mode === "validate" ? "JSON 有效" : mode === "minify" ? "已压缩" : "已格式化";

    output.value = nextOutput;
    setStatus(nextStatus);
    history.add({
      label: makeLabel(input.value, "空 JSON"),
      mode: nextStatus,
      input: input.value,
      output: nextOutput,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "无法解析 JSON";
    output.value = "";
    setStatus(message, true);
  }
}

function restore(item: ToolHistoryItem) {
  input.value = item.input;
  output.value = item.output;
  setStatus(`已复用：${item.mode}`);
}
