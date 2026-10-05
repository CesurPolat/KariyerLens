(() => {
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const ROW_SELECTOR = '[data-kariyer-lens-company-stats="true"]';
  const cache = new Map();
  let active;
  let scheduled = false;

  // Requests stay on the current origin and only target company profile pages.
  function profileUrl(value) {
    try {
      const url = new URL(value, location.origin);
      if (url.origin !== location.origin || !/^\/firma-profil\/[^/]+\/?$/.test(url.pathname)) return null;
      return new URL(url.pathname.replace(/\/$/, ""), location.origin).href;
    } catch { return null; }
  }

  function followerText(value) {
    const match = String(value || "").trim().match(/^([\d.,]+(?:\s*[bkBmM])?)\s+takipçi$/i);
    if (!match) return null;
    const count = match[1];
    if (/[bkBmM]/.test(count)) return `${count} takipçi`;
    const number = Number(count.replace(/\./g, "").replace(",", "."));
    return Number.isSafeInteger(number) && number >= 0
      ? `${new Intl.NumberFormat("tr-TR").format(number)} takipçi` : null;
  }

  function pageFollowers(url) {
    for (const details of document.querySelectorAll('[data-test="job-detail-company-card-large-detail"]')) {
      const link = details.querySelector('a[href*="/firma-profil/"]');
      if (profileUrl(link?.getAttribute("href")) !== url) continue;
      for (const item of details.querySelectorAll('[data-test="job-detail-company-card-large-statistic-item"]')) {
        const value = followerText(item.textContent);
        if (value) return value;
      }
    }
    return null;
  }

  function parseProfile(html, url) {
    const page = new DOMParser().parseFromString(html, "text/html");
    page.querySelectorAll("script,style,template").forEach((node) => node.remove());
    let followers = null;
    for (const item of page.querySelectorAll("span,p,div")) {
      if (item.children.length) continue;
      followers = followerText(item.textContent);
      if (followers) break;
    }
    const companyId = new URL(url).pathname.match(/-(\d+)$/)?.[1];
    let openJobs = null;
    let jobsUrl = null;
    for (const link of page.querySelectorAll('a[href*="/is-ilanlari"]')) {
      const match = link.textContent.trim().match(/^Tümünü Gör\s*\(([\d.]+)\)$/i);
      if (!match) continue;
      try {
        const target = new URL(link.getAttribute("href"), url);
        if (target.origin !== location.origin || target.pathname !== "/is-ilanlari"
          || !companyId || target.searchParams.get("fpi") !== companyId) continue;
        const count = Number(match[1].replace(/\./g, ""));
        if (!Number.isSafeInteger(count) || count < 0) continue;
        openJobs = count; jobsUrl = target.href; break;
      } catch { /* Ignore malformed or unrelated links. */ }
    }
    return { followers, openJobs, jobsUrl };
  }

  function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
  }

  function render(card, button, state) {
    let row = card.querySelector(ROW_SELECTOR);
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
    setText(row.querySelector('[data-kariyer-lens-followers]'), pageFollowers(state.url) || state.data?.followers || "— takipçi");
    const jobs = row.querySelector('[data-kariyer-lens-open-jobs]');
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

  async function load(state) {
    state.requestedAt = Date.now();
    state.pending = true;
    const controller = new AbortController(); state.controller = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(state.url, { credentials: "same-origin", signal: controller.signal, headers: { Accept: "text/html" } });
      if (!response.ok || (response.url && profileUrl(response.url) !== state.url)
        || !response.headers.get("content-type")?.includes("text/html")) throw new Error("Invalid profile response");
      const data = parseProfile(await response.text(), state.url);
      if (controller.signal.aborted || active !== state) return;
      state.data = data; state.failed = false;
      if (data.followers || data.openJobs !== null) cache.set(state.url, { data, fetchedAt: Date.now() });
    } catch {
      if (active !== state) return;
      state.failed = true;
    } finally {
      clearTimeout(timer); state.pending = false;
      if (active === state) sync();
    }
  }

  function sync() {
    const jobId = findJobId();
    const card = jobId && document.querySelector(".job-detail-right-column .job-detail-company-card");
    const link = card && card.querySelector('a[href*="/firma-profil/"]');
    const url = profileUrl(link?.getAttribute("href"));
    const button = card && card.querySelector('[data-test="job-detail-company-card-follow-button"], .job-detail-company-card-follow-button');
    if (!card || !url || !button) {
      active?.controller?.abort(); active = null;
      document.querySelectorAll(ROW_SELECTOR).forEach((row) => row.remove());
      return;
    }
    const identity = `${jobId}|${url}`;
    if (active?.identity !== identity) {
      active?.controller?.abort();
      const cached = cache.get(url);
      const fresh = cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS;
      active = { identity, url, data: fresh ? cached.data : null, requestedAt: fresh ? cached.fetchedAt : null, pending: false };
    }
    render(card, button, active);
    if (!active.pending && (active.requestedAt === null || Date.now() - active.requestedAt >= CACHE_TTL_MS)) load(active);
  }

  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; sync(); });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });
  addEventListener("popstate", sync);
  setInterval(sync, 500);
  sync();
})();
