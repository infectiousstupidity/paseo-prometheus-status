import type { PluginClientContext } from "@getpaseo/plugin/client";
import { contributeGpuAlertPills } from "./client/gpu-alert";
import { GpuStatusSettings } from "./client/settings";
import { GpuStatusPanel } from "./client/status";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "gpu-status",
    title: "GPU status",
    icon: "Gauge",
    context: "agent",
    locations: ["workspace", "explorer"],
    Component: GpuStatusPanel,
  });
  client.addCommandCenterItem({
    id: "open-gpu-status",
    title: "Open GPU status",
    icon: "Gauge",
    context: "agent",
    keywords: ["gpu", "temperature", "prometheus"],
    onSelect({ openPanel }) {
      openPanel("gpu-status");
    },
  });
  client.addSettingsScreen({
    id: "configuration",
    title: "GPU status",
    icon: "Gauge",
    Component: GpuStatusSettings,
  });

  const stopGpuAlertPills = contributeGpuAlertPills(client);
  return () => {
    stopGpuAlertPills();
  };
}
