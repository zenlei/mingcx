import { requireElement, setStatus } from "../dom";
import { createToolHistory } from "../history";
import type { ToolHistoryItem } from "../storage";
import { gpuConfigs, sourceModels, type GpuConfig, type SourceModel } from "./vramCalculatorData";

type CalcMode = "inference" | "finetuning";
type Precision = "fp32" | "fp16" | "q8" | "q6" | "q5" | "q4" | "q3";
type KvPrecision = "fp16" | "q8" | "q4";
type FineTuneMethod = "full" | "lora" | "qlora";
type Parallelism = "tensor" | "pipeline" | "replicated";
type OffloadTarget = "cpu_ram" | "nvme";

interface VramInputs {
  mode: CalcMode;
  modelKey: string;
  gpuKey: string;
  gpuName: string;
  model: SourceModel;
  gpu: GpuConfig;
  precision: Precision;
  ftPrecision: Precision;
  kvPrecision: KvPrecision;
  fineTuneMethod: FineTuneMethod;
  frameworkPercent: number;
  batch: number;
  sequence: number;
  users: number;
  devices: number;
  deviceMemoryGb: number;
  interconnect: string;
  parallelism: Parallelism;
  gradAccum: number;
  loraRank: number;
  offload: boolean;
  offloadTarget: OffloadTarget;
  layerOffload: boolean;
  offloadLayers: number;
  offloadPercent: number;
  offloadKv: boolean;
  prefixCaching: boolean;
  prefixRatio: number;
  continuousBatching: boolean;
  samples: number;
  tokensPerSample: number;
  epochs: number;
  optPreset: string;
  optimizer: string;
  zeroStage: number;
  flashAttention: boolean;
  gradCheckpoint: boolean;
  gradCheckpointRatio: number;
  opt8: boolean;
  pagedOpt: boolean;
  fusedKernels: boolean;
  activationOffload: boolean;
  sequencePacking: boolean;
  dynamicPadding: boolean;
  electricityCost: number;
  carbonIntensity: number;
  ttftSim: boolean;
}

interface VramResult {
  totalGb: number;
  perDeviceGb: number;
  usablePerDeviceGb: number;
  utilization: number;
  status: string;
  statusNote: string;
  offloadedGb: number;
  speedTps: number;
  ttftMs: number;
  trainingTokens: number;
  trainingHours: number;
  powerKw: number;
  localCostHour: number;
  cloudCostHour: number;
  carbonKgHour: number;
  breakdown: {
    weights: number;
    kv: number;
    activations: number;
    optimizer: number;
    overhead: number;
  };
  lines: string[];
}

interface HardwareProfile {
  id: string;
  name: string;
  gpuKey: string;
  memory: number;
  devices: number;
  interconnect: string;
}

const BYTES_PER_GB = 1024 ** 3;
const PROFILE_KEY = "online-tools:vram-profiles";

const precisionBytes: Record<Precision, number> = {
  fp32: 4,
  fp16: 2,
  q8: 1,
  q6: 0.75,
  q5: 0.625,
  q4: 0.5,
  q3: 0.375,
};

const kvBytes: Record<KvPrecision, number> = {
  fp16: 2,
  q8: 1,
  q4: 0.5,
};

const interconnectEfficiency: Record<string, number> = {
  nvlink_gen6: 0.98,
  nvlink_gen5: 0.96,
  nvlink_gen4: 0.95,
  nvlink_gen3: 0.93,
  nvlink_gen2: 0.9,
  nvlink_bridge: 0.88,
  infiniband_hdr: 0.91,
  infiniband_edr: 0.88,
  pcie5: 0.88,
  pcie4: 0.85,
  pcie3: 0.8,
  ethernet400g: 0.82,
  ethernet200g: 0.76,
  ethernet100g: 0.7,
  ethernet25g: 0.5,
  ethernet10g: 0.35,
  ethernet1g: 0.15,
};

