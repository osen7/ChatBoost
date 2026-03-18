import type { ChatSiteAdapter } from "../adapters/base";
import { readControlAction } from "../features/messageControls";
import { getConfigForMode } from "../shared/config";
import { applyRenderMode } from "./renderState";
import { Scheduler } from "./scheduler";
import { SafetyGuard } from "./safety";
import { buildOrUpdateModels, createEmptyThread } from "./model";
import { getDistanceInScreens, getViewportInfo } from "./viewport";
import type {
  EngineConfig,
  EngineStats,
  MessageModel,
  OptimizedMessageSummary,
  PressureLevel,
  RenderMode,
  ThreadState
} from "../shared/types";

export class OptimizationEngine {
  private readonly scheduler = new Scheduler();
  private readonly safety = new SafetyGuard();
  private readonly onScroll = throttle(() => this.handleScroll(), 80);
  private readonly onClick = (event: MouseEvent) => this.handleClick(event);
  private readonly observer = new MutationObserver(() => this.scheduleRefresh());
  private readonly temporaryRevealTimers = new Map<string, number>();
  private readonly temporaryRevealMs = 4000;
  private readonly postJumpRecalcDelayMs = 300;
  private readonly perfProbeIntervalMs = 1200;
  private config: EngineConfig;
  private stopped = false;
  private thread: ThreadState;
  private scrollDirection: "up" | "down" = "down";
  private scrollSpeedPxPerSec = 0;
  private lastScrollY = window.scrollY;
  private lastScrollAt = performance.now();
  private pressureLevel: PressureLevel = "medium";
  private lastUpdateMs = 0;
  private avgUpdateMs = 0;
  private updateCount = 0;
  private domNodeCount = 0;
  private preCount = 0;
  private dehydratedCount = 0;
  private longTaskTimestamps: number[] = [];
  private lastPerfProbeAt = 0;
  private longTaskObserver: PerformanceObserver | null = null;

  constructor(private readonly adapter: ChatSiteAdapter, config: EngineConfig) {
    this.config = config;
    this.thread = createEmptyThread(adapter.site);
  }

