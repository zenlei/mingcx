import { makeLabel, requireElement, setStatus } from "../dom";
import { createToolHistory } from "../history";
import { calculateSoundSpeed, formatSoundSpeed } from "../soundSpeed";
import type { ToolHistoryItem } from "../storage";

type SoundSpeedMode = "fixed" | "temperature";

interface LegacyPoint {
  x?: number | string;
  y?: number | string;
  z?: number | string;
}

interface SourceDistance {
  name: string;
  distance: number;
}

interface ResultRow {
  source: SourceDistance;
  travelMs: number;
  requiredDelayMs: number;
  arrivalMs: number;
}

interface AlignmentResult {
  soundSpeed: number;
  soundSpeedMode: SoundSpeedMode;
  mode: "auto" | "locked-origin";
  extraDelayMs: number;
  lockedOriginDelayMs: number;
  originDistance: number;
  originTravelMs: number;
  originDelayMs: number;
  originArrivalMs: number;
  baseTargetArrivalMs: number;
  targetArrivalMs: number;
  anchorName: string;
  rows: ResultRow[];
}

const DEFAULT_SOUND_SPEED = 343;

const temperatureModeInput = requireElement<HTMLInputElement>("#temperature-mode-input");
const temperatureInput = requireElement<HTMLInputElement>("#temperature-input");
const soundSpeedInput = requireElement<HTMLInputElement>("#sound-speed-input");
const originDelayInput = requireElement<HTMLInputElement>("#origin-delay-input");
const lockOriginDelayInput = requireElement<HTMLInputElement>("#lock-origin-delay-input");
const lockedOriginDelayInput = requireElement<HTMLInputElement>("#locked-origin-delay-input");
const extraDelayInput = requireElement<HTMLInputElement>("#extra-delay-input");
const originDistanceInput = requireElement<HTMLInputElement>("#origin-distance-input");
const sourceList = requireElement<HTMLElement>("[data-source-list]");
const addButton = requireElement<HTMLButtonElement>("[data-source-add]");
const output = requireElement<HTMLTextAreaElement>("#multi-delay-output");
const history = createToolHistory("multi-source-delay", restore);

const presets: Record<
  string,
  {
    originDistance: number;
    extraDelay: number;
    sources: SourceDistance[];
  }
> = {
  "near-far": {
    originDistance: 3,
    extraDelay: 0,
    sources: [
      { name: "S1", distance: 4 },
      { name: "S2", distance: 5 },
    ],
  },
  "small-room": {
    originDistance: 2.2,
    extraDelay: 0,
    sources: [
      { name: "L", distance: 2.4 },
      { name: "R", distance: 2.6 },
    ],
  },
  "with-headroom": {
    originDistance: 3,
    extraDelay: 1,
    sources: [
      { name: "S1", distance: 4 },
      { name: "S2", distance: 5 },
    ],
  },
};

let historyTimer: number | undefined;

temperatureModeInput.addEventListener("change", () => {
  syncSoundSpeedMode();
  calculate();
});
temperatureInput.addEventListener("input", () => {
  syncTemperatureSoundSpeed();
  calculate();
});
soundSpeedInput.addEventListener("input", () => calculate());
originDelayInput.addEventListener("input", () => calculate());
lockOriginDelayInput.addEventListener("change", () => {
  syncOriginDelayMode();
  calculate();
});
lockedOriginDelayInput.addEventListener("input", () => calculate());
extraDelayInput.addEventListener("input", () => calculate());
originDistanceInput.addEventListener("input", () => calculate());

addButton.addEventListener("click", () => {
  addSourceRow();
  calculate();
});

sourceList.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const removeButton = target.closest<HTMLButtonElement>("[data-source-remove]");
  if (!removeButton) {
    return;
  }

  const rows = sourceList.querySelectorAll("[data-source-row]");
  if (rows.length <= 1) {
    fail("至少保留一个声源点");
    return;
  }

  removeButton.closest("[data-source-row]")?.remove();
  calculate();
});

sourceList.addEventListener("input", () => calculate());

document.querySelectorAll<HTMLButtonElement>("[data-multi-delay-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    const preset = presets[button.dataset.multiDelayPreset ?? ""];

    if (!preset) {
      return;
    }

    lockOriginDelayInput.checked = false;
    syncOriginDelayMode();
    originDistanceInput.value = formatNumber(preset.originDistance, 6);
    extraDelayInput.value = formatNumber(preset.extraDelay, 6);
    sourceList.textContent = "";
    preset.sources.forEach((source) => addSourceRow(source));
    calculate();
  });
});

history.render();
syncSoundSpeedMode();
syncOriginDelayMode();
calculate(false);

