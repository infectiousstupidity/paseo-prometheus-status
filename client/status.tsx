import {
  type PluginAgentPanelProps,
  type PluginComposerPillProps,
  useRpc,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, Text, View } from "react-native";
import {
  gpuStatusConfigGet,
  gpuStatusGet,
  type GpuStatus,
} from "../shared/status";

const REFRESH_INTERVAL_MS = 10_000;
const STALE_AFTER_SECONDS = 30;
const WARM_TEMPERATURE_CELSIUS = 75;
const HOT_TEMPERATURE_CELSIUS = 85;

type Gpu = GpuStatus["gpus"][number];
type DisplayKind =
  | "connecting"
  | "healthy"
  | "warm"
  | "hot"
  | "stale"
  | "offline";

type PluginColors = PluginAgentPanelProps["theme"]["colors"];

function ageInSeconds(sampledAt: string | null): number | null {
  if (!sampledAt) return null;
  return Math.max(0, Math.round((Date.now() - Date.parse(sampledAt)) / 1000));
}

function useGpuStatus(hostId: string) {
  const getStatus = useRpc(gpuStatusGet);
  return useQuery({
    queryKey: ["paseo-prometheus-status", "status", hostId],
    queryFn: () => getStatus({}),
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS - 1,
    retry: 1,
  });
}

function useGpuConfig(hostId: string) {
  const getConfig = useRpc(gpuStatusConfigGet);
  return useQuery({
    queryKey: ["paseo-prometheus-status", "config", hostId],
    queryFn: () => getConfig({}),
    staleTime: REFRESH_INTERVAL_MS,
  });
}

function displayState(status: GpuStatus | undefined, isQueryFailed = false) {
  const age = ageInSeconds(status?.sampledAt ?? null);
  const utilization = status?.maxUtilizationPercent ?? null;
  const temperatures = (status?.gpus ?? [])
    .map((gpu) => gpu.temperatureCelsius)
    .filter((temperature): temperature is number => temperature !== null);
  const maxTemperature =
    temperatures.length > 0 ? Math.max(...temperatures) : null;

  let kind: DisplayKind;
  if (isQueryFailed || status?.status === "unavailable") kind = "offline";
  else if (!status) kind = "connecting";
  else if (age !== null && age > STALE_AFTER_SECONDS) kind = "stale";
  else if (maxTemperature !== null && maxTemperature >= HOT_TEMPERATURE_CELSIUS)
    kind = "hot";
  else if (
    maxTemperature !== null &&
    maxTemperature >= WARM_TEMPERATURE_CELSIUS
  )
    kind = "warm";
  else kind = "healthy";

  return { age, kind, maxTemperature, utilization };
}

function formatAge(age: number | null): string {
  if (age === null) return "No recent sample";
  if (age < 1) return "Updated just now";
  if (age < 60) return `Updated ${age}s ago`;
  const minutes = Math.floor(age / 60);
  return `Last update ${minutes}m ago`;
}

function formatModel(model: string | null): string {
  return model?.replace(/^NVIDIA (?:GeForce )?/, "") ?? "Unknown model";
}

function formatMemory(usedMiB: number | null, totalMiB: number | null): string {
  if (usedMiB === null || totalMiB === null) return "Unavailable";
  return `${(usedMiB / 1024).toFixed(1)} / ${(totalMiB / 1024).toFixed(1)} GB`;
}

function statusPresentation(
  kind: DisplayKind,
  theme: PluginAgentPanelProps["theme"],
) {
  if (kind === "offline")
    return { label: "Unreachable", color: theme.colors.statusDanger };
  if (kind === "stale")
    return { label: "Stale", color: theme.colors.statusWarning };
  if (kind === "hot") return { label: "Hot", color: theme.colors.statusDanger };
  if (kind === "warm")
    return { label: "Warm", color: theme.colors.statusWarning };
  if (kind === "connecting")
    return { label: "Connecting", color: theme.colors.foregroundMuted };
  return { label: "Healthy", color: theme.colors.statusSuccess };
}

