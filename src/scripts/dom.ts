export function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}

export function setStatus(message: string, isError = false) {
  const status = requireElement<HTMLElement>("[data-status]");
  const text = status.querySelector<HTMLElement>("span:last-child");
  status.dataset.state = isError ? "error" : "ok";

  if (text) {
    text.textContent = message;
  }
}

export function makeLabel(input: string, fallback: string) {
  const trimmed = input.trim().replace(/\s+/g, " ");
  return trimmed.length > 42 ? `${trimmed.slice(0, 42)}...` : trimmed || fallback;
}
