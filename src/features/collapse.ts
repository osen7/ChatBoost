import { MESSAGE_ATTR } from "../shared/constants";
import { restoreDehydratedContent } from "./placeholder";
import type { MessageModel } from "../shared/types";

const COLLAPSED_CLASS = "chatboost-collapsed";

export function applyCollapsedMode(msg: MessageModel): void {
  msg.el.setAttribute(MESSAGE_ATTR, msg.id);
  msg.el.classList.add(COLLAPSED_CLASS);
  msg.el.classList.remove("chatboost-placeholder");
  showContent(msg);
  msg.el.style.removeProperty("min-height");
  msg.el.removeAttribute("data-chatboost-placeholder");
}

export function applyFullMode(msg: MessageModel): void {
  msg.el.classList.remove(COLLAPSED_CLASS);
  msg.el.classList.remove("chatboost-placeholder");
  showContent(msg);
  msg.el.style.removeProperty("min-height");
  msg.el.removeAttribute("data-chatboost-placeholder");
}

function showContent(msg: MessageModel): void {
  if (!msg.contentEl || msg.contentEl === msg.el) {
    return;
  }
  restoreDehydratedContent(msg);
}
