import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

const gpu = z.object({
  id: z.string(),
  model: z.string().nullable(),
  utilizationPercent: z.number().min(0).max(100),
  temperatureCelsius: z.number().nullable(),
  memoryUsedMiB: z.number().min(0).nullable(),
  memoryTotalMiB: z.number().min(0).nullable(),
  powerWatts: z.number().min(0).nullable(),
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

export type GpuStatus = z.output<typeof gpuStatusGet.output>;
