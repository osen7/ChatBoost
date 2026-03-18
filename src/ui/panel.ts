import { PANEL_ATTR } from "../shared/constants";
import type { PanelPlacement } from "../shared/types";

interface PanelHandlers {
  onToggleEnabled(nextEnabled: boolean): void;
  onTogglePause(nextPaused: boolean): void;
  onCycleMode(): void;
  onCyclePlacement(): void;
  onRestoreAll(): void;
}

export interface PanelState {
  enabled: boolean;
  paused: boolean;
  modeLabel: string;
  modeHint: string;
  placementLabel: string;
  placement: PanelPlacement;
  collapsedCount: number;
  placeholderCount: number;
  totalCount: number;
}

type Action =
  | "toggle-enabled"
  | "toggle-pause"
  | "restore"
  | "mode"
  | "placement"
  | "status"
  | "hide";

let host: HTMLDivElement | null = null;
let state: PanelState | null = null;
let handlersRef: PanelHandlers | null = null;
let cleanupFns: Array<() => void> = [];

let anchorEl: HTMLButtonElement | null = null;
let clusterEl: HTMLDivElement | null = null;
let toolbarEl: HTMLDivElement | null = null;
let tooltipEl: HTMLDivElement | null = null;
let detailEl: HTMLDivElement | null = null;
let autoPlaced = true;
let appliedPlacement: PanelPlacement | null = null;
let hidden = false;
let closeTimer: number | null = null;
let hoverAction: Action | null = null;
let statusOpen = false;
let dragActive = false;
let dragMoved = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

const HOTKEY = { ctrl: true, shift: true, key: "S" };
const DRAG_THRESHOLD = 6;
const COLLAPSE_DELAY_MS = 160;

const lightningIcon = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M13 2 6 13h5l-1 9 8-12h-5l0-8Z"></path>
</svg>`;

const powerIcon = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 3v7"></path>
  <path d="M7 5.5a8 8 0 1 0 10 0"></path>
</svg>`;

const pauseIcon = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M9 5v14"></path>
  <path d="M15 5v14"></path>
</svg>`;

const restoreIcon = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M3 12a9 9 0 1 0 3-6.7"></path>
  <path d="M3 4v5h5"></path>
</svg>`;

const modeIcon = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 3a9 9 0 1 0 0 18"></path>
  <path d="M12 3a9 9 0 0 1 0 18"></path>
</svg>`;

const placementIcon = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M8 7 4 12l4 5"></path>
  <path d="M16 7l4 5-4 5"></path>
  <path d="M5 12h14"></path>
</svg>`;

const statusIcon = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 8v4"></path>
  <path d="M12 16h.01"></path>
  <circle cx="12" cy="12" r="9"></circle>
</svg>`;

const closeIcon = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="m6 6 12 12"></path>
  <path d="M18 6 6 18"></path>
</svg>`;

const TOOL_ACTIONS: Array<{ action: Action; icon: string }> = [
  { action: "toggle-enabled", icon: powerIcon },
  { action: "toggle-pause", icon: pauseIcon },
  { action: "restore", icon: restoreIcon },
  { action: "mode", icon: modeIcon },
  { action: "placement", icon: placementIcon },
  { action: "status", icon: statusIcon },
  { action: "hide", icon: closeIcon }
];

