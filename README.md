# Paseo Prometheus Status

A Paseo v0.7 plugin that shows the highest GPU utilization and temperature from Prometheus in every active agent composer. Press the pill to open a per-GPU view with utilization, temperature, VRAM, and power.

## Install

Install directly from GitHub. No `npm install` is needed for normal use.

```bash
paseo plugin add infectiousstupidity/paseo-prometheus-status
```

Then configure the Prometheus connection as described below.

## Preview

The composer pill keeps the busiest GPU utilization and highest temperature visible at a glance. Click it to open the full view.

![GPU status pill in the Paseo composer](docs/images/composer-pill.png)

The status pane shows utilization, temperature, VRAM, and power for each GPU.

![Per-GPU status pane in Paseo](docs/images/status-pane.png)

## Data source

Prometheus is the only data source. By default, the plugin reads these NVIDIA DCGM Exporter metrics:

- `DCGM_FI_DEV_GPU_UTIL`
- `DCGM_FI_DEV_GPU_TEMP`
- `DCGM_FI_DEV_FB_USED`, `DCGM_FI_DEV_FB_FREE`, and `DCGM_FI_DEV_FB_RESERVED`
- `DCGM_FI_DEV_POWER_USAGE`

The plugin connects only to the configured Prometheus endpoint. It does not connect directly to GPU hosts.

## Configuration

The plugin creates `paseo-prometheus-status.json` in the Paseo home directory the first time it requests GPU status.

- Windows: `%USERPROFILE%\.paseo\paseo-prometheus-status.json`
- macOS and Linux: `~/.paseo/paseo-prometheus-status.json`
- Custom home: `$PASEO_HOME/paseo-prometheus-status.json`

The generated file looks like this:

```json
{
  "prometheusUrl": "",
  "selector": "",
  "hostLabel": "GPU host",
  "showHostLabelInPill": false
}
```

Set `prometheusUrl` to the HTTP or HTTPS Prometheus base URL that the Paseo daemon can reach. Path-prefixed Prometheus installations are supported, for example `https://metrics.example/prometheus`.

Set `selector` to the Prometheus labels that identify the intended DCGM Exporter or GPU host. Do not include the surrounding braces.

```json
{
  "prometheusUrl": "http://prometheus.example:9090",
  "selector": "job=\"dcgm-exporter\",instance=\"gpu-host.example:9400\"",
  "hostLabel": "Inference server",
  "showHostLabelInPill": false
}
```

With `showHostLabelInPill` set to `false`, the composer shows a compact summary such as `GPU 42% · 63°C`. Set it to `true` to include `hostLabel`, for example `Inference server · GPU 42% · 63°C`. The full status pane always shows the host label.

After saving the file, reload the plugin:

```bash
paseo plugin reload paseo-prometheus-status
```

The plugin rereads the file when its 10-second cache refreshes, so most changes appear automatically within 10 seconds. Reloading applies them immediately. Invalid JSON or invalid value types are shown as unavailable with the configuration error.

### Custom queries

The selector is inserted between `{` and `}` in every default query. You can replace individual Prometheus queries by adding any of these optional properties:

```json
{
  "gpuQuery": "DCGM_FI_DEV_GPU_UTIL{job=\"dcgm-exporter\"}",
  "gpuTimestampQuery": "timestamp(DCGM_FI_DEV_GPU_UTIL{job=\"dcgm-exporter\"})",
  "temperatureQuery": "DCGM_FI_DEV_GPU_TEMP{job=\"dcgm-exporter\"}",
  "memoryUsedQuery": "DCGM_FI_DEV_FB_USED{job=\"dcgm-exporter\"}",
  "memoryTotalQuery": "DCGM_FI_DEV_FB_USED{job=\"dcgm-exporter\"} + DCGM_FI_DEV_FB_FREE{job=\"dcgm-exporter\"} + DCGM_FI_DEV_FB_RESERVED{job=\"dcgm-exporter\"}",
  "powerQuery": "DCGM_FI_DEV_POWER_USAGE{job=\"dcgm-exporter\"}"
}
```

By default, the plugin uses `timestamp(...)` around the effective `gpuQuery` so freshness reflects the source metric time rather than the time Prometheus answered the query. If a custom utilization query changes that behavior, set `gpuTimestampQuery` to a query that returns each GPU's source timestamp in Unix seconds with the same GPU identity labels.

### Environment variables

Environment variables are available for containers and automated deployments. They override matching values from the JSON file:

- `PASEO_PROMETHEUS_URL`
- `PASEO_PROMETHEUS_SELECTOR`
- `PASEO_PROMETHEUS_HOST_LABEL`
- `PASEO_PROMETHEUS_SHOW_HOST_LABEL_IN_PILL`
- `PASEO_PROMETHEUS_GPU_QUERY`
- `PASEO_PROMETHEUS_GPU_TIMESTAMP_QUERY`
- `PASEO_PROMETHEUS_GPU_TEMPERATURE_QUERY`
- `PASEO_PROMETHEUS_GPU_MEMORY_USED_QUERY`
- `PASEO_PROMETHEUS_GPU_MEMORY_TOTAL_QUERY`
- `PASEO_PROMETHEUS_GPU_POWER_QUERY`

Restart the Paseo daemon after changing environment variables. Changes to the JSON file do not require a restart.

The plugin refreshes every 10 seconds. A sample older than 30 seconds is shown as stale. A missing or unreachable Prometheus URL is shown as offline.

## Security

The server part of this plugin runs with the same permissions as the Paseo daemon. It writes one configuration file and makes HTTP or HTTPS requests to the configured `prometheusUrl`. It does not run shell commands or connect directly to GPU hosts.

Use HTTPS when Prometheus traffic crosses a network you do not trust. The plugin does not support custom authentication headers, so do not put API tokens or passwords in this repository. Credentials placed directly in `prometheusUrl` are stored as plain text in the configuration file.

On macOS and Linux, a newly created configuration file is limited to the current user with mode `0600`. Windows handles file permissions differently, so normal Windows account permissions apply there.

## Known limitations

- One Prometheus endpoint and selector can be configured per plugin installation.
- The default queries expect NVIDIA DCGM Exporter metric names. Other GPU exporters need custom queries.
- Prometheus authentication headers and bearer tokens are not supported.
- Status updates every 10 seconds, so the UI is not a real-time GPU monitor.
- Freshness is based on the GPU utilization sample. Optional temperature, memory, or power queries can fail without hiding utilization data.

## Development

```bash
npm install
npm run typecheck
npm test
paseo plugin install /absolute/path/to/paseo-prometheus-status
```

After source changes:

```bash
npm run typecheck
npm test
paseo plugin reload paseo-prometheus-status
```

## License

MIT. See [LICENSE](LICENSE).
