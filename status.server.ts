import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { output as ZodOutput } from "zod";
import type { GpuStatus } from "./status.shared";
import type { gpuStatusGet } from "./status.shared";

const CONFIG_PATH = join(
  process.env.PASEO_HOME?.trim() || join(homedir(), ".paseo"),
  "paseo-prometheus-status.json",
);
const DEFAULT_CONFIG = {
  prometheusUrl: "",
  selector: "",
  hostLabel: "GPU host",
  showHostLabelInPill: false,
};
const CACHE_DURATION_MS = 10_000;
const REQUEST_TIMEOUT_MS = 4_000;

interface PluginConfig {
  prometheusUrl: string;
  selector: string;
  hostLabel: string;
  showHostLabelInPill: boolean;
  gpuQuery?: string;
  temperatureQuery?: string;
  memoryUsedQuery?: string;
  memoryTotalQuery?: string;
  powerQuery?: string;
}

interface PrometheusVectorResult {
  metric?: Record<string, string>;
  value?: [number, string];
}

interface PrometheusResponse {
  status?: string;
  error?: string;
  data?: {
    resultType?: string;
    result?: PrometheusVectorResult[];
  };
}

let cachedStatus: GpuStatus | undefined;
let cachedAt = 0;
let pending: Promise<GpuStatus> | undefined;

function ensureConfigFile() {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  try {
    writeFileSync(CONFIG_PATH, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "EEXIST")
    ) {
      throw error;
    }
  }
}

try {
  ensureConfigFile();
} catch (error) {
  console.error("Could not create GPU status configuration", error);
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${name} must be a string`);
  return value.trim() || undefined;
}

function loadConfig(): PluginConfig {
  ensureConfigFile();

  let value: unknown;
  try {
    value = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (error) {
    throw new Error(
      `${CONFIG_PATH} contains invalid JSON: ${error instanceof Error ? error.message : "parse failed"}`,
      { cause: error },
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${CONFIG_PATH} must contain a JSON object`);
  }
  const raw = value as Record<string, unknown>;
  if (
    raw.showHostLabelInPill !== undefined &&
    typeof raw.showHostLabelInPill !== "boolean"
  ) {
    throw new Error("showHostLabelInPill must be a boolean");
  }

  return {
    prometheusUrl:
      process.env.PASEO_PROMETHEUS_URL?.trim() ||
      optionalString(raw.prometheusUrl, "prometheusUrl") ||
      "",
    selector:
      process.env.PASEO_PROMETHEUS_SELECTOR?.trim() ??
      optionalString(raw.selector, "selector") ??
      "",
    hostLabel:
      process.env.PASEO_PROMETHEUS_HOST_LABEL?.trim() ||
      optionalString(raw.hostLabel, "hostLabel") ||
      DEFAULT_CONFIG.hostLabel,
    showHostLabelInPill: process.env.PASEO_PROMETHEUS_SHOW_HOST_LABEL_IN_PILL
      ? process.env.PASEO_PROMETHEUS_SHOW_HOST_LABEL_IN_PILL.trim().toLowerCase() ===
        "true"
      : (raw.showHostLabelInPill ?? DEFAULT_CONFIG.showHostLabelInPill),
    gpuQuery:
      process.env.PASEO_PROMETHEUS_GPU_QUERY?.trim() ||
      optionalString(raw.gpuQuery, "gpuQuery"),
    temperatureQuery:
      process.env.PASEO_PROMETHEUS_GPU_TEMPERATURE_QUERY?.trim() ||
      optionalString(raw.temperatureQuery, "temperatureQuery"),
    memoryUsedQuery:
      process.env.PASEO_PROMETHEUS_GPU_MEMORY_USED_QUERY?.trim() ||
      optionalString(raw.memoryUsedQuery, "memoryUsedQuery"),
    memoryTotalQuery:
      process.env.PASEO_PROMETHEUS_GPU_MEMORY_TOTAL_QUERY?.trim() ||
      optionalString(raw.memoryTotalQuery, "memoryTotalQuery"),
    powerQuery:
      process.env.PASEO_PROMETHEUS_GPU_POWER_QUERY?.trim() ||
      optionalString(raw.powerQuery, "powerQuery"),
  };
}

function unavailable(
  message: string,
  config: Pick<
    PluginConfig,
    "hostLabel" | "showHostLabelInPill"
  > = DEFAULT_CONFIG,
): GpuStatus {
  return {
    status: "unavailable",
    hostLabel: config.hostLabel,
    showHostLabelInPill: config.showHostLabelInPill,
    gpus: cachedStatus?.gpus ?? [],
    maxUtilizationPercent: cachedStatus?.maxUtilizationPercent ?? null,
    sampledAt: cachedStatus?.sampledAt ?? null,
    message,
  };
}

