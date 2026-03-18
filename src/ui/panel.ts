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
let dragActive = false;
let dragMoved = false;
let dragOffsetY = 0;
let manualPositionLocked = false;
let optimizedNavIndex = 0;

const HOTKEY = { ctrl: true, shift: true, key: "S" };
const DRAG_THRESHOLD = 6;
const COLLAPSE_DELAY_MS = 160;

const lightningIcon = `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M13 2 6 13h5l-1 9 8-12h-5l0-8Z"></path>
</svg>`;

export function mountPanel(initialState: PanelState, handlers: PanelHandlers): void {
  handlersRef = handlers;
  state = initialState;

  if (host?.isConnected) {
    renderState();
    return;
  }
  appliedPlacement = null;

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
      <div class="cbx-toolbar"></div>
      <button class="cbx-anchor" type="button" aria-label="切换加速">
        <span class="cbx-anchor-icon" aria-hidden="true">${lightningIcon}</span>
        <span class="cbx-anchor-label" aria-hidden="true"></span>
      </button>
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

  };
  shadow.addEventListener("click", clickHandler);
  cleanupFns.push(() => shadow.removeEventListener("click", clickHandler));

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
    label.textContent = "";
  }
  anchorEl.classList.toggle("cbx-anchor-off", !state.enabled);

  renderIndexRail();
  renderDetail();
  setToolbarVisible(true);
  setDetailVisible(true);

  if (appliedPlacement !== state.placement) {
    applyPlacementByMode(state.placement);
    appliedPlacement = state.placement;
  }
}

function renderIndexRail(): void {
  if (!toolbarEl || !state) {
    return;
  }
  syncOptimizedNavIndex();
  toolbarEl.innerHTML = renderIndexRailHtml(state);
  bindRailActions(toolbarEl);
}

function renderDetail(): void {
  if (!detailEl || !state) {
    return;
  }
  syncOptimizedNavIndex();
  detailEl.innerHTML = renderIndexBubble(state);
  bindDetailActions(detailEl);
  positionDetailPanel();
}

function setToolbarVisible(visible: boolean): void {
  if (!toolbarEl) {
    return;
  }
  toolbarEl.classList.toggle("cbx-hidden", !visible);
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
    setToolbarVisible(true);
    setDetailVisible(true);
  }, COLLAPSE_DELAY_MS);
}

function clearCloseTimer(): void {
  if (closeTimer === null) {
    return;
  }
  window.clearTimeout(closeTimer);
  closeTimer = null;
}

function bindDetailActions(detailRoot: HTMLDivElement): void {
  const jumpCard = detailRoot.querySelector<HTMLElement>("[data-cbx-jump-current]");
  if (jumpCard) {
    jumpCard.onclick = () => {
      if (!state || state.optimizedMessages.length === 0) {
        return;
      }
      syncOptimizedNavIndex();
      const target = state.optimizedMessages[optimizedNavIndex];
      if (!target) {
        return;
      }
      handlersRef?.onJumpMessage(target.id);
    };
  }
}

function bindRailActions(railRoot: HTMLElement): void {
  const markerLines = railRoot.querySelectorAll<HTMLButtonElement>("[data-cbx-nav-line]");
  for (const line of markerLines) {
    line.onmouseenter = () => {
      if (!state || state.optimizedMessages.length === 0) {
        return;
      }
      const targetRaw = Number(line.dataset.cbxTargetIndex);
      if (!Number.isFinite(targetRaw)) {
        return;
      }
      const nextIndex = clamp(Math.round(targetRaw), 0, state.optimizedMessages.length - 1);
      if (nextIndex === optimizedNavIndex) {
        return;
      }
      optimizedNavIndex = nextIndex;
      renderState();
    };
    line.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!state || state.optimizedMessages.length === 0) {
        return;
      }
      const targetRaw = Number(line.dataset.cbxTargetIndex);
      if (!Number.isFinite(targetRaw)) {
        return;
      }
      optimizedNavIndex = clamp(Math.round(targetRaw), 0, state.optimizedMessages.length - 1);
      const target = state.optimizedMessages[optimizedNavIndex];
      if (!target) {
        return;
      }
      handlersRef?.onJumpMessage(target.id);
      renderState();
    };
  }

  const navButtons = railRoot.querySelectorAll<HTMLButtonElement>("[data-cbx-nav]");
  for (const btn of navButtons) {
    btn.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const dir = btn.dataset.cbxNav;
      jumpByNav(dir === "prev" ? -1 : 1);
    };
  }
}

