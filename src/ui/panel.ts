import { PANEL_ATTR } from "../shared/constants";

interface PanelHandlers {
  onToggle(nextEnabled: boolean): void;
  onRestoreAll(): void;
}

let rootEl: HTMLElement | null = null;
let toggleBtn: HTMLButtonElement | null = null;

export function mountPanel(enabled: boolean, handlers: PanelHandlers): void {
  if (rootEl?.isConnected) {
    updateEnabledLabel(enabled);
    return;
  }

  rootEl = document.createElement("div");
  rootEl.setAttribute(PANEL_ATTR, "true");
  rootEl.className = "chatboost-panel";

  toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "chatboost-panel-btn";
  toggleBtn.addEventListener("click", () => {
    const next = !(toggleBtn?.dataset.enabled === "true");
    handlers.onToggle(next);
  });

  const restoreBtn = document.createElement("button");
  restoreBtn.type = "button";
  restoreBtn.className = "chatboost-panel-btn";
  restoreBtn.textContent = "Restore All";
  restoreBtn.addEventListener("click", () => handlers.onRestoreAll());

  rootEl.appendChild(toggleBtn);
  rootEl.appendChild(restoreBtn);
  document.body.appendChild(rootEl);
  updateEnabledLabel(enabled);
}

export function unmountPanel(): void {
  rootEl?.remove();
  rootEl = null;
  toggleBtn = null;
}

export function updateEnabledLabel(enabled: boolean): void {
  if (!toggleBtn) {
    return;
  }
  toggleBtn.dataset.enabled = enabled ? "true" : "false";
  toggleBtn.textContent = enabled ? "ChatBoost ON" : "ChatBoost OFF";
}
