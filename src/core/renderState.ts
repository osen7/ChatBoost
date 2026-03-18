import { applyCollapsedMode, applyFullMode } from "../features/collapse";
import { clearMessageControl, setMessageControl } from "../features/messageControls";
import { applyPlaceholderMode } from "../features/placeholder";
import type { MessageModel, RenderMode } from "../shared/types";

export function applyRenderMode(msg: MessageModel, mode: RenderMode): void {
  if (msg.renderMode !== mode) {
    if (mode === "full") {
      applyFullMode(msg);
    } else if (mode === "collapsed") {
      applyCollapsedMode(msg);
    } else {
      applyPlaceholderMode(msg);
    }
    msg.renderMode = mode;
  }

  syncMessageControl(msg);
}

function syncMessageControl(msg: MessageModel): void {
  if (msg.renderMode === "full") {
    if (msg.flags.isPinned) {
      setMessageControl(msg, "collapse");
      return;
    }
    clearMessageControl(msg);
    return;
  }

  setMessageControl(msg, "expand");
}