export function mountPanel(initialState: PanelState, handlers: PanelHandlers): void {
  handlersRef = handlers;
  state = initialState;
  autoPlaced = true;
  appliedPlacement = null;

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

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${styles}</style>
    <div class="cbx-cluster" data-side="right">
      <div class="cbx-track" aria-hidden="true"></div>
      <button class="cbx-anchor" type="button" aria-label="ThreadSprint">
        <span class="cbx-anchor-icon" aria-hidden="true">${lightningIcon}</span>
        <span class="cbx-anchor-label">ON</span>
      </button>
      <div class="cbx-toolbar cbx-hidden"></div>
      <div class="cbx-tooltip cbx-hidden"></div>
      <div class="cbx-detail cbx-hidden"></div>
    </div>
  `;

  anchorEl = shadow.querySelector(".cbx-anchor");
  clusterEl = shadow.querySelector(".cbx-cluster");
  toolbarEl = shadow.querySelector(".cbx-toolbar");
  tooltipEl = shadow.querySelector(".cbx-tooltip");
  detailEl = shadow.querySelector(".cbx-detail");

  if (!anchorEl || !clusterEl || !toolbarEl || !tooltipEl || !detailEl) {
    return;
  }

  toolbarEl.replaceChildren(...TOOL_ACTIONS.map((item) => createToolButton(item.action, item.icon)));

  const onMouseEnter = () => {
    clearCloseTimer();
    if (!hidden) {
      setToolbarVisible(true);
    }
  };
  const onMouseLeave = () => {
    scheduleClose();
  };
  clusterEl.addEventListener("mouseenter", onMouseEnter);
  clusterEl.addEventListener("mouseleave", onMouseLeave);
  cleanupFns.push(() => {
    clusterEl?.removeEventListener("mouseenter", onMouseEnter);
    clusterEl?.removeEventListener("mouseleave", onMouseLeave);
  });

  const clickHandler = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (dragMoved) {
      dragMoved = false;
      return;
    }

    if (target.closest(".cbx-anchor")) {
      statusOpen = !statusOpen;
      setDetailVisible(statusOpen);
      renderState();
      return;
    }

    const actionNode = target.closest("[data-cbx-action]");
    const action = actionNode?.getAttribute("data-cbx-action") as Action | null;
    if (!action) {
      return;
    }
    runAction(action);
  };
  shadow.addEventListener("click", clickHandler);
  cleanupFns.push(() => shadow.removeEventListener("click", clickHandler));

  const moveHandler = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      hoverAction = null;
      renderTooltip();
      return;
    }
    const actionNode = target.closest("[data-cbx-action]");
    const action = actionNode?.getAttribute("data-cbx-action") as Action | null;
    hoverAction = action;
    renderTooltip();
  };
  shadow.addEventListener("mouseover", moveHandler);
  cleanupFns.push(() => shadow.removeEventListener("mouseover", moveHandler));

  const hostEl = host;
  const dragCleanup = installDragAndSnap(hostEl, anchorEl, clusterEl);
  cleanupFns.push(dragCleanup);
  const avoidCleanup = installAutoAvoidance(hostEl);
  cleanupFns.push(avoidCleanup);

  const keyHandler = (event: KeyboardEvent) => {
    if (event.ctrlKey !== HOTKEY.ctrl || event.shiftKey !== HOTKEY.shift) {
      return;
    }
    if (event.key.toUpperCase() !== HOTKEY.key) {
      return;
    }
    event.preventDefault();
    hidden = !hidden;
    hostEl.style.display = hidden ? "none" : "block";
    if (!hidden) {
      setToolbarVisible(true);
      scheduleClose();
      if (state?.placement === "auto") {
        applySmartPlacement(hostEl);
      }
    }
  };
  document.addEventListener("keydown", keyHandler, true);
  cleanupFns.push(() => document.removeEventListener("keydown", keyHandler, true));

  document.body.appendChild(hostEl);
  renderState();
}

export function unmountPanel(): void {
  clearCloseTimer();
  for (const cleanup of cleanupFns) {
    cleanup();
  }
  cleanupFns = [];
  host?.remove();
  host = null;
  anchorEl = null;
  clusterEl = null;
  toolbarEl = null;
  tooltipEl = null;
  detailEl = null;
  state = null;
  handlersRef = null;
  appliedPlacement = null;
  hoverAction = null;
  statusOpen = false;
}

export function updatePanelState(nextState: PanelState): void {
  state = nextState;
  renderState();
}

function renderState(): void {
  if (!state || !anchorEl || !clusterEl || !toolbarEl || !detailEl) {
    return;
  }

  const label = anchorEl.querySelector<HTMLElement>(".cbx-anchor-label");
  if (label) {
    label.textContent = state.enabled ? "ON" : "OFF";
  }
  anchorEl.classList.toggle("cbx-anchor-off", !state.enabled);
  clusterEl.dataset.side = detectSide();

  updateToolLabels();
  renderTooltip();
  renderDetail();

  if (appliedPlacement !== state.placement) {
    applyPlacementByMode(state.placement);
    appliedPlacement = state.placement;
  }
}

function updateToolLabels(): void {
  if (!toolbarEl || !state) {
    return;
  }
  const buttons = toolbarEl.querySelectorAll<HTMLButtonElement>(".cbx-tool");
  for (const btn of buttons) {
    const action = btn.dataset.cbxAction as Action | undefined;
    if (!action) {
      continue;
    }
    btn.setAttribute("aria-label", getActionLabel(action, state));
  }
}

function renderTooltip(): void {
  if (!tooltipEl || !state || !hoverAction) {
    if (tooltipEl) {
      tooltipEl.classList.add("cbx-hidden");
    }
    return;
  }
  tooltipEl.textContent = getActionLabel(hoverAction, state);
  tooltipEl.classList.remove("cbx-hidden");
}

function renderDetail(): void {
  if (!detailEl || !state) {
    return;
  }
  detailEl.innerHTML = `
    <div class="cbx-detail-title">Status</div>
    <div class="cbx-detail-row">Mode: <b>${state.modeLabel}</b></div>
    <div class="cbx-detail-row">${state.modeHint}</div>
    <div class="cbx-detail-row">Placement: <b>${state.placementLabel}</b></div>
    <div class="cbx-detail-row">Total: ${state.totalCount}</div>
    <div class="cbx-detail-row">Collapsed: ${state.collapsedCount}</div>
    <div class="cbx-detail-row">Placeholder: ${state.placeholderCount}</div>
  `;
  setDetailVisible(statusOpen);
}

function setToolbarVisible(visible: boolean): void {
  if (!toolbarEl) {
    return;
  }
  toolbarEl.classList.toggle("cbx-hidden", !visible);
  if (!visible) {
    hoverAction = null;
    renderTooltip();
  }
}

function setDetailVisible(visible: boolean): void {
  if (!detailEl) {
    return;
  }
  detailEl.classList.toggle("cbx-hidden", !visible);
}

function scheduleClose(): void {
  clearCloseTimer();
  closeTimer = window.setTimeout(() => {
    if (dragActive) {
      return;
    }
    setToolbarVisible(false);
    statusOpen = false;
    setDetailVisible(false);
  }, COLLAPSE_DELAY_MS);
}

function clearCloseTimer(): void {
  if (closeTimer === null) {
    return;
  }
  window.clearTimeout(closeTimer);
  closeTimer = null;
}

function runAction(action: Action): void {
  if (!state) {
    return;
  }
  if (action === "toggle-enabled") {
    handlersRef?.onToggleEnabled(!state.enabled);
    return;
  }
  if (action === "toggle-pause") {
    handlersRef?.onTogglePause(!state.paused);
    return;
  }
  if (action === "restore") {
    handlersRef?.onRestoreAll();
    return;
  }
  if (action === "mode") {
    handlersRef?.onCycleMode();
    return;
  }
  if (action === "placement") {
    handlersRef?.onCyclePlacement();
    return;
  }
  if (action === "status") {
    statusOpen = !statusOpen;
    setDetailVisible(statusOpen);
    renderState();
    return;
  }
  if (action === "hide" && host) {
    hidden = true;
    host.style.display = "none";
  }
}

function createToolButton(action: Action, icon: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cbx-tool";
  btn.dataset.cbxAction = action;
  btn.setAttribute("data-cbx-action", action);
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    runAction(action);
  });
  btn.innerHTML = icon;
  return btn;
}

function getActionLabel(action: Action, s: PanelState): string {
  if (action === "toggle-enabled") return s.enabled ? "Disable boost" : "Enable boost";
  if (action === "toggle-pause") return s.paused ? "Resume page" : "Pause this page";
  if (action === "restore") return "Restore all messages";
  if (action === "mode") return `Mode: ${s.modeLabel}`;
  if (action === "placement") return `Place: ${s.placementLabel}`;
  if (action === "status") return "Open status";
  return "Hide widget";
}

function installDragAndSnap(hostEl: HTMLDivElement, anchor: HTMLButtonElement, cluster: HTMLDivElement): () => void {
  let startX = 0;
  let startY = 0;

  const onMouseDown = (event: MouseEvent) => {
    dragActive = true;
    dragMoved = false;
    autoPlaced = false;
    startX = event.clientX;
    startY = event.clientY;
    const rect = hostEl.getBoundingClientRect();
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
    hostEl.style.left = `${rect.left}px`;
    hostEl.style.top = `${rect.top}px`;
    hostEl.style.right = "auto";
    hostEl.style.bottom = "auto";
    event.preventDefault();
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!dragActive) {
      return;
    }
    const moved = Math.hypot(event.clientX - startX, event.clientY - startY);
    if (moved > DRAG_THRESHOLD) {
      dragMoved = true;
    }
    if (!dragMoved) {
      return;
    }
    const maxLeft = Math.max(window.innerWidth - hostEl.offsetWidth - 6, 0);
    const maxTop = Math.max(window.innerHeight - hostEl.offsetHeight - 6, 0);
    const left = clamp(event.clientX - dragOffsetX, 6, maxLeft);
    const top = clamp(event.clientY - dragOffsetY, 6, maxTop);
    hostEl.style.left = `${left}px`;
    hostEl.style.top = `${top}px`;
    const side = left + hostEl.offsetWidth / 2 < window.innerWidth / 2 ? "left" : "right";
    cluster.dataset.side = side;
  };

  const onMouseUp = () => {
    if (!dragActive) {
      return;
    }
    dragActive = false;
    if (dragMoved) {
      snapToEdge(hostEl, cluster);
    }
  };

  anchor.addEventListener("mousedown", onMouseDown);
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("mouseup", onMouseUp, true);

  return () => {
    anchor.removeEventListener("mousedown", onMouseDown);
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("mouseup", onMouseUp, true);
  };
}

function installAutoAvoidance(hostEl: HTMLDivElement): () => void {
  const apply = () => {
    if (!autoPlaced || !state || state.placement !== "auto") {
      return;
    }
    applySmartPlacement(hostEl);
  };
  const throttledApply = throttle(apply, 160);

  window.addEventListener("resize", throttledApply, true);
  window.addEventListener("scroll", throttledApply, true);
  window.setTimeout(apply, 90);

  return () => {
    window.removeEventListener("resize", throttledApply, true);
    window.removeEventListener("scroll", throttledApply, true);
  };
}

function applyPlacementByMode(placement: PanelPlacement): void {
  if (!host || !clusterEl) {
    return;
  }
  if (placement === "auto") {
    autoPlaced = true;
    applySmartPlacement(host);
    return;
  }
  autoPlaced = false;
  const width = Math.max(host.offsetWidth, 64);
  const sideGap = 14;
  const left = placement === "left" ? sideGap : Math.max(window.innerWidth - width - sideGap, 6);
  const top = Math.max(window.innerHeight - Math.max(host.offsetHeight, 40) - 22, 6);
  host.style.left = `${Math.round(left)}px`;
  host.style.top = `${Math.round(top)}px`;
  host.style.right = "auto";
  host.style.bottom = "auto";
  clusterEl.dataset.side = placement;
}

function applySmartPlacement(hostEl: HTMLDivElement): void {
  if (!clusterEl) {
    return;
  }
  const sideGap = 12;
  const candidatesBottom = [26, 96, 166, 236];
  const width = Math.max(hostEl.offsetWidth, 64);
  const height = Math.max(hostEl.offsetHeight, 40);

  for (const side of ["right", "left"] as const) {
    for (const bottom of candidatesBottom) {
      const left = side === "right" ? window.innerWidth - sideGap - width : sideGap;
      const top = Math.max(window.innerHeight - bottom - height, 6);
      if (isOccupied(left + width / 2, top + height / 2, hostEl)) {
        continue;
      }
      hostEl.style.left = `${Math.round(left)}px`;
      hostEl.style.top = `${Math.round(top)}px`;
      hostEl.style.right = "auto";
      hostEl.style.bottom = "auto";
      clusterEl.dataset.side = side;
      return;
    }
  }
}

function detectSide(): "left" | "right" {
  if (!host) {
    return "right";
  }
  const rect = host.getBoundingClientRect();
  return rect.left + rect.width / 2 < window.innerWidth / 2 ? "left" : "right";
}

function snapToEdge(hostEl: HTMLDivElement, cluster: HTMLDivElement): void {
  const rect = hostEl.getBoundingClientRect();
  const toLeft = rect.left + rect.width / 2 < window.innerWidth / 2;
  const top = clamp(rect.top, 6, Math.max(window.innerHeight - rect.height - 6, 6));
  hostEl.style.top = `${top}px`;
  if (toLeft) {
    hostEl.style.left = "10px";
    cluster.dataset.side = "left";
    return;
  }
  hostEl.style.left = `${Math.max(window.innerWidth - rect.width - 10, 6)}px`;
  cluster.dataset.side = "right";
}

function isOccupied(x: number, y: number, hostEl: HTMLElement): boolean {
  const stack = document.elementsFromPoint(x, y);
  for (const node of stack) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    if (node === hostEl || hostEl.contains(node)) {
      continue;
    }
    const style = window.getComputedStyle(node);
    if (style.visibility === "hidden" || style.display === "none") {
      continue;
    }
    const positioned = style.position === "fixed" || style.position === "sticky";
    const clickable =
      node.tagName === "BUTTON" ||
      node.tagName === "A" ||
      node.getAttribute("role") === "button" ||
      node.onclick !== null;
    if (positioned || clickable) {
      return true;
    }
  }
  return false;
}

function throttle<T extends (...args: unknown[]) => void>(fn: T, waitMs: number): T {
  let timer: number | null = null;
  return ((...args: unknown[]) => {
    if (timer !== null) {
      return;
    }
    timer = window.setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  }) as T;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const styles = `
.cbx-cluster{
  position:relative;
  display:flex;
  align-items:center;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.cbx-track{
  position:absolute;
  top:-8px;
  bottom:-8px;
  left:-8px;
  right:-8px;
}
.cbx-anchor{
  position:relative;
  z-index:3;
  display:inline-flex;
  align-items:center;
  gap:7px;
  border:1px solid rgba(148,163,184,.5);
  border-radius:999px;
  padding:7px 12px 7px 10px;
  font-size:12px;
  font-weight:600;
  background:rgba(255,255,255,.9);
  color:#0f172a;
  backdrop-filter: blur(8px);
  box-shadow:0 8px 24px rgba(2,6,23,.16);
  cursor:pointer;
}
.cbx-anchor-off{
  opacity:.78;
}
.cbx-anchor-icon{
  display:inline-flex;
  width:14px;
  height:14px;
}
.cbx-anchor-icon svg,
.cbx-tool svg{
  width:100%;
  height:100%;
  stroke:currentColor;
  fill:none;
  stroke-width:1.8;
  stroke-linecap:round;
  stroke-linejoin:round;
  pointer-events:none;
}
.cbx-anchor-label{
  letter-spacing:.2px;
}
.cbx-toolbar{
  position:absolute;
  display:flex;
  flex-direction:column;
  gap:7px;
  z-index:2;
  top:50%;
  transform:translateY(-50%);
  pointer-events:auto;
}
.cbx-cluster[data-side="right"] .cbx-toolbar{
  right:calc(100% + 10px);
}
.cbx-cluster[data-side="left"] .cbx-toolbar{
  left:calc(100% + 10px);
}
.cbx-tool{
  display:grid;
  place-items:center;
  width:30px;
  height:30px;
  border:1px solid #cbd5e1;
  border-radius:999px;
  background:rgba(255,255,255,.97);
  color:#1e293b;
  font-size:14px;
  cursor:pointer;
  box-shadow:0 4px 14px rgba(15,23,42,.12);
  pointer-events:auto;
}
.cbx-tool svg{
  width:15px;
  height:15px;
}
.cbx-tooltip{
  position:absolute;
  top:50%;
  transform:translateY(-50%);
  max-width:200px;
  padding:5px 8px;
  border:1px solid #cbd5e1;
  border-radius:8px;
  background:#ffffff;
  color:#0f172a;
  font-size:11px;
  white-space:nowrap;
  z-index:4;
  box-shadow:0 8px 20px rgba(15,23,42,.12);
}
.cbx-cluster[data-side="right"] .cbx-tooltip{
  right:calc(100% + 54px);
}
.cbx-cluster[data-side="left"] .cbx-tooltip{
  left:calc(100% + 54px);
}
.cbx-detail{
  position:absolute;
  top:38px;
  width:220px;
  border:1px solid rgba(148,163,184,.45);
  border-radius:10px;
  background:rgba(255,255,255,.98);
  color:#0f172a;
  padding:8px 10px;
  box-shadow:0 10px 24px rgba(15,23,42,.14);
  z-index:4;
}
.cbx-cluster[data-side="right"] .cbx-detail{
  right:0;
}
.cbx-cluster[data-side="left"] .cbx-detail{
  left:0;
}
.cbx-detail-title{
  font-size:12px;
  font-weight:700;
  margin-bottom:6px;
}
.cbx-detail-row{
  font-size:11px;
  line-height:1.5;
}
.cbx-hidden{ display:none; }
`;
