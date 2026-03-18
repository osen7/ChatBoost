import { bootstrap, shutdown, syncEnabledState, syncModeState, syncPlacementState } from "./bootstrap";
import { defaultMode } from "../shared/config";
import type { PanelPlacement, PerformanceMode } from "../shared/types";

declare global {
  interface Window {
    __CHATBOOST_INIT__?: boolean;
  }
}

if (window.__CHATBOOST_INIT__) {
  // Avoid duplicate initialization in SPA/content reinjection edge cases.
  // noop
} else {
  window.__CHATBOOST_INIT__ = true;

  chrome.storage.sync.get(["enabled", "mode", "placement"], (result) => {
    const enabled = result.enabled !== false;
    const mode = sanitizeMode(result.mode);
    const placement = sanitizePlacement(result.placement);
    syncEnabledState(enabled);
    syncModeState(mode);
    syncPlacementState(placement);
    bootstrap();
    if (!enabled) {
      shutdown();
    }
  });
}

function sanitizeMode(value: unknown): PerformanceMode {
  if (value === "lite" || value === "balanced" || value === "aggressive") {
    return value;
  }
  return defaultMode;
}

function sanitizePlacement(value: unknown): PanelPlacement {
  if (value === "auto" || value === "left" || value === "right") {
    return value;
  }
  return "auto";
}
