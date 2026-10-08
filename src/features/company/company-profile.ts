import type { CompanyProfile } from "../../shared/types.js";
export const CACHE_TTL_MS = 5 * 60 * 1000;
export const cache = new Map<string, { data: CompanyProfile; fetchedAt: number }>();
const pending = new Map<string, { promise: Promise<CompanyProfile>; controller: AbortController }>();
// Requests stay on the current origin and only target company profile pages.
export function profileUrl(value: string | null | undefined) {
  try {
    if (!value) return null;
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin || !/^\/firma-profil\/[^/]+\/?$/.test(url.pathname)) return null;
    return new URL(url.pathname.replace(/\/$/, ""), location.origin).href;
  } catch { return null; }
}

export function followerText(value: string | null) {
  const match = String(value || "").trim().match(/^([\d.,]+(?:\s*[bkBmM])?)\s+takipçi$/i);
  if (!match) return null;
  const count = match[1];
  if (/[bkBmM]/.test(count)) return `${count} takipçi`;
  const number = Number(count.replace(/\./g, "").replace(",", "."));
  return Number.isSafeInteger(number) && number >= 0
    ? `${new Intl.NumberFormat("tr-TR").format(number)} takipçi` : null;
}

export function pageFollowers(url: string) {
  for (const details of document.querySelectorAll('[data-test="job-detail-company-card-large-detail"]')) {
    const link = details.querySelector<HTMLElement>('a[href*="/firma-profil/"]');
    if (profileUrl(link?.getAttribute("href")) !== url) continue;
    for (const item of details.querySelectorAll('[data-test="job-detail-company-card-large-statistic-item"]')) {
      const value = followerText(item.textContent);
      if (value) return value;
    }
  }
  return null;
}

export function parseProfile(html: string, url: string): CompanyProfile {
  const page = new DOMParser().parseFromString(html, "text/html");
  page.querySelectorAll("script,style,template").forEach((node) => node.remove());
  let followers: string | null = null;
  for (const item of page.querySelectorAll("span,p,div")) {
    if (item.children.length) continue;
    followers = followerText(item.textContent);
    if (followers) break;
  }
  const companyId = new URL(url).pathname.match(/-(\d+)$/)?.[1];
  let openJobs: number | null = null;
  let jobsUrl: string | null = null;
  for (const link of page.querySelectorAll('a[href*="/is-ilanlari"]')) {
    const match = (link.textContent || "").trim().match(/^Tümünü Gör\s*\(([\d.]+)\)$/i);
    if (!match) continue;
    try {
      const target = new URL(link.getAttribute("href") || "", url);
      if (target.origin !== location.origin || target.pathname !== "/is-ilanlari"
        || !companyId || target.searchParams.get("fpi") !== companyId) continue;
      const count = Number(match[1].replace(/\./g, ""));
      if (!Number.isSafeInteger(count) || count < 0) continue;
      openJobs = count; jobsUrl = target.href; break;
    } catch { /* Ignore malformed or unrelated links. */ }
  }
  return { followers, openJobs, jobsUrl };
}


export function cancelProfile(url: string) { pending.get(url)?.controller.abort(); }
export function loadProfile(url: string): Promise<CompanyProfile> {
  if (!profileUrl(url) || profileUrl(url) !== url) return Promise.reject(new Error("Invalid profile URL"));
  const cached = cache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return Promise.resolve(cached.data);
  const existing = pending.get(url);
  if (existing && !existing.controller.signal.aborted) return existing.promise;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const promise = (async () => {
    try {
      const response = await fetch(url, { credentials: "same-origin", signal: controller.signal, headers: { Accept: "text/html" } });
      if (!response.ok || (response.url && profileUrl(response.url) !== url)
        || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Invalid profile response");
      const data = parseProfile(await response.text(), url);
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
      cache.set(url, { data, fetchedAt: Date.now() });
      return data;
    } finally {
      clearTimeout(timer);
      if (pending.get(url)?.controller === controller) pending.delete(url);
    }
  })();
  pending.set(url, { promise, controller });
  return promise;
}