function pillColor(kind: DisplayKind, colors: PluginColors): string {
  if (kind === "hot" || kind === "offline") return colors.statusDanger;
  if (kind === "warm" || kind === "stale") return colors.statusWarning;
  return colors.foregroundMuted;
}

function temperatureColor(
  temperatureCelsius: number | null,
  colors: PluginColors,
): string {
  if (
    temperatureCelsius !== null &&
    temperatureCelsius >= HOT_TEMPERATURE_CELSIUS
  ) {
    return colors.statusDanger;
  }
  if (
    temperatureCelsius !== null &&
    temperatureCelsius >= WARM_TEMPERATURE_CELSIUS
  ) {
    return colors.statusWarning;
  }
  return colors.foreground;
}

function StatusChip({
  label,
  color,
  detail,
  theme,
}: {
  label: string;
  color: string;
  detail: string;
  theme: PluginAgentPanelProps["theme"];
}) {
  return (
    <View style={{ alignItems: "flex-end", gap: 5 }}>
      <View
        accessible
        accessibilityLabel={`${label} — ${detail}`}
        style={{
          alignItems: "center",
          backgroundColor: theme.colors.surface1,
          borderColor: color,
          borderRadius: 999,
          borderWidth: 1,
          flexDirection: "row",
          gap: 6,
          paddingHorizontal: 9,
          paddingVertical: 4,
        }}
      >
        <View
          style={{
            aspectRatio: 1,
            backgroundColor: color,
            borderRadius: 999,
            height: 7,
          }}
        />
        <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      </View>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
        {detail}
      </Text>
    </View>
  );
}

function GpuCard({
  gpu,
  theme,
  compact,
}: {
  gpu: Gpu;
  theme: PluginAgentPanelProps["theme"];
  compact: boolean;
}) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: compact ? "100%" : 360,
        maxWidth: compact ? undefined : 450,
        gap: 18,
        padding: compact ? 16 : 20,
        borderColor: theme.colors.border,
        borderRadius: 12,
        borderWidth: 1,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text
          style={{
            color: theme.colors.foreground,
            fontSize: 15,
            fontWeight: "600",
          }}
        >
          GPU {gpu.id}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: theme.colors.foregroundMuted,
            flexShrink: 1,
            fontSize: 13,
            textAlign: "right",
          }}
        >
          {formatModel(gpu.model)}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 16 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: compact ? 30 : 36,
              fontWeight: "600",
              fontVariant: ["tabular-nums"],
            }}
          >
            {Math.round(gpu.utilizationPercent)}%
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            Utilization
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2, alignItems: "flex-end" }}>
          <Text
            style={{
              color: temperatureColor(gpu.temperatureCelsius, theme.colors),
              fontSize: compact ? 30 : 36,
              fontWeight: "600",
              fontVariant: ["tabular-nums"],
            }}
          >
            {gpu.temperatureCelsius === null
              ? "—"
              : `${Math.round(gpu.temperatureCelsius)}°C`}
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            Temperature
          </Text>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            VRAM
          </Text>
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 13,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatMemory(gpu.memoryUsedMiB, gpu.memoryTotalMiB)}
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            Power
          </Text>
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 13,
              fontVariant: ["tabular-nums"],
            }}
          >
            {gpu.powerWatts === null
              ? "Unavailable"
              : `${Math.round(gpu.powerWatts)} W`}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function GpuStatusPill({ theme, host }: PluginComposerPillProps) {
  const query = useGpuStatus(host.id);
  const { kind, maxTemperature, utilization } = displayState(
    query.data,
    query.isError,
  );
  const color = pillColor(kind, theme.colors);

  const hostLabel = query.data?.hostLabel ?? "GPU host";
  const prefix =
    query.data?.showHostLabelInPill === false ? "" : `${hostLabel} · `;
  let label: string;
  switch (kind) {
    case "connecting": {
      label = `${prefix}Connecting…`;
      break;
    }
    case "offline": {
      label = `${prefix}Offline`;
      break;
    }
    case "stale": {
      label = `${prefix}Stale`;
      break;
    }
    default: {
      const temperature =
        maxTemperature === null ? "—" : `${Math.round(maxTemperature)}°C`;
      label = `${prefix}GPU ${Math.round(utilization ?? 0)}% · ${temperature}`;
    }
  }

  return (
    <>
      <Icon name="Gauge" size={14} color={color} />
      <Text
        numberOfLines={1}
        style={{
          color,
          flexShrink: 1,
          fontSize: 12,
          fontWeight: "600",
          fontVariant: ["tabular-nums"],
        }}
      >
        {label}
      </Text>
    </>
  );
}

