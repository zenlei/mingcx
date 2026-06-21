import { parseAllDocuments } from "yaml";
import type { Document, YAMLParseError, YAMLWarning } from "yaml";
import { makeLabel, requireElement, setStatus } from "../dom";
import { createToolHistory } from "../history";
import type { ToolHistoryItem } from "../storage";

type YamlAction = "format" | "validate" | "to-json";

const input = requireElement<HTMLTextAreaElement>("#yaml-input");
const output = requireElement<HTMLTextAreaElement>("#yaml-output");
const history = createToolHistory("yaml-formatter", restore);

document.querySelectorAll<HTMLButtonElement>("[data-yaml-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.yamlAction;
    if (action === "format" || action === "validate" || action === "to-json") {
      runYaml(action);
    }
  });
});

history.render();

function runYaml(mode: YamlAction) {
  const source = input.value;

  try {
    const docs = parseYaml(source);
    const nextOutput = createOutput(docs, mode);
    const nextStatus = createStatus(docs, mode);

    output.value = nextOutput;
    setStatus(nextStatus);
    history.add({
      label: makeLabel(source, "空 YAML"),
      mode: nextStatus,
      input: source,
      output: nextOutput,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "无法解析 YAML";
    output.value = "";
    setStatus(message, true);
  }
}

function parseYaml(source: string): Document[] {
  if (!source.trim()) {
    throw new Error("请输入 YAML 内容");
  }

  const docs = parseAllDocuments(source, { prettyErrors: true });

  if (docs.length === 0) {
    throw new Error("请输入 YAML 内容");
  }

  const errors = docs.flatMap((doc) => doc.errors);
  if (errors.length > 0) {
    throw new Error(formatDiagnostic(errors[0]));
  }

  return docs;
}

function createOutput(docs: Document[], mode: YamlAction) {
  if (mode === "validate") {
    return docs.length === 1 ? "YAML 有效" : `YAML 有效，共 ${docs.length} 个文档`;
  }

  if (mode === "to-json") {
    const values = docs.map((doc) => doc.toJSON());
    const payload = values.length === 1 ? values[0] : values;
    return JSON.stringify(payload, null, 2);
  }

  return docs.map((doc) => doc.toString({ directives: false, indent: 2, lineWidth: 0 }).trimEnd()).join("\n---\n");
}

function createStatus(docs: Document[], mode: YamlAction) {
  const warningCount = docs.reduce((count, doc) => count + doc.warnings.length, 0);
  const suffix = warningCount > 0 ? `，${warningCount} 个警告` : "";

  if (mode === "validate") {
    return docs.length === 1 ? `YAML 有效${suffix}` : `YAML 有效，共 ${docs.length} 个文档${suffix}`;
  }

  if (mode === "to-json") {
    return `已转为 JSON${suffix}`;
  }

  return `已格式化${suffix}`;
}

function formatDiagnostic(diagnostic: YAMLParseError | YAMLWarning) {
  const location = diagnostic.linePos?.[0];
  const prefix = location ? `第 ${location.line} 行第 ${location.col} 列：` : "";
  return `${prefix}${diagnostic.message}`;
}

function restore(item: ToolHistoryItem) {
  input.value = item.input;
  output.value = item.output;
  setStatus(`已复用：${item.mode}`);
}