const modelSelect = requireElement<HTMLSelectElement>("#vram-model-select");
const gpuSelect = requireElement<HTMLSelectElement>("#vram-gpu-select");
const fineTuneMethodSelect = requireElement<HTMLSelectElement>("#vram-finetune-method-select");
const precisionSelect = requireElement<HTMLSelectElement>("#vram-precision-select");
const ftPrecisionSelect = requireElement<HTMLSelectElement>("#vram-ft-precision-select");
const kvSelect = requireElement<HTMLSelectElement>("#vram-kv-select");
const loraRankInput = requireElement<HTMLInputElement>("#vram-lora-rank-input");
const frameworkInput = requireElement<HTMLInputElement>("#vram-framework-input");
const devicesInput = requireElement<HTMLInputElement>("#vram-devices-input");
const deviceMemoryInput = requireElement<HTMLInputElement>("#vram-device-memory-input");
const interconnectSelect = requireElement<HTMLSelectElement>("#vram-interconnect-select");
const parallelismSelect = requireElement<HTMLSelectElement>("#vram-parallelism-select");
const profileSelect = requireElement<HTMLSelectElement>("#vram-profile-select");
const profileNameInput = requireElement<HTMLInputElement>("#vram-profile-name");
const saveProfileButton = requireElement<HTMLButtonElement>("#vram-save-profile");
const deleteProfileButton = requireElement<HTMLButtonElement>("#vram-delete-profile");
const batchInput = requireElement<HTMLInputElement>("#vram-batch-input");
const batchLogInput = requireElement<HTMLInputElement>("#vram-batch-log-input");
const sequenceInput = requireElement<HTMLInputElement>("#vram-sequence-input");
const usersInput = requireElement<HTMLInputElement>("#vram-users-input");
const usersLogInput = requireElement<HTMLInputElement>("#vram-users-log-input");
const gradAccumInput = requireElement<HTMLInputElement>("#vram-grad-accum-input");
const offloadInput = requireElement<HTMLInputElement>("#vram-offload-input");
const offloadTargetSelect = requireElement<HTMLSelectElement>("#vram-offload-target-select");
const offloadKvInput = requireElement<HTMLInputElement>("#vram-offload-kv-input");
const layerOffloadInput = requireElement<HTMLInputElement>("#vram-layer-offload-input");
const offloadLayersInput = requireElement<HTMLInputElement>("#vram-offload-layers-input");
const offloadPercentInput = requireElement<HTMLInputElement>("#vram-offload-percent-input");
const prefixCacheInput = requireElement<HTMLInputElement>("#vram-prefix-cache-input");
const prefixRatioInput = requireElement<HTMLInputElement>("#vram-prefix-ratio-input");
const continuousBatchingInput = requireElement<HTMLInputElement>("#vram-continuous-batching-input");
const samplesInput = requireElement<HTMLInputElement>("#vram-samples-input");
const tokensSampleInput = requireElement<HTMLInputElement>("#vram-tokens-sample-input");
const epochsInput = requireElement<HTMLInputElement>("#vram-epochs-input");
const optPresetSelect = requireElement<HTMLSelectElement>("#vram-opt-preset-select");
const optimizerSelect = requireElement<HTMLSelectElement>("#vram-optimizer-select");
const zeroStageSelect = requireElement<HTMLSelectElement>("#vram-zero-stage-select");
const flashAttnInput = requireElement<HTMLInputElement>("#vram-flash-attn-input");
const gradCheckpointInput = requireElement<HTMLInputElement>("#vram-grad-checkpoint-input");
const gradCheckpointRatioInput = requireElement<HTMLInputElement>("#vram-grad-checkpoint-ratio-input");
const opt8Input = requireElement<HTMLInputElement>("#vram-opt8-input");
const pagedOptInput = requireElement<HTMLInputElement>("#vram-paged-opt-input");
const fusedKernelsInput = requireElement<HTMLInputElement>("#vram-fused-kernels-input");
const activationOffloadInput = requireElement<HTMLInputElement>("#vram-activation-offload-input");
const seqPackInput = requireElement<HTMLInputElement>("#vram-seq-pack-input");
const dynPadInput = requireElement<HTMLInputElement>("#vram-dyn-pad-input");
const electricityInput = requireElement<HTMLInputElement>("#vram-electricity-input");
const carbonSelect = requireElement<HTMLSelectElement>("#vram-carbon-select");
const ttftSimInput = requireElement<HTMLInputElement>("#vram-ttft-sim-input");
const shareButton = requireElement<HTMLButtonElement>("#vram-share-button");
const playSimButton = requireElement<HTMLButtonElement>("#vram-play-sim");
const replaySimButton = requireElement<HTMLButtonElement>("#vram-replay-sim");
const simulationText = requireElement<HTMLElement>("[data-vram-simulation-text]");
const output = requireElement<HTMLTextAreaElement>("#vram-output");
const meter = requireElement<HTMLElement>("[data-vram-meter]");
const ring = requireElement<HTMLElement>("[data-vram-ring]");
const fitTile = requireElement<HTMLElement>("[data-vram-fit-state]");
const history = createToolHistory("vram-calculator", restore);

let mode: CalcMode = "inference";
let historyTimer: number | undefined;
let lastResult: VramResult | null = null;
let simulationTimer: number | undefined;

populateModelSelect();
populateGpuSelect();
restoreFromUrl();
history.render();
syncMode();
applyGpu(gpuSelect.value);
renderProfiles();
bindSliders();
updateVram(false);

modelSelect.addEventListener("change", () => updateVram());
gpuSelect.addEventListener("change", () => {
  applyGpu(gpuSelect.value);
  updateVram();
});

document.querySelectorAll<HTMLElement>("[data-vram-input]").forEach((input) => {
  input.addEventListener("input", () => updateVram());
  input.addEventListener("change", () => updateVram());
});

document.querySelectorAll<HTMLButtonElement>("[data-vram-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    mode = button.dataset.vramMode as CalcMode;
    syncMode();
    updateVram();
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-vram-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    applyScenario(button.dataset.vramPreset ?? "");
    updateVram();
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-vram-result-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const active = button.dataset.vramResultTab ?? "performance";
    document.querySelectorAll<HTMLButtonElement>("[data-vram-result-tab]").forEach((tab) => {
      tab.setAttribute("aria-pressed", String(tab.dataset.vramResultTab === active));
    });
    document.querySelectorAll<HTMLElement>("[data-vram-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.vramTabPanel !== active;
    });
  });
});

profileSelect.addEventListener("change", () => {
  const profile = readProfiles().find((item) => item.id === profileSelect.value);
  if (!profile) {
    return;
  }
  gpuSelect.value = profile.gpuKey;
  devicesInput.value = String(profile.devices);
  deviceMemoryInput.value = String(profile.memory);
  interconnectSelect.value = profile.interconnect;
  profileNameInput.value = profile.name;
  updateVram();
});

saveProfileButton.addEventListener("click", () => {
  const profile: HardwareProfile = {
    id: profileSelect.value || String(Date.now()),
    name: profileNameInput.value.trim() || "My GPU Rig",
    gpuKey: gpuSelect.value,
    memory: readNumber(deviceMemoryInput) ?? getGpu(gpuSelect.value).memory,
    devices: Math.max(1, Math.round(readNumber(devicesInput) ?? 1)),
    interconnect: interconnectSelect.value,
  };
  const others = readProfiles().filter((item) => item.id !== profile.id);
  writeProfiles([...others, profile]);
  renderProfiles(profile.id);
  setStatus("硬件配置已保存到本地");
});

deleteProfileButton.addEventListener("click", () => {
  if (!profileSelect.value) {
    return;
  }
  writeProfiles(readProfiles().filter((item) => item.id !== profileSelect.value));
  renderProfiles();
  setStatus("硬件配置已删除");
});

shareButton.addEventListener("click", async () => {
  const url = buildShareUrl();
  await copyText(url);
  setStatus("分享配置链接已复制");
});

playSimButton.addEventListener("click", () => playSimulation(false));
replaySimButton.addEventListener("click", () => playSimulation(true));

function populateModelSelect() {
  const byProvider = new Map<string, SourceModel[]>();
  sourceModels.forEach((model) => {
    const provider = model.provider || "Other";
    byProvider.set(provider, [...(byProvider.get(provider) ?? []), model]);
  });
  modelSelect.innerHTML = "";
  [...byProvider.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([provider, models]) => {
    const group = document.createElement("optgroup");
    group.label = provider;
    models
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((model) => {
        const option = document.createElement("option");
        option.value = model.slug;
        option.textContent = model.name;
        group.append(option);
      });
    modelSelect.append(group);
  });
  modelSelect.value = sourceModels.some((model) => model.slug === "deepseek-r1-3b") ? "deepseek-r1-3b" : sourceModels[0].slug;
}

