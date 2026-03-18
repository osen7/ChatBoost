import { bootstrap, shutdown, syncEnabledState } from "./bootstrap";

chrome.storage.sync.get(["enabled"], (result) => {
  const enabled = result.enabled !== false;
  syncEnabledState(enabled);
  bootstrap();
  if (!enabled) {
    shutdown();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.enabled) {
    return;
  }

  const enabled = changes.enabled.newValue !== false;
  syncEnabledState(enabled);

  if (!enabled) {
    shutdown();
    return;
  }
  bootstrap();
});