function calculate(shouldSave = true) {
  const settings = readSettings();

  if (!settings) {
    fail("请输入有效的声速、原点延迟和距离");
    return;
  }

  const sources = readSources();
  if (!sources) {
    fail("请输入有效的声源名称和距离");
    return;
  }

  const result = calculateAlignment(settings, sources);

  renderInlineResults(result);
  output.value = renderResult({
    soundSpeed: settings.soundSpeed,
    soundSpeedMode: temperatureModeInput.checked ? "temperature" : "fixed",
    ...result,
  });

  setStatus(result.mode === "locked-origin" ? "已按锁定原点延迟计算" : "已自动对齐到最晚到达点");

  if (shouldSave) {
    scheduleHistorySave(sources.length);
  }
}

function restore(item: ToolHistoryItem) {
  try {
    applyState(JSON.parse(item.input) as SavedState | LegacyState);
  } catch {
    // Older history items may only contain output text.
  }

  syncSoundSpeedMode();
  syncOriginDelayMode();
  output.value = item.output;
  setStatus(`已复用：${item.mode}`);
}

function readSettings() {
  const soundSpeed = readNumber(soundSpeedInput);
  const lockedOriginDelayMs = readNumber(lockedOriginDelayInput);
  const extraDelayMs = readNumber(extraDelayInput);
  const originDistance = readNumber(originDistanceInput);

  if (
    soundSpeed === null ||
    soundSpeed <= 0 ||
    lockedOriginDelayMs === null ||
    lockedOriginDelayMs < 0 ||
    extraDelayMs === null ||
    extraDelayMs < 0 ||
    originDistance === null ||
    originDistance < 0
  ) {
    return null;
  }

  return {
    soundSpeed,
    lockedOriginDelayMs,
    extraDelayMs,
    originDistance,
  };
}

function readSources() {
  const rows = Array.from(sourceList.querySelectorAll<HTMLElement>("[data-source-row]"));
  const sources: SourceDistance[] = [];

  for (const row of rows) {
    const nameInput = row.querySelector<HTMLInputElement>("[data-source-name]");
    const distanceInput = row.querySelector<HTMLInputElement>("[data-source-distance]");

    if (!nameInput || !distanceInput) {
      return null;
    }

    const name = nameInput.value.trim();
    const distance = readNumber(distanceInput);

    if (!name || distance === null || distance < 0) {
      return null;
    }

    sources.push({ name, distance });
  }

  return sources.length > 0 ? sources : null;
}

function readNumber(input: HTMLInputElement) {
  const value = Number(input.value.trim());
  return Number.isFinite(value) ? value : null;
}

function addSourceRow(source?: SourceDistance) {
  const index = sourceList.querySelectorAll("[data-source-row]").length + 1;
  const row = document.createElement("div");
  row.className = "source-row distance-row";
  row.dataset.sourceRow = "";
  row.innerHTML = `
    <input data-source-name aria-label="声源名称" placeholder="名称" />
    <input data-source-distance inputmode="decimal" aria-label="声源到采集点距离，单位 m" placeholder="距离 (m)" />
    <input data-source-travel readonly aria-label="声源传播时间，单位 ms" placeholder="自动计算" />
    <input data-source-delay readonly aria-label="声源延迟，单位 ms" placeholder="自动计算" />
    <button class="ghost-button icon-button" type="button" data-source-remove title="删除声源">
      <span aria-hidden="true">×</span>
      <span class="sr-only">删除声源</span>
    </button>
  `;

  row.querySelector<HTMLInputElement>("[data-source-name]")!.value = source?.name ?? `S${index}`;
  row.querySelector<HTMLInputElement>("[data-source-distance]")!.value = formatNumber(source?.distance ?? 0, 6);
  sourceList.append(row);
}

interface SavedState {
  soundSpeedMode?: SoundSpeedMode;
  temperature?: string;
  soundSpeed?: string;
  lockOriginDelay?: boolean;
  originDelayMs?: string;
  lockedOriginDelayMs?: string;
  extraDelayMs?: string;
  originDistance?: string;
  sources?: Array<{
    name?: string;
    distance?: string | number;
  }>;
}

interface LegacyState extends SavedState {
  origin?: LegacyPoint;
  listener?: LegacyPoint;
  sources?: Array<{
    name?: string;
    distance?: string | number;
    x?: string | number;
    y?: string | number;
    z?: string | number;
  }>;
}

function serializeState(): SavedState {
  return {
    soundSpeedMode: temperatureModeInput.checked ? "temperature" : "fixed",
    temperature: temperatureInput.value,
    soundSpeed: soundSpeedInput.value,
    lockOriginDelay: lockOriginDelayInput.checked,
    originDelayMs: originDelayInput.value,
    lockedOriginDelayMs: lockedOriginDelayInput.value,
    extraDelayMs: extraDelayInput.value,
    originDistance: originDistanceInput.value,
    sources: readSources() ?? [],
  };
}

