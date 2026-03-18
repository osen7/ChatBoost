import { PLACEHOLDER_ATTR } from "../shared/constants";
import type { MessageModel } from "../shared/types";

const PLACEHOLDER_CLASS = "chatboost-placeholder";
const PLACEHOLDER_NOTE_CLASS = "chatboost-placeholder-note";
const MAX_DEHYDRATED_BYTES = 20 * 1024 * 1024;
let dehydratedBytesInUse = 0;

export function applyPlaceholderMode(msg: MessageModel): void {
  msg.el.classList.add(PLACEHOLDER_CLASS);
  msg.el.classList.remove("chatboost-collapsed");
  msg.el.setAttribute(PLACEHOLDER_ATTR, "true");
  msg.el.style.minHeight = `${Math.max(msg.metrics.height, 80)}px`;
  if (msg.flags.isInteractive) {
    hideContentByDisplay(msg);
    return;
  }
  dehydrateContent(msg);
}

export function restoreDehydratedContent(msg: MessageModel): void {
  if (!msg.contentEl || msg.contentEl === msg.el) {
    return;
  }

  if (msg.dehydratedHtml !== undefined) {
    dehydratedBytesInUse = Math.max(0, dehydratedBytesInUse - getByteSize(msg.dehydratedHtml));
    msg.contentEl.innerHTML = msg.dehydratedHtml;
    msg.dehydratedHtml = undefined;
  } else {
    const prev = msg.contentEl.dataset.chatboostPrevDisplay;
    msg.contentEl.style.display = prev ?? "";
    delete msg.contentEl.dataset.chatboostPrevDisplay;
  }
}

function dehydrateContent(msg: MessageModel): void {
  if (!msg.contentEl || msg.contentEl === msg.el) {
    return;
  }

  if (msg.dehydratedHtml === undefined) {
    const html = msg.contentEl.innerHTML;
    const bytes = getByteSize(html);
    if (dehydratedBytesInUse + bytes > MAX_DEHYDRATED_BYTES) {
      hideContentByDisplay(msg);
      return;
    }
    msg.dehydratedHtml = html;
    dehydratedBytesInUse += bytes;
  }

  const note = document.createElement("div");
  note.className = PLACEHOLDER_NOTE_CLASS;
  note.textContent = "⚡ 已轻量化，点击列表可恢复";
  msg.contentEl.replaceChildren(note);
}

function hideContentByDisplay(msg: MessageModel): void {
  if (!msg.contentEl || msg.contentEl === msg.el) {
    return;
  }
  if (msg.contentEl.dataset.chatboostPrevDisplay === undefined) {
    msg.contentEl.dataset.chatboostPrevDisplay = msg.contentEl.style.display;
  }
  msg.contentEl.style.display = "none";
}

function getByteSize(content: string): number {
  return content.length * 2;
}
