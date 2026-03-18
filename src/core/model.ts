import type { ChatSiteAdapter } from "../adapters/base";
import { detectHeavyMessage } from "../features/heavyDetect";
import type { MessageModel, ThreadState } from "../shared/types";

export function createEmptyThread(site: string): ThreadState {
  return {
    site,
    messages: [],
    activeRange: { start: 0, end: 0 },
    lastUpdatedAt: Date.now()
  };
}

export function buildOrUpdateModels(
  adapter: ChatSiteAdapter,
  prev: ThreadState
): ThreadState {
  const byId = new Map(prev.messages.map((m) => [m.id, m]));
  const next: MessageModel[] = [];

  for (const el of adapter.getMessageElements()) {
    const id = adapter.getMessageId(el);
    const old = byId.get(id);
    if (old) {
      next.push(patchModel(old, adapter, el));
      continue;
    }
    next.push(createModel(adapter, el, id));
  }

  return {
    ...prev,
    messages: next,
    lastUpdatedAt: Date.now()
  };
}

function createModel(adapter: ChatSiteAdapter, el: HTMLElement, id: string): MessageModel {
  const contentEl = adapter.getContentRoot(el);
  const rect = el.getBoundingClientRect();
  const scrollTop = window.scrollY;
  const previewText = getPreviewText(contentEl ?? el);
  return {
    id,
    role: adapter.getRole(el),
    el,
    contentEl,
    metrics: {
      top: rect.top + scrollTop,
      bottom: rect.bottom + scrollTop,
      height: rect.height,
      lastMeasuredAt: Date.now()
    },
    flags: {
      isStreaming: adapter.isStreaming(el),
      isPinned: false,
      isHeavy: contentEl ? detectHeavyMessage(contentEl) : false,
      isInteractive: false
    },
    renderMode: "full",
    previewText
  };
}

function patchModel(
  old: MessageModel,
  adapter: ChatSiteAdapter,
  el: HTMLElement
): MessageModel {
  const contentEl = adapter.getContentRoot(el);
  return {
    ...old,
    el,
    contentEl,
    role: adapter.getRole(el),
    previewText: getPreviewText(contentEl ?? el),
    flags: {
      ...old.flags,
      isStreaming: adapter.isStreaming(el),
      isHeavy: contentEl ? detectHeavyMessage(contentEl) : old.flags.isHeavy
    }
  };
}

function getPreviewText(el: HTMLElement): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}