function populateGpuSelect() {
  const groups: Array<[string, (gpu: GpuConfig) => boolean]> = [
    ["NVIDIA GPUs", (gpu) => gpu.vendor === "nvidia" && gpu.type === "gpu"],
    ["NVIDIA Superchips", (gpu) => gpu.vendor === "nvidia" && gpu.type === "apu"],
    ["AMD GPUs", (gpu) => gpu.vendor === "amd" && gpu.type === "gpu"],
    ["AMD Ryzen APUs", (gpu) => gpu.vendor === "amd" && gpu.type === "apu"],
    ["Apple Silicon", (gpu) => gpu.vendor === "apple"],
    ["Custom", (gpu) => gpu.vendor === "custom"],
  ];

  gpuSelect.innerHTML = "";
  groups.forEach(([label, predicate]) => {
    const items = gpuConfigs.filter(predicate);
    if (!items.length) {
      return;
    }
    const group = document.createElement("optgroup");
    group.label = label;
    items.forEach((gpu) => {
      const option = document.createElement("option");
      option.value = gpu.key;
      option.textContent = gpu.label;
      group.append(option);
    });
    gpuSelect.append(group);
  });
  gpuSelect.value = "3060_12";
}

function restoreFromUrl() {
  const params = new URLSearchParams(window.location.search);
  setSelectIfPresent(modelSelect, params.get("model"));
  setMode(params.get("mode") as CalcMode | null);
  setSelectIfPresent(fineTuneMethodSelect, params.get("ftMethod"));
  setSelectIfPresent(precisionSelect, params.get("quant"));
  setSelectIfPresent(kvSelect, params.get("kvQuant"));
  setSelectIfPresent(ftPrecisionSelect, params.get("ftQuant"));
  setSelectIfPresent(gpuSelect, params.get("gpu"));
  setInputIfPresent(deviceMemoryInput, params.get("customVram"));
  setInputIfPresent(devicesInput, params.get("numGpus"));
  setInputIfPresent(batchInput, params.get("batchSize"));
  setInputIfPresent(sequenceInput, params.get("seqLen"));
  setInputIfPresent(loraRankInput, params.get("loraRank"));
  setInputIfPresent(usersInput, params.get("users"));
  setInputIfPresent(gradAccumInput, params.get("gradSteps"));
  setCheckedIfPresent(offloadInput, params.get("offload"));
  setSelectIfPresent(offloadTargetSelect, params.get("offloadTarget"));
  setCheckedIfPresent(layerOffloadInput, params.get("useLayerOffload"));
  setInputIfPresent(offloadLayersInput, params.get("offloadLayers"));
  setInputIfPresent(offloadPercentInput, params.get("offloadPct"));
  setCheckedIfPresent(offloadKvInput, params.get("offloadKv"));
  setCheckedIfPresent(prefixCacheInput, params.get("prefixCaching"));
  setInputIfPresent(prefixRatioInput, params.get("prefixRatio"));
  setCheckedIfPresent(continuousBatchingInput, params.get("continuousBatching"));
  setInputIfPresent(electricityInput, params.get("elecCost"));
  setCheckedIfPresent(ttftSimInput, params.get("ttftSim"));
  setSelectIfPresent(interconnectSelect, params.get("interconnect"));
  setSelectIfPresent(parallelismSelect, params.get("infParallel"));
  setInputIfPresent(samplesInput, params.get("samples"));
  setInputIfPresent(tokensSampleInput, params.get("tokensPerSample"));
  setInputIfPresent(epochsInput, params.get("epochs"));
  setSelectIfPresent(optPresetSelect, params.get("optPreset"));
  setCheckedIfPresent(flashAttnInput, params.get("flashAttn"));
  setCheckedIfPresent(gradCheckpointInput, params.get("gradCkpt"));
  setInputIfPresent(gradCheckpointRatioInput, params.get("gradCkptRatio"));
  setCheckedIfPresent(opt8Input, params.get("opt8bit"));
  setCheckedIfPresent(pagedOptInput, params.get("optPaged"));
  setSelectIfPresent(optimizerSelect, params.get("optType"));
  setCheckedIfPresent(fusedKernelsInput, params.get("fusedKernels"));
  setSelectIfPresent(zeroStageSelect, params.get("zeroStage"));
  setCheckedIfPresent(activationOffloadInput, params.get("actOffload"));
  setCheckedIfPresent(seqPackInput, params.get("seqPack"));
  setCheckedIfPresent(dynPadInput, params.get("dynPad"));
}

function applyScenario(key: string) {
  const set = (values: Partial<Record<string, string | boolean>>) => {
    Object.entries(values).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        el.checked = Boolean(value);
      } else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        el.value = String(value);
      }
    });
  };

  if (key === "source-default") {
    mode = "inference";
    set({
      "vram-model-select": "deepseek-r1-3b",
      "vram-gpu-select": "3060_12",
      "vram-precision-select": "fp16",
      "vram-kv-select": "fp16",
      "vram-batch-input": "1",
      "vram-sequence-input": "1024",
      "vram-users-input": "1",
      "vram-devices-input": "1",
    });
  }

  if (key === "local") {
    mode = "inference";
    set({
      "vram-model-select": "llama-3-8b",
      "vram-gpu-select": "4060ti_16",
      "vram-precision-select": "q4",
      "vram-kv-select": "fp16",
      "vram-batch-input": "1",
      "vram-sequence-input": "4096",
      "vram-users-input": "1",
      "vram-devices-input": "1",
    });
  }

  if (key === "moe") {
    mode = "inference";
    set({
      "vram-model-select": "deepseek-v3",
      "vram-gpu-select": "b200_180",
      "vram-precision-select": "q4",
      "vram-kv-select": "q8",
      "vram-batch-input": "1",
      "vram-sequence-input": "32768",
      "vram-users-input": "1",
      "vram-devices-input": "2",
      "vram-parallelism-select": "tensor",
    });
  }

  if (key === "lora") {
    mode = "finetuning";
    set({
      "vram-model-select": "llama-3-8b",
      "vram-gpu-select": "4090_24",
      "vram-ft-precision-select": "fp16",
      "vram-finetune-method-select": "lora",
      "vram-batch-input": "2",
      "vram-sequence-input": "4096",
      "vram-devices-input": "1",
      "vram-grad-accum-input": "4",
      "vram-lora-rank-input": "16",
    });
  }

  syncMode();
  applyGpu(gpuSelect.value);
}

