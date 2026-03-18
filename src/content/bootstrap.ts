import { resolveAdapter } from "../adapters";
import type { ChatSiteAdapter } from "../adapters/base";
import { OptimizationEngine } from "../core/engine";
import { defaultMode, getConfigForMode } from "../shared/config";
import { EXT_ROOT_ATTR } from "../shared/constants";
import type { PanelPlacement, PerformanceMode } from "../shared/types";
import { mountPanel, unmountPanel, updatePanelState } from "../ui/panel";
import "../ui/styles.css";

let engine: OptimizationEngine | null = null;
let enabledState = true;
let pausedState = false;
let modeState: PerformanceMode = defaultMode;
let placementState: PanelPlacement = "auto";
let statsTimer: number | null = null;
let urlWatchTimer: number | null = null;
let stopRouteHooks: (() => void) | null = null;
let lastUrl = "";
let lastThreadId = "";
let activeAdapter: ChatSiteAdapter | null = null;

export function bootstrap(): void {
  mountPanel(buildPanelState(), {
    onToggleEnabled(nextEnabled) {
      setEnabled(nextEnabled);
    },
    onTogglePause(nextPaused) {
      setPaused(nextPaused);
    },
    onCycleMode() {
      setMode(nextMode(modeState));
    },
    onCyclePlacement() {
      setPlacement(nextPlacement(placementState));
    },
    onRestoreAll() {
      engine?.restoreAll();
      refreshPanel();
    }
  });

  if (!enabledState || pausedState) {
    refreshPanel();
    return;
  }

  if (document.documentElement.hasAttribute(EXT_ROOT_ATTR)) {
    refreshPanel();
    return;
  }

  const adapter = resolveAdapter();
  if (!adapter) {
    return;
  }

  activeAdapter = adapter;
  lastUrl = window.location.href;
  lastThreadId = adapter.getThreadId();
  document.documentElement.setAttribute(EXT_ROOT_ATTR, "1");
  engine = new OptimizationEngine(adapter, getConfigForMode(modeState));
  engine.start();
  startStatsPolling();
  startUrlWatch();
  startRouteHooks();
  refreshPanel();
}

export function shutdown(): void {
  enabledState = false;
  pausedState = false;
  stopEngineAndRestore();
  stopStatsPolling();
  stopUrlWatch();
  stopRouteWatchHooks();
  document.documentElement.removeAttribute(EXT_ROOT_ATTR);
  refreshPanel();
}

export function setEnabled(enabled: boolean): void {
  enabledState = enabled;

  if (enabled) {
    bootstrap();
    refreshPanel();
    return;
  }
  shutdown();
}

export function syncEnabledState(enabled: boolean): void {
  enabledState = enabled;
  refreshPanel();
}

export function syncModeState(mode: PerformanceMode): void {
  modeState = mode;
  engine?.updateConfig(getConfigForMode(modeState));
  refreshPanel();
}

export function syncPlacementState(placement: PanelPlacement): void {
  placementState = placement;
  refreshPanel();
}

export function setPaused(paused: boolean): void {
  pausedState = paused;
  if (paused) {
    stopEngineAndRestore();
    stopStatsPolling();
    stopUrlWatch();
    stopRouteWatchHooks();
    refreshPanel();
    return;
  }
  bootstrap();
  refreshPanel();
}

export function setMode(mode: PerformanceMode): void {
  modeState = mode;
  engine?.updateConfig(getConfigForMode(modeState));
  refreshPanel();
}

export function setPlacement(placement: PanelPlacement): void {
  placementState = placement;
  refreshPanel();
}

export function teardown(): void {
  shutdown();
  unmountPanel();
}

function stopEngineAndRestore(): void {
  engine?.stop();
  engine?.restoreAll();
  engine = null;
  activeAdapter = null;
  document.documentElement.removeAttribute(EXT_ROOT_ATTR);
}

