# Paseo Prometheus Status

A Paseo v0.7 plugin that shows GPU utilization, temperature, VRAM, and power from Prometheus. The composer stays clear during normal operation and only shows a GPU pill when temperature needs attention.

## Install

```bash
paseo plugin add infectiousstupidity/paseo-prometheus-status
```

No `npm install` is needed for normal use.

Open the GPU status panel after installation. The settings form appears automatically until a Prometheus URL is configured. Later, use the **Settings** button in the panel header.

## Composer alert

The composer pill is alert-only:

- Below `75°C`: hidden.
- `75–84°C`: shown in the warning color while GPU utilization is above `0%`.
- `85°C` or hotter: always shown in the danger color, even if utilization has fallen to `0%`.

The critical-temperature override is intentional. A dangerously hot idle GPU should not disappear just because utilization reads zero.

Press the pill to open the full GPU status panel. When the pill is hidden, open the panel from Paseo's workspace/Explorer panel launcher or search for **Open GPU status** in the Command Center.

The status pane shows utilization, temperature, VRAM, and power for each GPU.

![Per-GPU status pane in Paseo](docs/images/status-pane.png)

## Data source

Prometheus is the only data source. By default, the plugin reads these NVIDIA DCGM Exporter metrics:

- `DCGM_FI_DEV_GPU_UTIL`
- `DCGM_FI_DEV_GPU_TEMP`
- `DCGM_FI_DEV_FB_USED`, `DCGM_FI_DEV_FB_FREE`, and `DCGM_FI_DEV_FB_RESERVED`
- `DCGM_FI_DEV_POWER_USAGE`

The plugin connects only to the configured Prometheus endpoint. It does not connect directly to GPU hosts.

## Temperature thresholds and Prometheus alerts

The composer alert currently uses the plugin's built-in `75°C` warning and `85°C` critical thresholds. These are the same thresholds used by the status panel.

Prometheus alerting rules can also be used as a single source of truth, but the threshold itself is not part of the normal GPU metric. Prometheus exposes active alert rules through the synthetic `ALERTS` metric. Supporting that cleanly would require the plugin to know which alert rule or labels represent GPU temperature warnings and critical alerts.

## Configuration

Use the settings form in the GPU status panel for normal setup. It lets you configure:

- Prometheus URL
- Metric selector
- Host label
- Whether the host label appears in the composer pill
- Optional custom Prometheus queries under **Advanced queries**

Saving updates the plugin immediately. You do not need to reload Paseo.

The settings are stored in `paseo-prometheus-status.json`:

- Windows: `%USERPROFILE%\.paseo\paseo-prometheus-status.json`
- macOS and Linux: `~/.paseo/paseo-prometheus-status.json`
- Custom home: `$PASEO_HOME/paseo-prometheus-status.json`

The file can still be edited by hand if needed:

```json
{
  "prometheusUrl": "http://prometheus.example:9090",
  "selector": "job=\"dcgm-exporter\",instance=\"gpu-host.example:9400\"",
  "hostLabel": "Inference server",
  "showHostLabelInPill": false
}
```

`selector` is inserted inside the label braces of the built-in Prometheus queries. Do not include the braces yourself.

With `showHostLabelInPill` set to `false`, an active alert pill shows a compact summary such as `GPU 42% · 78°C`. Set it to `true` to include the host label.

### Custom queries

Open **Advanced queries** in the settings form to replace any built-in query. Leave a field blank to keep the default.

The matching JSON properties are:

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

By default, freshness uses the source timestamp of the GPU utilization metric. If a custom utilization query changes that behavior, set `gpuTimestampQuery` to a query that returns each GPU's source timestamp in Unix seconds with the same GPU identity labels.

### Environment variables

Environment variables are available for containers and automated deployments. They override matching saved settings:

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

The settings form shows which environment variables are overriding saved values. Restart the Paseo daemon after changing environment variables.

The plugin refreshes every 10 seconds. A sample older than 30 seconds is shown as stale. A missing or unreachable Prometheus URL is shown as offline in the full status panel.

## Security

The server part of this plugin runs with the same permissions as the Paseo daemon. It writes one configuration file and makes HTTP or HTTPS requests to the configured Prometheus URL. It does not run shell commands or connect directly to GPU hosts.

Use HTTPS when Prometheus traffic crosses a network you do not trust. The plugin does not support custom authentication headers. Credentials placed directly in `prometheusUrl` are stored as plain text in the configuration file.

On macOS and Linux, settings saved through the plugin are written with mode `0600`. Windows uses the normal permissions of the current account.

## Known limitations

- One Prometheus endpoint and selector can be configured per plugin installation.
- The default queries expect NVIDIA DCGM Exporter metric names. Other exporters need custom queries.
- Prometheus authentication headers and bearer tokens are not supported.
- Status updates every 10 seconds, so this is not a real-time GPU monitor.
- Freshness is based on GPU utilization. Temperature, memory, or power queries can fail without hiding utilization data.
- Composer temperature thresholds are currently built into the plugin rather than read from Prometheus alert rules.

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