  start(): boolean {
    this.stopped = false;
    const root = this.adapter.getThreadRoot();
    if (!root) {
      return false;
    }

    window.addEventListener("scroll", this.onScroll, { passive: true });
    this.startLongTaskObserver();
    document.addEventListener("click", this.onClick, true);
    this.observer.observe(root, { subtree: true, childList: true, characterData: true });
    this.refreshThread();
    this.scheduleUpdate();
    return true;
  }

  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    window.removeEventListener("scroll", this.onScroll);
    document.removeEventListener("click", this.onClick, true);
    this.observer.disconnect();
    this.stopLongTaskObserver();
    this.clearTemporaryReveals();
  }

  restoreAll(): void {
    this.clearTemporaryReveals();
    for (const msg of this.thread.messages) {
      msg.flags.isPinned = false;
      msg.flags.isTemporarilyRevealed = false;
      applyRenderMode(msg, "full");
    }
  }

  getStats(): EngineStats {
    const stats: EngineStats = {
      total: this.thread.messages.length,
      full: 0,
      collapsed: 0,
      placeholder: 0,
      heavy: 0,
      streaming: 0,
      domNodeCount: this.domNodeCount,
      preCount: this.preCount,
      dehydratedCount: this.dehydratedCount,
      lastUpdateMs: this.lastUpdateMs,
      avgUpdateMs: this.avgUpdateMs,
      longTaskCount5s: this.getLongTaskCount5s(),
      pressureLevel: this.pressureLevel
    };

    for (const msg of this.thread.messages) {
      if (msg.renderMode === "full") stats.full += 1;
      if (msg.renderMode === "collapsed") stats.collapsed += 1;
      if (msg.renderMode === "placeholder") stats.placeholder += 1;
      if (msg.flags.isHeavy) stats.heavy += 1;
      if (msg.flags.isStreaming) stats.streaming += 1;
    }
    return stats;
  }

  getOptimizedMessages(): OptimizedMessageSummary[] {
    return this.thread.messages
      .filter((msg): msg is MessageModel & { renderMode: "collapsed" | "placeholder" } => msg.renderMode !== "full")
      .map((msg) => ({
        id: msg.id,
        role: msg.role,
        renderMode: msg.renderMode,
        previewText: msg.previewText || "(empty)",
        optimizationReason: msg.optimizationReason ?? "为了减少当前页面渲染压力"
      }));
  }

  updateConfig(nextConfig: EngineConfig): void {
    this.config = nextConfig;
    this.scheduleUpdate();
  }

  reset(): void {
    if (this.stopped) {
      return;
    }
    this.restoreAll();
    this.observer.disconnect();
    this.thread = createEmptyThread(this.adapter.site);

    const root = this.adapter.getThreadRoot();
    if (root) {
      this.observer.observe(root, { subtree: true, childList: true, characterData: true });
    }
    this.refreshThread();
    this.scheduleUpdate();
  }

  jumpToMessage(messageId: string): void {
    const msg = this.thread.messages.find((item) => item.id === messageId);
    if (!msg) {
      return;
    }
    this.revealTemporarily(msg);
    msg.optimizationReason = undefined;
    msg.lastModeChangedAt = Date.now();
    applyRenderMode(msg, "full");
    this.scrollIntoViewAfterLayout(msg);
    window.setTimeout(() => {
      if (!this.stopped) {
        this.scheduleUpdate();
      }
    }, this.postJumpRecalcDelayMs);
  }

  restoreMessage(messageId: string): void {
    const msg = this.thread.messages.find((item) => item.id === messageId);
    if (!msg) {
      return;
    }
    this.revealTemporarily(msg);
    msg.optimizationReason = undefined;
    msg.lastModeChangedAt = Date.now();
    applyRenderMode(msg, "full");
  }

  private scheduleRefresh(): void {
    this.scheduler.scheduleIdle(() => {
      if (this.stopped) {
        return;
      }
      this.refreshThread();
      this.scheduleUpdate();
    });
  }

  private scheduleUpdate(): void {
    this.scheduler.scheduleMeasure(() => {
      if (this.stopped) {
        return;
      }
      const updateStartedAt = performance.now();
      const viewport = getViewportInfo();
      const effectiveConfig = getEffectiveConfig(this.config, this.pressureLevel);
      const measureBufferScreens = Math.max(effectiveConfig.collapseBufferScreens + 1, 2);
      for (const msg of this.thread.messages) {
        if (!shouldMeasureMessage(msg, viewport, measureBufferScreens)) {
          continue;
        }
        const rect = msg.el.getBoundingClientRect();
        msg.metrics.top = rect.top + viewport.top;
        msg.metrics.bottom = rect.bottom + viewport.top;
        msg.metrics.height = rect.height;
        msg.metrics.lastMeasuredAt = Date.now();
      }

      const updates = this.thread.messages.map((msg) => ({
        msg,
        mode: decideRenderMode(msg, viewport, effectiveConfig, {
          direction: this.scrollDirection,
          speedPxPerSec: this.scrollSpeedPxPerSec
        }),
        reason: getOptimizationReason(msg, viewport, effectiveConfig)
      }));

      this.scheduler.scheduleMutate(() => {
        if (this.stopped) {
          return;
        }
        for (const update of updates) {
          if (update.mode === "collapsed") {
            update.msg.el.style.maxHeight = `${effectiveConfig.collapseHeight}px`;
          } else {
            update.msg.el.style.removeProperty("max-height");
          }
          if (update.mode === "full") {
            update.msg.optimizationReason = undefined;
          } else {
            update.msg.optimizationReason = update.reason;
            update.msg.lastModeChangedAt = Date.now();
          }
          applyRenderMode(update.msg, update.mode);
        }
        this.capturePerfMetrics(updateStartedAt);
      });
    });
  }

  private refreshThread(): void {
    this.thread = buildOrUpdateModels(this.adapter, this.thread);
    if (this.safety.shouldStop(this.adapter)) {
      this.stop();
    }
  }

  private revealTemporarily(msg: MessageModel): void {
    const prevTimer = this.temporaryRevealTimers.get(msg.id);
    if (prevTimer !== undefined) {
      window.clearTimeout(prevTimer);
    }

    this.clearTemporaryReveals(msg.id);
    msg.flags.isTemporarilyRevealed = true;
    const timerId = window.setTimeout(() => {
      this.temporaryRevealTimers.delete(msg.id);
      msg.flags.isTemporarilyRevealed = false;
      this.scheduleUpdate();
    }, this.temporaryRevealMs);
    this.temporaryRevealTimers.set(msg.id, timerId);
  }

  private clearTemporaryReveals(keepId?: string): void {
    for (const [messageId, timerId] of this.temporaryRevealTimers) {
      if (keepId && messageId === keepId) {
        continue;
      }
      window.clearTimeout(timerId);
      this.temporaryRevealTimers.delete(messageId);
    }
    for (const msg of this.thread.messages) {
      if (keepId && msg.id === keepId) {
        continue;
      }
      msg.flags.isTemporarilyRevealed = false;
    }
  }

  private scrollIntoViewAfterLayout(msg: MessageModel): void {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (this.stopped || !msg.el.isConnected) {
          return;
        }
        msg.el.scrollIntoView({ behavior: "smooth", block: "center" });
        highlightMessage(msg.el);
      });
    });
  }

  private handleClick(event: MouseEvent): void {
    const control = readControlAction(event.target);
    if (!control) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const msg = this.thread.messages.find((item) => item.id === control.messageId);
    if (!msg) {
      return;
    }

    msg.flags.isPinned = control.action === "expand";
    if (!msg.flags.isPinned) {
      msg.flags.isTemporarilyRevealed = false;
    }
    this.scheduleUpdate();
  }

  private startLongTaskObserver(): void {
    if (!("PerformanceObserver" in window)) {
      return;
    }
    if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      return;
    }
    this.longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.longTaskTimestamps.push(entry.startTime);
      }
      this.pruneLongTaskHistory(performance.now());
    });
    this.longTaskObserver.observe({ type: "longtask", buffered: true });
  }

  private stopLongTaskObserver(): void {
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
    this.longTaskTimestamps = [];
  }

  private handleScroll(): void {
    const now = performance.now();
    const currentY = window.scrollY;
    const deltaY = currentY - this.lastScrollY;
    const deltaMs = Math.max(now - this.lastScrollAt, 1);
    this.scrollDirection = deltaY < 0 ? "up" : "down";
    this.scrollSpeedPxPerSec = Math.abs((deltaY / deltaMs) * 1000);
    this.lastScrollY = currentY;
    this.lastScrollAt = now;
    this.scheduleUpdate();
  }

  private capturePerfMetrics(updateStartedAt: number): void {
    const now = performance.now();
    this.lastUpdateMs = Math.max(0, now - updateStartedAt);
    this.updateCount += 1;
    const alpha = 0.18;
    this.avgUpdateMs =
      this.updateCount === 1 ? this.lastUpdateMs : this.avgUpdateMs * (1 - alpha) + this.lastUpdateMs * alpha;

    this.pruneLongTaskHistory(now);
    if (now - this.lastPerfProbeAt >= this.perfProbeIntervalMs) {
      this.lastPerfProbeAt = now;
      this.probeDomMetrics();
    }
    this.pressureLevel = decidePressureLevel({
      longTaskCount5s: this.getLongTaskCount5s(),
      lastUpdateMs: this.lastUpdateMs,
      domNodeCount: this.domNodeCount,
      dehydratedCount: this.dehydratedCount,
      preCount: this.preCount
    });
  }

  private probeDomMetrics(): void {
    const root = this.adapter.getThreadRoot();
    if (!root) {
      return;
    }
    this.domNodeCount = root.querySelectorAll("*").length;
    this.preCount = root.querySelectorAll("pre").length;
    this.dehydratedCount = this.thread.messages.filter((msg) => msg.dehydratedHtml !== undefined).length;
  }

  private getLongTaskCount5s(): number {
    this.pruneLongTaskHistory(performance.now());
    return this.longTaskTimestamps.length;
  }

  private pruneLongTaskHistory(now: number): void {
    const windowMs = 5000;
    while (this.longTaskTimestamps.length > 0 && now - this.longTaskTimestamps[0] > windowMs) {
      this.longTaskTimestamps.shift();
    }
  }
}

