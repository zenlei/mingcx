import { makeLabel, requireElement, setStatus } from "../dom";
import { createToolHistory } from "../history";
import type { ToolHistoryItem } from "../storage";

interface LimiterValues {
  sampleRate: number;
  thresholdDb: number;
  inputLevelDb: number;
  rmsDbPerSecond: number;
  decayDbPerSecond: number;
}

interface LimiterResult extends LimiterValues {
  thresholdLinear: number;
  threshold523: number;
  threshold523Hex: string;
  rmsCoefficient: number;
  rms523: number;
  rms523Hex: string;
  decayCoefficient: number;
  decay523: number;
  decay523Hex: string;
  decayComplement: number;
  decayComplement523: number;
  decayComplement523Hex: string;
  limiterRatio: number;
  limiterRatio523: number;
  limiterRatio523Hex: string;
}

const sampleRateInput = requireElement<HTMLInputElement>("#limiter-sample-rate-input");
const thresholdInput = requireElement<HTMLInputElement>("#limiter-threshold-input");
const inputLevelInput = requireElement<HTMLInputElement>("#limiter-input-level-input");
const rmsInput = requireElement<HTMLInputElement>("#limiter-rms-input");
const decayInput = requireElement<HTMLInputElement>("#limiter-decay-input");
const limiterRatioOutput = requireElement<HTMLInputElement>("#limiter-output-gain");
const output = requireElement<HTMLTextAreaElement>("#limiter-output");
const history = createToolHistory("sigmastudio-limiter", restore);

const presets: Record<string, Pick<LimiterValues, "thresholdDb" | "inputLevelDb" | "rmsDbPerSecond" | "decayDbPerSecond">> = {
  safe: {
    thresholdDb: -6,
    inputLevelDb: -3,
    rmsDbPerSecond: 50,
    decayDbPerSecond: 12,
  },
  smooth: {
    thresholdDb: -3,
    inputLevelDb: 0,
    rmsDbPerSecond: 25,
    decayDbPerSecond: 6,
  },
  fast: {
    thresholdDb: -1,
    inputLevelDb: 3,
    rmsDbPerSecond: 120,
    decayDbPerSecond: 30,
  },
};

let historyTimer: number | undefined;

[sampleRateInput, thresholdInput, inputLevelInput, rmsInput, decayInput].forEach((input) => {
  input.addEventListener("input", () => updateLimiter());
});

document.querySelectorAll<HTMLButtonElement>("[data-limiter-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    const preset = presets[button.dataset.limiterPreset ?? ""];

    if (!preset) {
      return;
    }

    thresholdInput.value = String(preset.thresholdDb);
    inputLevelInput.value = String(preset.inputLevelDb);
    rmsInput.value = String(preset.rmsDbPerSecond);
    decayInput.value = String(preset.decayDbPerSecond);
    updateLimiter();
  });
});

history.render();
updateLimiter(false);

function updateLimiter(shouldSave = true) {
  const values = readValues();

  if (!values) {
    fail("请输入有效的 Sample Rate、Threshold、输入 RMS、RMS Time Constant 和 Decay");
    return;
  }

  const result = calculateLimiter(values);
  limiterRatioOutput.value = formatNumber(result.limiterRatio, 12);
  renderResultGrid(result);
  output.value = renderOutput(result);
  setStatus("已计算");

  if (shouldSave) {
    scheduleHistorySave(result);
  }
}

function restore(item: ToolHistoryItem) {
  try {
    const saved = JSON.parse(item.input) as Partial<Record<keyof LimiterValues, string | number>>;
    sampleRateInput.value = String(saved.sampleRate ?? sampleRateInput.value);
    thresholdInput.value = String(saved.thresholdDb ?? thresholdInput.value);
    inputLevelInput.value = String(saved.inputLevelDb ?? inputLevelInput.value);
    rmsInput.value = String(saved.rmsDbPerSecond ?? rmsInput.value);
    decayInput.value = String(saved.decayDbPerSecond ?? decayInput.value);
    updateLimiter(false);
  } catch {
    output.value = item.output;
    setStatus(`已复用：${item.mode}`);
  }
}

function readValues(): LimiterValues | null {
  const sampleRate = readNumber(sampleRateInput);
  const thresholdDb = readNumber(thresholdInput);
  const inputLevelDb = readNumber(inputLevelInput);
  const rmsDbPerSecond = readNumber(rmsInput);
  const decayDbPerSecond = readNumber(decayInput);

  if (
    sampleRate === null ||
    sampleRate <= 0 ||
    thresholdDb === null ||
    inputLevelDb === null ||
    rmsDbPerSecond === null ||
    rmsDbPerSecond < 0 ||
    decayDbPerSecond === null ||
    decayDbPerSecond < 0
  ) {
    return null;
  }

  return {
    sampleRate,
    thresholdDb,
    inputLevelDb,
    rmsDbPerSecond,
    decayDbPerSecond,
  };
}

