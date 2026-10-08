import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { Job } from "../../shared/types.js";
import { JobSummary } from "./JobSummary.js";

const SELECTOR = '[data-kariyer-lens-date-info="true"]';
let currentJob: Job | null = null;
let getCurrentId: () => string;
let host: HTMLDivElement | null = null;
let root: Root | null = null;
let renderedJob: Job | null = null;
let observing = false;

function dispose() {
  root?.unmount(); root = null;
  host?.remove(); host = null;
  renderedJob = null;
}

export function clearJobSummary() { currentJob = null; dispose(); }

function sync() {
  if (!currentJob) return;
  if (getCurrentId() !== currentJob.id) { currentJob = null; dispose(); return; }
  const anchor = document.querySelector('.job-detail-body-main .job-features');
  if (!anchor) { if (host) dispose(); return; }
  if (host && !host.isConnected) dispose();
  if (!host) {
    document.querySelectorAll(SELECTOR).forEach(node => node.remove());
    host = document.createElement("div");
    host.dataset.kariyerLensDateInfo = "true";
    host.className = "kariyer-lens-date-info";
    host.style.cssText = "display:block;width:100%;min-width:0;margin-top:20px;margin-bottom:24px;";
    root = createRoot(host.attachShadow({ mode: "closed" }));
  }
  if (host.previousElementSibling !== anchor) anchor.insertAdjacentElement("afterend", host);
  if (renderedJob !== currentJob) {
    renderedJob = currentJob;
    root!.render(createElement(JobSummary, { job: currentJob }));
  }
}

export function showJobSummary(job: Job, getJobId: () => string) {
  currentJob = job; getCurrentId = getJobId;
  if (!observing) {
    observing = true;
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => { scheduled = false; sync(); });
    }).observe(document.documentElement, { childList: true, subtree: true });
    addEventListener("popstate", sync);
    setInterval(sync, 500);
  }
  sync();
}