function getOptimizationReason(
  msg: MessageModel,
  viewport: ReturnType<typeof getViewportInfo>,
  cfg: EngineConfig
): string {
  const distanceScreens = getDistanceInScreens(msg.metrics, viewport);
  if (msg.renderMode === "full" && distanceScreens <= cfg.fullBufferScreens) {
    return "";
  }

  const reasons: string[] = [];
  if (distanceScreens > cfg.fullBufferScreens) {
    reasons.push("远离当前视口");
  }
  if (msg.flags.isHeavy) {
    reasons.push("消息较重");
  }
  if (msg.flags.codeBlockCount > 0) {
    reasons.push("含代码块");
  }
  if (cfg.enablePlaceholder && distanceScreens > cfg.collapseBufferScreens) {
    reasons.push("当前模式允许占位");
  }
  return reasons.join("，") || "为了减少当前页面渲染压力";
}

function highlightMessage(el: HTMLElement): void {
  const prevOutline = el.style.outline;
  const prevOffset = el.style.outlineOffset;
  const prevTransition = el.style.transition;
  el.style.outline = "2px solid #f59e0b";
  el.style.outlineOffset = "4px";
  el.style.transition = "outline-color 0.4s ease";
  window.setTimeout(() => {
    el.style.outline = prevOutline;
    el.style.outlineOffset = prevOffset;
    el.style.transition = prevTransition;
  }, 1800);
}

