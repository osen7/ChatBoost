import type { MessageMetrics, ViewportInfo } from "../shared/types";

export function getViewportInfo(): ViewportInfo {
  const top = window.scrollY;
  const height = window.innerHeight;
  return {
    top,
    bottom: top + height,
    height
  };
}

export function getDistanceInScreens(metrics: MessageMetrics, viewport: ViewportInfo): number {
  if (metrics.bottom < viewport.top) {
    return (viewport.top - metrics.bottom) / viewport.height;
  }
  if (metrics.top > viewport.bottom) {
    return (metrics.top - viewport.bottom) / viewport.height;
  }
  return 0;
}
