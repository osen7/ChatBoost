import { PLACEHOLDER_ATTR } from "../shared/constants";
import type { MessageModel } from "../shared/types";

const PLACEHOLDER_CLASS = "chatboost-placeholder";
const PLACEHOLDER_NOTE_ATTR = "data-chatboost-placeholder-note";
const MAX_DEHYDRATED_BYTES = 20 * 1024 * 1024;
let dehydratedBytesInUse = 0;
const dehydratedLru = new Map<string, { msg: MessageModel; bytes: number; lastUsedAt: number }>();

export function applyPlaceholderMode(msg: MessageModel): void {
  msg.el.classList.add(PLACEHOLDER_CLASS);
  msg.el.classList.remove("chatboost-collapsed");
  msg.el.setAttribute(PLACEHOLDER_ATTR, "true");
  msg.el.style.minHeight = `${Math.max(msg.metrics.height, 80)}px`;
  // Keep placeholder fully silent for users and clean any legacy note nodes.
  removePlaceholderNote(msg);
  if (msg.flags.isInteractive) {
    hideContentByDisplay(msg);
    return;
  }
  dehydrateContent(msg);
}

export function restoreDehydratedContent(msg: MessageModel): void {
  removePlaceholderNote(msg);
  if (!msg.contentEl || msg.contentEl === msg.el) {
    return;
  }

  if (msg.dehydratedHtml !== undefined) {
    releaseDehydrated(msg);
    msg.contentEl.innerHTML = msg.dehydratedHtml;
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

  if (msg.dehydratedHtml !== undefined) {
    touchDehydrated(msg.id);
    msg.contentEl.replaceChildren();
    return;
  }

  const html = msg.contentEl.innerHTML;
  const bytes = getByteSize(html);
  if (!ensureBudget(bytes, msg.id)) {
    hideContentByDisplay(msg);
    return;
  }

  msg.dehydratedHtml = html;
  dehydratedBytesInUse += bytes;
  dehydratedLru.set(msg.id, { msg, bytes, lastUsedAt: Date.now() });
  msg.contentEl.replaceChildren();
}

function ensureBudget(requiredBytes: number, currentId: string): boolean {
  pruneInvalidLruEntries();

  while (dehydratedBytesInUse + requiredBytes > MAX_DEHYDRATED_BYTES) {
    const victim = pickLruVictim(currentId);
    if (!victim) {
      break;
    }
    evictToHidden(victim.msg);
  }

  return dehydratedBytesInUse + requiredBytes <= MAX_DEHYDRATED_BYTES;
}

function pickLruVictim(excludeId: string): { msg: MessageModel; bytes: number; lastUsedAt: number } | null {
  let victim: { msg: MessageModel; bytes: number; lastUsedAt: number } | null = null;
  for (const [messageId, entry] of dehydratedLru) {
    if (messageId === excludeId) {
      continue;
    }
    if (!victim || entry.lastUsedAt < victim.lastUsedAt) {
      victim = entry;
    }
  }
  return victim;
}

function evictToHidden(msg: MessageModel): void {
  if (!msg.contentEl || msg.contentEl === msg.el || msg.dehydratedHtml === undefined) {
    releaseDehydrated(msg);
    return;
  }

  const html = msg.dehydratedHtml;
  releaseDehydrated(msg);
  msg.contentEl.innerHTML = html;
  hideContentByDisplay(msg);
  removePlaceholderNote(msg);
}

function releaseDehydrated(msg: MessageModel): void {
  if (msg.dehydratedHtml === undefined) {
    dehydratedLru.delete(msg.id);
    return;
  }

  dehydratedBytesInUse = Math.max(0, dehydratedBytesInUse - getByteSize(msg.dehydratedHtml));
  msg.dehydratedHtml = undefined;
  dehydratedLru.delete(msg.id);
}

function touchDehydrated(messageId: string): void {
  const entry = dehydratedLru.get(messageId);
  if (!entry) {
    return;
  }
  entry.lastUsedAt = Date.now();
}

function pruneInvalidLruEntries(): void {
  for (const [messageId, entry] of dehydratedLru) {
    if (entry.msg.dehydratedHtml !== undefined) {
      continue;
    }
    dehydratedLru.delete(messageId);
  }
}

function removePlaceholderNote(msg: MessageModel): void {
  const note = msg.el.querySelector<HTMLElement>(`[${PLACEHOLDER_NOTE_ATTR}]`);
  note?.remove();
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
