import { requireElement, setStatus } from "../dom";
import { createToolHistory } from "../history";
import type { ToolHistoryItem } from "../storage";

type EqInputKind = "center" | "q" | "gain" | "left" | "right";

const MIN_FREQ = 20;
const MAX_FREQ = 20_000;
const SAMPLE_RATE = 48_000;
const MIN_DB = -24;
const MAX_DB = 24;

const centerInput = requireElement<HTMLInputElement>("#eq-center-input");
const qInput = requireElement<HTMLInputElement>("#eq-q-input");
const gainInput = requireElement<HTMLInputElement>("#eq-gain-input");
const leftInput = requireElement<HTMLInputElement>("#eq-left-input");
const rightInput = requireElement<HTMLInputElement>("#eq-right-input");
const canvas = requireElement<HTMLCanvasElement>("#eq-canvas");
const output = requireElement<HTMLTextAreaElement>("#eq-output");
const history = createToolHistory("parametric-eq", restore);

let lastChanged: EqInputKind = "q";
let isSyncing = false;
let historyTimer: number | undefined;
let currentValues: EqValues | null = null;

const presets: Record<string, EqValues> = {
  broad: { center: 1000, q: 0.707, gain: 3, left: 517.652, right: 1931.303 },
  notch: { center: 1000, q: 8, gain: -6, left: 939.453, right: 1064.453 },
  vocal: { center: 3000, q: 1.2, gain: 2, left: 2015.564, right: 4465.564 },
};

document.querySelectorAll<HTMLInputElement>("[data-eq-input]").forEach((input) => {
  input.addEventListener("input", () => {
    lastChanged = input.dataset.eqInput as EqInputKind;
    updateEq();
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-eq-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    const preset = presets[button.dataset.eqPreset ?? ""];

    if (!preset) {
      return;
    }

    lastChanged = "q";
    syncInputs(preset);
    updateEq();
  });
});

window.addEventListener("resize", () => {
  if (currentValues) {
    drawCurve(currentValues);
  }
});

history.render();
updateEq(false);

function updateEq(shouldSave = true) {
  if (isSyncing) {
    return;
  }

  const values = readValues();
  if (!values) {
    fail("请输入有效频率、Q 和增益");
    return;
  }

  const resolved = resolveValues(values, lastChanged);
  if (!resolved) {
    fail("左右频点需大于 0，且左频点小于右频点");
    return;
  }

  syncInputs(resolved);
  renderOutput(resolved);
  currentValues = resolved;
  drawCurve(resolved);
  setStatus("已计算");

  if (shouldSave) {
    scheduleHistorySave(resolved);
  }
}

function restore(item: ToolHistoryItem) {
  try {
    const restored = JSON.parse(item.input) as EqValues;
    syncInputs(restored);
    renderOutput(restored);
    currentValues = restored;
    drawCurve(restored);
    setStatus(`已复用：${item.mode}`);
  } catch {
    output.value = item.output;
    setStatus(`已复用：${item.mode}`);
  }
}

function readValues() {
  const center = readNumber(centerInput);
  const q = readNumber(qInput);
  const gain = readNumber(gainInput);
  const left = readNumber(leftInput);
  const right = readNumber(rightInput);

  if (center === null || q === null || gain === null || left === null || right === null) {
    return null;
  }

  return { center, q, gain, left, right };
}

interface EqValues {
  center: number;
  q: number;
  gain: number;
  left: number;
  right: number;
}

function resolveValues(values: EqValues, changed: EqInputKind): EqValues | null {
  if (values.gain < MIN_DB || values.gain > MAX_DB || values.center <= 0 || values.q <= 0) {
    return null;
  }

  if (changed === "left" || changed === "right") {
    if (values.left <= 0 || values.right <= 0 || values.left >= values.right) {
      return null;
    }

    const center = Math.sqrt(values.left * values.right);
    const q = center / (values.right - values.left);
    return { ...values, center, q };
  }

  const center = values.center;
  const q = values.q;
  const bandwidth = center / q;
  const discriminant = Math.sqrt(bandwidth * bandwidth + 4 * center * center);
  const left = (-bandwidth + discriminant) / 2;
  const right = left + bandwidth;

  if (left <= 0 || right <= 0 || left >= right) {
    return null;
  }

  return { ...values, center, q, left, right };
}

function syncInputs(values: EqValues) {
  isSyncing = true;
  centerInput.value = formatNumber(values.center, 3);
  qInput.value = formatNumber(values.q, 5);
  gainInput.value = formatNumber(values.gain, 3);
  leftInput.value = formatNumber(values.left, 3);
  rightInput.value = formatNumber(values.right, 3);
  isSyncing = false;
}

function renderOutput(values: EqValues) {
  const bandwidthHz = values.right - values.left;
  const octaves = Math.log2(values.right / values.left);

  output.value = [
    `Center: ${formatNumber(values.center, 3)} Hz`,
    `Q: ${formatNumber(values.q, 5)}`,
    `Gain: ${formatNumber(values.gain, 3)} dB`,
    `Left: ${formatNumber(values.left, 3)} Hz`,
    `Right: ${formatNumber(values.right, 3)} Hz`,
    `Bandwidth: ${formatNumber(bandwidthHz, 3)} Hz`,
    `Bandwidth: ${formatNumber(octaves, 5)} oct`,
  ].join("\n");

  renderResultGrid(values, bandwidthHz, octaves);
}

