import type { PluginClientContext } from "@getpaseo/plugin";
import { GpuStatusPill } from "./status.client";
import { gpuStatusGet, type GpuStatus } from "./status.shared";

const REFRESH_INTERVAL_MS = 10_000;
const WARM_TEMPERATURE_CELSIUS = 75;
const HOT_TEMPERATURE_CELSIUS = 85;

type GpuAlertLevel = "warning" | "critical";

type ActiveAgent = {
  id: string;
  workspaceId: string;
};

export function gpuAlertLevel(status: GpuStatus): GpuAlertLevel | null {
  if (status.status !== "ok") return null;

  const temperatures = status.gpus
    .map((gpu) => gpu.temperatureCelsius)
    .filter((temperature): temperature is number => temperature !== null);
  if (temperatures.length === 0) return null;

  const maxTemperature = Math.max(...temperatures);
  if (maxTemperature >= HOT_TEMPERATURE_CELSIUS) return "critical";

  const utilization = status.maxUtilizationPercent ?? 0;
  if (
    utilization > 0 &&
    maxTemperature >= WARM_TEMPERATURE_CELSIUS
  ) {
    return "warning";
  }

  return null;
}

export function contributeGpuAlertPills(client: PluginClientContext) {
  const agents = new Map<string, ActiveAgent>();
  const pills = new Map<string, () => void>();
  let alertLevel: GpuAlertLevel | null = null;
  let stopped = false;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;

  function removePill(agentId: string) {
    pills.get(agentId)?.();
    pills.delete(agentId);
  }

  function reconcileAgent(agent: ActiveAgent) {
    if (stopped || alertLevel === null) {
      removePill(agent.id);
      return;
    }
    if (pills.has(agent.id)) return;

    const { id: agentId, workspaceId } = agent;
    pills.set(
      agentId,
      client.addComposerPill({
        id: "gpu-status",
        title: "Open GPU temperature alert",
        workspaceId,
        agentId,
        Component: GpuStatusPill,
        onPress() {
          client.openPanel("gpu-status", { workspaceId, agentId });
        },
      }),
    );
  }

  function upsertAgent(agent: { id: string; workspaceId?: string }) {
    if (!agent.workspaceId || stopped) {
      agents.delete(agent.id);
      removePill(agent.id);
      return;
    }

    const activeAgent = { id: agent.id, workspaceId: agent.workspaceId };
    agents.set(agent.id, activeAgent);
    reconcileAgent(activeAgent);
  }

  function reconcileAll() {
    for (const agent of agents.values()) reconcileAgent(agent);
  }

  async function refreshAlertLevel() {
    try {
      const status = await client.rpc(gpuStatusGet, {});
      alertLevel = gpuAlertLevel(status);
      reconcileAll();
    } catch (error) {
      console.error("Could not refresh GPU alert pill state", error);
    } finally {
      if (!stopped) {
        refreshTimer = setTimeout(refreshAlertLevel, REFRESH_INTERVAL_MS);
      }
    }
  }

  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (update.kind === "remove") {
      agents.delete(update.agentId);
      removePill(update.agentId);
    } else {
      upsertAgent(update.agent);
    }
  });

  void (async () => {
    let cursor: string | undefined;
    do {
      const { entries, pageInfo } = await client.paseo.agents.list({
        scope: "active",
        page: { limit: 200, cursor },
      });
      if (stopped) return;
      for (const { agent } of entries) upsertAgent(agent);

      if (!pageInfo.hasMore) return;
      if (!pageInfo.nextCursor) {
        throw new Error("Agent list has more pages but no next cursor");
      }
      cursor = pageInfo.nextCursor;
    } while (!stopped);
  })().catch((error: unknown) => {
    console.error("Could not initialize GPU alert pills", error);
  });

  void refreshAlertLevel();

  return () => {
    stopped = true;
    unsubscribe();
    if (refreshTimer !== undefined) clearTimeout(refreshTimer);
    agents.clear();
    for (const removePill of pills.values()) removePill();
    pills.clear();
  };
}