function calculateLimiter(values: LimiterValues): LimiterResult {
  const thresholdLinear = Math.pow(10, values.thresholdDb / 20);
  const rmsCoefficient = Math.abs(1 - Math.pow(10, values.rmsDbPerSecond / (10 * values.sampleRate)));
  const decayCoefficient = Math.pow(10, -values.decayDbPerSecond / (20 * values.sampleRate));
  const decayComplement = 1 - decayCoefficient;
  const limiterRatio = Math.min(1, Math.pow(10, (values.thresholdDb - values.inputLevelDb) / 20));

  return {
    ...values,
    thresholdLinear,
    threshold523: to523(thresholdLinear),
    threshold523Hex: toHex28(to523(thresholdLinear)),
    rmsCoefficient,
    rms523: to523(rmsCoefficient),
    rms523Hex: toHex28(to523(rmsCoefficient)),
    decayCoefficient,
    decay523: to523(decayCoefficient),
    decay523Hex: toHex28(to523(decayCoefficient)),
    decayComplement,
    decayComplement523: to523(decayComplement),
    decayComplement523Hex: toHex28(to523(decayComplement)),
    limiterRatio,
    limiterRatio523: to523(limiterRatio),
    limiterRatio523Hex: toHex28(to523(limiterRatio)),
  };
}

function renderOutput(result: LimiterResult) {
  return [
    "SigmaStudio Limiter",
    `Sample Rate: ${formatNumber(result.sampleRate, 6)} Hz`,
    `Threshold: ${formatNumber(result.thresholdDb, 6)} dB`,
    `Input RMS estimate: ${formatNumber(result.inputLevelDb, 6)} dB`,
    `RMS Time Constant: ${formatNumber(result.rmsDbPerSecond, 6)} dB/s`,
    `Decay: ${formatNumber(result.decayDbPerSecond, 6)} dB/s`,
    "",
    "Calculated Parameters",
    `threshold: ${formatNumber(result.thresholdLinear, 12)}`,
    `Threshold 5.23: ${result.threshold523} (${result.threshold523Hex})`,
    `RMS: ${formatNumber(result.rmsCoefficient, 12)}`,
    `RMS 5.23: ${result.rms523} (${result.rms523Hex})`,
    `decay: ${formatNumber(result.decayCoefficient, 12)}`,
    `Decay 5.23: ${result.decay523} (${result.decay523Hex})`,
    `decay complement: ${formatNumber(result.decayComplement, 12)}`,
    `Decay Complement 5.23: ${result.decayComplement523} (${result.decayComplement523Hex})`,
    `limiter ratio / gain estimate: ${formatNumber(result.limiterRatio, 12)}`,
    `Limiter Ratio 5.23: ${result.limiterRatio523} (${result.limiterRatio523Hex})`,
    "",
    "Pin Label Notice / 引脚标注提醒",
    "中文：从 SigmaStudio 4.7 开始，Pin 2 标为 “Limter ratio”，但实际是 limiter active flag；Pin 3 标为 Limiter Active Flag，但实际是 limiter ratio。",
    "English: As of SigmaStudio 4.7, Pin 2 is labeled “Limter ratio” but is actually the limiter active flag, while Pin 3 is labeled Limiter Active Flag but is actually the limiter ratio.",
    "",
    "Formula Notes",
    "Threshold linear = 10 ^ (threshold dB / 20)",
    "RMS coefficient = abs(1 - 10 ^ (RMS dB/s / (10 * sampleRate)))",
    "Decay = 10 ^ (-Decay dB/s / (20 * sampleRate))",
    "Decay Complement = 1 - Decay",
    "Limiter Ratio / Gain estimate = min(1, 10 ^ ((threshold dB - input RMS dB) / 20))",
  ].join("\n");
}

function renderResultGrid(result: LimiterResult) {
  setResultValue("threshold", result.thresholdLinear);
  setResultValue("rms", result.rmsCoefficient);
  setResultValue("decay", result.decayCoefficient);
  setResultValue("decay-complement", result.decayComplement);
  setResultValue("ratio", result.limiterRatio);
}

function setResultValue(key: string, value: number) {
  const target = document.querySelector<HTMLElement>(`[data-limiter-result="${key}"]`);

  if (target) {
    target.textContent = formatNumber(value, 12);
  }
}

function scheduleHistorySave(result: LimiterResult) {
  window.clearTimeout(historyTimer);
  historyTimer = window.setTimeout(() => {
    history.add({
      label: makeLabel(`${formatNumber(result.thresholdDb, 2)} dB / ${formatNumber(result.inputLevelDb, 2)} dB`, "Limiter"),
      mode: "calculate",
      input: JSON.stringify({
        sampleRate: sampleRateInput.value,
        thresholdDb: thresholdInput.value,
        inputLevelDb: inputLevelInput.value,
        rmsDbPerSecond: rmsInput.value,
        decayDbPerSecond: decayInput.value,
      }),
      output: output.value,
    });
  }, 500);
}

function readNumber(input: HTMLInputElement) {
  const value = Number(input.value.trim());
  return Number.isFinite(value) ? value : null;
}

function fail(message: string) {
  window.clearTimeout(historyTimer);
  limiterRatioOutput.value = "";
  document.querySelectorAll<HTMLElement>("[data-limiter-result]").forEach((element) => {
    element.textContent = "-";
  });
  output.value = "";
  setStatus(message, true);
}

function to523(value: number) {
  return Math.round(value * 2 ** 23);
}

function toHex28(value: number) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

function formatNumber(value: number, fractionDigits: number) {
  return Number(value.toFixed(fractionDigits)).toString();
}
