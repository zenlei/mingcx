import { makeLabel, requireElement, setStatus } from "../dom";
import { createToolHistory } from "../history";
import type { ToolHistoryItem } from "../storage";

const input = requireElement<HTMLTextAreaElement>("#base64-input");
const output = requireElement<HTMLTextAreaElement>("#base64-output");
const swapButton = requireElement<HTMLButtonElement>('[data-base64-action="swap"]');
const history = createToolHistory("base64", restore);

document.querySelectorAll<HTMLButtonElement>("[data-base64-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.base64Action;
    if (action === "encode") {
      encode();
    }
    if (action === "decode") {
      decode();
    }
    if (action === "swap") {
      swap();
    }
  });
});

history.render();

function encode() {
  try {
    const nextOutput = bytesToBase64(new TextEncoder().encode(input.value));
    output.value = nextOutput;
    swapButton.disabled = false;
    setStatus("已编码");
    history.add({
      label: makeLabel(input.value, "空文本"),
      mode: "编码",
      input: input.value,
      output: nextOutput,
    });
  } catch {
    output.value = "";
    swapButton.disabled = true;
    setStatus("编码失败", true);
  }
}

function decode() {
  try {
    const nextOutput = new TextDecoder("utf-8", { fatal: true }).decode(base64ToBytes(input.value.trim()));
    output.value = nextOutput;
    swapButton.disabled = false;
    setStatus("已解码");
    history.add({
      label: makeLabel(input.value, "空文本"),
      mode: "解码",
      input: input.value,
      output: nextOutput,
    });
  } catch {
    output.value = "";
    swapButton.disabled = true;
    setStatus("请输入有效的 Base64 文本", true);
  }
}

function swap() {
  const currentInput = input.value;
  input.value = output.value;
  output.value = currentInput;
  setStatus("已交换输入输出");
}

function restore(item: ToolHistoryItem) {
  input.value = item.input;
  output.value = item.output;
  swapButton.disabled = !item.output;
  setStatus(`已复用：${item.mode}`);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 === 1) {
    throw new Error("Invalid Base64");
  }

  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
