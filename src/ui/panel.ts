import { PANEL_ATTR } from "../shared/constants";

interface PanelHandlers {
  onToggleEnabled(nextEnabled: boolean): void;
  onTogglePause(nextPaused: boolean): void;
  onRestoreAll(): void;
}

export interface PanelState {
  enabled: boolean;
  paused: boolean;
  modeLabel: string;
  collapsedCount: number;
  placeholderCount: number;
  totalCount: number;
}

let host: HTMLDivElement | null = null;
let state: PanelState | null = null;
let handlersRef: PanelHandlers | null = null;
let cleanupFns: Array<() => void> = [];

let fabBtn: HTMLButtonElement | null = null;
let panelEl: HTMLDivElement | null = null;
let enableBtn: HTMLButtonElement | null = null;
let pauseBtn: HTMLButtonElement | null = null;
let restoreBtn: HTMLButtonElement | null = null;
let hideBtn: HTMLButtonElement | null = null;
let statusEl: HTMLDivElement | null = null;
let statsEl: HTMLDivElement | null = null;

const HOTKEY = { ctrl: true, shift: true, key: "S" };

export function mountPanel(initialState: PanelState, handlers: PanelHandlers): void {
  handlersRef = handlers;
  state = initialState;

  if (host?.isConnected) {
    renderState();
    return;
  }

  host = document.createElement("div");
  host.setAttribute(PANEL_ATTR, "true");
  host.style.position = "fixed";
  host.style.right = "14px";
  host.style.bottom = "22px";
  host.style.zIndex = "2147483647";
  host.style.pointerEvents = "none";

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${styles}</style>
    <div class="cbx-root" part="root">
      <button class="cbx-fab" part="fab" type="button">⚡ TS</button>
      <div class="cbx-panel cbx-hidden" part="panel">
        <div class="cbx-header" part="header">
          <span class="cbx-title">ThreadSprint</span>
          <button class="cbx-icon-btn" data-cbx-action="collapse" type="button" aria-label="Collapse">×</button>
        </div>
        <div class="cbx-status" part="status"></div>
        <div class="cbx-row">
          <button class="cbx-btn" data-cbx-action="toggle-enabled" type="button"></button>
          <button class="cbx-btn" data-cbx-action="toggle-pause" type="button"></button>
        </div>
        <div class="cbx-row">
          <button class="cbx-btn" data-cbx-action="restore" type="button">Restore All</button>
          <button class="cbx-btn" data-cbx-action="hide" type="button">Hide</button>
        </div>
        <div class="cbx-stats" part="stats"></div>
        <div class="cbx-help">快捷键: Ctrl + Shift + S</div>
      </div>
    </div>
  `;

  fabBtn = shadow.querySelector(".cbx-fab");
  panelEl = shadow.querySelector(".cbx-panel");
  enableBtn = shadow.querySelector("[data-cbx-action='toggle-enabled']");
  pauseBtn = shadow.querySelector("[data-cbx-action='toggle-pause']");
  restoreBtn = shadow.querySelector("[data-cbx-action='restore']");
  hideBtn = shadow.querySelector("[data-cbx-action='hide']");
  statusEl = shadow.querySelector(".cbx-status");
  statsEl = shadow.querySelector(".cbx-stats");

  const clickHandler = (event: Event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const action = target.getAttribute("data-cbx-action");
    if (!action) {
      if (target.classList.contains("cbx-fab")) {
        toggleExpanded();
      }
      return;
    }

    if (action === "collapse") {
      setExpanded(false);
      return;
    }
    if (action === "toggle-enabled") {
      handlersRef?.onToggleEnabled(!(state?.enabled ?? true));
      return;
    }
    if (action === "toggle-pause") {
      handlersRef?.onTogglePause(!(state?.paused ?? false));
      return;
    }
    if (action === "restore") {
      handlersRef?.onRestoreAll();
      return;
    }
    if (action === "hide") {
      setVisible(false);
    }
  };

  shadow.addEventListener("click", clickHandler);
  cleanupFns.push(() => shadow.removeEventListener("click", clickHandler));

  const dragCleanup = installDragAndSnap(host, shadow);
  cleanupFns.push(dragCleanup);

  const keyHandler = (event: KeyboardEvent) => {
    if (event.ctrlKey !== HOTKEY.ctrl || event.shiftKey !== HOTKEY.shift) {
      return;
    }
    if (event.key.toUpperCase() !== HOTKEY.key) {
      return;
    }
    event.preventDefault();
    const hidden = host?.style.display === "none";
    setVisible(hidden);
  };
  document.addEventListener("keydown", keyHandler, true);
  cleanupFns.push(() => document.removeEventListener("keydown", keyHandler, true));

  document.body.appendChild(host);
  renderState();
}

export function unmountPanel(): void {
  for (const cleanup of cleanupFns) {
    cleanup();
  }
  cleanupFns = [];
  host?.remove();
  host = null;
  fabBtn = null;
  panelEl = null;
  enableBtn = null;
  pauseBtn = null;
  restoreBtn = null;
  hideBtn = null;
  statusEl = null;
  statsEl = null;
  state = null;
  handlersRef = null;
}

export function updatePanelState(nextState: PanelState): void {
  state = nextState;
  renderState();
}

function renderState(): void {
  if (!state || !fabBtn || !enableBtn || !pauseBtn || !statusEl || !statsEl) {
    return;
  }

  fabBtn.textContent = `⚡ ${state.enabled ? "ON" : "OFF"}`;
  enableBtn.textContent = state.enabled ? "Disable Boost" : "Enable Boost";
  pauseBtn.textContent = state.paused ? "Resume Page" : "Pause Page";
  pauseBtn.disabled = !state.enabled;

  statusEl.textContent = `Mode: ${state.modeLabel}`;
  statsEl.textContent = [
    `Total: ${state.totalCount}`,
    `Collapsed: ${state.collapsedCount}`,
    `Placeholder: ${state.placeholderCount}`
  ].join("  |  ");
}

function toggleExpanded(): void {
  if (!panelEl) {
    return;
  }
  setExpanded(panelEl.classList.contains("cbx-hidden"));
}

function setExpanded(expanded: boolean): void {
  if (!panelEl) {
    return;
  }
  panelEl.classList.toggle("cbx-hidden", !expanded);
}

function setVisible(visible: boolean): void {
  if (!host) {
    return;
  }
  host.style.display = visible ? "block" : "none";
}

function installDragAndSnap(hostEl: HTMLDivElement, shadow: ShadowRoot): () => void {
  const header = shadow.querySelector(".cbx-header");
  if (!(header instanceof HTMLElement)) {
    return () => undefined;
  }

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const onMouseDown = (event: MouseEvent) => {
    dragging = true;
    const rect = hostEl.getBoundingClientRect();
    hostEl.style.left = `${rect.left}px`;
    hostEl.style.top = `${rect.top}px`;
    hostEl.style.right = "auto";
    hostEl.style.bottom = "auto";
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    event.preventDefault();
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!dragging) {
      return;
    }
    const maxLeft = Math.max(window.innerWidth - hostEl.offsetWidth - 6, 0);
    const maxTop = Math.max(window.innerHeight - hostEl.offsetHeight - 6, 0);
    const left = clamp(event.clientX - offsetX, 6, maxLeft);
    const top = clamp(event.clientY - offsetY, 6, maxTop);
    hostEl.style.left = `${left}px`;
    hostEl.style.top = `${top}px`;
  };

  const onMouseUp = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
    snapToEdge(hostEl);
  };

  header.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("mouseup", onMouseUp, true);

  return () => {
    header.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("mouseup", onMouseUp, true);
  };
}

function snapToEdge(hostEl: HTMLDivElement): void {
  const rect = hostEl.getBoundingClientRect();
  const toLeft = rect.left + rect.width / 2 < window.innerWidth / 2;
  const top = clamp(rect.top, 6, Math.max(window.innerHeight - rect.height - 6, 6));
  hostEl.style.top = `${top}px`;
  if (toLeft) {
    hostEl.style.left = "10px";
    return;
  }
  hostEl.style.left = `${Math.max(window.innerWidth - rect.width - 10, 6)}px`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const styles = `
.cbx-root{
  pointer-events:auto;
  display:flex;
  align-items:flex-end;
  gap:8px;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.cbx-fab{
  border:1px solid rgba(148,163,184,.45);
  border-radius:999px;
  padding:7px 11px;
  font-size:12px;
  background:rgba(255,255,255,.85);
  color:#0f172a;
  backdrop-filter: blur(6px);
  cursor:pointer;
}
.cbx-panel{
  width:240px;
  border:1px solid rgba(148,163,184,.45);
  border-radius:12px;
  background:rgba(255,255,255,.96);
  color:#0f172a;
  box-shadow:0 10px 30px rgba(2,6,23,.18);
  padding:10px;
}
.cbx-hidden{ display:none; }
.cbx-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  margin-bottom:8px;
  cursor:move;
  user-select:none;
}
.cbx-title{ font-size:12px; font-weight:700; letter-spacing:.2px; }
.cbx-icon-btn{
  border:0;
  background:transparent;
  color:#334155;
  cursor:pointer;
  font-size:15px;
  line-height:1;
}
.cbx-status{ font-size:12px; opacity:.85; margin-bottom:8px; }
.cbx-row{ display:flex; gap:6px; margin-bottom:6px; }
.cbx-btn{
  flex:1;
  border:1px solid #cbd5e1;
  border-radius:8px;
  background:#fff;
  color:#1e293b;
  font-size:12px;
  padding:6px 8px;
  cursor:pointer;
}
.cbx-btn:disabled{
  opacity:.45;
  cursor:not-allowed;
}
.cbx-stats{
  margin-top:4px;
  padding-top:8px;
  border-top:1px dashed #cbd5e1;
  font-size:11px;
  color:#334155;
}
.cbx-help{
  margin-top:6px;
  font-size:10px;
  opacity:.65;
}
`;
