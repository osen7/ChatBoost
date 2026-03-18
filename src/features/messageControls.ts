import { CONTROL_ATTR } from "../shared/constants";
import type { MessageModel } from "../shared/types";

type ControlAction = "expand" | "collapse";

const HOST_CLASS = "chatboost-control-host";
const BTN_CLASS = "chatboost-control-btn";

export function setMessageControl(msg: MessageModel, action: ControlAction): void {
  const host = ensureHost(msg.el);
  host.replaceChildren();

  const button = document.createElement("button");
  button.type = "button";
  button.className = BTN_CLASS;
  button.setAttribute(CONTROL_ATTR, action);
  button.dataset.messageId = msg.id;
  button.textContent = action === "expand" ? "Expand" : "Collapse";
  host.appendChild(button);
}

export function clearMessageControl(msg: MessageModel): void {
  const host = msg.el.querySelector<HTMLElement>(`.${HOST_CLASS}`);
  if (!host) {
    return;
  }
  host.remove();
}

export function readControlAction(target: EventTarget | null): {
  action: ControlAction;
  messageId: string;
} | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const btn = target.closest<HTMLElement>(`.${BTN_CLASS}`);
  if (!btn) {
    return null;
  }

  const action = btn.getAttribute(CONTROL_ATTR);
  const messageId = btn.dataset.messageId ?? "";
  if ((action !== "expand" && action !== "collapse") || !messageId) {
    return null;
  }
  return { action, messageId };
}

function ensureHost(msgEl: HTMLElement): HTMLElement {
  let host = msgEl.querySelector<HTMLElement>(`.${HOST_CLASS}`);
  if (host) {
    return host;
  }

  host = document.createElement("div");
  host.className = HOST_CLASS;
  msgEl.appendChild(host);
  return host;
}
