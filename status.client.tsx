import {
  type PluginAgentPanelProps,
  type PluginClientContext,
  type PluginComposerPillProps,
  type PluginTheme,
  useRpc,
} from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  gpuStatusConfigGet,
  gpuStatusConfigSave,
  gpuStatusGet,
  type GpuStatus,
  type GpuStatusConfig,
} from "./status.shared";

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

type ConfigValues = Pick<
  GpuStatusConfig,
  | "prometheusUrl"
  | "selector"
  | "hostLabel"
  | "showHostLabelInPill"
  | "gpuQuery"
  | "gpuTimestampQuery"
  | "temperatureQuery"
  | "memoryUsedQuery"
  | "memoryTotalQuery"
  | "powerQuery"
>;

const EMPTY_CONFIG: ConfigValues = {
  prometheusUrl: "",
  selector: "",
  hostLabel: "GPU host",
  showHostLabelInPill: false,
  gpuQuery: "",
  gpuTimestampQuery: "",
  temperatureQuery: "",
  memoryUsedQuery: "",
  memoryTotalQuery: "",
  powerQuery: "",
};

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

function pillColor(kind: DisplayKind, colors: PluginTheme["colors"]): string {
  if (kind === "hot" || kind === "offline") return colors.statusDanger;
  if (kind === "warm" || kind === "stale") return colors.statusWarning;
  return colors.foregroundMuted;
}

function temperatureColor(
  temperatureCelsius: number | null,
  colors: PluginTheme["colors"],
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
  tooltipText,
  theme,
}: {
  label: string;
  color: string;
  tooltipText: string | null;
  theme: PluginAgentPanelProps["theme"];
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <View
      accessible
      accessibilityLabel={
        tooltipText === null ? label : `${label} — ${tooltipText}`
      }
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{ position: "relative" }}
    >
      <View
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
      {hovered && tooltipText !== null ? (
        <View
          pointerEvents="none"
          style={{
            // Below the chip: the chip sits in the panel's first row, so an
            // upward tooltip would be clipped by the panel's scroll bounds.
            backgroundColor: theme.colors.surface2,
            borderColor: theme.colors.border,
            borderRadius: 8,
            borderWidth: 1,
            marginTop: 6,
            paddingHorizontal: 10,
            paddingVertical: 6,
            position: "absolute",
            right: 0,
            top: "100%",
            boxShadow: "0 6px 18px rgba(0, 0, 0, 0.28)",
            zIndex: 100,
          }}
        >
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            {tooltipText}
          </Text>
        </View>
      ) : null}
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

