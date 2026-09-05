import {
  type PluginAgentPanelProps,
  type PluginClientContext,
  type PluginComposerPillProps,
  useRpc,
} from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/react-native";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, Text, View } from "react-native";
import { gpuStatusGet, type GpuStatus } from "./status.shared";

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

function ageInSeconds(sampledAt: string | null): number | null {
  if (!sampledAt) return null;
  return Math.max(0, Math.round((Date.now() - Date.parse(sampledAt)) / 1000));
}

function useGpuStatus(hostId: string) {
  const getStatus = useRpc(gpuStatusGet);
  return useQuery({
    queryKey: ["paseo-prometheus-status", hostId],
    queryFn: () => getStatus({}),
    refetchInterval: REFRESH_INTERVAL_MS,
    staleTime: REFRESH_INTERVAL_MS - 1,
    retry: 1,
  });
}

function displayState(status: GpuStatus | undefined, queryFailed = false) {
  const age = ageInSeconds(status?.sampledAt ?? null);
  const utilization = status?.maxUtilizationPercent ?? null;
  const temperatures = (status?.gpus ?? [])
    .map((gpu) => gpu.temperatureCelsius)
    .filter((temperature): temperature is number => temperature !== null);
  const maxTemperature =
    temperatures.length > 0 ? Math.max(...temperatures) : null;

  let kind: DisplayKind;
  if (queryFailed || status?.status === "unavailable") kind = "offline";
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
  return { label: "Healthy", color: theme.colors.foregroundMuted };
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
  const temperatureAbnormal =
    gpu.temperatureCelsius !== null &&
    gpu.temperatureCelsius >= WARM_TEMPERATURE_CELSIUS;
  const temperatureColor =
    gpu.temperatureCelsius !== null &&
    gpu.temperatureCelsius >= HOT_TEMPERATURE_CELSIUS
      ? theme.colors.statusDanger
      : temperatureAbnormal
        ? theme.colors.statusWarning
        : theme.colors.foreground;

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
              color: temperatureColor,
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
  const abnormal = kind === "offline" || kind === "hot";
  const warning = kind === "stale" || kind === "warm";
  const color = abnormal
    ? theme.colors.statusDanger
    : warning
      ? theme.colors.statusWarning
      : theme.colors.foregroundMuted;

  const hostLabel = query.data?.hostLabel ?? "GPU host";
  const prefix =
    query.data?.showHostLabelInPill === false ? "" : `${hostLabel} · `;
  let label: string;
  if (kind === "connecting") label = `${prefix}Connecting…`;
  else if (kind === "offline") label = `${prefix}Offline`;
  else if (kind === "stale") label = `${prefix}Stale`;
  else {
    const temperature =
      maxTemperature === null ? "—" : `${Math.round(maxTemperature)}°C`;
    label = `${prefix}GPU ${Math.round(utilization ?? 0)}% · ${temperature}`;
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
  const status = query.data;
  const state = displayState(status, query.isError);
  const presentation = statusPresentation(state.kind, theme);
  const errorMessage =
    status?.status === "unavailable"
      ? status.message
      : query.error instanceof Error
        ? query.error.message
        : null;

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
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 20,
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
              {status?.hostLabel ?? "GPU host"}
            </Text>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
              GPU status
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text style={{ color: presentation.color, fontSize: 11 }}>●</Text>
              <Text
                style={{
                  color: presentation.color,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {presentation.label}
              </Text>
            </View>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
              {formatAge(state.age)}
            </Text>
          </View>
        </View>

        {errorMessage ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>
            {errorMessage}
          </Text>
        ) : null}

        {(status?.gpus.length ?? 0) > 0 ? (
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
        ) : (
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

export function contributeGpuStatusPills(client: PluginClientContext) {
  const pills = new Map<string, () => void>();
  let stopped = false;

  function remove(agentId: string) {
    pills.get(agentId)?.();
    pills.delete(agentId);
  }

  function upsert(agent: { id: string; workspaceId?: string }) {
    if (!agent.workspaceId || stopped) {
      remove(agent.id);
      return;
    }
    if (pills.has(agent.id)) return;

    const { id: agentId, workspaceId } = agent;
    pills.set(
      agentId,
      client.addComposerPill({
        id: "gpu-status",
        title:
          "Open GPU status; summary shows maximum utilization and temperature",
        workspaceId,
        agentId,
        Component: GpuStatusPill,
        onPress() {
          client.openPanel("gpu-status", { workspaceId, agentId });
        },
      }),
    );
  }

  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (update.kind === "remove") remove(update.agentId);
    else upsert(update.agent);
  });

  void client.paseo.agents
    .list({ scope: "active", page: { limit: 500 }, subscribe: {} })
    .then(({ entries }) => {
      if (stopped) return;
      for (const { agent } of entries) upsert(agent);
    })
    .catch((error: unknown) => {
      console.error("Could not initialize Prometheus status pills", error);
    });

  return () => {
    stopped = true;
    unsubscribe();
    for (const removePill of pills.values()) removePill();
    pills.clear();
  };
}
