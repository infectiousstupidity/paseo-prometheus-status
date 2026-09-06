import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

const gpu = z.object({
  key: z.string(),
  id: z.string(),
  model: z.string().nullable(),
  utilizationPercent: z.number().min(0).max(100),
  temperatureCelsius: z.number().nullable(),
  memoryUsedMiB: z.number().min(0).nullable(),
  memoryTotalMiB: z.number().min(0).nullable(),
  powerWatts: z.number().min(0).nullable(),
});

const gpuStatusConfigState = z.object({
  configPath: z.string(),
  prometheusUrl: z.string(),
  selector: z.string(),
  hostLabel: z.string(),
  showHostLabelInPill: z.boolean(),
  gpuQuery: z.string(),
  gpuTimestampQuery: z.string(),
  temperatureQuery: z.string(),
  memoryUsedQuery: z.string(),
  memoryTotalQuery: z.string(),
  powerQuery: z.string(),
  envOverrides: z.array(z.string()),
  fileValid: z.boolean(),
});

export const gpuStatusGet = defineRpc({
  name: "gpu-status.get",
  input: z.object({}),
  output: z.object({
    status: z.enum(["ok", "unavailable"]),
    hostLabel: z.string(),
    showHostLabelInPill: z.boolean(),
    gpus: z.array(gpu),
    maxUtilizationPercent: z.number().min(0).max(100).nullable(),
    sampledAt: z.string().datetime().nullable(),
    message: z.string().nullable(),
  }),
});

export const gpuStatusConfigGet = defineRpc({
  name: "gpu-status.config.get",
  input: z.object({}),
  output: gpuStatusConfigState,
});

export const gpuStatusConfigSave = defineRpc({
  name: "gpu-status.config.save",
  input: z.object({
    prometheusUrl: z.string(),
    selector: z.string(),
    hostLabel: z.string(),
    showHostLabelInPill: z.boolean(),
    gpuQuery: z.string(),
    gpuTimestampQuery: z.string(),
    temperatureQuery: z.string(),
    memoryUsedQuery: z.string(),
    memoryTotalQuery: z.string(),
    powerQuery: z.string(),
  }),
  output: gpuStatusConfigState.extend({
    replacedInvalidFile: z.boolean(),
  }),
});

export type GpuStatus = z.output<typeof gpuStatusGet.output>;
export type GpuStatusConfig = z.output<typeof gpuStatusConfigGet.output>;
