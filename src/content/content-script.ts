import type { Job, JobResult } from "../shared/types.js";

interface ApplicationInsight { applicationsPerDay: number; openDays: number }

const GET_JOB = "GET_JOB";
const APPLICATION_COUNT_SELECTOR = '[data-test="job-application-count"]';
const APPLICATION_REVIEW_SELECTOR = '[data-test="job-application-view-day"]';
const JOB_FEATURE_LIST_SELECTOR = '[data-test="job-feature-list"]';
const JOB_DATE_INFO_SELECTOR = '[data-kariyer-lens-date-info="true"]';
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

function formatPublishedAt(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit", month: "short",
  }).format(date);
}

function shortDate(value?: string) {
  const match = value?.match(/^(\d{1,2})\s+(\S+)/);
  if (!match) return value || "—";
  const months: Record<string, string> = {
    Ocak: "Oca", Şubat: "Şub", Mart: "Mar", Nisan: "Nis",
    Mayıs: "May", Haziran: "Haz", Temmuz: "Tem", Ağustos: "Ağu",
    Eylül: "Eyl", Ekim: "Eki", Kasım: "Kas", Aralık: "Ara",
  };
  return `${match[1]} ${months[match[2]] || match[2].slice(0, 3)}`;
}

function parseApplicationCount(value: unknown) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : null;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("tr-TR").format(value);
}

function getApplicationInsight(data: Job): ApplicationInsight | null {
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
  return {
    applicationsPerDay,
    openDays,
  };
}

function getPublishedScore(openDays: number) {
  return openDays <= 1 ? 70
    : openDays <= 3 ? 60
      : openDays <= 7 ? 55
        : openDays <= 14 ? 45
          : openDays <= 30 ? 30
            : openDays <= 60 ? 15
              : 5;
}

function getHiringActivity(data: Job, insight: ApplicationInsight | null) {
  const review = String(data.applicationReviewText || "").toLocaleLowerCase("tr-TR");
  const applicationCount = parseApplicationCount(data.applicationCount) ?? 0;
  let reviewDays: number | null = null;
  if (/bugün|az önce|saat|dakika/.test(review)) reviewDays = 0;
  else if (/dün/.test(review)) reviewDays = 1;
  else {
    const duration = review.match(/(\d+)\s*(gün|hafta|ay)/);
    if (duration) reviewDays = Number(duration[1]) * ({ gün: 1, hafta: 7, ay: 30 }[duration[2] as "gün" | "hafta" | "ay"]);
  }
  if (/henüz|incelenmedi|incelemedi/.test(review)) reviewDays = Infinity;
  if (reviewDays === null || !insight) {
    return { score: null, label: "Devir bilgisi yetersiz", copy: "Şirketin son başvuru inceleme zamanı bilinmiyor.", color: "#94a3b8" };
  }
  // PublishedAt is the primary signal. Review recency only supports the estimate;
  // a recent review cannot make an old, high-volume listing look highly active.
  const publishedScore = getPublishedScore(insight.openDays);
  const reviewScore = reviewDays <= 1 ? 25 : reviewDays <= 3 ? 20 : reviewDays <= 7 ? 12 : reviewDays <= 14 ? 6 : 0;
  const reviewIsStale = reviewDays > 7;
  const reviewFollowUpCopy = "İşveren Kariyer.net başvurularını aktif takip etmiyor olabilir; doğrudan iletişime geçmek daha mantıklı olabilir.";
  const competitionPenalty = applicationCount >= 1500 ? 5 : applicationCount >= 750 ? 2 : 0;
  const competitionWarning = applicationCount >= 1500
    ? "Başvuru sayısı çok yüksek; bu ilanda rekabet yoğun olabilir."
    : applicationCount >= 750
      ? "Başvuru sayısı yüksek; rekabet artmış olabilir."
      : "";
  const withCompetitionWarning = (copy: string) => competitionWarning ? `${copy} ${competitionWarning}` : copy;
  const likelyPoolListing = insight.openDays > 60 && applicationCount >= 1500;
  const poolRiskPenalty = likelyPoolListing ? 10 : 0;
  const score = Math.max(0, Math.min(100, Math.round(publishedScore + reviewScore - poolRiskPenalty - competitionPenalty)));
  if (likelyPoolListing) {
    return {
      score: Math.min(score, 34),
      label: "Çok düşük devir",
      color: "#dc2626",
      copy: withCompetitionWarning("Alım sinyali çok zayıf. İlanın aday havuzu toplama olasılığı yüksek; başvurmadan önce dikkatli değerlendirin."),
    };
  }
  return score <= 34
    ? { score, label: "Çok düşük devir", color: "#dc2626", copy: withCompetitionWarning(reviewIsStale ? reviewFollowUpCopy : "Alım sinyali çok zayıf. İlanın aday havuzu toplama olasılığı yüksek; başvurmadan önce dikkatli değerlendirin.") }
    : score < 50
      ? { score, label: "Düşük devir", color: "#f59e0b", copy: withCompetitionWarning(reviewIsStale ? reviewFollowUpCopy : "Alım hareketliliği düşük görünüyor; süreç yavaş ilerliyor olabilir.") }
      : score < 65
        ? { score, label: "Orta devir", color: "#8b5cf6", copy: withCompetitionWarning("Başvurular aralıklı inceleniyor; alım süreci yavaş ilerliyor olabilir.") }
        : { score, label: "Yüksek devir", color: "#10b981", copy: withCompetitionWarning("Başvurular yakın zamanda incelenmiş. Alım süreci hareketli görünüyor.") };
}

