import { PLACEHOLDER_ATTR } from "../shared/constants";
import type { MessageModel } from "../shared/types";

const PLACEHOLDER_CLASS = "chatboost-placeholder";
const PLACEHOLDER_NOTE_CLASS = "chatboost-placeholder-note";

export function applyPlaceholderMode(msg: MessageModel): void {
  msg.el.classList.add(PLACEHOLDER_CLASS);
  msg.el.classList.remove("chatboost-collapsed");
  msg.el.setAttribute(PLACEHOLDER_ATTR, "true");
  msg.el.style.minHeight = `${Math.max(msg.metrics.height, 80)}px`;
  dehydrateContent(msg);
}

export function restoreDehydratedContent(msg: MessageModel): void {
  if (!msg.contentEl || msg.contentEl === msg.el) {
    return;
  }

  if (msg.dehydratedHtml !== undefined) {
    msg.contentEl.innerHTML = msg.dehydratedHtml;
    msg.dehydratedHtml = undefined;
    return;
  }
}

function dehydrateContent(msg: MessageModel): void {
  if (!msg.contentEl || msg.contentEl === msg.el) {
    return;
  }

  if (msg.dehydratedHtml === undefined) {
    msg.dehydratedHtml = msg.contentEl.innerHTML;
  }

  const note = document.createElement("div");
  note.className = PLACEHOLDER_NOTE_CLASS;
  note.textContent = "⚡ 已轻量化，点击列表可恢复";
  msg.contentEl.replaceChildren(note);
}
