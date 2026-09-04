import type { PluginContext } from "@getpaseo/plugin";
import { contributeGpuStatusPills, GpuStatusPanel } from "./status.client";
import { getGpuStatus } from "./status.server";
import { gpuStatusGet } from "./status.shared";

export default function contribute(plugin: PluginContext) {
  plugin.handle(gpuStatusGet, getGpuStatus);
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