function renderIndexBubble(s: PanelState): string {
  const navCount = s.optimizedMessages.length;
  const safeIndex = clamp(optimizedNavIndex, 0, Math.max(navCount - 1, 0));
  const current = navCount > 0 ? s.optimizedMessages[safeIndex] : null;
  const role = current ? (current.role === "user" ? "用户问题" : current.role === "assistant" ? "助手回复" : "消息") : "";
  const mode =
    current && current.renderMode === "collapsed"
      ? "折叠"
      : current && current.renderMode === "placeholder"
        ? "占位"
        : "完整";
  const preview = current ? escapeHtml(current.previewText || "(空内容)") : "当前没有可导航的问题索引。";
  return `
    <div class="cbx-index-bubble ${current ? "" : "cbx-index-card-empty"}" role="button" tabindex="0" data-cbx-jump-current ${current ? "" : "aria-disabled=true"}>
      <div class="cbx-index-title">问题索引</div>
      <div class="cbx-index-meta">${current ? `${role} · ${mode} · ${safeIndex + 1}/${navCount}` : "暂无索引项"}</div>
      <div class="cbx-index-preview">${preview}</div>
      <div class="cbx-index-hint">${current ? "点击卡片跳转到该位置" : "继续对话后会自动生成索引"}</div>
    </div>
  `;
}

