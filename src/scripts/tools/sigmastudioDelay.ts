import { makeLabel, requireElement, setStatus } from "../dom";
import { createToolHistory } from "../history";
import { calculateSoundSpeed, formatSoundSpeed } from "../soundSpeed";
import type { ToolHistoryItem } from "../storage";

type DistanceUnit = "m" | "cm" | "ft" | "in";
type DelaySource = "ms" | "samples" | "distance";
type SoundSpeedMode = "fixed" | "temperature";

const DEFAULT_SOUND_SPEED = 343;

const METERS_PER_UNIT: Record<DistanceUnit, number> = {
  m: 1,
  cm: 0.01,
  ft: 0.3048,
  in: 0.0254,
};

const sampleRateInput = requireElement<HTMLInputElement>("#sample-rate-input");
const temperatureModeInput = requireElement<HTMLInputElement>("#temperature-mode-input");
const temperatureInput = requireElement<HTMLInputElement>("#temperature-input");
const soundSpeedInput = requireElement<HTMLInputElement>("#sound-speed-input");
const delayMsInput = requireElement<HTMLInputElement>("#delay-ms-input");
const samplesInput = requireElement<HTMLInputElement>("#samples-input");
const distanceInput = requireElement<HTMLInputElement>("#distance-input");
const distanceUnit = requireElement<HTMLSelectElement>("#distance-unit");
const output = requireElement<HTMLTextAreaElement>("#delay-output");
const history = createToolHistory("sigmastudio-delay", restore);

let lastSource: DelaySource = "ms";
let isSyncing = false;
let historyTimer: number | undefined;

sampleRateInput.addEventListener("input", () => updateFromLastSource());
soundSpeedInput.addEventListener("input", () => updateFromLastSource());
temperatureModeInput.addEventListener("change", () => {
  syncSoundSpeedMode();
  updateFromLastSource();
});
temperatureInput.addEventListener("input", () => {
  syncTemperatureSoundSpeed();
  updateFromLastSource();
});

delayMsInput.addEventListener("input", () => {
  lastSource = "ms";
  updateFromLastSource();
});

samplesInput.addEventListener("input", () => {
  lastSource = "samples";
  updateFromLastSource();
});

distanceInput.addEventListener("input", () => {
  lastSource = "distance";
  updateFromLastSource();
});

distanceUnit.addEventListener("change", () => {
  lastSource = "distance";
  updateFromLastSource();
});

history.render();
syncSoundSpeedMode();
updateFromLastSource(false);

function updateFromLastSource(shouldSave = true) {
  if (isSyncing) {
    return;
  }

  if (lastSource === "ms") {
    convertFromMs(shouldSave);
  }
  if (lastSource === "samples") {
    convertFromSamples(shouldSave);
  }
  if (lastSource === "distance") {
    convertFromDistance(shouldSave);
  }
}

function convertFromMs(shouldSave = true) {
  const settings = readSettings();
  const delayMs = parsePositiveNumber(delayMsInput.value);

  if (!settings || delayMs === null) {
    fail("请输入有效的 ms、Sample Rate 和声速");
    return;
  }

  const result = calculateFromSeconds(delayMs / 1000, settings);
  renderResult(result);
  setStatus("已自动换算");

  if (shouldSave) {
    scheduleHistorySave("ms", delayMsInput.value);
  }
}

function convertFromSamples(shouldSave = true) {
  const settings = readSettings();
  const samples = parsePositiveNumber(samplesInput.value);

  if (!settings || samples === null) {
    fail("请输入有效的 samples、Sample Rate 和声速");
    return;
  }

  const result = calculateFromSamples(samples, settings);
  renderResult(result);
  setStatus("已自动换算");

  if (shouldSave) {
    scheduleHistorySave("samples", samplesInput.value);
  }
}

function convertFromDistance(shouldSave = true) {
  const settings = readSettings();
  const distance = parsePositiveNumber(distanceInput.value);
  const unit = distanceUnit.value as DistanceUnit;

  if (!settings || distance === null || !(unit in METERS_PER_UNIT)) {
    fail("请输入有效的距离、单位、Sample Rate 和声速");
    return;
  }

  const meters = distance * METERS_PER_UNIT[unit];
  const result = calculateFromSeconds(meters / settings.soundSpeed, settings);
  renderResult(result);
  setStatus("已自动换算");

  if (shouldSave) {
    scheduleHistorySave(`distance ${unit}`, `${distanceInput.value} ${unit}`);
  }
}

