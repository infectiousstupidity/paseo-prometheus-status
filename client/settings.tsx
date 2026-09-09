import { type PluginSurfaceProps, useRpc } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  gpuStatusConfigGet,
  gpuStatusConfigSave,
  type GpuStatusConfig,
} from "../shared/status";

const REFRESH_INTERVAL_MS = 10_000;

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

function configQueryKey(hostId: string) {
  return ["paseo-prometheus-status", "config", hostId] as const;
}

function statusQueryKey(hostId: string) {
  return ["paseo-prometheus-status", "status", hostId] as const;
}

function valuesFromConfig(config: GpuStatusConfig): ConfigValues {
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
  } = config;
  return {
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
  };
}

function GpuStatusSettingsForm({
  hostId,
  config,
}: {
  hostId: string;
  config: GpuStatusConfig;
}) {
  const queryClient = useQueryClient();
  const saveConfig = useRpc(gpuStatusConfigSave);
  const [values, setValues] = useState<ConfigValues>(() =>
    valuesFromConfig(config),
  );
  const [note, setNote] = useState<{
    text: string;
    tone: "success" | "danger";
  } | null>(null);

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
      queryClient.setQueryData(configQueryKey(hostId), result);
      void queryClient.invalidateQueries({ queryKey: statusQueryKey(hostId) });
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

  return (
    <>
      <SettingsSection
        title="Prometheus"
        info="Connection and labels used by this Paseo daemon."
      >
        <SettingsCard>
          <SettingsInput
            label="Prometheus URL"
            initialValue={values.prometheusUrl}
            placeholder="https://prometheus.example:9090"
            onChangeText={(value) => setField("prometheusUrl", value)}
          />
          <SettingsInput
            label="Metric selector"
            hint="Inserted inside the label braces of the built-in queries."
            initialValue={values.selector}
            placeholder={'job="dcgm-exporter",instance="gpu-host:9400"'}
            onChangeText={(value) => setField("selector", value)}
          />
          <SettingsInput
            label="Host label"
            initialValue={values.hostLabel}
            placeholder="GPU host"
            onChangeText={(value) => setField("hostLabel", value)}
          />
          <SettingsSwitch
            label="Show host label in composer"
            hint="Keep this off for the shortest GPU alert pill."
            value={values.showHostLabelInPill}
            onValueChange={(value) => setField("showHostLabelInPill", value)}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        title="Advanced queries"
        info="Leave a field blank to use the built-in NVIDIA DCGM query."
      >
        <SettingsCard>
          <SettingsInput
            label="GPU utilization query"
            initialValue={values.gpuQuery}
            placeholder="Use built-in query"
            onChangeText={(value) => setField("gpuQuery", value)}
          />
          <SettingsInput
            label="Sample timestamp query"
            initialValue={values.gpuTimestampQuery}
            placeholder="Use timestamp of utilization query"
            onChangeText={(value) => setField("gpuTimestampQuery", value)}
          />
          <SettingsInput
            label="Temperature query"
            initialValue={values.temperatureQuery}
            placeholder="Use built-in query"
            onChangeText={(value) => setField("temperatureQuery", value)}
          />
          <SettingsInput
            label="VRAM used query"
            initialValue={values.memoryUsedQuery}
            placeholder="Use built-in query"
            onChangeText={(value) => setField("memoryUsedQuery", value)}
          />
          <SettingsInput
            label="VRAM total query"
            initialValue={values.memoryTotalQuery}
            placeholder="Use built-in query"
            onChangeText={(value) => setField("memoryTotalQuery", value)}
          />
          <SettingsInput
            label="Power query"
            initialValue={values.powerQuery}
            placeholder="Use built-in query"
            onChangeText={(value) => setField("powerQuery", value)}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Configuration">
        <SettingsCard>
          <SettingsRow
            label="Config file"
            hint={config.configPath}
            error={
              config.fileValid
                ? undefined
                : "The current config file is invalid. Saving here will replace it."
            }
          />
          {config.envOverrides.length > 0 ? (
            <SettingsRow
              label="Environment overrides"
              hint={config.envOverrides.join(", ")}
            />
          ) : null}
          <SettingsAction
            label="Save settings"
            hint="Saved values take effect immediately."
            actionLabel={save.isPending ? "Saving…" : "Save"}
            disabled={save.isPending}
            onPress={() => save.mutate()}
          />
          {note ? (
            <SettingsRow
              label="Status"
              hint={note.tone === "success" ? note.text : undefined}
              error={note.tone === "danger" ? note.text : undefined}
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>
    </>
  );
}

export function GpuStatusSettings({ host }: PluginSurfaceProps) {
  const getConfig = useRpc(gpuStatusConfigGet);
  const config = useQuery({
    queryKey: configQueryKey(host.id),
    queryFn: () => getConfig({}),
    staleTime: REFRESH_INTERVAL_MS,
  });

  if (config.isPending) {
    return (
      <SettingsSection title="GPU status">
        <SettingsCard>
          <SettingsRow label="Loading settings…" />
        </SettingsCard>
      </SettingsSection>
    );
  }

  if (config.isError || config.data === undefined) {
    return (
      <SettingsSection title="GPU status">
        <SettingsCard>
          <SettingsRow
            label="Plugin settings"
            error="Could not read the plugin settings."
          />
        </SettingsCard>
      </SettingsSection>
    );
  }

  return (
    <GpuStatusSettingsForm
      key={`${host.id}:${config.data.configPath}:${config.data.fileValid}`}
      hostId={host.id}
      config={config.data}
    />
  );
}