function renderIndexRailHtml(s: PanelState): string {
  const navCount = s.optimizedMessages.length;
  const safeIndex = clamp(optimizedNavIndex, 0, Math.max(navCount - 1, 0));
  const activeMarker = messageIndexToMarker(safeIndex, navCount);
  const markerLines = Array.from({ length: 5 }, (_, index) => {
    const targetIndex = markerToMessageIndex(index, navCount);
    const active = index === activeMarker ? "cbx-index-line-active" : "";
    return `<button class="cbx-index-line ${active}" type="button" data-cbx-nav-line="${index}" data-cbx-target-index="${targetIndex}" aria-label="定位到第${targetIndex + 1}条"></button>`;
  }).join("");

  return `
    <div class="cbx-index-nav">
      <button class="cbx-index-btn" type="button" data-cbx-nav="prev" ${navCount > 0 && safeIndex > 0 ? "" : "disabled"} aria-label="上一个">↑</button>
      <div class="cbx-index-lines" aria-hidden="true">${markerLines}</div>
      <button class="cbx-index-btn" type="button" data-cbx-nav="next" ${navCount > 0 && safeIndex < navCount - 1 ? "" : "disabled"} aria-label="下一个">↓</button>
      <div class="cbx-index-pos">${navCount > 0 ? `${safeIndex + 1}/${navCount}` : "0/0"}</div>
    </div>
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
  if (target) {
    handlersRef?.onJumpMessage(target.id);
  }
  renderState();
}

function messageIndexToMarker(index: number, total: number): number {
  if (total <= 1) {
    return 0;
  }
  return clamp(Math.round((index / (total - 1)) * 4), 0, 4);
}

function markerToMessageIndex(marker: number, total: number): number {
  if (total <= 1) {
    return 0;
  }
  return clamp(Math.round((marker / 4) * (total - 1)), 0, total - 1);
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
  const throttledApply = throttle(apply, 180);

  // Keep placement stable during runtime; only recompute when viewport size changes.
  window.addEventListener("resize", throttledApply, true);
  window.setTimeout(apply, 90);

  return () => {
    window.removeEventListener("resize", throttledApply, true);
  };
}

function applyPlacementByMode(placement: PanelPlacement): void {
  if (!host) {
    return;
  }
  if (manualPositionLocked) {
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
  if (!detailEl || !clusterEl || !toolbarEl) {
    return;
  }
  const clusterRect = clusterEl.getBoundingClientRect();
  const activeLine = toolbarEl.querySelector<HTMLElement>(".cbx-index-line-active");
  const anchorRect = (activeLine ?? toolbarEl).getBoundingClientRect();
  const anchorCenter = anchorRect.top - clusterRect.top + anchorRect.height / 2;
  detailEl.style.top = `${Math.round(anchorCenter)}px`;
}

const styles = `
.cbx-cluster{
  position:relative;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:10px;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --cbx-border:#cbd5e1;
  --cbx-text:#0f172a;
  --cbx-muted:#64748b;
  --cbx-radius:12px;
  --cbx-stroke:1px;
  --cbx-shadow:0 6px 18px rgba(15,23,42,.12);
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
  z-index:2;
}
.cbx-anchor{
  display:flex;
  align-items:center;
  justify-content:center;
  width:44px;
  height:44px;
  border:var(--cbx-stroke) solid var(--cbx-border);
  border-radius:999px;
  padding:0;
  background:rgba(255,255,255,.94);
  color:var(--cbx-text);
  backdrop-filter: blur(8px);
  box-shadow:var(--cbx-shadow);
  cursor:pointer;
}
.cbx-anchor-off{
  opacity:.9;
}
.cbx-anchor-icon{
  display:inline-flex;
  width:18px;
  height:18px;
  color:#f5b301;
}
.cbx-anchor-off .cbx-anchor-icon{
  color:#94a3b8;
}
.cbx-anchor-icon svg,
.cbx-toolbar svg{
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
  display:none;
}
.cbx-toolbar{
  position:relative;
  width:28px;
  z-index:3;
  pointer-events:auto;
}
.cbx-tooltip{
  display:none !important;
}
.cbx-detail{
  position:absolute;
  top:50%;
  transform:translateY(-50%);
  width:260px;
  border:var(--cbx-stroke) solid rgba(148,163,184,.32);
  border-radius:18px;
  background:#f5f5f5;
  color:var(--cbx-text);
  padding:14px 16px;
  box-shadow:0 10px 22px rgba(15,23,42,.12);
  z-index:4;
  right:calc(100% + 16px);
}
.cbx-index-card-empty{
  cursor:default;
}
.cbx-index-bubble{
  cursor:pointer;
}
.cbx-index-title{
  font-size:12px;
  font-weight:700;
  margin-bottom:4px;
}
.cbx-index-meta{
  font-size:11px;
  color:var(--cbx-muted);
  margin-bottom:7px;
}
.cbx-index-preview{
  font-size:14px;
  color:var(--cbx-text);
  line-height:1.45;
  display:-webkit-box;
  -webkit-line-clamp:2;
  -webkit-box-orient:vertical;
  overflow:hidden;
  text-overflow:ellipsis;
}
.cbx-index-hint{
  font-size:11px;
  color:var(--cbx-muted);
  margin-top:7px;
}
.cbx-index-nav{
  width:28px;
  min-height:154px;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:space-between;
  gap:6px;
}
.cbx-index-btn{
  width:24px;
  height:24px;
  border:none;
  background:transparent;
  color:#666;
  font-size:16px;
  font-weight:700;
  cursor:pointer;
}
.cbx-index-btn:disabled{
  opacity:.3;
  cursor:default;
}
.cbx-index-lines{
  display:flex;
  flex-direction:column;
  gap:8px;
}
.cbx-index-line{
  width:12px;
  height:2px;
  border-radius:2px;
  border:none;
  background:#bbb;
  padding:0;
  cursor:pointer;
}
.cbx-index-line-active{
  width:20px;
  background:#444;
}
.cbx-index-pos{
  min-width:28px;
  text-align:center;
  font-size:10px;
  color:var(--cbx-muted);
  padding-top:2px;
}
.cbx-hidden{ display:none; }
`;
