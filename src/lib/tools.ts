export type ToolId =
  | "json-formatter"
  | "base64"
  | "timestamp"
  | "sigmastudio-delay"
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
    id: "sigmastudio-delay",
    title: "SigmaStudio Delay",
    description: "延迟时间、samples 与声学距离互算。",
    category: "音频",
    tags: ["SigmaStudio", "Delay", "Samples", "DSP"],
    path: "/tools/sigmastudio-delay",
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
