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

function noop() {}

function getGpuStatusConfig() {
  return describeGpuStatusConfig();
}

export default function contribute(server: PluginServerContext) {
  server.handle(gpuStatusGet, getGpuStatus);
  server.handle(gpuStatusConfigGet, getGpuStatusConfig);
  server.handle(gpuStatusConfigSave, saveGpuStatusConfig);
  return noop;
}
