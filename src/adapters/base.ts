import type { MessageRole } from "../shared/types";

export interface ChatSiteAdapter {
  site: string;
  isMatch(): boolean;
  getThreadRoot(): HTMLElement | null;
  getMessageElements(): HTMLElement[];
  getMessageId(el: HTMLElement): string;
  getRole(el: HTMLElement): MessageRole;
  isStreaming(el: HTMLElement): boolean;
  getContentRoot(el: HTMLElement): HTMLElement | null;
}
