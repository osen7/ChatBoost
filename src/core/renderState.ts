import { applyCollapsedMode, applyFullMode } from "../features/collapse";
import { applyPlaceholderMode } from "../features/placeholder";
import type { MessageModel, RenderMode } from "../shared/types";

export function applyRenderMode(msg: MessageModel, mode: RenderMode): void {
  if (msg.renderMode === mode) {
    return;
  }

  if (mode === "full") {
    applyFullMode(msg);
  } else if (mode === "collapsed") {
    applyCollapsedMode(msg);
  } else {
    applyPlaceholderMode(msg);
  }

  msg.renderMode = mode;
}
