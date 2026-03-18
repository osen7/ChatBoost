import type { ChatSiteAdapter } from "./base";
import type { MessageRole } from "../shared/types";

const HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);

export class ChatGptAdapter implements ChatSiteAdapter {
  site = "chatgpt";

  isMatch(): boolean {
    return HOSTS.has(window.location.hostname);
  }

  getThreadRoot(): HTMLElement | null {
    return document.querySelector("main") as HTMLElement | null;
  }

  getMessageElements(): HTMLElement[] {
    const root = this.getThreadRoot();
    if (!root) {
      return [];
    }

    // Multiple selectors reduce one-point breakage when DOM classes rotate.
    const nodes = root.querySelectorAll<HTMLElement>(
      "article[data-testid^='conversation-turn'], article, [data-message-author-role]"
    );
    return Array.from(new Set(nodes)).filter((el) => el.isConnected);
  }

  getMessageId(el: HTMLElement): string {
    const nativeId =
      el.getAttribute("data-message-id") ??
      el.getAttribute("data-testid") ??
      el.id;
    if (nativeId) {
      return `native:${nativeId}`;
    }

    const role = this.getRole(el);
    const text = (el.textContent ?? "").trim().slice(0, 240);
    const hash = stableHash(`${role}|${text}`);
    return `fallback:${hash}`;
  }

  getRole(el: HTMLElement): MessageRole {
    const explicit = el.getAttribute("data-message-author-role");
    if (explicit === "user" || explicit === "assistant" || explicit === "system") {
      return explicit;
    }

    if (el.matches("[data-testid*='user']")) {
      return "user";
    }
    if (el.matches("[data-testid*='assistant']")) {
      return "assistant";
    }
    return "unknown";
  }

  isStreaming(el: HTMLElement): boolean {
    if (el.querySelector("[data-testid='stop-button']")) {
      return true;
    }

    const busy = el.querySelector("[aria-busy='true']");
    if (busy) {
      return true;
    }
    return false;
  }

  getContentRoot(el: HTMLElement): HTMLElement | null {
    return (
      (el.querySelector("[data-message-content]") as HTMLElement | null) ??
      (el.querySelector(".markdown, .prose") as HTMLElement | null) ??
      el
    );
  }
}

function stableHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
