import type { ChatSiteAdapter } from "../adapters/base";

export class SafetyGuard {
  private failureCount = 0;
  private maxFailure = 5;

  shouldStop(adapter: ChatSiteAdapter): boolean {
    const root = adapter.getThreadRoot();
    const messages = adapter.getMessageElements();

    if (!root || messages.length === 0) {
      this.failureCount += 1;
    } else {
      this.failureCount = 0;
    }

    return this.failureCount >= this.maxFailure;
  }
}