function createHiringGauge(data: Job, insight: ApplicationInsight | null) {
  const activity = getHiringActivity(data, insight);
  const panel = document.createElement("div");
  Object.assign(panel.style, { margin: "0 18px 14px", padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#ffffff", color: "#0f172a", textAlign: "left" });
  const title = document.createElement("strong");
  title.textContent = "ALIM DEVİR SAATİ";
  Object.assign(title.style, { display: "block", fontSize: "10px", letterSpacing: "1.5px", color: "#64748b" });
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 280 165");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${activity.label}${activity.score === null ? "" : `: ${activity.score}/100`}`);
  Object.assign(svg.style, { width: "100%", maxWidth: "220px", display: "block", margin: "6px auto 0" });
  const add = (name: string, attrs: Record<string, string | number>) => {
    const element = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    svg.append(element);
    return element;
  };
  const point = (value: number, radius: number) => {
    const angle = Math.PI * (1 - value / 100);
    return [140 + radius * Math.cos(angle), 130 - radius * Math.sin(angle)];
  };
  for (const [start, end, color] of ([[0, 35, "#dc2626"], [35, 65, "#f59e0b"], [65, 100, "#10b981"]] as const)) {
    const a = point(start, 106), b = point(end, 106);
    add("path", { d: `M ${a.join(" ")} A 106 106 0 0 1 ${b.join(" ")}`, fill: "none", stroke: color, "stroke-width": 14, "stroke-linecap": "butt", opacity: activity.score === null ? 0.25 : 0.85 });
  }
  for (let value = 0; value <= 100; value += 10) {
    const a = point(value, 84), b = point(value, 93);
    add("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: "#64748b", "stroke-width": 2 });
  }
  if (activity.score !== null) {
    const tip = point(activity.score, 77);
    add("line", { x1: 140, y1: 130, x2: tip[0], y2: tip[1], stroke: "#0f172a", "stroke-width": 4, "stroke-linecap": "round" });
  }
  add("circle", { cx: 140, cy: 130, r: 8, fill: activity.color, stroke: "#0f172a", "stroke-width": 3 });
  for (const [x, label] of ([[35, "DÜŞÜK"], [245, "YÜKSEK"]] as const)) {
    add("text", { x, y: 157, fill: "#94a3b8", "text-anchor": "middle", "font-size": 10 }).textContent = label;
  }
  const visual = document.createElement("div");
  Object.assign(visual.style, { flex: "0 1 220px", minWidth: "190px", textAlign: "center" });
  visual.append(svg);
  const label = document.createElement("strong");
  label.textContent = `${activity.label}: ${activity.score === null ? "—" : `${activity.score}/100`}`;
  Object.assign(label.style, { display: "block", color: activity.color, fontSize: "17px", margin: "2px 0 5px" });
  const header = document.createElement("div");
  Object.assign(header.style, { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "4px" });
  header.append(title, label);
  const details = document.createElement("div");
  Object.assign(details.style, { flex: "1 1 180px", minWidth: "0", padding: "8px 4px 4px" });
  const copy = document.createElement("div");
  copy.textContent = activity.copy;
  Object.assign(copy.style, { fontSize: "12px", lineHeight: "17px" });
  const evidence = document.createElement("div");
  evidence.textContent = data.applicationReviewText || "";
  Object.assign(evidence.style, { color: "#cbd5e1", fontSize: "11px", marginTop: "8px", lineHeight: "15px" });
  const note = document.createElement("div");
  note.textContent = "Son inceleme ve başvuru hızından tahmin edilir; işe alımın kesin göstergesi değildir.";
  Object.assign(note.style, { color: "#94a3b8", fontSize: "10px", marginTop: "5px", lineHeight: "14px" });
  details.append(copy, evidence, note);

  const content = document.createElement("div");
  Object.assign(content.style, { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginTop: "4px" });
  content.append(visual, details);
  panel.append(header, content);
  return panel;
}

function updateNativeDateInfo(data: Job) {
  const jobFeatures = document.querySelector<HTMLElement>(`${JOB_DETAIL_MAIN_SELECTOR} .job-features`);
  if (!jobFeatures) return false;

  const mainContainer = jobFeatures.closest(JOB_DETAIL_MAIN_SELECTOR);
  if (!mainContainer) return false;
  let dateInfo = mainContainer.querySelector<HTMLElement>(JOB_DATE_INFO_SELECTOR);
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

  const applicationInsight = getApplicationInsight(data);
  const hiringActivity = getHiringActivity(data, applicationInsight);
  const marketingCopy = document.createElement("div");
  marketingCopy.textContent = hiringActivity.score !== null && hiringActivity.score <= 34
    ? hiringActivity.copy
    : "İlan sinyalleri başvuru öncesi değerlendirme için özetleniyor.";
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

  dateInfo.replaceChildren(
    heading,
    marketingCopy,
    detailList,
    createHiringGauge(data, applicationInsight),
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

function syncNativeDateInfo(data: Job) {
  if (updateNativeDateInfo(data)) return;
  const observer = new MutationObserver(() => {
    if (updateNativeDateInfo(data)) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), NATIVE_SYNC_TIMEOUT_MS);
}

function updateNativeApplicationReviewInfo(applicationReviewText?: string) {
  if (!applicationReviewText) return false;
  const mainContainer = document.querySelector<HTMLElement>(
    `${JOB_DETAIL_MAIN_SELECTOR} .job-detail-ad-headline .main-container`,
  );
  if (!mainContainer) return false;

  document
    .querySelectorAll(`${APPLICATION_REVIEW_SELECTOR}[data-kariyer-lens-updated="true"]`)
    .forEach((element) => {
      if (!mainContainer.contains(element)) element.remove();
    });

  let reviewElement = mainContainer.querySelector<HTMLElement>(APPLICATION_REVIEW_SELECTOR);
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
    const jobFeatures = mainContainer.querySelector<HTMLElement>(".job-features");
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

function syncNativeApplicationReviewInfo(applicationReviewText?: string) {
  if (updateNativeApplicationReviewInfo(applicationReviewText)) return;
  const observer = new MutationObserver(() => {
    if (updateNativeApplicationReviewInfo(applicationReviewText)) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), NATIVE_SYNC_TIMEOUT_MS);
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