function applyState(state: SavedState | LegacyState) {
  temperatureModeInput.checked = state.soundSpeedMode === "temperature";
  temperatureInput.value = state.temperature ?? temperatureInput.value;
  soundSpeedInput.value = temperatureModeInput.checked ? (state.soundSpeed ?? soundSpeedInput.value) : String(DEFAULT_SOUND_SPEED);
  lockOriginDelayInput.checked = Boolean(state.lockOriginDelay);
  lockedOriginDelayInput.value = state.lockedOriginDelayMs ?? state.originDelayMs ?? lockedOriginDelayInput.value;
  extraDelayInput.value = state.extraDelayMs ?? extraDelayInput.value;
  originDistanceInput.value = state.originDistance ?? readLegacyOriginDistance(state) ?? originDistanceInput.value;

  if (Array.isArray(state.sources) && state.sources.length > 0) {
    const legacyListener = readLegacyPoint((state as LegacyState).listener);
    const sources = state.sources
      .map((source, index) => toSourceDistance(source, legacyListener, index))
      .filter((source): source is SourceDistance => Boolean(source));

    if (sources.length > 0) {
      sourceList.textContent = "";
      sources.forEach((source) => addSourceRow(source));
    }
  }
}

function readLegacyOriginDistance(state: SavedState | LegacyState) {
  const legacyState = state as LegacyState;
  const origin = readLegacyPoint(legacyState.origin);
  const listener = readLegacyPoint(legacyState.listener);

  if (!origin || !listener) {
    return null;
  }

  return formatNumber(distance(origin, listener), 6);
}

function toSourceDistance(
  source: NonNullable<LegacyState["sources"]>[number],
  legacyListener: { x: number; y: number; z: number } | null,
  index: number,
): SourceDistance | null {
  const name = source.name?.trim() || `S${index + 1}`;
  const savedDistance = Number(source.distance);

  if (Number.isFinite(savedDistance) && savedDistance >= 0) {
    return { name, distance: savedDistance };
  }

  const legacySource = readLegacyPoint(source);
  if (!legacySource || !legacyListener) {
    return null;
  }

  return { name, distance: distance(legacySource, legacyListener) };
}

function readLegacyPoint(point?: LegacyPoint | null) {
  if (!point) {
    return null;
  }

  const x = Number(point.x);
  const y = Number(point.y);
  const z = Number(point.z);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }

  return { x, y, z };
}

function calculateAlignment(
  settings: {
    soundSpeed: number;
    lockedOriginDelayMs: number;
    extraDelayMs: number;
    originDistance: number;
  },
  sources: SourceDistance[],
): Omit<AlignmentResult, "soundSpeed" | "soundSpeedMode"> {
  const originTravelMs = metersToMs(settings.originDistance, settings.soundSpeed);
  const sourceTravels = sources.map((source) => ({
    source,
    travelMs: metersToMs(source.distance, settings.soundSpeed),
  }));
  const automaticAnchor = sourceTravels.reduce(
    (current, next) => (next.travelMs > current.travelMs ? next : current),
    { source: { name: "声音原点", distance: settings.originDistance }, travelMs: originTravelMs },
  );
  const lockedOriginArrivalMs = originTravelMs + settings.lockedOriginDelayMs;
  const baseTargetArrivalMs = lockOriginDelayInput.checked
    ? Math.max(lockedOriginArrivalMs, ...sourceTravels.map((row) => row.travelMs))
    : automaticAnchor.travelMs;
  const targetArrivalMs = baseTargetArrivalMs + settings.extraDelayMs;
  const originDelayMs = targetArrivalMs - originTravelMs;

  return {
    mode: lockOriginDelayInput.checked ? "locked-origin" : "auto",
    extraDelayMs: settings.extraDelayMs,
    lockedOriginDelayMs: settings.lockedOriginDelayMs,
    originDistance: settings.originDistance,
    originTravelMs,
    originDelayMs,
    originArrivalMs: originTravelMs + originDelayMs,
    baseTargetArrivalMs,
    targetArrivalMs,
    anchorName: lockOriginDelayInput.checked ? "锁定原点 / 最晚声源" : automaticAnchor.source.name,
    rows: sourceTravels.map(({ source, travelMs }) => {
      const requiredDelayMs = targetArrivalMs - travelMs;

      return {
        source,
        travelMs,
        requiredDelayMs,
        arrivalMs: travelMs + requiredDelayMs,
      };
    }),
  };
}

