import type { ToolMeta } from "../lib/tools";

declare global {
  interface Window {
    ONLINE_TOOLS?: ToolMeta[];
  }
}

const tools = window.ONLINE_TOOLS ?? [];
const searchInput = document.querySelector<HTMLInputElement>("#tool-search");
const allTools = Array.from(document.querySelectorAll<HTMLElement>("[data-tool-card]"));
const toolCount = document.querySelector<HTMLElement>("#tool-count");
const emptyState = document.querySelector<HTMLElement>("#tool-empty");

filterTools();

searchInput?.addEventListener("input", filterTools);

function filterTools() {
  const query = searchInput?.value.trim().toLowerCase() ?? "";
  let visible = 0;

  allTools.forEach((card) => {
    const matches = !query || (card.dataset.search ?? "").includes(query);
    card.hidden = !matches;
    if (matches) {
      visible += 1;
    }
  });

  if (toolCount) {
    toolCount.textContent = `${visible} / ${tools.length}`;
  }

  if (emptyState) {
    emptyState.hidden = visible > 0;
  }
}