async function queryPrometheus(
  prometheusUrl: string,
  query: string,
): Promise<PrometheusVectorResult[]> {
  const url = new URL("/api/v1/query", `${prometheusUrl.replace(/\/$/, "")}/`);
  url.searchParams.set("query", query);
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Prometheus returned HTTP ${response.status}`);
  }

  const payload = (await response.json()) as PrometheusResponse;
  if (payload.status !== "success" || payload.data?.resultType !== "vector") {
    throw new Error(
      payload.error ?? "Prometheus returned an invalid vector response",
    );
  }
  return payload.data.result ?? [];
}

function valuesByGpu(results: PrometheusVectorResult[]): Map<string, number> {
  return new Map(
    results
      .map(
        ({ metric = {}, value }) =>
          [
            metric.gpu ?? metric.device ?? metric.UUID ?? "unknown",
            Number(value?.[1]),
          ] as const,
      )
      .filter((entry) => Number.isFinite(entry[1])),
  );
}

async function collect(): Promise<GpuStatus> {
  let config: PluginConfig;
  try {
    config = loadConfig();
  } catch (error) {
    return unavailable(
      error instanceof Error
        ? error.message
        : "Could not load plugin configuration",
    );
  }

  if (!config.prometheusUrl) {
    return unavailable(`Set prometheusUrl in ${CONFIG_PATH}`, config);
  }

  const metric = (name: string) => `${name}{${config.selector}}`;
  try {
    const [
      utilizationResults,
      temperatureResults,
      memoryUsedResults,
      memoryTotalResults,
      powerResults,
    ] = await Promise.all([
      queryPrometheus(
        config.prometheusUrl,
        config.gpuQuery ?? metric("DCGM_FI_DEV_GPU_UTIL"),
      ),
      queryPrometheus(
        config.prometheusUrl,
        config.temperatureQuery ?? metric("DCGM_FI_DEV_GPU_TEMP"),
      ),
      queryPrometheus(
        config.prometheusUrl,
        config.memoryUsedQuery ?? metric("DCGM_FI_DEV_FB_USED"),
      ),
      queryPrometheus(
        config.prometheusUrl,
        config.memoryTotalQuery ??
          `${metric("DCGM_FI_DEV_FB_USED")} + ${metric("DCGM_FI_DEV_FB_FREE")} + ${metric("DCGM_FI_DEV_FB_RESERVED")}`,
      ),
      queryPrometheus(
        config.prometheusUrl,
        config.powerQuery ?? metric("DCGM_FI_DEV_POWER_USAGE"),
      ),
    ]);
    const temperatures = valuesByGpu(temperatureResults);
    const memoryUsed = valuesByGpu(memoryUsedResults);
    const memoryTotal = valuesByGpu(memoryTotalResults);
    const power = valuesByGpu(powerResults);
    const gpus = utilizationResults
      .map(({ metric = {}, value }) => {
        const id = metric.gpu ?? metric.device ?? metric.UUID ?? "unknown";
        return {
          id,
          model: metric.modelName ?? null,
          utilizationPercent: Number(value?.[1]),
          temperatureCelsius: temperatures.get(id) ?? null,
          memoryUsedMiB: memoryUsed.get(id) ?? null,
          memoryTotalMiB: memoryTotal.get(id) ?? null,
          powerWatts: power.get(id) ?? null,
          sampleSeconds: value?.[0],
        };
      })
      .filter(
        (gpu) =>
          Number.isFinite(gpu.utilizationPercent) &&
          gpu.utilizationPercent >= 0 &&
          gpu.utilizationPercent <= 100,
      )
      .sort((left, right) => left.id.localeCompare(right.id));

    if (gpus.length === 0) {
      return unavailable("Prometheus returned no GPU metrics", config);
    }

    const newestSampleSeconds = Math.max(
      ...gpus.map(({ sampleSeconds }) => sampleSeconds ?? 0),
    );
    return {
      status: "ok",
      hostLabel: config.hostLabel,
      showHostLabelInPill: config.showHostLabelInPill,
      gpus: gpus.map(
        ({
          id,
          model,
          utilizationPercent,
          temperatureCelsius,
          memoryUsedMiB,
          memoryTotalMiB,
          powerWatts,
        }) => ({
          id,
          model,
          utilizationPercent,
          temperatureCelsius,
          memoryUsedMiB,
          memoryTotalMiB,
          powerWatts,
        }),
      ),
      maxUtilizationPercent: Math.max(
        ...gpus.map(({ utilizationPercent }) => utilizationPercent),
      ),
      sampledAt: new Date(newestSampleSeconds * 1000).toISOString(),
      message: null,
    };
  } catch (error) {
    return unavailable(
      error instanceof Error ? error.message : "Prometheus query failed",
      config,
    );
  }
}

export async function getGpuStatus(
  _input: ZodOutput<typeof gpuStatusGet.input>,
): Promise<GpuStatus> {
  if (cachedStatus && Date.now() - cachedAt < CACHE_DURATION_MS) {
    return cachedStatus;
  }

  pending ??= collect().then((status) => {
    cachedStatus = status;
    cachedAt = Date.now();
    return status;
  });

  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
