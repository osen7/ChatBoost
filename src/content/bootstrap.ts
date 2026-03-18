import { resolveAdapter } from "../adapters";
import { OptimizationEngine } from "../core/engine";
import { defaultConfig } from "../shared/config";
import { EXT_ROOT_ATTR } from "../shared/constants";
import { mountPanel, unmountPanel, updateEnabledLabel } from "../ui/panel";
import "../ui/styles.css";

let engine: OptimizationEngine | null = null;
let enabledState = true;

export function bootstrap(): void {
  mountPanel(enabledState, {
    onToggle(nextEnabled) {
      setEnabled(nextEnabled);
    },
    onRestoreAll() {
      engine?.restoreAll();
    }
  });

  if (!enabledState) {
    return;
  }

  if (document.documentElement.hasAttribute(EXT_ROOT_ATTR)) {
    return;
  }

  const adapter = resolveAdapter();
  if (!adapter) {
    return;
  }

  document.documentElement.setAttribute(EXT_ROOT_ATTR, "1");
  engine = new OptimizationEngine(adapter, defaultConfig);
  engine.start();
}

export function shutdown(): void {
  enabledState = false;
  updateEnabledLabel(false);
  engine?.stop();
  engine?.restoreAll();
  engine = null;
  document.documentElement.removeAttribute(EXT_ROOT_ATTR);
}

export function setEnabled(enabled: boolean): void {
  enabledState = enabled;
  updateEnabledLabel(enabled);
  chrome.storage.sync.set({ enabled });

  if (enabled) {
    bootstrap();
    return;
  }
  shutdown();
}

export function syncEnabledState(enabled: boolean): void {
  enabledState = enabled;
  updateEnabledLabel(enabled);
}

export function teardown(): void {
  shutdown();
  unmountPanel();
}
