import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrometheusQueries,
  buildPrometheusQueryUrl,
  gpuMetricKey,
  prometheusSourceFingerprint,
  valuesByGpu,
} from "../status.core";

test("preserves a Prometheus path prefix", () => {
  const query = 'up{job="dcgm-exporter"}';
  const url = buildPrometheusQueryUrl(
    "https://metrics.example/prometheus",
    query,
  );

  assert.equal(url.origin, "https://metrics.example");
  assert.equal(url.pathname, "/prometheus/api/v1/query");
  assert.equal(url.searchParams.get("query"), query);
});

test("accepts only HTTP Prometheus URLs", () => {
  assert.throws(
    () => buildPrometheusQueryUrl("file:///tmp/prometheus", "up"),
    /must use http:\/\/ or https:\/\//,
  );
});

test("uses UUID before the per-host GPU index", () => {
  assert.equal(
    gpuMetricKey({ gpu: "0", UUID: "GPU-a", instance: "host-a:9400" }),
    "uuid:GPU-a",
  );
  assert.equal(
    gpuMetricKey({ gpu: "0", UUID: "GPU-b", instance: "host-b:9400" }),
    "uuid:GPU-b",
  );
});

test("falls back to host plus GPU when UUID is unavailable", () => {
  assert.equal(
    gpuMetricKey({ gpu: "0", instance: "host-a:9400" }),
    "host:host-a:9400|gpu:0",
  );
  assert.equal(
    gpuMetricKey({ gpu: "0", instance: "host-b:9400" }),
    "host:host-b:9400|gpu:0",
  );
});

test("correlates values independently for identical GPU indexes on different hosts", () => {
  const values = valuesByGpu([
    {
      metric: { gpu: "0", UUID: "GPU-a", instance: "host-a:9400" },
      value: [100, "61"],
    },
    {
      metric: { gpu: "0", UUID: "GPU-b", instance: "host-b:9400" },
      value: [100, "72"],
    },
  ]);

  assert.equal(values.get("uuid:GPU-a"), 61);
  assert.equal(values.get("uuid:GPU-b"), 72);
});

test("keeps the newest duplicate sample for one GPU", () => {
  const values = valuesByGpu([
    { metric: { UUID: "GPU-a" }, value: [100, "61"] },
    { metric: { UUID: "GPU-a" }, value: [101, "62"] },
  ]);

  assert.equal(values.get("uuid:GPU-a"), 62);
});

test("filters values outside an optional metric's domain", () => {
  const values = valuesByGpu(
    [
      { metric: { UUID: "GPU-a" }, value: [100, "-1"] },
      { metric: { UUID: "GPU-b" }, value: [100, "120"] },
    ],
    (value) => value >= 0,
  );

  assert.equal(values.has("uuid:GPU-a"), false);
  assert.equal(values.get("uuid:GPU-b"), 120);
});

test("queries source timestamps for the effective utilization metric", () => {
  const queries = buildPrometheusQueries({
    prometheusUrl: "https://metrics.example/prometheus",
    selector: 'instance="host-a:9400"',
    gpuQuery: 'rate(gpu_busy_total{instance="host-a:9400"}[5m])',
  });

  assert.equal(
    queries.utilizationTimestamp,
    'timestamp(rate(gpu_busy_total{instance="host-a:9400"}[5m]))',
  );
});

test("supports an explicit source timestamp query", () => {
  const queries = buildPrometheusQueries({
    prometheusUrl: "https://metrics.example/prometheus",
    selector: "",
    gpuTimestampQuery: 'timestamp(gpu_busy_total{job="dcgm-exporter"})',
  });

  assert.equal(
    queries.utilizationTimestamp,
    'timestamp(gpu_busy_total{job="dcgm-exporter"})',
  );
});

test("source fingerprint changes when effective queries change", () => {
  const firstQueries = buildPrometheusQueries({
    prometheusUrl: "https://metrics.example/prometheus",
    selector: 'instance="host-a:9400"',
  });
  const secondQueries = buildPrometheusQueries({
    prometheusUrl: "https://metrics.example/prometheus",
    selector: 'instance="host-b:9400"',
  });

  assert.notEqual(
    prometheusSourceFingerprint(
      "https://metrics.example/prometheus",
      firstQueries,
    ),
    prometheusSourceFingerprint(
      "https://metrics.example/prometheus",
      secondQueries,
    ),
  );
});

test("source fingerprint normalizes an equivalent trailing slash", () => {
  const queries = buildPrometheusQueries({
    prometheusUrl: "https://metrics.example/prometheus",
    selector: "",
  });

  assert.equal(
    prometheusSourceFingerprint("https://metrics.example/prometheus", queries),
    prometheusSourceFingerprint("https://metrics.example/prometheus/", queries),
  );
});
