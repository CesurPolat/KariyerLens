const GET_JOB = "GET_JOB";
const APPLICATION_COUNT_SELECTOR = '[data-test="job-application-count"]';
const APPLICATION_REVIEW_SELECTOR = '[data-test="job-application-view-day"]';
const JOB_FEATURE_LIST_SELECTOR = '[data-test="job-feature-list"]';
const JOB_DATE_INFO_SELECTOR = '[data-kariyer-lens-date-info="true"]';
const JOB_DETAIL_MAIN_SELECTOR = ".job-detail-body-main";
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

function parseApplicationCount(value) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : null;
}

function formatNumber(value) {
  return new Intl.NumberFormat("tr-TR").format(value);
}

function getApplicationInsight(data) {
  const applicationCount = parseApplicationCount(data.applicationCount);
  const publishedAt = data.publishedAt ? new Date(data.publishedAt) : null;
  if (applicationCount === null || !publishedAt || Number.isNaN(publishedAt.getTime())) {
    return null;
  }

  const openDays = Math.max(
    1,
    Math.ceil((Date.now() - publishedAt.getTime()) / 86_400_000),
  );
  const applicationsPerDay = applicationCount / openDays;
  const roundedRate = applicationsPerDay < 1
    ? applicationsPerDay.toFixed(1)
    : formatNumber(Math.round(applicationsPerDay));

  return {
    formula: `Başvuru yoğunluğu = ${formatNumber(applicationCount)} başvuru ÷ ${formatNumber(openDays)} gün`,
    result: `Günde yaklaşık ${roundedRate} başvuru`,
    explanation: applicationCount > 0
      ? "Bu ilan aktif olarak aday havuzu oluşturuyor."
      : "Henüz başvuru görünmüyor.",
  };
}

