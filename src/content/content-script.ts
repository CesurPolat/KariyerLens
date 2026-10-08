import type { JobVisitResult } from "../shared/types.js";

import { clearJobSummary, showJobSummary } from "../features/job-summary/mount.js";

import { clearApplicationCount, showApplicationCount } from "../features/application-history/mount.js";
import { MESSAGE_TYPES } from "../shared/messages.js";
const JOB_FEATURE_LIST_SELECTOR = '[data-test="job-feature-list"]';
const JOB_DETAIL_MAIN_SELECTOR = ".job-detail-body-main";
const NATIVE_SYNC_TIMEOUT_MS = 8_000;

let activeVisitJobId = "";
let visitGeneration = 0;
let positionObserver: MutationObserver | undefined;
let positionTimeout: ReturnType<typeof setTimeout> | undefined;

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

function syncNativePositionFeature(position: string | undefined, generation: number) {
  if (updateNativePositionFeature(position) || !position) return;
  positionObserver = new MutationObserver(() => {
    if (generation !== visitGeneration || updateNativePositionFeature(position)) positionObserver?.disconnect();
  });
  positionObserver.observe(document.documentElement, { childList: true, subtree: true });
  positionTimeout = setTimeout(() => positionObserver?.disconnect(), NATIVE_SYNC_TIMEOUT_MS);
}

async function loadCurrentJob() {
  const jobId = findJobId();
  if (jobId === activeVisitJobId) return;
  activeVisitJobId = jobId;
  const generation = ++visitGeneration;
  positionObserver?.disconnect();
  clearTimeout(positionTimeout);
  clearApplicationCount();
  clearJobSummary();
  document.querySelectorAll('[data-kariyer-lens-feature="position"]').forEach(element => element.remove());
  if (!jobId) return;

  try {
    const response: JobVisitResult = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_JOB_VISIT, jobId });
    if (response?.ok && findJobId() === jobId && generation === visitGeneration) {
      showApplicationCount(response, findJobId);
      showJobSummary(response.data, findJobId);
      syncNativePositionFeature(response.data.position, generation);
    }
  } catch {
    // Leave the native page unchanged when the request fails.
  }
}

function watchClientSideNavigation() {
  const requestAfterNavigation = () => {
    void loadCurrentJob();
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
