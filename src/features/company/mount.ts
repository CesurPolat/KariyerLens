import type { CompanyProfile, CompanyStatsResult } from "../../shared/types.js";
import { CACHE_TTL_MS, cache, profileUrl, pageFollowers, loadProfile, cancelProfile } from "./company-profile.js";
import { MESSAGE_TYPES } from "../../shared/messages.js";
interface CompanyState { identity: string; url: string; data: CompanyProfile | null; requestedAt: number | null; pending: boolean; failed?: boolean }

export function mountCompanyStats(findJobId: () => string) {
  const ROW_SELECTOR = '[data-kariyer-lens-company-stats="true"]';
  let active: CompanyState | null = null;
  let scheduled = false;

  function setText(element: Element, text: string) {
    if (element.textContent !== text) element.textContent = text;
  }

  function render(card: HTMLElement, button: HTMLElement, state: CompanyState) {
    let row = card.querySelector<HTMLElement>(ROW_SELECTOR);
    if (!row) {
      row = document.createElement("div");
      row.dataset.kariyerLensCompanyStats = "true";
      row.setAttribute("aria-label", "Şirket istatistikleri");
      Object.assign(row.style, {
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px",
        width: "100%", boxSizing: "border-box", margin: "12px 0", fontSize: "13px",
        lineHeight: "20px", color: "#64748b",
      });
      const followers = document.createElement("span");
      followers.dataset.kariyerLensFollowers = "true";
      const jobs = document.createElement("a");
      jobs.dataset.kariyerLensOpenJobs = "true";
      jobs.target = "_blank"; jobs.rel = "noopener noreferrer";
      Object.assign(jobs.style, { color: "#6d28d9", textDecoration: "none", overflowWrap: "anywhere" });
      row.append(followers, jobs);
    }
    card.querySelectorAll(ROW_SELECTOR).forEach((item) => { if (item !== row) item.remove(); });
    if (row.nextElementSibling !== button || row.parentElement !== button.parentElement) button.before(row);
    setText(row.querySelector<HTMLElement>('[data-kariyer-lens-followers]')!, pageFollowers(state.url) || state.data?.followers || "— takipçi");
    const jobs = row.querySelector<HTMLAnchorElement>('[data-kariyer-lens-open-jobs]')!;
    setText(jobs, `${state.data?.openJobs == null ? "—" : new Intl.NumberFormat("tr-TR").format(state.data.openJobs)} açık iş ilanı`);
    if (state.data?.jobsUrl) {
      if (jobs.getAttribute("href") !== state.data.jobsUrl) jobs.href = state.data.jobsUrl;
      jobs.removeAttribute("aria-disabled");
    } else {
      jobs.removeAttribute("href"); jobs.setAttribute("aria-disabled", "true");
    }
    const title = state.failed ? "Şirket profili yüklenemedi. Bulunamayan bilgiler — ile gösterilir." : "Kariyer.net şirket bilgileri";
    if (row.title !== title) row.title = title;
  }

  async function load(state: CompanyState) {
    state.requestedAt = Date.now();
    state.pending = true;
    try {
      const data = await loadProfile(state.url);
      if (active !== state) return;
      state.data = data; state.failed = false;
    } catch {
      if (active !== state) return;
      state.failed = true;
    } finally {
      state.pending = false;
      if (active === state) sync();
    }
  }

  function sync() {
    const jobId = findJobId();
    const card = jobId ? document.querySelector<HTMLElement>(".job-detail-right-column .job-detail-company-card") : null;
    const link = card?.querySelector<HTMLElement>('a[href*="/firma-profil/"]');
    const url = profileUrl(link?.getAttribute("href"));
    const button = card && card.querySelector<HTMLElement>('[data-test="job-detail-company-card-follow-button"], .job-detail-company-card-follow-button');
    if (!card || !url || !button) {
      if (active) cancelProfile(active.url); active = null;
      document.querySelectorAll(ROW_SELECTOR).forEach((row) => row.remove());
      return;
    }
    const identity = `${jobId}|${url}`;
    if (active?.identity !== identity) {
      if (active) cancelProfile(active.url);
      const cached = cache.get(url);
      const fresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;
      active = { identity, url, data: fresh ? cached.data : null, requestedAt: fresh ? cached.fetchedAt : null, pending: false };
    }
    render(card, button, active);
    if (!active.pending && (active.requestedAt === null || Date.now() - active.requestedAt >= CACHE_TTL_MS)) load(active);
  }


  async function currentCompany(jobId: string): Promise<CompanyStatsResult> {
    const changed = (): CompanyStatsResult => ({ ok: false, code: "JOB_CHANGED", message: "Açık ilan değişti. Yeni ilanda yeniden deneyin." });
    if (!jobId || findJobId() !== jobId) return changed();
    const card = document.querySelector<HTMLElement>(".job-detail-right-column .job-detail-company-card");
    const link = card?.querySelector<HTMLAnchorElement>('a[href*="/firma-profil/"]');
    const url = profileUrl(link?.getAttribute("href"));
    const companyName = link?.textContent?.trim().slice(0, 500) || null;
    if (!url) return { ok: true, data: { companyName, profileUrl: null, followers: null, openJobs: null, jobsUrl: null } };
    try {
      const data = await loadProfile(url);
      if (findJobId() !== jobId || profileUrl(card?.querySelector('a[href*="/firma-profil/"]')?.getAttribute("href")) !== url || !card?.isConnected) return changed();
      return { ok: true, data: { ...data, followers: pageFollowers(url) || data.followers, companyName, profileUrl: url } };
    } catch {
      if (findJobId() !== jobId) return changed();
      return { ok: false, code: "COMPANY_PROFILE_ERROR", message: "Şirket profili yüklenemedi." };
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || sender.tab || message?.type !== MESSAGE_TYPES.GET_CURRENT_COMPANY_STATS) return;
    currentCompany(typeof message.jobId === "string" ? message.jobId : "").then(sendResponse)
      .catch(() => sendResponse({ ok: false, code: "COMPANY_PROFILE_ERROR", message: "Şirket bilgileri alınamadı." }));
    return true;
  });

  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; sync(); });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
  addEventListener("popstate", sync);
  setInterval(sync, 500);
  sync();
}