function syncMode() {
  document.querySelectorAll<HTMLButtonElement>("[data-vram-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.vramMode === mode));
  });

  document.querySelectorAll<HTMLElement>("[data-vram-inference-field]").forEach((field) => {
    field.hidden = mode !== "inference";
  });

  document.querySelectorAll<HTMLElement>("[data-vram-finetune-field]").forEach((field) => {
    field.hidden = mode !== "finetuning";
  });
}

function updateVram(shouldSave = true) {
  const inputs = readInputs();
  if (!inputs) {
    setStatus("请输入有效的模型、硬件和批量参数", true);
    return;
  }

  const result = calculate(inputs);
  lastResult = result;
  renderResult(inputs, result);
  setStatus(`${inputs.mode === "inference" ? "推理" : "微调"}显存已计算`);

  if (shouldSave) {
    scheduleHistorySave(inputs, result);
  }
}

function readInputs(): VramInputs | null {
  const model = getModel(modelSelect.value);
  const gpu = getGpu(gpuSelect.value);
  const batch = readNumber(batchInput);
  const sequence = readNumber(sequenceInput);
  const users = readNumber(usersInput);
  const devices = readNumber(devicesInput);
  const deviceMemoryGb = readNumber(deviceMemoryInput);
  const frameworkPercent = readNumber(frameworkInput);
  const gradAccum = readNumber(gradAccumInput);
  const loraRank = readNumber(loraRankInput);
  const offloadLayers = readNumber(offloadLayersInput);
  const offloadPercent = readNumber(offloadPercentInput);
  const prefixRatio = readNumber(prefixRatioInput);
  const samples = readNumber(samplesInput);
  const tokensPerSample = readNumber(tokensSampleInput);
  const epochs = readNumber(epochsInput);
  const zeroStage = readNumberFromSelect(zeroStageSelect);
  const gradCheckpointRatio = readNumber(gradCheckpointRatioInput);
  const electricityCost = readNumber(electricityInput);
  const carbonIntensity = readNumberFromSelect(carbonSelect);

  if (
    !batch ||
    !sequence ||
    !users ||
    !devices ||
    !deviceMemoryGb ||
    frameworkPercent === null ||
    !gradAccum ||
    !loraRank ||
    offloadLayers === null ||
    offloadPercent === null ||
    prefixRatio === null ||
    !samples ||
    !tokensPerSample ||
    !epochs ||
    zeroStage === null ||
    gradCheckpointRatio === null ||
    electricityCost === null ||
    carbonIntensity === null
  ) {
    return null;
  }

  return {
    mode,
    modelKey: model.slug,
    gpuKey: gpu.key,
    gpuName: gpu.label,
    model,
    gpu,
    precision: precisionSelect.value as Precision,
    ftPrecision: ftPrecisionSelect.value as Precision,
    kvPrecision: kvSelect.value as KvPrecision,
    fineTuneMethod: fineTuneMethodSelect.value as FineTuneMethod,
    frameworkPercent: Math.max(0, frameworkPercent),
    batch: normalizeLogScale(batch, batchLogInput.checked),
    sequence: Math.max(1, sequence),
    users: normalizeLogScale(users, usersLogInput.checked),
    devices: Math.max(1, Math.round(devices)),
    deviceMemoryGb: Math.max(1, deviceMemoryGb),
    interconnect: interconnectSelect.value,
    parallelism: parallelismSelect.value as Parallelism,
    gradAccum: Math.max(1, gradAccum),
    loraRank: Math.max(1, loraRank),
    offload: offloadInput.checked,
    offloadTarget: offloadTargetSelect.value as OffloadTarget,
    layerOffload: layerOffloadInput.checked,
    offloadLayers: Math.max(0, offloadLayers),
    offloadPercent: clamp(offloadPercent, 0, 95),
    offloadKv: offloadKvInput.checked,
    prefixCaching: prefixCacheInput.checked,
    prefixRatio: clamp(prefixRatio, 0, 100),
    continuousBatching: continuousBatchingInput.checked,
    samples: Math.max(1, samples),
    tokensPerSample: Math.max(1, tokensPerSample),
    epochs: Math.max(1, epochs),
    optPreset: optPresetSelect.value,
    optimizer: optimizerSelect.value,
    zeroStage: Math.max(0, Math.min(3, Math.round(zeroStage))),
    flashAttention: flashAttnInput.checked,
    gradCheckpoint: gradCheckpointInput.checked,
    gradCheckpointRatio: clamp(gradCheckpointRatio, 0, 95),
    opt8: opt8Input.checked,
    pagedOpt: pagedOptInput.checked,
    fusedKernels: fusedKernelsInput.checked,
    activationOffload: activationOffloadInput.checked,
    sequencePacking: seqPackInput.checked,
    dynamicPadding: dynPadInput.checked,
    electricityCost: Math.max(0, electricityCost),
    carbonIntensity: Math.max(0, carbonIntensity),
    ttftSim: ttftSimInput.checked,
  };
}

