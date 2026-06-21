export type ToolId =
  | "json-formatter"
  | "yaml-formatter"
  | "base64"
  | "timestamp"
  | "credentials-generator"
  | "vram-calculator"
  | "sigmastudio-delay"
  | "sigmastudio-limiter"
  | "multi-source-delay"
  | "parametric-eq";

export interface ToolMeta {
  id: ToolId;
  title: string;
  description: string;
  category: string;
  tags: string[];
  path: string;
}

export const tools: ToolMeta[] = [
  {
    id: "json-formatter",
    title: "JSON 格式化",
    description: "格式化、压缩并校验 JSON 内容。",
    category: "开发",
    tags: ["JSON", "格式化", "校验", "压缩"],
    path: "/tools/json-formatter",
  },
  {
    id: "yaml-formatter",
    title: "YAML 格式化",
    description: "格式化、校验 YAML 内容，并可转换为 JSON。",
    category: "开发",
    tags: ["YAML", "格式化", "校验", "JSON"],
    path: "/tools/yaml-formatter",
  },
  {
    id: "base64",
    title: "Base64 编解码",
    description: "在浏览器本地完成文本与 Base64 的互转。",
    category: "编码",
    tags: ["Base64", "编码", "解码", "文本"],
    path: "/tools/base64",
  },
  {
    id: "timestamp",
    title: "时间戳转换",
    description: "Unix 秒/毫秒时间戳与本地日期时间互转。",
    category: "时间",
    tags: ["时间戳", "Unix", "ISO", "日期"],
    path: "/tools/timestamp",
  },
  {
    id: "credentials-generator",
    title: "Credentials Generator",
    description: "为 .env 生成浏览器本地随机密钥。",
    category: "开发",
    tags: [".env", "Secret", "Credentials", "随机密钥"],
    path: "/tools/credentials-generator",
  },
  {
    id: "vram-calculator",
    title: "VRAM 计算器",
    description: "估算 LLM 推理、微调和多卡部署所需显存。",
    category: "AI",
    tags: ["VRAM", "LLM", "GPU", "显存"],
    path: "/tools/vram-calculator",
  },
  {
    id: "sigmastudio-delay",
    title: "SigmaStudio Delay",
    description: "延迟时间、samples 与声学距离互算。",
    category: "音频",
    tags: ["SigmaStudio", "Delay", "Samples", "DSP"],
    path: "/tools/sigmastudio-delay",
  },
  {
    id: "sigmastudio-limiter",
    title: "SigmaStudio Limiter",
    description: "Limiter 阈值、RMS、Decay 与 DSP 参数换算。",
    category: "音频",
    tags: ["SigmaStudio", "Limiter", "Dynamics", "DSP"],
    path: "/tools/sigmastudio-limiter",
  },
  {
    id: "multi-source-delay",
    title: "多点声源延时",
    description: "多声源到同一采集点的同步到达延迟计算。",
    category: "音频",
    tags: ["声源", "延时", "距离", "同步"],
    path: "/tools/multi-source-delay",
  },
  {
    id: "parametric-eq",
    title: "参量 EQ",
    description: "Q、中心频点、左右频点与增益联动计算并绘制曲线。",
    category: "音频",
    tags: ["EQ", "Q", "频点", "增益"],
    path: "/tools/parametric-eq",
  },
];

export function getToolById(id: string) {
  return tools.find((tool) => tool.id === id);
}
