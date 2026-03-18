import type { ChatSiteAdapter } from "./base";
import { buildPathThreadId, extractThreadIdFromPath } from "./threadId";
import type { MessageRole } from "../shared/types";

const HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);
const fallbackIds = new WeakMap<HTMLElement, string>();
let fallbackSeq = 0;

export class ChatGptAdapter implements ChatSiteAdapter {
  site = "chatgpt";

  isMatch(): boolean {
    return HOSTS.has(window.location.hostname);
  }

  getThreadRoot(): HTMLElement | null {
    return document.querySelector("main") as HTMLElement | null;
  }

  getThreadId(): string {
    const pathId = extractThreadIdFromPath(window.location.pathname, "c");
    if (pathId) {
      return `c:${pathId}`;
    }

    const domId = this.readThreadIdFromDom();
    if (domId) {
      return `dom:${domId}`;
    }

    return buildPathThreadId(window.location.pathname, window.location.search);
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
    return Array.from(nodes).filter((el) => el.isConnected);
  }

  getMessageId(el: HTMLElement): string {
    const nativeId = this.readNativeId(el);
    if (nativeId) {
      return `native:${nativeId}`;
    }

    const cached = fallbackIds.get(el);
    if (cached) {
      return cached;
    }

    const role = this.getRole(el);
    const text = normalizeText(el.textContent ?? "").slice(0, 400);
    const hash = stableHash(`${role}|${text}|${fallbackSeq}`);
    const id = `fallback:${hash}`;
    fallbackIds.set(el, id);
    fallbackSeq += 1;
    return id;
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

  private readNativeId(el: HTMLElement): string | null {
    const direct =
      el.getAttribute("data-message-id") ??
      el.getAttribute("data-testid") ??
      el.id;
    if (direct) {
      return direct;
    }

    const child = el.querySelector<HTMLElement>(
      "[data-message-id],[data-testid^='conversation-turn-'],[id^='message-']"
    );
    if (!child) {
      return null;
    }

    return (
      child.getAttribute("data-message-id") ??
      child.getAttribute("data-testid") ??
      child.id ??
      null
    );
  }

  private readThreadIdFromDom(): string | null {
    const threadNode = document.querySelector<HTMLElement>(
      "[data-conversation-id],[data-thread-id],[data-testid='conversation-turns']"
    );
    if (!threadNode) {
      return null;
    }

    return (
      threadNode.getAttribute("data-conversation-id") ??
      threadNode.getAttribute("data-thread-id") ??
      null
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

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}