function ConfigField({
  label,
  value,
  onChangeText,
  placeholder,
  theme,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  theme: PluginAgentPanelProps["theme"];
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.foregroundMuted}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        multiline={multiline}
        style={{
          color: theme.colors.foreground,
          minHeight: multiline ? 72 : 40,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 8,
          borderColor: theme.colors.border,
          borderRadius: 8,
          borderWidth: 1,
          backgroundColor: theme.colors.surface0,
          fontSize: 13,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
    </View>
  );
}

function ConfigForm({
  hostId,
  theme,
}: {
  hostId: string;
  theme: PluginAgentPanelProps["theme"];
}) {
  const queryClient = useQueryClient();
  const getConfig = useRpc(gpuStatusConfigGet);
  const saveConfig = useRpc(gpuStatusConfigSave);
  const config = useQuery({
    queryKey: ["paseo-prometheus-status", "config", hostId],
    queryFn: () => getConfig({}),
    staleTime: REFRESH_INTERVAL_MS,
  });
  const [values, setValues] = useState<ConfigValues>(EMPTY_CONFIG);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [note, setNote] = useState<{
    text: string;
    tone: "success" | "danger";
  } | null>(null);
  const prefilled = useRef(false);

  useEffect(() => {
    if (config.data === undefined || prefilled.current) return;
    prefilled.current = true;
    const {
      prometheusUrl,
      selector,
      hostLabel,
      showHostLabelInPill,
      gpuQuery,
      gpuTimestampQuery,
      temperatureQuery,
      memoryUsedQuery,
      memoryTotalQuery,
      powerQuery,
    } = config.data;
    setValues({
      prometheusUrl,
      selector,
      hostLabel,
      showHostLabelInPill,
      gpuQuery,
      gpuTimestampQuery,
      temperatureQuery,
      memoryUsedQuery,
      memoryTotalQuery,
      powerQuery,
    });
    setAdvancedOpen(
      [
        gpuQuery,
        gpuTimestampQuery,
        temperatureQuery,
        memoryUsedQuery,
        memoryTotalQuery,
        powerQuery,
      ].some((value) => value !== ""),
    );
  }, [config.data]);

  function setField<Key extends keyof ConfigValues>(
    key: Key,
    value: ConfigValues[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setNote(null);
  }

  const save = useMutation({
    mutationFn: () => saveConfig(values),
    onSuccess: (result) => {
      queryClient.setQueryData(
        ["paseo-prometheus-status", "config", hostId],
        result,
      );
      void queryClient.invalidateQueries({
        queryKey: ["paseo-prometheus-status", "status", hostId],
      });
      setNote({
        text: result.replacedInvalidFile
          ? "Saved. The invalid config file was replaced."
          : "Saved.",
        tone: "success",
      });
    },
    onError: (error) => {
      setNote({
        text:
          error instanceof Error
            ? error.message
            : "Could not save Prometheus settings.",
        tone: "danger",
      });
    },
  });

  const environmentOverrides = config.data?.envOverrides ?? [];

  return (
    <View
      style={{
        gap: 16,
        padding: 16,
        borderColor: theme.colors.border,
        borderRadius: 12,
        borderWidth: 1,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text
          style={{
            color: theme.colors.foreground,
            fontSize: 15,
            fontWeight: "600",
          }}
        >
          Settings
        </Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          Configure the Prometheus connection used by this Paseo daemon.
        </Text>
      </View>

      {config.isError ? (
        <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
          Could not read the plugin settings.
        </Text>
      ) : null}

      {config.data?.fileValid === false ? (
        <Text style={{ color: theme.colors.statusWarning, fontSize: 12 }}>
          The current config file is invalid. Saving here will replace it.
        </Text>
      ) : null}

      <ConfigField
        label="Prometheus URL"
        value={values.prometheusUrl}
        onChangeText={(value) => setField("prometheusUrl", value)}
        placeholder="https://prometheus.example:9090"
        theme={theme}
      />
      <ConfigField
        label="Metric selector"
        value={values.selector}
        onChangeText={(value) => setField("selector", value)}
        placeholder={'job="dcgm-exporter",instance="gpu-host:9400"'}
        theme={theme}
      />
      <ConfigField
        label="Host label"
        value={values.hostLabel}
        onChangeText={(value) => setField("hostLabel", value)}
        placeholder="GPU host"
        theme={theme}
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            Show host label in composer
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            Keep it off for the shortest GPU status pill.
          </Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: values.showHostLabelInPill }}
          onPress={() =>
            setField("showHostLabelInPill", !values.showHostLabelInPill)
          }
          style={({ pressed }) => ({
            minWidth: 64,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderColor: theme.colors.border,
            borderRadius: 8,
            borderWidth: 1,
            backgroundColor: theme.colors.surface0,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 12,
              fontWeight: "600",
              textAlign: "center",
            }}
          >
            {values.showHostLabelInPill ? "On" : "Off"}
          </Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setAdvancedOpen((open) => !open)}
        style={({ pressed }) => ({
          alignSelf: "flex-start",
          paddingVertical: 4,
          opacity: pressed ? 0.65 : 1,
        })}
      >
        <Text
          style={{
            color: theme.colors.foregroundMuted,
            fontSize: 12,
            fontWeight: "600",
          }}
        >
          {advancedOpen ? "Hide advanced queries" : "Advanced queries"}
        </Text>
      </Pressable>

      {advancedOpen ? (
        <View style={{ gap: 12 }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            Leave a query blank to use the built-in DCGM query.
          </Text>
          <ConfigField
            label="GPU utilization query"
            value={values.gpuQuery}
            onChangeText={(value) => setField("gpuQuery", value)}
            placeholder="Use built-in query"
            theme={theme}
            multiline
          />
          <ConfigField
            label="Sample timestamp query"
            value={values.gpuTimestampQuery}
            onChangeText={(value) => setField("gpuTimestampQuery", value)}
            placeholder="Use timestamp of utilization query"
            theme={theme}
            multiline
          />
          <ConfigField
            label="Temperature query"
            value={values.temperatureQuery}
            onChangeText={(value) => setField("temperatureQuery", value)}
            placeholder="Use built-in query"
            theme={theme}
            multiline
          />
          <ConfigField
            label="VRAM used query"
            value={values.memoryUsedQuery}
            onChangeText={(value) => setField("memoryUsedQuery", value)}
            placeholder="Use built-in query"
            theme={theme}
            multiline
          />
          <ConfigField
            label="VRAM total query"
            value={values.memoryTotalQuery}
            onChangeText={(value) => setField("memoryTotalQuery", value)}
            placeholder="Use built-in query"
            theme={theme}
            multiline
          />
          <ConfigField
            label="Power query"
            value={values.powerQuery}
            onChangeText={(value) => setField("powerQuery", value)}
            placeholder="Use built-in query"
            theme={theme}
            multiline
          />
        </View>
      ) : null}

      {environmentOverrides.length > 0 ? (
        <Text style={{ color: theme.colors.statusWarning, fontSize: 12 }}>
          Environment variables override saved settings:{" "}
          {environmentOverrides.join(", ")}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          disabled={save.isPending}
          onPress={() => save.mutate()}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderRadius: 8,
            backgroundColor: theme.colors.foreground,
            opacity: pressed || save.isPending ? 0.65 : 1,
          })}
        >
          <Text
            style={{
              color: theme.colors.surface0,
              fontSize: 12,
              fontWeight: "600",
            }}
          >
            {save.isPending ? "Saving…" : "Save settings"}
          </Text>
        </Pressable>
        {note ? (
          <Text
            style={{
              color:
                note.tone === "success"
                  ? theme.colors.foregroundMuted
                  : theme.colors.statusDanger,
              flexShrink: 1,
              fontSize: 12,
            }}
          >
            {note.text}
          </Text>
        ) : null}
      </View>

      {config.data?.configPath ? (
        <Text
          selectable
          style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}
        >
          {config.data.configPath}
        </Text>
      ) : null}
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const status = query.data;
  const state = displayState(status, query.isError);
  const presentation = statusPresentation(state.kind, theme);
  const statusMessage =
    status?.message ??
    (query.error instanceof Error ? query.error.message : null);
  const isForceSettings =
    config.data !== undefined &&
    (!config.data.fileValid || config.data.prometheusUrl.trim() === "");
  const showSettings = isForceSettings || settingsOpen;

  const tooltipText = state.age === null ? null : formatAge(state.age);

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
              {status?.hostLabel ?? "GPU host"}
            </Text>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
              GPU status · {host.label}
            </Text>
          </View>
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <StatusChip
              label={presentation.label}
              color={presentation.color}
              tooltipText={tooltipText}
              theme={theme}
            />
            {isForceSettings ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  settingsOpen ? "Close settings" : "Settings"
                }
                onPress={() => setSettingsOpen((open) => !open)}
                style={({ pressed }) => ({
                  backgroundColor: theme.colors.surface2,
                  borderColor: theme.colors.border,
                  borderRadius: 8,
                  borderWidth: 1,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    color: theme.colors.foreground,
                    fontSize: 13,
                    fontWeight: "600",
                  }}
                >
                  {settingsOpen ? "Close settings" : "Settings"}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

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

        {showSettings ? <ConfigForm hostId={host.id} theme={theme} /> : null}

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
  let isStopped = false;

  function remove(agentId: string) {
    pills.get(agentId)?.();
    pills.delete(agentId);
  }

  function upsert(agent: { id: string; workspaceId?: string }) {
    if (isStopped || !agent.workspaceId) {
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

  void (async () => {
    let cursor: string | undefined;
    do {
      const { entries, pageInfo } = await client.paseo.agents.list({
        scope: "active",
        page: { limit: 200, cursor },
      });
      if (isStopped) return;
      for (const { agent } of entries) upsert(agent);

      if (!pageInfo.hasMore) return;
      if (!pageInfo.nextCursor) {
        throw new Error("Agent list has more pages but no next cursor");
      }
      cursor = pageInfo.nextCursor;
    } while (!isStopped);
  })().catch((error: unknown) => {
    console.error("Could not initialize Prometheus status pills", error);
  });

  return () => {
    isStopped = true;
    unsubscribe();
    for (const removePill of pills.values()) removePill();
    pills.clear();
  };
}