function buildPanelState() {
  const stats = engine?.getStats() ?? {
    total: 0,
    full: 0,
    collapsed: 0,
    placeholder: 0,
    heavy: 0,
    streaming: 0
  };
  return {
    enabled: enabledState,
    paused: pausedState,
    modeLabel: modeToLabel(modeState),
    modeHint: modeToHint(modeState),
    placementLabel: placementToLabel(placementState),
    placement: placementState,
    collapsedCount: stats.collapsed,
    placeholderCount: stats.placeholder,
    totalCount: stats.total
  };
}

function refreshPanel(): void {
  updatePanelState(buildPanelState());
}

function startStatsPolling(): void {
  if (statsTimer !== null) {
    return;
  }
  statsTimer = window.setInterval(() => {
    refreshPanel();
  }, 1000);
}

function stopStatsPolling(): void {
  if (statsTimer === null) {
    return;
  }
  window.clearInterval(statsTimer);
  statsTimer = null;
}

function startUrlWatch(): void {
  if (urlWatchTimer !== null) {
    return;
  }
  urlWatchTimer = window.setInterval(() => {
    detectConversationChange();
  }, 1500);
}

function stopUrlWatch(): void {
  if (urlWatchTimer === null) {
    return;
  }
  window.clearInterval(urlWatchTimer);
  urlWatchTimer = null;
}

function startRouteHooks(): void {
  if (stopRouteHooks) {
    return;
  }

  const notify = () => detectConversationChange();
  const onPopstate = () => notify();
  const onHash = () => notify();
  const onCustom = () => notify();

  window.addEventListener("popstate", onPopstate, true);
  window.addEventListener("hashchange", onHash, true);
  window.addEventListener("chatboost:urlchange", onCustom, true);

  const rawPush = history.pushState.bind(history);
  const rawReplace = history.replaceState.bind(history);

  history.pushState = function patchedPushState(...args) {
    const result = rawPush(...args);
    window.dispatchEvent(new Event("chatboost:urlchange"));
    return result;
  };

  history.replaceState = function patchedReplaceState(...args) {
    const result = rawReplace(...args);
    window.dispatchEvent(new Event("chatboost:urlchange"));
    return result;
  };

  stopRouteHooks = () => {
    history.pushState = rawPush;
    history.replaceState = rawReplace;
    window.removeEventListener("popstate", onPopstate, true);
    window.removeEventListener("hashchange", onHash, true);
    window.removeEventListener("chatboost:urlchange", onCustom, true);
    stopRouteHooks = null;
  };
}

function stopRouteWatchHooks(): void {
  stopRouteHooks?.();
}

function detectConversationChange(): void {
  if (!engine || !activeAdapter || !enabledState || pausedState) {
    return;
  }
  const nextUrl = window.location.href;
  const nextThreadId = activeAdapter.getThreadId();
  if (nextUrl === lastUrl && nextThreadId === lastThreadId) {
    return;
  }
  lastUrl = nextUrl;
  lastThreadId = nextThreadId;
  engine.reset();
  refreshPanel();
}

function modeToLabel(mode: PerformanceMode): string {
  if (mode === "lite") return "Lite";
  if (mode === "aggressive") return "Aggressive";
  return "Balanced";
}

function nextMode(mode: PerformanceMode): PerformanceMode {
  if (mode === "lite") return "balanced";
  if (mode === "balanced") return "aggressive";
  return "lite";
}

function modeToHint(mode: PerformanceMode): string {
  if (mode === "lite") return "保留更多完整消息，干扰最小";
  if (mode === "aggressive") return "更激进折叠和占位，优先性能";
  return "性能与阅读体验平衡";
}

function placementToLabel(placement: PanelPlacement): string {
  if (placement === "left") return "Left";
  if (placement === "right") return "Right";
  return "Auto";
}

function nextPlacement(placement: PanelPlacement): PanelPlacement {
  if (placement === "auto") return "right";
  if (placement === "right") return "left";
  return "auto";
}
