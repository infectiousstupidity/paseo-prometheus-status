import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  describeGpuStatusConfig,
  getGpuStatus,
  saveGpuStatusConfig,
} from "./server/status";
import {
  gpuStatusConfigGet,
  gpuStatusConfigSave,
  gpuStatusGet,
} from "./shared/status";

export default function contribute(server: PluginServerContext) {
  server.handle(gpuStatusGet, getGpuStatus);
  server.handle(gpuStatusConfigGet, () => describeGpuStatusConfig());
  server.handle(gpuStatusConfigSave, saveGpuStatusConfig);
  return () => {};
}
