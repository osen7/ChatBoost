import type { ChatSiteAdapter } from "../adapters/base";
import { readControlAction } from "../features/messageControls";
import { applyRenderMode } from "./renderState";
import { Scheduler } from "./scheduler";
import { SafetyGuard } from "./safety";
import { buildOrUpdateModels, createEmptyThread } from "./model";
import { getDistanceInScreens, getViewportInfo } from "./viewport";
import type { EngineConfig, EngineStats, MessageModel, RenderMode, ThreadState } from "../shared/types";

export class OptimizationEngine {
  private readonly scheduler = new Scheduler();
  private readonly safety = new SafetyGuard();
  private readonly onScroll = throttle(() => this.scheduleUpdate(), 80);
  private readonly onClick = (event: MouseEvent) => this.handleClick(event);
  private readonly observer = new MutationObserver(() => this.scheduleRefresh());
  private config: EngineConfig;
  private stopped = false;
  private thread: ThreadState;

  constructor(private readonly adapter: ChatSiteAdapter, config: EngineConfig) {
    this.config = config;
    this.thread = createEmptyThread(adapter.site);
  }

  start(): void {
    this.stopped = false;
    const root = this.adapter.getThreadRoot();
    if (!root) {
      return;
    }

    window.addEventListener("scroll", this.onScroll, { passive: true });
    document.addEventListener("click", this.onClick, true);
    this.observer.observe(root, { subtree: true, childList: true, characterData: true });
    this.refreshThread();
    this.scheduleUpdate();
  }

  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    window.removeEventListener("scroll", this.onScroll);
    document.removeEventListener("click", this.onClick, true);
    this.observer.disconnect();
  }

  restoreAll(): void {
    for (const msg of this.thread.messages) {
      msg.flags.isPinned = false;
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
      streaming: 0
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
      const viewport = getViewportInfo();
      for (const msg of this.thread.messages) {
        const rect = msg.el.getBoundingClientRect();
        msg.metrics.top = rect.top + viewport.top;
        msg.metrics.bottom = rect.bottom + viewport.top;
        msg.metrics.height = rect.height;
        msg.metrics.lastMeasuredAt = Date.now();
      }

      const updates = this.thread.messages.map((msg) => ({
        msg,
        mode: decideRenderMode(msg, viewport, this.config)
      }));

      this.scheduler.scheduleMutate(() => {
        if (this.stopped) {
          return;
        }
        for (const update of updates) {
          applyRenderMode(update.msg, update.mode);
        }
      });
    });
  }

  private refreshThread(): void {
    this.thread = buildOrUpdateModels(this.adapter, this.thread);
    if (this.safety.shouldStop(this.adapter)) {
      this.stop();
    }
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
    this.scheduleUpdate();
  }
}

export function decideRenderMode(
  msg: MessageModel,
  viewport: ReturnType<typeof getViewportInfo>,
  cfg: EngineConfig
): RenderMode {
  if (msg.flags.isStreaming || msg.flags.isPinned) {
    return "full";
  }

  const distanceScreens = getDistanceInScreens(msg.metrics, viewport);
  if (distanceScreens <= cfg.fullBufferScreens) {
    return "full";
  }
  if (distanceScreens <= cfg.collapseBufferScreens) {
    return "collapsed";
  }
  return cfg.enablePlaceholder ? "placeholder" : "collapsed";
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
