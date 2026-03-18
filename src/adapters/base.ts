import type { MessageRole } from "../shared/types";

export interface ChatSiteAdapter {
  site: string;
  isMatch(): boolean;
  getThreadRoot(): HTMLElement | null;
  // Must return a stable id for the current conversation/thread in SPA navigation.
  getThreadId(): string;
  getMessageElements(): HTMLElement[];
  getMessageId(el: HTMLElement): string;
  getRole(el: HTMLElement): MessageRole;
  isStreaming(el: HTMLElement): boolean;
  getContentRoot(el: HTMLElement): HTMLElement | null;
}
