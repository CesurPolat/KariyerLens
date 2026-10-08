import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { JobVisitResult } from "../shared/types.js";
import { ApplicationCount } from "./components/ApplicationCount.js";

type Visit = Extract<JobVisitResult, { ok: true }>;
const SELECTOR = '[data-test="job-application-count"]';
let current: Visit | null = null;
let getCurrentId: () => string;
let host: HTMLSpanElement | null = null;
let anchor: HTMLElement | null = null;
let originalDisplay = "";
let originalPriority = "";
let root: Root | null = null;
let rendered: Visit | null = null;
let observing = false;

function dispose() {
  root?.unmount(); root = null;
  host?.remove(); host = null;
  if (anchor) {
    if (anchor.style.getPropertyValue("display") === "none") {
      if (originalDisplay) anchor.style.setProperty("display", originalDisplay, originalPriority);
      else anchor.style.removeProperty("display");
    }
    delete anchor.dataset.kariyerLensUpdated;
  }
  anchor = null; rendered = null;
}

export function clearApplicationCount() { current = null; dispose(); }

function sync() {
  if (!current) return;
  if (getCurrentId() !== current.data.id) { clearApplicationCount(); return; }
  const target = document.querySelector<HTMLElement>(SELECTOR);
  if (!target) { if (host) dispose(); return; }
  if (anchor !== target || !host?.isConnected) {
    dispose(); anchor = target;
    originalDisplay = target.style.getPropertyValue("display");
    originalPriority = target.style.getPropertyPriority("display");
    host = document.createElement("span");
    host.dataset.kariyerLensApplicationCount = "true";
    root = createRoot(host.attachShadow({ mode: "closed" }));
  }
  // Preserve the site's subtree so its own rendering can continue safely.
  target.style.setProperty("display", "none", "important");
  target.dataset.kariyerLensUpdated = "true";
  if (target.nextElementSibling !== host) target.insertAdjacentElement("afterend", host!);
  if (rendered !== current) {
    rendered = current;
    root!.render(createElement(ApplicationCount, { applicationCount: current.data.applicationCount!, history: current.history }));
  }
}

export function showApplicationCount(visit: Visit, getJobId: () => string) {
  if (!visit.data.applicationCount?.trim()) { clearApplicationCount(); return; }
  current = visit; getCurrentId = getJobId;
  if (!observing) {
    observing = true;
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => { scheduled = false; sync(); });
    }).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(sync, 500);
  }
  sync();
}
