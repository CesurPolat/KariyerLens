import type { Job, JobResult } from "../shared/types.js";

import { showJobSummary } from "./mount-job-summary.js";

const GET_JOB = "GET_JOB";
const APPLICATION_COUNT_SELECTOR = '[data-test="job-application-count"]';
const JOB_FEATURE_LIST_SELECTOR = '[data-test="job-feature-list"]';
const JOB_DETAIL_MAIN_SELECTOR = ".job-detail-body-main";
const NATIVE_SYNC_TIMEOUT_MS = 8_000;

let lastRequestedJobId = "";
let nativeCountObserver: MutationObserver | undefined;

function findJobId() {
  const url = new URL(location.href);
  const candidates = [
    url.searchParams.get("jobId"),
    url.searchParams.get("jobid"),
    url.pathname.match(/(?:job|ilan|is-ilani)[^0-9]*(\d{3,16})/i)?.[1],
    url.pathname.match(/(\d{3,16})(?:\/)?$/)?.[1],
  ];
  return candidates.find((value) => /^\d{1,16}$/.test(value || "")) || "";
}

function updateNativeApplicationCount(applicationCount?: string) {
  if (!applicationCount) return false;
  const countElement = document.querySelector<HTMLElement>(APPLICATION_COUNT_SELECTOR);
  if (!countElement) return false;

  // Keep the nested "başvuru" label; replace only its numeric sibling.
  const textNode = [...countElement.childNodes].find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
  );
  if (textNode) {
    textNode.textContent = ` ${applicationCount} `;
  } else {
    countElement.prepend(document.createTextNode(` ${applicationCount} `));
  }
  countElement.dataset.kariyerLensUpdated = "true";
  return true;
}

function syncNativeApplicationCount(applicationCount?: string) {
  nativeCountObserver?.disconnect();
  if (updateNativeApplicationCount(applicationCount)) return;

  // The target node can be rendered after the API response in this SPA.
  nativeCountObserver = new MutationObserver(() => {
    if (updateNativeApplicationCount(applicationCount)) nativeCountObserver?.disconnect();
  });
  nativeCountObserver.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => nativeCountObserver?.disconnect(), NATIVE_SYNC_TIMEOUT_MS);
}

function updateNativePositionFeature(position?: string) {
  if (!position) return false;
  document
    .querySelectorAll('[data-kariyer-lens-feature="position"]')
    .forEach((element) => {
      if (!element.closest(JOB_DETAIL_MAIN_SELECTOR)) element.remove();
    });
  const featureList = document.querySelector<HTMLElement>(
    `${JOB_DETAIL_MAIN_SELECTOR} ${JOB_FEATURE_LIST_SELECTOR}`,
  );
  if (!featureList) return false;

  let positionElement = featureList.querySelector<HTMLElement>('[data-kariyer-lens-feature="position"]');
  if (!positionElement) {
    positionElement = document.createElement("span");
    positionElement.className = "job-feature-item";
    positionElement.dataset.test = "job-feature-item";
    positionElement.dataset.kariyerLensFeature = "position";
    featureList.append(positionElement);
  }
  positionElement.textContent = position;
  return true;
}

function syncNativePositionFeature(position?: string) {
  if (updateNativePositionFeature(position)) return;
  const observer = new MutationObserver(() => {
    if (updateNativePositionFeature(position)) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), NATIVE_SYNC_TIMEOUT_MS);
}

async function loadCurrentJob() {
  const jobId = findJobId();
  if (!jobId || jobId === lastRequestedJobId) return;
  lastRequestedJobId = jobId;

  try {
    const response: JobResult = await chrome.runtime.sendMessage({ type: GET_JOB, jobId });
    if (response?.ok && findJobId() === jobId) {
      syncNativeApplicationCount(response.data.applicationCount);
      showJobSummary(response.data, findJobId);
      syncNativePositionFeature(response.data.position);
    }
  } catch {
    // No extension UI: leave the native page unchanged when the request fails.
  }
}

function watchClientSideNavigation() {
  const requestAfterNavigation = () => {
    lastRequestedJobId = "";
    queueMicrotask(loadCurrentJob);
  };
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args);
      requestAfterNavigation();
      return result;
    };
  }
  addEventListener("popstate", requestAfterNavigation);
}

watchClientSideNavigation();
loadCurrentJob();