export function GpuStatusPanel({ theme, layout, host }: PluginAgentPanelProps) {
  const query = useGpuStatus(host.id);
  const config = useGpuConfig(host.id);
  const status = query.data;
  const state = displayState(status, query.isError);
  const presentation = statusPresentation(state.kind, theme);
  const requiresConfig =
    config.data !== undefined &&
    (!config.data.fileValid || config.data.prometheusUrl.trim() === "");
  const canShowStatus = !requiresConfig;
  const hasGpus = (status?.gpus.length ?? 0) > 0;
  const statusMessage = requiresConfig
    ? null
    : (status?.message ??
      (query.error instanceof Error ? query.error.message : null));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{ padding: layout.compact ? 16 : 24 }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 948,
          alignSelf: "center",
          gap: layout.compact ? 16 : 20,
        }}
      >
        <View
          style={{
            flexDirection: layout.compact ? "column" : "row",
            alignItems: layout.compact ? "flex-start" : "center",
            justifyContent: "space-between",
            gap: layout.compact ? 10 : 16,
          }}
        >
          <View style={{ gap: 3 }}>
            <Text
              style={{
                color: theme.colors.foreground,
                fontSize: layout.compact ? 20 : 24,
                fontWeight: "600",
              }}
            >
              {status?.hostLabel ?? config.data?.hostLabel ?? "GPU host"}
            </Text>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
              GPU status · {host.label}
            </Text>
          </View>
          <StatusChip
            label={presentation.label}
            color={presentation.color}
            detail={formatAge(state.age)}
            theme={theme}
          />
        </View>

        {requiresConfig ? (
          <View
            style={{
              padding: 16,
              borderColor: theme.colors.border,
              borderRadius: 12,
              borderWidth: 1,
              backgroundColor: theme.colors.surface1,
              gap: 6,
            }}
          >
            <Text
              style={{
                color: theme.colors.foreground,
                fontSize: 14,
                fontWeight: "600",
              }}
            >
              Configuration required
            </Text>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
              Open Settings → Plugins → GPU status to configure Prometheus.
            </Text>
            {config.data?.fileValid === false ? (
              <Text style={{ color: theme.colors.statusWarning, fontSize: 12 }}>
                The current config file is invalid. Saving from plugin settings
                will replace it.
              </Text>
            ) : null}
          </View>
        ) : null}

        {statusMessage ? (
          <Text
            style={{
              color:
                status?.status === "ok"
                  ? theme.colors.statusWarning
                  : theme.colors.statusDanger,
              fontSize: 13,
            }}
          >
            {statusMessage}
          </Text>
        ) : null}

        {canShowStatus && hasGpus && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 12,
            }}
          >
            {status?.gpus.map((gpu) => (
              <GpuCard
                key={gpu.key}
                gpu={gpu}
                theme={theme}
                compact={layout.compact}
              />
            ))}
          </View>
        )}

        {canShowStatus && !hasGpus && (
          <View
            style={{
              padding: 20,
              borderColor: theme.colors.border,
              borderRadius: 12,
              borderWidth: 1,
              backgroundColor: theme.colors.surface1,
            }}
          >
            <Text style={{ color: theme.colors.foregroundMuted }}>
              {state.kind === "connecting"
                ? "Connecting to Prometheus…"
                : "No GPU metrics available"}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
