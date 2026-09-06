import type { PluginContext } from "@getpaseo/plugin";
import { contributeGpuStatusPills, GpuStatusPanel } from "./status.client";
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
  plugin.addClientSide(contributeGpuStatusPills);
  return () => {};
}
