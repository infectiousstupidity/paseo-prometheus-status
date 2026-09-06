import type { PluginContext } from "@getpaseo/plugin";
import { contributeGpuAlertPills } from "./gpu-alert.client";
import { GpuStatusPanel } from "./status.client";
import {
  describeGpuStatusConfig,
  getGpuStatus,
  saveGpuStatusConfig,
} from "./status.server";
import {
  gpuStatusConfigGet,
  gpuStatusConfigSave,
  gpuStatusGet,
} from "./status.shared";

export default function contribute(plugin: PluginContext) {
  plugin.handle(gpuStatusGet, getGpuStatus);
  plugin.handle(gpuStatusConfigGet, () => describeGpuStatusConfig());
  plugin.handle(gpuStatusConfigSave, saveGpuStatusConfig);
  plugin.addWorkspacePanel({
    id: "gpu-status",
    title: "GPU status",
    icon: "Gauge",
    context: "agent",
    locations: ["workspace", "explorer"],
    Component: GpuStatusPanel,
  });
  plugin.addCommandCenterItem({
    id: "open-gpu-status",
    title: "Open GPU status",
    icon: "Gauge",
    context: "agent",
    keywords: ["gpu", "temperature", "prometheus"],
    onSelect({ openPanel }) {
      openPanel("gpu-status");
    },
  });
  plugin.addClientSide(contributeGpuAlertPills);
  return () => {};
}
