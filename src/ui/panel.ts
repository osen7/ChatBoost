import { PANEL_ATTR } from "../shared/constants";
import type { OptimizedMessageSummary, PanelPlacement, PressureLevel } from "../shared/types";

interface PanelHandlers {
  onToggleEnabled(nextEnabled: boolean): void;
  onJumpMessage(messageId: string): void;
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
  domNodeCount: number;
  preCount: number;
  dehydratedCount: number;
  lastUpdateMs: number;
  avgUpdateMs: number;
  longTaskCount5s: number;
  pressureLevel: PressureLevel;
  optimizedMessages: OptimizedMessageSummary[];
}

type Action =
  | "toggle-enabled"
  | "optimized";

let host: HTMLDivElement | null = null;
let state: PanelState | null = null;
let handlersRef: PanelHandlers | null = null;
let cleanupFns: Array<() => void> = [];

let anchorEl: HTMLButtonElement | null = null;
let clusterEl: HTMLDivElement | null = null;
let toolbarEl: HTMLDivElement | null = null;
let tooltipEl: HTMLDivElement | null = null;
let detailEl: HTMLDivElement | null = null;
let appliedPlacement: PanelPlacement | null = null;
let hidden = false;
let closeTimer: number | null = null;
let hoverAction: Action | null = null;
let hoverToolEl: HTMLElement | null = null;
let detailMode: "optimized" | null = null;
let detailAnchorEl: HTMLElement | null = null;
let dragActive = false;
let dragMoved = false;
let dragOffsetY = 0;
let manualPositionLocked = false;
let optimizedListScrollTop = 0;
let optimizedNavIndex = 0;

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

const optimizedIcon = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M4 7h16"></path>
  <path d="M4 12h16"></path>
  <path d="M4 17h11"></path>
