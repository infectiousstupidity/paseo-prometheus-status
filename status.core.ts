export interface PrometheusSourceConfig {
  prometheusUrl: string;
  selector: string;
  gpuQuery?: string;
  temperatureQuery?: string;
  memoryUsedQuery?: string;
  memoryTotalQuery?: string;
  powerQuery?: string;
}

export interface PrometheusQueries {
  utilization: string;
  temperature: string;
  memoryUsed: string;
  memoryTotal: string;
  power: string;
}

export interface PrometheusVectorResult {
  metric?: Record<string, string>;
  value?: [number, string];
}

function metric(name: string, selector: string): string {
  return `${name}{${selector}}`;
}

export function buildPrometheusQueries(
  config: PrometheusSourceConfig,
): PrometheusQueries {
  return {
    utilization:
      config.gpuQuery ?? metric("DCGM_FI_DEV_GPU_UTIL", config.selector),
    temperature:
      config.temperatureQuery ??
      metric("DCGM_FI_DEV_GPU_TEMP", config.selector),
    memoryUsed:
      config.memoryUsedQuery ??
      metric("DCGM_FI_DEV_FB_USED", config.selector),
    memoryTotal:
      config.memoryTotalQuery ??
      `${metric("DCGM_FI_DEV_FB_USED", config.selector)} + ${metric("DCGM_FI_DEV_FB_FREE", config.selector)} + ${metric("DCGM_FI_DEV_FB_RESERVED", config.selector)}`,
    power:
      config.powerQuery ??
      metric("DCGM_FI_DEV_POWER_USAGE", config.selector),
  };
}

function normalizePrometheusBaseUrl(prometheusUrl: string): URL {
  let url: URL;
  try {
    url = new URL(prometheusUrl);
  } catch (error) {
    throw new Error("prometheusUrl must be a valid URL", { cause: error });
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("prometheusUrl must use http:// or https://");
  }

  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

export function buildPrometheusQueryUrl(
  prometheusUrl: string,
  query: string,
): URL {
  const url = new URL("api/v1/query", normalizePrometheusBaseUrl(prometheusUrl));
  url.searchParams.set("query", query);
  return url;
}

export function prometheusSourceFingerprint(
  prometheusUrl: string,
  queries: PrometheusQueries,
): string {
  return JSON.stringify([
    normalizePrometheusBaseUrl(prometheusUrl).toString(),
    queries.utilization,
    queries.temperature,
    queries.memoryUsed,
    queries.memoryTotal,
    queries.power,
  ]);
}

export function gpuMetricKey(metric: Record<string, string>): string | null {
  const uuid = metric.UUID?.trim() || metric.uuid?.trim();
  if (uuid) return `uuid:${uuid}`;

  const gpu = metric.gpu?.trim() || metric.device?.trim();
  if (!gpu) return null;

  const host =
    metric.instance?.trim() ||
    metric.Hostname?.trim() ||
    metric.hostname?.trim();
  return host ? `host:${host}|gpu:${gpu}` : `gpu:${gpu}`;
}

export function valuesByGpu(
  results: PrometheusVectorResult[],
): Map<string, number> {
  const latest = new Map<string, { sampledAt: number; value: number }>();

  for (const { metric = {}, value } of results) {
    const key = gpuMetricKey(metric);
    const numericValue = Number(value?.[1]);
    if (!key || !Number.isFinite(numericValue)) continue;

    const sampledAt = value?.[0] ?? 0;
    const current = latest.get(key);
    if (!current || sampledAt >= current.sampledAt) {
      latest.set(key, { sampledAt, value: numericValue });
    }
  }

  return new Map([...latest].map(([key, entry]) => [key, entry.value]));
}
