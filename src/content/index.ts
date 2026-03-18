import { bootstrap, shutdown, syncEnabledState, syncModeState } from "./bootstrap";
import { defaultMode } from "../shared/config";
import type { PerformanceMode } from "../shared/types";

chrome.storage.sync.get(["enabled", "mode"], (result) => {
  const enabled = result.enabled !== false;
  const mode = sanitizeMode(result.mode);
  syncEnabledState(enabled);
  syncModeState(mode);
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
