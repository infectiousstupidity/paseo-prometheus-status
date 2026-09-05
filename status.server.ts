import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { output as ZodOutput } from "zod";
import {
  buildPrometheusQueries,
  buildPrometheusQueryUrl,
  gpuMetricKey,
  prometheusSourceFingerprint,
  valuesByGpu,
  type PrometheusSourceConfig,
  type PrometheusVectorResult,
} from "./status.core";
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

interface PluginConfig extends PrometheusSourceConfig {
  hostLabel: string;
  showHostLabelInPill: boolean;
}

interface PrometheusResponse {
  status?: string;
  error?: string;
  data?: {
    resultType?: string;
    result?: PrometheusVectorResult[];
  };
}

interface CollectionResult {
  status: GpuStatus;
  sourceFingerprint: string | null;
}

let cachedStatus: GpuStatus | undefined;
let cachedSourceFingerprint: string | null = null;
let cachedAt = 0;
let pending: Promise<GpuStatus> | undefined;

function cachedStatusForSource(
  sourceFingerprint: string | null,
): GpuStatus | undefined {
  if (
    sourceFingerprint === null ||
    sourceFingerprint !== cachedSourceFingerprint
  ) {
    return undefined;
  }
  return cachedStatus;
}

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
    gpuTimestampQuery:
      process.env.PASEO_PROMETHEUS_GPU_TIMESTAMP_QUERY?.trim() ||
      optionalString(raw.gpuTimestampQuery, "gpuTimestampQuery"),
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
  previousStatus?: GpuStatus,
): GpuStatus {
  return {
    status: "unavailable",
    hostLabel: config.hostLabel,
    showHostLabelInPill: config.showHostLabelInPill,
    gpus: previousStatus?.gpus ?? [],
    maxUtilizationPercent: previousStatus?.maxUtilizationPercent ?? null,
    sampledAt: previousStatus?.sampledAt ?? null,
    message,
  };
}

async function queryPrometheus(
  prometheusUrl: string,
  query: string,
): Promise<PrometheusVectorResult[]> {
  const response = await fetch(buildPrometheusQueryUrl(prometheusUrl, query), {
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

async function collect(): Promise<CollectionResult> {
  let config: PluginConfig;
  try {
    config = loadConfig();
  } catch (error) {
    return {
      status: unavailable(
        error instanceof Error
          ? error.message
          : "Could not load plugin configuration",
      ),
      sourceFingerprint: null,
    };
  }

  if (!config.prometheusUrl) {
    return {
      status: unavailable(`Set prometheusUrl in ${CONFIG_PATH}`, config),
      sourceFingerprint: null,
    };
  }

  let sourceFingerprint: string | null = null;
  try {
    const queries = buildPrometheusQueries(config);
    sourceFingerprint = prometheusSourceFingerprint(
      config.prometheusUrl,
      queries,
    );

    const [
      utilizationResults,
      utilizationTimestampResults,
      temperatureResults,
      memoryUsedResults,
      memoryTotalResults,
      powerResults,
    ] = await Promise.all([
      queryPrometheus(config.prometheusUrl, queries.utilization),
      queryPrometheus(config.prometheusUrl, queries.utilizationTimestamp),
      queryPrometheus(config.prometheusUrl, queries.temperature),
      queryPrometheus(config.prometheusUrl, queries.memoryUsed),
      queryPrometheus(config.prometheusUrl, queries.memoryTotal),
      queryPrometheus(config.prometheusUrl, queries.power),
    ]);
    const utilizationTimestamps = valuesByGpu(utilizationTimestampResults);
    const temperatures = valuesByGpu(temperatureResults);
    const memoryUsed = valuesByGpu(memoryUsedResults);
    const memoryTotal = valuesByGpu(memoryTotalResults);
    const power = valuesByGpu(powerResults);
    const gpusByKey = new Map<
      string,
      {
        key: string;
        id: string;
        model: string | null;
        utilizationPercent: number;
        temperatureCelsius: number | null;
        memoryUsedMiB: number | null;
        memoryTotalMiB: number | null;
        powerWatts: number | null;
        sampleSeconds: number | undefined;
      }
    >();

    for (const { metric = {}, value } of utilizationResults) {
      const key = gpuMetricKey(metric);
      const utilizationPercent = Number(value?.[1]);
      if (
        !key ||
        !Number.isFinite(utilizationPercent) ||
        utilizationPercent < 0 ||
        utilizationPercent > 100
      ) {
        continue;
      }

      const sampleSeconds = utilizationTimestamps.get(key);
      if (sampleSeconds === undefined || sampleSeconds <= 0) continue;

      const previous = gpusByKey.get(key);
      if (
        previous?.sampleSeconds !== undefined &&
        previous.sampleSeconds > sampleSeconds
      ) {
        continue;
      }

      gpusByKey.set(key, {
        key,
        id: metric.gpu ?? metric.device ?? metric.UUID ?? "unknown",
        model: metric.modelName ?? null,
        utilizationPercent,
        temperatureCelsius: temperatures.get(key) ?? null,
        memoryUsedMiB: memoryUsed.get(key) ?? null,
        memoryTotalMiB: memoryTotal.get(key) ?? null,
        powerWatts: power.get(key) ?? null,
        sampleSeconds,
      });
    }

    const gpus = [...gpusByKey.values()].sort(
      (left, right) =>
        left.id.localeCompare(right.id) || left.key.localeCompare(right.key),
    );

    if (gpus.length === 0) {
      return {
        status: unavailable(
          "Prometheus returned no GPU metrics",
          config,
          cachedStatusForSource(sourceFingerprint),
        ),
        sourceFingerprint,
      };
    }

    const oldestSampleSeconds = Math.min(
      ...gpus.map(({ sampleSeconds }) => sampleSeconds ?? 0),
    );
    return {
      status: {
        status: "ok",
        hostLabel: config.hostLabel,
        showHostLabelInPill: config.showHostLabelInPill,
        gpus: gpus.map(
          ({
            key,
            id,
            model,
            utilizationPercent,
            temperatureCelsius,
            memoryUsedMiB,
            memoryTotalMiB,
            powerWatts,
          }) => ({
            key,
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
        sampledAt: new Date(oldestSampleSeconds * 1000).toISOString(),
        message: null,
      },
      sourceFingerprint,
    };
  } catch (error) {
    return {
      status: unavailable(
        error instanceof Error ? error.message : "Prometheus query failed",
        config,
        cachedStatusForSource(sourceFingerprint),
      ),
      sourceFingerprint,
    };
  }
}

export async function getGpuStatus(
  _input: ZodOutput<typeof gpuStatusGet.input>,
): Promise<GpuStatus> {
  if (cachedStatus && Date.now() - cachedAt < CACHE_DURATION_MS) {
    return cachedStatus;
  }

  pending ??= collect().then(({ status, sourceFingerprint }) => {
    cachedStatus = status;
    cachedSourceFingerprint = sourceFingerprint;
    cachedAt = Date.now();
    return status;
  });

  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
