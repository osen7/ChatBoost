import type { ChatSiteAdapter } from "./base";
import { ChatGptAdapter } from "./chatgpt";

const adapters: ChatSiteAdapter[] = [new ChatGptAdapter()];

export function resolveAdapter(): ChatSiteAdapter | null {
  for (const adapter of adapters) {
    if (adapter.isMatch()) {
      return adapter;
    }
  }
  return null;
}
