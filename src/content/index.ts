import { bootstrap, shutdown, syncEnabledState, syncModeState, syncPlacementState } from "./bootstrap";
import { defaultMode } from "../shared/config";
import type { PanelPlacement, PerformanceMode } from "../shared/types";

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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") {
    return;
  }

  if (changes.mode) {
    syncModeState(sanitizeMode(changes.mode.newValue));
  }
  if (changes.placement) {
    syncPlacementState(sanitizePlacement(changes.placement.newValue));
  }
  if (changes.enabled) {
    const enabled = changes.enabled.newValue !== false;
    syncEnabledState(enabled);
    if (!enabled) {
      shutdown();
      return;
    }
    bootstrap();
  }
});

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