export function decideRenderMode(
  msg: MessageModel,
  viewport: ReturnType<typeof getViewportInfo>,
  cfg: EngineConfig,
  opts?: { direction: "up" | "down"; speedPxPerSec: number }
): RenderMode {
  if (!cfg.enableAutoCollapse) {
    return "full";
  }
  if (msg.flags.isStreaming || msg.flags.isPinned || msg.flags.isTemporarilyRevealed) {
    return "full";
  }

  let distanceScreens = getDistanceInScreens(msg.metrics, viewport);
  if (msg.flags.codeBlockCount >= 2) {
    distanceScreens += 1.0;
  } else if (msg.flags.codeBlockCount === 1) {
    distanceScreens += 0.6;
  }
  if (opts && opts.speedPxPerSec >= 1200) {
    const position = getMessagePosition(msg, viewport);
    if (opts.direction === "up") {
      if (position === "below") distanceScreens += 1.2;
      if (position === "above") distanceScreens = Math.max(0, distanceScreens - 0.5);
    } else {
      if (position === "above") distanceScreens += 1.2;
      if (position === "below") distanceScreens = Math.max(0, distanceScreens - 0.5);
    }
  }
  if (distanceScreens <= cfg.fullBufferScreens) {
    return "full";
  }
  if (distanceScreens <= cfg.collapseBufferScreens) {
    return "collapsed";
  }
  return cfg.enablePlaceholder ? "placeholder" : "collapsed";
}

function getMessagePosition(
  msg: MessageModel,
  viewport: ReturnType<typeof getViewportInfo>
): "above" | "inside" | "below" {
  if (msg.metrics.bottom < viewport.top) {
    return "above";
  }
  if (msg.metrics.top > viewport.bottom) {
    return "below";
  }
  return "inside";
}

function getEffectiveConfig(base: EngineConfig, pressure: PressureLevel): EngineConfig {
  if (pressure === "low") {
    return getConfigForMode("lite");
  }
  if (pressure === "high") {
    return getConfigForMode("aggressive");
  }
  return getConfigForMode("balanced");
}

function decidePressureLevel(input: {
  longTaskCount5s: number;
  lastUpdateMs: number;
  domNodeCount: number;
  dehydratedCount: number;
  preCount: number;
}): PressureLevel {
  if (
    input.longTaskCount5s >= 3 ||
    input.lastUpdateMs >= 22 ||
    input.domNodeCount >= 7000 ||
    input.dehydratedCount >= 120 ||
    input.preCount >= 90
  ) {
    return "high";
  }
  if (
    input.longTaskCount5s >= 1 ||
    input.lastUpdateMs >= 12 ||
    input.domNodeCount >= 3500 ||
    input.dehydratedCount >= 40 ||
    input.preCount >= 40
  ) {
    return "medium";
  }
  return "low";
}

function shouldMeasureMessage(
  msg: MessageModel,
  viewport: ReturnType<typeof getViewportInfo>,
  bufferScreens: number
): boolean {
  if (msg.flags.isStreaming || msg.flags.isPinned || msg.flags.isTemporarilyRevealed) {
    return true;
  }

  const margin = viewport.height * bufferScreens;
  const minTop = viewport.top - margin;
  const maxBottom = viewport.bottom + margin;
  return msg.metrics.bottom >= minTop && msg.metrics.top <= maxBottom;
}

function throttle<T extends (...args: unknown[]) => void>(fn: T, waitMs: number): T {
  let timer: number | null = null;
  let trailing = false;

  return ((...args: unknown[]) => {
    if (timer !== null) {
      trailing = true;
      return;
    }

    fn(...args);
    timer = window.setTimeout(() => {
      timer = null;
      if (!trailing) {
        return;
      }
      trailing = false;
      fn(...args);
    }, waitMs);
  }) as T;
}