function calculate(inputs: VramInputs): VramResult {
  const activeBatch = inputs.mode === "inference" ? Math.max(inputs.batch, inputs.users) : inputs.batch;
  const baseWeights = calculateWeights(inputs);
  let kv = inputs.mode === "inference" ? calculateKvCache(inputs, activeBatch) : calculateKvCache(inputs, inputs.batch) * 0.35;
  let activations = calculateActivations(inputs, activeBatch);
  let optimizer = inputs.mode === "finetuning" ? calculateFineTuningStates(inputs) : 0;

  if (inputs.prefixCaching && inputs.mode === "inference" && inputs.users > 1) {
    kv *= 1 - (inputs.prefixRatio / 100) * 0.45;
  }

  if (inputs.flashAttention) {
    activations *= 0.82;
  }
  if (inputs.gradCheckpoint && inputs.mode === "finetuning") {
    activations *= 1 - (inputs.gradCheckpointRatio / 100) * 0.55;
  }
  if (inputs.sequencePacking && inputs.mode === "finetuning") {
    activations *= 0.86;
    kv *= 0.92;
  }
  if (inputs.dynamicPadding) {
    activations *= 0.92;
  }
  if (inputs.opt8 || inputs.optimizer.includes("8bit")) {
    optimizer *= 0.55;
  }
  if (inputs.pagedOpt || inputs.optimizer.includes("paged")) {
    optimizer *= 0.8;
  }
  if (inputs.optimizer === "adafactor") {
    optimizer *= 0.42;
  }
  if (inputs.optimizer === "sgd") {
    optimizer *= 0.35;
  }
  if (inputs.activationOffload) {
    activations *= 0.65;
  }

  const presetFactor = getOptimizationPresetFactor(inputs.optPreset);
  activations *= presetFactor.activations;
  optimizer *= presetFactor.optimizer;

  const multiFactor = getMultiDeviceOverhead(inputs);
  const subtotal = baseWeights + kv + activations + optimizer;
  const offloadedGb = calculateOffloaded(inputs, baseWeights, kv, activations, optimizer);
  const overhead = Math.max(0, (subtotal - offloadedGb) * (inputs.frameworkPercent / 100 + multiFactor));
  const totalGb = Math.max(0, subtotal + overhead - offloadedGb);
  const perDeviceGb = inputs.parallelism === "replicated" ? totalGb : totalGb / inputs.devices;
  const usablePerDeviceGb = inputs.deviceMemoryGb * (inputs.gpu.type === "apu" ? 0.75 : 0.9);
  const utilization = perDeviceGb / usablePerDeviceGb;
  const { status, statusNote } = getStatus(utilization, inputs);
  const speedTps = estimateSpeed(inputs, utilization);
  const ttftMs = estimateTtft(inputs, speedTps);
  const trainingTokens = inputs.mode === "finetuning" ? inputs.samples * inputs.tokensPerSample * inputs.epochs : 0;
  const trainingHours = inputs.mode === "finetuning" ? trainingTokens / Math.max(1, speedTps * 3600) : 0;
  const powerKw = estimatePower(inputs, utilization);
  const localCostHour = powerKw * inputs.electricityCost;
  const cloudCostHour = inputs.gpu.hourly * inputs.devices;
  const carbonKgHour = powerKw * inputs.carbonIntensity / 1000;
  const breakdown = { weights: baseWeights, kv, activations, optimizer, overhead };

  return {
    totalGb,
    perDeviceGb,
    usablePerDeviceGb,
    utilization,
    status,
    statusNote,
    offloadedGb,
    speedTps,
    ttftMs,
    trainingTokens,
    trainingHours,
    powerKw,
    localCostHour,
    cloudCostHour,
    carbonKgHour,
    breakdown,
    lines: makeOutput(inputs, totalGb, perDeviceGb, usablePerDeviceGb, offloadedGb, speedTps, ttftMs, breakdown),
  };
}

function calculateWeights(inputs: VramInputs) {
  if (inputs.mode === "inference") {
    const baseline = getInferenceBaseline(inputs.model, inputs.precision);
    const seqFactor = Math.max(0.7, Math.min(1.5, inputs.sequence / Math.max(1024, inputs.model.context || 32768) + 0.8));
    return baseline ? baseline * seqFactor : inputs.model.params * precisionBytes[inputs.precision];
  }

  if (inputs.fineTuneMethod === "qlora") {
    return inputs.model.vramQ4 || inputs.model.params * precisionBytes.q4;
  }
  if (inputs.fineTuneMethod === "lora") {
    return inputs.model.vramFp16 || inputs.model.params * 2;
  }
  return inputs.model.params * precisionBytes[inputs.ftPrecision];
}

function calculateKvCache(inputs: VramInputs, activeBatch: number) {
  const hidden = inputs.model.hidden || Math.sqrt(inputs.model.params * 1_000_000_000 / Math.max(1, inputs.model.layers || 32));
  const layers = inputs.model.layers || 32;
  const headRatio = getAttentionKvRatio(inputs.model);
  const bytes = layers * inputs.sequence * activeBatch * hidden * 2 * headRatio * kvBytes[inputs.kvPrecision];
  return bytes / BYTES_PER_GB;
}

function calculateActivations(inputs: VramInputs, activeBatch: number) {
  const hidden = inputs.model.hidden || 4096;
  const layers = inputs.model.layers || 32;
  const trainMultiplier = inputs.mode === "finetuning" ? 5.5 / Math.sqrt(inputs.gradAccum) : 0.8;
  const expertMultiplier =
    inputs.model.architecture === "moe" && inputs.model.experts > 0
      ? 1 + Math.min(inputs.model.activeExperts || 1, inputs.model.experts) / inputs.model.experts
      : 1;
  const bytes = layers * activeBatch * inputs.sequence * hidden * 2 * trainMultiplier * expertMultiplier;
  return bytes / BYTES_PER_GB;
}

function calculateFineTuningStates(inputs: VramInputs) {
  const sourceBaseline =
    inputs.fineTuneMethod === "full" ? inputs.model.ftFull : inputs.fineTuneMethod === "lora" ? inputs.model.ftLora : inputs.model.ftQlora;
  if (sourceBaseline) {
    const sequenceFactor = Math.sqrt(inputs.sequence / 1024);
    const batchFactor = Math.sqrt(inputs.batch / Math.max(1, inputs.gradAccum));
    return Math.max(0, sourceBaseline * 0.55 * sequenceFactor * batchFactor);
  }

  if (inputs.fineTuneMethod === "full") {
    return inputs.model.params * 14;
  }
  const adapterParamsB = ((inputs.model.layers || 32) * 8 * (inputs.model.hidden || 4096) * inputs.loraRank) / 1_000_000_000;
  return inputs.fineTuneMethod === "qlora" ? adapterParamsB * 12 + inputs.model.params * 0.12 : adapterParamsB * 12;
}