function legacyUpdateNativeDateInfo(data) {
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

function updateNativeDateInfo(data) {
  const jobFeatures = document.querySelector(`${JOB_DETAIL_MAIN_SELECTOR} .job-features`);
  if (!jobFeatures) return false;

  const mainContainer = jobFeatures.closest(JOB_DETAIL_MAIN_SELECTOR);
  let dateInfo = mainContainer.querySelector(JOB_DATE_INFO_SELECTOR);
  if (dateInfo && dateInfo.previousElementSibling !== jobFeatures) {
    dateInfo.remove();
    dateInfo = null;
  }
  mainContainer.querySelectorAll(JOB_DATE_INFO_SELECTOR).forEach((element) => {
    if (element !== dateInfo) element.remove();
  });

  if (!dateInfo) {
    dateInfo = document.createElement("div");
    dateInfo.dataset.kariyerLensDateInfo = "true";
    dateInfo.className = "kariyer-lens-date-info";
    Object.assign(dateInfo.style, {
      display: "block",
      boxSizing: "border-box",
      width: "100%",
      marginTop: "20px",
      marginBottom: "24px",
      padding: "0",
      overflow: "hidden",
      border: "1px solid #e9d5ff",
      borderRadius: "0",
      background: "#ffffff",
      boxShadow: "0 10px 30px rgba(76, 29, 149, 0.12)",
      fontFamily: "inherit",
    });
    jobFeatures.insertAdjacentElement("afterend", dateInfo);
  }

  const jobDateText = data.jobDateText || "";
  const details = [
    `Yay: ${formatPublishedAt(data.publishedAt)}`,
    `Bit: ${shortDate(data.closingDate)}`,
    ...(jobDateText ? [jobDateText] : []),
    `v${data.updateCount || "â€”"}`,
  ];
  if (!data.updateCount) details[details.length - 1] = `v${String.fromCharCode(8212)}`;
  const heading = document.createElement("div");
  Object.assign(heading.style, {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: "16px 18px",
    background: "linear-gradient(135deg, #6d28d9 0%, #8b5cf6 58%, #a78bfa 100%)",
    color: "#ffffff",
    textAlign: "left",
    lineHeight: "1.3",
  });

  const brandBadge = document.createElement("span");
  brandBadge.textContent = `${String.fromCharCode(0x2726)} KariyerLens`;
  Object.assign(brandBadge.style, {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    color: "#ffffff",
    background: "transparent",
    fontSize: "13px",
    fontWeight: "800",
    letterSpacing: "0.3px",
  });
  heading.append(brandBadge);

  const headingCopy = document.createElement("span");
  headingCopy.textContent = "\u0130lan \u00f6zeti";
  Object.assign(headingCopy.style, {
    display: "block",
    marginTop: "5px",
    color: "#f5f3ff",
    fontSize: "20px",
    fontWeight: "800",
    lineHeight: "1.25",
  });
  heading.append(headingCopy);

  const marketingCopy = document.createElement("div");
  marketingCopy.textContent = "\u0130lan a\u00e7\u0131l\u0131\u015f\u0131 ve ba\u015fvuru yo\u011funlu\u011fu";
  Object.assign(marketingCopy.style, {
    margin: "0",
    padding: "16px 18px 4px",
    color: "#475569",
    fontSize: "14px",
    fontWeight: "600",
    lineHeight: "20px",
  });

  const detailList = document.createElement("div");
  Object.assign(detailList.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
    marginTop: "8px",
    padding: "0 18px 18px",
  });

  const applicationInsight = getApplicationInsight(data);
  let insightElement = null;
  if (applicationInsight) {
    insightElement = document.createElement("div");
    Object.assign(insightElement.style, {
      margin: "0 18px 18px",
      padding: "13px 14px",
      border: "1px solid #c4b5fd",
      borderRadius: "6px",
      background: "#faf5ff",
      color: "#4c1d95",
      fontSize: "13px",
      lineHeight: "19px",
    });

    const formula = document.createElement("strong");
    formula.textContent = applicationInsight.formula;
    formula.style.display = "block";
    insightElement.append(formula);

    const result = document.createElement("span");
    result.textContent = `${applicationInsight.result}. ${applicationInsight.explanation}`;
    insightElement.append(result);
  }

  dateInfo.replaceChildren(
    heading,
    marketingCopy,
    detailList,
    ...(insightElement ? [insightElement] : []),
  );
  const chipColors = [
    ["#f5f3ff", "#6d28d9", "#ddd6fe"],
    ["#fff7ed", "#c2410c", "#fed7aa"],
    ["#eff6ff", "#1d4ed8", "#bfdbfe"],
    ["#f0fdf4", "#15803d", "#bbf7d0"],
  ];
  details.forEach((detail, index) => {
    const detailElement = document.createElement("span");
    detailElement.textContent = detail;
    const [background, color, border] = chipColors[index % chipColors.length];
    Object.assign(detailElement.style, {
      display: "inline-flex",
      alignItems: "center",
      minHeight: "34px",
      padding: "5px 12px",
      border: `1px solid ${border}`,
      borderRadius: "4px",
      background,
      color,
      fontSize: "13px",
      fontWeight: "700",
      lineHeight: "18px",
      whiteSpace: "nowrap",
    });
    detailList.append(detailElement);
  });
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

function updateNativeApplicationReviewInfo(applicationReviewText) {
  if (!applicationReviewText) return false;
  const mainContainer = document.querySelector(
    `${JOB_DETAIL_MAIN_SELECTOR} .job-detail-ad-headline .main-container`,
  );
  if (!mainContainer) return false;

  document
    .querySelectorAll(`${APPLICATION_REVIEW_SELECTOR}[data-kariyer-lens-updated="true"]`)
    .forEach((element) => {
      if (!mainContainer.contains(element)) element.remove();
    });

  let reviewElement = mainContainer.querySelector(APPLICATION_REVIEW_SELECTOR);
  if (!reviewElement) {
    reviewElement = document.createElement("div");
    reviewElement.className = "job-application-view-day";
    reviewElement.dataset.test = "job-application-view-day";
    reviewElement.dataset.kariyerLensCreated = "true";
    Object.assign(reviewElement.style, {
      fontSize: "14px",
      fontWeight: "500",
      lineHeight: "20px",
      marginBottom: "16px",
    });
    const jobFeatures = mainContainer.querySelector(".job-features");
    if (jobFeatures) {
      jobFeatures.insertAdjacentElement("afterend", reviewElement);
    } else {
      mainContainer.append(reviewElement);
    }
  }
  reviewElement.textContent = applicationReviewText;
  reviewElement.dataset.kariyerLensUpdated = "true";
  return true;
}

function syncNativeApplicationReviewInfo(applicationReviewText) {
  if (updateNativeApplicationReviewInfo(applicationReviewText)) return;
  const observer = new MutationObserver(() => {
    if (updateNativeApplicationReviewInfo(applicationReviewText)) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), NATIVE_SYNC_TIMEOUT_MS);
}

function updateNativePositionFeature(position) {
  if (!position) return false;
  document
    .querySelectorAll('[data-kariyer-lens-feature="position"]')
    .forEach((element) => {
      if (!element.closest(JOB_DETAIL_MAIN_SELECTOR)) element.remove();
    });
  const featureList = document.querySelector(
    `${JOB_DETAIL_MAIN_SELECTOR} ${JOB_FEATURE_LIST_SELECTOR}`,
  );
  if (!featureList) return false;

  let positionElement = featureList.querySelector('[data-kariyer-lens-feature="position"]');
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

function syncNativePositionFeature(position) {
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
    const response = await chrome.runtime.sendMessage({ type: GET_JOB, jobId });
    if (response?.ok) {
      syncNativeApplicationCount(response.data.applicationCount);
      syncNativeDateInfo(response.data);
      syncNativeApplicationReviewInfo(response.data.applicationReviewText);
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
