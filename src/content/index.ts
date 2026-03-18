import { bootstrap, shutdown } from "./bootstrap";

chrome.storage.sync.get(["enabled"], (result) => {
  const enabled = result.enabled !== false;
  if (enabled) {
    bootstrap();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.enabled) {
    return;
  }

  if (changes.enabled.newValue === false) {
    shutdown();
    return;
  }
  bootstrap();
});
