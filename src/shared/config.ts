import type { EngineConfig, PerformanceMode } from "./types";

export const modeConfigMap: Record<PerformanceMode, EngineConfig> = {
  lite: {
    collapseHeight: 420,
    fullBufferScreens: 3,
    collapseBufferScreens: 7,
    enablePlaceholder: false,
    enableAutoCollapse: true
  },
  balanced: {
    collapseHeight: 320,
    fullBufferScreens: 2,
    collapseBufferScreens: 5,
    enablePlaceholder: true,
    enableAutoCollapse: true
  },
  aggressive: {
    collapseHeight: 260,
    fullBufferScreens: 1,
    collapseBufferScreens: 3,
    enablePlaceholder: true,
    enableAutoCollapse: true
  }
};

export const defaultMode: PerformanceMode = "balanced";

export function getConfigForMode(mode: PerformanceMode): EngineConfig {
  return modeConfigMap[mode];
}