</svg>`;

const TOOL_ACTIONS: Array<{ action: Action; icon: string }> = [
  { action: "toggle-enabled", icon: powerIcon },
  { action: "optimized", icon: optimizedIcon }
];

export function mountPanel(initialState: PanelState, handlers: PanelHandlers): void {
  handlersRef = handlers;
  state = initialState;
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
  host.style.zIndex = "999999";

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${styles}</style>
    <div class="cbx-cluster">
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
      if (!state) {
        return;
      }
      state.enabled = !state.enabled;
      if (!state.enabled) {
        state.paused = false;
      }
      renderState();
      handlersRef?.onToggleEnabled(state.enabled);
      return;
    }

    const actionNode = target.closest("[data-cbx-action]");
    const action = actionNode?.getAttribute("data-cbx-action") as Action | null;
    if (!action) {
      return;
    }
    runAction(action, actionNode instanceof HTMLElement ? actionNode : undefined);
  };
  shadow.addEventListener("click", clickHandler);
  cleanupFns.push(() => shadow.removeEventListener("click", clickHandler));

  const moveHandler = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      hoverAction = null;
      hoverToolEl = null;
      renderTooltip();
      return;
    }
    const actionNode = target.closest("[data-cbx-action]");
    const action = actionNode?.getAttribute("data-cbx-action") as Action | null;
    hoverAction = action;
    hoverToolEl = actionNode instanceof HTMLElement ? actionNode : null;
    renderTooltip();
  };
  shadow.addEventListener("mouseover", moveHandler);
  cleanupFns.push(() => shadow.removeEventListener("mouseover", moveHandler));

  const hostEl = host;
  const dragCleanup = installDragAndSnap(hostEl, anchorEl);
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
      if (!manualPositionLocked) {
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
  hoverToolEl = null;
  detailMode = null;
  detailAnchorEl = null;
  manualPositionLocked = false;
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
  if (hoverToolEl && clusterEl) {
    const toolRect = hoverToolEl.getBoundingClientRect();
    const clusterRect = clusterEl.getBoundingClientRect();
    const offsetTop = toolRect.top - clusterRect.top + toolRect.height / 2;
    tooltipEl.style.top = `${Math.round(offsetTop)}px`;
  } else {
    tooltipEl.style.top = "50%";
  }
  tooltipEl.classList.remove("cbx-hidden");
}

function renderDetail(): void {
  if (!detailEl || !state) {
    return;
  }
  const prevList = detailEl.querySelector<HTMLElement>(".cbx-optimized-list");
  if (detailMode === "optimized" && prevList) {
    optimizedListScrollTop = prevList.scrollTop;
  }

  if (detailMode === "optimized") {
    syncOptimizedNavIndex();
  }
  detailEl.innerHTML = renderOptimizedDetail(state);
  bindDetailActions(detailEl);
  setDetailVisible(detailMode !== null);
  if (detailMode !== null) {
    positionDetailPanel();
  }
  if (detailMode === "optimized") {
    const nextList = detailEl.querySelector<HTMLElement>(".cbx-optimized-list");
    if (nextList) {
      nextList.scrollTop = optimizedListScrollTop;
    }
  }
}

function setToolbarVisible(visible: boolean): void {
  if (!toolbarEl) {
    return;
  }
  toolbarEl.classList.toggle("cbx-hidden", !visible);
  if (!visible) {
    hoverAction = null;
    hoverToolEl = null;
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
    detailMode = null;
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

function runAction(action: Action, sourceEl?: HTMLElement): void {
  if (!state) {
    return;
  }
  if (action === "toggle-enabled") {
    state.enabled = !state.enabled;
    if (!state.enabled) {
      state.paused = false;
    }
    renderState();
    handlersRef?.onToggleEnabled(state.enabled);
    return;
  }
  if (action === "optimized") {
    detailAnchorEl = sourceEl ?? hoverToolEl ?? toolbarEl;
    detailMode = detailMode === "optimized" ? null : "optimized";
    setDetailVisible(detailMode !== null);
    renderState();
    return;
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
    runAction(action, btn);
  });
  btn.innerHTML = icon;
  return btn;
}

function getActionLabel(action: Action, s: PanelState): string {
  if (action === "toggle-enabled") return s.enabled ? "关闭加速" : "开启加速";
  return "查看问题索引";
}

function bindDetailActions(detailRoot: HTMLDivElement): void {
  const jumpNodes = detailRoot.querySelectorAll<HTMLElement>("[data-cbx-jump]");
  for (const node of jumpNodes) {
    node.onclick = () => {
      const messageId = node.dataset.cbxJump;
      if (!messageId) {
        return;
      }
      if (state) {
        const idx = state.optimizedMessages.findIndex((item) => item.id === messageId);
        if (idx >= 0) {
          optimizedNavIndex = idx;
        }
      }
      handlersRef?.onJumpMessage(messageId);
    };
  }

  const navButtons = detailRoot.querySelectorAll<HTMLButtonElement>("[data-cbx-nav]");
  for (const btn of navButtons) {
    btn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const dir = btn.dataset.cbxNav;
      jumpByNav(dir === "prev" ? -1 : 1);
    };
  }
}

function renderOptimizedDetail(s: PanelState): string {
  const navCount = s.optimizedMessages.length;
  const items = s.optimizedMessages
    .map((item, index) => {
      const role = item.role === "user" ? "问题" : item.role === "assistant" ? "回复" : "消息";
      const mode = item.renderMode === "collapsed" ? "折叠" : item.renderMode === "placeholder" ? "占位" : "完整";
      return `
        <div class="cbx-optimized-item ${index === optimizedNavIndex ? "cbx-optimized-item-active" : ""}" data-cbx-jump="${item.id}">
          <div class="cbx-optimized-meta">#${index + 1} · ${mode} · ${role}</div>
          <div class="cbx-optimized-preview">${escapeHtml(item.previewText || "(空内容)")}</div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="cbx-detail-title">问题索引</div>
    <div class="cbx-optimized-nav">
      <button class="cbx-detail-btn" type="button" data-cbx-nav="prev" ${navCount > 0 ? "" : "disabled"}>上一条</button>
      <button class="cbx-detail-btn" type="button" data-cbx-nav="next" ${navCount > 0 ? "" : "disabled"}>下一条</button>
    </div>
    <div class="cbx-detail-row">当前共有 ${s.optimizedMessages.length} 条索引项。</div>
    <div class="cbx-detail-row">点击条目可直接跳转定位，若已折叠会临时恢复。</div>
    <div class="cbx-optimized-list">${items || '<div class="cbx-detail-row">当前没有可导航的问题索引。</div>'}</div>
  `;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function syncOptimizedNavIndex(): void {
  if (!state) {
    optimizedNavIndex = 0;
    return;
  }
  const maxIndex = Math.max(state.optimizedMessages.length - 1, 0);
  optimizedNavIndex = clamp(optimizedNavIndex, 0, maxIndex);
}

function jumpByNav(offset: -1 | 1): void {
  if (!state || state.optimizedMessages.length === 0) {
    return;
  }
  syncOptimizedNavIndex();
  optimizedNavIndex = clamp(optimizedNavIndex + offset, 0, state.optimizedMessages.length - 1);
  const target = state.optimizedMessages[optimizedNavIndex];
  if (!target) {
    return;
  }
  handlersRef?.onJumpMessage(target.id);
  renderState();
}

function installDragAndSnap(hostEl: HTMLDivElement, anchor: HTMLButtonElement): () => void {
  let startY = 0;

  const onMouseDown = (event: MouseEvent) => {
    dragActive = true;
    dragMoved = false;
    startY = event.clientY;
    const rect = hostEl.getBoundingClientRect();
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
    const moved = Math.abs(event.clientY - startY);
    if (moved > DRAG_THRESHOLD) {
      dragMoved = true;
    }
    if (!dragMoved) {
      return;
    }
    const maxTop = Math.max(window.innerHeight - hostEl.offsetHeight - 6, 0);
    const top = clamp(event.clientY - dragOffsetY, 6, maxTop);
    hostEl.style.top = `${top}px`;
  };

  const onMouseUp = () => {
    if (!dragActive) {
      return;
    }
    dragActive = false;
    if (dragMoved) {
      manualPositionLocked = true;
      snapToEdge(hostEl);
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
    if (manualPositionLocked || dragActive) {
      return;
    }
    applySmartPlacement(hostEl);
  };
  const throttledApply = throttle(apply, 160);
  const observer = new MutationObserver(() => throttledApply());

  window.addEventListener("resize", throttledApply, true);
  window.addEventListener("scroll", throttledApply, true);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true });
  window.setTimeout(apply, 90);

  return () => {
    window.removeEventListener("resize", throttledApply, true);
    window.removeEventListener("scroll", throttledApply, true);
    observer.disconnect();
  };
}

function applyPlacementByMode(placement: PanelPlacement): void {
  if (!host) {
    return;
  }
  const width = Math.max(host.offsetWidth, 64);
  const height = Math.max(host.offsetHeight, 40);
  const sideGap = 14;
  const safeBottom = detectBottomSafeInset(host);
  const left = Math.max(window.innerWidth - width - sideGap, 6);
  const top = Math.max(window.innerHeight - safeBottom - height, 6);
  host.style.left = `${Math.round(left)}px`;
  host.style.top = `${Math.round(top)}px`;
  host.style.right = "auto";
  host.style.bottom = "auto";
}

function applySmartPlacement(hostEl: HTMLDivElement): void {
  const sideGap = 12;
  const safeBottom = detectBottomSafeInset(hostEl);
  const candidatesBottom = [safeBottom, safeBottom + 70, safeBottom + 140, safeBottom + 210];
  const width = Math.max(hostEl.offsetWidth, 64);
  const height = Math.max(hostEl.offsetHeight, 40);

  for (const bottom of candidatesBottom) {
    const left = window.innerWidth - sideGap - width;
    const top = Math.max(window.innerHeight - bottom - height, 6);
    if (isOccupied(left + width / 2, top + height / 2, hostEl)) {
      continue;
    }
    hostEl.style.left = `${Math.round(left)}px`;
    hostEl.style.top = `${Math.round(top)}px`;
    hostEl.style.right = "auto";
    hostEl.style.bottom = "auto";
    return;
  }
}

function detectBottomSafeInset(hostEl: HTMLElement): number {
  let inset = 26;
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const nodes = document.querySelectorAll<HTMLElement>("body *");
  for (const node of nodes) {
    if (node === hostEl || hostEl.contains(node)) {
      continue;
    }
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") {
      continue;
    }
    if (style.position !== "fixed" && style.position !== "sticky") {
      continue;
    }
    const rect = node.getBoundingClientRect();
    if (rect.height < 24 || rect.width < 24) {
      continue;
    }
    if (rect.right < viewportWidth - 360) {
      continue;
    }
    if (rect.top > viewportHeight - 260) {
      const candidate = viewportHeight - rect.top + 12;
      inset = Math.max(inset, candidate);
    }
  }
  return inset;
}

function snapToEdge(hostEl: HTMLDivElement): void {
  const rect = hostEl.getBoundingClientRect();
  const top = clamp(rect.top, 6, Math.max(window.innerHeight - rect.height - 6, 6));
  hostEl.style.top = `${top}px`;
  hostEl.style.left = `${Math.max(window.innerWidth - rect.width - 10, 6)}px`;
  hostEl.style.right = "auto";
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

function positionDetailPanel(): void {
  if (!detailEl || !clusterEl) {
    return;
  }
  const anchor = detailAnchorEl ?? hoverToolEl ?? toolbarEl ?? anchorEl;
  if (!anchor) {
    detailEl.style.top = "50%";
    return;
  }

  const clusterRect = clusterEl.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const anchorCenter = anchorRect.top - clusterRect.top + anchorRect.height / 2;
  detailEl.style.top = `${Math.round(anchorCenter)}px`;
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
  right:0;
  bottom:calc(100% + 10px);
  pointer-events:auto;
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
  transform:translateY(-50%);
  max-width:200px;
  padding:4px 8px;
  border:1px solid #cbd5e1;
  border-radius:6px;
  background:#ffffff;
  color:#0f172a;
  font-size:12px;
  white-space:nowrap;
  z-index:4;
  box-shadow:0 8px 20px rgba(15,23,42,.12);
}
.cbx-tooltip{ right:36px; }
.cbx-detail{
  position:absolute;
  top:50%;
  transform:translateY(-50%);
  width:220px;
  border:1px solid rgba(148,163,184,.45);
  border-radius:10px;
  background:rgba(255,255,255,.98);
  color:#0f172a;
  padding:8px 10px;
  box-shadow:0 10px 24px rgba(15,23,42,.14);
  z-index:4;
  right:calc(100% + 12px);
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
.cbx-optimized-list{
  margin-top:8px;
  display:flex;
  flex-direction:column;
  gap:8px;
  max-height:260px;
  overflow:auto;
}
.cbx-optimized-item{
  border:1px solid #e2e8f0;
  border-radius:8px;
  padding:8px;
  background:#fafafa;
  cursor:pointer;
}
.cbx-optimized-item-active{
  border-color:#94a3b8;
  background:#f1f5f9;
}
.cbx-optimized-nav{
  display:flex;
  gap:6px;
  margin-bottom:6px;
}
.cbx-optimized-meta{
  font-size:10px;
  color:#64748b;
  margin-bottom:4px;
}
.cbx-optimized-preview{
  font-size:11px;
  color:#0f172a;
  line-height:1.5;
  display:-webkit-box;
  -webkit-line-clamp:2;
  -webkit-box-orient:vertical;
  overflow:hidden;
  text-overflow:ellipsis;
}
.cbx-detail-btn{
  border:1px solid #cbd5e1;
  border-radius:6px;
  background:#fff;
  color:#1e293b;
  font-size:10px;
  padding:4px 8px;
  cursor:pointer;
}
.cbx-hidden{ display:none; }
`;
