import { makeLabel, requireElement, setStatus } from "../dom";
import { createToolHistory } from "../history";
import type { ToolHistoryItem } from "../storage";

interface CredentialSpec {
  name: string;
  bytes: number;
  description: string;
}

interface CredentialEntry extends CredentialSpec {
  value: string;
}

const credentialSpecs: CredentialSpec[] = [
  {
    name: "CREDS_KEY",
    bytes: 32,
    description: "用于加密凭据的 256-bit key",
  },
  {
    name: "CREDS_IV",
    bytes: 16,
    description: "用于加密凭据的 128-bit initialization vector",
  },
  {
    name: "JWT_SECRET",
    bytes: 64,
    description: "访问令牌签名 secret",
  },
  {
    name: "JWT_REFRESH_SECRET",
    bytes: 64,
    description: "刷新令牌签名 secret",
  },
  {
    name: "MEILI_MASTER_KEY",
    bytes: 32,
    description: "Meilisearch master key",
  },
];

const list = requireElement<HTMLElement>("[data-credential-list]");
const output = requireElement<HTMLTextAreaElement>("#credentials-output");
const copyAllButton = requireElement<HTMLButtonElement>('[data-credentials-action="copy-all"]');
const downloadButton = requireElement<HTMLButtonElement>('[data-credentials-action="download"]');
const history = createToolHistory("credentials-generator", restore);

document.querySelectorAll<HTMLButtonElement>("[data-credentials-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.credentialsAction;

    if (action === "generate") {
      generate();
    }
    if (action === "copy-all") {
      copyAll();
    }
    if (action === "download") {
      downloadEnv();
    }
  });
});

history.render();

function generate() {
  try {
    const credentials = credentialSpecs.map((spec) => ({
      ...spec,
      value: randomHex(spec.bytes),
    }));
    const envOutput = toEnv(credentials);

    renderCredentials(credentials);
    output.value = envOutput;
    setActionsEnabled(true);
    setStatus("已生成 credentials");
    history.add({
      label: makeLabel(credentials[0]?.value ?? "", "Credentials"),
      mode: "生成",
      input: "Credentials",
      output: envOutput,
    });
  } catch {
    setActionsEnabled(false);
    setStatus("当前浏览器不支持安全随机数生成", true);
  }
}

async function copyAll() {
  if (!output.value.trim()) {
    setStatus("请先生成 credentials", true);
    return;
  }

  try {
    await copyText(output.value);
    setStatus("已复制全部 .env 片段");
  } catch {
    setStatus("复制失败，请手动复制输出框内容", true);
  }
}

function downloadEnv() {
  if (!output.value.trim()) {
    setStatus("请先生成 credentials", true);
    return;
  }

  const blob = new Blob([`${output.value}\n`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "credentials.env";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("已下载 .env 片段");
}

function restore(item: ToolHistoryItem) {
  output.value = item.output;
  renderCredentials(parseEnv(item.output));
  setActionsEnabled(Boolean(item.output.trim()));
  setStatus(`已复用：${item.mode}`);
}

function renderCredentials(credentials: CredentialEntry[]) {
  list.textContent = "";

  if (credentials.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state small";
    empty.textContent = "点击生成后会显示密钥。";
    list.append(empty);
    return;
  }

  credentials.forEach((credential) => {
    const row = document.createElement("div");
    row.className = "credential-row";

    const meta = document.createElement("div");
    meta.className = "credential-meta";

    const name = document.createElement("strong");
    name.textContent = credential.name;

    const description = document.createElement("span");
    description.textContent = credential.description;

    const value = document.createElement("code");
    value.textContent = credential.value;

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "ghost-button credential-copy";
    copyButton.textContent = "复制";
    copyButton.addEventListener("click", async () => {
      try {
        await copyText(`${credential.name}=${credential.value}`);
        setStatus(`已复制 ${credential.name}`);
      } catch {
        setStatus("复制失败，请手动复制", true);
      }
    });

    meta.append(name, description);
    row.append(meta, value, copyButton);
    list.append(row);
  });
}

function parseEnv(value: string): CredentialEntry[] {
  const entries: Array<[string, string]> = [];

  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const equalsIndex = line.indexOf("=");

      if (equalsIndex > 0) {
        entries.push([line.slice(0, equalsIndex), line.slice(equalsIndex + 1)]);
      }
    });

  const values = new Map(entries);

  return credentialSpecs
    .map((spec) => ({
      ...spec,
      value: values.get(spec.name) ?? "",
    }))
    .filter((credential) => credential.value);
}

function toEnv(credentials: CredentialEntry[]) {
  return credentials.map((credential) => `${credential.name}=${credential.value}`).join("\n");
}

function randomHex(bytesLength: number) {
  const bytes = new Uint8Array(bytesLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function setActionsEnabled(enabled: boolean) {
  copyAllButton.disabled = !enabled;
  downloadButton.disabled = !enabled;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      fallbackCopyText(value);
      return;
    }
  }

  fallbackCopyText(value);
}

function fallbackCopyText(value: string) {
  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.inset = "0 auto auto 0";
  textArea.style.opacity = "0";
  document.body.append(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  window.getSelection()?.removeAllRanges();
  textArea.remove();
}
