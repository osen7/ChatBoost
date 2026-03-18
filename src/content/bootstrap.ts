import { resolveAdapter } from "../adapters";
import { OptimizationEngine } from "../core/engine";
import { defaultConfig } from "../shared/config";
import { EXT_ROOT_ATTR } from "../shared/constants";
import { mountPanel, unmountPanel, updatePanelState } from "../ui/panel";
import "../ui/styles.css";

let engine: OptimizationEngine | null = null;
let enabledState = true;
let pausedState = false;
let statsTimer: number | null = null;

export function bootstrap(): void {
  mountPanel(buildPanelState(), {
    onToggleEnabled(nextEnabled) {
      setEnabled(nextEnabled);
    },
    onTogglePause(nextPaused) {
      setPaused(nextPaused);
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

  document.documentElement.setAttribute(EXT_ROOT_ATTR, "1");
  engine = new OptimizationEngine(adapter, defaultConfig);
  engine.start();
  startStatsPolling();
  refreshPanel();
}

export function shutdown(): void {
  enabledState = false;
  pausedState = false;
  stopEngineAndRestore();
  stopStatsPolling();
  document.documentElement.removeAttribute(EXT_ROOT_ATTR);
  refreshPanel();
}

export function setEnabled(enabled: boolean): void {
  enabledState = enabled;
  chrome.storage.sync.set({ enabled });

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

export function setPaused(paused: boolean): void {
  pausedState = paused;
  if (paused) {
    stopEngineAndRestore();
    stopStatsPolling();
    refreshPanel();
    return;
  }
  bootstrap();
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
    modeLabel: pausedState ? "Paused" : enabledState ? "Auto" : "Disabled",
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