function calculateOffloaded(inputs: VramInputs, weights: number, kv: number, activations: number, optimizer: number) {
  let offloaded = 0;
  if (inputs.offload) {
    if (inputs.layerOffload && inputs.model.layers > 0) {
      offloaded += weights * clamp(inputs.offloadLayers / inputs.model.layers, 0, 0.9);
    } else {
      offloaded += weights * (inputs.offloadPercent / 100);
    }
    if (inputs.offloadKv) {
      offloaded += kv * 0.65;
    }
    if (inputs.mode === "finetuning") {
      offloaded += optimizer * 0.45;
    }
  }
  if (inputs.activationOffload) {
    offloaded += activations * 0.25;
  }
  return offloaded;
}

function getInferenceBaseline(model: SourceModel, precision: Precision) {
  if (precision === "fp16") {
    return model.vramFp16;
  }
  if (precision === "q8") {
    return model.vramQ8;
  }
  if (precision === "q4") {
    return model.vramQ4;
  }
  if (precision === "q6") {
    return (model.vramQ8 + model.vramQ4) / 2 || model.params * precisionBytes.q6;
  }
  if (precision === "q5") {
    return model.vramQ4 * 1.18 || model.params * precisionBytes.q5;
  }
  if (precision === "q3") {
    return model.vramQ4 * 0.82 || model.params * precisionBytes.q3;
  }
  return model.params * precisionBytes[precision];
}

function getAttentionKvRatio(model: SourceModel) {
  if (model.attention === "mqa") {
    return 1 / Math.max(1, model.heads || 1);
  }
  if (model.attention === "gqa") {
    return Math.max(1, model.kvHeads || 1) / Math.max(1, model.heads || 1);
  }
  if (model.attention === "mla") {
    return 0.22;
  }
  return 1;
}

function getOptimizationPresetFactor(preset: string) {
  if (preset === "memory_efficient") {
    return { activations: 0.75, optimizer: 0.8 };
  }
  if (preset === "speed_optimized") {
    return { activations: 1.12, optimizer: 1.05 };
  }
  if (preset === "deepspeed_zero2") {
    return { activations: 0.88, optimizer: 0.55 };
  }
  if (preset === "deepspeed_zero3") {
    return { activations: 0.82, optimizer: 0.35 };
  }
  return { activations: 1, optimizer: 1 };
}

function getMultiDeviceOverhead(inputs: VramInputs) {
  if (inputs.devices <= 1) {
    return 0;
  }
  const efficiency = interconnectEfficiency[inputs.interconnect] ?? 0.85;
  const parallelFactor = inputs.parallelism === "replicated" ? 0.04 : inputs.parallelism === "pipeline" ? 0.07 : 0.08;
  return parallelFactor + (1 - efficiency) * 0.18;
}

function getStatus(utilization: number, inputs: VramInputs) {
  if (utilization <= 0.72) {
    return { status: "就绪", statusNote: "显存余量充足，可继续提高上下文、batch 或并发。" };
  }
  if (utilization <= 0.9) {
    return { status: "可以", statusNote: "配置可运行，建议保留 runtime 峰值空间。" };
  }
  if (utilization <= 1) {
    return { status: "偏紧", statusNote: "接近可用显存上限，长上下文或框架差异可能触发 OOM。" };
  }
  return {
    status: "不足",
    statusNote: inputs.devices > 1 && inputs.parallelism === "replicated" ? "副本策略会在每张卡上加载完整工作负载。" : "模型切分或更低量化可降低单卡压力。",
  };
}

function estimateSpeed(inputs: VramInputs, utilization: number) {
  const bandwidthTerm = (inputs.gpu.bandwidth * inputs.devices * (interconnectEfficiency[inputs.interconnect] ?? 0.85)) / Math.max(1, inputs.model.params);
  const batchGain = inputs.continuousBatching ? Math.sqrt(Math.max(inputs.batch, inputs.users)) * 1.25 : Math.sqrt(inputs.batch);
  const precisionGain = inputs.precision === "fp16" ? 1 : inputs.precision === "q8" ? 1.25 : 1.55;
  const utilPenalty = utilization > 0.9 ? 0.72 : utilization > 0.72 ? 0.86 : 1;
  const fusedGain = inputs.fusedKernels ? 1.08 : 1;
  return Math.max(0.2, bandwidthTerm * batchGain * precisionGain * utilPenalty * fusedGain);
}

function estimateTtft(inputs: VramInputs, speedTps: number) {
  if (!inputs.ttftSim) {
    return 0;
  }
  const prefill = (inputs.sequence / Math.max(1, speedTps * 18)) * 1000;
  const queue = inputs.mode === "inference" ? Math.max(0, inputs.users - inputs.batch) * 120 : 0;
  return prefill + queue + 180;
}

function estimatePower(inputs: VramInputs, utilization: number) {
  const active = inputs.gpu.power * inputs.devices * clamp(0.35 + utilization * 0.65, 0.35, 1);
  return active / 1000;
}

function makeOutput(
  inputs: VramInputs,
  total: number,
  perDevice: number,
  usable: number,
  offloaded: number,
  speed: number,
  ttft: number,
  breakdown: VramResult["breakdown"],
) {
  const lines = [
    `${inputs.mode === "inference" ? "推理" : "微调"}配置`,
    `模型: ${inputs.model.name}`,
    `硬件: ${inputs.devices} x ${inputs.gpuName}`,
    `权重量化/基础精度: ${inputs.mode === "inference" ? inputs.precision.toUpperCase() : inputs.ftPrecision.toUpperCase()}`,
    `序列长度: ${formatInteger(inputs.sequence)} tokens`,
    `Batch: ${formatNumber(inputs.batch, 0)}`,
    `总显存需求: ${formatGb(total)}`,
    `单设备需求: ${formatGb(perDevice)} / 可用 ${formatGb(usable)}`,
    `生成速度: ${formatNumber(speed, 1)} tok/s`,
    `TTFT: ${ttft ? `${formatNumber(ttft, 0)} ms` : "未启用"}`,
    "",
    "显存明细",
    `模型权重: ${formatGb(breakdown.weights)}`,
    `KV cache: ${formatGb(breakdown.kv)}`,
    `激活/临时缓冲: ${formatGb(breakdown.activations)}`,
    `优化器/梯度: ${formatGb(breakdown.optimizer)}`,
    `框架与多卡开销: ${formatGb(breakdown.overhead)}`,
    `卸载到系统侧: ${formatGb(offloaded)}`,
  ];

  if (inputs.mode === "finetuning") {
    lines.splice(5, 0, `微调方法: ${inputs.fineTuneMethod.toUpperCase()}`, `梯度累积: ${inputs.gradAccum}`);
  }

  if (inputs.mode === "inference") {
    lines.splice(5, 0, `KV cache: ${inputs.kvPrecision.toUpperCase()}`, `并发用户: ${formatNumber(inputs.users, 0)}`);
  }

  return lines;
}