function renderResultGrid(values: EqValues, bandwidthHz: number, octaves: number) {
  setResultValue("center", `${formatNumber(values.center, 3)} Hz`);
  setResultValue("q", formatNumber(values.q, 5));
  setResultValue("bandwidth", `${formatNumber(bandwidthHz, 3)} Hz`);
  setResultValue("octaves", `${formatNumber(octaves, 5)} oct`);
}

function setResultValue(key: string, value: string) {
  const target = document.querySelector<HTMLElement>(`[data-eq-result="${key}"]`);

  if (target) {
    target.textContent = value;
  }
}

function scheduleHistorySave(values: EqValues) {
  window.clearTimeout(historyTimer);
  historyTimer = window.setTimeout(() => {
    history.add({
      label: `${formatNumber(values.center, 2)} Hz / ${formatNumber(values.gain, 2)} dB`,
      mode: "calculate",
      input: JSON.stringify(values),
      output: output.value,
    });
  }, 500);
}

function drawCurve(values: EqValues) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.scale(ratio, ratio);
  drawChart(context, rect.width, rect.height, values);
  context.restore();
}

function drawChart(context: CanvasRenderingContext2D, width: number, height: number, values: EqValues) {
  const padLeft = 48;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 34;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  if (plotWidth <= 0 || plotHeight <= 0) {
    return;
  }

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#fbfcfd";
  context.fillRect(0, 0, width, height);
  context.font = "12px sans-serif";
  context.textBaseline = "middle";

  context.strokeStyle = "#dce3e8";
  context.lineWidth = 1;
  [-24, -12, 0, 12, 24].forEach((db) => {
    const y = dbToY(db, padTop, plotHeight);
    line(context, padLeft, y, width - padRight, y);
    context.fillStyle = "#65717b";
    context.fillText(`${db}`, 10, y);
  });

  [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach((freq) => {
    const x = freqToX(freq, padLeft, plotWidth);
    line(context, x, padTop, x, height - padBottom);
    context.fillStyle = "#65717b";
    const label = freq >= 1000 ? `${freq / 1000}k` : String(freq);
    context.fillText(label, x - 10, height - 14);
  });

  context.strokeStyle = "#a8b4bd";
  context.lineWidth = 1.25;
  line(context, padLeft, dbToY(0, padTop, plotHeight), width - padRight, dbToY(0, padTop, plotHeight));

  context.beginPath();
  context.strokeStyle = "#0f766e";
  context.lineWidth = 2;
  for (let index = 0; index <= plotWidth; index += 1) {
    const ratio = index / plotWidth;
    const freq = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, ratio);
    const db = peakingEqDb(freq, values);
    const x = padLeft + index;
    const y = dbToY(clamp(db, MIN_DB, MAX_DB), padTop, plotHeight);
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }
  context.stroke();

  context.strokeStyle = "rgba(15, 118, 110, 0.45)";
  context.lineWidth = 1;
  [values.left, values.right].forEach((freq) => {
    const x = freqToX(clamp(freq, MIN_FREQ, MAX_FREQ), padLeft, plotWidth);
    line(context, x, padTop, x, height - padBottom);
  });

  context.strokeStyle = "#172026";
  context.lineWidth = 1.75;
  const centerX = freqToX(values.center, padLeft, plotWidth);
  line(context, centerX, padTop, centerX, height - padBottom);
}

function peakingEqDb(freq: number, values: EqValues) {
  const a = Math.pow(10, values.gain / 40);
  const omega0 = (2 * Math.PI * values.center) / SAMPLE_RATE;
  const responseOmega = (2 * Math.PI * freq) / SAMPLE_RATE;
  const alpha = Math.sin(omega0) / (2 * values.q);
  const cos = Math.cos(omega0);
  const b0 = 1 + alpha * a;
  const b1 = -2 * cos;
  const b2 = 1 - alpha * a;
  const a0 = 1 + alpha / a;
  const a1 = -2 * cos;
  const a2 = 1 - alpha / a;
  const numerator = complexMagnitude(
    b0 + b1 * Math.cos(responseOmega) + b2 * Math.cos(2 * responseOmega),
    -b1 * Math.sin(responseOmega) - b2 * Math.sin(2 * responseOmega),
  );
  const denominator = complexMagnitude(
    a0 + a1 * Math.cos(responseOmega) + a2 * Math.cos(2 * responseOmega),
    -a1 * Math.sin(responseOmega) - a2 * Math.sin(2 * responseOmega),
  );

  return 20 * Math.log10(numerator / denominator);
}

function complexMagnitude(real: number, imaginary: number) {
  return Math.sqrt(real * real + imaginary * imaginary);
}

function freqToX(freq: number, left: number, width: number) {
  return left + (Math.log(freq / MIN_FREQ) / Math.log(MAX_FREQ / MIN_FREQ)) * width;
}

function dbToY(db: number, top: number, height: number) {
  return top + ((MAX_DB - db) / (MAX_DB - MIN_DB)) * height;
}

function line(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function readNumber(input: HTMLInputElement) {
  const value = Number(input.value.trim());
  return Number.isFinite(value) ? value : null;
}

function fail(message: string) {
  document.querySelectorAll<HTMLElement>("[data-eq-result]").forEach((element) => {
    element.textContent = "-";
  });
  output.value = "";
  setStatus(message, true);
}

function formatNumber(value: number, fractionDigits: number) {
  return Number(value.toFixed(fractionDigits)).toString();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