function restore(item: ToolHistoryItem) {
  try {
    const saved = JSON.parse(item.input) as {
      sampleRate?: string;
      soundSpeedMode?: SoundSpeedMode;
      temperature?: string;
      soundSpeed?: string;
      delayMs?: string;
      samples?: string;
      distance?: string;
      unit?: string;
    };

    sampleRateInput.value = saved.sampleRate ?? sampleRateInput.value;
    temperatureModeInput.checked = saved.soundSpeedMode === "temperature";
    temperatureInput.value = saved.temperature ?? temperatureInput.value;
    soundSpeedInput.value = temperatureModeInput.checked ? (saved.soundSpeed ?? soundSpeedInput.value) : String(DEFAULT_SOUND_SPEED);
    delayMsInput.value = saved.delayMs ?? delayMsInput.value;
    samplesInput.value = saved.samples ?? samplesInput.value;
    distanceInput.value = saved.distance ?? distanceInput.value;

    if (saved.unit && saved.unit in METERS_PER_UNIT) {
      distanceUnit.value = saved.unit;
    }
  } catch {
    // Older history items may only contain output text.
  }

  syncSoundSpeedMode();
  output.value = item.output;
  setStatus(`已复用：${item.mode}`);
}

function readSettings() {
  const sampleRate = parsePositiveNumber(sampleRateInput.value);
  const soundSpeed = parsePositiveNumber(soundSpeedInput.value);

  if (sampleRate === null || sampleRate === 0 || soundSpeed === null || soundSpeed === 0) {
    return null;
  }

  return { sampleRate, soundSpeed };
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value.trim());

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function calculateFromSeconds(seconds: number, settings: { sampleRate: number; soundSpeed: number }) {
  return calculateFromSamples(seconds * settings.sampleRate, settings);
}

function calculateFromSamples(samples: number, settings: { sampleRate: number; soundSpeed: number }) {
  const seconds = samples / settings.sampleRate;
  const meters = seconds * settings.soundSpeed;
  const curSamples = Math.round(samples);
  const curSeconds = curSamples / settings.sampleRate;
  const curMeters = curSeconds * settings.soundSpeed;

  return {
    sampleRate: settings.sampleRate,
    soundSpeed: settings.soundSpeed,
    seconds,
    delayMs: seconds * 1000,
    samples,
    meters,
    curSamples,
    curDelayMs: curSeconds * 1000,
    curMeters,
  };
}

function renderResult(result: ReturnType<typeof calculateFromSamples>) {
  const unit = distanceUnit.value as DistanceUnit;
  const metersPerUnit = METERS_PER_UNIT[unit] ?? METERS_PER_UNIT.m;

  isSyncing = true;
  delayMsInput.value = formatNumber(result.delayMs, 6);
  samplesInput.value = formatNumber(result.samples, 6);
  distanceInput.value = formatNumber(result.meters / metersPerUnit, unit === "m" ? 6 : 4);
  isSyncing = false;

  output.value = [
    `Delay: ${formatNumber(result.delayMs, 6)} ms`,
    `Samples: ${formatNumber(result.samples, 6)}`,
    `SigmaStudio Cur: ${result.curSamples} samples`,
    `Actual Cur delay: ${formatNumber(result.curDelayMs, 6)} ms`,
    `Max: >= ${result.curSamples} samples`,
    "",
    `Distance: ${formatNumber(result.meters, 6)} m`,
    `Distance: ${formatNumber(result.meters * 100, 4)} cm`,
    `Distance: ${formatNumber(result.meters / METERS_PER_UNIT.ft, 6)} ft`,
    `Distance: ${formatNumber(result.meters / METERS_PER_UNIT.in, 4)} in`,
    "",
    `1 sample: ${formatNumber(1000 / result.sampleRate, 8)} ms`,
    `1 sample distance: ${formatNumber(result.soundSpeed / result.sampleRate, 8)} m`,
    `Sound speed: ${formatNumber(result.soundSpeed, 4)} m/s`,
    `Sound speed mode: ${temperatureModeInput.checked ? "temperature" : "fixed"}`,
  ].join("\n");
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

function scheduleHistorySave(mode: string, inputValue: string) {
  window.clearTimeout(historyTimer);
  historyTimer = window.setTimeout(() => {
    history.add({
      label: makeLabel(inputValue, "0"),
      mode,
      input: JSON.stringify({
        sampleRate: sampleRateInput.value,
        soundSpeedMode: temperatureModeInput.checked ? "temperature" : "fixed",
        temperature: temperatureInput.value,
        soundSpeed: soundSpeedInput.value,
        delayMs: delayMsInput.value,
        samples: samplesInput.value,
        distance: distanceInput.value,
        unit: distanceUnit.value,
      }),
      output: output.value,
    });
  }, 500);
}

function fail(message: string) {
  window.clearTimeout(historyTimer);
  output.value = "";
  setStatus(message, true);
}

function formatNumber(value: number, fractionDigits: number) {
  return Number(value.toFixed(fractionDigits)).toString();
}
