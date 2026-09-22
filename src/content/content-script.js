const GET_JOB = "GET_JOB";
const APPLICATION_COUNT_SELECTOR = '[data-test="job-application-count"]';
const UPDATED_DATE_SELECTOR = '[data-test="updated-date"]';
const NATIVE_SYNC_TIMEOUT_MS = 8_000;

let lastRequestedJobId = "";
let nativeCountObserver;

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

function updateNativeApplicationCount(applicationCount) {
  if (!applicationCount) return false;
  const countElement = document.querySelector(APPLICATION_COUNT_SELECTOR);
  if (!countElement) return false;

  // Keep the nested "başvuru" label; replace only its numeric sibling.
  const textNode = [...countElement.childNodes].find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
  );
  if (textNode) {
    textNode.textContent = ` ${applicationCount} `;
  } else {
    countElement.prepend(document.createTextNode(` ${applicationCount} `));
  }
  countElement.dataset.kariyerLensUpdated = "true";
  return true;
}

function syncNativeApplicationCount(applicationCount) {
  nativeCountObserver?.disconnect();
  if (updateNativeApplicationCount(applicationCount)) return;

  // The target node can be rendered after the API response in this SPA.
  nativeCountObserver = new MutationObserver(() => {
    if (updateNativeApplicationCount(applicationCount)) nativeCountObserver.disconnect();
  });
  nativeCountObserver.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => nativeCountObserver?.disconnect(), NATIVE_SYNC_TIMEOUT_MS);
}

function formatPublishedAt(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit", month: "short",
  }).format(date);
}

function shortDate(value) {
  const match = value?.match(/^(\d{1,2})\s+(\S+)/);
  if (!match) return value || "—";
  const months = {
    Ocak: "Oca", Şubat: "Şub", Mart: "Mar", Nisan: "Nis",
    Mayıs: "May", Haziran: "Haz", Temmuz: "Tem", Ağustos: "Ağu",
    Eylül: "Eyl", Ekim: "Eki", Kasım: "Kas", Aralık: "Ara",
  };
  return `${match[1]} ${months[match[2]] || match[2].slice(0, 3)}`;
}

function updateNativeDateInfo(data) {
  const dateElement = document.querySelector(UPDATED_DATE_SELECTOR);
  if (!dateElement) return false;

  const jobDateText = data.jobDateText || "";
  const details = [
    `Yay: ${formatPublishedAt(data.publishedAt)}`,
    `Bit: ${shortDate(data.closingDate)}`,
    ...(jobDateText ? [jobDateText] : []),
    `v${data.updateCount || "—"}`,
  ].join(" · ");
  dateElement.textContent = details;
  dateElement.dataset.kariyerLensUpdated = "true";
  return true;
}

function syncNativeDateInfo(data) {
  if (updateNativeDateInfo(data)) return;
  const observer = new MutationObserver(() => {
    if (updateNativeDateInfo(data)) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), NATIVE_SYNC_TIMEOUT_MS);
}

async function loadCurrentJob() {
  const jobId = findJobId();
  if (!jobId || jobId === lastRequestedJobId) return;
  lastRequestedJobId = jobId;

  try {
    const response = await chrome.runtime.sendMessage({ type: GET_JOB, jobId });
    if (response?.ok) {
      syncNativeApplicationCount(response.data.applicationCount);
      syncNativeDateInfo(response.data);
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
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      requestAfterNavigation();
      return result;
    };
  }
  addEventListener("popstate", requestAfterNavigation);
}

watchClientSideNavigation();
loadCurrentJob();