function renderResult(inputs: VramInputs, result: VramResult) {
  setResult("fit", result.status);
  setResult("fit-note", result.statusNote);
  setResult("total", formatGb(result.totalGb));
  setResult("total-note", `${inputs.devices} 个设备，策略：${parallelismLabel(inputs.parallelism)}`);
  setResult("per-device", formatGb(result.perDeviceGb));
  setResult("usage", `占可用显存 ${formatPercent(result.utilization)}`);
  setResult("ring-percent", formatPercent(result.utilization));
  setResult("ring-detail", `${formatGb(result.perDeviceGb)} / ${formatGb(result.usablePerDeviceGb)}`);
  setResult("speed", `${formatNumber(result.speedTps, 1)} tok/s`);
  setResult("ttft", result.ttftMs ? `${formatNumber(result.ttftMs, 0)} ms` : "关闭");
  setResult("training-tokens", result.trainingTokens ? `${formatInteger(result.trainingTokens)} tokens` : "-");
  setResult("training-time", result.trainingHours ? `${formatNumber(result.trainingHours, 1)} h` : "-");
  setResult("power", `${formatNumber(result.powerKw, 2)} kW`);
  setResult("cost-hour", `$${formatNumber(result.localCostHour, 3)}`);
  setResult("cost-month", `$${formatNumber(result.localCostHour * 24 * 30, 2)}`);
  setResult("cloud-hour", result.cloudCostHour ? `$${formatNumber(result.cloudCostHour, 2)}` : "-");
  setResult("carbon-day", `${formatNumber(result.carbonKgHour * 24, 2)} kg`);
  setResult("carbon-year", `${formatNumber(result.carbonKgHour * 24 * 365, 1)} kg`);

  setBreakdown("weights", result.breakdown.weights);
  setBreakdown("kv", result.breakdown.kv);
  setBreakdown("activations", result.breakdown.activations);
  setBreakdown("optimizer", result.breakdown.optimizer);
  setBreakdown("overhead", result.breakdown.overhead);
  setBreakdown("offloaded", result.offloadedGb);

  output.value = result.lines.join("\n");
  const ringPercent = Math.min(100, Math.max(0, result.utilization * 100));
  meter.style.width = `${ringPercent}%`;
  ring.style.setProperty("--vram-ring", `${ringPercent}%`);
  fitTile.dataset.vramFitState = result.utilization > 1 ? "insufficient" : result.utilization > 0.9 ? "warning" : "ready";
  ring.dataset.vramFitState = fitTile.dataset.vramFitState;
  simulationText.textContent = `当前配置预计 ${formatNumber(result.speedTps, 1)} tok/s，${inputs.model.name} 的上下文长度为 ${formatInteger(inputs.model.context)} tokens。`;
}

function bindSliders() {
  document.querySelectorAll<HTMLInputElement>("[data-vram-slider]").forEach((slider) => {
    const target = document.getElementById(slider.dataset.vramSlider ?? "");
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    slider.addEventListener("input", () => {
      target.value = slider.value;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    });
  });

  document.querySelectorAll<HTMLInputElement>("[data-vram-number]").forEach((input) => {
    const slider = document.getElementById(input.dataset.vramNumber ?? "");
    if (!(slider instanceof HTMLInputElement)) {
      return;
    }
    input.addEventListener("input", () => {
      const value = Number(input.value);
      if (!Number.isFinite(value)) {
        return;
      }
      const min = Number(slider.min || "0");
      const max = Number(slider.max || "100");
      slider.value = String(clamp(value, min, max));
    });
  });
}

function playSimulation(reset: boolean) {
  window.clearInterval(simulationTimer);
  const result = lastResult;
  if (!result) {
    return;
  }
  const text = "The model streams tokens according to the current throughput estimate, with TTFT and batching reflected in the timing.";
  let index = reset ? 0 : simulationText.textContent?.length ?? 0;
  index = Math.min(index, text.length);
  simulationText.textContent = text.slice(0, index);
  const interval = Math.max(18, 1000 / Math.max(1, result.speedTps));
  simulationTimer = window.setInterval(() => {
    index += 1;
    simulationText.textContent = text.slice(0, index);
    if (index >= text.length) {
      window.clearInterval(simulationTimer);
    }
  }, interval);
}

function restore(item: ToolHistoryItem) {
  try {
    const restored = JSON.parse(item.input) as Record<string, unknown>;
    mode = restored.mode as CalcMode;
    setSelectIfPresent(modelSelect, String(restored.modelKey));
    setSelectIfPresent(gpuSelect, String(restored.gpuKey));
    setSelectIfPresent(precisionSelect, String(restored.precision));
    setSelectIfPresent(ftPrecisionSelect, String(restored.ftPrecision));
    setSelectIfPresent(kvSelect, String(restored.kvPrecision));
    setSelectIfPresent(fineTuneMethodSelect, String(restored.fineTuneMethod));
    syncMode();
    applyGpu(gpuSelect.value);
    updateVram(false);
    setStatus(`已复用：${item.mode}`);
  } catch {
    output.value = item.output;
    setStatus(`已复用：${item.mode}`);
  }
}

