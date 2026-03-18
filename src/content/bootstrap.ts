import { resolveAdapter } from "../adapters";
import { OptimizationEngine } from "../core/engine";
import { defaultConfig } from "../shared/config";
import { EXT_ROOT_ATTR } from "../shared/constants";
import "../ui/styles.css";

let engine: OptimizationEngine | null = null;

export function bootstrap(): void {
  if (document.documentElement.hasAttribute(EXT_ROOT_ATTR)) {
    return;
  }

  const adapter = resolveAdapter();
  if (!adapter) {
    return;
  }

  document.documentElement.setAttribute(EXT_ROOT_ATTR, "1");
  engine = new OptimizationEngine(adapter, defaultConfig);
  engine.start();
}

export function shutdown(): void {
  engine?.stop();
  engine = null;
  document.documentElement.removeAttribute(EXT_ROOT_ATTR);
}
