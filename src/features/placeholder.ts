import { PLACEHOLDER_ATTR } from "../shared/constants";
import type { MessageModel } from "../shared/types";

const PLACEHOLDER_CLASS = "chatboost-placeholder";

export function applyPlaceholderMode(msg: MessageModel): void {
  msg.el.classList.add(PLACEHOLDER_CLASS);
  msg.el.classList.remove("chatboost-collapsed");
  msg.el.setAttribute(PLACEHOLDER_ATTR, "true");
  msg.el.style.minHeight = `${Math.max(msg.metrics.height, 80)}px`;
  hideContent(msg);
}

function hideContent(msg: MessageModel): void {
  if (!msg.contentEl || msg.contentEl === msg.el) {
    return;
  }
  if (msg.contentEl.dataset.chatboostPrevDisplay === undefined) {
    msg.contentEl.dataset.chatboostPrevDisplay = msg.contentEl.style.display;
  }
  msg.contentEl.style.display = "none";
}