function renderResult(result: AlignmentResult) {
  const lines = [
    `Sound speed: ${formatNumber(result.soundSpeed, 4)} m/s`,
    `Sound speed mode: ${result.soundSpeedMode}`,
    `Mode: ${result.mode}`,
    `Origin distance: ${formatNumber(result.originDistance, 6)} m`,
    `Origin travel: ${formatNumber(result.originTravelMs, 6)} ms`,
    `Origin delay: ${formatNumber(result.originDelayMs, 6)} ms`,
    `Origin arrival: ${formatNumber(result.originArrivalMs, 6)} ms`,
    `Extra global delay: ${formatNumber(result.extraDelayMs, 6)} ms`,
    `Anchor: ${result.anchorName}`,
    `Target arrival: ${formatNumber(result.targetArrivalMs, 6)} ms`,
  ];

  if (result.mode === "locked-origin") {
    lines.push(`Locked origin delay: ${formatNumber(result.lockedOriginDelayMs, 6)} ms`);
  }

  lines.push("");
  lines.push("Source\tDistance(m)\tTravel(ms)\tDelay(ms)\tArrival(ms)\tStatus");

  result.rows.forEach((row) => {
    lines.push(
      [
        row.source.name,
        formatNumber(row.source.distance, 6),
        formatNumber(row.travelMs, 6),
        formatNumber(row.requiredDelayMs, 6),
        formatNumber(row.arrivalMs, 6),
        "OK",
      ].join("\t"),
    );
  });

  return lines.join("\n");
}

function renderInlineResults(result: Omit<AlignmentResult, "soundSpeed" | "soundSpeedMode">) {
  originDelayInput.value = formatNumber(result.originDelayMs, 6);
  setResultValue("anchor", result.anchorName);
  setResultValue("target", `${formatNumber(result.targetArrivalMs, 6)} ms`);
  setResultValue("origin-delay", `${formatNumber(result.originDelayMs, 6)} ms`);
  setResultValue("sound-speed", `${formatNumber(readNumber(soundSpeedInput) ?? DEFAULT_SOUND_SPEED, 4)} m/s`);

  const sourceRows = Array.from(sourceList.querySelectorAll<HTMLElement>("[data-source-row]"));

  result.rows.forEach((row, index) => {
    const travelInput = sourceRows[index]?.querySelector<HTMLInputElement>("[data-source-travel]");
    const delayInput = sourceRows[index]?.querySelector<HTMLInputElement>("[data-source-delay]");

    if (travelInput) {
      travelInput.value = formatNumber(row.travelMs, 6);
    }

    if (!delayInput) {
      return;
    }

    delayInput.value = formatNumber(row.requiredDelayMs, 6);
    delayInput.dataset.state = row.requiredDelayMs === 0 ? "anchor" : "ok";
  });
}

function setResultValue(key: string, value: string) {
  const target = document.querySelector<HTMLElement>(`[data-multi-delay-result="${key}"]`);

  if (target) {
    target.textContent = value;
  }
}

function syncSoundSpeedMode() {
  temperatureInput.disabled = !temperatureModeInput.checked;
  soundSpeedInput.readOnly = true;

  if (temperatureModeInput.checked) {
    syncTemperatureSoundSpeed();
  } else {
    soundSpeedInput.value = String(DEFAULT_SOUND_SPEED);
  }
}

function syncOriginDelayMode() {
  lockedOriginDelayInput.disabled = !lockOriginDelayInput.checked;
}

function syncTemperatureSoundSpeed() {
  if (!temperatureModeInput.checked) {
    return;
  }

  const temperature = Number(temperatureInput.value.trim());

  if (!Number.isFinite(temperature) || temperature <= -273.15) {
    return;
  }

  soundSpeedInput.value = formatSoundSpeed(calculateSoundSpeed(temperature));
}

function scheduleHistorySave(sourceCount: number) {
  window.clearTimeout(historyTimer);
  historyTimer = window.setTimeout(() => {
    history.add({
      label: makeLabel(`${sourceCount} sources`, "声源"),
      mode: "calculate",
      input: JSON.stringify(serializeState()),
      output: output.value,
    });
  }, 500);
}

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function metersToMs(meters: number, soundSpeed: number) {
  return (meters / soundSpeed) * 1000;
}

function fail(message: string) {
  window.clearTimeout(historyTimer);
  clearRowDelays();
  output.value = "";
  setStatus(message, true);
}

function clearRowDelays() {
  originDelayInput.value = "";
  document.querySelectorAll<HTMLElement>("[data-multi-delay-result]").forEach((element) => {
    element.textContent = "-";
  });
  sourceList.querySelectorAll<HTMLInputElement>("[data-source-delay], [data-source-travel]").forEach((input) => {
    input.value = "";
    delete input.dataset.state;
  });
}

function formatNumber(value: number, fractionDigits: number) {
  return Number(value.toFixed(fractionDigits)).toString();
}