function scheduleHistorySave(inputs: VramInputs, result: VramResult) {
  window.clearTimeout(historyTimer);
  historyTimer = window.setTimeout(() => {
    history.add({
      label: `${inputs.model.name} / ${formatGb(result.totalGb)}`,
      mode: inputs.mode === "inference" ? "推理" : "微调",
      input: JSON.stringify({
        mode: inputs.mode,
        modelKey: inputs.modelKey,
        gpuKey: inputs.gpuKey,
        precision: inputs.precision,
        ftPrecision: inputs.ftPrecision,
        kvPrecision: inputs.kvPrecision,
        fineTuneMethod: inputs.fineTuneMethod,
      }),
      output: output.value,
    });
  }, 500);
}

function buildShareUrl() {
  const inputs = readInputs();
  const params = new URLSearchParams();
  if (!inputs) {
    return window.location.href;
  }
  params.set("model", inputs.modelKey);
  params.set("mode", inputs.mode);
  params.set("ftMethod", inputs.fineTuneMethod);
  params.set("quant", inputs.precision);
  params.set("kvQuant", inputs.kvPrecision);
  params.set("ftQuant", inputs.ftPrecision);
  params.set("gpu", inputs.gpuKey);
  params.set("customVram", String(inputs.deviceMemoryGb));
  params.set("numGpus", String(inputs.devices));
  params.set("batchSize", String(inputs.batch));
  params.set("seqLen", String(inputs.sequence));
  params.set("loraRank", String(inputs.loraRank));
  params.set("users", String(inputs.users));
  params.set("gradSteps", String(inputs.gradAccum));
  params.set("offload", String(inputs.offload));
  params.set("offloadTarget", inputs.offloadTarget);
  params.set("useLayerOffload", String(inputs.layerOffload));
  params.set("offloadLayers", String(inputs.offloadLayers));
  params.set("offloadPct", String(inputs.offloadPercent));
  params.set("offloadKv", String(inputs.offloadKv));
  params.set("prefixCaching", String(inputs.prefixCaching));
  params.set("prefixRatio", String(inputs.prefixRatio));
  params.set("continuousBatching", String(inputs.continuousBatching));
  params.set("elecCost", String(inputs.electricityCost));
  params.set("ttftSim", String(inputs.ttftSim));
  params.set("interconnect", inputs.interconnect);
  params.set("infParallel", inputs.parallelism);
  params.set("samples", String(inputs.samples));
  params.set("tokensPerSample", String(inputs.tokensPerSample));
  params.set("epochs", String(inputs.epochs));
  params.set("optPreset", inputs.optPreset);
  params.set("flashAttn", String(inputs.flashAttention));
  params.set("gradCkpt", String(inputs.gradCheckpoint));
  params.set("gradCkptRatio", String(inputs.gradCheckpointRatio));
  params.set("opt8bit", String(inputs.opt8));
  params.set("optPaged", String(inputs.pagedOpt));
  params.set("optType", inputs.optimizer);
  params.set("fusedKernels", String(inputs.fusedKernels));
  params.set("zeroStage", String(inputs.zeroStage));
  params.set("actOffload", String(inputs.activationOffload));
  params.set("seqPack", String(inputs.sequencePacking));
  params.set("dynPad", String(inputs.dynamicPadding));
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

function applyGpu(key: string) {
  const gpu = getGpu(key);
  deviceMemoryInput.value = String(gpu.memory);
  const memoryRange = document.getElementById("vram-device-memory-range");
  if (memoryRange instanceof HTMLInputElement) {
    memoryRange.max = String(Math.max(512, Math.ceil(gpu.memory / 64) * 64));
    memoryRange.value = String(gpu.memory);
  }
  if (gpu.vendor === "apple" || gpu.type === "apu") {
    offloadTargetSelect.value = "nvme";
    if (interconnectSelect.value.startsWith("nvlink") || interconnectSelect.value.startsWith("pcie")) {
      interconnectSelect.value = "ethernet100g";
    }
  }
}

function renderProfiles(selected = "") {
  const profiles = readProfiles();
  profileSelect.innerHTML = '<option value="">本地配置文件</option>';
  profiles.forEach((profile) => {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    profileSelect.append(option);
  });
  profileSelect.value = selected;
}

function readProfiles(): HardwareProfile[] {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "[]") as HardwareProfile[];
  } catch {
    return [];
  }
}

function writeProfiles(profiles: HardwareProfile[]) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles));
}

function getModel(key: string) {
  return sourceModels.find((model) => model.slug === key) ?? sourceModels[0];
}

function getGpu(key: string) {
  return gpuConfigs.find((gpu) => gpu.key === key) ?? gpuConfigs[0];
}

function setMode(value: CalcMode | null) {
  if (value === "inference" || value === "finetuning") {
    mode = value;
  }
}

function setSelectIfPresent(select: HTMLSelectElement, value: string | null) {
  if (value && [...select.options].some((option) => option.value === value)) {
    select.value = value;
  }
}

function setInputIfPresent(input: HTMLInputElement, value: string | null) {
  if (value !== null) {
    input.value = value;
  }
}

function setCheckedIfPresent(input: HTMLInputElement, value: string | null) {
  if (value !== null) {
    input.checked = value === "true";
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function setResult(key: string, value: string) {
  const target = document.querySelector<HTMLElement>(`[data-vram-result="${key}"]`);
  if (target) {
    target.textContent = value;
  }
}

function setBreakdown(key: string, value: number) {
  const target = document.querySelector<HTMLElement>(`[data-vram-breakdown="${key}"]`);
  if (target) {
    target.textContent = formatGb(value);
  }
}

function normalizeLogScale(value: number, logScale: boolean) {
  if (!logScale) {
    return Math.max(1, value);
  }
  return Math.max(1, 2 ** Math.round(Math.log2(Math.max(1, value))));
}

function readNumber(input: HTMLInputElement) {
  const normalized = input.value.trim().replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function readNumberFromSelect(select: HTMLSelectElement) {
  const value = Number(select.value);
  return Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatGb(value: number) {
  return `${formatNumber(value, value >= 100 ? 1 : 2)} GB`;
}

function formatPercent(value: number) {
  return `${formatNumber(value * 100, 1)}%`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

function formatNumber(value: number, decimals: number) {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function parallelismLabel(value: Parallelism) {
  if (value === "pipeline") {
    return "流水线并行";
  }
  if (value === "replicated") {
    return "副本/数据并行";
  }
  return "张量并行";
}
