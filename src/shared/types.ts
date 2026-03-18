export type MessageRole = "user" | "assistant" | "system" | "unknown";

export type RenderMode = "full" | "collapsed" | "placeholder";

export interface MessageMetrics {
  top: number;
  bottom: number;
  height: number;
  lastMeasuredAt: number;
}

export interface MessageFlags {
  isStreaming: boolean;
  isPinned: boolean;
  isHeavy: boolean;
  isInteractive: boolean;
}

export interface MessageModel {
  id: string;
  role: MessageRole;
  el: HTMLElement;
  contentEl: HTMLElement | null;
  metrics: MessageMetrics;
  flags: MessageFlags;
  renderMode: RenderMode;
  previewText: string;
  optimizationReason?: string;
  lastModeChangedAt?: number;
}

export interface ThreadState {
  site: string;
  messages: MessageModel[];
  activeRange: { start: number; end: number };
  lastUpdatedAt: number;
}

export interface EngineConfig {
  collapseHeight: number;
  fullBufferScreens: number;
  collapseBufferScreens: number;
  enablePlaceholder: boolean;
  enableAutoCollapse: boolean;
}

export type PerformanceMode = "lite" | "balanced" | "aggressive";
export type PanelPlacement = "right";

export interface ViewportInfo {
  top: number;
  bottom: number;
  height: number;
}

export interface EngineStats {
  total: number;
  full: number;
  collapsed: number;
  placeholder: number;
  heavy: number;
  streaming: number;
}

export interface OptimizedMessageSummary {
  id: string;
  role: MessageRole;
  renderMode: Exclude<RenderMode, "full">;
  previewText: string;
  optimizationReason: string;
}
